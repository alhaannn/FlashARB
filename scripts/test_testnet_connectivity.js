import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("=========================================================");
  console.log("      FlashArb PRO - Testnet Connectivity & Health Check ");
  console.log("=========================================================\n");

  const chain = process.env.CHAIN || "base_sepolia";
  let rpcUrl = process.env.RPC_URL;

  if (!rpcUrl) {
    if (chain === "base_sepolia") {
      rpcUrl = "https://sepolia.base.org";
    } else if (chain === "sepolia") {
      rpcUrl = "https://rpc.sepolia.org";
    } else {
      rpcUrl = "https://sepolia.base.org";
    }
  }

  console.log(`Target Network : ${chain.toUpperCase()}`);
  console.log(`RPC Endpoint   : ${rpcUrl}`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  try {
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ Connected to RPC successfully!`);
    console.log(`   Chain ID    : ${network.chainId}`);
    console.log(`   Latest Block: #${blockNumber}\n`);
  } catch (err) {
    console.error(`❌ Failed to connect to RPC (${rpcUrl}): ${err.message}`);
    process.exit(1);
  }

  // Check Private Key
  const rawKey = process.env.PRIVATE_KEY?.trim();
  const privateKey = rawKey ? (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) : null;
  if (!privateKey || privateKey.includes("your_private_key") || privateKey.length < 66) {
    console.log("⚠️ No valid PRIVATE_KEY found in your .env file.");
    console.log("👉 Add your testnet wallet private key to .env: PRIVATE_KEY=0x...");
    console.log("\nFaucet Links to get free testnet ETH:");
    console.log("  - Base Sepolia CDP Faucet : https://portal.cdp.coinbase.com/products/faucet");
    console.log("  - Superchain Faucet       : https://console.optimism.io/faucet");
    console.log("  - Alchemy Base Sepolia    : https://www.alchemy.com/faucets/base-sepolia");
    console.log("  - Google Sepolia Faucet   : https://cloud.google.com/application/web3/faucet/ethereum/sepolia\n");
    return;
  }

  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`Wallet Address : ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    const balanceEth = ethers.formatEther(balance);
    console.log(`Wallet Balance : ${balanceEth} ETH`);

    if (parseFloat(balanceEth) === 0) {
      console.log("\n⚠️ Your testnet wallet has 0.00 ETH!");
      console.log("👉 Claim free testnet ETH from one of these faucets:");
      console.log("   1. Base Sepolia (Coinbase) : https://portal.cdp.coinbase.com/products/faucet");
      console.log("   2. Superchain Faucet       : https://console.optimism.io/faucet");
      console.log("   3. Sepolia PoW Faucet      : https://sepolia-faucet.pk910.de/");
      console.log("   4. Google Sepolia Faucet   : https://cloud.google.com/application/web3/faucet/ethereum/sepolia");
    } else {
      console.log(`\n🎉 Wallet is funded with ${balanceEth} testnet ETH!`);
      console.log("You have sufficient gas to deploy your contract and run test arbitrage.");
    }

    // Check Deployed Contract if configured
    const contractAddress = process.env.EXECUTOR_CONTRACT;
    if (contractAddress && contractAddress.startsWith("0x") && contractAddress !== "0x0000000000000000000000000000000000000000") {
      console.log(`\nChecking Deployed Contract at: ${contractAddress}...`);
      const code = await provider.getCode(contractAddress);
      if (code && code !== "0x") {
        console.log(`✅ FlashArbExecutor contract bytecode confirmed on-chain! (${code.length / 2} bytes)`);
        const contract = new ethers.Contract(contractAddress, [
          "function owner() view returns (address)",
          "function WETH() view returns (address)"
        ], provider);
        try {
          const owner = await contract.owner();
          const weth = await contract.WETH();
          console.log(`   Contract Owner : ${owner}`);
          console.log(`   Canonical WETH : ${weth}`);
          if (owner.toLowerCase() === wallet.address.toLowerCase()) {
            console.log(`   Ownership Status: ✅ Verified! (You are the contract owner)`);
          }
        } catch {}
      } else {
        console.log(`⚠️ No contract bytecode found at ${contractAddress}. Have you deployed to this network?`);
      }
    } else {
      console.log("\nℹ️ No EXECUTOR_CONTRACT specified in .env yet.");
      console.log("👉 To deploy your contract to Base Sepolia, run:");
      console.log("   npx hardhat run scripts/deploy.js --network base_sepolia");
    }
  } catch (err) {
    console.error(`Error testing wallet: ${err.message}`);
  }

  console.log("\n=========================================================");
}

main().catch(console.error);
