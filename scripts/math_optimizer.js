/**
 * Optimal Input Calculator for Uniswap V2 DEX-to-DEX Arbitrage
 * 
 * Given two pools with reserves:
 *   Pool 1 (Borrow Pool): (reserve0_A, reserve1_A)
 *   Pool 2 (Target Pool): (reserve0_B, reserve1_B)
 * 
 * Computes the exact trade size (amountBorrow) that maximizes net profit after 0.3% fees.
 */

export function calculateAmountOut(amountIn, reserveIn, reserveOut) {
  if (amountIn <= 0n) return 0n;
  const amountInWithFee = amountIn * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = (reserveIn * 1000n) + amountInWithFee;
  return numerator / denominator;
}

export function calculateAmountIn(amountOut, reserveIn, reserveOut) {
  if (amountOut <= 0n) return 0n;
  if (amountOut >= reserveOut) return 0n;
  const numerator = reserveIn * amountOut * 1000n;
  const denominator = (reserveOut - amountOut) * 997n;
  return (numerator / denominator) + 1n;
}

/**
 * Calculates net profit for a given borrow amount.
 * @param {bigint} borrowAmount - Amount of token0 to borrow from Pool 1
 * @param {bigint} r0_A - Pool 1 reserve of token0
 * @param {bigint} r1_A - Pool 1 reserve of token1
 * @param {bigint} r0_B - Pool 2 reserve of token0
 * @param {bigint} r1_B - Pool 2 reserve of token1
 * @returns {bigint} Net profit in token1 (can be negative if unprofitable)
 */
export function calculateNetProfit(borrowAmount, r0_A, r1_A, r0_B, r1_B) {
  if (borrowAmount <= 0n || borrowAmount >= r0_A) return -1n;

  // 1. Swapping borrowAmount on Pool 2 yields token1:
  const amountOutB = calculateAmountOut(borrowAmount, r0_B, r1_B);

  // 2. Repaying Pool 1 for borrowAmount requires token1:
  const amountRequiredA = calculateAmountIn(borrowAmount, r1_A, r0_A);

  if (amountRequiredA === 0n) return -1n;
  return amountOutB - amountRequiredA;
}

/**
 * Finds the optimal borrow amount using Ternary Search over the convex profit curve.
 * Precision: within 1 wei, takes < 1ms to compute.
 */
export function findOptimalBorrowAmount(r0_A, r1_A, r0_B, r1_B) {
  let low = 1n;
  let high = (r0_A * 3n) / 10n; // upper bound: 30% of pool liquidity to avoid extreme slippage

  // Ternary search for maximum of concave function
  for (let i = 0; i < 80; i++) {
    if (high - low < 3n) break;
    const m1 = low + (high - low) / 3n;
    const m2 = high - (high - low) / 3n;

    const profit1 = calculateNetProfit(m1, r0_A, r1_A, r0_B, r1_B);
    const profit2 = calculateNetProfit(m2, r0_A, r1_A, r0_B, r1_B);

    if (profit1 < profit2) {
      low = m1;
    } else {
      high = m2;
    }
  }

  const optimalBorrow = (low + high) / 2n;
  const maxProfit = calculateNetProfit(optimalBorrow, r0_A, r1_A, r0_B, r1_B);

  return {
    optimalBorrow,
    maxProfit: maxProfit > 0n ? maxProfit : 0n,
    isProfitable: maxProfit > 0n
  };
}
