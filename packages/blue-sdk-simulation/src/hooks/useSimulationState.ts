import { addresses } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
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
  useVaults,
} from "@morpho-org/blue-sdk-wagmi";
import { UnionCompute } from "@wagmi/core/internal";
import { useMemo } from "react";
import { zeroAddress } from "viem";
import { Config, ResolvedRegister, useReadContract } from "wagmi";
import { SimulationState } from "../SimulationState.js";

export type FetchSimulationStateParameters = UnionCompute<
  FetchMarketsParameters &
    FetchUsersParameters &
    FetchTokensParameters &
    FetchVaultsParameters
>;

export type UseSimulationStateParameters<config extends Config = Config> =
  FetchSimulationStateParameters & ConfigParameter<config>;

export function useSimulationState<
  config extends Config = ResolvedRegister["config"],
>(parameters: UseSimulationStateParameters<config>) {
  const chainId = useChainId(parameters);

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

  return useMemo(
    () =>
      new SimulationState(
        { feeRecipient },
        markets, // TODO: change datatype stored to include error reason, fetch status etc
        users,
        tokens,
        vaults,
        positions,
        holdings,
        vaultMarketConfigs,
        chainId,
        blockNumber,
        timestamp,
      ),
    [
      feeRecipient,
      markets,
      users,
      tokens,
      vaults,
      positions,
      holdings,
      vaultMarketConfigs,
      chainId,
      blockNumber,
      timestamp,
    ],
  );
}
