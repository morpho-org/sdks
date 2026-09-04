import {
  compactSignatureToSignature,
  type Hex,
  parseCompactSignature,
  parseSignature,
  type Signature,
  size,
} from "viem";

/**
 * ECDSA signature split into the `(v, r, s)` triple every Morpho periphery ABI declares.
 * @internal
 */
export interface NormalizedEcdsaSignature {
  /** Recovery identifier, already widened from `yParity` when the encoding omitted `v`. */
  readonly v: number;
  /** Signature `r` component. */
  readonly r: Hex;
  /** Signature `s` component. */
  readonly s: Hex;
}

/**
 * Splits a serialized ECDSA signature into the `(v, r, s)` triple periphery contracts pass to
 * `ecrecover`, accepting both the 65-byte serialized form and the 64-byte EIP-2098 compact form.
 *
 * Signers differ in what they emit: viem's `signTypedData` returns 65 bytes with `v`, while
 * EIP-2098 wallets return 64 bytes and some return `yParity` instead of `v`. All three normalize to
 * the same triple here, so each periphery encoder keeps one branch instead of re-deriving `v`.
 *
 * Errors are raised through `onInvalid` so every caller surfaces its own typed mismatch error with
 * the field and encoding context an integrator can act on.
 *
 * @param serializedSignature - Serialized 64-byte compact or 65-byte ECDSA signature.
 * @param onInvalid - Factory returning the typed error to throw; receives the expected encoding and
 *   the underlying `cause` when viem rejected the input.
 * @returns The normalized `(v, r, s)` triple.
 * @throws The error returned by `onInvalid` when the signature is undecodable, or when it carries
 *   neither `v` nor `yParity`.
 * @example
 * ```ts
 * const { v, r, s } = normalizeEcdsaSignature(
 *   requirementSignature.args.signature,
 *   ({ expected, cause }) =>
 *     new VaultExitBundlesV1PermitMismatchError({
 *       field: "signature",
 *       expected,
 *       actual: requirementSignature.args.signature,
 *       cause,
 *     }),
 * );
 * ```
 * @internal
 */
export const normalizeEcdsaSignature = (
  serializedSignature: Hex,
  onInvalid: (params: {
    readonly expected: string;
    readonly cause?: unknown;
  }) => Error,
): NormalizedEcdsaSignature => {
  let parsed: Signature;
  try {
    parsed =
      size(serializedSignature) === 64
        ? compactSignatureToSignature(
            parseCompactSignature(serializedSignature),
          )
        : parseSignature(serializedSignature);
  } catch (cause) {
    throw onInvalid({
      expected: "a 64-byte compact or 65-byte serialized ECDSA signature",
      cause,
    });
  }

  const v =
    parsed.v ??
    (parsed.yParity == null ? undefined : BigInt(parsed.yParity + 27));
  if (v == null) {
    throw onInvalid({ expected: "a signature containing v or yParity" });
  }

  return { v: Number(v), r: parsed.r, s: parsed.s };
};
