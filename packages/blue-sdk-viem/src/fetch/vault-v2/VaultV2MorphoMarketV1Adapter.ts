import {
  AccrualVaultV2MorphoMarketV1Adapter,
  UnknownFactory,
  UnknownOfFactory,
  VaultV2MorphoMarketV1Adapter,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import {
  type Address,
  BaseError,
  type Client,
  ContractFunctionRevertedError,
} from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  morphoMarketV1AdapterAbi,
  morphoMarketV1AdapterFactoryAbi,
} from "../../abis";
import {
  abi,
  code,
} from "../../queries/vault-v2/GetVaultV2MorphoMarketV1Adapter";
import type { DeploylessFetchParameters } from "../../types";
import { readContractRestructured } from "../../utils";
import { fetchAccrualPosition } from "../Position";

export async function fetchVaultV2MorphoMarketV1Adapter(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { morphoMarketV1AdapterFactory } = getChainAddresses(
    parameters.chainId,
  );

  if (!morphoMarketV1AdapterFactory) {
    throw new UnknownFactory();
  }

  if (deployless) {
    try {
      const adapter = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [address, morphoMarketV1AdapterFactory],
      });

      return new VaultV2MorphoMarketV1Adapter({
        ...adapter,
        marketParamsList: [...adapter.marketParamsList],
        address,
      });
    } catch (error) {
      if (deployless === "force") throw error;
      // Fallback to multicall if deployless call fails.

      if (error instanceof BaseError) {
        const revertError = error.walk(
          (err) => err instanceof ContractFunctionRevertedError,
        );
        if (
          revertError instanceof ContractFunctionRevertedError &&
          revertError.data?.errorName === "UnknownOfFactory"
        )
          throw error;
      }
    }
  }

  const [
    isMorphoMarketV1Adapter,
    parentVault,
    skimRecipient,
    marketParamsListLength,
  ] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      args: [address],
    }) // Factory may not have been deployed at requested block tag.
      .catch(() => false),
    readContract(client, {
      ...parameters,
      address,
      abi: morphoMarketV1AdapterAbi,
      functionName: "parentVault",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: morphoMarketV1AdapterAbi,
      functionName: "skimRecipient",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: morphoMarketV1AdapterAbi,
      functionName: "marketParamsListLength",
    }),
  ]);

  if (!isMorphoMarketV1Adapter) {
    throw new UnknownOfFactory(morphoMarketV1AdapterFactory, address);
  }

  const marketParamsList = await Promise.all(
    Array.from({ length: Number(marketParamsListLength) }, (_, i) =>
      readContractRestructured(client, {
        ...parameters,
        address,
        abi: morphoMarketV1AdapterAbi,
        functionName: "marketParamsList",
        args: [BigInt(i)],
      }),
    ),
  );

  return new VaultV2MorphoMarketV1Adapter({
    parentVault,
    skimRecipient,
    address,
    marketParamsList,
  });
}

export async function fetchAccrualVaultV2MorphoMarketV1Adapter(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  const adapter = await fetchVaultV2MorphoMarketV1Adapter(
    address,
    client,
    parameters,
  );
  const positions = await Promise.all(
    adapter.marketParamsList.map((params) =>
      fetchAccrualPosition(address, params.id, client, parameters),
    ),
  );

  return new AccrualVaultV2MorphoMarketV1Adapter(adapter, positions);
}
