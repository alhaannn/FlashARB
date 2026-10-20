# FlashARB

⚡ **High-Frequency DEX-to-DEX & Multi-Pool Flash Arbitrage Engine** (Base, Arbitrum, Ethereum & Sepolia)

FlashARB is an institutional-grade, low-latency automated arbitrage system built for EVM networks (optimized for **Base L2** and **Arbitrum**). It continuously scans Uniswap V2/V3 and Aerodrome pools, computes mathematically optimal borrow sizes to prevent price slippage impact, and executes atomic flash-loan-backed trades where transactions revert safely if net profit cannot be guaranteed.

---

## 🌟 Key Features

- **Atomic Flash Loan Execution (`FlashArbExecutor.sol`):** Borrows capital via flash loan, executes the cross-DEX swap cycle, repays principal + fee, and keeps the pure net profit in a single atomic transaction. Zero capital risk to principal.
- **Cross-DEX & Multi-Pool Support:** Works across Uniswap V2, SushiSwap, Aerodrome (Base), Uniswap V3 concentrated liquidity pools, and Slipstream.
- **WebSocket Real-Time Mempool/Sync Listener (`ws_sync_listener.js`):** Listens to `Sync` events directly over WebSockets for instant sub-second price delta detection.
- **Mathematical Borrow Optimizer (`math_optimizer.js`):** Analytical formula solving for the exact optimal input amount ($x^*$) that maximizes net profit after quadratic slippage and gas fees.
- **Automated Pair Discovery Engine (`auto_pair_finder.js`):** Auto-discovers high-volume, mispriced, and volatile token pairs across DEXes with integrated honeypot/liquidity safety filters (`token_safety_checker.js`).
- **Triangular & Cross V2/V3 Engines:** Support for 3-hop triangular cycles and hybrid V2-V3 quoter swaps.
- **Interactive Real-Time Web Dashboard:** Built with vanilla JS, HTML5, CSS, and WebSockets providing live opportunity feeds, pair management, execution logs, and one-click testing.
- **Flashbots / Private RPC Integration:** Private relay submission to prevent front-running and MEV sandwich attacks on Ethereum/Sepolia.

---

## 📁 Repository Structure

```text
flasharb/
├── contracts/
│   ├── FlashArbExecutor.sol       # Core flash loan & atomic arbitrage smart contract
│   ├── interfaces/                # Uniswap V2/V3 and WETH interface definitions
│   ├── libraries/                 # UniswapV2Library math utilities
│   └── mocks/                     # Local testnet & mock contracts (MockERC20, MockPool, etc.)
├── scripts/
│   ├── auto_pair_finder.js        # Discovers volatile & high-spread trading pairs
│   ├── auto_scanner.js            # Automated scanning daemon
│   ├── deploy.js                  # Hardhat deployment script for FlashArbExecutor
│   ├── flashbots_bundle_engine.js # Private MEV bundle builder for Flashbots
│   ├── live_scanner.js            # High-speed polling scanner
│   ├── math_optimizer.js          # Closed-form optimal trade size calculation
│   ├── run_test_suite.js          # Full end-to-end simulation suite
│   ├── setup_vps.sh               # 1-Click AWS/Ubuntu co-location setup script
│   ├── test_live_testnet_simulation.js
│   ├── test_testnet_connectivity.js
│   ├── test_triangular_arb.js
│   ├── test_v3_quoter.js
│   ├── token_safety_checker.js    # Honeypot, buy/sell tax, & liquidity verifier
│   ├── triangular_arb_engine.js   # 3-legged swap path cycle engine
│   ├── v3_quoter_engine.js        # Uniswap V3 lens quoter integration
│   └── ws_sync_listener.js        # Real-time WebSocket event listener
├── public/
│   ├── index.html                 # Web dashboard UI
│   ├── app.js                     # Dashboard frontend client & WebSocket controller
│   └── style.css                  # Modern cyber-aesthetic dashboard styling
├── test/
│   └── FlashArbExecutor.test.js   # Mocha/Chai smart contract unit tests
├── monitored_pairs.json           # Active pair tracking registry
├── hardhat.config.js              # Hardhat configuration (Base, Arbitrum, Sepolia)
├── server.js                      # Express & WebSocket bridge server
├── .env.example                   # Environment configuration template
├── .gitignore                     # Git ignore rules for keys, logs, and artifacts
└── README.md                      # Documentation
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ LTS recommended)
- **Git**
- An EVM Wallet (e.g. Coinbase Wallet, MetaMask) with a small balance for gas

### 2. Installation
```bash
git clone https://github.com/alhaannn/FlashARB.git
cd FlashARB
npm install
```

### 3. Environment Setup
Copy the example environment configuration file:
```bash
cp .env.example .env
```
Open `.env` in your editor and configure your endpoints:
```ini
# Target RPC (Alchemy, Infura, QuickNode, or public RPC)
RPC_URL=https://mainnet.base.org
BASE_RPC_URL=https://mainnet.base.org

# Wallet Private Key (Keep strictly confidential!)
PRIVATE_KEY=0xYourPrivateKeyHere

# Deployed FlashArbExecutor Contract Address
EXECUTOR_CONTRACT=0x0000000000000000000000000000000000000000

# Default DEX Pair to monitor
PAIR_A=0x...
PAIR_B=0x...

# Port for Web UI
PORT=3000
```

---

## 🖥️ Running the Application

### Launch Web Dashboard & Engine
```bash
npm start
```
Access the interactive dashboard in your browser:
👉 **`http://localhost:3000`**

From the UI, you can:
- View live price spreads and real-time block updates.
- Trigger automatic pair discovery.
- Run dry-run simulation trades.
- Execute live arbitrage transactions if opportunities exceed gas thresholds.
- Configure slip protection and min-profit margins on the fly.

### Auto-Discover Active DEX Pairs
To scan DEXes for the most lucrative spreads and update `monitored_pairs.json`:
```bash
npm run find:pairs
```

### Run the Automated Scanner CLI
```bash
npm run scanner
```

### Run the Testnet / Simulation Suite
```bash
npm run test:sim
```

---

## ⚡ Smart Contract Deployment

To compile and deploy `FlashArbExecutor.sol` to Base, Arbitrum, or Sepolia:

```bash
# 1. Compile contracts
npx hardhat compile

# 2. Deploy to Base Mainnet
npx hardhat run scripts/deploy.js --network base

# 3. Or deploy to Base Sepolia Testnet
npx hardhat run scripts/deploy.js --network base_sepolia
```

Copy the deployed contract address and set `EXECUTOR_CONTRACT` in your `.env`.

---

## ☁️ Low-Latency Cloud Co-location

For competitive edge against MEV bots, deploy co-located near chain sequencers (e.g., AWS `us-east-1` for Base / OP stack sequencers).

FlashARB includes an automated setup script for Ubuntu 22.04/24.04:
```bash
chmod +x scripts/setup_vps.sh
./scripts/setup_vps.sh
```
This configures:
- 4GB Swap memory to optimize micro/free-tier cloud instances
- Node.js LTS and build essentials
- PM2 process daemon for 24/7 uninterrupted uptime
- UFW firewall rules for security

---

## 🔒 Security Best Practices

1. **Private Keys:** Never commit `.env` or paste real private keys into public forums. The `.gitignore` file is configured to exclude sensitive files.
2. **Atomic Invariance:** All flash trades revert in `FlashArbExecutor.sol` via `require(balanceAfter >= balanceBefore + minProfit)` so transactions fail safely if front-run.
3. **Simulation First:** Always run in dry-run mode or on testnets before enabling live execution.

---

## 📄 License
MIT License. Created by [alhaannn](https://github.com/alhaannn).
