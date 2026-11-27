import { midnightAbi } from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { readContract } from "viem/actions";
import { midnightSetIsAuthorized } from "../../actions/midnight/authorization.js";
import { InvalidTransactionPlanError } from "../error.js";
import type { Action, Step } from "../types.js";

type Authorization = Extract<Action, { type: "midnightAuthorization" }>;

/** @internal Resolves the ordinary registry bundle grant after the RPC chain has been checked. */
export async function prepareMidnightBundleAuthorization(
  client: Client,
  inputs: { readonly chainId: number; readonly account: Address },
): Promise<Step<Authorization> | undefined> {
  const { chainId, account } = inputs;
  const isAuthorized = await readContract(client, {
    address: getChainAddress(chainId, "midnight"),
    abi: midnightAbi,
    functionName: "isAuthorized",
    args: [account, getChainAddress(chainId, "midnightBundlesV2")],
  });
  if (isAuthorized) {
    return undefined;
  }
  return {
    id: "midnightAuthorization",
    label: "Authorize Midnight bundle",
    action: { type: "midnightAuthorization", inputs },
  };
}

/** @internal Derives the authorization target from the chain, not from a stored operator. */
export function buildMidnightAuthorization({ inputs }: Authorization) {
  return midnightSetIsAuthorized({
    chainId: inputs.chainId,
    onBehalf: inputs.account,
    authorized: getChainAddress(inputs.chainId, "midnightBundlesV2"),
  });
}

/** @internal Midnight steps never use signature requests. */
export function validateSignaturelessMidnightAction(
  action: Record<string, unknown>,
  path: string,
): void {
  if ("signatureRequestIds" in action) {
    throw new InvalidTransactionPlanError({
      path: `${path}.signatureRequestIds`,
      reason: "Midnight steps do not consume signatures",
    });
  }
}
