import {
  type MarketParams,
  MathLib,
  getChainAddresses,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import { isDefined } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Abi,
  type Address,
  type ContractFunctionName,
  type EncodeFunctionDataParameters,
  decodeEventLog,
  encodeAbiParameters,
  encodeFunctionData,
  maxUint128,
  parseEther,
  zeroHash,
} from "viem";
import {
  blueAbi,
  morphoMarketV1AdapterFactoryAbi,
  morphoMarketV1AdapterV2FactoryAbi,
  readContractRestructured,
  vaultV2Abi,
  vaultV2FactoryAbi,
} from "../src";

export const submitAndAccept = async <
  const abi extends Abi | readonly unknown[],
  functionName extends ContractFunctionName<abi> | undefined = undefined,
>(
  client: AnvilTestClient,
  {
    address,
    ...data
  }: EncodeFunctionDataParameters<abi, functionName> & { address: Address },
) => {
  // @ts-expect-error - safe typing
  const encoded = encodeFunctionData(data);
  await client.writeContract({
    address,
    abi: vaultV2Abi,
    functionName: "submit",
    args: [encoded],
  });
  const txHash = await client.sendTransaction({
    to: address,
    data: encoded,
  });
  await client.waitForTransactionReceipt({ hash: txHash });
};

export const deployVaultV2 = async (
  client: AnvilTestClient,
  loanToken: Address,
) => {
  const { vaultV2Factory } = getChainAddresses(client.chain.id);

  await client.deal({ amount: parseEther("1") });

  const vaultV2TxHash = await client.writeContract({
    address: vaultV2Factory!,
    abi: vaultV2FactoryAbi,
    functionName: "createVaultV2",
    args: [client.account.address, loanToken, zeroHash],
  });

  const vaultV2TxReceipt = await client.waitForTransactionReceipt({
    hash: vaultV2TxHash,
  });

  const vaultAddress = vaultV2TxReceipt.logs
    .map((log) => {
      try {
        return decodeEventLog({
          abi: vaultV2FactoryAbi.filter(
            (abi) => abi.type === "event" && abi.name === "CreateVaultV2",
          ),
          data: log.data,
          topics: log.topics,
        });
      } catch {
        return null;
      }
    })
    .filter(isDefined)[0]?.args.newVaultV2;

  if (vaultAddress == null) throw new Error("No CreateVaultV2 event found.");

  await client.writeContract({
    address: vaultAddress,
    abi: vaultV2Abi,
    functionName: "setCurator",
    args: [client.account.address],
  });
  await submitAndAccept(client, {
    address: vaultAddress,
    abi: vaultV2Abi,
    functionName: "setIsAllocator",
    args: [client.account.address, true],
  });

  return vaultAddress;
};

export async function deployMorphoMarketV1Adapter(
  client: AnvilTestClient,
  vaultAddress: Address,
  version: "1" | "2",
): Promise<{ address: Address }>;
export async function deployMorphoMarketV1Adapter(
  client: AnvilTestClient,
  vaultAddress: Address,
  version: "1" | "2",
  initialSetup: { marketParams: MarketParams; deposit: bigint },
): Promise<{ address: Address; supplyShares: bigint }>;
export async function deployMorphoMarketV1Adapter(
  client: AnvilTestClient,
  vaultAddress: Address,
  version: "1" | "2",
  initialSetup?: { marketParams: MarketParams; deposit: bigint },
): Promise<{ address: Address; supplyShares?: bigint }> {
  const {
    morphoMarketV1AdapterV2Factory,
    morphoMarketV1AdapterFactory,
    morpho,
  } = getChainAddresses(client.chain.id);

  const txHash = await (version === "2"
    ? client.writeContract({
        address: morphoMarketV1AdapterV2Factory!,
        abi: morphoMarketV1AdapterV2FactoryAbi,
        functionName: "createMorphoMarketV1AdapterV2",
        args: [vaultAddress],
      })
    : client.writeContract({
        address: morphoMarketV1AdapterFactory!,
        abi: morphoMarketV1AdapterFactoryAbi,
        functionName: "createMorphoMarketV1Adapter",
        args: [vaultAddress, morpho],
      }));

  const receipt = await client.waitForTransactionReceipt({ hash: txHash });

  const adapterAddress =
    version === "2"
      ? receipt.logs
          .map((log) => {
            try {
              return decodeEventLog({
                abi: morphoMarketV1AdapterV2FactoryAbi.filter(
                  (abi) =>
                    abi.type === "event" &&
                    abi.name === "CreateMorphoMarketV1AdapterV2",
                ),
                data: log.data,
                topics: log.topics,
              });
            } catch {
              return null;
            }
          })
          .filter(isDefined)[0]?.args.morphoMarketV1AdapterV2
      : receipt.logs
          .map((log) => {
            try {
              return decodeEventLog({
                abi: morphoMarketV1AdapterFactoryAbi.filter(
                  (abi) =>
                    abi.type === "event" &&
                    abi.name === "CreateMorphoMarketV1Adapter",
                ),
                data: log.data,
                topics: log.topics,
              });
            } catch {
              return null;
            }
          })
          .filter(isDefined)[0]?.args.morphoMarketV1Adapter;

  if (adapterAddress == null)
    throw new Error("No CreateMorphoMarketV1Adapter(V2) event found.");

  await submitAndAccept(client, {
    address: vaultAddress,
    abi: vaultV2Abi,
    functionName: "addAdapter",
    args: [adapterAddress],
  });

  if (!initialSetup) return { address: adapterAddress };

  const { marketParams, deposit } = initialSetup;

  await client.writeContract({
    address: vaultAddress,
    abi: vaultV2Abi,
    functionName: "setLiquidityAdapterAndData",
    args: [
      adapterAddress,
      encodeAbiParameters(
        [
          {
            type: "tuple",
            components: [
              { type: "address", name: "loanToken" },
              { type: "address", name: "collateralToken" },
              { type: "address", name: "oracle" },
              { type: "address", name: "irm" },
              { type: "uint256", name: "lltv" },
            ],
          },
        ],
        [marketParams],
      ),
    ],
  });

  const ids = [
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }],
      ["this", adapterAddress],
    ),
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }],
      ["collateralToken", marketParams.collateralToken],
    ),
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }, marketParamsAbi],
      ["this/marketParams", adapterAddress, marketParams],
    ),
  ];

  for (const id of ids) {
    await submitAndAccept(client, {
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "increaseAbsoluteCap",
      args: [id, maxUint128],
    });
    await submitAndAccept(client, {
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "increaseRelativeCap",
      args: [id, MathLib.WAD],
    });
  }

  await client.deal({
    erc20: marketParams.loanToken,
    amount: deposit,
  });
  await client.approve({
    address: marketParams.loanToken,
    args: [vaultAddress, deposit],
  });
  await client.writeContract({
    address: vaultAddress,
    abi: vaultV2Abi,
    functionName: "deposit",
    args: [deposit, client.account.address],
  });

  const { supplyShares } = await readContractRestructured(client, {
    address: morpho,
    abi: blueAbi,
    functionName: "position",
    args: [marketParams.id, adapterAddress],
  });

  return { address: adapterAddress, supplyShares };
}
