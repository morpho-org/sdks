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
import { GetBlockErrorType, ReadContractErrorType, UnionOmit } from "viem";
import { Config, ResolvedRegister, useBlock, useReadContract } from "wagmi";
import { SimulationState } from "../SimulationState.js";

export type FetchSimulationStateParameters = FetchMarketsParameters &
  FetchUsersParameters &
  FetchTokensParameters &
  FetchVaultsParameters;

export type UseSimulationStateParameters<config extends Config = Config> =
  FetchSimulationStateParameters &
    UnionOmit<DeploylessFetchParameters, "blockTag" | "blockNumber"> & {
      blockNumber: bigint;
    } & ConfigParameter<config>;

export type UseSimulationStateReturnType =
  | {
      data: SimulationState;
      error: null;
      isError: false;
      isFetching: boolean;
      isSuccess: true;
    }
  | {
      data?: SimulationState;
      error: GetBlockErrorType | ReadContractErrorType;
      isError: true;
      isFetching: boolean;
      isSuccess: false;
    }
  | {
      data: undefined;
      error: null;
      isError: false;
      isFetching: true;
      isSuccess: false;
    };

const isDataDefined = ({ data }: { data?: any }) => data != null;

export function useSimulationState<
  config extends Config = ResolvedRegister["config"],
>(
  parameters: UseSimulationStateParameters<config>,
): UseSimulationStateReturnType {
  const chainId = useChainId(parameters);

  const { config, ...blockParameters } = parameters;
  const block = useBlock({
    ...blockParameters,
    includeTransactions: false,
  });

  const { morpho } = addresses[chainId];

  const feeRecipient = useReadContract({
    address: morpho,
    abi: blueAbi,
    functionName: "feeRecipient",
    query: {
      enabled: !block.error,
    },
  });

  const markets = useMarkets({
    ...parameters,
    query: { enabled: !block.error },
  });
  const users = useUsers({
    ...parameters,
    query: { enabled: !block.error },
  });
  const tokens = useTokens({
    ...parameters,
    query: { enabled: !block.error },
  });
  const vaults = useVaults({
    ...parameters,
    query: { enabled: !block.error },
  });

  const positions = usePositions({
    ...parameters,
    positions: useMemo(
      () =>
        Array.from(parameters.users).flatMap((user) =>
          Array.from(parameters.marketIds, (marketId) => ({ user, marketId })),
        ),
      [parameters.users, parameters.marketIds],
    ),
    query: {
      enabled: !block.error,
    },
  });
  const holdings = useHoldings({
    ...parameters,
    holdings: useMemo(
      () =>
        Array.from(parameters.users).flatMap((user) =>
          Array.from(parameters.tokens, (token) => ({ user, token })),
        ),
      [parameters.users, parameters.tokens],
    ),
    query: {
      enabled: !block.error,
    },
  });
  const vaultMarketConfigs = useVaultMarketConfigs({
    ...parameters,
    configs: useMemo(
      () =>
        Array.from(parameters.vaults).flatMap((vault) =>
          Array.from(parameters.marketIds, (marketId) => ({ vault, marketId })),
        ),
      [parameters.vaults, parameters.marketIds],
    ),
    query: {
      enabled: !block.error,
    },
  });
  const vaultUsers = useVaultUsers({
    ...parameters,
    vaultUsers: useMemo(
      () =>
        Array.from(parameters.vaults).flatMap((vault) =>
          Array.from(parameters.users, (user) => ({ vault, user })),
        ),
      [parameters.vaults, parameters.users],
    ),
    query: {
      enabled: !block.error,
    },
  });

  return useMemo(() => {
    if (block.data?.number == null) {
      const { error, isFetching } = block;

      if (error != null)
        return {
          data: undefined,
          error,
          isError: true,
          isFetching,
          isSuccess: false,
        };

      return {
        data: undefined,
        error: null,
        isError: false,
        isFetching: true, // Block cannot be pending, so it is fetching.
        isSuccess: false,
      };
    }

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
      block.error ??
      feeRecipient.error ??
      results.find(({ error }) => error)?.error ??
      null;

    const isFetching =
      block.isFetching ||
      feeRecipient.isFetching ||
      results.some(({ isFetching }) => isFetching);

    const data = new SimulationState(
      { feeRecipient: feeRecipient.data },
      fromEntries(
        markets.filter(isDataDefined).map(({ data }) => [data!.id, data!]),
      ),
      fromEntries(
        users.filter(isDataDefined).map(({ data }) => [data!.address, data!]),
      ),
      fromEntries(
        tokens.filter(isDataDefined).map(({ data }) => [data!.address, data!]),
      ),
      fromEntries(
        vaults.filter(isDataDefined).map(({ data }) => [data!.address, data!]),
      ),
      positions
        .filter(isDataDefined)
        .reduce<Record<Address, Record<MarketId, Position>>>(
          (acc, { data }) => {
            (acc[data!.user] ??= {})[data!.marketId] = data!;

            return acc;
          },
          {},
        ),
      holdings
        .filter(isDataDefined)
        .reduce<Record<Address, Record<Address, Holding>>>((acc, { data }) => {
          (acc[data!.user] ??= {})[data!.token] = data!;

          return acc;
        }, {}),
      vaultMarketConfigs
        .filter(isDataDefined)
        .reduce<Record<Address, Record<MarketId, VaultMarketConfig>>>(
          (acc, { data }) => {
            (acc[data!.vault] ??= {})[data!.marketId] = data!;

            return acc;
          },
          {},
        ),
      vaultUsers
        .filter(isDataDefined)
        .reduce<Record<Address, Record<Address, VaultUser>>>(
          (acc, { data }) => {
            (acc[data!.vault] ??= {})[data!.user] = data!;

            return acc;
          },
          {},
        ),
      chainId,
      block.data.number,
      block.data.timestamp,
    );

    if (error != null)
      return {
        data,
        error,
        isError: true,
        isFetching,
        isSuccess: false,
      };

    return {
      data,
      error: null,
      isError: false,
      isFetching,
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
    block.data?.number,
    block.data?.timestamp,
    block.error,
    block.isFetching,
    feeRecipient.data,
    feeRecipient.error,
    feeRecipient.isFetching,
  ]);
}
