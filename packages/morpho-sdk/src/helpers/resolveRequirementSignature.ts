import type { Address, Hex, TypedDataDefinition } from "viem";
import { verifyTypedData } from "viem";
import type {
  AuthorizationAction,
  AuthorizationRequirementSignature,
  Permit2Action,
  PermitAction,
  PermitRequirementSignature,
  RequirementSignature,
} from "../types/index.js";
import {
  InvalidSignatureError,
  MalformedSignatureTypedDataError,
  MissingSignatureOwnerError,
  UnsupportedSignatureTypedDataError,
} from "../types/index.js";

/**
 * An externally collected EIP-712 signature paired with the exact typed data that was signed.
 * The building block of a stateless prepare/finalize flow: the typed data exposed at prepare
 * time already carries every value `buildTx` needs (nonce, deadline, amount, asset), so a
 * signature collected out-of-band can be turned back into a `RequirementSignature` without any
 * on-chain read or live SDK object.
 */
export interface SignedTypedData {
  /**
   * The EIP-712 typed data that was exposed to the wallet and signed. Must be the exact object
   * that produced `signature` — do not regenerate it at finalize time.
   */
  readonly typedData: TypedDataDefinition;
  /** The raw EIP-712 signature returned by the wallet. */
  readonly signature: Hex;
  /**
   * The signing account. Derived from the message for ERC-2612 (`owner`) and Blue authorization
   * (`authorizer`), but **required** for Permit2, whose `PermitSingle` message carries no owner.
   */
  readonly owner?: Address;
}

/** Options for {@link resolveRequirementSignature}. */
export interface ResolveRequirementSignatureOptions {
  /**
   * Verify that `signature` recovers to the expected signer before returning (default `true`).
   * Uses viem's `verifyTypedData` (EOA, no RPC). For an ERC-1271 smart-account signer, pass
   * `false` and verify with the client-bound viem `verifyTypedData` action separately.
   */
  readonly verify?: boolean;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  (value ?? {}) as Record<string, unknown>;

const readAddress = (
  message: Record<string, unknown>,
  field: string,
): Address => {
  const value = message[field];
  if (typeof value !== "string")
    throw new MalformedSignatureTypedDataError(field, "address");
  return value as Address;
};

// Tolerant of JSON round-trips: a serialized continuation token stringifies bigints.
const readBigInt = (
  message: Record<string, unknown>,
  field: string,
): bigint => {
  const value = message[field];
  if (typeof value === "bigint") return value;
  if (typeof value === "string" || typeof value === "number")
    return BigInt(value);
  throw new MalformedSignatureTypedDataError(field, "bigint");
};

const readBool = (message: Record<string, unknown>, field: string): boolean => {
  const value = message[field];
  if (typeof value !== "boolean")
    throw new MalformedSignatureTypedDataError(field, "boolean");
  return value;
};

/**
 * Turns an externally collected EIP-712 signature and its signed typed data into a
 * `RequirementSignature` ready to hand to an `ActionOutput.buildTx(...)`.
 *
 * Discriminates on `typedData.primaryType`: `"Permit"` (ERC-2612), `"PermitSingle"` (Permit2), and
 * `"Authorization"` (Morpho Blue). It performs no on-chain read — every value comes from the typed
 * data — so a signature signed on one process can be finalized on another without a live SDK
 * object. The asset is read from `domain.verifyingContract` for ERC-2612 and from
 * `message.details.token` for Permit2. Midnight offer-root signatures are not covered: their
 * encoded `payload` is not derivable from the typed data alone.
 *
 * @param input - The signed typed data, signature, and (for Permit2) the signing `owner`.
 * @param options - Resolution options.
 * @returns The `RequirementSignature` matching the typed data's `primaryType`.
 * @throws {UnsupportedSignatureTypedDataError} when `primaryType` is not a supported requirement (including DAI permits).
 * @throws {MissingSignatureOwnerError} when Permit2 typed data is resolved without an `owner`.
 * @throws {MalformedSignatureTypedDataError} when a required message field is missing or mistyped.
 * @throws {InvalidSignatureError} when `verify` is set and the signature does not recover to the signer.
 * @example
 * ```ts
 * import { resolveRequirementSignature } from "@morpho-org/morpho-sdk";
 *
 * // finalize step: no RPC, no live SDK object
 * const signature = await resolveRequirementSignature({
 *   typedData, // the exact typed data exposed at prepare time
 *   signature: walletSignature,
 *   owner, // required for Permit2
 * });
 * const tx = actionOutput.buildTx([signature]);
 * ```
 */
export async function resolveRequirementSignature(
  { typedData, signature, owner }: SignedTypedData,
  { verify = true }: ResolveRequirementSignatureOptions = {},
): Promise<RequirementSignature> {
  const message = asRecord(typedData.message);
  const { primaryType } = typedData;

  let resolved: RequirementSignature;
  let signer: Address;

  switch (primaryType) {
    case "Permit": {
      // Distinguish the DAI permit (holder/expiry/allowed), which has no RequirementSignature form.
      if (!("owner" in message))
        throw new UnsupportedSignatureTypedDataError("Permit (DAI)");

      const asset = readAddress(
        asRecord(typedData.domain),
        "verifyingContract",
      );
      const permitOwner = readAddress(message, "owner");
      const spender = readAddress(message, "spender");
      const amount = readBigInt(message, "value");
      const nonce = readBigInt(message, "nonce");
      const deadline = readBigInt(message, "deadline");

      const action: PermitAction = {
        type: "permit",
        args: { spender, amount, deadline },
      };
      resolved = {
        args: { owner: permitOwner, nonce, asset, signature, amount, deadline },
        action,
      } satisfies PermitRequirementSignature;
      signer = permitOwner;
      break;
    }

    case "PermitSingle": {
      if (owner == null) throw new MissingSignatureOwnerError();
      const details = asRecord(message.details);

      const asset = readAddress(details, "token");
      const amount = readBigInt(details, "amount");
      const expiration = readBigInt(details, "expiration");
      const nonce = readBigInt(details, "nonce");
      const spender = readAddress(message, "spender");
      const deadline = readBigInt(message, "sigDeadline");

      const action: Permit2Action = {
        type: "permit2",
        args: { spender, amount, deadline, expiration },
      };
      resolved = {
        args: { owner, nonce, asset, signature, amount, deadline, expiration },
        action,
      } satisfies PermitRequirementSignature;
      signer = owner;
      break;
    }

    case "Authorization": {
      const authOwner = readAddress(message, "authorizer");
      const authorized = readAddress(message, "authorized");
      const isAuthorized = readBool(message, "isAuthorized");
      const nonce = readBigInt(message, "nonce");
      const deadline = readBigInt(message, "deadline");

      const action: AuthorizationAction = {
        type: "authorization",
        args: { authorized, isAuthorized, deadline },
      };
      resolved = {
        args: {
          owner: authOwner,
          authorized,
          isAuthorized,
          nonce,
          deadline,
          signature,
        },
        action,
      } satisfies AuthorizationRequirementSignature;
      signer = authOwner;
      break;
    }

    default:
      throw new UnsupportedSignatureTypedDataError(primaryType);
  }

  if (verify) {
    const isValid = await verifyTypedData({
      ...typedData,
      address: signer,
      signature,
    });
    if (!isValid) throw new InvalidSignatureError();
  }

  return resolved;
}

/**
 * Resolves several {@link SignedTypedData} into a `RequirementSignature[]` ready to pass straight to
 * `ActionOutput.buildTx(signatures)`.
 *
 * @param inputs - The signed typed data entries to resolve.
 * @param options - Resolution options applied to every entry.
 * @returns The resolved signatures, in input order.
 * @throws {UnsupportedSignatureTypedDataError} when any entry has an unsupported `primaryType`.
 * @throws {MissingSignatureOwnerError} when a Permit2 entry is resolved without an `owner`.
 * @throws {MalformedSignatureTypedDataError} when a required message field is missing or mistyped.
 * @throws {InvalidSignatureError} when `verify` is set and any signature does not recover to its signer.
 * @example
 * ```ts
 * import { resolveRequirementSignatures } from "@morpho-org/morpho-sdk";
 *
 * const signatures = await resolveRequirementSignatures([
 *   { typedData: permitTypedData, signature: permitSig, owner },
 *   { typedData: authTypedData, signature: authSig },
 * ]);
 * const tx = actionOutput.buildTx(signatures);
 * ```
 */
export function resolveRequirementSignatures(
  inputs: readonly SignedTypedData[],
  options?: ResolveRequirementSignatureOptions,
): Promise<RequirementSignature[]> {
  return Promise.all(
    inputs.map((input) => resolveRequirementSignature(input, options)),
  );
}
