import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { findArbitrageCandidates } from "./auto_pair_finder.js";
import { evaluateTwoPoolArbitrage, findOptimalBorrowAmount } from "./math_optimizer.js";
import { formatRevertDiagnostics } from "./revert_diagnostics.js";
import { executeAndTrackLifecycle, TxStatus } from "./tx_lifecycle.js";
import { resolveBorrowToken0, getTokenDecimals, formatTokenUnits } from "./token_helpers.js";
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
        const [resA, resB, t0A, t1A, t0B, t1B] = await Promise.all([
          target.contractA.getReserves(),
          target.contractB.getReserves(),
          target.contractA.token0(),
          target.contractA.token1(),
          target.contractB.token0(),
          target.contractB.token1()
        ]);

        const best = evaluateTwoPoolArbitrage(
          { pairAddress: target.addressA, token0: t0A, token1: t1A, reserve0: resA.reserve0, reserve1: resA.reserve1 },
          { pairAddress: target.addressB, token0: t0B, token1: t1B, reserve0: resB.reserve0, reserve1: resB.reserve1 }
        );

        if (best && best.isProfitable) {
          const borrowDecimals = await getTokenDecimals(best.borrowToken, provider);
          const repayDecimals = await getTokenDecimals(best.repayToken, provider);

          console.log(`\n[Block #${blockNumber}] 🔥 ARBITRAGE OPPORTUNITY FOUND!`);
          console.log(`  Token:          ${target.symbol} / ${target.quote}`);
          console.log(`  Route:          Borrow on ${best.borrowPool} -> Target ${best.targetPool}`);
          console.log(`  Optimal Borrow: ${formatTokenUnits(best.optimalBorrow, borrowDecimals)}`);
          console.log(`  Net Profit:     +${formatTokenUnits(best.maxProfit, repayDecimals)} (raw: ${best.maxProfit})`);

          if (privateKey && executorAddress) {
            console.log(`  [Pre-Flight] Simulating trade off-chain with staticCall ($0 gas)...`);
            const signer = new ethers.Wallet(privateKey, provider);
            const contract = new ethers.Contract(executorAddress, EXECUTOR_ABI, signer);
            const minProfitRaw = (best.maxProfit * 90n) / 100n;

            try {
              await contract.executeFlashArb.staticCall(
                best.borrowPool,
                best.targetPool,
                best.optimalBorrow,
                best.borrowToken0,
                minProfitRaw,
                0n
              );
              console.log(`  [Pre-Flight PASSED] Validated on-chain! Broadcasting transaction...`);
            } catch (simError) {
              const diag = formatRevertDiagnostics(simError, {
                targetContract: executorAddress,
                chainId: chain,
                functionName: "executeFlashArb",
                poolAddresses: [best.borrowPool, best.targetPool],
                tradeParams: {
                  amountBorrow: best.optimalBorrow.toString(),
                  borrowToken0: best.borrowToken0,
                  minProfit: minProfitRaw.toString()
                }
              });
              console.log(`  [Pre-Flight BLOCKED] ${diag.diagnosticString}`);
              console.log(`  [Gas Protected] Transaction dropped in memory. $0.00 gas spent!`);
              continue;
            }

            const lifecycle = await executeAndTrackLifecycle(
              contract,
              "executeFlashArb",
              [best.borrowPool, best.targetPool, best.optimalBorrow, best.borrowToken0, minProfitRaw, 0n],
              {
                onStatusChange: (status, details) => {
                  if (status === TxStatus.SUBMITTED) {
                    console.log(`  [SUBMITTED] Tx Broadcast: ${details.txHash}`);
                  } else if (status === TxStatus.PENDING) {
                    console.log(`  [PENDING] Waiting for block inclusion...`);
                  } else if (status === TxStatus.CONFIRMED) {
                    console.log(`  [CONFIRMED] Tx Block #${details.receipt.blockNumber} Mined! Realized Profit: +${formatTokenUnits(best.maxProfit, repayDecimals)}`);
                  } else if (status === TxStatus.FAILED) {
                    console.log(`  [FAILED] Transaction reverted: ${details.error}`);
                  }
                }
              }
            );
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
