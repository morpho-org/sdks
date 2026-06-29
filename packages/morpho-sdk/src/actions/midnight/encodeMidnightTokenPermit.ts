import { encodeAbiParameters, isAddressEqual, parseSignature } from "viem";
import {
  type AnyRequirementSignature,
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  DepositOwnerMismatchError,
  DepositSpenderMismatchError,
  MidnightPermit2TransferSignatureRequiredError,
} from "../../types/index.js";
import { type MidnightTokenPermit, PermitKind } from "./types.js";

/** Parameters for {@link encodeMidnightTokenPermit}. */
export interface EncodeMidnightTokenPermitParams {
  readonly token: `0x${string}`;
  readonly owner: `0x${string}`;
  readonly spender: `0x${string}`;
  readonly amount: bigint;
  readonly signatures?:
    | AnyRequirementSignature
    | readonly AnyRequirementSignature[]
    | undefined;
}

/**
 * Encodes a collected ERC2612 or Permit2 signature as a Midnight bundle `TokenPermit`.
 *
 * @param params - Token permit encoding parameters.
 * @param params.token - Token the bundle will pull.
 * @param params.owner - Owner whose tokens the bundle will pull.
 * @param params.spender - Midnight bundle address spending the signed permit.
 * @param params.amount - Exact amount the bundle will pull.
 * @param params.signatures - Optional collected requirement signatures.
 * @returns Midnight bundle `TokenPermit` calldata payload.
 * @throws {DepositAssetMismatchError} when a token signature targets another asset.
 * @throws {DepositAmountMismatchError} when a token signature targets another amount.
 * @throws {DepositOwnerMismatchError} when a token signature targets another owner.
 * @throws {DepositSpenderMismatchError} when a token signature targets another spender.
 * @throws {MidnightPermit2TransferSignatureRequiredError} when a Blue Permit2 allowance signature
 *   is passed instead of a Midnight Permit2 transfer signature.
 * @example
 * ```ts
 * import { encodeMidnightTokenPermit } from "@morpho-org/morpho-sdk";
 *
 * const permit = encodeMidnightTokenPermit({
 *   token: loanToken,
 *   owner: taker,
 *   spender: midnightBundles,
 *   amount: 1_000_000n,
 *   signatures,
 * });
 * ```
 */
export const encodeMidnightTokenPermit = (
  params: EncodeMidnightTokenPermitParams,
): MidnightTokenPermit => {
  const signatures =
    params.signatures == null
      ? []
      : Array.isArray(params.signatures)
        ? params.signatures
        : [params.signatures];
  const tokenSignatures = signatures.filter(
    (candidate) =>
      candidate.action.type === "permit" ||
      candidate.action.type === "permit2Transfer",
  );
  const signature =
    tokenSignatures.find((candidate) =>
      isAddressEqual(candidate.args.asset, params.token),
    ) ?? tokenSignatures[0];

  const unsupportedPermit2 = signatures.find(
    (candidate) => candidate.action.type === "permit2",
  );
  if (signature == null && unsupportedPermit2 != null) {
    throw new MidnightPermit2TransferSignatureRequiredError();
  }

  if (signature == null) return { kind: PermitKind.None, data: "0x" };

  if (!isAddressEqual(signature.args.owner, params.owner)) {
    throw new DepositOwnerMismatchError(params.owner, signature.args.owner);
  }

  if (!isAddressEqual(signature.action.args.spender, params.spender)) {
    throw new DepositSpenderMismatchError(
      params.spender,
      signature.action.args.spender,
    );
  }

  if (!isAddressEqual(signature.args.asset, params.token)) {
    throw new DepositAssetMismatchError(params.token, signature.args.asset);
  }

  if (signature.args.amount !== params.amount) {
    throw new DepositAmountMismatchError(params.amount, signature.args.amount);
  }

  if (signature.action.type === "permit") {
    const parsed = parseSignature(signature.args.signature);
    const v = "v" in parsed ? Number(parsed.v) : parsed.yParity + 27;

    return {
      kind: PermitKind.ERC2612,
      data: encodeAbiParameters(
        [
          { type: "uint256" },
          { type: "uint8" },
          { type: "bytes32" },
          { type: "bytes32" },
        ],
        [signature.args.deadline, v, parsed.r, parsed.s],
      ),
    };
  }

  return {
    kind: PermitKind.Permit2,
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
      [signature.args.nonce, signature.args.deadline, signature.args.signature],
    ),
  };
};
