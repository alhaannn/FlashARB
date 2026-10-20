# Beginner-Friendly Guide: Deploying the Arbitrage System to Layer 2 (Base & Arbitrum)

This guide walks you through deploying and running your DEX-to-DEX Arbitrage Bot on **Layer 2 (L2) networks** like **Base** and **Arbitrum**, and how to point it toward smaller ("exotic") tokens, new launches, and market crashes.

---

## 1. The Big Picture: What is an "L2" and Why Are We Using It?

Think of **Ethereum Mainnet** as a crowded city center with heavy traffic and expensive bridge tolls. Every time your bot submits a trade on Ethereum, it costs **$5 to $30 in network fees ("gas")**, even if the trade is small.

An **L2 (Layer 2)** like **Base** (built by Coinbase) or **Arbitrum** is like an express toll road built right above the city:
* **Transactions cost less than 1 to 2 cents ($0.01).**
* **Blocks process every 0.25 to 2 seconds.**
* Because fees are practically zero, you can easily profit from small **$2, $5, or $10** price differences that would be completely eaten by fees on Ethereum Mainnet.

---

## 2. What You Need Before You Start (Prerequisites)

You don't need any special computer hardware. You just need three simple things:

1. **A Web3 Crypto Wallet (like MetaMask or Rabby):**
   * Create a new, clean wallet dedicated specifically to this bot.
   * **Never** use a wallet that holds your main personal savings.
2. **A Few Dollars of ETH on Base or Arbitrum:**
   * You only need **$5 to $10 worth of ETH** on the L2 network to pay for deploying your contract and a few hundred test executions.
   * You can send ETH to Base or Arbitrum directly from an exchange (Coinbase, Binance, Kraken, Bybit) by selecting **"Network: Base"** or **"Network: Arbitrum One"** when withdrawing.
3. **A Free RPC URL (Your Connection to the Blockchain):**
   * Go to [Alchemy.com](https://www.alchemy.com/) or [Infura.io](https://www.infura.io/) and create a free account.
   * Create an "App" for **Base** or **Arbitrum One**.
   * Copy the **HTTPS URL** (it will look like `https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY`).

---

## 3. Step-by-Step: Adding L2 Networks to Your Project

We need to tell Hardhat (the developer tool in this folder) how to talk to Base and Arbitrum.

Open your `hardhat.config.js` file and configure the networks:

```javascript
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import "dotenv/config";

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  plugins: [hardhatEthers],
  solidity: {
    version: "0.8.20",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Coinbase's Base Network
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Arbitrum One Network
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
  },
};
```

---

## 4. How to Deploy Your Contract to Base or Arbitrum

Deploying simply means uploading your `FlashArbExecutor.sol` contract to the live blockchain so it can execute flash swaps on your behalf.

### The WETH Addresses
Every network has an official "Wrapped Ether" (WETH) address that the contract needs:
* **Base WETH Address:** `0x4200000000000000000000000000000000000006`
* **Arbitrum WETH Address:** `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1`

### Deployment Script
Create a simple deployment script named `scripts/deploy.js`:

```javascript
import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  console.log(`Deploying from account: ${deployer.address}`);

  // Base WETH (Change to Arbitrum WETH if deploying to Arbitrum)
  const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

  const FlashArb = await ethers.getContractFactory("FlashArbExecutor");
  const executor = await FlashArb.deploy(WETH_ADDRESS);
  await executor.waitForDeployment();

  console.log(`\n🎉 FlashArbExecutor successfully deployed to: ${executor.target}`);
  console.log(`Save this address into your .env file as EXECUTOR_CONTRACT!`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

### Run the Deployment Command
To deploy to Base:
```powershell
npx hardhat run scripts/deploy.js --network base
```

To deploy to Arbitrum:
```powershell
npx hardhat run scripts/deploy.js --network arbitrum
```

*Cost: Typically less than $0.10!*

---

## 5. Finding Exotic / Smaller Tokens & New Launches

Institutional hedge funds only care about high-volume coins like Bitcoin, Ethereum, and Solana. They ignore small and medium tokens because the profit per trade ($10–$50) is too small for a billion-dollar firm. **This is where independent searchers find opportunities.**

### Where Do Small Tokens Trade on L2?
* **On Base:**
  * **Aerodrome Finance** (The biggest DEX on Base)
  * **Uniswap V2 / V3 on Base**
  * **SushiSwap on Base**
* **On Arbitrum:**
  * **Camelot DEX** (The native Arbitrum DEX)
  * **SushiSwap on Arbitrum**
  * **Uniswap on Arbitrum**

### How to Find Discrepant Pairs Using DexScreener (Free Tool)
1. Go to [DexScreener.com](https://dexscreener.com/).
2. Click on the **Base** or **Arbitrum** tab on the left sidebar.
3. Look for a token that is listed on **two different decentralized exchanges** (for example: a gaming or meme token listed on both *Aerodrome* and *Uniswap*).
4. Click on each exchange listing and copy the **Pair Contract Address** (found in the right-hand panel of DexScreener).
5. Paste Pair Address 1 as `PAIR_A` and Pair Address 2 as `PAIR_B` in your `.env` file.

### ⚠️ Critical Safety Rule: Avoid "Honeypots"
When dealing with brand-new, exotic tokens:
* Some malicious creators make "honeypot" tokens (tokens that you can buy, but nobody can sell).
* **Always check the token on [TokenSniffer.com](https://tokensniffer.com/) or [De.Fi Scanner](https://de.fi/scanner)** before adding it to your bot.
* Only trade tokens that have a high safety score and a verified sell tax of 0%.

---

## 6. How to Capitalize on Market Crashes and High Volatility

During extreme market events (e.g., Bitcoin suddenly drops 8% in 15 minutes, or a Federal Reserve rate announcement):

1. **Massive Liquidity Imbalance:**
   Thousands of retail users panic-sell on one exchange (e.g., Uniswap), but haven't sold yet on another exchange (e.g., SushiSwap or Camelot).
2. **Spreads Open Up to 3% - 8%:**
   Normal spreads are 0.1%. But during a flash crash, the price of an asset on DEX A can lag behind DEX B by several percent for multiple seconds or minutes.
3. **The Bot's Role:**
   Because your contract uses a **flash loan**, you do not need cash sitting on the sidelines. The bot borrows the token, sells into the higher-priced pool, repays the loan, and locks in the dollar/ETH profit automatically.
4. **Safety Net:**
   If the price suddenly recovers mid-trade, the contract's built-in check `require(amountOut > amountRequired)` triggers instantly. The transaction simply cancels itself, protecting you from losing funds.

---

## 7. Putting It All Together: Running the Scanner

Once your contract is deployed and you found two pairs on DexScreener, your `.env` file should look like this:

```env
# Your free Base RPC from Alchemy
RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Your Bot Wallet's Private Key
PRIVATE_KEY=your_private_key_here

# Your deployed FlashArbExecutor address
EXECUTOR_CONTRACT=0xYourDeployedContractAddressOnBase

# Pair 1 (e.g., TOKEN/WETH on Aerodrome)
PAIR_A=0xPairAddress1

# Pair 2 (e.g., TOKEN/WETH on Uniswap Base)
PAIR_B=0xPairAddress2
```

Start the bot:
```powershell
node scripts/live_scanner.js
```

The bot will quietly monitor every new block. Whenever a swap on DEX A creates an imbalance against DEX B that covers all fees and leaves a net profit, it will execute the flash swap and send the profit straight to your wallet.
