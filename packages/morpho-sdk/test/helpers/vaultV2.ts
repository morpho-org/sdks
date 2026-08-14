import { getChainAddresses } from "@morpho-org/blue-sdk";
import {
  morphoMarketV1AdapterV2FactoryAbi,
  vaultV2Abi,
  vaultV2FactoryAbi,
} from "@morpho-org/blue-sdk-viem";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  decodeEventLog,
  type Hex,
  parseEther,
  parseEventLogs,
  toHex,
} from "viem";

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

export const submitAndAcceptVaultV2Call = async (
  client: AnvilTestClient,
  params: { readonly vault: Address; readonly data: Hex },
) => {
  const { vault, data } = params;
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "submit",
    args: [data],
  });
  const hash = await client.sendTransaction({ to: vault, data });
  await client.waitForTransactionReceipt({ hash });
};

export const deployVaultV2 = async (
  client: AnvilTestClient,
  asset: Address,
) => {
  await client.deal({ amount: parseEther("1") });
  const { address: vault } = await createVaultV2({
    client,
    asset,
    chainId: client.chain.id,
  });
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "setCurator",
    args: [client.account.address],
  });

  return vault;
};

export const deployMorphoMarketV1AdapterV2 = async (
  client: AnvilTestClient,
  vault: Address,
) => {
  const { morphoMarketV1AdapterV2Factory } = getChainAddresses(client.chain.id);
  const hash = await client.writeContract({
    address: morphoMarketV1AdapterV2Factory!,
    abi: morphoMarketV1AdapterV2FactoryAbi,
    functionName: "createMorphoMarketV1AdapterV2",
    args: [vault],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const event = receipt.logs
    .map((log) => {
      try {
        return decodeEventLog({
          abi: morphoMarketV1AdapterV2FactoryAbi,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        return undefined;
      }
    })
    .find(
      (candidate) =>
        candidate?.eventName === "CreateMorphoMarketV1AdapterV2" &&
        "morphoMarketV1AdapterV2" in candidate.args,
    );
  if (event?.eventName !== "CreateMorphoMarketV1AdapterV2") {
    throw new Error("No CreateMorphoMarketV1AdapterV2 event found.");
  }

  return event.args.morphoMarketV1AdapterV2;
};
