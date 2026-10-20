import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import "dotenv/config";

const rawKey = process.env.PRIVATE_KEY?.trim();
const formattedKey = rawKey ? (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) : null;
const accounts = formattedKey && formattedKey.length === 66 ? [formattedKey] : [];

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  plugins: [hardhatEthers],
  solidity: {
    version: "0.8.20",
    settings: {
      viaIR: false,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    base: {
      type: "http",
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: accounts,
    },
    arbitrum: {
      type: "http",
      url: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
      accounts: accounts,
    },
    sepolia: {
      type: "http",
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      accounts: accounts,
    },
    base_sepolia: {
      type: "http",
      url: process.env.BASE_SEPOLIA_RPC_URL || process.env.RPC_URL || "https://sepolia.base.org",
      accounts: accounts,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
  },
};
