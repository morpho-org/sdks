import {
  AccrualVaultV2MorphoMarketV1AdapterV2,
  getChainAddresses,
  type MarketId,
  UnknownFactory,
  UnknownOfFactory,
  VaultV2MorphoMarketV1AdapterV2,
} from "@morpho-org/blue-sdk";
import { fromEntries } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  morphoMarketV1AdapterV2Abi,
  morphoMarketV1AdapterV2FactoryAbi,
} from "../../abis.js";
import { isUnknownOfFactoryError } from "../../error.js";
import {
  abi,
  code,
} from "../../queries/vault-v2/GetVaultV2MorphoMarketV1AdapterV2.js";
import type { DeploylessFetchParameters } from "../../types.js";
import { fetchMarket } from "../Market.js";

/**
 * Fetches a MorphoMarketV1AdapterV2 used by VaultV2.
 *
 * Uses the deployless adapter query by default and falls back to factory validation plus adapter
 * state reads when allowed.
 *
 * @param address - Adapter address to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `VaultV2MorphoMarketV1AdapterV2` entity.
 * @throws {UnknownFactory} when the configured chain has no MorphoMarketV1AdapterV2 factory.
 * @throws {UnknownOfFactory} when `address` is not an adapter from the configured factory.
 * @example
 * ```ts
 * import type { VaultV2MorphoMarketV1AdapterV2 } from "@morpho-org/blue-sdk";
 * import { fetchVaultV2MorphoMarketV1AdapterV2 } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const adapter: VaultV2MorphoMarketV1AdapterV2 =
 *   await fetchVaultV2MorphoMarketV1AdapterV2(adapterAddress, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultV2MorphoMarketV1AdapterV2(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { morphoMarketV1AdapterV2Factory } = getChainAddresses(
    parameters.chainId,
  );

  /* v8 ignore next: V8 does not credit this guard's empty false branch; both paths are tested. */
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
          // biome-ignore lint/suspicious/noShadow: TODO rename to avoid shadowing
          adapter.marketSupplyShares.map(({ marketId, supplyShares }) => [
            marketId,
            supplyShares,
          ]),
        ),
        address,
      });
    } catch (error) {
      if (deployless === "force") throw error;
      if (isUnknownOfFactoryError(error)) throw error;
      // Fallback to multicall if deployless call fails.
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

/**
 * Fetches a MorphoMarketV1AdapterV2 with accrued market state.
 *
 * Reads the adapter state, then fetches each referenced market in the adapter's market id list.
 *
 * @param address - Adapter address to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to downstream fetchers.
 * @param parameters.deployless - Optional deployless read mode; defaults to downstream fetchers.
 * @returns The hydrated `AccrualVaultV2MorphoMarketV1AdapterV2` entity.
 * @throws {UnknownFactory} when the configured chain has no MorphoMarketV1AdapterV2 factory.
 * @throws {UnknownOfFactory} when `address` is not an adapter from the configured factory.
 * @example
 * ```ts
 * import type { AccrualVaultV2MorphoMarketV1AdapterV2 } from "@morpho-org/blue-sdk";
 * import { fetchAccrualVaultV2MorphoMarketV1AdapterV2 } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const adapter: AccrualVaultV2MorphoMarketV1AdapterV2 =
 *   await fetchAccrualVaultV2MorphoMarketV1AdapterV2(adapterAddress, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
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
