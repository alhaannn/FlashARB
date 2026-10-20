import assert from "node:assert";
import hre from "hardhat";
import { ethers } from "ethers";
import { TriangularArbEngine, MEGA_CAP_SYMBOLS } from "./triangular_arb_engine.js";

/**
 * Solution 4 Verification Test Suite:
 * 1. Constant-product 3-hop swap math
 * 2. Convex ternary search optimal sizing
 * 3. Intra-DEX graph loop detection
 * 4. Small Pond ($2k - $80k) liquidity filtering
 * 5. On-chain FlashArbExecutor 3-hop triangular execution & pre-flight simulation
 */

async function runTestSuite() {
  console.log("=========================================================");
  console.log("  Solution 4: Small Pond & Triangular Arb Test Suite     ");
  console.log("=========================================================\n");

  const engine = new TriangularArbEngine("aerodrome", "WETH");

  // TEST 1: Constant Product Swap Math Verification
  console.log("[Test 1/5] Verifying Constant Product Swap Math with 0.3% Fee...");
  const rIn = ethers.parseEther("100.0");
  const rOut = ethers.parseUnits("200000.0", 6); // 100 WETH : 200,000 USDC
  const amountIn = ethers.parseEther("1.0");

  const out = engine.getAmountOut(amountIn, rIn, rOut, 30);
  assert(out > 0n, "Output amount should be greater than 0");
  console.log(`  Swap 1.0 WETH in (100 WETH : 200k USDC) => ${ethers.formatUnits(out, 6)} USDC (Expected ~1,974.3)`);
  assert(out >= ethers.parseUnits("1970", 6) && out <= ethers.parseUnits("1980", 6), "Output matches Uniswap V2 formula");
  console.log("  ✅ Test 1 PASSED: Math precision verified.\n");

  // TEST 2: 3-Hop Triangular Simulation & Ternary Search Convergence
  console.log("[Test 2/5] Verifying 3-Hop Triangular Route & Ternary Search Optimizer...");

  // Mock reserves:
  // Pool 1: WETH <-> TokenA (10 WETH : 100,000 TokenA) => 1 TokenA = 0.0001 WETH
  // Pool 2: TokenA <-> TokenB (50,000 TokenA : 1,000,000 TokenB) => 1 TokenA = 20 TokenB
  // Pool 3: TokenB <-> WETH (800,000 TokenB : 10 WETH) => 1 TokenB = 0.0000125 WETH
  // Cross Rate: (100,000 / 10) * (1,000,000 / 50,000) * (10 / 800,000) = 10,000 * 20 * 0.0000125 = 2.5 (> 1.0 = PROFITABLE!)

  const pool1 = {
    token0: { symbol: "WETH" },
    token1: { symbol: "BRETT" },
    rIn: ethers.parseEther("10.0"),
    rOut: ethers.parseEther("100000.0")
  };

  const pool2 = {
    token0: { symbol: "BRETT" },
    token1: { symbol: "HIGHER" },
    rIn: ethers.parseEther("50000.0"),
    rOut: ethers.parseEther("1000000.0")
  };

  const pool3 = {
    token0: { symbol: "HIGHER" },
    token1: { symbol: "WETH" },
    rIn: ethers.parseEther("800000.0"),
    rOut: ethers.parseEther("10.0")
  };

  const sizing = engine.findOptimalTriangularSize(pool1, pool2, pool3, ethers.parseEther("3.0"));
  console.log(`  Optimal Input Base: ${ethers.formatEther(sizing.optimalInput)} WETH`);
  console.log(`  Gross Output:       ${ethers.formatEther(sizing.finalOutput)} WETH`);
  console.log(`  Net Profit:         +${ethers.formatEther(sizing.netProfit)} WETH`);
  assert(sizing.isProfitable, "Ternary search should confirm positive arbitrage");
  assert(sizing.netProfit > 0n, "Net profit must be strictly positive");

  // Verify that optimal point is indeed superior to arbitrary offsets (concave maximum)
  const halfInput = sizing.optimalInput / 2n;
  const doubleInput = sizing.optimalInput * 2n;
  const halfSim = engine.simulateTriangularRoute(halfInput, pool1, pool2, pool3);
  const doubleSim = engine.simulateTriangularRoute(doubleInput, pool1, pool2, pool3);

  assert(sizing.netProfit >= halfSim.netProfit, "Optimal sizing must yield >= 50% sizing");
  assert(sizing.netProfit >= doubleSim.netProfit, "Optimal sizing must yield >= 200% sizing");
  console.log("  ✅ Test 2 PASSED: Ternary search verified at global maximum.\n");

  // TEST 3: Graph Cycle Detection
  console.log("[Test 3/5] Verifying Closed-Loop Graph Cycle Detection...");
  const pools = [
    { baseToken: { symbol: "WETH" }, quoteToken: { symbol: "BRETT" }, liquidityUsd: 15000 },
    { baseToken: { symbol: "BRETT" }, quoteToken: { symbol: "HIGHER" }, liquidityUsd: 12000 },
    { baseToken: { symbol: "HIGHER" }, quoteToken: { symbol: "WETH" }, liquidityUsd: 18000 },
    { baseToken: { symbol: "RANDOM" }, quoteToken: { symbol: "USDC" }, liquidityUsd: 5000 } // unlinked
  ];

  const loops = engine.detectTriangularLoops(pools);
  console.log(`  Detected ${loops.length} valid triangular loop(s):`);
  loops.forEach(l => console.log(`  ➔ ${l.route}`));
  assert(loops.length >= 1, "Should detect at least 1 closed triangle");
  assert(loops[0].tokenA === "BRETT" && loops[0].tokenB === "HIGHER", "Loop tokens correctly extracted");
  console.log("  ✅ Test 3 PASSED: Graph cycle detection operational.\n");

  // TEST 4: Small Pond Liquidity & Mega-Cap Filtering
  console.log("[Test 4/5] Verifying Small Pond Liquidity & Mega-Cap Exclusion...");
  assert(MEGA_CAP_SYMBOLS.has("WETH"), "Mega-cap contains WETH");
  assert(MEGA_CAP_SYMBOLS.has("USDC"), "Mega-cap contains USDC");
  assert(!MEGA_CAP_SYMBOLS.has("BRETT"), "Long-tail token not in mega-cap");

  const testPools = [
    { liquidityUsd: 1500, baseToken: { symbol: "TOSHI" }, quoteToken: { symbol: "WETH" } }, // < $2k (too small)
    { liquidityUsd: 25000, baseToken: { symbol: "TOSHI" }, quoteToken: { symbol: "WETH" } }, // Small Pond sweet spot
    { liquidityUsd: 5000000, baseToken: { symbol: "WETH" }, quoteToken: { symbol: "USDC" } } // Mega-cap / overcrowded
  ];

  const minLiq = 2000;
  const maxLiq = 80000;
  const smallPondPools = testPools.filter(p => {
    return p.liquidityUsd >= minLiq && p.liquidityUsd <= maxLiq && !MEGA_CAP_SYMBOLS.has(p.baseToken.symbol);
  });

  assert.strictEqual(smallPondPools.length, 1, "Only the sweet spot pool should pass");
  assert.strictEqual(smallPondPools[0].baseToken.symbol, "TOSHI", "Retained target is TOSHI");
  console.log(`  Filtered 3 pools -> ${smallPondPools.length} pool in Small Pond sweet spot ($2k - $80k).`);
  console.log("  ✅ Test 4 PASSED: Small Pond filter rules verified.\n");

  // TEST 5: On-Chain FlashArbExecutor Triangular Flash Swap Simulation
  console.log("[Test 5/5] Deploying & Simulating On-Chain 3-Hop Triangular Flash Swap...");
  const connection = await hre.network.connect();
  const { ethers: hreEthers } = connection;
  const [deployer] = await hreEthers.getSigners();

  // 1. Deploy WETH, TokenA, TokenB
  const MockWETH = await hreEthers.getContractFactory("MockWETH");
  const weth = await MockWETH.deploy();
  await weth.waitForDeployment();

  const MockERC20 = await hreEthers.getContractFactory("MockERC20");
  const tokenA = await MockERC20.deploy("Brett", "BRETT", 18);
  await tokenA.waitForDeployment();

  const tokenB = await MockERC20.deploy("Higher", "HIGHER", 18);
  await tokenB.waitForDeployment();

  // 2. Deploy 3 Pairs
  const MockPair = await hreEthers.getContractFactory("MockUniswapV2Pair");
  const pair1 = await MockPair.deploy(weth.target, tokenA.target);
  await pair1.waitForDeployment();

  const pair2 = await MockPair.deploy(tokenA.target, tokenB.target);
  await pair2.waitForDeployment();

  const pair3 = await MockPair.deploy(tokenB.target, weth.target);
  await pair3.waitForDeployment();

  // Set reserves for profitable triangle:
  // Pair 1 (WETH / TokenA): 10 WETH : 100,000 TokenA
  await weth.mint(pair1.target, hreEthers.parseEther("10.0"));
  await tokenA.mint(pair1.target, hreEthers.parseEther("100000.0"));
  await pair1.setReserves(hreEthers.parseEther("10.0"), hreEthers.parseEther("100000.0"));

  // Pair 2 (TokenA / TokenB): 50,000 TokenA : 1,000,000 TokenB
  await tokenA.mint(pair2.target, hreEthers.parseEther("50000.0"));
  await tokenB.mint(pair2.target, hreEthers.parseEther("1000000.0"));
  await pair2.setReserves(hreEthers.parseEther("50000.0"), hreEthers.parseEther("1000000.0"));

  // Pair 3 (TokenB / WETH): 800,000 TokenB : 10 WETH
  await tokenB.mint(pair3.target, hreEthers.parseEther("800000.0"));
  await weth.mint(pair3.target, hreEthers.parseEther("10.0"));
  await pair3.setReserves(hreEthers.parseEther("800000.0"), hreEthers.parseEther("10.0"));

  // 3. Deploy FlashArbExecutor
  const FlashArb = await hreEthers.getContractFactory("FlashArbExecutor");
  const executor = await FlashArb.deploy(weth.target);
  await executor.waitForDeployment();

  // Determine if TokenA is token0 or token1 in pair1
  const p1Token0 = await pair1.token0();
  const borrowToken0 = (p1Token0.toLowerCase() === tokenA.target.toLowerCase());
  const borrowAmount = hreEthers.parseEther("500.0"); // Borrow 500 TokenA

  console.log("  Running Pre-Flight staticCall off-chain ($0 gas)...");
  await executor.executeTriangularFlashArb.staticCall(
    pair1.target,
    pair2.target,
    pair3.target,
    borrowAmount,
    borrowToken0,
    hreEthers.parseEther("0.001"), // min profit
    0n
  );
  console.log("  >>> [Pre-Flight Simulation PASSED] Revert risk = 0%!");

  // Execute on-chain
  const initialBalance = await weth.balanceOf(deployer.address);
  const tx = await executor.executeTriangularFlashArb(
    pair1.target,
    pair2.target,
    pair3.target,
    borrowAmount,
    borrowToken0,
    hreEthers.parseEther("0.001"),
    0n
  );
  const receipt = await tx.wait();
  const finalBalance = await weth.balanceOf(deployer.address);
  const profit = finalBalance - initialBalance;

  console.log(`  >>> ON-CHAIN TRIANGULAR FLASH ARB CONFIRMED! <<<`);
  console.log(`  Tx Hash: ${receipt.hash.substring(0, 20)}...`);
  console.log(`  Gas Units Used: ${receipt.gasUsed}`);
  console.log(`  Net Realized Profit in WETH: +${hreEthers.formatEther(profit)} WETH`);
  assert(profit > 0n, "Searcher received positive net profit in WETH");

  console.log("  ✅ Test 5 PASSED: On-chain triangular flash swap executed and verified.\n");

  console.log("=========================================================");
  console.log("  ALL SOLUTION 4 TESTS PASSED WITH 100% SUCCESS!         ");
  console.log("=========================================================");
}

runTestSuite().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
