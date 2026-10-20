import { ethers } from "ethers";
import { findOptimalBorrowAmount } from "./math_optimizer.js";
import { FlashbotsBundleEngine } from "./flashbots_bundle_engine.js";
import "dotenv/config";

/**
 * Live Arbitrage Scanner & Private Bundle Dispatcher
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
  console.log("    Real-Time DEX Arbitrage Scanner (Private Bundles)    ");
  console.log("=========================================================\n");

  const rpcUrl = process.env.RPC_URL || "https://rpc.ankr.com/eth";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const pairAAddress = process.env.PAIR_A; // e.g. Uniswap V2 WETH/USDT
  const pairBAddress = process.env.PAIR_B; // e.g. SushiSwap WETH/USDT
  const executorAddress = process.env.EXECUTOR_CONTRACT;

  if (!pairAAddress || !pairBAddress) {
    console.log("No live pair addresses provided in .env.");
    console.log("Please copy .env.example to .env and configure your pair addresses.");
    console.log("For a dry run simulation, run: node scripts/run_test_suite.js");
    return;
  }

  const pairA = new ethers.Contract(pairAAddress, PAIR_ABI, provider);
  const pairB = new ethers.Contract(pairBAddress, PAIR_ABI, provider);

  console.log(`Monitoring DEX Pair A: ${pairAAddress}`);
  console.log(`Monitoring DEX Pair B: ${pairBAddress}`);
  console.log(`Polling for price spreads on new blocks...\n`);

  provider.on("block", async (blockNumber) => {
    try {
      const [resA, resB] = await Promise.all([
        pairA.getReserves(),
        pairB.getReserves()
      ]);

      const r0_A = BigInt(resA.reserve0);
      const r1_A = BigInt(resA.reserve1);
      const r0_B = BigInt(resB.reserve0);
      const r1_B = BigInt(resB.reserve1);

      // 1. Check Direction 1: Borrow Token0 on A -> Sell on B
      const dir1 = findOptimalBorrowAmount(r0_A, r1_A, r0_B, r1_B);

      // 2. Check Direction 2: Borrow Token0 on B -> Sell on A
      const dir2 = findOptimalBorrowAmount(r0_B, r1_B, r0_A, r1_A);

      const best = dir1.maxProfit > dir2.maxProfit ? { ...dir1, borrowPool: pairAAddress, targetPool: pairBAddress } : { ...dir2, borrowPool: pairBAddress, targetPool: pairAAddress };

      if (best.isProfitable) {
        console.log(`[Block #${blockNumber}] 🔥 ARBITRAGE DETECTED!`);
        console.log(`  Borrow Pool:    ${best.borrowPool}`);
        console.log(`  Target Pool:    ${best.targetPool}`);
        console.log(`  Optimal Borrow: ${ethers.formatEther(best.optimalBorrow)}`);
        console.log(`  Net Profit:     ${ethers.formatEther(best.maxProfit)}`);

        // If private key and executor are configured, trigger private Flashbots bundle
        if (process.env.PRIVATE_KEY && executorAddress) {
          const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
          const authSigner = ethers.Wallet.createRandom(); // random identity for header
          const engine = new FlashbotsBundleEngine(provider, signer, authSigner, process.env.FLASHBOTS_RELAY);

          // Pre-Flight staticCall check ($0 gas)
          try {
            const contract = new ethers.Contract(executorAddress, EXECUTOR_ABI, signer);
            await contract.executeFlashArb.staticCall(
              best.borrowPool,
              best.targetPool,
              best.optimalBorrow,
              true,
              (best.maxProfit * 95n) / 100n,
              ethers.parseEther("0.005")
            );
            console.log(`  [Pre-Flight PASSED] Validated on-chain. Building private bundle...`);

            const targetBlock = blockNumber + 1;
            const signedTx = await engine.buildAndSignArbTx(
              executorAddress,
              EXECUTOR_ABI,
              {
                poolBorrow: best.borrowPool,
                poolTarget: best.targetPool,
                amountBorrow: best.optimalBorrow,
                borrowToken0: true,
                minProfit: (best.maxProfit * 95n) / 100n, // 5% slippage tolerance
                validatorTip: ethers.parseEther("0.005") // 0.005 ETH miner tip
              }
            );

            // Simulate bundle with Flashbots relay
            const sim = await engine.simulateBundle([signedTx], targetBlock);
            if (sim.success) {
              await engine.sendBundle([signedTx], targetBlock);
            }
          } catch (simError) {
            console.log(`  [Pre-Flight BLOCKED] staticCall reverted: ${simError.reason || simError.message}. Zero gas burned!`);
          }
        }
      } else {
        process.stdout.write(`[Block #${blockNumber}] Scanning... No profitable spread\r`);
      }
    } catch (err) {
      console.error(`Error scanning block #${blockNumber}:`, err.message);
    }
  });
}

main().catch(console.error);
