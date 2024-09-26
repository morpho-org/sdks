import { addresses } from "@morpho-org/blue-sdk";
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
      isSuccess: boolean;
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
      enabled: block != null && parameters.query?.enabled,
      staleTime,
    },
  });

  const markets = useMarkets({
    ...parameters,
    blockNumber: block?.number,
    query: {
      ...parameters.query,
      enabled: block != null && parameters.query?.enabled,
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
  const vaults = useVaults({
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
          Array.from(parameters.marketIds, (marketId) => ({ user, marketId })),
        ),
      [parameters.users, parameters.marketIds],
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
          Array.from(parameters.marketIds, (marketId) => ({ vault, marketId })),
        ),
      [parameters.vaults, parameters.marketIds],
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
  ]);

  if (block == null)
    return {
      data: undefined,
      error: null,
      isError: false,
      isFetching: false,
      isPending: true,
      isSuccess: false,
    };

  const error =
    feeRecipient.error ??
    markets.error ??
    users.error ??
    tokens.error ??
    vaults.error ??
    positions.error ??
    holdings.error ??
    vaultMarketConfigs.error ??
    vaultUsers.error;

  const isFetching =
    feeRecipient.isFetching ||
    markets.isFetching ||
    users.isFetching ||
    tokens.isFetching ||
    vaults.isFetching ||
    positions.isFetching ||
    holdings.isFetching ||
    vaultMarketConfigs.isFetching ||
    vaultUsers.isFetching;

  if (error != null)
    return {
      data,
      error,
      isError: true,
      isFetching,
      isPending: false,
      isSuccess: false,
    };

  const isSuccess =
    feeRecipient.isSuccess &&
    markets.isSuccess &&
    users.isSuccess &&
    tokens.isSuccess &&
    vaults.isSuccess &&
    positions.isSuccess &&
    holdings.isSuccess &&
    vaultMarketConfigs.isSuccess &&
    vaultUsers.isSuccess;

  return {
    data: data!,
    error: null,
    isError: false,
    isFetching,
    isPending: false,
    isSuccess,
  };
}
