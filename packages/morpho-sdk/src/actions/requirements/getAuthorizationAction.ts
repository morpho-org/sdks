import { getChainAddresses } from "@morpho-org/blue-sdk";
import { isAddressEqual } from "viem";
import type { Action } from "../../bundler/index.js";
import {
  type AuthorizationRequirementSignature,
  BundlerErrors,
} from "../../types/index.js";

/**
 * Encodes the bundler action that consumes a signed Morpho authorization, granting
 * `authorized` (GeneralAdapter1) operator rights on behalf of the signer via
 * `setAuthorizationWithSig` — replacing a standalone `setAuthorization` transaction.
 *
 * The signature's `authorized` is pinned to the chain's `GeneralAdapter1`: an authorization
 * targeting any other account is rejected so the bundle can never hand operator rights over the
 * user's Morpho position to an unintended address. The action is emitted with `skipRevert: false`
 * so a rejected or stale authorization fails the whole bundle rather than letting a later
 * on-behalf Morpho call revert opaquely.
 *
 * @param chainId - Chain whose `GeneralAdapter1` the signature must authorize.
 * @param signature - The signed authorization produced by `Requirement.sign()`.
 * @returns A single `morphoSetAuthorizationWithSig` bundler `Action`.
 * @throws {BundlerErrors.UnexpectedSignature} when `signature.args.authorized` is not the chain's
 *   `GeneralAdapter1`.
 * @example
 * ```ts
 * import { getAuthorizationAction } from "@morpho-org/morpho-sdk";
 *
 * // `requirement` comes from `getMorphoAuthorizationRequirement` with `supportSignature: true`.
 * const signed = await requirement.sign(walletClient, borrower);
 * const action = getAuthorizationAction(1, signed);
 * // action satisfies { type: "morphoSetAuthorizationWithSig"; args: [...] }
 * ```
 */
export const getAuthorizationAction = (
  chainId: number,
  signature: AuthorizationRequirementSignature,
): Action => {
  const { owner, authorized, isAuthorized, nonce, deadline } = signature.args;

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  if (!isAddressEqual(authorized, generalAdapter1)) {
    throw new BundlerErrors.UnexpectedSignature(authorized);
  }

  return {
    type: "morphoSetAuthorizationWithSig",
    args: [
      { authorizer: owner, authorized, isAuthorized, nonce, deadline },
      signature.args.signature,
      false /* skipRevert */,
    ],
  };
};
