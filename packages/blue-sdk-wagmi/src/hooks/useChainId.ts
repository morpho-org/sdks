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

  return parameters?.chainId ?? wagmiChainId;
}
