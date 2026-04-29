import { getChainAddresses } from "@morpho-org/blue-sdk";
import { vaultV2FactoryAbi } from "@morpho-org/blue-sdk-viem";
import type { AnvilTestClient } from "@morpho-org/test";
import { type Address, decodeEventLog, parseEventLogs, toHex } from "viem";

export async function createVaultV2(params: {
  client: AnvilTestClient;
  asset: Address;
  chainId: number;
}) {
  const { client, asset, chainId } = params;
  const { vaultV2Factory } = getChainAddresses(chainId);

  if (!vaultV2Factory) {
    throw new Error(`VaultV2 factory not found for chain ${chainId}`);
  }

  const txHash = await client.writeContract({
    address: vaultV2Factory,
    abi: vaultV2FactoryAbi,
    functionName: "createVaultV2",
    args: [client.account?.address, asset, toHex(0n, { size: 32 })],
  });

  const txReceipt = await client.waitForTransactionReceipt({
    hash: txHash,
  });

  const [vaultCreatedEvent] = parseEventLogs({
    abi: vaultV2FactoryAbi,
    logs: txReceipt.logs,
    eventName: "CreateVaultV2",
  });

  if (!vaultCreatedEvent) {
    throw new Error("Could not find CreateVault event in transaction receipt");
  }

  const decoded = decodeEventLog({
    abi: vaultV2FactoryAbi,
    data: vaultCreatedEvent.data,
    topics: vaultCreatedEvent.topics,
  });

  const vaultAddress = decoded.args.newVaultV2;

  return { address: vaultAddress };
}
