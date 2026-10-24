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
  if (!tokenAddress || tokenAddress === ethers.ZeroAddress || tokenAddress === "0x0000000000000000000000000000000000000000" || !ethers.isAddress(tokenAddress)) {
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
 * Queries Uniswap V4 PoolManager directly via extsload to fetch real-time slot0 and liquidity.
 *
 * @param {string|object} poolKeyOrId - V4 PoolKey struct or 32-byte poolId
 * @param {ethers.Provider} provider - Ethers JSON-RPC provider
 * @param {string} poolManagerAddress - Canonical PoolManager address
 */
export async function getV4PoolProtocolInfo(poolKeyOrId, provider, poolManagerAddress = "0x498581fF718922c3f8e6A244956aF099B2652b2b") {
  if (!poolKeyOrId || !provider) return { type: "UNKNOWN" };

  let poolId;
  let poolKey = null;

  if (typeof poolKeyOrId === "string" && poolKeyOrId.length === 66 && poolKeyOrId.startsWith("0x")) {
    poolId = poolKeyOrId;
  } else if (typeof poolKeyOrId === "object") {
    if (poolKeyOrId.poolKey) {
      poolKey = { ...poolKeyOrId.poolKey };
    } else if (poolKeyOrId.currency0 || poolKeyOrId.token0) {
      poolKey = {
        currency0: ethers.getAddress(poolKeyOrId.currency0 || poolKeyOrId.token0),
        currency1: ethers.getAddress(poolKeyOrId.currency1 || poolKeyOrId.token1),
        fee: Number(poolKeyOrId.fee || poolKeyOrId.feeMillionths || 3000),
        tickSpacing: Number(poolKeyOrId.tickSpacing || 60),
        hooks: ethers.getAddress(poolKeyOrId.hooks || ethers.ZeroAddress)
      };
    } else if (poolKeyOrId.pairAddress && poolKeyOrId.pairAddress.length === 66) {
      poolId = poolKeyOrId.pairAddress;
    }

    if (poolKey) {
      if (BigInt(poolKey.currency0) > BigInt(poolKey.currency1)) {
        const tmp = poolKey.currency0;
        poolKey.currency0 = poolKey.currency1;
        poolKey.currency1 = tmp;
      }
      const abiCoder = new ethers.AbiCoder();
      const encoded = abiCoder.encode(
        ["address", "address", "uint24", "int24", "address"],
        [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
      );
      poolId = ethers.keccak256(encoded);
    } else if (poolId && (poolKeyOrId.tokenAddress || poolKeyOrId.token0)) {
      // Attempt zero-hook PoolKey derivation across common fee tiers
      const tokenA = poolKeyOrId.tokenAddress || poolKeyOrId.token0;
      let tokenB = poolKeyOrId.quoteAddress || poolKeyOrId.token1;
      if (!tokenB && poolKeyOrId.quoteSymbol) {
        if (poolKeyOrId.quoteSymbol === "USDC") tokenB = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
        else if (poolKeyOrId.quoteSymbol === "CBBTC") tokenB = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
        else tokenB = "0x4200000000000000000000000000000000000006";
      }
      if (tokenA && tokenB) {
        const quoteCandidates = [tokenB];
        if (poolKeyOrId.quoteSymbol === "WETH" || tokenB.toLowerCase() === "0x4200000000000000000000000000000000000006".toLowerCase()) {
          quoteCandidates.push(ethers.ZeroAddress);
        }
        const commonTiers = [
          { fee: 100, tickSpacing: 1 },
          { fee: 500, tickSpacing: 10 },
          { fee: 3000, tickSpacing: 60 },
          { fee: 10000, tickSpacing: 200 },
          { fee: 3000, tickSpacing: 10 },
          { fee: 3000, tickSpacing: 1 },
          { fee: 500, tickSpacing: 1 },
          { fee: 500, tickSpacing: 60 },
          { fee: 10000, tickSpacing: 60 }
        ];
        const abiCoder = new ethers.AbiCoder();
        for (const qCand of quoteCandidates) {
          let c0 = tokenA;
          let c1 = qCand;
          if (BigInt(c0) > BigInt(c1)) {
            c0 = qCand;
            c1 = tokenA;
          }
          for (const ft of commonTiers) {
            const encoded = abiCoder.encode(
              ["address", "address", "uint24", "int24", "address"],
              [c0, c1, ft.fee, ft.tickSpacing, ethers.ZeroAddress]
            );
            if (ethers.keccak256(encoded).toLowerCase() === poolId.toLowerCase()) {
              poolKey = {
                currency0: c0,
                currency1: c1,
                fee: ft.fee,
                tickSpacing: ft.tickSpacing,
                hooks: ethers.ZeroAddress
              };
              break;
            }
          }
          if (poolKey) break;
        }
      }
    }
  }

  if (!poolId) return { type: "UNKNOWN" };

  try {
    const pm = new ethers.Contract(
      poolManagerAddress,
      ["function extsload(bytes32 slot) external view returns (bytes32 value)"],
      provider
    );
    const poolsSlot = ethers.zeroPadValue(ethers.toBeHex(6), 32);
    const baseSlot = ethers.keccak256(ethers.concat([poolId, poolsSlot]));

    const [slot0Data, liqData] = await Promise.all([
      pm.extsload(baseSlot),
      pm.extsload(ethers.toBeHex(BigInt(baseSlot) + 3n, 32))
    ]);

    const slot0Big = BigInt(slot0Data);
    const sqrtPriceX96 = slot0Big & ((1n << 160n) - 1n);
    if (sqrtPriceX96 === 0n) {
      return { type: "UNKNOWN" };
    }
    const tickRaw = (slot0Big >> 160n) & 0xffffffn;
    const tick = (tickRaw & 0x800000n) ? Number(tickRaw - 0x1000000n) : Number(tickRaw);
    const liquidity = BigInt(liqData) & ((1n << 128n) - 1n);

    return {
      type: "V4",
      poolId,
      poolKey,
      address: poolManagerAddress,
      token0: poolKey ? poolKey.currency0 : (poolKeyOrId?.token0 || poolKeyOrId?.tokenAddress || undefined),
      token1: poolKey ? poolKey.currency1 : (poolKeyOrId?.token1 || poolKeyOrId?.quoteAddress || undefined),
      sqrtPriceX96,
      tick,
      liquidity,
      feeMillionths: poolKey ? poolKey.fee : 3000
    };
  } catch {
    return { type: "UNKNOWN" };
  }
}

/**
 * Detects whether a liquidity pool is Uniswap V2 (constant product), Uniswap V3 (concentrated liquidity), or Uniswap V4.
 * Caches the protocol type to eliminate unnecessary RPC overhead.
 *
 * @param {string|object} poolAddress - On-chain liquidity pool address, V4 PoolKey object, or 32-byte poolId
 * @param {ethers.Provider} provider - Ethers JSON-RPC provider
 * @returns {Promise<{ type: "V2"|"V3"|"V4"|"UNKNOWN", address?: string, token0?: string, token1?: string, reserve0?: bigint, reserve1?: bigint, sqrtPriceX96?: bigint, tick?: number, liquidity?: bigint, feeMillionths?: number, poolKey?: object, poolId?: string }>}
 */
export async function getPoolProtocolInfo(poolAddress, provider) {
  if (!poolAddress || !provider) {
    return { type: "UNKNOWN" };
  }

  // Check if it's a Uniswap V4 pool (object or 32-byte hex string)
  if (typeof poolAddress === "object") {
    if (poolAddress.type === "V4" || poolAddress.currency0 || poolAddress.poolKey || (poolAddress.pairAddress && poolAddress.pairAddress.length === 66)) {
      return getV4PoolProtocolInfo(poolAddress, provider);
    }
    if (poolAddress.pairAddress && ethers.isAddress(poolAddress.pairAddress)) {
      poolAddress = poolAddress.pairAddress;
    }
  } else if (typeof poolAddress === "string" && poolAddress.length === 66 && poolAddress.startsWith("0x")) {
    return getV4PoolProtocolInfo(poolAddress, provider);
  }

  if (!ethers.isAddress(poolAddress)) {
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
          reserve1: res[1],
          feeBps: cached.feeBps || 30
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
          liquidity: liq,
          feeMillionths: cached.feeMillionths || 3000
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

    let feeBps = 30;
    try {
      const aero = new ethers.Contract(
        checksummed,
        ["function factory() view returns (address)", "function stable() view returns (bool)"],
        provider
      );
      const [factory, stable] = await Promise.all([aero.factory(), aero.stable()]);
      const f = new ethers.Contract(
        factory,
        ["function getFee(address, bool) view returns (uint256)"],
        provider
      );
      const queriedFee = await f.getFee(checksummed, stable);
      if (queriedFee > 0n && queriedFee <= 1000n) {
        feeBps = Number(queriedFee);
      }
    } catch {
      feeBps = 30;
    }

    const info = {
      type: "V2",
      address: checksummed,
      token0: ethers.getAddress(t0),
      token1: ethers.getAddress(t1),
      reserve0: res[0],
      reserve1: res[1],
      feeBps
    };
    poolProtocolCache.set(cacheKey, { type: "V2", token0: info.token0, token1: info.token1, feeBps });
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

      let feeMillionths = 3000;
      try {
        const v3Fee = new ethers.Contract(checksummed, ["function fee() view returns (uint24)"], provider);
        const f = await v3Fee.fee();
        if (f > 0n) feeMillionths = Number(f);
      } catch {
        feeMillionths = 3000;
      }

      const info = {
        type: "V3",
        address: checksummed,
        token0: ethers.getAddress(t0),
        token1: ethers.getAddress(t1),
        sqrtPriceX96: slot[0],
        tick: Number(slot[1]),
        liquidity: liq,
        feeMillionths
      };
      poolProtocolCache.set(cacheKey, { type: "V3", token0: info.token0, token1: info.token1, feeMillionths });
      return info;
    } catch {
      // Do not cache UNKNOWN permanently so transient RPC timeouts recover on next block
      return { type: "UNKNOWN", address: checksummed };
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


