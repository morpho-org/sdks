import {
  AccrualVaultV2MorphoMarketV1AdapterV2,
  type MarketId,
  VaultV2MorphoMarketV1AdapterV2,
} from "@morpho-org/blue-sdk";
import { fromEntries } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { morphoMarketV1AdapterV2Abi } from "../../abis";
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

  if (deployless) {
    try {
      const adapter = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [address],
      });

      return new VaultV2MorphoMarketV1AdapterV2({
        ...adapter,
        marketIds: [...adapter.marketIds] as MarketId[],
        supplyShares: fromEntries(
          (adapter.marketIds as MarketId[]).map((marketId, i) => [
            marketId,
            adapter.supplyShares[i]!,
          ]),
        ),
        address,
      });
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  const [parentVault, skimRecipient, marketIdsLength, adaptiveCurveIrm] =
    await Promise.all([
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
