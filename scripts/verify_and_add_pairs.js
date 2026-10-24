import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { checkTokenSafety } from "./token_safety_checker.js";
import { getPoolProtocolInfo } from "./token_helpers.js";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://mainnet.base.org";
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Supported flash loan executor DEXes on Base
const SUPPORTED_FLASH_DEXES = new Set([
  "uniswap", "aerodrome", "aero", "pancakeswap", "baseswap", "sushiswap"
]);

const CSV_FILE = "dexscreener_pairs_rank_1_to_283_skip_100_199_200.csv";
const PAIRS_FILE = "monitored_pairs.json";

function normalizeDex(dexId) {
  const d = (dexId || "").toLowerCase();
  if (d === "aero") return "aerodrome";
  return d;
}

function normalizeQuote(quoteSymbol) {
  const q = (quoteSymbol || "WETH").toUpperCase();
  if (q === "ETH") return "WETH";
  if (q === "USDBC") return "USDC";
  return q;
}

async function main() {
  console.log("=================================================================");
  console.log("  🔍 DEEP VERIFICATION & INGESTION ENGINE FOR BASE DEX PAIRS     ");
  console.log("=================================================================\n");

  if (!fs.existsSync(CSV_FILE)) {
    console.error("CSV file not found:", CSV_FILE);
    process.exit(1);
  }

  // 1. Read CSV and extract candidate symbols
  const csvLines = fs.readFileSync(CSV_FILE, "utf8").split("\n").filter(Boolean);
  const candidateSymbols = new Set();

  for (let i = 1; i < csvLines.length; i++) {
    const parts = csvLines[i].split(",");
    if (parts.length >= 2) {
      const pairName = parts[1].trim();
      const [base] = pairName.split("/");
      if (base) {
        const cleanBase = base.trim().toUpperCase();
        if (cleanBase && cleanBase !== "WETH" && cleanBase !== "ETH" && cleanBase !== "USDC" && cleanBase !== "USDBC") {
          candidateSymbols.add(cleanBase);
        }
      }
    }
  }

  console.log(`Extracted ${candidateSymbols.size} candidate token symbols from CSV.`);

  // Load existing monitored pairs
  let existingPairs = [];
  if (fs.existsSync(PAIRS_FILE)) {
    try {
      existingPairs = JSON.parse(fs.readFileSync(PAIRS_FILE, "utf8"));
    } catch {
      existingPairs = [];
    }
  }

  const existingSymbols = new Set(existingPairs.map(p => `${p.symbol.toUpperCase()}/${normalizeQuote(p.quoteSymbol)}`));
  console.log(`Currently monitoring ${existingPairs.length} pairs.`);

  const verifiedNewPairs = [];

  for (const sym of Array.from(candidateSymbols)) {
    console.log(`\n-----------------------------------------------------------`);
    console.log(`🔎 Auditing candidate: ${sym}...`);

    try {
      // Query DexScreener search for token
      const searchUrl = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(sym)}`;
      const res = await fetch(searchUrl);
      if (!res.ok) {
        console.log(`  ⚠ DexScreener query failed for ${sym}`);
        continue;
      }
      const data = await res.json();
      if (!data.pairs || data.pairs.length === 0) {
        console.log(`  ⚠ No pairs found on DexScreener for ${sym}`);
        continue;
      }

      // Filter for Base chain, matching symbol, supported DEX, >= $2,000 liquidity
      const basePools = data.pairs.filter(p => {
        const isV4 = p.labels?.includes("v4") || (p.pairAddress && p.pairAddress.length === 66);
        return (
          p.chainId?.toLowerCase() === "base" &&
          p.baseToken?.symbol?.toUpperCase() === sym &&
          SUPPORTED_FLASH_DEXES.has((p.dexId || "").toLowerCase()) &&
          p.pairAddress &&
          (ethers.isAddress(p.pairAddress) || isV4) &&
          (p.liquidity?.usd || 0) >= 2000
        );
      });

      if (basePools.length < 2) {
        console.log(`  ⚠ Insufficient multi-DEX pools for ${sym} on Base (found ${basePools.length} supported pools with >=$2k liq).`);
        continue;
      }

      // Group pools by exact base token address to prevent pairing different tokens that share the same ticker symbol
      const tokenAddressGroups = new Map();
      for (const pool of basePools) {
        const bAddr = (pool.baseToken?.address || "").toLowerCase();
        if (!bAddr) continue;
        if (!tokenAddressGroups.has(bAddr)) tokenAddressGroups.set(bAddr, []);
        tokenAddressGroups.get(bAddr).push(pool);
      }

      for (const [tokenAddress, tokenPools] of tokenAddressGroups.entries()) {
        if (tokenPools.length < 2) continue;

        // Group pools by normalized quote token (e.g. WETH, USDC)
        const quoteGroups = new Map();
        for (const pool of tokenPools) {
          const qSym = normalizeQuote(pool.quoteToken?.symbol);
          if (!quoteGroups.has(qSym)) quoteGroups.set(qSym, []);
          quoteGroups.get(qSym).push(pool);
        }

        for (const [quoteSym, sameQuotePools] of quoteGroups.entries()) {
          const pairKey = `${sym}/${quoteSym}`;
          if (existingSymbols.has(pairKey)) {
            console.log(`  ℹ ${pairKey} already in monitored list. Skipping.`);
            continue;
          }

          // Find at least 2 pools on different DEXes (distinguish Uniswap V4 from V3/V2)
          const uniqueDexMap = new Map();
          for (const p of sameQuotePools) {
            const isV4 = p.labels?.includes("v4") || (p.pairAddress && p.pairAddress.length === 66);
            const normDex = isV4 ? "uniswap-v4" : normalizeDex(p.dexId);
            if (!uniqueDexMap.has(normDex)) {
              uniqueDexMap.set(normDex, p);
            }
          }

          if (uniqueDexMap.size < 2) {
            continue;
          }

        const dexList = Array.from(uniqueDexMap.values()).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
        const poolA_Cand = dexList[0];
        const poolB_Cand = dexList[1];

        const isV4_A = poolA_Cand.labels?.includes("v4") || (poolA_Cand.pairAddress && poolA_Cand.pairAddress.length === 66);
        const isV4_B = poolB_Cand.labels?.includes("v4") || (poolB_Cand.pairAddress && poolB_Cand.pairAddress.length === 66);

        const dexAName = isV4_A ? "uniswap-v4" : normalizeDex(poolA_Cand.dexId);
        const dexBName = isV4_B ? "uniswap-v4" : normalizeDex(poolB_Cand.dexId);

        console.log(`  ✨ Found candidate route for ${pairKey}: ${dexAName} ($${(poolA_Cand.liquidity?.usd || 0).toLocaleString()}) vs ${dexBName} ($${(poolB_Cand.liquidity?.usd || 0).toLocaleString()})`);

        // Run Security & Honeypot Audit
        process.stdout.write(`  🛡️ Running on-chain honeypot & tax audit for ${tokenAddress}... `);
        const safety = await checkTokenSafety(tokenAddress, "base");

        if (!safety.safe) {
          console.log(`❌ REJECTED: ${safety.reason}`);
          continue;
        }
        console.log(`✅ SAFE (Buy: ${safety.buyTax}, Sell: ${safety.sellTax})`);

        // Verify pool smart contracts on-chain
        process.stdout.write(`  ⚡ Verifying smart contracts on Base on-chain... `);
        let infoA, infoB;
        try {
          [infoA, infoB] = await Promise.all([
            getPoolProtocolInfo(poolA_Cand.pairAddress, provider),
            getPoolProtocolInfo(poolB_Cand.pairAddress, provider)
          ]);
        } catch (contractErr) {
          console.log(`❌ Pool query failed: ${contractErr.message}`);
          continue;
        }

        const feeA = infoA.type === "V2" ? (infoA.feeBps || 30) / 100 : (infoA.feeMillionths || 3000) / 10000;
        const feeB = infoB.type === "V2" ? (infoB.feeBps || 30) / 100 : (infoB.feeMillionths || 3000) / 10000;
        const combinedFee = feeA + feeB;

        const priceA = parseFloat(poolA_Cand.priceUsd || "0");
        const priceB = parseFloat(poolB_Cand.priceUsd || "0");
        const spreadPct = priceA > 0 && priceB > 0 ? (Math.abs(priceA - priceB) / Math.min(priceA, priceB)) * 100 : 0;
        const netSpread = spreadPct - combinedFee;

        console.log(`✅ VERIFIED!`);
        console.log(`     Pool A (${dexAName}): ${infoA.type} | Fee: ${feeA.toFixed(2)}% | Address: ${poolA_Cand.pairAddress}`);
        console.log(`     Pool B (${dexBName}): ${infoB.type} | Fee: ${feeB.toFixed(2)}% | Address: ${poolB_Cand.pairAddress}`);
        console.log(`     Gross Spread: ${spreadPct.toFixed(2)}% | Combined Fee: ${combinedFee.toFixed(2)}% | Net: ${netSpread.toFixed(2)}%`);

        const isSweetSpot = (poolA_Cand.liquidity?.usd <= 150000 || poolB_Cand.liquidity?.usd <= 150000);
        const stratName = isSweetSpot ? "Volatile Memecoin Sweet Spot ($2k-$150k)" : "Liquid Multi-DEX Spread";

        const newPair = {
          symbol: sym,
          tokenAddress,
          quoteSymbol: quoteSym,
          spreadPercent: `${spreadPct.toFixed(2)}%`,
          strategy: stratName,
          isSmallPond: isSweetSpot,
          poolA: {
            dex: dexAName,
            pairAddress: infoA.type === "V4" ? poolA_Cand.pairAddress : ethers.getAddress(poolA_Cand.pairAddress),
            poolKey: infoA.type === "V4" ? infoA.poolKey : undefined,
            priceUsd: poolA_Cand.priceUsd,
            liquidityUsd: poolA_Cand.liquidity?.usd || 0,
            feePercent: `${feeA.toFixed(2)}%`,
            type: infoA.type
          },
          poolB: {
            dex: dexBName,
            pairAddress: infoB.type === "V4" ? poolB_Cand.pairAddress : ethers.getAddress(poolB_Cand.pairAddress),
            poolKey: infoB.type === "V4" ? infoB.poolKey : undefined,
            priceUsd: poolB_Cand.priceUsd,
            liquidityUsd: poolB_Cand.liquidity?.usd || 0,
            feePercent: `${feeB.toFixed(2)}%`,
            type: infoB.type
          },
          combinedFeePercent: `${combinedFee.toFixed(2)}%`,
          netSpreadPercent: `${netSpread >= 0 ? "+" : ""}${netSpread.toFixed(2)}%`,
          isProfitable: netSpread > 0,
          decisionReason: netSpread > 0
            ? `Verified safe candidate: Gross spread (${spreadPct.toFixed(2)}%) exceeds true LP fees (${combinedFee.toFixed(2)}%). Ready for sizing optimization.`
            : `Sub-fee loss: Gross spread (${spreadPct.toFixed(2)}%) is less than DEX swap fees (${combinedFee.toFixed(2)}%: ${dexAName} ${feeA.toFixed(2)}% + ${dexBName} ${feeB.toFixed(2)}%). Round-trip would lose ${Math.abs(netSpread).toFixed(2)}%. Capital protected.`
        };

        verifiedNewPairs.push(newPair);
        existingSymbols.add(pairKey);
        break; // Keep best quote pair per symbol to prevent duplicates
      }
      break;
    }
  } catch (err) {
      console.warn(`Error auditing ${sym}:`, err.message);
    }
  }

  console.log("\n=================================================================");
  console.log(`  🎉 AUDIT FINISHED: Found ${verifiedNewPairs.length} verified safe new pairs!`);
  console.log("=================================================================");

  if (verifiedNewPairs.length > 0) {
    const updatedList = [...existingPairs, ...verifiedNewPairs];
    fs.writeFileSync(PAIRS_FILE, JSON.stringify(updatedList, null, 2), "utf8");
    if (fs.existsSync("flasharb/monitored_pairs.json")) {
      fs.writeFileSync("flasharb/monitored_pairs.json", JSON.stringify(updatedList, null, 2), "utf8");
    }
    console.log(`Successfully updated ${PAIRS_FILE}! Total monitored pairs now: ${updatedList.length}`);
  }
}

main().catch(console.error);
