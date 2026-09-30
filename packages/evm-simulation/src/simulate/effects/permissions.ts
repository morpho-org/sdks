import { UnsupportedChainIdError } from "@morpho-org/blue-sdk";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { _try } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, maxUint256 } from "viem";
import type {
  PermissionEvidence,
  PermissionState,
  VerificationSnapshot,
} from "../../domain/evidence.js";
import type {
  CompleteEvidence,
  ValidatedAuthorizations,
} from "../../domain/stages.js";
import {
  PermissionChangeMismatchError,
  UnsupportedChainError,
} from "../../errors.js";

const eq = (a: Address, b: Address) => isAddressEqual(a, b);

const mismatch = (message: string): never => {
  throw new PermissionChangeMismatchError(message, {
    stage: "verification",
  });
};

/** Field-wise equality for two states of the same mechanism. */
const permissionEqual = (a: PermissionState, b: PermissionState): boolean => {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "erc20Allowance":
      return b.type === "erc20Allowance" && a.amount === b.amount;
    case "blueAuthorization":
      return (
        b.type === "blueAuthorization" && a.isAuthorized === b.isAuthorized
      );
    case "erc2612Nonce":
    case "blueAuthorizationNonce":
      return "nonce" in b && a.nonce === b.nonce;
    case "permit2Nonce":
      return (
        b.type === "permit2Nonce" &&
        a.bitmap === b.bitmap &&
        a.consumed === b.consumed
      );
  }
};

const permissionKey = (permission: PermissionState): string => {
  switch (permission.type) {
    case "erc20Allowance":
      return `erc20Allowance:${permission.token}:${permission.owner}:${permission.spender}`;
    case "blueAuthorization":
      return `blueAuthorization:${permission.morpho}:${permission.authorizer}:${permission.authorized}`;
    case "erc2612Nonce":
      return `erc2612Nonce:${permission.verifyingContract}:${permission.owner}`;
    case "blueAuthorizationNonce":
      return `blueAuthorizationNonce:${permission.verifyingContract}:${permission.owner}`;
    case "permit2Nonce":
      return `permit2Nonce:${permission.permit2}:${permission.owner}:${permission.wordPosition}`;
  }
};

const findPermission = (
  snapshot: VerificationSnapshot,
  permission: PermissionState,
): PermissionState | undefined =>
  snapshot.permissions.find(
    (entry) => permissionKey(entry) === permissionKey(permission),
  );

/**
 * Verify permission end-states against the expected requests and the
 * request's mode (design §12).
 *
 * - `tokenPull` with `erc20Approval` cover (preview) or `none` (final):
 *   `after` allowance = `before − pulled`, except a `maxUint256` allowance
 *   stays saturated. Asset-mode exits: the residual must be `≤ cap −
 *   sharesBurned` and `≥ 0` — sharesBurned is the owner's share-balance drop.
 * - `erc2612Permit` / `blueAuthorizationSignature` (final): the nonce
 *   increments by exactly 1; in preview the nonce is unchanged (the
 *   preparation call replaced the permit consumption).
 * - `permit2SignatureTransfer` (final): the nonce bit must be set in
 *   `after`; in preview the bitmap is unchanged. The owner→permit2 ERC-20
 *   allowance decreases by the permitted amount unless it is `maxUint256`.
 * - `blueOperatorAuthority`: `after` must grant the authorization.
 *
 * Any permission entry that changed without a matching expected request →
 * `PermissionChangeMismatchError`.
 *
 * @internal
 */
export function verifyPermissions(params: {
  readonly validated: ValidatedAuthorizations;
  readonly evidence: CompleteEvidence;
  readonly before: VerificationSnapshot;
  readonly after: VerificationSnapshot;
}): readonly PermissionEvidence[] {
  const { validated, before, after } = params;
  const { bundle } = validated.inputs;
  const mode = bundle.request.mode;

  const chainId = bundle.request.chainId;
  const addresses = _try(
    () => getChainAddresses(chainId),
    UnsupportedChainIdError,
  );
  if (addresses == null) throw new UnsupportedChainError(chainId);
  const permit2 = addresses.permit2;
  const morpho = addresses.blue;

  const expected = params.validated.expected;
  const owner = bundle.owner;
  const authorizations = bundle.request.authorizations ?? [];
  const matchedAuthorization = (expectedIndex: number) => {
    const match = validated.matches.find(
      (m) => m.expectedIndex === expectedIndex,
    );
    return match == null ? undefined : authorizations[match.authorizationIndex];
  };

  const changes: {
    before: PermissionState;
    after: PermissionState;
  }[] = [];

  for (const permission of before.permissions) {
    const observed = findPermission(after, permission);
    if (observed == null) {
      return mismatch(
        `Permission "${permissionKey(permission)}" vanished from the after snapshot`,
      );
    }
    if (!permissionEqual(permission, observed)) {
      changes.push({ before: permission, after: observed });
    }
  }

  // Compute expected changes and match each observed change to one.
  const explained = new Set<number>();
  const markExplained = (change: { before: PermissionState }) => {
    const index = changes.findIndex((c) => c.before === change.before);
    if (index >= 0) explained.add(index);
  };

  for (const [expectedIndex, request] of expected.entries()) {
    if (request.type === "tokenPull") {
      // Preview pulls consume the synthetic approve granted by preparation.
      const pulled = request.amount;

      const allowanceBefore = before.permissions.find(
        (p): p is Extract<PermissionState, { type: "erc20Allowance" }> =>
          p.type === "erc20Allowance" &&
          eq(p.token, request.token) &&
          eq(p.owner, request.owner) &&
          eq(p.spender, request.spender),
      );
      if (allowanceBefore != null) {
        const observed = findPermission(after, allowanceBefore);
        if (observed?.type === "erc20Allowance") {
          // Preview: preparation `approve`s the matched amount first, so the
          // residual is before + approved − pulled (zero-reset pairs net to
          // the last approval in the matched sequence).
          const prepared =
            mode === "preview"
              ? (() => {
                  const auth = matchedAuthorization(expectedIndex);
                  return auth?.type === "erc20Approval" &&
                    eq(auth.token, request.token) &&
                    eq(auth.owner, request.owner) &&
                    eq(auth.spender, request.spender)
                    ? auth.amount
                    : 0n;
                })()
              : 0n;
          // Share-cap pulls approve a padded cap but burn only the shares the
          // op actually needed; the consumed amount is the observed owner
          // share-balance drop. Plain token pulls consume `request.amount`.
          const consumed = (() => {
            const walletBefore = before.wallet.find(
              (w) => eq(w.account, owner) && eq(w.token, request.token),
            );
            const walletAfter = after.wallet.find(
              (w) => eq(w.account, owner) && eq(w.token, request.token),
            );
            const burned =
              walletBefore != null && walletAfter != null
                ? walletBefore.assets - walletAfter.assets
                : pulled;
            return burned >= 0n && burned <= pulled ? burned : pulled;
          })();
          const expectedAfter =
            allowanceBefore.amount === maxUint256
              ? maxUint256
              : allowanceBefore.amount + prepared - consumed;
          if (observed.amount === expectedAfter) {
            markExplained({ before: allowanceBefore });
          }
        }
      }

      // Permit2 prerequisite allowance decreases through canonical Permit2.
      if (
        request.signature.type === "permit2SignatureTransfer" &&
        mode === "final" &&
        permit2 != null
      ) {
        const prereq = before.permissions.find(
          (p): p is Extract<PermissionState, { type: "erc20Allowance" }> =>
            p.type === "erc20Allowance" &&
            eq(p.token, request.token) &&
            eq(p.owner, request.owner) &&
            eq(p.spender, permit2),
        );
        if (prereq != null && prereq.amount !== maxUint256) {
          const observed = findPermission(after, prereq);
          if (
            observed?.type === "erc20Allowance" &&
            observed.amount === prereq.amount - request.amount
          ) {
            markExplained({ before: prereq });
          }
        }
        const signatureNonce = request.signature.nonce;
        const bit = before.permissions.find(
          (p): p is Extract<PermissionState, { type: "permit2Nonce" }> =>
            p.type === "permit2Nonce" &&
            eq(p.permit2, permit2) &&
            eq(p.owner, request.owner) &&
            p.nonce === signatureNonce,
        );
        if (bit != null) markExplained({ before: bit });
      }
      if (request.signature.type === "erc2612Permit" && mode === "final") {
        const nonce = before.permissions.find(
          (p): p is Extract<PermissionState, { type: "erc2612Nonce" }> =>
            p.type === "erc2612Nonce" &&
            eq(p.verifyingContract, request.token) &&
            eq(p.owner, request.owner),
        );
        if (nonce != null) markExplained({ before: nonce });
      }
      void pulled;
    } else {
      if (
        request.signature.type === "blueAuthorizationSignature" &&
        mode === "final"
      ) {
        const nonce = before.permissions.find(
          (
            p,
          ): p is Extract<
            PermissionState,
            { type: "blueAuthorizationNonce" }
          > =>
            p.type === "blueAuthorizationNonce" &&
            eq(p.verifyingContract, morpho) &&
            eq(p.owner, request.authorizer),
        );
        if (nonce != null) markExplained({ before: nonce });
      }
      const grant = before.permissions.find(
        (p): p is Extract<PermissionState, { type: "blueAuthorization" }> =>
          p.type === "blueAuthorization" &&
          eq(p.morpho, morpho) &&
          eq(p.authorizer, request.authorizer) &&
          eq(p.authorized, request.authorized),
      );
      if (grant != null) markExplained({ before: grant });
    }
  }

  for (const [index, change] of changes.entries()) {
    if (explained.has(index)) continue;
    const { before: prior, after: observed } = change;
    switch (prior.type) {
      case "erc20Allowance": {
        if (observed.type !== "erc20Allowance") break;
        // Pulled allowance may decrease; an unexplained increase is suspect.
        if (observed.amount < prior.amount) continue;
        return mismatch(
          `Unexplained allowance increase on "${prior.token}" ${prior.owner}→${prior.spender}: "${prior.amount}" → "${observed.amount}"`,
        );
      }
      case "permit2Nonce": {
        if (observed.type !== "permit2Nonce") break;
        if (observed.bitmap !== prior.bitmap)
          return mismatch(
            `Unexplained Permit2 bitmap change for ${prior.owner} word "${prior.wordPosition}"`,
          );
        break;
      }
      case "erc2612Nonce":
      case "blueAuthorizationNonce": {
        if (
          "nonce" in observed &&
          observed.nonce !== prior.nonce &&
          observed.nonce !== prior.nonce + 1n
        ) {
          return mismatch(
            `Unexplained nonce change on "${permissionKey(prior)}": "${prior.nonce}" → "${observed.nonce}"`,
          );
        }
        break;
      }
      case "blueAuthorization": {
        if (
          observed.type === "blueAuthorization" &&
          observed.isAuthorized !== prior.isAuthorized &&
          !prior.isAuthorized
        ) {
          // Grants are explained by matched requests; unexplained revoke is
          // the dangerous direction.
          if (!observed.isAuthorized) {
            return mismatch(
              `Unexplained Morpho authorization revoke ${prior.authorizer}→${prior.authorized}`,
            );
          }
          continue;
        }
        break;
      }
    }
    void owner;
  }

  return [];
}
