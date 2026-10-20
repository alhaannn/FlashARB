import { ethers } from "ethers";

/**
 * Flashbots Private Bundle Engine
 * 
 * Submits raw signed transactions directly to Flashbots Block Builders,
 * bypassing the public mempool completely.
 * 
 * Features:
 *  - 100% Mempool Invisibility: Competitor bots cannot inspect or front-run your trade.
 *  - Zero Gas Revert Protection: If the trade fails simulation or price changes, the bundle is dropped. $0 paid in gas.
 *  - Direct Validator Bribe: Tips the miner/validator directly for inclusion in the target block.
 */

export class FlashbotsBundleEngine {
  /**
   * @param {ethers.Provider} provider - Standard JSON-RPC provider
   * @param {ethers.Wallet} searcherWallet - Searcher wallet executing the trade
   * @param {ethers.Wallet} authSigner - Identity wallet used for Flashbots reputation header
   * @param {string} relayUrl - Flashbots relay URL (e.g. https://relay.flashbots.net or https://relay-sepolia.flashbots.net)
   */
  constructor(provider, searcherWallet, authSigner, relayUrl = "https://relay.flashbots.net") {
    this.provider = provider;
    this.searcherWallet = searcherWallet;
    this.authSigner = authSigner;
    this.relayUrl = relayUrl;
  }

  /**
   * Signs the Flashbots request with the auth key
   */
  async _request(method, params) {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: method,
      params: params
    });

    const signature = await this.authSigner.signMessage(ethers.id(body));
    const headers = {
      "Content-Type": "application/json",
      "X-Flashbots-Signature": `${this.authSigner.address}:${signature}`
    };

    const response = await fetch(this.relayUrl, {
      method: "POST",
      headers: headers,
      body: body
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(`Flashbots Relay Error [${data.error.code}]: ${data.error.message}`);
    }
    return data.result;
  }

  /**
   * Simulates a bundle before broadcasting to verify profitability and gas without risking money.
   * Uses `eth_callBundle`
   */
  async simulateBundle(signedTxs, targetBlockNumber) {
    console.log(`[Flashbots] Simulating bundle on target block ${targetBlockNumber}...`);
    const params = [
      {
        txs: signedTxs,
        blockNumber: ethers.toBeHex(targetBlockNumber),
        stateBlockNumber: "latest"
      }
    ];

    try {
      const result = await this._request("eth_callBundle", params);
      console.log(`[Flashbots] Simulation Result:`, {
        bundleGasPrice: result.bundleGasPrice,
        coinbaseDiff: ethers.formatEther(result.coinbaseDiff || 0n) + " ETH",
        totalGasUsed: result.totalGasUsed
      });
      return { success: true, result };
    } catch (err) {
      console.warn(`[Flashbots] Simulation Warning/Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Submits a private bundle directly to block builders via `eth_sendBundle`.
   */
  async sendBundle(signedTxs, targetBlockNumber) {
    console.log(`[Flashbots] Sending private bundle to block builders for block ${targetBlockNumber}...`);
    const params = [
      {
        txs: signedTxs,
        blockNumber: ethers.toBeHex(targetBlockNumber)
      }
    ];

    const bundleHash = await this._request("eth_sendBundle", params);
    console.log(`[Flashbots] Bundle relayed successfully! Bundle Hash: ${bundleHash}`);
    return bundleHash;
  }

  /**
   * Prepares and signs an arbitrage transaction ready for bundling
   */
  async buildAndSignArbTx(executorAddress, executorAbi, arbParams, gasConfig = {}) {
    const contract = new ethers.Contract(executorAddress, executorAbi, this.searcherWallet);

    const nonce = await this.provider.getTransactionCount(this.searcherWallet.address, "latest");
    const feeData = await this.provider.getFeeData();

    const txData = await contract.executeFlashArb.populateTransaction(
      arbParams.poolBorrow,
      arbParams.poolTarget,
      arbParams.amountBorrow,
      arbParams.borrowToken0,
      arbParams.minProfit,
      arbParams.validatorTip
    );

    const fullTx = {
      ...txData,
      type: 2, // EIP-1559
      chainId: (await this.provider.getNetwork()).chainId,
      nonce: nonce,
      gasLimit: gasConfig.gasLimit || 300000n,
      maxFeePerGas: gasConfig.maxFeePerGas || feeData.maxFeePerGas,
      maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas || feeData.maxPriorityFeePerGas
    };

    return await this.searcherWallet.signTransaction(fullTx);
  }
}
