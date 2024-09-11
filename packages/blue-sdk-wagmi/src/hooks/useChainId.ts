import { ChainUtils } from "@morpho-org/blue-sdk";
import { ChainIdParameter } from "@wagmi/core/internal";
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

  return ChainUtils.parseSupportedChainId(parameters.chainId ?? wagmiChainId);
}
