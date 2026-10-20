import { ethers } from "ethers";
import { findOptimalBorrowAmount, calculateNetProfit } from "./math_optimizer.js";

console.log("=========================================================");
console.log("      Testing Mathematical Trade Size Optimizer          ");
console.log("=========================================================\n");

// Pool 1: 100 WETH : 200,000 USDT (Price = 2,000)
const r0_A = ethers.parseEther("100");
const r1_A = ethers.parseEther("200000");

// Pool 2: 100 WETH : 220,000 USDT (Price = 2,200 -> 10% higher)
const r0_B = ethers.parseEther("100");
const r1_B = ethers.parseEther("220000");

const result = findOptimalBorrowAmount(r0_A, r1_A, r0_B, r1_B);

console.log(`Pool A (Borrow): 100 WETH / 200,000 USDT`);
console.log(`Pool B (Target): 100 WETH / 220,000 USDT`);
console.log(`Is Profitable:   ${result.isProfitable}`);
console.log(`Optimal Borrow:  ${ethers.formatEther(result.optimalBorrow)} WETH`);
console.log(`Max Net Profit:  ${ethers.formatEther(result.maxProfit)} USDT`);

// Test small suboptimal trade vs optimal trade
const test1 = calculateNetProfit(ethers.parseEther("0.5"), r0_A, r1_A, r0_B, r1_B);
const test2 = calculateNetProfit(result.optimalBorrow, r0_A, r1_A, r0_B, r1_B);
const test3 = calculateNetProfit(ethers.parseEther("10"), r0_A, r1_A, r0_B, r1_B);

console.log(`\nProfit comparison:`);
console.log(`- Borrow  0.5 WETH: ${ethers.formatEther(test1)} USDT`);
console.log(`- Borrow ${ethers.formatEther(result.optimalBorrow).slice(0, 6)} WETH: ${ethers.formatEther(test2)} USDT (OPTIMAL)`);
console.log(`- Borrow 10.0 WETH: ${ethers.formatEther(test3)} USDT (Over-slippage reduced profit)`);
