import assert from "node:assert";
import hre from "hardhat";

const { ethers } = hre;

describe("FlashArbExecutor - DEX Arbitrage System", function () {
  let owner, user;
  let weth, usdt;
  let token0, token1;
  let pairA, pairB;
  let executor;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // 1. Deploy WETH & USDT
    const MockWETH = await ethers.getContractFactory("MockWETH");
    weth = await MockWETH.deploy();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdt = await MockERC20.deploy("Tether USD", "USDT", 18);

    // Uniswap V2 requires token0 < token1 address sorting
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
    pairB = await MockPair.deploy(token0.target, token1.target);

    // 3. Deploy FlashArbExecutor
    const FlashArb = await ethers.getContractFactory("FlashArbExecutor");
    executor = await FlashArb.deploy(weth.target);
  });

  it("successfully executes flash swap arbitrage between two pools without upfront capital", async function () {
    // Setup Price Discrepancy:
    // Suppose token0 = WETH, token1 = USDT
    // Pair A (Uniswap): 100 WETH : 200,000 USDT (Price: 1 WETH = 2,000 USDT)
    // Pair B (SushiSwap): 100 WETH : 220,000 USDT (Price: 1 WETH = 2,200 USDT -> WETH is expensive on Pair B)
    const r0_A = ethers.parseEther("100");
    const r1_A = ethers.parseEther("200000");

    const r0_B = ethers.parseEther("100");
    const r1_B = ethers.parseEther("220000");

    // Mint liquidity to pairs
    await token0.mint(pairA.target, r0_A);
    await token1.mint(pairA.target, r1_A);
    await pairA.setReserves(r0_A, r1_A);

    await token0.mint(pairB.target, r0_B);
    await token1.mint(pairB.target, r1_B);
    await pairB.setReserves(r0_B, r1_B);

    // Initial recipient balance
    const recipient = owner.address;
    const initialRepayTokenBalance = await token1.balanceOf(recipient);

    // Arbitrage:
    // Borrow 2 WETH (token0) from Pair A
    // Swap 2 WETH for USDT (token1) on Pair B
    // Repay required USDT back to Pair A
    // Net profit remains in USDT for the recipient
    const borrowAmount = ethers.parseEther("2");
    const borrowToken0 = true;
    const minProfit = ethers.parseEther("1"); // at least 1 USDT profit
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

    // Verify recipient received net profit
    const finalRepayTokenBalance = await token1.balanceOf(recipient);
    const profitEarned = finalRepayTokenBalance - initialRepayTokenBalance;

    console.log(`\nArbitrage Execution Succeeded!`);
    console.log(`Borrowed: ${ethers.formatEther(borrowAmount)} Token0`);
    console.log(`Net Profit Realized: ${ethers.formatEther(profitEarned)} Token1`);

    assert(profitEarned > minProfit, "Profit must exceed minProfit threshold");
  });

  it("reverts safely when prices are equal and arbitrage is unprofitable", async function () {
    // Both pairs have identical prices (no arb spread)
    const r0 = ethers.parseEther("100");
    const r1 = ethers.parseEther("200000");

    await token0.mint(pairA.target, r0);
    await token1.mint(pairA.target, r1);
    await pairA.setReserves(r0, r1);

    await token0.mint(pairB.target, r0);
    await token1.mint(pairB.target, r1);
    await pairB.setReserves(r0, r1);

    const borrowAmount = ethers.parseEther("1");

    await assert.rejects(
      async () => {
        await executor.executeFlashArb(
          pairA.target,
          pairB.target,
          borrowAmount,
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
    const borrowAmount = ethers.parseEther("1");

    await assert.rejects(
      async () => {
        await executor.connect(user).executeFlashArb(
          pairA.target,
          pairB.target,
          borrowAmount,
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
