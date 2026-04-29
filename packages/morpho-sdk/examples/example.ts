/**
 * Example: Using Morpho SDK with MorphoClient
 *
 * This example demonstrates how to use the Morpho SDK
 * by creating a MorphoClient instance.
 */

import dotenv from "dotenv";
import { http, type Address, createWalletClient, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { MorphoClient } from "../src/client/index.js";
import { env } from "../test/env.js";

// Load environment variables
dotenv.config();

// Example vault address
const VAULT_ADDRESS: Address = "0xbeeff2C5bF38f90e3482a8b19F12E5a6D2FCa757"; // Example vault address
const USER_ADDRESS: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Example user address

async function main() {
  const { MAINNET_RPC_URL } = env();
  if (!VAULT_ADDRESS) {
    throw new Error("VAULT_ADDRESS is required");
  }
  if (!USER_ADDRESS) {
    throw new Error("USER_ADDRESS is required");
  }

  // Create wallet client
  const walletClient = createWalletClient({
    chain: mainnet,
    transport: http(MAINNET_RPC_URL),
  });

  // Create Morpho client
  const morpho = new MorphoClient(walletClient);

  console.log("🔷 Morpho SDK Example - MorphoClient");
  console.log("====================================\n");
  console.log(`Chain: ${mainnet.name} (${mainnet.id})`);
  console.log(`Vault: ${VAULT_ADDRESS}\n`);

  // Get vault instance
  const vault = morpho.vaultV2(VAULT_ADDRESS, mainnet.id);

  // Example 1: Create a deposit transaction
  console.log("📥 Creating deposit transaction...");
  const depositAmount = parseUnits("1", 18); // 1 token (18 decimals)
  const accrualVault = await vault.getData();
  const deposit = vault.deposit({
    amount: depositAmount,
    userAddress: USER_ADDRESS,
    accrualVault,
  });
  const depositTx = deposit.buildTx();

  console.log("Deposit transaction:", {
    to: depositTx.to,
    data: depositTx.data,
    value: depositTx.value,
  });

  // Get requirements (e.g., ERC20 approval)
  console.log("\n📋 Checking requirements...");
  const requirements = await deposit.getRequirements();
  console.log(`Found ${requirements.length} requirement(s)`);
  requirements.forEach((req, index) => {
    console.log(`  Requirement ${index + 1}:`, req);
  });

  // Example 2: Create a withdraw transaction
  console.log("\n📤 Creating withdraw transaction...");
  const withdrawAmount = parseUnits("1", 18); // 1 token
  const withdraw = vault.withdraw({
    amount: withdrawAmount,
    userAddress: USER_ADDRESS,
  });
  const withdrawTx = withdraw.buildTx();

  console.log("Withdraw transaction:", {
    to: withdrawTx.to,
    data: withdrawTx.data,
    value: withdrawTx.value,
  });

  // Example 3: Create a redeem transaction
  console.log("\n💱 Creating redeem transaction...");
  const redeemShares = parseUnits("1", 18); // 1 share
  const redeem = vault.redeem({
    shares: redeemShares,
    userAddress: USER_ADDRESS,
  });
  const redeemTx = redeem.buildTx();

  console.log("Redeem transaction:", {
    to: redeemTx.to,
    data: redeemTx.data,
    value: redeemTx.value,
  });

  // Example 4: Get vault data
  console.log("\n📊 Fetching vault data...");
  const vaultData = await vault.getData();
  console.log("Vault data:", {
    address: vaultData.address,
    asset: vaultData.asset,
  });

  console.log("\n✅ Examples completed successfully!");
  console.log(
    "\n💡 Note: These are example transactions. To actually send them:",
  );
}

main()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
