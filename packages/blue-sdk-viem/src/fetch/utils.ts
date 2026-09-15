import { toBlockParameters } from "@morpho-org/morpho-ts";
import type { FetchParameters } from "../types.js";

/** @internal Extracts and converts SDK options at the viem call boundary. */
export const callParameters = (parameters: FetchParameters) => ({
  account: parameters.account,
  stateOverride: parameters.stateOverride,
  ...toBlockParameters(parameters.block),
});
