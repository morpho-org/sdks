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
import { zeroAddress } from "viem";
import { Config, ResolvedRegister, useReadContract } from "wagmi";
import { SimulationState } from "../SimulationState.js";

export type FetchSimulationStateParameters = FetchMarketsParameters &
  FetchUsersParameters &
  FetchTokensParameters &
  FetchVaultsParameters;

export type UseSimulationStateParameters<config extends Config = Config> =
  FetchSimulationStateParameters &
    DeploylessFetchParameters &
    ConfigParameter<config>;

export function useSimulationState<
  config extends Config = ResolvedRegister["config"],
>(parameters: UseSimulationStateParameters<config>) {
  const chainId = useChainId(parameters);
  // const block = useBlock({
  //   // ...parameters,
  //   includeTransactions: false,
  // });

  const { morpho } = addresses[chainId];

  const { data: feeRecipient = zeroAddress } = useReadContract({
    address: morpho,
    abi: blueAbi,
    functionName: "feeRecipient",
  });

  const markets = useMarkets(parameters);
  const users = useUsers(parameters);
  const tokens = useTokens(parameters);
  const vaults = useVaults(parameters);

  const positions = usePositions({
    ...parameters,
    positions: useMemo(
      () =>
        Array.from(parameters.users).flatMap((user) =>
          Array.from(parameters.marketIds, (marketId) => ({ user, marketId })),
        ),
      [parameters.users, parameters.marketIds],
    ),
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
  });

  return useMemo(() => {
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
      block.error ?? results.find(({ error }) => error)?.error ?? null;

    const isSuccess =
      block.isSuccess && results.every(({ isSuccess }) => isSuccess);

    const status = error != null ? "error" : isSuccess ? "success" : "pending";

    return {
      data: isSuccess
        ? new SimulationState(
            { feeRecipient },
            fromEntries(markets.map(({ data }) => [data!.id, data!])),
            fromEntries(users.map(({ data }) => [data!.address, data!])),
            fromEntries(tokens.map(({ data }) => [data!.address, data!])),
            fromEntries(vaults.map(({ data }) => [data!.address, data!])),
            positions.reduce<Record<Address, Record<MarketId, Position>>>(
              (acc, { data }) => {
                (acc[data!.user] ??= {})[data!.marketId] = data!;

                return acc;
              },
              {},
            ),
            holdings.reduce<Record<Address, Record<Address, Holding>>>(
              (acc, { data }) => {
                (acc[data!.user] ??= {})[data!.token] = data!;

                return acc;
              },
              {},
            ),
            vaultMarketConfigs.reduce<
              Record<Address, Record<MarketId, VaultMarketConfig>>
            >((acc, { data }) => {
              (acc[data!.vault] ??= {})[data!.marketId] = data!;

              return acc;
            }, {}),
            vaultUsers.reduce<Record<Address, Record<Address, VaultUser>>>(
              (acc, { data }) => {
                (acc[data!.vault] ??= {})[data!.user] = data!;

                return acc;
              },
              {},
            ),
            chainId,
            block.data.number,
            block.data.timestamp,
          )
        : undefined,
      error,
      isError: status === "error",
      isPending: status === "pending",
      isLoading: block.isLoading || results.some(({ isLoading }) => isLoading),
      isFetching:
        block.isFetching || results.some(({ isFetching }) => isFetching),
      isStale: block.isStale || results.some(({ isStale }) => isStale),
      isFetched: block.isFetched && results.every(({ isFetched }) => isFetched),
      isSuccess,
      status,
    };
  }, [
    feeRecipient,
    markets,
    users,
    tokens,
    vaults,
    positions,
    holdings,
    vaultMarketConfigs,
    chainId,
    block.data?.number,
    block.data?.timestamp,
  ]);
}
