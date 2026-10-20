# 🧪 Testnet Faucet & Live Arbitrage Testing Guide

> **Objective:** Test and validate your FlashArb bot, smart contracts, wallet signing, and pre-flight simulation on **Base Sepolia** and **Ethereum Sepolia** with **100% free testnet funds ($0 risk)** before deploying real capital to the live market.

---

## 📑 Table of Contents
1. [Why Testnet Testing is Essential](#1-why-testnet-testing-is-essential)
2. [Base Sepolia vs. Ethereum Sepolia: Which Should You Use?](#2-base-sepolia-vs-ethereum-sepolia-which-should-you-use)
3. [Master List of Working Faucets (Free Testnet ETH)](#3-master-list-of-working-faucets-free-testnet-eth)
4. [Step 1: Setting Up a Dedicated Testnet Wallet in MetaMask](#4-step-1-setting-up-a-dedicated-testnet-wallet-in-metamask)
5. [Step 2: Configuring Your `.env` File for Testnet Testing](#5-step-2-configuring-your-env-file-for-testnet-testing)
6. [Step 3: Verifying Connectivity & Balance (1-Click Diagnostic)](#6-step-3-verifying-connectivity--balance-1-click-diagnostic)
7. [Step 4: Deploying Your FlashArb Contract to Testnet](#7-step-4-deploying-your-flasharb-contract-to-testnet)
8. [Step 5: Executing & Validating Live Testnet Flash Arbitrage](#8-step-5-executing--validating-live-testnet-flash-arbitrage)
9. [Step 6: Running the Web App Dashboard in Testnet Mode](#9-step-6-running-the-web-app-dashboard-in-testnet-mode)
10. [Step 7: The "Ready for Real Market" Checklist](#10-step-7-the-ready-for-real-market-checklist)

---

## 1. Why Testnet Testing is Essential

Before risking even $1 of real crypto in the live market, professional quantitative traders always test on a sandbox testnet.

### What Testnet Testing Proves:
* ✅ **Smart Contract Integrity:** Verifies that your `FlashArbExecutor.sol` contract deploys and sets its owner and WETH address properly.
* ✅ **Wallet Signing & Nonce Handling:** Proves that your Node.js bot can sign Ethereum transactions with your `PRIVATE_KEY` without serialization bugs.
* ✅ **Solution 1 (Pre-Flight Simulation):** Confirms that off-chain `staticCall` detects reverts and prevents gas burning before transactions hit the blockchain.
* ✅ **RPC & Network Reliability:** Verifies that your RPC provider can submit transactions and return receipts with low latency.
* ✅ **Block Explorer Auditing:** Lets you inspect the confirmed transaction on **Basescan** (`sepolia.basescan.org`) to see the exact gas used and execution trace.

---

## 2. Base Sepolia vs. Ethereum Sepolia: Which Should You Use?

| Parameter | 🔵 Base Sepolia (Recommended) | ⚪ Ethereum Sepolia |
|---|---|---|
| **Chain ID** | `84532` | `11155111` |
| **Network Type** | Layer 2 (Optimism OP-Stack) | Layer 1 (Ethereum Mainnet testnet) |
| **Block Time** | **2.0 seconds** (Mirrors Base Mainnet) | 12.0 seconds (Slower) |
| **Gas Cost** | < $0.0001 (Microscopic) | Higher testnet gas |
| **Similarity to Real Market** | **Exact 1:1 match** for Base DEXs & Sequencer | Slower L1 block cadence |
| **Recommendation** | ⭐ **Use Base Sepolia** for primary testing | Use if bridging from L1 |

> [!TIP]
> **Recommendation:** We recommend testing on **Base Sepolia**. Because our production bot targets Base Mainnet (Aerodrome, Uniswap V3 on Base, Slipstream), Base Sepolia uses the exact same block time (2 seconds), rollup structure, and pre-deploy WETH address (`0x4200000000000000000000000000000000000006`).

---

## 3. Master List of Working Faucets (Free Testnet ETH)

All of these faucets provide **free, zero-cost testnet ETH**. You never pay any real money.

### Option A: Direct Base Sepolia Faucets (Fastest)

1. **Coinbase Developer Platform (CDP) Faucet (Official & Instant)**
   * **URL:** [https://portal.cdp.coinbase.com/products/faucet](https://portal.cdp.coinbase.com/products/faucet)
   * **Amount:** 0.1 to 0.5 Base Sepolia ETH per day
   * **Instructions:** Log in with Google or Coinbase account, select **Base Sepolia**, paste your wallet address, and click **Claim**.

2. **Superchain Faucet (Optimism & Base)**
   * **URL:** [https://console.optimism.io/faucet](https://console.optimism.io/faucet)
   * **Amount:** Up to 1.0 Base Sepolia ETH
   * **Instructions:** Sign in with GitHub or connect your wallet, select **Base Sepolia**, and claim funds.

3. **Alchemy Base Sepolia Faucet**
   * **URL:** [https://www.alchemy.com/faucets/base-sepolia](https://www.alchemy.com/faucets/base-sepolia)
   * **Amount:** 0.1 Base Sepolia ETH daily
   * **Instructions:** Create a free Alchemy account, paste your address, and click **Send Me ETH**.

4. **QuickNode Base Sepolia Faucet**
   * **URL:** [https://faucet.quicknode.com/base/sepolia](https://faucet.quicknode.com/base/sepolia)
   * **Amount:** 0.05 to 0.1 Base Sepolia ETH

---

### Option B: Ethereum Sepolia Faucets

If you want to test on Ethereum Sepolia or bridge from Sepolia to Base Sepolia:

1. **Google Cloud Web3 Faucet (No Crypto Account Required)**
   * **URL:** [https://cloud.google.com/application/web3/faucet/ethereum/sepolia](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)
   * **Amount:** 0.05 Sepolia ETH daily
   * **Instructions:** Log in with any Google Gmail account, paste your wallet address, and click **Receive 0.05 Sepolia ETH**.

2. **Sepolia PoW Faucet (No Account Needed — Infinite Testnet ETH)**
   * **URL:** [https://sepolia-faucet.pk910.de/](https://sepolia-faucet.pk910.de/)
   * **Amount:** 1.0 to 10.0+ Sepolia ETH
   * **Instructions:** Enter your wallet address, click **Start Mining**, and let your browser tab run for 3–5 minutes. Your computer will mine Sepolia ETH using proof-of-work and automatically send it to your wallet!

3. **Alchemy Ethereum Sepolia Faucet**
   * **URL:** [https://sepoliafaucet.com/](https://sepoliafaucet.com/)
   * **Amount:** 0.5 Sepolia ETH daily

---

### Option C: The 1-Click Bridge (Sepolia ➔ Base Sepolia)

If you already have ETH on Ethereum Sepolia and want to move it to Base Sepolia:
1. Go to the **Official Base Testnet Bridge**: [https://bridge.base.org/deposit](https://bridge.base.org/deposit)
2. Connect MetaMask and select the **Sepolia** network.
3. Enter the amount of Sepolia ETH (e.g. `0.2`).
4. Click **Deposit**. Within ~1 minute, the funds arrive on **Base Sepolia**!

---

## 4. Step 1: Setting Up a Dedicated Testnet Wallet in MetaMask

> [!CAUTION]
> **Safety First:** Never use your primary personal wallet or hardware wallet for bot testing. Always create a **new, dedicated burner wallet** in MetaMask specifically for development and testing.

### Add Base Sepolia to MetaMask:
If Base Sepolia is not already in your MetaMask:
1. Open MetaMask ➔ Click the network dropdown (top-left).
2. Click **"Add network"** ➔ **"Add a network manually"**.
3. Fill in the network details:
   * **Network Name:** `Base Sepolia`
   * **New RPC URL:** `https://sepolia.base.org`
   * **Chain ID:** `84532`
   * **Currency Symbol:** `ETH`
   * **Block Explorer URL:** `https://sepolia.basescan.org`
4. Click **Save**.

### Copy Your Private Key:
1. In MetaMask, click the three vertical dots `⋮` next to your testnet account name ➔ **Account details**.
2. Click **"Show private key"**, enter your MetaMask password, and copy the 64-character hexadecimal key (e.g., `0xabcdef...`).

---

## 5. Step 2: Configuring Your `.env` File for Testnet Testing

In your project root directory (`Flash-USDT`), create or update your `.env` file:

```ini
# ========================================================
# FLASHARB TESTNET CONFIGURATION (BASE SEPOLIA)
# ========================================================

# 1. Target Chain & RPC Endpoints
CHAIN=base_sepolia
RPC_URL=https://sepolia.base.org
WSS_URL=wss://base-sepolia-rpc.publicnode.com

# 2. Your Testnet Wallet Private Key (Funded from Faucet)
PRIVATE_KEY=0xYourTestnetPrivateKeyHere

# 3. Deployed FlashArb Contract (Leave empty until deployed in Step 4)
EXECUTOR_CONTRACT=0x0000000000000000000000000000000000000000

# 4. Strategy & Port Configuration
MIN_PROFIT=0.0001
TIP_PERCENT=80
PORT=3000
```

---

## 6. Step 3: Verifying Connectivity & Balance (1-Click Diagnostic)

We built an automated health-check script that tests your RPC connection, reads your wallet balance, and checks contract deployment status in 1 second.

Run this command in your terminal:

```bash
node scripts/test_testnet_connectivity.js
```

### Expected Output:
```text
=========================================================
      FlashArb PRO - Testnet Connectivity & Health Check 
=========================================================

Target Network : BASE_SEPOLIA
RPC Endpoint   : https://sepolia.base.org
✅ Connected to RPC successfully!
   Chain ID    : 84532
   Latest Block: #48321550

Wallet Address : 0x71C...4920
Wallet Balance : 0.2500 ETH

🎉 Wallet is funded with 0.2500 testnet ETH!
You have sufficient gas to deploy your contract and run test arbitrage.

ℹ️ No EXECUTOR_CONTRACT specified in .env yet.
👉 To deploy your contract to Base Sepolia, run:
   npx hardhat run scripts/deploy.js --network base_sepolia
=========================================================
```

If your balance shows `0.00 ETH`, visit one of the faucets in [Section 3](#3-master-list-of-working-faucets-free-testnet-eth) before proceeding.

---

## 7. Step 4: Deploying Your FlashArb Contract to Testnet

Now deploy your `FlashArbExecutor.sol` contract directly to **Base Sepolia**:

```bash
npx hardhat run scripts/deploy.js --network base_sepolia
```

### What Happens:
```text
=========================================================
       Deploying FlashArbExecutor to Live Network        
=========================================================

Deployer Address: 0x71C...4920
Account Balance:  0.2500 ETH
Detected Network: Base Sepolia Testnet (Chain ID: 84532)
Using WETH Address: 0x4200000000000000000000000000000000000006

Deploying contract...

🎉 FlashArbExecutor successfully deployed!
Contract Address: 0x3d024982a513C38a1B6d4f647971C50C3138b348

Action item: Copy this address into your .env file as:
EXECUTOR_CONTRACT=0x3d024982a513C38a1B6d4f647971C50C3138b348
```

### Save It to `.env`:
Open `.env` and set:
```ini
EXECUTOR_CONTRACT=0x3d024982a513C38a1B6d4f647971C50C3138b348
```

### View Your Contract on the Block Explorer:
Open your browser and navigate to:  
👉 **`https://sepolia.basescan.org/address/0xYourDeployedAddress`**  
You will see your newly deployed smart contract, confirmed on the Base Sepolia blockchain!

---

## 8. Step 5: Executing & Validating Live Testnet Flash Arbitrage

With your contract deployed and funded, test your system:

### 1. Re-run the Connectivity Diagnostic:
```bash
node scripts/test_testnet_connectivity.js
```
You will now see:
```text
Checking Deployed Contract at: 0x3d024982a513C38a1B6d4f647971C50C3138b348...
✅ FlashArbExecutor contract bytecode confirmed on-chain! (4120 bytes)
   Contract Owner : 0x71C...4920
   Canonical WETH : 0x4200000000000000000000000000000000000006
   Ownership Status: ✅ Verified! (You are the contract owner)
```

### 2. Verify Pre-Flight Simulation Protection ($0 Gas on Reverts):
When the bot scans or evaluates a trade:
1. It simulates `executeTriangularFlashArb` or `executeV2ToV3FlashArb` via `staticCall`.
2. If the price spread has already closed or slippage exceeds the threshold, the node immediately blocks the trade locally.
3. **$0.00 gas is spent, and 0 failed transactions appear on your wallet history.**

---

## 9. Step 6: Running the Web App Dashboard in Testnet Mode

Start the Web App server locally or on your AWS EC2 instance:

```bash
npm start
```
*(Or if running on your cloud server: `pm2 restart flasharb && pm2 logs flasharb`)*.

1. Open your browser: `http://localhost:3000` (or `http://YOUR_EC2_PUBLIC_IP:3000`).
2. The dashboard automatically displays:
   * **Active Network:** `BASE_SEPOLIA`
   * **RPC:** Connected to `https://sepolia.base.org`
   * **Contract Status:** Deployed & Verified
   * **Live Stream:** Real-time testnet mempool & sync events
3. Click **"START 100% AUTOPILOT"** or test the manual **"Execute Flash Swap"** button in the Concentrated Liquidity or Triangular Arbitrage tabs.
4. When a transaction is submitted, the transaction hash appears in the live execution log with a direct link to:  
   👉 `https://sepolia.basescan.org/tx/0x...`

---

## 10. Step 7: The "Ready for Real Market" Checklist

Once you have verified:
* [x] Free testnet ETH successfully claimed from faucets.
* [x] `FlashArbExecutor.sol` deployed and verified on Base Sepolia.
* [x] Wallet signed and transmitted transactions to the testnet RPC.
* [x] Pre-flight simulation correctly rejected unprofitable routes with $0 gas burned.
* [x] Live dashboard displayed real-time events and stats.

### You Are Now Ready for Real Market Execution!

To transition to **Base Mainnet** with real capital:

1. **Deploy Contract to Base Mainnet:**
   Fund your mainnet wallet with a small amount of real ETH ($10–$20 is plenty for deployment and gas on Base).
   ```bash
   npx hardhat run scripts/deploy.js --network base
   ```
2. **Update `.env` for Mainnet:**
   ```ini
   CHAIN=base
   RPC_URL=https://mainnet.base.org
   WSS_URL=wss://base-rpc.publicnode.com
   PRIVATE_KEY=your_real_wallet_private_key
   EXECUTOR_CONTRACT=0xYourMainnetDeployedAddress
   MIN_PROFIT=10
   TIP_PERCENT=85
   ```
3. **Start PM2 on Your AWS EC2 Instance:**
   ```bash
   pm2 restart flasharb
   pm2 logs flasharb
   ```

Your bot will now run 24/7 on the AWS Virginia backbone, executing real flash arbitrage trades with sub-2 millisecond latency!
