# Complete Step-by-Step Setup Guide (For Absolute Beginners)

> **Who is this guide for?**
> This guide is written for someone who has never used a command line, never deployed a smart contract, and has zero coding experience.
> If you are a 12th-grade student who can browse the internet and follow numbered instructions, you can do this.

---

## Table of Contents

1. [What Does This Project Actually Do?](#1-what-does-this-project-actually-do)
2. [What You Need (Shopping List)](#2-what-you-need-shopping-list)
3. [Part A: Install Node.js (The Engine)](#3-part-a-install-nodejs-the-engine)
4. [Part B: Install Git (Optional but Recommended)](#4-part-b-install-git-optional-but-recommended)
5. [Part C: Install Project Dependencies](#5-part-c-install-project-dependencies)
6. [Part D: Run the Local Test (Verify Everything Works)](#6-part-d-run-the-local-test-verify-everything-works)
7. [Part E: Create a Dedicated Bot Wallet (MetaMask)](#7-part-e-create-a-dedicated-bot-wallet-metamask)
8. [Part F: Get Free ETH on Base Network](#8-part-f-get-free-eth-on-base-network)
9. [Part G: Get a Free RPC URL (Your Internet Cable to the Blockchain)](#9-part-g-get-a-free-rpc-url-your-internet-cable-to-the-blockchain)
10. [Part H: Create Your .env Configuration File](#10-part-h-create-your-env-configuration-file)
11. [Part I: Deploy Your Smart Contract to Base](#11-part-i-deploy-your-smart-contract-to-base)
12. [Part J: Run the Automated Pair Finder](#12-part-j-run-the-automated-pair-finder)
13. [Part K: Start the Autonomous Bot](#13-part-k-start-the-autonomous-bot)
14. [Troubleshooting Common Problems](#14-troubleshooting-common-problems)
15. [Important Warnings & Risks](#15-important-warnings--risks)

---

## 1. What Does This Project Actually Do?

Imagine there are two fruit markets in your city:
- **Market A** sells mangoes for ₹80 per kg.
- **Market B** sells the exact same mangoes for ₹90 per kg.

If you could instantly buy 10 kg from Market A (₹800) and sell them at Market B (₹900), you'd pocket ₹100 profit. This is called **arbitrage**.

Now imagine you don't even need the ₹800 upfront. A magic loan system lets you borrow ₹800, buy at Market A, sell at Market B, return the ₹800 loan, and keep the ₹100 — all in less than 2 seconds. If the price difference disappears before you finish, the loan automatically cancels and you lose nothing. This is exactly what a **DeFi Flash Loan** does on the blockchain.

**This project automates the entire process:**
1. It scans hundreds of crypto markets automatically.
2. It identifies safe tokens (filtering out scams).
3. It finds price differences between two exchanges.
4. It borrows tokens for free (flash loan), trades them, repays the loan, and keeps the profit.
5. If there's no profit, it does nothing and costs you $0.

---

## 2. What You Need (Shopping List)

| Item | Cost | Where to Get It |
|------|------|-----------------|
| A Windows/Mac/Linux computer | You already have this | — |
| Internet connection | You already have this | — |
| Node.js (software) | **Free** | nodejs.org |
| A MetaMask wallet | **Free** | metamask.io |
| $5–10 worth of ETH on Base network | ~₹400–800 | Any crypto exchange |
| An Alchemy account (for RPC URL) | **Free** | alchemy.com |

**Total cost to start: approximately ₹400–800 ($5–10), and most of that is recoverable.**

---

## 3. Part A: Install Node.js (The Engine)

Node.js is the program that runs our bot. Think of it as "Microsoft Office for running JavaScript code."

### Step-by-Step:

1. **Open your web browser** and go to: **https://nodejs.org**
2. You will see two big green buttons. Click the one that says **"LTS"** (Long Term Support). This downloads an installer file.
3. **Run the downloaded file** (it will be named something like `node-v22.x.x-x64.msi`).
4. Click **Next → Next → Next → Install → Finish**. Accept all the defaults.
5. **Verify it installed correctly:**
   - Press `Windows Key + R` on your keyboard.
   - Type `powershell` and press Enter.
   - In the black/blue window that opens, type:
     ```
     node --version
     ```
   - You should see something like `v22.11.0`. If you see a version number, Node.js is installed!
   - Also type:
     ```
     npm --version
     ```
   - You should see something like `10.9.0`.

> **If you see an error instead of a version number:** Close PowerShell, restart your computer, and try again. Sometimes Windows needs a restart to recognize newly installed programs.

---

## 4. Part B: Install Git (Optional but Recommended)

Git is a tool developers use to download code. You may already have it.

1. In PowerShell, type:
   ```
   git --version
   ```
2. If you see a version number (e.g., `git version 2.47.1`), you already have it. **Skip to Part C.**
3. If you get an error, go to **https://git-scm.com/downloads** and download the installer for Windows. Run it and click Next through all the defaults.

---

## 5. Part C: Install Project Dependencies

"Dependencies" are helper libraries that our code needs to run. Think of them like apps your phone needs to function — the code can't work without them.

### Step-by-Step:

1. **Open PowerShell** (press `Windows Key`, type `PowerShell`, click it).
2. **Navigate to the project folder.** Type:
   ```
   cd "$env:USERPROFILE\OneDrive\Desktop\Flash-USDT"
   ```
   > If your project is in a different location, replace the path above with your actual folder path.

3. **Install all required packages.** Type:
   ```
   npm install
   ```
   Wait 30–60 seconds. You'll see a progress bar and then a message like `added 98 packages`.

4. **Compile the smart contracts.** Type:
   ```
   npx hardhat compile
   ```
   Wait 5–10 seconds. You should see:
   ```
   Compiled 9 Solidity files with solc 0.8.20
   ```

> **What just happened?** `npm install` downloaded all the code libraries our bot needs. `npx hardhat compile` translated our Solidity smart contract (human-readable code) into EVM bytecode (machine-readable code that the blockchain can execute).

---

## 6. Part D: Run the Local Test (Verify Everything Works)

Before touching real money, let's run the entire system on a **fake local blockchain** inside your computer. This costs nothing and proves the code works.

1. In the same PowerShell window, type:
   ```
   node scripts/run_test_suite.js
   ```

2. You should see output like:
   ```
   =========================================================
      DEX-to-DEX Arbitrage Engine - End-to-End Simulation
   =========================================================

   [1/4] Deploying Mock Tokens...
   [2/4] Deploying DEX Liquidity Pools...
   [3/4] Deploying FlashArbExecutor Smart Contract...
   [4/4] Executing Flash Swap Arbitrage Simulation...

   >>> ARBITRAGE TRANSACTION CONFIRMED! <<<
   Net Profit Realized: +207.12 Token1

   Testing Inversion Protection (No spread):
   [OK] Contract successfully reverted

   All Core Arbitrage Mechanics Verified Successfully!
   ```

3. **Also test the math optimizer:**
   ```
   node scripts/test_math.js
   ```
   You should see output showing that the optimizer correctly calculates optimal trade sizes.

> **If both tests pass:** Congratulations! The code is working perfectly on your machine. Every single component (smart contract, math engine, safety checks) is functional.

> **If you see errors:** Check that you completed Part A and Part C correctly. The most common problem is forgetting to run `npm install`.

---

## 7. Part E: Create a Dedicated Bot Wallet (MetaMask)

MetaMask is a free browser extension that acts as your crypto wallet. We will create a **brand new wallet** used only for this bot.

> ⚠️ **CRITICAL SAFETY RULE:** Never use your personal wallet that holds your savings. Create a completely separate wallet just for this bot. Only put $5–10 in it.

### Step-by-Step:

1. **Install MetaMask:**
   - Open Google Chrome (or Brave/Firefox).
   - Go to: **https://metamask.io/download/**
   - Click **"Install MetaMask for Chrome"**.
   - Click **"Add to Chrome"** in the Chrome Web Store.
   - A fox icon 🦊 will appear in the top-right corner of your browser.

2. **Create a new wallet:**
   - Click the fox icon 🦊.
   - Click **"Create a new wallet"**.
   - Set a **password** (this is just for your browser, not the blockchain password).
   - MetaMask will show you **12 secret words** (called a "seed phrase"). **WRITE THESE DOWN ON PAPER. DO NOT SCREENSHOT THEM. DO NOT SAVE THEM IN A FILE.**
   - Confirm the seed phrase by clicking the words in order.

3. **Add the Base network to MetaMask:**
   - Click the network dropdown at the top of MetaMask (it usually says "Ethereum Mainnet").
   - Click **"Add network"** → **"Add a network manually"**.
   - Fill in these exact values:

   | Field | Value |
   |-------|-------|
   | Network Name | `Base` |
   | New RPC URL | `https://mainnet.base.org` |
   | Chain ID | `8453` |
   | Currency Symbol | `ETH` |
   | Block Explorer URL | `https://basescan.org` |

   - Click **"Save"**.
   - You should now be on the "Base" network.

4. **Get your Private Key (needed for the bot):**
   - In MetaMask, click the three dots (⋮) next to your account name.
   - Click **"Account details"**.
   - Click **"Show private key"**.
   - Enter your MetaMask password.
   - You will see a long string of letters and numbers starting with `0x`. **Copy this. You will need it in Part H.**

   > ⚠️ **Your private key is like your ATM PIN. Anyone who has it can take all the money in your wallet. NEVER share it with anyone. NEVER paste it in a website. It only goes in the `.env` file on YOUR computer.**

---

## 8. Part F: Get Free ETH on Base Network

You need a tiny amount of ETH on Base to deploy the smart contract (costs ~$0.05) and pay for transaction fees (each trade costs < $0.01).

### Option 1: Transfer from a Crypto Exchange (Recommended)
If you have an account on **Coinbase**, **Binance**, **Kraken**, **WazirX**, or **Bybit**:
1. Buy $5–10 worth of ETH.
2. Go to **"Withdraw"** or **"Send"**.
3. Paste your MetaMask wallet address (the `0x...` address you see in MetaMask).
4. **IMPORTANT:** Select the network as **"Base"** (not "Ethereum" — Ethereum fees are $5+ per transaction, Base fees are $0.01).
5. Confirm the withdrawal.
6. Wait 1–5 minutes. Check your MetaMask — you should see the ETH balance appear.

### Option 2: Bridge from Ethereum to Base
If you already have ETH on Ethereum Mainnet:
1. Go to **https://bridge.base.org**
2. Connect your MetaMask wallet.
3. Enter the amount of ETH to bridge (e.g., 0.003 ETH ≈ $8).
4. Confirm the transaction.
5. Wait 10–15 minutes for the bridge to complete.

---

## 9. Part G: Get a Free RPC URL (Your Internet Cable to the Blockchain)

An **RPC URL** is like a phone number that lets your bot call the blockchain and ask "what are the current prices?" Every time the bot checks prices, it makes an RPC call.

**Alchemy** gives you a free account with 300 million free calls per month (more than enough).

### Step-by-Step:

1. **Go to:** **https://www.alchemy.com/**
2. Click **"Sign Up"** (top right corner).
3. Sign up with your Google account or email. It's free — no credit card needed.
4. After signing in, you'll land on the **Dashboard**.
5. Click **"+ Create new app"** (or "Create App").
6. Fill in:
   - **App Name:** `my-arb-bot` (or anything you like)
   - **Description:** `Arbitrage bot` (optional)
   - **Network:** Click the dropdown and select **"Base Mainnet"**
7. Click **"Create App"**.
8. On the app page, you'll see a section called **"API Key"**. Click **"View Key"**.
9. You'll see an **HTTPS URL** that looks like:
   ```
   https://base-mainnet.g.alchemy.com/v2/AbCdEf123456789...
   ```
   **Copy this entire URL.** This is your RPC URL.

> **Why Alchemy?** The default public RPC (`https://mainnet.base.org`) works but is slow and has rate limits. Alchemy's free tier is 10x faster and allows your bot to check prices more frequently, giving you an edge over bots using the slow public endpoint.

---

## 10. Part H: Create Your .env Configuration File

The `.env` file is where you store your private settings (wallet key, RPC URL, etc.). Think of it as a secret settings file that the bot reads on startup.

### Step-by-Step:

1. In the project folder (`Flash-USDT`), you'll see a file called `.env.example`. This is a template.
2. **Open PowerShell** and navigate to the project:
   ```
   cd "$env:USERPROFILE\OneDrive\Desktop\Flash-USDT"
   ```
3. **Create a copy of the template:**
   ```
   Copy-Item .env.example .env
   ```
4. **Open the `.env` file in Notepad:**
   ```
   notepad .env
   ```
5. **Edit the file** to look like this (replace the placeholder values with your real values):

   ```env
   # Your Alchemy RPC URL from Part G
   RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ACTUAL_API_KEY_HERE

   # Also set Base-specific RPC for Hardhat
   BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ACTUAL_API_KEY_HERE

   # Your MetaMask Private Key from Part E (starts with 0x)
   PRIVATE_KEY=0xYOUR_ACTUAL_PRIVATE_KEY_HERE

   # Leave this blank for now — we'll fill it after deploying
   EXECUTOR_CONTRACT=

   # Chain setting
   CHAIN=base
   ```

6. **Save the file** (Ctrl+S) and close Notepad.

> ⚠️ **NEVER share your `.env` file with anyone. NEVER upload it to GitHub, Google Drive, or any website. This file contains your private key — the master password to your wallet.**

---

## 11. Part I: Deploy Your Smart Contract to Base

"Deploying" means uploading your smart contract code to the Base blockchain. Once deployed, it lives on the blockchain forever and can execute flash swaps for you.

### Step-by-Step:

1. **Open PowerShell** and navigate to the project:
   ```
   cd "$env:USERPROFILE\OneDrive\Desktop\Flash-USDT"
   ```

2. **Deploy the contract:**
   ```
   npx hardhat run scripts/deploy.js --network base
   ```

3. Wait 10–30 seconds. You should see:
   ```
   Deploying from account: 0xYourWalletAddress
   Account Balance: 0.003 ETH
   Detected Network: Base Mainnet (Chain ID: 8453)

   🎉 FlashArbExecutor successfully deployed!
   Contract Address: 0xAbCd1234...5678
   ```

4. **Copy the Contract Address** (the `0xAbCd1234...5678` part).

5. **Open your `.env` file again:**
   ```
   notepad .env
   ```

6. **Paste the contract address** next to `EXECUTOR_CONTRACT=`:
   ```
   EXECUTOR_CONTRACT=0xAbCd1234...5678
   ```

7. Save and close.

> **What just happened?** Your smart contract is now live on the Base blockchain. It cost approximately $0.05–$0.15 in gas fees. The contract can now borrow tokens, swap them across exchanges, and return profits to your wallet — all in a single atomic transaction.

---

## 12. Part J: Run the Automated Pair Finder

This script automatically searches the entire Base network for tokens that are listed on multiple exchanges, checks each one for scams/honeypots, and saves the safe candidates.

1. **In PowerShell, type:**
   ```
   node scripts/auto_pair_finder.js base
   ```

2. Wait about 10–15 seconds. You'll see:
   ```
   =========================================================
        Automated Pair Discovery Engine [Chain: BASE]
   =========================================================

   [1/4] Fetching active market pairs from DexScreener...
     Discovered 51 eligible pools

   [2/4] Grouping pools by token to find multi-DEX listings...
     Found 6 tokens active across multiple DEXes!

   [3/4] Auditing candidates for honeypots, taxes, and blacklists...
     Checking Basecat... ✅ SAFE
     Checking cbXRP...   ✅ SAFE
     Checking PEPE...    ❌ REJECTED: TRANSFER_RESTRICTION
     Checking TYBG...    ✅ SAFE

   [4/4] Completed! Verified 5 safe arbitrage targets.
   Saved verified pairs to: monitored_pairs.json
   ```

> **What just happened?** The bot:
> - Called DexScreener's free API to find all active trading pools on Base.
> - Grouped tokens to find ones traded on 2+ different exchanges.
> - Called the GoPlus Security API to check each token for hidden taxes, honeypot code, and blacklists.
> - Saved only the verified safe tokens to `monitored_pairs.json`.

---

## 13. Part K: Start the Autonomous Bot

This is the final step. The bot will now monitor all safe pairs on every new block and execute trades automatically.

1. **In PowerShell, type:**
   ```
   node scripts/auto_scanner.js
   ```

2. You'll see:
   ```
   =========================================================
          Autonomous Multi-Pair Arbitrage Engine
   =========================================================

   Target Network: BASE
   Loaded 5 previously verified safe pairs.
   Active Monitoring: Tracking 5 dual-listed pools on each block...

   [Block #52791047] 🔥 ARBITRAGE OPPORTUNITY FOUND!
     Token:          TYBG / WETH
     Route:          sushiswap -> aerodrome
     Net Profit:     +0.000003719 WETH
   ```

3. **The bot is now running.** Keep this PowerShell window open. The bot will:
   - Check all 5+ token pairs on every new block (every 2 seconds on Base).
   - Automatically calculate the exact optimal trade size.
   - Execute flash swap arbitrage when a profitable spread is found.
   - Refresh its token list every 15 minutes (discovers new tokens automatically).
   - Skip any token that fails the honeypot/tax safety check.

4. **To stop the bot:** Press `Ctrl + C` in the PowerShell window.

5. **To run the bot in the background** (so it keeps running even if you close the window):
   ```
   Start-Process -NoNewWindow node -ArgumentList "scripts/auto_scanner.js" -RedirectStandardOutput "bot_output.log"
   ```
   Check the log anytime by opening `bot_output.log` in Notepad.

---

## 14. Troubleshooting Common Problems

| Problem | Solution |
|---------|----------|
| `node: command not found` | Node.js is not installed or needs a restart. Reinstall from nodejs.org and restart your computer. |
| `npm install` gives errors | Delete the `node_modules` folder and `package-lock.json`, then run `npm install` again. |
| `npx hardhat compile` fails | Make sure you ran `npm install` first. Check that `hardhat.config.js` exists in the folder. |
| Deployment says "insufficient funds" | You need more ETH on Base. Send at least $3–5 worth of ETH to your MetaMask address on the Base network. |
| Bot says "No pairs found" | The DexScreener API may be temporarily slow. Wait 5 minutes and try `node scripts/auto_pair_finder.js base` again. |
| Bot runs but never finds opportunities | This is normal! Profitable spreads are rare and brief. The bot may need to run for hours, days, or through a market crash to find substantial opportunities. |
| `.env` file errors | Make sure there are no spaces around `=` signs. The format must be exactly: `PRIVATE_KEY=0xabc123...` (no quotes, no spaces). |

---

## 15. Important Warnings & Risks

> [!CAUTION]
> **Read this entire section before using real money.**

### Financial Risks
- **The bot cannot lose your capital through bad trades** — the flash loan automatically reverts if unprofitable.
- **However, you DO pay gas fees** for each trade the bot executes. On Base, each trade costs $0.001–$0.01 in gas. If the bot executes hundreds of tiny unprofitable-after-gas trades, gas fees can accumulate.
- **Crypto markets are volatile.** The value of any profit you earn (in ETH or tokens) can drop if the market goes down.
- **This is NOT guaranteed income.** Professional firms with faster infrastructure compete for the same opportunities. A solo bot will capture only a fraction of available arbitrage.

### Security Rules
1. **NEVER share your private key or `.env` file with anyone.**
2. **NEVER paste your private key into any website, Discord, Telegram, or app.**
3. **Use a dedicated bot wallet with only $5–10 in it.** Never connect your main savings wallet.
4. **Keep your seed phrase (12 words) written on paper, stored physically.** Not in a screenshot, not in a text file.

### Legal Notice
- Arbitrage trading on decentralized exchanges is legal in most jurisdictions.
- This tool does NOT manipulate prices, exploit vulnerabilities, or harm other users. It simply buys low on one exchange and sells high on another, which actually helps equalize prices across markets (a service called "market efficiency").
- Always check the laws and regulations in your country regarding cryptocurrency trading.

---

## Quick Reference Card

| What You Want To Do | Command |
|---------------------|---------|
| Install dependencies | `npm install` |
| Compile contracts | `npx hardhat compile` |
| Run local test (no real money) | `node scripts/run_test_suite.js` |
| Test the math optimizer | `node scripts/test_math.js` |
| Deploy contract to Base | `npx hardhat run scripts/deploy.js --network base` |
| Deploy contract to Arbitrum | `npx hardhat run scripts/deploy.js --network arbitrum` |
| Find safe pairs automatically | `node scripts/auto_pair_finder.js base` |
| Start the autonomous bot | `node scripts/auto_scanner.js` |
| Stop the bot | Press `Ctrl + C` |
