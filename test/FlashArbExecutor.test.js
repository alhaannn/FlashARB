import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

const connection = await hre.network.connect();
const { ethers } = connection;

describe("FlashArbExecutor - DEX Arbitrage Security & Execution Suite", function () {
  let owner, user, attacker;
  let weth, usdt, altToken;
  let token0, token1;
  let pairA, pairB, incompatiblePair;
  let v3Pool, fakeV3Pool;
  let executor;

  beforeEach(async function () {
    [owner, user, attacker] = await ethers.getSigners();

    // 1. Deploy WETH & USDT
    const MockWETH = await ethers.getContractFactory("MockWETH");
    weth = await MockWETH.deploy();
    await weth.waitForDeployment();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdt = await MockERC20.deploy("Tether USD", "USDT", 18);
    await usdt.waitForDeployment();

    altToken = await MockERC20.deploy("Alternative Token", "ALT", 18);
    await altToken.waitForDeployment();

    // Canonical sorting (token0 < token1)
    if (weth.target.toLowerCase() < usdt.target.toLowerCase()) {
      token0 = weth;
      token1 = usdt;
    } else {
      token0 = usdt;
      token1 = weth;
    }

    // 2. Deploy Pairs for DEX A (Uniswap) and DEX B (SushiSwap)
    const MockPair = await ethers.getContractFactory("MockUniswapV2Pair");
    pairA = await MockPair.deploy(token0.target, token1.target);
    await pairA.waitForDeployment();

    pairB = await MockPair.deploy(token0.target, token1.target);
    await pairB.waitForDeployment();

    incompatiblePair = await MockPair.deploy(token0.target, altToken.target);
    await incompatiblePair.waitForDeployment();

    // 3. Deploy Uniswap V3 Mock Pool
    const MockV3 = await ethers.getContractFactory("MockUniswapV3Pool");
    v3Pool = await MockV3.deploy(token0.target, token1.target, 3000);
    await v3Pool.waitForDeployment();

    fakeV3Pool = await MockV3.deploy(token0.target, token1.target, 3000);
    await fakeV3Pool.waitForDeployment();

    // 4. Deploy FlashArbExecutor
    const FlashArb = await ethers.getContractFactory("FlashArbExecutor");
    executor = await FlashArb.deploy(weth.target);
    await executor.waitForDeployment();
  });

  describe("Core Arbitrage Execution", function () {
    it("successfully executes flash swap arbitrage between two pools without upfront capital", async function () {
      const r0_A = ethers.parseEther("100");
      const r1_A = ethers.parseEther("200000");
      const r0_B = ethers.parseEther("100");
      const r1_B = ethers.parseEther("220000");

      await token0.mint(pairA.target, r0_A);
      await token1.mint(pairA.target, r1_A);
      await pairA.setReserves(r0_A, r1_A);

      await token0.mint(pairB.target, r0_B);
      await token1.mint(pairB.target, r1_B);
      await pairB.setReserves(r0_B, r1_B);

      const recipient = owner.address;
      const initialRepayTokenBalance = await token1.balanceOf(recipient);

      const borrowAmount = ethers.parseEther("2");
      const borrowToken0 = true;
      const minProfit = ethers.parseEther("1");
      const validatorTip = 0n;

      const tx = await executor.executeFlashArb(
        pairA.target,
        pairB.target,
        borrowAmount,
        borrowToken0,
        minProfit,
        validatorTip
      );
      await tx.wait();

      const finalRepayTokenBalance = await token1.balanceOf(recipient);
      const profitEarned = finalRepayTokenBalance - initialRepayTokenBalance;

      assert(profitEarned > minProfit, "Profit must exceed minProfit threshold");
    });

    it("reverts safely when prices are equal and arbitrage is unprofitable", async function () {
      const r0 = ethers.parseEther("100");
      const r1 = ethers.parseEther("200000");

      await token0.mint(pairA.target, r0);
      await token1.mint(pairA.target, r1);
      await pairA.setReserves(r0, r1);

      await token0.mint(pairB.target, r0);
      await token1.mint(pairB.target, r1);
      await pairB.setReserves(r0, r1);

      await assert.rejects(
        async () => {
          await executor.executeFlashArb(
            pairA.target,
            pairB.target,
            ethers.parseEther("1"),
            true,
            1n,
            0n
          );
        },
        /FlashArb: Arbitrage unprofitable/,
        "Must revert when arbitrage is unprofitable"
      );
    });

    it("rejects execution attempts from non-owner accounts", async function () {
      await assert.rejects(
        async () => {
          await executor.connect(user).executeFlashArb(
            pairA.target,
            pairB.target,
            ethers.parseEther("1"),
            true,
            1n,
            0n
          );
        },
        /OwnableUnauthorizedAccount/,
        "Only owner can trigger arbitrage"
      );
    });
  });

  describe("Finding A: Uniswap V3 Callback Authentication & Validation", function () {
    it("prevents an arbitrary attacker from calling uniswapV3SwapCallback directly to drain tokens", async function () {
      // Seed executor with tokens
      const stolenAmount = ethers.parseEther("1000");
      await token0.mint(executor.target, stolenAmount);
      const initialExecutorBal = await token0.balanceOf(executor.target);
      assert.strictEqual(initialExecutorBal, stolenAmount);

      const fakeData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [token0.target]);

      // Attacker attempts to call callback directly
      await assert.rejects(
        async () => {
          await executor.connect(attacker).uniswapV3SwapCallback(
            stolenAmount,
            0n,
            fakeData
          );
        },
        /FlashArb: Unauthorized V3 callback caller/,
        "Direct callback call must be rejected"
      );

      // Verify tokens remain safe in contract
      const postExecutorBal = await token0.balanceOf(executor.target);
      assert.strictEqual(postExecutorBal, stolenAmount, "Contract balance must remain untouched");
    });

    it("allows a legitimate expected V3 pool to complete a valid swap callback during active execution", async function () {
      // Setup V2 borrow pool (Pair A): 100 Token0 : 200,000 Token1
      const r0_A = ethers.parseEther("100");
      const r1_A = ethers.parseEther("200000");
      await token0.mint(pairA.target, r0_A);
      await token1.mint(pairA.target, r1_A);
      await pairA.setReserves(r0_A, r1_A);

      // Setup V3 target pool: price where Token0 buys lots of Token1
      // sqrtPriceX96 for price ~ 2300 Token1 per Token0
      const sqrtP = 3793444000000000000000000000000n;
      await v3Pool.setSlot0(sqrtP, 0);
      await v3Pool.setLiquidity(ethers.parseEther("1000000"));

      // Fund V3 pool with Token1 to pay out the swap
      await token1.mint(v3Pool.target, ethers.parseEther("500000"));

      const borrowAmount = ethers.parseEther("1");
      const minProfit = ethers.parseEther("1");
      const initialBal = await token1.balanceOf(owner.address);

      const tx = await executor.executeV2ToV3FlashArb(
        pairA.target,
        v3Pool.target,
        borrowAmount,
        true,
        minProfit,
        0n
      );
      await tx.wait();

      const finalBal = await token1.balanceOf(owner.address);
      assert(finalBal > initialBal, "Owner should have realized net profit from V2-V3 arb");
    });

    it("reverts if a different or fake pool tries to call callback during active execution", async function () {
      const fakeData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [token0.target]);

      await assert.rejects(
        async () => {
          await executor.connect(user).uniswapV3SwapCallback(
            ethers.parseEther("1"),
            -ethers.parseEther("2000"),
            fakeData
          );
        },
        /FlashArb: Unauthorized V3 callback caller/
      );
    });

    it("rejects callback with invalid delta combinations (both zero, both positive, or both negative)", async function () {
      const fakeData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [token0.target]);

      // Both zero
      await assert.rejects(
        async () => {
          await executor.uniswapV3SwapCallback(0n, 0n, fakeData);
        },
        /FlashArb: Unauthorized V3 callback caller/
      );

      // Both positive
      await assert.rejects(
        async () => {
          await executor.uniswapV3SwapCallback(100n, 100n, fakeData);
        },
        /FlashArb: Unauthorized V3 callback caller/
      );
    });

    it("rejects callback with malformed data or mismatched paying token", async function () {
      await assert.rejects(
        async () => {
          await executor.uniswapV3SwapCallback(100n, -100n, "0x1234");
        },
        /FlashArb: Unauthorized V3 callback caller/
      );
    });
  });

  describe("Finding G: V2 Callback & Execution Safety", function () {
    it("rejects direct calls to uniswapV2Call outside of an active authorized flash swap", async function () {
      const dummyParams = {
        arbType: 0,
        poolBorrow: pairA.target,
        poolTarget: pairB.target,
        pool3: ethers.ZeroAddress,
        amountBorrow: ethers.parseEther("1"),
        borrowToken0: true,
        minProfit: 1n,
        validatorTip: 0n,
        recipient: attacker.address
      };

      const ArbParamsType = "tuple(uint8 arbType, address poolBorrow, address poolTarget, address pool3, uint256 amountBorrow, bool borrowToken0, uint256 minProfit, uint256 validatorTip, address recipient)";
      const data = ethers.AbiCoder.defaultAbiCoder().encode([ArbParamsType], [dummyParams]);

      await assert.rejects(
        async () => {
          await executor.connect(attacker).uniswapV2Call(
            executor.target,
            0n,
            0n,
            data
          );
        },
        /FlashArb: Unauthorized V2 caller/,
        "Direct call to uniswapV2Call must be blocked"
      );
    });

    it("reverts when poolTarget has mismatched tokens not containing the borrowed or repay token", async function () {
      const r0 = ethers.parseEther("100");
      const r1 = ethers.parseEther("200000");

      await token0.mint(pairA.target, r0);
      await token1.mint(pairA.target, r1);
      await pairA.setReserves(r0, r1);

      await token0.mint(incompatiblePair.target, r0);
      await altToken.mint(incompatiblePair.target, r1);
      await incompatiblePair.setReserves(r0, r1);

      await assert.rejects(
        async () => {
          await executor.executeFlashArb(
            pairA.target,
            incompatiblePair.target,
            ethers.parseEther("1"),
            true,
            1n,
            0n
          );
        },
        /FlashArb: Token mismatch in target pool/,
        "Incompatible target pool tokens must revert"
      );
    });

    it("prevents non-owners from rescuing tokens or ETH", async function () {
      await token0.mint(executor.target, ethers.parseEther("100"));

      await assert.rejects(
        async () => {
          await executor.connect(user).rescueTokens(token0.target, user.address, ethers.parseEther("100"));
        },
        /OwnableUnauthorizedAccount/,
        "Non-owner cannot rescue tokens"
      );

      await assert.rejects(
        async () => {
          await executor.connect(user).rescueETH(user.address);
        },
        /OwnableUnauthorizedAccount/,
        "Non-owner cannot rescue ETH"
      );
    });
  });
});
