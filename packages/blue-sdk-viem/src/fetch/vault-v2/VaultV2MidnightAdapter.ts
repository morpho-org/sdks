import {
  AccrualVaultV2MidnightAdapter,
  type BigIntish,
  getChainAddresses,
  type Hash,
  UnknownFactory,
  UnknownOfFactory,
  type VaultV2MidnightAdapter,
  VaultV2MidnightAdapter as VaultV2MidnightAdapterEntity,
} from "@morpho-org/blue-sdk";
import { midnightCoreReadAbi } from "@morpho-org/morpho-ts/abis/midnight";
import type { Address, Client } from "viem";
import { getBlock, getChainId, readContract } from "viem/actions";
import { midnightAdapterAbi, midnightAdapterFactoryAbi } from "../../abis.js";
import {
  isUnknownOfFactoryError,
  UnresolvedBlockNumberError,
} from "../../error.js";
import {
  abi as queryAbi,
  code as queryCode,
} from "../../queries/vault-v2/GetVaultV2MidnightAdapter.js";
import type { DeploylessFetchParameters } from "../../types.js";
import { readContractRestructured } from "../../utils.js";

type MidnightAdapterResponseMarket = {
  readonly id: Hash;
  readonly marketData: {
    readonly netCredit: BigIntish;
    readonly rate: BigIntish;
    readonly maturity: BigIntish;
    readonly index: BigIntish;
    readonly forceSellable: boolean;
  };
};

type MidnightAdapterResponse = {
  readonly parentVault: Address;
  readonly asset: Address;
  readonly skimRecipient: Address;
  readonly midnight: Address;
  readonly maxTtm: BigIntish;
  readonly minRate: BigIntish;
  readonly noSalesWithShortfall: boolean;
  readonly noSalesBelowFaceValue: boolean;
  readonly durations: readonly BigIntish[];
  readonly durationAllocations: readonly BigIntish[];
  readonly markets: readonly MidnightAdapterResponseMarket[];
};

type MidnightAccrualAdapterResponseMarket = {
  readonly id: Hash;
  readonly position: {
    readonly credit: BigIntish;
    readonly pendingFee: BigIntish;
    readonly lastLossFactor: BigIntish;
    readonly lastAccrual: BigIntish;
  };
  readonly lossFactor: BigIntish;
};

/**
 * Converts a Midnight adapter response to its Blue SDK entity.
 *
 * @internal
 * @param address - Adapter address.
 * @param data - Adapter configuration and market data.
 * @returns The Vault V2 Midnight adapter.
 */
export function toVaultV2MidnightAdapter(
  address: Address,
  data: MidnightAdapterResponse,
) {
  return new VaultV2MidnightAdapterEntity({
    address,
    parentVault: data.parentVault,
    skimRecipient: data.skimRecipient,
    asset: data.asset,
    midnight: data.midnight,
    marketIds: data.markets.map(({ id }) => id),
    marketData: Object.fromEntries(
      data.markets.map(({ id, marketData }) => [id, marketData]),
    ),
    durations: data.durations,
    durationAllocations: data.durationAllocations,
    maxTtm: data.maxTtm,
    minRate: data.minRate,
    noSalesWithShortfall: data.noSalesWithShortfall,
    noSalesBelowFaceValue: data.noSalesBelowFaceValue,
  });
}

/**
 * Converts one plain Midnight adapter plus its raw positions into an accrued adapter.
 *
 * @internal
 * @param adapter - Plain Vault V2 Midnight adapter.
 * @param options - Raw Midnight snapshots and their timestamp.
 * @returns The accrued Vault V2 Midnight adapter.
 */
export function toAccrualVaultV2MidnightAdapter(
  adapter: VaultV2MidnightAdapter,
  options: {
    readonly markets: readonly MidnightAccrualAdapterResponseMarket[];
    readonly lastUpdate: bigint;
  },
) {
  const { markets, lastUpdate } = options;
  return new AccrualVaultV2MidnightAdapter({
    adapter,
    lastUpdate,
    markets: markets.map(({ id, position, lossFactor }) => ({
      id,
      position,
      market: { lossFactor },
    })),
  });
}

/**
 * Fetches a Vault V2 Midnight adapter.
 *
 * Reads adapter configuration and market data in one deployless call by default, falling back to
 * parallel contract reads pinned to one block when allowed.
 *
 * @param address - Adapter address to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `VaultV2MidnightAdapter`.
 * @throws {UnsupportedChainIdError} when the client's chain is absent from the address registry.
 * @throws {UnknownFactory} when the configured chain has no Midnight adapter factory.
 * @throws {UnknownOfFactory} when `address` is not an adapter from the configured factory on the
 *   default and fallback paths; under `deployless: "force"` the deployless revert propagates as a
 *   viem error.
 * @throws {UnresolvedBlockNumberError} when the direct-read path (`deployless: false` or fallback)
 *   resolves a pending block.
 * @throws {viem.BaseError} when a direct contract read fails or when the deployless query fails
 *   under `deployless: "force"`.
 * @example
 * ```ts
 * import { fetchVaultV2MidnightAdapter } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import type { Address } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * // A MidnightAdapter created by `getChainAddress(base.id, "midnightAdapterFactory")`.
 * declare const midnightAdapter: Address;
 * const adapter = await fetchVaultV2MidnightAdapter(midnightAdapter, client);
 * ```
 * @remarks At 250 markets, deployless query gas is estimated at ~26.6M by linear extrapolation
 *   from 0 and 1 funded market on Base fork block 52,513,513.
 *   With `deployless: "force"`, deployless query errors propagate unmapped.
 */
// biome-ignore lint/complexity/useMaxParams: Mirrors sibling fetchers.
export async function fetchVaultV2MidnightAdapter(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  const chainId = await getChainId(client);
  const { midnightAdapterFactory } = getChainAddresses(chainId);
  if (!midnightAdapterFactory) throw new UnknownFactory();

  if (deployless) {
    try {
      const response = await readContract(client, {
        ...parameters,
        abi: queryAbi,
        code: queryCode,
        functionName: "query",
        args: [address, midnightAdapterFactory],
      });

      return toVaultV2MidnightAdapter(address, response);
    } catch (error) {
      if (deployless === "force") throw error;
      if (isUnknownOfFactoryError(error))
        throw new UnknownOfFactory(midnightAdapterFactory, address);
    }
  }

  const { blockTag, ...readParameters } = parameters;
  const block =
    parameters.blockNumber != null
      ? undefined
      : await getBlock(client, blockTag != null ? { blockTag } : {});
  const blockNumber = parameters.blockNumber ?? block?.number;
  if (blockNumber == null)
    throw new UnresolvedBlockNumberError(blockTag ?? "latest");
  const blockParameters = { ...readParameters, blockNumber };

  const [
    isMidnightAdapter,
    parentVault,
    asset,
    skimRecipient,
    midnight,
    maxTtm,
    minRate,
    noSalesWithShortfall,
    noSalesBelowFaceValue,
    durations,
    marketIdsLength,
  ] = await Promise.all([
    readContract(client, {
      ...blockParameters,
      address: midnightAdapterFactory,
      abi: midnightAdapterFactoryAbi,
      functionName: "isMidnightAdapter",
      args: [address],
    }).catch(() => false),
    readContract(client, {
      ...blockParameters,
      address,
      abi: midnightAdapterAbi,
      functionName: "parentVault",
    }),
    readContract(client, {
      ...blockParameters,
      address,
      abi: midnightAdapterAbi,
      functionName: "asset",
    }),
    readContract(client, {
      ...blockParameters,
      address,
      abi: midnightAdapterAbi,
      functionName: "skimRecipient",
    }),
    readContract(client, {
      ...blockParameters,
      address,
      abi: midnightAdapterAbi,
      functionName: "midnight",
    }),
    readContract(client, {
      ...blockParameters,
      address,
      abi: midnightAdapterAbi,
      functionName: "maxTtm",
    }),
    readContract(client, {
      ...blockParameters,
      address,
      abi: midnightAdapterAbi,
      functionName: "minRate",
    }),
    readContract(client, {
      ...blockParameters,
      address,
      abi: midnightAdapterAbi,
      functionName: "noSalesWithShortfall",
    }),
    readContract(client, {
      ...blockParameters,
      address,
      abi: midnightAdapterAbi,
      functionName: "noSalesBelowFaceValue",
    }),
    readContract(client, {
      ...blockParameters,
      address,
      abi: midnightAdapterAbi,
      functionName: "durations",
    }),
    readContract(client, {
      ...blockParameters,
      address,
      abi: midnightAdapterAbi,
      functionName: "marketIdsLength",
    }),
  ]);

  if (!isMidnightAdapter)
    throw new UnknownOfFactory(midnightAdapterFactory, address);

  const [durationAllocations, marketIds] = await Promise.all([
    readContract(client, {
      ...blockParameters,
      address,
      abi: midnightAdapterAbi,
      functionName: "durationAllocations",
      args: [BigInt(durations.length)],
    }),
    Promise.all(
      Array.from({ length: Number(marketIdsLength) }, (_, index) =>
        readContract(client, {
          ...blockParameters,
          address,
          abi: midnightAdapterAbi,
          functionName: "marketIds",
          args: [BigInt(index)],
        }),
      ),
    ),
  ]);

  const markets = await Promise.all(
    marketIds.map(async (id) => {
      const marketData = await readContractRestructured(client, {
        ...blockParameters,
        address,
        abi: midnightAdapterAbi,
        functionName: "marketData",
        args: [id],
      });
      return { id, marketData };
    }),
  );

  return toVaultV2MidnightAdapter(address, {
    parentVault,
    asset,
    skimRecipient,
    midnight,
    maxTtm,
    minRate,
    noSalesWithShortfall,
    noSalesBelowFaceValue,
    durations,
    durationAllocations,
    markets,
  });
}

/**
 * Fetches a Vault V2 Midnight adapter with raw position state for accrual calculations.
 *
 * By default, it reads adapter configuration, market data, raw Midnight positions and loss factors,
 * and the block timestamp in one deployless call. When allowed, it falls back to direct contract
 * reads pinned to one block.
 *
 * @param address - Adapter address to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `AccrualVaultV2MidnightAdapter`.
 * @throws {UnsupportedChainIdError} when the client's chain is absent from the address registry.
 * @throws {UnknownFactory} when the configured chain has no Midnight adapter factory.
 * @throws {UnknownOfFactory} when `address` is not an adapter from the configured factory on the
 *   default and fallback paths; under `deployless: "force"` the deployless revert propagates as a
 *   viem error.
 * @throws {UnresolvedBlockNumberError} when the direct-read path (`deployless: false` or fallback)
 *   resolves a pending block.
 * @throws {viem.BaseError} when a direct contract read fails or when the deployless query fails
 *   under `deployless: "force"`.
 * @remarks `AccrualVaultV2MidnightAdapter.realAssets(timestamp)` should be used for simulations
 *   inside a Midnight take callback: onchain `realAssets()` reverts with `OtherSellInProgress`
 *   during that callback. With `deployless: "force"`, deployless query errors propagate unmapped.
 * @example
 * ```ts
 * import { fetchAccrualVaultV2MidnightAdapter } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import type { Address } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * // A MidnightAdapter created by `getChainAddress(base.id, "midnightAdapterFactory")`.
 * declare const midnightAdapter: Address;
 * const adapter = await fetchAccrualVaultV2MidnightAdapter(midnightAdapter, client);
 * const timestamp = BigInt(Math.floor(Date.now() / 1000));
 * const assets = adapter.realAssets(timestamp);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: Mirrors sibling fetchers.
export async function fetchAccrualVaultV2MidnightAdapter(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  const chainId = await getChainId(client);
  const { midnightAdapterFactory } = getChainAddresses(chainId);
  if (!midnightAdapterFactory) throw new UnknownFactory();

  if (deployless) {
    try {
      const response = await readContract(client, {
        ...parameters,
        abi: queryAbi,
        code: queryCode,
        functionName: "query",
        args: [address, midnightAdapterFactory],
      });

      return toAccrualVaultV2MidnightAdapter(
        toVaultV2MidnightAdapter(address, response),
        {
          markets: response.markets,
          lastUpdate: response.timestamp,
        },
      );
    } catch (error) {
      if (deployless === "force") throw error;
      if (isUnknownOfFactoryError(error))
        throw new UnknownOfFactory(midnightAdapterFactory, address);
    }
  }

  const {
    blockNumber: requestedBlockNumber,
    blockTag,
    ...readParameters
  } = parameters;
  const block = await getBlock(
    client,
    requestedBlockNumber != null
      ? { blockNumber: requestedBlockNumber }
      : blockTag != null
        ? { blockTag }
        : {},
  );
  if (block.number == null)
    throw new UnresolvedBlockNumberError(blockTag ?? "latest");
  const blockParameters = { ...readParameters, blockNumber: block.number };
  const adapter = await fetchVaultV2MidnightAdapter(address, client, {
    ...blockParameters,
    deployless: false,
  });
  const markets = await Promise.all(
    adapter.marketIds.map(async (id) => {
      const [position, marketState] = await Promise.all([
        readContractRestructured(client, {
          ...blockParameters,
          address: adapter.midnight,
          abi: midnightCoreReadAbi,
          functionName: "position",
          args: [id, address],
        }),
        readContractRestructured(client, {
          ...blockParameters,
          address: adapter.midnight,
          abi: midnightCoreReadAbi,
          functionName: "marketState",
          args: [id],
        }),
      ]);
      return { id, position, lossFactor: marketState.lossFactor };
    }),
  );

  return toAccrualVaultV2MidnightAdapter(adapter, {
    markets,
    lastUpdate: block.timestamp,
  });
}
