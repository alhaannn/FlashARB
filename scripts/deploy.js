import hre from "hardhat";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  console.log("=========================================================");
  console.log("       Deploying FlashArbExecutor to Live Network        ");
  console.log("=========================================================\n");

  console.log(`Deployer Address: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account Balance:  ${ethers.formatEther(balance)} ETH`);

  // Detect network and set canonical WETH address
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  let wethAddress = process.env.WETH_ADDRESS;

  if (!wethAddress) {
    if (chainId === 8453) {
      // Base Mainnet WETH
      wethAddress = "0x4200000000000000000000000000000000000006";
      console.log(`Detected Network: Base Mainnet (Chain ID: 8453)`);
    } else if (chainId === 84532) {
      // Base Sepolia Testnet WETH
      wethAddress = "0x4200000000000000000000000000000000000006";
      console.log(`Detected Network: Base Sepolia Testnet (Chain ID: 84532)`);
    } else if (chainId === 42161) {
      // Arbitrum One WETH
      wethAddress = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
      console.log(`Detected Network: Arbitrum One (Chain ID: 42161)`);
    } else if (chainId === 11155111) {
      // Sepolia Testnet WETH
      wethAddress = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
      console.log(`Detected Network: Sepolia Testnet`);
    } else {
      // Default to Ethereum Mainnet WETH
      wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
      console.log(`Defaulting to Mainnet WETH: ${wethAddress}`);
    }
  }

  console.log(`Using WETH Address: ${wethAddress}\n`);

  console.log("Deploying contract...");
  const FlashArb = await ethers.getContractFactory("FlashArbExecutor");
  const executor = await FlashArb.deploy(wethAddress);
  await executor.waitForDeployment();

  console.log(`\n🎉 FlashArbExecutor successfully deployed!`);
  console.log(`Contract Address: ${executor.target}`);

  // Automatically update .env
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf8");
    if (envContent.includes("EXECUTOR_CONTRACT=")) {
      envContent = envContent.replace(/EXECUTOR_CONTRACT=.*/, `EXECUTOR_CONTRACT=${executor.target}`);
    } else {
      envContent += `\nEXECUTOR_CONTRACT=${executor.target}\n`;
    }
    fs.writeFileSync(envPath, envContent, "utf8");
    console.log(`\n✅ Automatically updated EXECUTOR_CONTRACT in .env to: ${executor.target}`);
  }

  const explorerUrl = chainId === 8453 ? `https://basescan.org/address/${executor.target}` : `https://sepolia.basescan.org/address/${executor.target}`;
  console.log(`\nExplore on Basescan: ${explorerUrl}`);
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
