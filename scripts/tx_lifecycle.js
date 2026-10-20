import { ethers } from "ethers";

export const TxStatus = {
  SUBMITTED: "SUBMITTED",
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN"
};

/**
 * Executes a transaction and follows its complete lifecycle through to confirmation.
 * Never labels a transaction as confirmed or realized until receipt.status === 1.
 *
 * @param {ethers.Contract} contract - Target contract instance
 * @param {string} methodName - Function name on contract
 * @param {any[]} args - Function arguments
 * @param {object} options - Execution options
 * @param {number} [options.confirmations=1] - Confirmations required
 * @param {number} [options.timeoutMs=60000] - Receipt timeout
 * @param {function} [options.onStatusChange] - Callback (status, details)
 * @returns {Promise<{ status: string, txHash: string|null, receipt: ethers.TransactionReceipt|null, realizedProfit: bigint|null, error: string|null }>}
 */
export async function executeAndTrackLifecycle(contract, methodName, args, options = {}) {
  const onStatusChange = options.onStatusChange || (() => {});
  const confirmations = options.confirmations || 1;
  const timeoutMs = options.timeoutMs || 60000;

  let tx;
  try {
    tx = await contract[methodName](...args);
  } catch (sendErr) {
    onStatusChange(TxStatus.FAILED, { txHash: null, error: sendErr.message });
    return {
      status: TxStatus.FAILED,
      txHash: null,
      receipt: null,
      realizedProfit: null,
      error: sendErr.message
    };
  }

  const txHash = tx.hash;
  onStatusChange(TxStatus.SUBMITTED, { txHash });
  onStatusChange(TxStatus.PENDING, { txHash });

  // Await receipt with timeout protection
  try {
    const receiptPromise = tx.wait(confirmations);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout awaiting receipt after ${timeoutMs}ms`)), timeoutMs)
    );

    const receipt = await Promise.race([receiptPromise, timeoutPromise]);

    if (!receipt) {
      onStatusChange(TxStatus.UNKNOWN, { txHash, error: "Empty receipt received" });
      return {
        status: TxStatus.UNKNOWN,
        txHash,
        receipt: null,
        realizedProfit: null,
        error: "Empty receipt"
      };
    }

    if (receipt.status === 1) {
      // Confirmed on-chain! Extract event evidence if available
      let realizedProfit = null;
      try {
        const arbInterface = contract.interface;
        for (const log of receipt.logs) {
          try {
            const parsed = arbInterface.parseLog(log);
            if (parsed && parsed.name === "ArbitrageExecuted") {
              realizedProfit = BigInt(parsed.args.profitAmount);
              break;
            }
          } catch {}
        }
      } catch {}

      onStatusChange(TxStatus.CONFIRMED, { txHash, receipt, realizedProfit });
      return {
        status: TxStatus.CONFIRMED,
        txHash,
        receipt,
        realizedProfit,
        error: null
      };
    } else {
      // Reverted on-chain (status 0)
      onStatusChange(TxStatus.FAILED, { txHash, receipt, error: "Transaction reverted on-chain" });
      return {
        status: TxStatus.FAILED,
        txHash,
        receipt,
        realizedProfit: null,
        error: "Transaction reverted on-chain (receipt status: 0)"
      };
    }
  } catch (err) {
    // Timeout or network drop while waiting for receipt
    onStatusChange(TxStatus.UNKNOWN, { txHash, error: err.message });
    return {
      status: TxStatus.UNKNOWN,
      txHash,
      receipt: null,
      realizedProfit: null,
      error: err.message
    };
  }
}
