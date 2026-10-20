/**
 * Revert Diagnostics & Error Sanitization Engine
 * 
 * Extracts high-fidelity debugging diagnostics from ethers v6 call/staticCall
 * reverts while strictly scrubbing private keys, RPC secrets, and environment tokens.
 */

// Regex patterns to detect and redact sensitive values
const SENSITIVE_PATTERNS = [
  /0x[a-fA-F0-9]{64}/g, // 32-byte hex private keys or secret hashes
  /key=[a-zA-Z0-9_-]+/gi, // API keys in query parameters
  /https?:\/\/[^@\s]+:[^@\s]+@/g // Basic auth credentials in URLs
];

/**
 * Sanitizes a string by redacting private keys and credentials.
 * 
 * @param {string} text - Raw string
 * @returns {string} Sanitized string
 */
export function sanitizeLogString(text) {
  if (!text || typeof text !== "string") return "";
  let clean = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    clean = clean.replace(pattern, "[REDACTED_SECRET]");
  }
  return clean;
}

/**
 * Parses and formats comprehensive diagnostics from simulation reverts.
 * 
 * @param {Error|any} err - Caught error object from staticCall or RPC call
 * @param {object} context - Execution context
 * @param {string} [context.targetContract] - Target contract address
 * @param {string|number} [context.chainId] - Network chain ID
 * @param {string} [context.functionName] - Contract function called
 * @param {string[]} [context.poolAddresses] - Relevant pool addresses
 * @param {object} [context.tradeParams] - Sanitized trade parameters
 * @returns {{ diagnosticString: string, structuredData: object }}
 */
export function formatRevertDiagnostics(err, context = {}) {
  const errorName = err?.revert?.name || err?.name || "CallRevert";
  const errorCode = err?.code || "UNKNOWN";

  // Attempt to extract revert reason or custom error data
  let revertReason = err?.reason || null;
  if (!revertReason && err?.revert?.name) {
    revertReason = err.revert.name;
    if (err.revert.args && err.revert.args.length > 0) {
      revertReason += `(${err.revert.args.map(a => String(a)).join(", ")})`;
    }
  }

  // Check short message
  const rawShortMessage = err?.shortMessage || err?.message || "Execution reverted";
  const shortMessage = sanitizeLogString(rawShortMessage);

  // Check raw revert data
  const rawData = err?.data || err?.info?.error?.data || err?.error?.data || null;
  const customErrorData = (typeof rawData === "string" && rawData.startsWith("0x")) ? rawData : null;

  const structuredData = {
    errorName,
    errorCode,
    revertReason: revertReason ? sanitizeLogString(revertReason) : "missing revert data",
    shortMessage,
    customErrorData,
    targetContract: context.targetContract ? String(context.targetContract) : "N/A",
    chainId: context.chainId !== undefined ? String(context.chainId) : "N/A",
    functionName: context.functionName || "staticCall",
    poolAddresses: Array.isArray(context.poolAddresses) ? context.poolAddresses : [],
    tradeParams: context.tradeParams ? context.tradeParams : {}
  };

  const poolStr = structuredData.poolAddresses.length > 0
    ? ` Pools: [${structuredData.poolAddresses.join(", ")}]`
    : "";
  const paramStr = Object.keys(structuredData.tradeParams).length > 0
    ? ` Params: ${JSON.stringify(structuredData.tradeParams)}`
    : "";

  const diagnosticString = `[Simulation Reverted] Reason: '${structuredData.revertReason}' | Function: ${structuredData.functionName}() | Code: ${structuredData.errorCode}${poolStr}${paramStr} | Target: ${structuredData.targetContract}`;

  return {
    diagnosticString,
    structuredData
  };
}

/**
 * Returns true if a simulation result represents a definite failure that must abort execution.
 * Any failed, missing, or inconclusive simulation strictly prevents broadcasting.
 * 
 * @param {Error|null} error - Error if one was thrown
 * @returns {boolean}
 */
export function mustAbortTradeExecution(error) {
  // If an error is present, ALWAYS abort
  return Boolean(error);
}
