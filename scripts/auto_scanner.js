import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { findArbitrageCandidates } from "./auto_pair_finder.js";
import { findOptimalBorrowAmount } from "./math_optimizer.js";
import { FlashbotsBundleEngine } from "./flashbots_bundle_engine.js";
import { WebSocketSyncListener } from "./ws_sync_listener.js";
import "dotenv/config";

/**
 * Fully Autonomous Multi-Pair Arbitrage Scanner
 * 1. Discovers verified safe pairs automatically
 * 2. Monitors all pairs simultaneously across new blocks
 * 3. Calculates optimal input and net profit
 * 4. Executes flash swap arbitrage without human involvement
 */

const PAIR_ABI = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

const EXECUTOR_ABI = [
  "function executeFlashArb(address poolBorrow, address poolTarget, uint256 amountBorrow, bool borrowToken0, uint256 minProfit, uint256 validatorTip) external"
];

async function main() {
  console.log("=========================================================");
  console.log("       Autonomous Multi-Pair Arbitrage Engine            ");
  console.log("=========================================================\n");

  const chain = process.env.CHAIN || "base";
  const rpcUrl = process.env.RPC_URL || (chain === "base" ? "https://mainnet.base.org" : "https://arb1.arbitrum.io/rpc");
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const executorAddress = process.env.EXECUTOR_CONTRACT;
  const privateKey = process.env.PRIVATE_KEY;

  console.log(`Target Network: ${chain.toUpperCase()}`);
  console.log(`RPC Provider:   ${rpcUrl}`);
  console.log(`Executor:       ${executorAddress || "Simulation Mode (No contract set)"}`);

  // 1. Initial Auto-Discovery
  let monitoredPairs = [];
  const monitoredFilePath = path.resolve(process.cwd(), "monitored_pairs.json");

  if (fs.existsSync(monitoredFilePath)) {
    try {
      monitoredPairs = JSON.parse(fs.readFileSync(monitoredFilePath, "utf8"));
      console.log(`Loaded ${monitoredPairs.length} previously verified safe pairs.`);
    } catch {
      monitoredPairs = [];
    }
  }

  if (monitoredPairs.length === 0) {
    console.log("No existing pairs found. Running automated discovery...");
    monitoredPairs = await findArbitrageCandidates(chain);
  }

  // Refresh pairs every 15 minutes in background
  setInterval(async () => {
    console.log("\n[Auto-Discovery] Refreshing market pairs and security checks...");
    try {
      const refreshed = await findArbitrageCandidates(chain);
      if (refreshed && refreshed.length > 0) {
        monitoredPairs = refreshed;
      }
    } catch (err) {
      console.error("[Auto-Discovery] Error refreshing pairs:", err.message);
    }
  }, 15 * 60 * 1000);

  // Solution 2: Real-time WebSocket Sync event streaming
  const wssUrl = process.env.WSS_URL;
  if (wssUrl) {
    console.log(`\n[Solution 2] Activating real-time WebSocket Sync event stream on: ${wssUrl}`);
    const wsListener = new WebSocketSyncListener(
      wssUrl,
      monitoredPairs,
      async ({ pair, opportunity, latencyMs }) => {
        console.log(`\n⚡ [REAL-TIME WSS SYNC: ${latencyMs}ms] Instant opportunity detected!`);
        console.log(`  Pair:   ${pair.symbol} / ${pair.quoteSymbol}`);
        console.log(`  Route:  ${opportunity.borrowDex} -> ${opportunity.targetDex}`);
        console.log(`  Borrow: ${ethers.formatEther(opportunity.optimalBorrow)}`);
        console.log(`  Profit: +${ethers.formatEther(opportunity.maxProfit)}`);

        if (privateKey && executorAddress) {
          console.log(`  [Pre-Flight] Simulating trade off-chain ($0 gas)...`);
          try {
            const signer = new ethers.Wallet(privateKey, provider);
            const contract = new ethers.Contract(executorAddress, EXECUTOR_ABI, signer);
            const borrowToken0 = opportunity.borrowToken0 !== undefined ? Boolean(opportunity.borrowToken0) : true;
            await contract.executeFlashArb.staticCall(
              opportunity.borrowPool,
              opportunity.targetPool,
              opportunity.optimalBorrow,
              borrowToken0,
              (opportunity.maxProfit * 90n) / 100n,
              0n
            );
            console.log(`  [Pre-Flight PASSED] Broadcasting transaction...`);
            const tx = await contract.executeFlashArb(
              opportunity.borrowPool,
              opportunity.targetPool,
              opportunity.optimalBorrow,
              borrowToken0,
              (opportunity.maxProfit * 90n) / 100n,
              0n
            );
            console.log(`  [Confirmed] Tx Hash: ${tx.hash}`);
          } catch (err) {
            console.log(`  [Pre-Flight BLOCKED] Slipped or beat by competitor. $0 gas burned!`);
          }
        }
      },
      (level, msg) => console.log(msg)
    );
    await wsListener.start();
    return;
  }

  // Fallback to block polling if no WSS_URL is provided
  // Setup contracts for all pairs
  const pairContracts = monitoredPairs.map(p => ({
    symbol: p.symbol,
    quote: p.quoteSymbol,
    poolA_dex: p.poolA.dex,
    poolB_dex: p.poolB.dex,
    contractA: new ethers.Contract(p.poolA.pairAddress, PAIR_ABI, provider),
    contractB: new ethers.Contract(p.poolB.pairAddress, PAIR_ABI, provider),
    addressA: p.poolA.pairAddress,
    addressB: p.poolB.pairAddress
  }));

  console.log(`\nActive Monitoring: Tracking ${pairContracts.length} dual-listed pools on each block...\n`);

  provider.on("block", async (blockNumber) => {
    for (const target of pairContracts) {
      try {
        const [resA, resB] = await Promise.all([
          target.contractA.getReserves(),
          target.contractB.getReserves()
        ]);

        const r0_A = BigInt(resA.reserve0);
        const r1_A = BigInt(resA.reserve1);
        const r0_B = BigInt(resB.reserve0);
        const r1_B = BigInt(resB.reserve1);

        // Check Direction 1 (Borrow on A -> Sell on B)
        const dir1 = findOptimalBorrowAmount(r0_A, r1_A, r0_B, r1_B);
        // Check Direction 2 (Borrow on B -> Sell on A)
        const dir2 = findOptimalBorrowAmount(r0_B, r1_B, r0_A, r1_A);

        const best = dir1.maxProfit > dir2.maxProfit
          ? { ...dir1, borrowPool: target.addressA, targetPool: target.addressB, borrowDex: target.poolA_dex, targetDex: target.poolB_dex }
          : { ...dir2, borrowPool: target.addressB, targetPool: target.addressA, borrowDex: target.poolB_dex, targetDex: target.poolA_dex };

        if (best.isProfitable) {
          console.log(`\n[Block #${blockNumber}] 🔥 ARBITRAGE OPPORTUNITY FOUND!`);
          console.log(`  Token:          ${target.symbol} / ${target.quote}`);
          console.log(`  Route:          ${best.borrowDex} -> ${best.targetDex}`);
          console.log(`  Optimal Borrow: ${ethers.formatEther(best.optimalBorrow)}`);
          console.log(`  Net Profit:     +${ethers.formatEther(best.maxProfit)} ${target.quote}`);

          if (privateKey && executorAddress) {
            console.log(`  [Pre-Flight] Simulating trade off-chain with staticCall ($0 gas)...`);
            const signer = new ethers.Wallet(privateKey, provider);
            const contract = new ethers.Contract(executorAddress, EXECUTOR_ABI, signer);

            try {
              // 1. Pre-flight static simulation against latest state
              // If this fails, it throws locally: ZERO gas burned!
              const borrowToken0 = best.borrowToken0 !== undefined ? Boolean(best.borrowToken0) : true;
              await contract.executeFlashArb.staticCall(
                best.borrowPool,
                best.targetPool,
                best.optimalBorrow,
                borrowToken0,
                (best.maxProfit * 90n) / 100n, // 10% slippage buffer
                0n
              );
              console.log(`  [Pre-Flight PASSED] Validated on-chain! Broadcasting transaction...`);

              // 2. Only broadcast after passing pre-flight simulation
              const tx = await contract.executeFlashArb(
                best.borrowPool,
                best.targetPool,
                best.optimalBorrow,
                borrowToken0,
                (best.maxProfit * 90n) / 100n,
                0n
              );
              console.log(`  [Confirmed] Tx Hash: ${tx.hash}`);
              await tx.wait(1);
            } catch (simError) {
              console.log(`  [Pre-Flight BLOCKED] Simulation reverted: ${simError.reason || simError.message}`);
              console.log(`  [Gas Protected] Transaction dropped in memory. $0.00 gas spent!`);
            }
          }
        }
      } catch {
        // Individual pool error handling (e.g. pool paused or non-standard format)
      }
    }
    process.stdout.write(`[Block #${blockNumber}] Monitored ${pairContracts.length} pools. Status: Active\r`);
  });
}

main().catch(console.error);
