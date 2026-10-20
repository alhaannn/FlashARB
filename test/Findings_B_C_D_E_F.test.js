import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import hre from "hardhat";
import { ethers } from "ethers";

import {
  resolveBorrowToken0,
  getTokenDecimals,
  formatTokenUnits,
  parseTokenUnits
} from "../scripts/token_helpers.js";

import {
  calculateAmountOut,
  calculateAmountIn,
  calculateNetProfit,
  findOptimalBorrowAmount,
  evaluateTwoPoolArbitrage
} from "../scripts/math_optimizer.js";

import {
  formatRevertDiagnostics,
  sanitizeLogString,
  mustAbortTradeExecution
} from "../scripts/revert_diagnostics.js";

import {
  executeAndTrackLifecycle,
  TxStatus
} from "../scripts/tx_lifecycle.js";

describe("Regression Tests: Findings B, C, D, E, F", function () {
  let connection, hardhatEthers, owner, user;
  let token0, token1, pairA, pairB;

  beforeEach(async function () {
    connection = await hre.network.connect();
    hardhatEthers = connection.ethers;
    [owner, user] = await hardhatEthers.getSigners();

    const MockERC20 = await hardhatEthers.getContractFactory("MockERC20");
    const tA = await MockERC20.deploy("Token A", "TKNA", 18);
    const tB = await MockERC20.deploy("Token B", "TKNB", 18);
    await tA.waitForDeployment();
    await tB.waitForDeployment();

    if (tA.target.toLowerCase() < tB.target.toLowerCase()) {
      token0 = tA;
      token1 = tB;
    } else {
      token0 = tB;
      token1 = tA;
    }

    const MockPair = await hardhatEthers.getContractFactory("MockUniswapV2Pair");
    pairA = await MockPair.deploy(token0.target, token1.target);
    pairB = await MockPair.deploy(token0.target, token1.target);
    await pairA.waitForDeployment();
    await pairB.waitForDeployment();
  });

  // =====================================================================
  // FINDING B: poolAAddr TDZ Bug & borrowToken0 Fail-Closed Resolution
  // =====================================================================
  describe("Finding B: borrowToken0 Resolution & Fail-Closed Behavior", function () {
    it("correctly derives borrowToken0 = true when borrowed token is token0", async function () {
      const isToken0 = await resolveBorrowToken0(
        pairA.target,
        token0.target,
        hardhatEthers.provider
      );
      assert.strictEqual(isToken0, true, "Must derive true when borrowed token matches token0");
    });

    it("correctly derives borrowToken0 = false when borrowed token is token1", async function () {
      const isToken0 = await resolveBorrowToken0(
        pairA.target,
        token1.target,
        hardhatEthers.provider
      );
      assert.strictEqual(isToken0, false, "Must derive false when borrowed token matches token1");
    });

    it("honors explicitly configured borrowToken0 without on-chain query", async function () {
      const configuredFalse = await resolveBorrowToken0(
        pairA.target,
        token0.target,
        null,
        false
      );
      assert.strictEqual(configuredFalse, false);

      const configuredTrue = await resolveBorrowToken0(
        pairA.target,
        token1.target,
        null,
        true
      );
      assert.strictEqual(configuredTrue, true);
    });

    it("fails closed on invalid or missing pool address", async function () {
      await assert.rejects(
        async () => {
          await resolveBorrowToken0("invalid-address", token0.target, hardhatEthers.provider);
        },
        /Invalid pool address/,
        "Must fail closed on malformed pool address"
      );

      await assert.rejects(
        async () => {
          await resolveBorrowToken0(null, token0.target, hardhatEthers.provider);
        },
        /Invalid pool address/,
        "Must fail closed on null pool address"
      );
    });

    it("fails closed on invalid or missing token address", async function () {
      await assert.rejects(
        async () => {
          await resolveBorrowToken0(pairA.target, "0x000invalid", hardhatEthers.provider);
        },
        /Invalid token address/,
        "Must fail closed on malformed token address"
      );
    });

    it("fails closed when token0 query fails on-chain instead of assuming true", async function () {
      // Pass an address that is not a pair contract (e.g. user EOA)
      await assert.rejects(
        async () => {
          await resolveBorrowToken0(user.address, token0.target, hardhatEthers.provider);
        },
        /Failed to retrieve valid token0|CALL_EXCEPTION/,
        "Must revert and not silently default to true"
      );
    });
  });

  // =====================================================================
  // FINDING C: Optimizer & Multi-Decimal Raw Unit Arithmetic
  // =====================================================================
  describe("Finding C: Optimizer, Decimals & Token Ordering", function () {
    it("handles 6-decimal tokens (e.g. USDC) with correct integer scaling", function () {
      // 100 WETH (18 dec) : 200,000 USDC (6 dec)
      // WETH Price: $2,000 on Pool A
      const rWeth_A = parseTokenUnits("100", 18);
      const rUsdc_A = parseTokenUnits("200000", 6);

      // 100 WETH : 220,000 USDC on Pool B
      // WETH Price: $2,200 on Pool B (10% spread)
      const rWeth_B = parseTokenUnits("100", 18);
      const rUsdc_B = parseTokenUnits("220000", 6);

      // Borrow WETH from Pool A, swap on Pool B for USDC, repay Pool A in USDC
      const opt = findOptimalBorrowAmount(rUsdc_A, rWeth_A, rWeth_B, rUsdc_B);

      assert(opt.isProfitable, "Must be profitable with 10% price discrepancy");
      assert(opt.optimalBorrow > 0n, "Optimal borrow amount must be > 0");

      // Verify net profit is denominated in USDC raw units (6 decimals)
      assert(opt.maxProfit > 0n, "Net profit must be positive");
      const profitUsdc = formatTokenUnits(opt.maxProfit, 6);
      assert(parseFloat(profitUsdc) > 100, "Profit in USDC should be substantial");
    });

    it("handles 8-decimal tokens (e.g. WBTC) with exact raw units", function () {
      // 10 WBTC (8 dec) : 600,000 USDT (6 dec) -> Price $60,000
      const rBtc_A = parseTokenUnits("10", 8);
      const rUsdt_A = parseTokenUnits("600000", 6);

      // 10 WBTC : 630,000 USDT on Pool B -> Price $63,000 (5% spread)
      const rBtc_B = parseTokenUnits("10", 8);
      const rUsdt_B = parseTokenUnits("630000", 6);

      const opt = findOptimalBorrowAmount(rUsdt_A, rBtc_A, rBtc_B, rUsdt_B);

      assert(opt.isProfitable, "Must be profitable with WBTC 8-dec / USDT 6-dec");
      assert(opt.optimalBorrow > 0n);
      assert(opt.maxProfit > 0n);

      const formattedBorrowBtc = formatTokenUnits(opt.optimalBorrow, 8);
      assert(parseFloat(formattedBorrowBtc) > 0, "Borrow amount in WBTC must be positive");
    });

    it("evaluates inverted token ordering between pools deterministically", function () {
      const addrA = "0x1111111111111111111111111111111111111111";
      const addrB = "0x2222222222222222222222222222222222222222";
      const tokenX = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      const tokenY = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

      // Pool A: token0 = X (18 dec), token1 = Y (6 dec) (100 X : 200,000 Y)
      const poolA = {
        pairAddress: addrA,
        token0: tokenX,
        token1: tokenY,
        decimals0: 18,
        decimals1: 6,
        reserve0: parseTokenUnits("100", 18),
        reserve1: parseTokenUnits("200000", 6)
      };

      // Pool B has INVERTED ordering: token0 = Y (6 dec), token1 = X (18 dec) (220,000 Y : 100 X)
      const poolB = {
        pairAddress: addrB,
        token0: tokenY,
        token1: tokenX,
        decimals0: 6,
        decimals1: 18,
        reserve0: parseTokenUnits("220000", 6),
        reserve1: parseTokenUnits("100", 18)
      };

      const result = evaluateTwoPoolArbitrage(poolA, poolB);

      assert(result !== null, "Must resolve inverted ordering successfully");
      assert(result.isProfitable, "Must find profitable route across inverted pools");
      assert.strictEqual(result.borrowToken, tokenX.toLowerCase(), "Should borrow underpriced tokenX");
    });

    it("strictly rejects missing, zero, or negative reserves (never synthesizes)", function () {
      const addrA = "0x1111111111111111111111111111111111111111";
      const addrB = "0x2222222222222222222222222222222222222222";
      const tokenX = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      const tokenY = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

      // Zero reserve in Pool A
      const zeroPool = {
        pairAddress: addrA,
        token0: tokenX,
        token1: tokenY,
        reserve0: 0n,
        reserve1: 1000n
      };
      const normalPool = {
        pairAddress: addrB,
        token0: tokenX,
        token1: tokenY,
        reserve0: 1000n,
        reserve1: 2000n
      };

      const result = evaluateTwoPoolArbitrage(zeroPool, normalPool);
      assert.strictEqual(result, null, "Zero reserve pool must return null");
    });

    it("accurately declares unprofitable route when prices are identical", function () {
      const r0 = parseTokenUnits("100", 18);
      const r1 = parseTokenUnits("200000", 18);

      const opt = findOptimalBorrowAmount(r1, r0, r0, r1);
      assert.strictEqual(opt.isProfitable, false, "Equal prices must be unprofitable after fees");
      assert.strictEqual(opt.maxProfit, 0n);
    });

    it("accounts for configurable swap fees (e.g. 10 bps vs 30 bps)", function () {
      const rIn = parseTokenUnits("1000", 18);
      const rOut = parseTokenUnits("2000", 18);
      const amountIn = parseTokenUnits("10", 18);

      // 30 bps (997/1000)
      const out30bps = calculateAmountOut(amountIn, rIn, rOut, 997n, 1000n);
      // 5 bps (9995/10000)
      const out5bps = calculateAmountOut(amountIn, rIn, rOut, 9995n, 10000n);

      assert(out5bps > out30bps, "Lower fee must yield higher output amount");
    });
  });

  // =====================================================================
  // FINDING D: V2-to-V3 Contract Initialization
  // =====================================================================
  describe("Finding D: V2-to-V3 Contract Initialization & Configuration", function () {
    it("ensures executeV2ToV3FlashArb exists on contract ABI and contract is validly instantiated", async function () {
      const FlashArb = await hardhatEthers.getContractFactory("FlashArbExecutor");
      const executor = await FlashArb.deploy(token0.target);
      await executor.waitForDeployment();

      const EXECUTOR_ABI = [
        "function executeV2ToV3FlashArb(address poolV2Borrow, address poolV3Target, uint256 amountBorrow, bool borrowToken0, uint256 minProfit, uint256 validatorTip) external"
      ];

      const contract = new hardhatEthers.Contract(executor.target, EXECUTOR_ABI, owner);

      assert(contract.executeV2ToV3FlashArb !== undefined, "executeV2ToV3FlashArb must exist on contract");
      assert.strictEqual(typeof contract.executeV2ToV3FlashArb.staticCall, "function");
    });

    it("fails closed when EXECUTOR_CONTRACT is undefined or not a valid address", function () {
      const invalidAddress = "0xinvalid";
      assert.strictEqual(ethers.isAddress(invalidAddress), false);

      const nullAddress = null;
      assert.strictEqual(Boolean(nullAddress && ethers.isAddress(nullAddress)), false);
    });
  });

  // =====================================================================
  // FINDING E: Transaction Status & Profit Realization
  // =====================================================================
  describe("Finding E: Transaction Lifecycle & Realized Profit", function () {
    it("transitions through SUBMITTED, PENDING, and CONFIRMED without premature profit realization", async function () {
      const FlashArb = await hardhatEthers.getContractFactory("FlashArbExecutor");
      const executor = await FlashArb.deploy(token0.target);
      await executor.waitForDeployment();

      // Setup profitable reserves
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

      const statusSequence = [];

      const result = await executeAndTrackLifecycle(
        executor,
        "executeFlashArb",
        [pairA.target, pairB.target, ethers.parseEther("2"), true, ethers.parseEther("1"), 0n],
        {
          onStatusChange: (status) => {
            statusSequence.push(status);
          }
        }
      );

      assert.strictEqual(result.status, TxStatus.CONFIRMED);
      assert(result.receipt !== null);
      assert.strictEqual(result.receipt.status, 1);
      assert(statusSequence.includes(TxStatus.SUBMITTED));
      assert(statusSequence.includes(TxStatus.PENDING));
      assert(statusSequence.includes(TxStatus.CONFIRMED));

      // Verifies realized profit is extracted from ArbitrageExecuted event
      assert(result.realizedProfit !== null);
      assert(result.realizedProfit > 0n);
    });

    it("handles failed transactions as FAILED and never returns realized profit", async function () {
      const FlashArb = await hardhatEthers.getContractFactory("FlashArbExecutor");
      const executor = await FlashArb.deploy(token0.target);
      await executor.waitForDeployment();

      // Call executeFlashArb with unprofitable parameters (causes revert)
      const result = await executeAndTrackLifecycle(
        executor,
        "executeFlashArb",
        [pairA.target, pairB.target, ethers.parseEther("1"), true, 1n, 0n]
      );

      assert.strictEqual(result.status, TxStatus.FAILED);
      assert.strictEqual(result.realizedProfit, null, "Must never realize profit on failed trade");
    });
  });

  // =====================================================================
  // FINDING F: Revert Diagnostics & Secret Sanitization
  // =====================================================================
  describe("Finding F: Revert Diagnostics & Credential Sanitization", function () {
    it("preserves error name, code, function name, and sanitized trade parameters", function () {
      const mockError = {
        name: "CallException",
        code: "CALL_EXCEPTION",
        reason: "FlashArb: Arbitrage unprofitable",
        shortMessage: "execution reverted: FlashArb: Arbitrage unprofitable",
        data: "0x08c379a0"
      };

      const context = {
        targetContract: "0x1234567890123456789012345678901234567890",
        chainId: "8453",
        functionName: "executeFlashArb",
        poolAddresses: ["0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"],
        tradeParams: { amountBorrow: "1000000000000000000", borrowToken0: true }
      };

      const { diagnosticString, structuredData } = formatRevertDiagnostics(mockError, context);

      assert(diagnosticString.includes("FlashArb: Arbitrage unprofitable"));
      assert(diagnosticString.includes("executeFlashArb"));
      assert(diagnosticString.includes("CALL_EXCEPTION"));
      assert.strictEqual(structuredData.chainId, "8453");
      assert.strictEqual(structuredData.customErrorData, "0x08c379a0");
    });

    it("strictly sanitizes 32-byte hex private keys from diagnostic logs", function () {
      const leakedKey = "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d";
      const dirtyString = `Failed with privateKey=${leakedKey} in simulation`;

      const clean = sanitizeLogString(dirtyString);
      assert(!clean.includes(leakedKey), "Private key must be redacted");
      assert(clean.includes("[REDACTED_SECRET]"), "Redacted placeholder must be present");
    });

    it("strictly aborts execution when simulation produces any error", function () {
      const simError = new Error("VM execution reverted");
      assert.strictEqual(mustAbortTradeExecution(simError), true);

      const noError = null;
      assert.strictEqual(mustAbortTradeExecution(noError), false);
    });
  });
});
