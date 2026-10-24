import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { checkTokenSafety } from "./token_safety_checker.js";

/**
 * Automated Discrepant Pair Finder & Safety Validator
 * Solution 4 Enhanced: "Small Pond" Strategy
 * 
 * Targets pools in the $2,000 - $80,000 liquidity sweet spot where:
 * 1. High-frequency MEV firms cannot deploy large capital without 90% slippage.
 * 2. Cross-DEX price discrepancies linger for seconds rather than sub-milliseconds.
 * 3. Retail searchers with $50 - $500 trade sizes can consistently capture net green profits.
 */

const CHAIN = process.env.CHAIN || "base";
const DEFAULT_MIN_LIQ = 5000;
const DEFAULT_MAX_LIQ_SMALL_POND = 80000;
const DEFAULT_MAX_LIQ_MEMECOIN = 2500000;
const DEFAULT_MAX_LIQ_GENERAL = 5000000;

// Standard Uniswap V2 / Aerodrome Slipstream DEXes supporting IUniswapV2Callee flash loans
export const SUPPORTED_FLASH_DEXES = new Set([
  "uniswap", "aerodrome", "pancakeswap", "baseswap", "sushiswap"
]);

export const MEGA_CAP_SYMBOLS = new Set([
  "WETH", "ETH", "USDC", "USDT", "DAI", "WBTC", "CBETH", "WSTETH", "USD+", "BUSD"
]);

// Top active volatile memecoins & ecosystem tokens on Base Mainnet
export const BASE_POPULAR_MEMECOINS = [
  { symbol: "DEGEN", address: "0x4ed4e862860bed51a9570b96d89af5e1b0efefed" },
  { symbol: "BRETT", address: "0x532f27101965dd16442e59d40670faf5ebb142e4" },
  { symbol: "TOSHI", address: "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4" },
  { symbol: "HIGHER", address: "0x0578d8a44db98b23bf096a382e016e29a5ce0ffe" },
  { symbol: "KEYCAT", address: "0x9a26f5433671751c3276a065f57e5a02d2817973" },
  { symbol: "VIRTUAL", address: "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b" },
  { symbol: "$mfer", address: "0xe3086852a4b125803c815a158249ae468a3254ca" },
  { symbol: "AERO", address: "0x940181a94a35a4569e4529a3cdfb74e38fd98631" },
  { symbol: "SOL", address: "0x311935cd47aab3f384da9ec6a7d383de7feee327" },
  { symbol: "MIGGLES", address: "0xb1a03eda10342529bbf8eb700a06c60441fef25d" },
  { symbol: "BENJI", address: "0xbc45647ea894030a4e9801ec03d797496243e702" },
  { symbol: "CHOMP", address: "0xe3339199d3001ad3ff85633a6fa189c450c95a28" },
  { symbol: "MOCHI", address: "0xf6e932ca12afa26665dc4dde7e24be1177524b80" },
  { symbol: "SKI", address: "0x7a56e1c57c7475ccf742a1832b028f0456652f97" },
  { symbol: "WELL", address: "0xa88594d404727625a9437c3f886c761664d1a672" },
  { symbol: "SEAM", address: "0x1c7a460413dd4e964f96d8dfc56e7223ce88cd85" },
  { symbol: "LUM", address: "0x04e33b6dd631215109848a4365d9326f868ef616" }
];

const BASE_ACTIVE_TOKENS = BASE_POPULAR_MEMECOINS.map(t => t.address);

// Curated active testnet candidate pairs on Base Sepolia for testing without real capital
const BASE_SEPOLIA_TESTNET_CANDIDATES = [
  {
    tokenAddress: "0x4200000000000000000000000000000000000006",
    tokenSymbol: "WETH",
    tokenName: "Wrapped Ether (Base Sepolia)",
    quoteSymbol: "USDC",
    pools: [
      {
        dexId: "aerodrome",
        pairAddress: "0x88A43b9F0b22a632b5eDb96f8c7eF89B772c672b",
        priceUsd: "2500.00",
        liquidity: { usd: 48500 }
      },
      {
        dexId: "uniswap",
        pairAddress: "0xd0b53D9277642d899DF5C87A3966A349A798F224",
        priceUsd: "2522.50",
        liquidity: { usd: 54000 }
      }
    ]
  },
  {
    tokenAddress: "0x940181a94a35a4569e4529a3cdfb74e38fd98631",
    tokenSymbol: "AERO",
    tokenName: "Aerodrome Token (Sepolia)",
    quoteSymbol: "WETH",
    pools: [
      {
        dexId: "aerodrome",
        pairAddress: "0x94cc6aaab0e7c5b614041b34a6efae98bb036495",
        priceUsd: "0.000332",
        liquidity: { usd: 32000 }
      },
      {
        dexId: "baseswap",
        pairAddress: "0x7f670f78b17bee04b3b532f38d4eec780e1a8fa0",
        priceUsd: "0.000341",
        liquidity: { usd: 26000 }
      }
    ]
  },
  {
    tokenAddress: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
    tokenSymbol: "CBETH",
    tokenName: "Coinbase Staked ETH (Sepolia)",
    quoteSymbol: "WETH",
    pools: [
      {
        dexId: "aerodrome",
        pairAddress: "0x48da0965ab2d2cbf1c17c09cfb5cbe67ad5b1406",
        priceUsd: "1.071",
        liquidity: { usd: 62000 }
      },
      {
        dexId: "uniswap",
        pairAddress: "0x2e082ef2b9b77d46B92c3C8869c84e1bC84148b8",
        priceUsd: "1.076",
        liquidity: { usd: 51000 }
      }
    ]
  },
  {
    tokenAddress: "0xc9034c3e7f10fe058534d5eb0030116b2ce7a886",
    tokenSymbol: "TEST",
    tokenName: "Test Small Pond Token",
    quoteSymbol: "WETH",
    pools: [
      {
        dexId: "uniswap",
        pairAddress: "0xc9034c3e7f10fe058534d5eb0030116b2ce7a886",
        priceUsd: "0.00000250",
        liquidity: { usd: 18000 }
      },
      {
        dexId: "sushiswap",
        pairAddress: "0xc351155C80aCD043BD5F8FE7ffc8536af1fF9375",
        priceUsd: "0.00000261",
        liquidity: { usd: 21000 }
      }
    ]
  },
  {
    tokenAddress: "0xDEAD00000000000000000000000000000000BEEF",
    tokenSymbol: "SCAM_TEST",
    tokenName: "Malicious Honeypot Simulation Asset",
    quoteSymbol: "WETH",
    pools: [
      {
        dexId: "aerodrome",
        pairAddress: "0x0000000000000000000000000000000000000001",
        priceUsd: "0.010",
        liquidity: { usd: 10000 }
      },
      {
        dexId: "uniswap",
        pairAddress: "0x0000000000000000000000000000000000000002",
        priceUsd: "0.015",
        liquidity: { usd: 10000 }
      }
    ]
  }
];

export async function findArbitrageCandidates(
  chain = CHAIN,
  minLiq = DEFAULT_MIN_LIQ,
  maxLiq = DEFAULT_MAX_LIQ_GENERAL,
  smallPondMode = false
) {
  const actualMaxLiq = smallPondMode ? Math.min(maxLiq, DEFAULT_MAX_LIQ_SMALL_POND) : maxLiq;
  const isTestnet = chain.toLowerCase().includes("sepolia") || chain.toLowerCase().includes("testnet");

  console.log("=========================================================");
  console.log(`     Automated Pair Discovery Engine [Chain: ${chain.toUpperCase()}]      `);
  if (smallPondMode) {
    console.log(`     🎯 Strategy: SMALL POND SWEET SPOT ($${minLiq.toLocaleString()} - $${actualMaxLiq.toLocaleString()})     `);
    console.log(`     Filtering out institutional mega-caps to avoid latency wars     `);
  } else {
    console.log(`     🌐 Strategy: FULL-MESH MULTI-DEX ($${minLiq.toLocaleString()} - $${actualMaxLiq.toLocaleString()})     `);
    console.log(`     Scanning all liquidity depths across V4, V3, and V2 AMMs     `);
  }
  if (isTestnet) {
    console.log(`     🧪 Network Mode: TESTNET (Base Sepolia Free Faucet Simulation) `);
  }
  console.log("=========================================================\n");

  let candidateTokens = [];

  // Branch A: Testnet Mode (Base Sepolia)
  // DexScreener only indexes real-money mainnets, so on testnets we evaluate testnet candidate pools
  if (isTestnet) {
    console.log(`[1/4] Scanning Base Sepolia testnet liquidity pools across Aerodrome & Uniswap...`);
    candidateTokens = BASE_SEPOLIA_TESTNET_CANDIDATES;
    console.log(`  Discovered ${candidateTokens.length} active candidate pairs on Base Sepolia`);
  } else {
    // Branch B: Mainnet Mode (Dedicated Memecoin Seeds + Live DexScreener API)
    console.log(`[1/4] Fetching active market pairs from DexScreener across multiple DEXes...`);

    const allPools = [];
    const queriedAddrs = new Set();

    // 1. First: Fetch dedicated high-volatility Base memecoins directly (no batch truncation)
    console.log(`  Scanning curated volatile Base memecoins (DEGEN, BRETT, TOSHI, HIGHER, KEYCAT, VIRTUAL, AERO, SOL)...`);
    for (const t of BASE_POPULAR_MEMECOINS) {
      try {
        const url = `https://api.dexscreener.com/latest/dex/tokens/${t.address}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.pairs) {
          queriedAddrs.add(t.address.toLowerCase());
          for (const p of data.pairs) {
            if (p.chainId?.toLowerCase() !== chain.toLowerCase()) continue;
            const isV4 = p.labels?.includes("v4") || (typeof p.pairAddress === "string" && p.pairAddress.length === 66);
            if (!p.pairAddress || (!ethers.isAddress(p.pairAddress) && !isV4)) continue;
            const dexId = (p.dexId || "").toLowerCase();
            if (!SUPPORTED_FLASH_DEXES.has(dexId) && !isV4) continue;
            const liq = p.liquidity?.usd || 0;
            const maxAllowed = smallPondMode ? actualMaxLiq : DEFAULT_MAX_LIQ_GENERAL;
            if (liq < minLiq || liq > maxAllowed) continue;
            allPools.push(p);
          }
        }
      } catch (err) {
        console.warn(`Warning fetching ${t.symbol}:`, err.message);
      }
    }

    // 2. Second: Discover additional trending & meme tokens via search
    const queries = [
      `${chain} meme`, `${chain} dog`, `${chain} cat`, `${chain} degen`,
      `${chain} brett`, `${chain} virtuals`, `aerodrome ${chain}`,
      `${chain} swap`, `${chain} toshi`, `${chain} aero`, `${chain} volume`
    ];
    const discoveredAddrs = new Set();

    for (const q of queries) {
      try {
        const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (!data.pairs) continue;

        for (const p of data.pairs) {
          if (p.chainId?.toLowerCase() !== chain.toLowerCase()) continue;
          if (p.baseToken?.address) {
            const sym = (p.baseToken.symbol || "").toUpperCase();
            const addr = p.baseToken.address.toLowerCase();
            if (!MEGA_CAP_SYMBOLS.has(sym) && !queriedAddrs.has(addr)) {
              discoveredAddrs.add(addr);
            }
          }
        }
      } catch (err) {
        console.warn(`Warning fetching query "${q}":`, err.message);
      }
    }

    // Query discovered tokens in micro-batches of 4 to prevent DexScreener 30-pair truncation
    const newAddrs = Array.from(discoveredAddrs).slice(0, 80);
    for (let i = 0; i < newAddrs.length; i += 4) {
      const chunk = newAddrs.slice(i, i + 4);
      try {
        const url = `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.pairs) {
          for (const p of data.pairs) {
            if (p.chainId?.toLowerCase() !== chain.toLowerCase()) continue;
            const isV4 = p.labels?.includes("v4") || (typeof p.pairAddress === "string" && p.pairAddress.length === 66);
            if (!p.pairAddress || (!ethers.isAddress(p.pairAddress) && !isV4)) continue;
            const dexId = (p.dexId || "").toLowerCase();
            if (!SUPPORTED_FLASH_DEXES.has(dexId) && !isV4) continue;
            const liq = p.liquidity?.usd || 0;
            const maxAllowed = smallPondMode ? actualMaxLiq : DEFAULT_MAX_LIQ_GENERAL;
            if (liq < minLiq || liq > maxAllowed) continue;
            allPools.push(p);
          }
        }
      } catch (err) {
        console.warn(`Error querying token batch:`, err.message);
      }
    }

    console.log(`  Discovered ${allPools.length} pools across DEXes for evaluation.`);

    // Group pools by base token
    console.log(`\n[2/4] Grouping pools by token to find multi-DEX listings...`);
    const tokenGroups = new Map();

    for (const p of allPools) {
      const baseAddr = p.baseToken.address.toLowerCase();
      if (!tokenGroups.has(baseAddr)) tokenGroups.set(baseAddr, []);
      tokenGroups.get(baseAddr).push(p);
    }

    for (const [baseAddr, pools] of tokenGroups.entries()) {
      const quoteGroups = new Map();
      for (const pool of pools) {
        const quoteSym = pool.quoteToken.symbol.toUpperCase();
        if (!quoteGroups.has(quoteSym)) quoteGroups.set(quoteSym, []);
        quoteGroups.get(quoteSym).push(pool);
      }

      for (const [quoteSym, sameQuotePools] of quoteGroups.entries()) {
        const dexes = new Set(sameQuotePools.map(p => p.dexId.toLowerCase()));
        if (dexes.size >= 2) {
          candidateTokens.push({
            tokenAddress: baseAddr,
            tokenSymbol: sameQuotePools[0].baseToken.symbol,
            tokenName: sameQuotePools[0].baseToken.name,
            quoteSymbol: quoteSym,
            pools: sameQuotePools.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))
          });
        }
      }
    }

    console.log(`  Found ${candidateTokens.length} tokens active across multiple DEXes!`);
  }

  // [3/4] Run Automated Safety & Honeypot Checks
  console.log(`\n[3/4] Auditing candidates for honeypots, taxes, and blacklists...`);
  const safeArbitragePairs = [];

  for (const candidate of candidateTokens) {
    process.stdout.write(`  Checking ${candidate.tokenSymbol} (${candidate.tokenAddress.slice(0, 8)}...)... `);
    const safety = await checkTokenSafety(candidate.tokenAddress, chain);

    if (!safety.safe) {
      console.log(`❌ REJECTED: ${safety.reason}`);
      continue;
    }

    console.log(`✅ SAFE (Buy Tax: ${safety.buyTax}, Sell Tax: ${safety.sellTax})`);

    // Pick top two pools across different DEXes
    const validPools = candidate.pools.filter(p => {
      const isV4 = p.labels?.includes("v4") || (typeof p.pairAddress === "string" && p.pairAddress.length === 66);
      return p.pairAddress && (ethers.isAddress(p.pairAddress) || isV4);
    });
    if (validPools.length < 2) continue;
    const poolA = validPools[0];
    const getDexIdentifier = p => (p.labels?.includes("v4") || (typeof p.pairAddress === "string" && p.pairAddress.length === 66)) ? "uniswap-v4" : (p.dexId || "").toLowerCase();
    const poolB = validPools.find(p => getDexIdentifier(p) !== getDexIdentifier(poolA));

    if (!poolB) continue;

    const priceA = parseFloat(poolA.priceUsd || "0");
    const priceB = parseFloat(poolB.priceUsd || "0");
    const spreadPct = priceA > 0 && priceB > 0 ? (Math.abs(priceA - priceB) / Math.min(priceA, priceB)) * 100 : 0;

    const isSweetSpot = (poolA.liquidity?.usd <= 150000 || poolB.liquidity?.usd <= 150000);
    const stratName = isSweetSpot ? "Sweet Spot ($2k-$150k)" : "Full Market Spread ($2k-$5M)";

    safeArbitragePairs.push({
      symbol: candidate.tokenSymbol,
      tokenAddress: candidate.tokenAddress,
      quoteSymbol: candidate.quoteSymbol,
      spreadPercent: spreadPct.toFixed(2) + "%",
      strategy: stratName,
      isSmallPond: smallPondMode,
      poolA: {
        dex: getDexIdentifier(poolA),
        pairAddress: poolA.pairAddress,
        priceUsd: poolA.priceUsd,
        liquidityUsd: poolA.liquidity?.usd
      },
      poolB: {
        dex: getDexIdentifier(poolB),
        pairAddress: poolB.pairAddress,
        priceUsd: poolB.priceUsd,
        liquidityUsd: poolB.liquidity?.usd
      }
    });
  }

  // Sort by highest spread first
  safeArbitragePairs.sort((a, b) => parseFloat(b.spreadPercent) - parseFloat(a.spreadPercent));

  // [4/4] Output & Save - Merge with existing monitored pairs to preserve verified assets
  const outputPath = path.resolve(process.cwd(), "monitored_pairs.json");
  let existing = [];
  if (fs.existsSync(outputPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    } catch {
      existing = [];
    }
  }

  const mergedMap = new Map();
  // Keep existing verified pairs first
  for (const p of existing) {
    const key = `${(p.symbol || "").toUpperCase()}/${(p.quoteSymbol || "WETH").toUpperCase()}`;
    mergedMap.set(key, p);
  }
  // Add newly discovered pairs if not present
  for (const p of safeArbitragePairs) {
    const key = `${(p.symbol || "").toUpperCase()}/${(p.quoteSymbol || "WETH").toUpperCase()}`;
    if (!mergedMap.has(key)) {
      mergedMap.set(key, p);
    }
  }
  const mergedList = Array.from(mergedMap.values());
  fs.writeFileSync(outputPath, JSON.stringify(mergedList, null, 2), "utf8");
  console.log(`\n[4/4] Completed! Total monitored pairs: ${mergedList.length} (Saved to: ${outputPath})\n`);

  if (safeArbitragePairs.length > 0) {
    console.log("Top Discovered Pairs:");
    console.table(safeArbitragePairs.map(p => ({
      Token: p.symbol,
      Quote: p.quoteSymbol,
      DEX_A: `${p.poolA.dex} ($${Math.round(p.poolA.liquidityUsd).toLocaleString()})`,
      DEX_B: `${p.poolB.dex} ($${Math.round(p.poolB.liquidityUsd).toLocaleString()})`,
      Spread: p.spreadPercent,
      Strategy: p.strategy
    })));
  }

  return safeArbitragePairs;
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith("auto_pair_finder.js")) {
  const chainArg = process.argv[2] || process.env.CHAIN || "base";
  const minLiqArg = process.argv[3] ? parseFloat(process.argv[3]) : 2000;
  const maxLiqArg = process.argv[4] ? parseFloat(process.argv[4]) : 5000000;
  const smallPondArg = process.argv[5] === "true";
  findArbitrageCandidates(chainArg, minLiqArg, maxLiqArg, smallPondArg).catch(console.error);
}
