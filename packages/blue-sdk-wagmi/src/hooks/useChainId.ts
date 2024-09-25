import { ChainUtils } from "@morpho-org/blue-sdk";
import { ChainIdParameter } from "@wagmi/core/internal";
import { useMemo } from "react";
import {
  Config,
  ResolvedRegister,
  useChainId as wagmi_useChainId,
} from "wagmi";
import { ConfigParameter } from "../types/properties.js";

export type UseChainIdParameters<config extends Config = Config> =
  ChainIdParameter<config> & ConfigParameter<config>;

export function useChainId<config extends Config = ResolvedRegister["config"]>(
  parameters: UseChainIdParameters<config>,
) {
  const wagmiChainId = wagmi_useChainId(parameters);

  const chainId = parameters.chainId ?? wagmiChainId;

  return useMemo(() => ChainUtils.parseSupportedChainId(chainId), [chainId]);
}
