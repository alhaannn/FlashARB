import assert from "node:assert";
import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;

  console.log("=========================================================");
  console.log("   DEX-to-DEX Arbitrage Engine - End-to-End Simulation   ");
  console.log("=========================================================\n");

  const [owner, user] = await ethers.getSigners();
  console.log(`Deployer / Searcher Address: ${owner.address}`);

  // 1. Deploy WETH & USDT
  console.log("\n[1/4] Deploying Mock Tokens...");
  const MockWETH = await ethers.getContractFactory("MockWETH");
  const weth = await MockWETH.deploy();
  await weth.waitForDeployment();
  console.log(`  WETH deployed to: ${weth.target}`);

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdt = await MockERC20.deploy("Tether USD", "USDT", 18);
  await usdt.waitForDeployment();
  console.log(`  USDT deployed to: ${usdt.target}`);

  // Canonical sorting (token0 < token1)
  let token0, token1;
  if (weth.target.toLowerCase() < usdt.target.toLowerCase()) {
    token0 = weth;
    token1 = usdt;
    console.log("  Pair mapping: Token0 = WETH, Token1 = USDT");
  } else {
    token0 = usdt;
    token1 = weth;
    console.log("  Pair mapping: Token0 = USDT, Token1 = WETH");
  }

  // 2. Deploy Pairs for DEX A (Uniswap) and DEX B (SushiSwap)
  console.log("\n[2/4] Deploying DEX Liquidity Pools...");
  const MockPair = await ethers.getContractFactory("MockUniswapV2Pair");
  const pairA = await MockPair.deploy(token0.target, token1.target);
  await pairA.waitForDeployment();
  console.log(`  DEX A (Uniswap V2) Pair:   ${pairA.target}`);

  const pairB = await MockPair.deploy(token0.target, token1.target);
  await pairB.waitForDeployment();
  console.log(`  DEX B (SushiSwap V2) Pair: ${pairB.target}`);

  // 3. Deploy FlashArbExecutor
  console.log("\n[3/4] Deploying FlashArbExecutor Smart Contract...");
  const FlashArb = await ethers.getContractFactory("FlashArbExecutor");
  const executor = await FlashArb.deploy(weth.target);
  await executor.waitForDeployment();
  console.log(`  FlashArbExecutor deployed to: ${executor.target}`);

  // 4. Test Scenario 1: Profitable Arbitrage Opportunity
  console.log("\n[4/4] Executing Flash Swap Arbitrage Simulation...");
  console.log("  Setting up pool reserves:");
  
  // Pair A (Uniswap): 100 Token0 : 200,000 Token1 (Ratio: 1 : 2,000)
  const r0_A = ethers.parseEther("100");
  const r1_A = ethers.parseEther("200000");

  // Pair B (SushiSwap): 100 Token0 : 220,000 Token1 (Ratio: 1 : 2,200 -> 10% spread!)
  const r0_B = ethers.parseEther("100");
  const r1_B = ethers.parseEther("220000");

  await token0.mint(pairA.target, r0_A);
  await token1.mint(pairA.target, r1_A);
  await pairA.setReserves(r0_A, r1_A);

  await token0.mint(pairB.target, r0_B);
  await token1.mint(pairB.target, r1_B);
  await pairB.setReserves(r0_B, r1_B);

  console.log(`  - DEX A: 100.0 Token0 : 200,000.0 Token1 (Price: 2,000.00)`);
  console.log(`  - DEX B: 100.0 Token0 : 220,000.0 Token1 (Price: 2,200.00)`);
  console.log(`  Detected Spread: +10.0% on DEX B`);

  const initialRepayTokenBalance = await token1.balanceOf(owner.address);

  // Borrow 2 Token0 from Pair A
  const borrowAmount = ethers.parseEther("2");
  const borrowToken0 = true;
  const minProfit = ethers.parseEther("10"); // Minimum 10 Token1 profit
  const validatorTip = 0n; // 0 tip for this test

  console.log(`\n  Executing Flash Swap:`);
  console.log(`  1. Borrow ${ethers.formatEther(borrowAmount)} Token0 from DEX A with zero collateral`);
  console.log(`  2. Swap borrowed Token0 on DEX B for Token1`);
  console.log(`  3. Repay required Token1 to DEX A`);
  console.log(`  4. Retain net profit in owner's wallet`);

  const tx = await executor.executeFlashArb(
    pairA.target,
    pairB.target,
    borrowAmount,
    borrowToken0,
    minProfit,
    validatorTip
  );
  const receipt = await tx.wait();

  const finalRepayTokenBalance = await token1.balanceOf(owner.address);
  const profitEarned = finalRepayTokenBalance - initialRepayTokenBalance;

  console.log("\n  >>> ARBITRAGE TRANSACTION CONFIRMED! <<<");
  console.log(`  Transaction Hash: ${receipt.hash}`);
  console.log(`  Gas Used: ${receipt.gasUsed.toString()} units`);
  console.log(`  Net Profit Realized: +${ethers.formatEther(profitEarned)} Token1`);

  assert(profitEarned > minProfit, "Profit must exceed minimum threshold");

  // 5. Test Solution 1: Pre-Flight staticCall Zero-Gas Protection
  console.log("\n  [Solution 1] Testing Pre-Flight staticCall Zero-Gas Protection:");
  // Set equal prices on both (0% spread)
  await pairB.setReserves(r0_A, r1_A);
  
  let preflightCaught = false;
  try {
    console.log("  Step 1: Running off-chain static simulation against pool reserves ($0 gas)...");
    await executor.executeFlashArb.staticCall(
      pairA.target,
      pairB.target,
      borrowAmount,
      borrowToken0,
      minProfit,
      validatorTip
    );
  } catch (err) {
    preflightCaught = true;
    console.log(`  >>> [PRE-FLIGHT BLOCKED] Simulation rejected trade: ${err.message.split("\n")[0]}`);
    console.log(`  >>> [100% GAS SAVED] Transaction dropped in local memory! $0.00 gas burned on-chain.`);
  }
  assert(preflightCaught, "Pre-flight staticCall must intercept unprofitable trade off-chain");

  // Confirm contract on-chain revert as secondary safeguard
  console.log("\n  Step 2: Verifying On-Chain Inversion Guard (Secondary Safety Net):");
  let onChainRevert = false;
  try {
    await executor.executeFlashArb(
      pairA.target,
      pairB.target,
      borrowAmount,
      borrowToken0,
      minProfit,
      validatorTip
    );
  } catch (err) {
    onChainRevert = true;
    console.log(`  [OK] Contract successfully reverted: ${err.message.split("\n")[0]}`);
  }
  assert(onChainRevert, "Contract must revert when spread is unprofitable");

  console.log("\n=========================================================");
  console.log("   All Core Arbitrage Mechanics Verified Successfully!   ");
  console.log("=========================================================\n");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
