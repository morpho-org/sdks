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
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister } from "wagmi";
import { UseQueryReturnType } from "wagmi/query";
import { SimulationState } from "../SimulationState.js";

export type FetchSimulationStateParameters = UnionCompute<
  FetchMarketsParameters &
    FetchUsersParameters &
    FetchTokensParameters &
    FetchVaultsParameters
>;

export type UseSimulationStateParameters<config extends Config = Config> =
  FetchSimulationStateParameters & ConfigParameter<config>;

export type UseSimulationStateReturnType<selectData = SimulationState> =
  UseQueryReturnType<selectData, ReadContractErrorType>;

export function useSimulationState<
  config extends Config = ResolvedRegister["config"],
  selectData = SimulationState,
>(
  parameters: UseSimulationStateParameters<config>,
): UseSimulationStateReturnType<selectData> {
  const chainId = useChainId(parameters);

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
        global,
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
      ),
    [],
  );
}
