import { describe, it } from "node:test";
import assert from "node:assert";
import { ethers } from "ethers";
import { V3QuoterEngine } from "../scripts/v3_quoter_engine.js";

describe("V3-to-V3 Flash Arbitrage Math & Sizing Engine", () => {
  it("should detect profitable spread when Price A < Price B and solve optimal borrow size", () => {
    // Pool A: Token 0 is cheaper (e.g. 1 Token0 = 1.30 Token1)
    // Pool B: Token 0 is more expensive (e.g. 1 Token0 = 1.35 Token1)
    const sqrtPA = V3QuoterEngine.priceToSqrtPriceX96(1.30);
    const sqrtPB = V3QuoterEngine.priceToSqrtPriceX96(1.35);
    const liquidity = ethers.parseEther("1000"); // 1000 virtual liquidity

    const poolA = {
      address: "0x1111111111111111111111111111111111111111",
      token0: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      token1: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      sqrtPriceX96: sqrtPA,
      liquidity: liquidity,
      feeMillionths: 2500 // 0.25%
    };

    const poolB = {
      address: "0x2222222222222222222222222222222222222222",
      token0: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      token1: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      sqrtPriceX96: sqrtPB,
      liquidity: liquidity,
      feeMillionths: 2500 // 0.25%
    };

    const best = V3QuoterEngine.findOptimalV3ToV3BorrowBest(poolA, poolB);

    assert(best.isProfitable, "Expected V3-to-V3 arbitrage to be profitable");
    assert(best.optimalBorrow > 0n, "Expected optimal borrow to be strictly positive");
    assert(best.maxProfit > 0n, "Expected max profit to be strictly positive");
    console.log("V3-to-V3 Math Test Passed!");
    console.log("Optimal Borrow:", ethers.formatEther(best.optimalBorrow), "Max Profit:", ethers.formatEther(best.maxProfit));
  });

  it("should reject equal-price V3 pools with 0 profit", () => {
    const sqrtP = V3QuoterEngine.priceToSqrtPriceX96(1.30);
    const liquidity = ethers.parseEther("1000");

    const poolA = {
      address: "0x1111111111111111111111111111111111111111",
      token0: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      token1: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      sqrtPriceX96: sqrtP,
      liquidity: liquidity,
      feeMillionths: 2500
    };

    const poolB = {
      address: "0x2222222222222222222222222222222222222222",
      token0: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      token1: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      sqrtPriceX96: sqrtP,
      liquidity: liquidity,
      feeMillionths: 2500
    };

    const best = V3QuoterEngine.findOptimalV3ToV3BorrowBest(poolA, poolB);
    assert(!best.isProfitable || best.maxProfit === 0n, "Equal pools must be unprofitable");
  });
});
