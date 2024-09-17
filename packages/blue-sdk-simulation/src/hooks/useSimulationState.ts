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
import {
  BlockTag,
  GetBlockErrorType,
  ReadContractErrorType,
  UnionOmit,
} from "viem";
import { Config, ResolvedRegister, useBlock, useReadContract } from "wagmi";
import { SimulationState } from "../SimulationState.js";

export type FetchSimulationStateParameters = FetchMarketsParameters &
  FetchUsersParameters &
  FetchTokensParameters &
  FetchVaultsParameters;

export type UseSimulationStateParameters<config extends Config = Config> =
  FetchSimulationStateParameters &
    UnionOmit<DeploylessFetchParameters, "blockTag" | "blockNumber"> &
    (
      | {
          blockNumber?: bigint;
          blockTag?: undefined;
        }
      | {
          blockNumber?: undefined;
          // Pending block does not have a number nor a timestamp.
          blockTag?: Exclude<BlockTag, "pending">;
        }
    ) &
    ConfigParameter<config>;

export type UseSimulationStateReturnType =
  | {
      data: undefined;
      error: GetBlockErrorType | ReadContractErrorType;
      isError: true;
      isPending: false;
      isSuccess: false;
      status: "error";
    }
  | {
      data: undefined;
      error: null;
      isError: false;
      isPending: true;
      isSuccess: false;
      status: "pending";
    }
  | {
      data: SimulationState;
      error: null;
      isError: false;
      isPending: false;
      isSuccess: true;
      status: "success";
    };

export function useSimulationState<
  config extends Config = ResolvedRegister["config"],
>(
  parameters: UseSimulationStateParameters<config>,
): UseSimulationStateReturnType {
  const chainId = useChainId(parameters);

  const { config, ...blockParameters } = parameters;
  const block = useBlock({
    ...blockParameters,
    watch: true,
    includeTransactions: false,
  });

  const { morpho } = addresses[chainId];

  const feeRecipient = useReadContract({
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

  return useMemo((): UseSimulationStateReturnType => {
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

    const isSuccess =
      block.isSuccess &&
      feeRecipient.isSuccess &&
      results.every(({ isSuccess }) => isSuccess);

    if (error != null)
      return {
        data: undefined,
        error,
        status: "error",
        isError: true,
        isPending: false,
        isSuccess: false,
      };

    if (isSuccess)
      return {
        data: new SimulationState(
          { feeRecipient: feeRecipient.data },
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
          block.data.number!, // Block cannot be pending, so it must have a number.
          block.data.timestamp,
        ),
        error: null,
        status: "success",
        isError: false,
        isPending: false,
        isSuccess: true,
      };

    return {
      data: undefined,
      error: null,
      status: "pending",
      isError: false,
      isPending: true,
      isSuccess: false,
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
    block.isSuccess,
    feeRecipient.data,
    feeRecipient.error,
    feeRecipient.isSuccess,
  ]);
}
