import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual } from "viem";
import type { SimulationErrorContext } from "../../domain/diagnostics.js";
import type {
  AuthorizationEvidence,
  AuthorizationReadBack,
  PermissionState,
} from "../../domain/evidence.js";
import type {
  CompleteEvidence,
  DecodedProbeRead,
  ExecutionEvidence,
  ValidatedAuthorizations,
} from "../../domain/stages.js";
import { brandComplete } from "../../domain/stages.js";
import {
  MissingVerificationEvidenceError,
  PermissionChangeMismatchError,
} from "../../errors.js";
import { probeId } from "../plan/probes.js";

const eq = (a: Address, b: Address) => isAddressEqual(a, b);

const describe = (value: PermissionState): string =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? `${v}n` : v));

/** Locate the prepared-phase read matching one expected permission state. */
const findPreparedRead = (
  reads: readonly DecodedProbeRead[],
  expected: PermissionState,
): DecodedProbeRead | undefined =>
  reads.find((read) => {
    switch (expected.type) {
      case "erc20Allowance":
        return (
          read.type === "erc20Allowance" &&
          eq(read.token, expected.token) &&
          eq(read.owner, expected.owner) &&
          eq(read.spender, expected.spender)
        );
      case "blueAuthorization":
        return (
          read.type === "blueIsAuthorized" &&
          eq(read.morpho, expected.morpho) &&
          eq(read.authorizer, expected.authorizer) &&
          eq(read.authorized, expected.authorized)
        );
      case "erc2612Nonce":
        return (
          read.type === "erc2612Nonce" &&
          eq(read.token, expected.verifyingContract) &&
          eq(read.owner, expected.owner)
        );
      case "blueAuthorizationNonce":
        return (
          read.type === "blueNonce" &&
          eq(read.morpho, expected.verifyingContract) &&
          eq(read.owner, expected.owner)
        );
      case "permit2Nonce":
        return (
          read.type === "permit2NonceBitmap" &&
          eq(read.permit2, expected.permit2) &&
          eq(read.owner, expected.owner) &&
          read.wordPosition === expected.wordPosition
        );
    }
  });

/** Convert a decoded read into the {@link PermissionState} it observed. */
const observedPermission = (
  read: DecodedProbeRead,
  expected: PermissionState,
): PermissionState => {
  switch (expected.type) {
    case "erc20Allowance":
      return read.type === "erc20Allowance"
        ? { ...expected, amount: read.value }
        : expected;
    case "blueAuthorization":
      return read.type === "blueIsAuthorized"
        ? { ...expected, isAuthorized: read.value }
        : expected;
    case "erc2612Nonce":
      return read.type === "erc2612Nonce"
        ? { ...expected, nonce: read.value }
        : expected;
    case "blueAuthorizationNonce":
      return read.type === "blueNonce"
        ? { ...expected, nonce: read.value }
        : expected;
    case "permit2Nonce":
      return read.type === "permit2NonceBitmap"
        ? {
            ...expected,
            bitmap: read.value,
            consumed: (read.value & (1n << (expected.nonce % 256n))) !== 0n,
          }
        : expected;
  }
};

/**
 * Prove that every matched preview authorization executed its preparation
 * calls and that the prepared-phase probes observed exactly the expected
 * permission state.
 *
 * Final mode produces `authorizations: []` — embedded-signature consumption
 * is verified later by {@link verifyPermissions}.
 *
 * @throws {MissingVerificationEvidenceError} when a prepared-phase read is
 *   missing for a planned permission state.
 * @throws {PermissionChangeMismatchError} when the observed prepared state
 *   disagrees with the expected one.
 * @internal
 */
export function proveAuthorizations(
  evidence: ExecutionEvidence,
  validated: ValidatedAuthorizations,
): CompleteEvidence {
  const context: SimulationErrorContext = {
    stage: "verification",
    chainId: evidence.plan.request.chainId,
    mode: evidence.plan.request.mode,
  };

  const authorizations = validated.inputs.bundle.request.authorizations;
  const authorizationsEvidence: AuthorizationEvidence[] = [];

  for (const preparation of validated.preparations) {
    const { authorizationIndex } = preparation;
    const request = authorizations[authorizationIndex];
    if (request == null) {
      throw new MissingVerificationEvidenceError(
        `Preparation for authorizationIndex "${authorizationIndex}" has no authorization`,
        {
          ...context,
          location: { type: "authorization", authorizationIndex },
        },
      );
    }

    const results =
      evidence.preparations.find(
        (entry) => entry.authorizationIndex === authorizationIndex,
      )?.calls ?? [];
    if (results.length !== preparation.calls.length) {
      throw new MissingVerificationEvidenceError(
        `Preparation for authorizationIndex "${authorizationIndex}" returned ${results.length} result(s) for ${preparation.calls.length} planned call(s)`,
        {
          ...context,
          location: { type: "authorization", authorizationIndex },
        },
      );
    }

    const readBack: AuthorizationReadBack[] = preparation.expected.map(
      (expected) => {
        const read = findPreparedRead(evidence.probeReads.prepared, expected);
        if (read == null) {
          throw new MissingVerificationEvidenceError(
            `Prepared phase has no read-back for permission "${expected.type}"`,
            {
              ...context,
              location: {
                type: "authorization",
                authorizationIndex,
              },
            },
          );
        }
        const identity = evidence.plan.calls.find(
          (call) =>
            "read" in call &&
            call.identity.type === "probe" &&
            call.identity.phase === "prepared" &&
            call.identity.probeId === probeId(read),
        )?.identity;
        if (identity == null || identity.type !== "probe") {
          throw new MissingVerificationEvidenceError(
            `No prepared probe identity for read "${probeId(read)}"`,
            {
              ...context,
              location: {
                type: "authorization",
                authorizationIndex,
              },
            },
          );
        }
        const observed = observedPermission(read, expected);
        return { probe: identity, expected, observed };
      },
    );

    for (const { expected, observed } of readBack) {
      const same =
        expected.type === observed.type &&
        Object.keys(expected).every(
          (key) =>
            expected[key as keyof typeof expected] ===
            observed[key as keyof typeof observed],
        );
      if (!same) {
        throw new PermissionChangeMismatchError(
          `Preparation read-back disagrees: expected ${describe(expected)}, observed ${describe(observed)}`,
          {
            ...context,
            location: {
              type: "authorization",
              authorizationIndex,
            },
          },
        );
      }
    }

    const requestChecks =
      request.type === "erc20Approval" || request.type === "blueAuthorization"
        ? ({
            type: "transaction",
            owner: "passed",
            binding: "passed",
            authority: "passed",
          } as const)
        : request.type === "permit2SignatureTransfer"
          ? ({
              type: "permit2SignatureTransfer",
              owner: "passed",
              binding: "passed",
              authority: "passed",
              domain: "passed",
              nonce: "passed",
              deadline: "passed",
              canonicalPermit2Allowance: "passed",
            } as const)
          : ({
              type: "signature",
              owner: "passed",
              binding: "passed",
              authority: "passed",
              domain: "passed",
              nonce: "passed",
              deadline: "passed",
            } as const);

    authorizationsEvidence.push({
      authorizationIndex,
      request,
      preparation: {
        type: "approvalCalls",
        calls: preparation.calls.map((transaction, i) => ({
          transaction,
          result: results[i]!,
        })),
      },
      requestChecks,
      readBack,
    } as AuthorizationEvidence);
  }

  return brandComplete(
    deepFreeze({
      ...evidence,
      authorizations: authorizationsEvidence,
    }),
  );
}
