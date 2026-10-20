# 🌐 FlashArb PRO Web App — Complete Beginner's Manual

> **Who is this guide for?**  
> This guide is written for complete beginners. Even if you have never opened a terminal, never touched code, or never used crypto trading tools before, every single step is explained in plain, simple English.

---

## 📑 Table of Contents
1. [What is This Web App? (In 30 Seconds)](#1-what-is-this-web-app-in-30-seconds)
2. [How to Start the Web App (First Time)](#2-how-to-start-the-web-app-first-time)
3. [How to Open It in Your Browser](#3-how-to-open-it-in-your-browser)
4. [Tour of Every Tab & Button (How to Use It)](#4-tour-of-every-tab--button-how-to-use-it)
   - [Tab 1: Command Center & Live Terminal](#tab-1-command-center--live-terminal)
   - [Tab 2: Pair Discovery Engine](#tab-2-pair-discovery-engine)
   - [Tab 3: Honeypot & Security Auditor](#tab-3-honeypot--security-auditor)
   - [Tab 4: Flash Loan Sizing & Profit Optimizer](#tab-4-flash-loan-sizing--profit-optimizer)
   - [Tab 5: Config & Keys (.env Settings)](#tab-5-config--keys-env-settings)
5. [How to Safely Close / Stop the App](#5-how-to-safely-close--stop-the-app)
6. [How to Re-Run It Tomorrow (Or After Restarting Your PC)](#6-how-to-re-run-it-tomorrow-or-after-restarting-your-pc)
7. [Troubleshooting Common Issues](#7-troubleshooting-common-issues)
8. [Important Safety & Rules](#8-important-safety--rules)

---

## 1. What is This Web App? (In 30 Seconds)

Normally, trading bots require typing complicated black-screen terminal commands like `node scripts/auto_scanner.js --chain base`.

The **FlashArb PRO Web App** gives you a **visual control dashboard** (like a flight cockpit) where you can:
* **Watch Flash Swaps Happen Live:** Run safe, simulated flash swaps with zero money at risk.
* **Find Profitable Coin Discrepancies:** Discover coins priced differently on two exchanges (e.g., Uniswap vs. Aerodrome).
* **Scan for Scams & Honeypots:** Ensure a token isn't a scam before touching it.
* **Calculate Maximum Profits:** Automatically calculate the ideal trade size without doing math by hand.
* **Manage Settings Easily:** Change networks, RPC endpoints, and keys without breaking text files.

---

## 2. How to Start the Web App (First Time)

Follow these exact steps:

### Step 1: Open the Project Folder in Terminal
1. Open your project folder (`Flash-USDT`) on your desktop.
2. In the folder address bar at the top of Windows File Explorer, click the empty space, type:
   ```powershell
   powershell
   ```
   and press **Enter**.
   *(Alternatively, open VS Code, go to the top menu, click **Terminal** ➔ **New Terminal**).*

### Step 2: Type the Start Command
In the terminal window, type:
```powershell
npm start
```
and press **Enter**.

### Step 3: What You Should See
Within 2 to 3 seconds, you will see a banner:
```text
=========================================================
 Flash Arbitrage Web App Running at http://localhost:3000
=========================================================
```
> 💡 **Keep this terminal window open!** The terminal is the "engine" that powers the website. If you close this black window, the website stops.

---

## 3. How to Open It in Your Browser

1. Open Google Chrome, Brave, Microsoft Edge, or Firefox.
2. In the URL address bar at the very top, type:
   ```
   http://localhost:3000
   ```
3. Press **Enter**.
4. You will see the **FlashArb PRO** dark-mode command center!

---

## 4. Tour of Every Tab & Button (How to Use It)

The web app has 5 tabs on the left sidebar:

```
[📊 Command Center]   ➔ Live logs, status radar, and simulation runner
[🔍 Pair Discovery]   ➔ Scans DexScreener for multi-exchange tokens
[🛡️ Honeypot Auditor] ➔ Checks whether a token is a safe or a scam
[⚡ Profit Optimizer] ➔ Solves the best flash loan size and profit
[⚙️ Config & Keys]    ➔ Edits your RPC, wallet, and .env settings
```

---

### Tab 1: Command Center & Live Terminal

This is your main dashboard.

#### 🌟 The Big "1-Click 100% Autopilot" Button (The Recommended Way to Run)
Instead of clicking 5 different tabs manually, use the **`🚀 START 100% AUTOPILOT`** button at the top of the Command Center:

* **What it does when you click it ONCE:**
  1. **Phase 1: Finds Pairs:** Automatically queries DexScreener for multi-exchange coins on Base.
  2. **Phase 2: Audits Safety:** Instantly audits every coin through GoPlus Security. Safe coins are added to your active watchlist; scam honeypots are blocked and dropped!
  3. **Phase 3: Mathematical Sizing:** Reads real-time pool reserves and calculates the optimal borrow amount.
  4. **Phase 4: Executes Flash Swaps:** Executes the trade, pays the 85% block builder tip, and secures net profit.
  5. **Phase 5: Records Every Log & Profit:** Automatically adds the trade to the **Autopilot Realized Trades History** table, increments your **Cumulative Net Profit** counter, and writes an exact timestamped record to `logs/autopilot_history.log`.
* **Can I walk away and come back hours later?**
  - **YES!** You can leave the browser tab open and leave your computer running for hours. When you come back, look at the big green **Cumulative Net Profit** card (e.g. `$155.40 USD`), check your trade count, and click **`📥 Download Complete Log (.log)`** to save the full history!
* **How to pause it:**
  - Click the button again (it turns red: **`⏹ STOP AUTOPILOT`**).

---

#### 2. The Secondary Action Buttons:
* **`▶ Run Local Sim` or `Run Hardhat Simulation` (Safe Sandbox Demo):**
  - **What it does:** Deploys a test smart contract on a simulated blockchain inside your computer, finds a mock 10% price spread, borrows 2.0 WETH with $0 collateral, sells it on DEX B, repays DEX A, and deposits +207 Token profit!
  - **Is there any risk?** **$0. Zero risk.** It runs entirely in memory without touching real money.
  - **How to use it:** Just click it once! Watch the live terminal stream the transactions in green text.
* **`⚡ Start Auto-Scanner`:**
  - **What it does:** Starts continuously monitoring the loaded pairs in the background.
  - **How to stop it:** Click the button again (it turns into `Stop Auto-Scanner`).
* **`Clear Terminal`:**
  - Clears the black console screen if you want a fresh view.
* **`Auto-scroll Terminal` (Toggle):**
  - Keeps the terminal scrolled to the newest messages automatically.

---

### Tab 2: Pair Discovery Engine

This tab finds tokens listed on multiple exchanges where prices might be different.

#### How to run a scan:
1. Click **`Pair Discovery`** on the left menu.
2. Select your blockchain:
   - **Base (Recommended):** Gas fees cost less than 1 cent ($0.005), making it the best place for beginners.
   - **Arbitrum One:** Also fast and low cost.
   - **Ethereum Mainnet:** High gas fees (only for large capital).
3. **Min Pool Liquidity ($USD):** Default is `$2,000`. This ignores tiny pools that don't have enough money to trade.
4. Click **`⚡ Scan DEX Markets`**.
5. Wait 10–20 seconds. The bot connects to DexScreener, filters active pairs, runs an automatic safety check, and shows them in the table!
6. In the table, you will see:
   - **DEX A (Borrow):** The first exchange (e.g., Aerodrome).
   - **DEX B (Target):** The second exchange (e.g., Uniswap).
   - **Price Spread:** The difference in price. Green means there is a gap!
   - **Actions:**
     - Click **`⚡ Sizing`** to immediately load this coin into the profit calculator!
     - Click **`🛡️ Audit`** to check if the contract has honeypot traps.

---

### Tab 3: Honeypot & Security Auditor

> ⚠️ **Why is this important?**  
> Scammers create fake coins with hidden code saying: *"Anyone can buy, but only the creator can sell."* If you buy one of these, your money is trapped forever. This is called a **Honeypot**.

#### How to audit any coin:
1. Click **`Honeypot Auditor`** on the left menu.
2. Paste the coin's contract address (starts with `0x...`) into the input box.
3. Select the network (e.g., `Base`).
4. Click **`🛡️ Audit Contract`**.
5. The system contacts the GoPlus Security Engine and checks:
   - ✅ **Honeypot Trap:** Is the sell function blocked?
   - ✅ **Buy/Sell Tax:** Does the creator steal a 10% or 50% fee on trades? (Legitimate coins have 0% or < 1% tax).
   - ✅ **Blacklist:** Can the creator blacklist your address?
   - ✅ **Open Source:** Is the code public and verified?
6. You get a big badge:
   - 🟢 **SAFE (Green):** Passed all tests.
   - 🔴 **UNSAFE (Red):** Risk detected! Do not trade this coin.

---

### Tab 4: Flash Loan Sizing & Profit Optimizer

This tab solves the biggest question in arbitrage:  
*"How much should I borrow to make the highest profit?"*

#### The Golden Rule of Slippage:
* If you borrow **too little** (e.g., $10), your profit is tiny (e.g., $0.05).
* If you borrow **too much** (e.g., $500,000), your trade crashes the price on the exchange (**slippage**), and you lose money!
* There is one **exact mathematical sweet spot** in the middle. This tab calculates it for you automatically.

#### How to use it:
1. Click **`Profit Optimizer`** on the left menu.
2. Pick a preset from the top dropdown:
   - `Preset: Hardhat Simulation (+10% Spread)`
   - `Preset: Exotic Meme Pair (+5% Spread)`
3. Adjust the **Validator Tip (MEV Bribe) Slider**:
   - In MEV arbitrage, you tip the block builder (usually 85%–90% of the profit) so they include your private bundle first and protect you from competitors.
4. Click **`⚡ Compute Optimal Trade`**.
5. Read the results:
   - **Optimal Borrow Amount:** The exact size to borrow.
   - **Gross Arbitrage Profit:** Total profit from the price difference.
   - **Validator Bribe (85%):** Tip paid to the validator.
   - **Net Searcher Profit:** Pure profit kept in your pocket!
6. Look at the **Slippage Convexity Table** below:
   - See how borrowing 100% of optimal yields maximum profit, while borrowing 200% or 300% drops the profit into the negative!

---

### Tab 5: Config & Keys (.env Settings)

This tab lets you configure your environment safely without having to edit hidden files manually.

#### What each field does:
* **Blockchain Network:** Choose between Base, Arbitrum, Ethereum, or Sepolia Testnet.
* **RPC Provider URL:** The internet connection to the blockchain.
  - Shortcut: Click **`Base Public`** or **`Arbitrum Public`** to fill in working public RPCs automatically!
* **Searcher Wallet Private Key:**
  - Click the **👁 Show / 🙈 Hide** button to reveal or hide the text.
  - **Where is this stored?** Strictly on your computer inside the `.env` file. It is **never** sent to any external server.
* **FlashArbExecutor Contract Address:** The address of your deployed smart contract on the blockchain.
* Click **`💾 Save Configuration (.env)`** to apply changes.

---

## 5. How to Safely Close / Stop the App

When you are done for the day:

1. Close the browser tab.
2. Go to the terminal window running `npm start`.
3. Press:
   ```
   Ctrl + C
   ```
   *(Hold down the `Ctrl` key and tap the letter `C`)*.
4. If it asks: `Terminate batch job (Y/N)?`, type:
   ```
   Y
   ```
   and press **Enter**.
5. The web server is now safely stopped.

---

## 6. How to Re-Run It Tomorrow (Or After Restarting Your PC)

Whenever you turn on your computer again:

1. Open your `Flash-USDT` folder.
2. In the folder address bar, type `powershell` and press **Enter**.
3. Type:
   ```powershell
   npm start
   ```
   and press **Enter**.
4. Open your browser to:
   ```
   http://localhost:3000
   ```
That's it! Everything starts right where you left off.

---

## 7. Troubleshooting Common Issues

### Issue 1: "Error: listen EADDRINUSE: address already in use :::3000"
* **What it means:** Another terminal or background process is already using port 3000.
* **How to fix it:**
  In PowerShell, run this command to close whatever is using port 3000:
  ```powershell
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force
  ```
  Then run `npm start` again.

---

### Issue 2: Browser says "This site can't be reached" (localhost refused to connect)
* **What it means:** The terminal server is not running.
* **How to fix it:**
  1. Check if the terminal window running `npm start` is still open.
  2. If not, open PowerShell in the folder and type `npm start`.
  3. Wait until you see `Flash Arbitrage Web App Running at http://localhost:3000`.
  4. Refresh your browser page.

---

### Issue 3: "RPC Offline" in the top-left status card
* **What it means:** The public blockchain node is temporarily busy or unreachable.
* **How to fix it:**
  1. Go to **Config & Keys** tab.
  2. Under RPC Provider URL, click **`Base Public`** or paste a free personal RPC from [Alchemy.com](https://www.alchemy.com/) or [Infura.io](https://www.infura.io/).
  3. Click **`💾 Save Configuration`**.

---

### Issue 4: "Cannot find module 'express'" or "'npm' is not recognized"
* **What it means:** Node.js or project packages were not installed in this folder.
* **How to fix it:**
  1. Make sure Node.js is installed from [nodejs.org](https://nodejs.org/).
  2. In your terminal, run:
     ```powershell
     npm install
     ```
  3. Once finished, run `npm start`.

---

## 8. Important Safety & Rules

1. **Always Use Simulation First:**  
   Before putting real money on the line, use the **`Run Hardhat Simulation`** button and test on testnets (like Base Sepolia).
2. **Never Share Your Private Key:**  
   No legitimate developer, website, or support agent will ever ask for your private key. Keep it secret.
3. **Check Every Token on GoPlus / TokenSniffer:**  
   Never execute a flash swap on a brand-new token without checking its Honeypot score in Tab 3.
4. **Flash Loans Protect Your Capital:**  
   Because flash swaps execute in an "all-or-nothing" smart contract transaction, if a trade is not profitable, the contract reverts. You cannot lose your borrowed principal—you only pay transaction gas fees (which on Base L2 are pennies).

---

## 🚀 Quick Command Summary

| What you want to do | Command to type in PowerShell |
|---|---|
| **Start the Web Dashboard** | `npm start` |
| **Open the Dashboard** | Open `http://localhost:3000` in browser |
| **Stop the Web Dashboard** | Press `Ctrl + C` in PowerShell |
| **Run local test simulation** | `npm run test:sim` |
| **Discover new pairs in terminal** | `npm run find:pairs` |
