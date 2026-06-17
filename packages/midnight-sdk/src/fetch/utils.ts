import type { Client } from "viem";
import { getChainId } from "viem/actions";
import type {
  DeploylessFetchParameters,
  MidnightCallParameters,
} from "./types.js";

/** @internal Extracts viem call parameters from Midnight fetch inputs. */
export const callParameters = (
  params: MidnightCallParameters,
): MidnightCallParameters => ({
  account: params.account,
  blockNumber: params.blockNumber,
  blockTag: params.blockTag,
  stateOverride: params.stateOverride,
});

/** @internal Returns the configured deployless mode, defaulting to enabled. */
export const shouldUseDeployless = (params: DeploylessFetchParameters) =>
  params.deployless ?? true;

/** @internal Extracts block selectors accepted by `getBytecode`. */
export const bytecodeCallParameters = (params: MidnightCallParameters) => {
  if (params.blockNumber != null) return { blockNumber: params.blockNumber };
  if (params.blockTag != null) return { blockTag: params.blockTag };

  return {};
};

/** @internal Returns the configured viem client chain id or fetches it from RPC. */
export const resolveChainId = async (client: Client) =>
  client.chain?.id ?? (await getChainId(client));
