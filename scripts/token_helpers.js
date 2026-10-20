import { ethers } from "ethers";

// In-memory cache for token decimals to avoid redundant RPC round-trips
const decimalsCache = new Map();

/**
 * Resolves whether the borrowed token is token0 of the borrow pool.
 * If configuredBorrowToken0 is explicitly provided (boolean), it is validated and returned.
 * Otherwise, queries token0() on-chain and compares against tokenAddress.
 * 
 * FAILS CLOSED: Throws an error on missing addresses, invalid provider, or RPC query failure.
 * Never silently defaults to true.
 *
 * @param {string} poolAddress - On-chain DEX pair address
 * @param {string} tokenAddress - Intended borrowed token address
 * @param {ethers.Provider} provider - Ethers JSON-RPC provider
 * @param {boolean|undefined|null} configuredBorrowToken0 - Explicit configuration if provided
 * @returns {Promise<boolean>}
 */
export async function resolveBorrowToken0(poolAddress, tokenAddress, provider, configuredBorrowToken0) {
  if (configuredBorrowToken0 !== undefined && configuredBorrowToken0 !== null) {
    if (typeof configuredBorrowToken0 === "boolean") {
      return configuredBorrowToken0;
    }
    if (typeof configuredBorrowToken0 === "string") {
      const lower = configuredBorrowToken0.toLowerCase().trim();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0") return false;
    }
  }

  if (!poolAddress || typeof poolAddress !== "string" || !ethers.isAddress(poolAddress)) {
    throw new Error(`[resolveBorrowToken0] Invalid pool address: ${poolAddress}`);
  }
  if (!tokenAddress || typeof tokenAddress !== "string" || !ethers.isAddress(tokenAddress)) {
    throw new Error(`[resolveBorrowToken0] Invalid token address: ${tokenAddress}`);
  }
  if (!provider) {
    throw new Error("[resolveBorrowToken0] Provider required for on-chain token0 resolution");
  }

  const checksummedPool = ethers.getAddress(poolAddress);
  const checksummedToken = ethers.getAddress(tokenAddress);

  const pairContract = new ethers.Contract(
    checksummedPool,
    ["function token0() view returns (address)"],
    provider
  );

  let t0;
  try {
    t0 = await pairContract.token0();
  } catch (err) {
    throw new Error(`[resolveBorrowToken0] Failed to retrieve valid token0 from pool ${checksummedPool}: ${err.message}`);
  }

  if (!t0 || !ethers.isAddress(t0)) {
    throw new Error(`[resolveBorrowToken0] Failed to retrieve valid token0 from pool ${checksummedPool}`);
  }

  return ethers.getAddress(t0).toLowerCase() === checksummedToken.toLowerCase();
}

/**
 * Retrieves the decimal count for an ERC-20 token, with in-memory caching.
 *
 * @param {string} tokenAddress - ERC20 token address
 * @param {ethers.Provider} provider - Ethers provider
 * @returns {Promise<number>}
 */
export async function getTokenDecimals(tokenAddress, provider) {
  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    return 18;
  }

  const checksummed = ethers.getAddress(tokenAddress);
  if (decimalsCache.has(checksummed)) {
    return decimalsCache.get(checksummed);
  }

  if (!provider) {
    return 18;
  }

  try {
    const erc20 = new ethers.Contract(
      checksummed,
      ["function decimals() view returns (uint8)"],
      provider
    );
    const dec = await erc20.decimals();
    const decimalsNum = Number(dec);
    decimalsCache.set(checksummed, decimalsNum);
    return decimalsNum;
  } catch {
    // If querying decimals fails, cache standard 18 but do not crash
    decimalsCache.set(checksummed, 18);
    return 18;
  }
}

/**
 * Formats a BigInt raw token amount into a human-readable decimal string.
 *
 * @param {bigint|string} amount - Raw token amount
 * @param {number} decimals - Token decimals (e.g. 6 for USDC, 8 for WBTC, 18 for WETH)
 * @returns {string}
 */
export function formatTokenUnits(amount, decimals = 18) {
  try {
    return ethers.formatUnits(amount, decimals);
  } catch {
    return "0.0";
  }
}

/**
 * Parses a decimal string amount into BigInt raw units using the token's decimal precision.
 *
 * @param {string} amountStr - Decimal string representation
 * @param {number} decimals - Token decimals
 * @returns {bigint}
 */
export function parseTokenUnits(amountStr, decimals = 18) {
  try {
    return ethers.parseUnits(String(amountStr || "0"), decimals);
  } catch {
    return 0n;
  }
}

const poolProtocolCache = new Map();

/**
 * Detects whether a liquidity pool is Uniswap V2 (constant product) or Uniswap V3 (concentrated liquidity).
 * Caches the protocol type to eliminate unnecessary RPC overhead.
 *
 * @param {string} poolAddress - On-chain liquidity pool address
 * @param {ethers.Provider} provider - Ethers JSON-RPC provider
 * @returns {Promise<{ type: "V2"|"V3"|"UNKNOWN", address?: string, token0?: string, token1?: string, reserve0?: bigint, reserve1?: bigint, sqrtPriceX96?: bigint, tick?: number, liquidity?: bigint }>}
 */
export async function getPoolProtocolInfo(poolAddress, provider) {
  if (!poolAddress || !ethers.isAddress(poolAddress) || !provider) {
    return { type: "UNKNOWN" };
  }

  const checksummed = ethers.getAddress(poolAddress);
  const cacheKey = checksummed.toLowerCase();
  const cached = poolProtocolCache.get(cacheKey);

  if (cached) {
    if (cached.type === "V2") {
      try {
        const v2 = new ethers.Contract(
          checksummed,
          ["function getReserves() view returns (uint112, uint112, uint32)"],
          provider
        );
        const res = await v2.getReserves();
        return {
          type: "V2",
          address: checksummed,
          token0: cached.token0,
          token1: cached.token1,
          reserve0: res[0],
          reserve1: res[1]
        };
      } catch {
        return { type: "UNKNOWN" };
      }
    } else if (cached.type === "V3") {
      try {
        const slot = await safeQuerySlot0(checksummed, provider);
        const v3 = new ethers.Contract(checksummed, ["function liquidity() view returns (uint128)"], provider);
        const liq = await v3.liquidity().catch(() => 0n);
        return {
          type: "V3",
          address: checksummed,
          token0: cached.token0,
          token1: cached.token1,
          sqrtPriceX96: slot[0],
          tick: Number(slot[1]),
          liquidity: liq
        };
      } catch {
        return { type: "UNKNOWN" };
      }
    }
    return cached;
  }

  // Not in cache: probe for Uniswap V2 interface first (getReserves)
  try {
    const v2 = new ethers.Contract(
      checksummed,
      [
        "function getReserves() view returns (uint112, uint112, uint32)",
        "function token0() view returns (address)",
        "function token1() view returns (address)"
      ],
      provider
    );
    const [res, t0, t1] = await Promise.all([
      v2.getReserves(),
      v2.token0(),
      v2.token1()
    ]);
    const info = {
      type: "V2",
      address: checksummed,
      token0: ethers.getAddress(t0),
      token1: ethers.getAddress(t1),
      reserve0: res[0],
      reserve1: res[1]
    };
    poolProtocolCache.set(cacheKey, { type: "V2", token0: info.token0, token1: info.token1 });
    return info;
  } catch {
    // getReserves failed, now probe for Uniswap V3 / Aerodrome Slipstream interface (slot0)
    try {
      const v3 = new ethers.Contract(
        checksummed,
        [
          "function token0() view returns (address)",
          "function token1() view returns (address)",
          "function liquidity() view returns (uint128)"
        ],
        provider
      );
      const [slot, t0, t1, liq] = await Promise.all([
        safeQuerySlot0(checksummed, provider),
        v3.token0(),
        v3.token1(),
        v3.liquidity().catch(() => 0n)
      ]);
      const info = {
        type: "V3",
        address: checksummed,
        token0: ethers.getAddress(t0),
        token1: ethers.getAddress(t1),
        sqrtPriceX96: slot[0],
        tick: Number(slot[1]),
        liquidity: liq
      };
      poolProtocolCache.set(cacheKey, { type: "V3", token0: info.token0, token1: info.token1 });
      return info;
    } catch {
      const info = { type: "UNKNOWN", address: checksummed };
      poolProtocolCache.set(cacheKey, info);
      return info;
    }
  }
}

/**
 * Safely queries slot0() across both Uniswap V3 (7 fields) and Aerodrome Slipstream (6 fields).
 */
async function safeQuerySlot0(poolAddress, provider) {
  try {
    const v3 = new ethers.Contract(
      poolAddress,
      ["function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)"],
      provider
    );
    return await v3.slot0();
  } catch {
    // Aerodrome Slipstream Concentrated Liquidity (6 return values)
    const slipstream = new ethers.Contract(
      poolAddress,
      ["function slot0() view returns (uint160, int24, uint16, uint16, uint16, bool)"],
      provider
    );
    return await slipstream.slot0();
  }
}


