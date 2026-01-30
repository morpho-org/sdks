import {
  AccrualVaultV2MorphoMarketV1AdapterV2,
  type MarketId,
  UnknownFactory,
  UnknownOfFactory,
  VaultV2MorphoMarketV1AdapterV2,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { fromEntries } from "@morpho-org/morpho-ts";
import {
  type Address,
  BaseError,
  type Client,
  ContractFunctionRevertedError,
} from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  morphoMarketV1AdapterV2Abi,
  morphoMarketV1AdapterV2FactoryAbi,
} from "../../abis";
import {
  abi,
  code,
} from "../../queries/vault-v2/GetVaultV2MorphoMarketV1AdapterV2";
import type { DeploylessFetchParameters } from "../../types";
import { fetchMarket } from "../Market";

export async function fetchVaultV2MorphoMarketV1AdapterV2(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { morphoMarketV1AdapterV2Factory } = getChainAddresses(
    parameters.chainId,
  );

  if (!morphoMarketV1AdapterV2Factory) {
    throw new UnknownFactory();
  }

  if (deployless) {
    try {
      const adapter = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [address, morphoMarketV1AdapterV2Factory],
      });

      return new VaultV2MorphoMarketV1AdapterV2({
        ...adapter,
        marketIds: [
          ...adapter.marketSupplyShares.map(
            ({ marketId }) => marketId as MarketId,
          ),
        ],
        supplyShares: fromEntries(
          adapter.marketSupplyShares.map(({ marketId, supplyShares }) => [
            marketId,
            supplyShares,
          ]),
        ),
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
    isMorphoMarketV1AdapterV2,
    parentVault,
    skimRecipient,
    marketIdsLength,
    adaptiveCurveIrm,
  ] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      args: [address],
    }) // Factory may not have been deployed at requested block tag.
      .catch(() => false),
    readContract(client, {
      ...parameters,
      address,
      abi: morphoMarketV1AdapterV2Abi,
      functionName: "parentVault",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: morphoMarketV1AdapterV2Abi,
      functionName: "skimRecipient",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: morphoMarketV1AdapterV2Abi,
      functionName: "marketIdsLength",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: morphoMarketV1AdapterV2Abi,
      functionName: "adaptiveCurveIrm",
    }),
  ]);

  if (!isMorphoMarketV1AdapterV2) {
    throw new UnknownOfFactory(morphoMarketV1AdapterV2Factory, address);
  }

  const marketIds = await Promise.all(
    Array.from(
      { length: Number(marketIdsLength) },
      (_, i) =>
        readContract(client, {
          ...parameters,
          address,
          abi: morphoMarketV1AdapterV2Abi,
          functionName: "marketIds",
          args: [BigInt(i)],
        }) as Promise<MarketId>,
    ),
  );

  const supplyShares = await Promise.all(
    marketIds.map(
      async (marketId) =>
        [
          marketId,
          await readContract(client, {
            ...parameters,
            address,
            abi: morphoMarketV1AdapterV2Abi,
            functionName: "supplyShares",
            args: [marketId],
          }),
        ] as const,
    ),
  ).then(fromEntries);

  return new VaultV2MorphoMarketV1AdapterV2({
    parentVault,
    skimRecipient,
    address,
    marketIds,
    adaptiveCurveIrm,
    supplyShares,
  });
}

export async function fetchAccrualVaultV2MorphoMarketV1AdapterV2(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  const adapter = await fetchVaultV2MorphoMarketV1AdapterV2(
    address,
    client,
    parameters,
  );
  const markets = await Promise.all(
    adapter.marketIds.map((marketId) =>
      fetchMarket(marketId, client, parameters),
    ),
  );

  return new AccrualVaultV2MorphoMarketV1AdapterV2(adapter, markets);
}
