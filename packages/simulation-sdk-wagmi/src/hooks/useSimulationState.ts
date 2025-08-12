import { type MarketId, addresses } from "@morpho-org/blue-sdk";
import {
  type DeploylessFetchParameters,
  blueAbi,
} from "@morpho-org/blue-sdk-viem";
import {
  type ConfigParameter,
  type FetchMarketsParameters,
  type FetchTokensParameters,
  type FetchUsersParameters,
  type FetchVaultV2AdaptersParameters,
  type FetchVaultV2sParameters,
  type FetchVaultsParameters,
  useChainId,
  useHoldings,
  useMarkets,
  usePositions,
  useTokens,
  useUsers,
  useVaultMarketConfigs,
  useVaultUsers,
  useVaultV2Adapters,
  useVaultV2s,
  useVaults,
} from "@morpho-org/blue-sdk-wagmi";
import { values } from "@morpho-org/morpho-ts";
import { type MinimalBlock, SimulationState } from "@morpho-org/simulation-sdk";
import { useMemo } from "react";
import type { Address, ReadContractErrorType, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useReadContract } from "wagmi";

export type FetchSimulationStateParameters = FetchMarketsParameters &
  FetchUsersParameters &
  FetchTokensParameters &
  FetchVaultsParameters &
  FetchVaultV2sParameters &
  FetchVaultV2AdaptersParameters & {
    includeVaultQueues?: boolean;
  };

export type UseSimulationStateParameters<config extends Config = Config> =
  FetchSimulationStateParameters &
    UnionOmit<DeploylessFetchParameters, "blockTag" | "blockNumber"> &
    ConfigParameter<config> & {
      block?: MinimalBlock;
      accrueInterest?: boolean;
      query?: {
        enabled?: boolean;
        staleTime?: number;
        refetchInterval?: number | false;
        refetchIntervalInBackground?: boolean;
        refetchOnWindowFocus?: boolean | "always";
        refetchOnReconnect?: boolean | "always";
        refetchOnMount?: boolean | "always";
        retryOnMount?: boolean;
      };
    };

export interface SimulationStateLike<T> {
  global?: { feeRecipient?: T };
  markets?: Record<MarketId, T>;
  users?: Record<Address, T>;
  tokens?: Record<Address, T>;
  vaults?: Record<Address, T>;
  positions?: Record<Address, Record<MarketId, T>>;
  holdings?: Record<Address, Record<Address, T>>;
  vaultMarketConfigs?: Record<Address, Record<MarketId, T>>;
  vaultUsers?: Record<Address, Record<Address, T>>;
  vaultV2s?: Record<Address, T>;
  vaultV2Adapters?: Record<Address, T>;
}

export type UseSimulationReturnType<T> =
  | {
      /**
       * Latest available data, completely fetched when `!isFetching`.
       */
      data: T;
      /**
       * The errors that occurred while fetching each data leaf, indexed by type of entity.
       */
      error: SimulationStateLike<ReadContractErrorType | null>;
      /**
       * Whether any piece of data is being fetched.
       */
      isFetchingAny: boolean;
      /**
       * Whether each data leaf is being fetched, indexed by type of entity.
       */
      isFetching: SimulationStateLike<boolean>;
      /**
       * If data is available, request is not pending.
       */
      isPending: false;
    }
  | {
      /**
       * No data available when request is pending.
       */
      data: undefined;
      /**
       * No error can occur for as long as request is pending.
       */
      error: SimulationStateLike<null>;
      /**
       * Request is not fetching at all when pending.
       */
      isFetchingAny: false;
      /**
       * Request is not fetching at all when pending.
       */
      isFetching: SimulationStateLike<false>;
      /**
       * Request is pending a valid block number and timestamp.
       */
      isPending: true;
    };

export type UseSimulationStateReturnType =
  UseSimulationReturnType<SimulationState>;

export function useSimulationState<
  config extends Config = ResolvedRegister["config"],
>({
  block,
  accrueInterest = true,
  includeVaultQueues = true,
  ...parameters
}: UseSimulationStateParameters<config>): UseSimulationStateReturnType {
  const staleTime =
    (parameters.query?.staleTime ?? block?.number != null)
      ? Number.POSITIVE_INFINITY
      : undefined;

  const chainId = useChainId(parameters);

  const { morpho } = addresses[chainId];

  const feeRecipient = useReadContract({
    ...parameters,
    blockNumber: block?.number,
    address: morpho,
    abi: blueAbi,
    functionName: "feeRecipient",
    query: {
      ...parameters.query,
      enabled: block != null && parameters.query?.enabled,
      staleTime,
    },
  });

  const vaults = useVaults({
    ...parameters,
    blockNumber: block?.number,
    query: {
      ...parameters.query,
      enabled: block != null && parameters.query?.enabled,
    },
  });

  const marketIds = includeVaultQueues
    ? Array.from(parameters.marketIds).concat(
        values(vaults.data).flatMap(
          (vault) => vault?.supplyQueue.concat(vault.withdrawQueue) ?? [],
        ),
      )
    : parameters.marketIds;
  const markets = useMarkets({
    ...parameters,
    marketIds,
    blockNumber: block?.number,
    query: {
      ...parameters.query,
      enabled: block != null && parameters.query?.enabled,
      select: accrueInterest
        ? (market) => market.accrueInterest(block?.timestamp)
        : undefined,
    },
  });

  const users = useUsers({
    ...parameters,
    blockNumber: block?.number,
    query: {
      ...parameters.query,
      enabled: block != null && parameters.query?.enabled,
    },
  });

  const tokens = useTokens({
    ...parameters,
    blockNumber: block?.number,
    query: {
      ...parameters.query,
      enabled: block != null && parameters.query?.enabled,
    },
  });

  const positions = usePositions({
    ...parameters,
    blockNumber: block?.number,
    positions: useMemo(
      () =>
        Array.from(parameters.users).flatMap((user) =>
          Array.from(marketIds, (marketId) => ({ user, marketId })),
        ),
      [parameters.users, marketIds],
    ),
    query: {
      ...parameters.query,
      enabled: block != null && parameters.query?.enabled,
    },
  });
  const holdings = useHoldings({
    ...parameters,
    blockNumber: block?.number,
    holdings: useMemo(
      () =>
        Array.from(parameters.users).flatMap((user) =>
          Array.from(parameters.tokens, (token) => ({ user, token })),
        ),
      [parameters.users, parameters.tokens],
    ),
    query: {
      ...parameters.query,
      enabled: block != null && parameters.query?.enabled,
    },
  });
  const vaultMarketConfigs = useVaultMarketConfigs({
    ...parameters,
    blockNumber: block?.number,
    configs: useMemo(
      () =>
        Array.from(parameters.vaults).flatMap((vault) =>
          Array.from(marketIds, (marketId) => ({ vault, marketId })),
        ),
      [parameters.vaults, marketIds],
    ),
    query: {
      ...parameters.query,
      enabled: block != null && parameters.query?.enabled,
    },
  });
  const vaultUsers = useVaultUsers({
    ...parameters,
    blockNumber: block?.number,
    vaultUsers: useMemo(
      () =>
        Array.from(parameters.vaults).flatMap((vault) =>
          Array.from(parameters.users, (user) => ({ vault, user })),
        ),
      [parameters.vaults, parameters.users],
    ),
    query: {
      ...parameters.query,
      enabled: block != null && parameters.query?.enabled,
    },
  });

  const vaultV2s = useVaultV2s({
    ...parameters,
    blockNumber: block?.number,
    query: {
      ...parameters.query,
      enabled: block != null && parameters.query?.enabled,
    },
  });

  const vaultV2Adapters = useVaultV2Adapters({
    ...parameters,
    blockNumber: block?.number,
    query: {
      ...parameters.query,
      enabled: block != null && parameters.query?.enabled,
    },
  });

  const data = useMemo(() => {
    if (block == null) return;

    return new SimulationState({
      chainId,
      block,
      global: { feeRecipient: feeRecipient.data },
      markets: markets.data,
      users: users.data,
      tokens: tokens.data,
      vaults: vaults.data,
      positions: positions.data,
      holdings: holdings.data,
      vaultMarketConfigs: vaultMarketConfigs.data,
      vaultUsers: vaultUsers.data,
      vaultV2s: vaultV2s.data,
      vaultV2Adapters: vaultV2Adapters.data,
    });
  }, [
    chainId,
    block,
    feeRecipient.data,
    markets.data,
    users.data,
    tokens.data,
    vaults.data,
    positions.data,
    holdings.data,
    vaultMarketConfigs.data,
    vaultUsers.data,
    vaultV2s.data,
    vaultV2Adapters.data,
  ]);

  const error = useMemo(() => {
    return {
      global: { feeRecipient: feeRecipient.error },
      markets: markets.error,
      users: users.error,
      tokens: tokens.error,
      vaults: vaults.error,
      positions: positions.error,
      holdings: holdings.error,
      vaultMarketConfigs: vaultMarketConfigs.error,
      vaultUsers: vaultUsers.error,
      vaultV2s: vaultV2s.error,
      vaultV2Adapters: vaultV2Adapters.error,
    };
  }, [
    feeRecipient.error,
    markets.error,
    users.error,
    tokens.error,
    vaults.error,
    positions.error,
    holdings.error,
    vaultMarketConfigs.error,
    vaultUsers.error,
    vaultV2s.error,
    vaultV2Adapters.error,
  ]);

  if (block == null)
    return {
      data: undefined,
      error: {},
      isFetchingAny: false,
      isFetching: {},
      isPending: true,
    };

  return {
    data: data!,
    error,
    isFetchingAny:
      feeRecipient.isFetching ||
      markets.isFetchingAny ||
      users.isFetchingAny ||
      tokens.isFetchingAny ||
      vaults.isFetchingAny ||
      positions.isFetchingAny ||
      holdings.isFetchingAny ||
      vaultMarketConfigs.isFetchingAny ||
      vaultUsers.isFetchingAny ||
      vaultV2s.isFetchingAny ||
      vaultV2Adapters.isFetchingAny,
    isFetching: {
      global: { feeRecipient: feeRecipient.isFetching },
      markets: markets.isFetching,
      users: users.isFetching,
      tokens: tokens.isFetching,
      vaults: vaults.isFetching,
      positions: positions.isFetching,
      holdings: holdings.isFetching,
      vaultMarketConfigs: vaultMarketConfigs.isFetching,
      vaultUsers: vaultUsers.isFetching,
      vaultV2s: vaultV2s.isFetching,
      vaultV2Adapters: vaultV2Adapters.isFetching,
    },
    isPending: false,
  };
}
