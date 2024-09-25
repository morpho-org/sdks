import {
  Address,
  Holding,
  MarketId,
  Position,
  VaultMarketConfig,
  VaultUser,
  addresses,
} from "@morpho-org/blue-sdk";
import { DeploylessFetchParameters, blueAbi } from "@morpho-org/blue-sdk-viem";
import {
  ConfigParameter,
  FetchMarketsParameters,
  FetchTokensParameters,
  FetchUsersParameters,
  FetchVaultsParameters,
  useChainId,
  useHoldings,
  useMarkets,
  usePositions,
  useTokens,
  useUsers,
  useVaultMarketConfigs,
  useVaultUsers,
  useVaults,
} from "@morpho-org/blue-sdk-wagmi";
import { fromEntries } from "@morpho-org/morpho-ts";
import { useMemo } from "react";
import { ReadContractErrorType, UnionOmit } from "viem";
import { Config, ResolvedRegister, useReadContract } from "wagmi";
import { SimulationState } from "../SimulationState.js";

export type FetchSimulationStateParameters = FetchMarketsParameters &
  FetchUsersParameters &
  FetchTokensParameters &
  FetchVaultsParameters;

export type UseSimulationStateParameters<config extends Config = Config> =
  FetchSimulationStateParameters &
    UnionOmit<DeploylessFetchParameters, "blockTag" | "blockNumber"> &
    ConfigParameter<config> & {
      block?: SimulationState["block"];
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

export type UseSimulationStateReturnType =
  | {
      data: SimulationState;
      error: null;
      isError: false;
      isFetching: boolean;
      isPending: false;
      isSuccess: true;
    }
  | {
      data?: SimulationState;
      error: ReadContractErrorType;
      isError: true;
      isFetching: boolean;
      isPending: false;
      isSuccess: false;
    }
  | {
      data: undefined;
      error: null;
      isError: false;
      isFetching: true;
      isPending: false;
      isSuccess: false;
    }
  | {
      data: undefined;
      error: null;
      isError: false;
      isFetching: false;
      isPending: true;
      isSuccess: false;
    };

const isDataDefined = ({ data }: { data?: any }) => data != null;

export function useSimulationState<
  config extends Config = ResolvedRegister["config"],
>({
  block,
  ...parameters
}: UseSimulationStateParameters<config>): UseSimulationStateReturnType {
  const staleTime =
    parameters.query?.staleTime ?? block?.number != null ? Infinity : undefined;

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
      enabled: !block,
      staleTime,
    },
  });

  const markets = useMarkets({
    ...parameters,
    blockNumber: block?.number,
    query: {
      ...parameters.query,
      enabled: !block && parameters.query?.enabled,
    },
  });
  const users = useUsers({
    ...parameters,
    blockNumber: block?.number,
    query: {
      ...parameters.query,
      enabled: !block && parameters.query?.enabled,
    },
  });
  const tokens = useTokens({
    ...parameters,
    blockNumber: block?.number,
    query: {
      ...parameters.query,
      enabled: !block && parameters.query?.enabled,
    },
  });
  const vaults = useVaults({
    ...parameters,
    blockNumber: block?.number,
    query: {
      ...parameters.query,
      enabled: !block && parameters.query?.enabled,
    },
  });

  const positions = usePositions({
    ...parameters,
    blockNumber: block?.number,
    positions: useMemo(
      () =>
        Array.from(parameters.users).flatMap((user) =>
          Array.from(parameters.marketIds, (marketId) => ({ user, marketId })),
        ),
      [parameters.users, parameters.marketIds],
    ),
    query: {
      ...parameters.query,
      enabled: !block && parameters.query?.enabled,
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
      enabled: !block && parameters.query?.enabled,
    },
  });
  const vaultMarketConfigs = useVaultMarketConfigs({
    ...parameters,
    blockNumber: block?.number,
    configs: useMemo(
      () =>
        Array.from(parameters.vaults).flatMap((vault) =>
          Array.from(parameters.marketIds, (marketId) => ({ vault, marketId })),
        ),
      [parameters.vaults, parameters.marketIds],
    ),
    query: {
      ...parameters.query,
      enabled: !block && parameters.query?.enabled,
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
      enabled: !block && parameters.query?.enabled,
    },
  });

  return useMemo(() => {
    if (block == null)
      return {
        data: undefined,
        error: null,
        isError: false,
        isFetching: false,
        isPending: true,
        isSuccess: false,
      };

    const results = [
      markets,
      users,
      tokens,
      vaults,
      positions,
      holdings,
      vaultMarketConfigs,
    ].flat();

    const error =
      feeRecipient.error ?? results.find(({ error }) => error)?.error ?? null;

    const isFetching =
      feeRecipient.isFetching || results.some(({ isFetching }) => isFetching);

    const data = new SimulationState({
      chainId,
      block,
      global: { feeRecipient: feeRecipient.data },
      markets: fromEntries(
        markets.filter(isDataDefined).map(({ data }) => [data!.id, data!]),
      ),
      users: fromEntries(
        users.filter(isDataDefined).map(({ data }) => [data!.address, data!]),
      ),
      tokens: fromEntries(
        tokens.filter(isDataDefined).map(({ data }) => [data!.address, data!]),
      ),
      vaults: fromEntries(
        vaults.filter(isDataDefined).map(({ data }) => [data!.address, data!]),
      ),
      positions: positions
        .filter(isDataDefined)
        .reduce<Record<Address, Record<MarketId, Position>>>(
          (acc, { data }) => {
            (acc[data!.user] ??= {})[data!.marketId] = data!;

            return acc;
          },
          {},
        ),
      holdings: holdings
        .filter(isDataDefined)
        .reduce<Record<Address, Record<Address, Holding>>>((acc, { data }) => {
          (acc[data!.user] ??= {})[data!.token] = data!;

          return acc;
        }, {}),
      vaultMarketConfigs: vaultMarketConfigs
        .filter(isDataDefined)
        .reduce<Record<Address, Record<MarketId, VaultMarketConfig>>>(
          (acc, { data }) => {
            (acc[data!.vault] ??= {})[data!.marketId] = data!;

            return acc;
          },
          {},
        ),
      vaultUsers: vaultUsers
        .filter(isDataDefined)
        .reduce<Record<Address, Record<Address, VaultUser>>>(
          (acc, { data }) => {
            (acc[data!.vault] ??= {})[data!.user] = data!;

            return acc;
          },
          {},
        ),
    });

    if (error != null)
      return {
        data,
        error,
        isError: true,
        isFetching,
        isPending: false,
        isSuccess: false,
      };

    return {
      data,
      error: null,
      isError: false,
      isFetching,
      isPending: false,
      isSuccess: true,
    };
  }, [
    markets,
    users,
    tokens,
    vaults,
    positions,
    holdings,
    vaultMarketConfigs,
    vaultUsers,
    chainId,
    block,
    feeRecipient.data,
    feeRecipient.error,
    feeRecipient.isFetching,
  ]);
}
