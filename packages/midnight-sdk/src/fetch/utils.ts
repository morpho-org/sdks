import { toBlockParameters } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { getChainId } from "viem/actions";
import { ChainIdMismatchError } from "../errors.js";
import type {
  DeploylessFetchParameters,
  MidnightCallParameters,
} from "./types.js";

/** @internal Extracts viem call parameters from Midnight fetch inputs. */
export const callParameters = (params: MidnightCallParameters) => ({
  account: params.account,
  ...toBlockParameters(params.block),
  stateOverride: params.stateOverride,
});

/** @internal Returns the configured deployless mode, defaulting to enabled. */
export const shouldUseDeployless = (params: DeploylessFetchParameters) =>
  params.deployless ?? true;

/** @internal Returns the RPC chain id and rejects configured-chain drift. */
export const resolveChainId = async (client: Client) => {
  const rpcChainId = await getChainId(client);
  if (client.chain?.id != null && client.chain.id !== rpcChainId) {
    throw new ChainIdMismatchError(client.chain.id, BigInt(rpcChainId));
  }

  return rpcChainId;
};
