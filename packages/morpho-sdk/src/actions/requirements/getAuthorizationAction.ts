import type { Action } from "../../bundler/index.js";
import type { AuthorizationRequirementSignature } from "../../types/index.js";

/**
 * Encodes the bundler action that consumes a signed Morpho authorization, granting
 * `authorized` (GeneralAdapter1) operator rights on behalf of the signer via
 * `setAuthorizationWithSig` — replacing a standalone `setAuthorization` transaction.
 *
 * The action is emitted with `skipRevert: false` so a rejected or stale authorization fails the
 * whole bundle rather than letting a later on-behalf Morpho call revert opaquely.
 *
 * @param signature - The signed authorization produced by `Requirement.sign()`.
 * @returns A single `morphoSetAuthorizationWithSig` bundler `Action`.
 * @example
 * ```ts
 * import { getAuthorizationAction } from "@morpho-org/morpho-sdk";
 *
 * // `requirement` comes from `getMorphoAuthorizationRequirement` with `supportSignature: true`.
 * const signed = await requirement.sign(walletClient, borrower);
 * const action = getAuthorizationAction(signed);
 * // action satisfies { type: "morphoSetAuthorizationWithSig"; args: [...] }
 * ```
 */
export const getAuthorizationAction = (
  signature: AuthorizationRequirementSignature,
): Action => {
  const { owner, authorized, isAuthorized, nonce, deadline } = signature.args;

  return {
    type: "morphoSetAuthorizationWithSig",
    args: [
      { authorizer: owner, authorized, isAuthorized, nonce, deadline },
      signature.args.signature,
      false /* skipRevert */,
    ],
  };
};
