import { ChainUtils } from "@morpho-org/blue-sdk";
import { useMemo } from "react";
import {
  type Config,
  type ResolvedRegister,
  useChainId as wagmi_useChainId,
} from "wagmi";
import type { ConfigParameter } from "../types/index.js";

export type UseChainIdParameters<config extends Config = Config> =
  ConfigParameter<config> & {
    chainId?: config["chains"][number]["id"];
  };

export function useChainId<config extends Config = ResolvedRegister["config"]>(
  parameters?: UseChainIdParameters<config>,
) {
  const wagmiChainId = wagmi_useChainId(parameters);

  const chainId = parameters?.chainId ?? wagmiChainId;

  return useMemo(() => ChainUtils.parseSupportedChainId(chainId), [chainId]);
}
