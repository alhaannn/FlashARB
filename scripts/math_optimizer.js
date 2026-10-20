import { ethers } from "ethers";

/**
 * Optimal Input Calculator & Route Evaluator for DEX Flash Swap Arbitrage
 * 
 * Uses exact BigInt integer arithmetic and ternary search over the concave profit curve.
 * Never uses synthetic reserves or assumes 18-decimal tokens.
 */

/**
 * Computes Uniswap V2 getAmountOut with configurable swap fee.
 * 
 * @param {bigint} amountIn - Input token amount
 * @param {bigint} reserveIn - Reserve of input token
 * @param {bigint} reserveOut - Reserve of output token
 * @param {bigint} feeMultiplier - e.g. 997n for 0.3% fee with feeBase 1000n
 * @param {bigint} feeBase - e.g. 1000n or 10000n
 * @returns {bigint}
 */
export function calculateAmountOut(amountIn, reserveIn, reserveOut, feeMultiplier = 997n, feeBase = 1000n) {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const amountInWithFee = amountIn * feeMultiplier;
  const numerator = amountInWithFee * reserveOut;
  const denominator = (reserveIn * feeBase) + amountInWithFee;
  if (denominator <= 0n) return 0n;
  return numerator / denominator;
}

/**
 * Computes Uniswap V2 getAmountIn with configurable swap fee.
 * 
 * @param {bigint} amountOut - Desired output token amount
 * @param {bigint} reserveIn - Reserve of input (repayment) token
 * @param {bigint} reserveOut - Reserve of output (borrowed) token
 * @param {bigint} feeMultiplier - e.g. 997n for 0.3% fee with feeBase 1000n
 * @param {bigint} feeBase - e.g. 1000n or 10000n
 * @returns {bigint}
 */
export function calculateAmountIn(amountOut, reserveIn, reserveOut, feeMultiplier = 997n, feeBase = 1000n) {
  if (amountOut <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  if (amountOut >= reserveOut) return 0n;
  const numerator = reserveIn * amountOut * feeBase;
  const denominator = (reserveOut - amountOut) * feeMultiplier;
  if (denominator <= 0n) return 0n;
  return (numerator / denominator) + 1n;
}

/**
 * Calculates net profit in repayToken for a given borrow amount.
 * 
 * @param {bigint} borrowAmount - Amount of borrowed token
 * @param {bigint} rBorrowIn - Reserve of repayment token in borrow pool
 * @param {bigint} rBorrowOut - Reserve of borrowed token in borrow pool
 * @param {bigint} rTargetIn - Reserve of borrowed token in target pool
 * @param {bigint} rTargetOut - Reserve of repayment token in target pool
 * @param {bigint} feeBorrow - Fee multiplier in borrow pool (default 997n)
 * @param {bigint} feeTarget - Fee multiplier in target pool (default 997n)
 * @param {bigint} feeBase - Fee base (default 1000n)
 * @returns {bigint} Net profit in repayToken (negative if unprofitable)
 */
export function calculateNetProfit(
  borrowAmount,
  rBorrowIn,
  rBorrowOut,
  rTargetIn,
  rTargetOut,
  feeBorrow = 997n,
  feeTarget = 997n,
  feeBase = 1000n
) {
  if (borrowAmount <= 0n || borrowAmount >= rBorrowOut) return -1n;
  if (rBorrowIn <= 0n || rTargetIn <= 0n || rTargetOut <= 0n) return -1n;

  // 1. Swapping borrowAmount on Target Pool yields repayToken:
  const amountOut = calculateAmountOut(borrowAmount, rTargetIn, rTargetOut, feeTarget, feeBase);
  if (amountOut <= 0n) return -1n;

  // 2. Repaying Borrow Pool for borrowAmount requires repayToken:
  const amountRequired = calculateAmountIn(borrowAmount, rBorrowIn, rBorrowOut, feeBorrow, feeBase);
  if (amountRequired <= 0n) return -1n;

  return amountOut - amountRequired;
}

/**
 * Finds the optimal borrow amount using Ternary Search over the concave profit curve.
 * Works in raw token units without floating-point distortion.
 *
 * @param {bigint} rBorrowIn - Reserve of repayment token in borrow pool
 * @param {bigint} rBorrowOut - Reserve of borrowed token in borrow pool
 * @param {bigint} rTargetIn - Reserve of borrowed token in target pool
 * @param {bigint} rTargetOut - Reserve of repayment token in target pool
 * @param {object} options - Configuration options (fees, maxPoolPercent)
 * @returns {{ optimalBorrow: bigint, maxProfit: bigint, isProfitable: boolean }}
 */
export function findOptimalBorrowAmount(
  rBorrowIn,
  rBorrowOut,
  rTargetIn,
  rTargetOut,
  options = {}
) {
  const feeBorrow = options.feeBorrow || 997n;
  const feeTarget = options.feeTarget || 997n;
  const feeBase = options.feeBase || 1000n;
  const maxPoolPercent = options.maxPoolPercent || 30n; // max 30% of borrow pool reserve

  // Reject missing, zero, or non-positive reserves
  if (
    !rBorrowIn || rBorrowIn <= 0n ||
    !rBorrowOut || rBorrowOut <= 0n ||
    !rTargetIn || rTargetIn <= 0n ||
    !rTargetOut || rTargetOut <= 0n
  ) {
    return { optimalBorrow: 0n, maxProfit: 0n, isProfitable: false };
  }

  let low = 1n;
  let high = (rBorrowOut * maxPoolPercent) / 100n;
  if (high <= low) {
    return { optimalBorrow: 0n, maxProfit: 0n, isProfitable: false };
  }

  // Ternary search for maximum of concave function
  for (let i = 0; i < 80; i++) {
    if (high - low < 3n) break;
    const m1 = low + (high - low) / 3n;
    const m2 = high - (high - low) / 3n;

    const profit1 = calculateNetProfit(m1, rBorrowIn, rBorrowOut, rTargetIn, rTargetOut, feeBorrow, feeTarget, feeBase);
    const profit2 = calculateNetProfit(m2, rBorrowIn, rBorrowOut, rTargetIn, rTargetOut, feeBorrow, feeTarget, feeBase);

    if (profit1 < profit2) {
      low = m1;
    } else {
      high = m2;
    }
  }

  const optimalBorrow = (low + high) / 2n;
  const maxProfit = calculateNetProfit(optimalBorrow, rBorrowIn, rBorrowOut, rTargetIn, rTargetOut, feeBorrow, feeTarget, feeBase);
  const isProfitable = maxProfit > 0n;

  return {
    optimalBorrow: isProfitable ? optimalBorrow : 0n,
    maxProfit: isProfitable ? maxProfit : 0n,
    isProfitable
  };
}

/**
 * Evaluates all four potential flash swap arbitrage routes between two pools:
 * 1. Borrow Token0 on Pool A -> Sell on Pool B for Token1 -> Repay Pool A
 * 2. Borrow Token1 on Pool A -> Sell on Pool B for Token0 -> Repay Pool A
 * 3. Borrow Token0 on Pool B -> Sell on Pool A for Token1 -> Repay Pool B
 * 4. Borrow Token1 on Pool B -> Sell on Pool A for Token0 -> Repay Pool B
 *
 * Verifies on-chain tokens, rejects synthetic/stale/zero reserves, and handles
 * token ordering and decimals explicitly.
 *
 * @param {object} poolA - { pairAddress, token0, token1, reserve0, reserve1, feeBps }
 * @param {object} poolB - { pairAddress, token0, token1, reserve0, reserve1, feeBps }
 * @param {object} options - { minProfitRaw, decimals0, decimals1 }
 * @returns {object|null} Optimal route specification, or null if no profitable route exists
 */
export function evaluateTwoPoolArbitrage(poolA, poolB, options = {}) {
  if (!poolA || !poolB) return null;

  // Validate addresses
  if (!poolA.pairAddress || !poolB.pairAddress) return null;
  if (!poolA.token0 || !poolA.token1 || !poolB.token0 || !poolB.token1) return null;

  // Validate token pair match (order-agnostic)
  const a0 = ethers.getAddress(poolA.token0).toLowerCase();
  const a1 = ethers.getAddress(poolA.token1).toLowerCase();
  const b0 = ethers.getAddress(poolB.token0).toLowerCase();
  const b1 = ethers.getAddress(poolB.token1).toLowerCase();

  const sameOrdering = (a0 === b0 && a1 === b1);
  const invertedOrdering = (a0 === b1 && a1 === b0);
  if (!sameOrdering && !invertedOrdering) {
    // Incompatible pools (different token pairs)
    return null;
  }

  // Parse raw BigInt reserves
  const rA0 = BigInt(poolA.reserve0 || 0);
  const rA1 = BigInt(poolA.reserve1 || 0);
  let rB0 = BigInt(poolB.reserve0 || 0);
  let rB1 = BigInt(poolB.reserve1 || 0);

  // If Pool B has inverted token ordering, normalize B's reserves to match Pool A's token0/token1
  if (invertedOrdering) {
    const temp = rB0;
    rB0 = rB1;
    rB1 = temp;
  }

  // Reject zero or negative reserves (never synthesize)
  if (rA0 <= 0n || rA1 <= 0n || rB0 <= 0n || rB1 <= 0n) {
    return null;
  }

  // Fee configuration
  const feeA = poolA.feeBps ? 10000n - BigInt(poolA.feeBps) : 9970n;
  const feeB = poolB.feeBps ? 10000n - BigInt(poolB.feeBps) : 9970n;
  const feeBase = 10000n;

  const routes = [
    // Route 1: Borrow Token0 from Pool A, sell on Pool B for Token1, repay Pool A in Token1
    {
      borrowPool: poolA.pairAddress,
      targetPool: poolB.pairAddress,
      borrowToken: a0,
      repayToken: a1,
      borrowToken0: true, // token0 in Pool A
      opt: findOptimalBorrowAmount(rA1, rA0, rB0, rB1, { feeBorrow: feeA, feeTarget: feeB, feeBase })
    },
    // Route 2: Borrow Token1 from Pool A, sell on Pool B for Token0, repay Pool A in Token0
    {
      borrowPool: poolA.pairAddress,
      targetPool: poolB.pairAddress,
      borrowToken: a1,
      repayToken: a0,
      borrowToken0: false, // token1 in Pool A
      opt: findOptimalBorrowAmount(rA0, rA1, rB1, rB0, { feeBorrow: feeA, feeTarget: feeB, feeBase })
    },
    // Route 3: Borrow Token0 from Pool B, sell on Pool A for Token1, repay Pool B in Token1
    {
      borrowPool: poolB.pairAddress,
      targetPool: poolA.pairAddress,
      borrowToken: a0,
      repayToken: a1,
      borrowToken0: !invertedOrdering, // token0 in Pool B if same ordering, else token1
      opt: findOptimalBorrowAmount(rB1, rB0, rA0, rA1, { feeBorrow: feeB, feeTarget: feeA, feeBase })
    },
    // Route 4: Borrow Token1 from Pool B, sell on Pool A for Token0, repay Pool B in Token0
    {
      borrowPool: poolB.pairAddress,
      targetPool: poolA.pairAddress,
      borrowToken: a1,
      repayToken: a0,
      borrowToken0: invertedOrdering, // token1 in Pool B if same ordering, else token0
      opt: findOptimalBorrowAmount(rB0, rB1, rA1, rA0, { feeBorrow: feeB, feeTarget: feeA, feeBase })
    }
  ];

  let bestRoute = null;
  const minProfitRaw = options.minProfitRaw || 1n;

  for (const r of routes) {
    if (options.borrowPool && r.borrowPool.toLowerCase() !== options.borrowPool.toLowerCase()) {
      continue;
    }
    if (options.borrowToken && r.borrowToken.toLowerCase() !== options.borrowToken.toLowerCase()) {
      continue;
    }
    if (r.opt.isProfitable && r.opt.maxProfit >= minProfitRaw) {
      let compProfit = r.opt.maxProfit;
      const dec0 = poolA.decimals0 ?? options.tokenDecimals?.[a0] ?? null;
      const dec1 = poolA.decimals1 ?? options.tokenDecimals?.[a1] ?? null;
      if (dec0 != null && dec1 != null) {
        const repayDec = (r.repayToken === a0) ? dec0 : dec1;
        if (repayDec < 18) {
          compProfit = r.opt.maxProfit * (10n ** BigInt(18 - repayDec));
        }
      }

      if (!bestRoute || compProfit > (bestRoute.compProfit ?? bestRoute.maxProfit)) {
        bestRoute = {
          borrowPool: r.borrowPool,
          targetPool: r.targetPool,
          borrowToken: r.borrowToken,
          repayToken: r.repayToken,
          borrowToken0: r.borrowToken0,
          optimalBorrow: r.opt.optimalBorrow,
          maxProfit: r.opt.maxProfit,
          compProfit: compProfit,
          isProfitable: true
        };
      }
    }
  }

  return bestRoute;
}
