import { MarketConfig, MarketId, addresses } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { ChainIdParameter } from "@wagmi/core/internal";
import { Address } from "viem";
import { Config, ResolvedRegister, UseReadContractParameters } from "wagmi";
import { useChainId } from "./useChainId.js";
import { initialMarketConfig, selectMarketConfig } from "./useMarketConfig.js";
import {
  UseReadContractsReturnType,
  useReadContracts,
} from "./useReadContracts.js";

export type UseMarketConfigsContracts = {
  chainId: number;
  address: Address;
  abi: typeof blueAbi;
  functionName: "idToMarketParams";
  args: [MarketId];
}[];

export type UseMarketConfigsParameters<config extends Config = Config> = {
  ids: Iterable<MarketId>;
} & Omit<
  UseReadContractParameters<
    typeof blueAbi,
    "idToMarketParams",
    [MarketId],
    config,
    MarketConfig
  >,
  "address" | "abi" | "functionName" | "args"
> &
  ChainIdParameter<config>;

export type UseMarketConfigsReturnType = UseReadContractsReturnType<
  typeof blueAbi,
  "idToMarketParams",
  [MarketId],
  MarketConfig
>;

export function useMarketConfigs<
  config extends Config = ResolvedRegister["config"],
>(parameters: UseMarketConfigsParameters<config>): UseMarketConfigsReturnType {
  const chainId = useChainId(parameters);

  const { morpho } = addresses[chainId];

  return useReadContracts<
    typeof blueAbi,
    "idToMarketParams",
    [MarketId],
    config,
    MarketConfig
  >(
    Array.from(
      parameters.ids,
      (id) =>
        ({
          ...parameters,
          chainId,
          address: morpho,
          abi: blueAbi,
          functionName: "idToMarketParams",
          args: [id],
          query: {
            // Disable refetching by default for immutable market configs.
            refetchInterval: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
            refetchOnWindowFocus: false,
            staleTime: Infinity,
            ...parameters.query,
            initialData: initialMarketConfig(id),
            select: selectMarketConfig,
          },
        }) as const,
    ),
  );
}
