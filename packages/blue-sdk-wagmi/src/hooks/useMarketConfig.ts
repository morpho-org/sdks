import {
  MarketConfig,
  MarketId,
  UnknownMarketConfigError,
  _try,
  addresses,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { useCallback } from "react";
import { Address } from "viem";
import {
  Config,
  ResolvedRegister,
  UseReadContractParameters,
  UseReadContractReturnType,
  useReadContract,
} from "wagmi";
import { ReadContractData } from "wagmi/query";
import { useChainId } from "./useChainId.js";

export type UseMarketConfigParameters<config extends Config = Config> = {
  id?: MarketId;
} & Omit<
  UseReadContractParameters<
    typeof blueAbi,
    "idToMarketParams",
    [MarketId],
    config,
    MarketConfig
  >,
  "address" | "abi" | "functionName" | "args"
>;

export type UseMarketConfigReturnType = UseReadContractReturnType<
  typeof blueAbi,
  "idToMarketParams",
  [MarketId],
  MarketConfig
>;

export function initialMarketConfig(id?: MarketId) {
  if (id == null) return;

  return _try(() => {
    const { loanToken, collateralToken, oracle, irm, lltv } =
      MarketConfig.get(id);

    return [
      loanToken as Address,
      collateralToken as Address,
      oracle as Address,
      irm as Address,
      lltv,
    ] as const;
  }, UnknownMarketConfigError);
}

export function selectMarketConfig([
  loanToken,
  collateralToken,
  oracle,
  irm,
  lltv,
]: ReadContractData<typeof blueAbi, "idToMarketParams", [MarketId]>) {
  return new MarketConfig({
    loanToken,
    collateralToken,
    oracle,
    irm,
    lltv,
  });
}

export function useMarketConfig<
  config extends Config = ResolvedRegister["config"],
>(parameters: UseMarketConfigParameters<config>): UseMarketConfigReturnType {
  const chainId = useChainId(parameters);

  const { morpho } = addresses[chainId];

  return useReadContract({
    ...parameters,
    chainId,
    address: morpho,
    abi: blueAbi,
    functionName: "idToMarketParams",
    args: [parameters.id!],
    query: {
      // Disable refetching by default for immutable market configs.
      refetchInterval: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      ...parameters.query,
      enabled: parameters.query?.enabled !== false && parameters.id != null,
      initialData: useCallback(
        () => initialMarketConfig(parameters.id),
        [parameters.id],
      ),
      select: selectMarketConfig,
    },
  });
}
