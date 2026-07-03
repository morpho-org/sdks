import { encodeAbiParameters, isAddressEqual, parseSignature } from "viem";
import {
  AmbiguousRequirementSignaturesError,
  type AnyRequirementSignature,
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  DepositOwnerMismatchError,
  DepositSpenderMismatchError,
  MidnightPermit2TransferSignatureRequiredError,
  selectRequirementSignatures,
} from "../../types/index.js";
import { type MidnightTokenPermit, PermitKind } from "../midnight/types.js";

/** Parameters for {@link getMidnightTokenPermit}. */
export interface GetMidnightTokenPermitParams {
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
 * Returns the Midnight bundle `TokenPermit` payload from a collected token signature.
 *
 * @param params - Token permit parameters.
 * @param params.token - Token the bundle will pull.
 * @param params.owner - Owner whose tokens the bundle will pull.
 * @param params.spender - Midnight bundle address spending the signed permit.
 * @param params.amount - Exact amount the bundle will pull.
 * @param params.signatures - Optional collected requirement signatures.
 * @returns Midnight bundle `TokenPermit` calldata payload.
 * @throws {DepositAssetMismatchError} when a token signature targets another asset.
 * @throws {DepositAmountMismatchError} when a token signature targets another amount.
 * @throws {MidnightPermit2TransferSignatureRequiredError} when a Blue Permit2 allowance signature
 *   is passed instead of a Midnight Permit2 transfer signature.
 * @example
 * ```ts
 * import { getMidnightTokenPermit } from "@morpho-org/morpho-sdk";
 *
 * const permit = getMidnightTokenPermit({
 *   token: loanToken,
 *   owner: taker,
 *   spender: midnightBundles,
 *   amount: 1_000_000n,
 *   signatures,
 * });
 * ```
 */
export const getMidnightTokenPermit = (
  params: GetMidnightTokenPermitParams,
): MidnightTokenPermit => {
  const signatures =
    params.signatures == null
      ? []
      : Array.isArray(params.signatures)
        ? params.signatures
        : [params.signatures];
  const { permit, permit2Transfer } = selectRequirementSignatures(signatures, {
    permit: true,
    permit2Transfer: true,
  });

  if (permit?.action.type === "permit2") {
    throw new MidnightPermit2TransferSignatureRequiredError();
  }

  if (permit != null && permit2Transfer != null) {
    throw new AmbiguousRequirementSignaturesError("permit", 2);
  }

  if (permit != null) {
    if (!isAddressEqual(permit.args.asset, params.token)) {
      throw new DepositAssetMismatchError(params.token, permit.args.asset);
    }

    if (permit.args.amount !== params.amount) {
      throw new DepositAmountMismatchError(params.amount, permit.args.amount);
    }
    if (!isAddressEqual(permit.args.owner, params.owner)) {
      throw new DepositOwnerMismatchError(params.owner, permit.args.owner);
    }
    if (!isAddressEqual(permit.action.args.spender, params.spender)) {
      throw new DepositSpenderMismatchError(
        params.spender,
        permit.action.args.spender,
      );
    }

    const parsed = parseSignature(permit.args.signature);
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
        [permit.args.deadline, v, parsed.r, parsed.s],
      ),
    };
  }

  const transfer = permit2Transfer;
  if (transfer == null) return { kind: PermitKind.None, data: "0x" };

  if (!isAddressEqual(transfer.args.asset, params.token)) {
    throw new DepositAssetMismatchError(params.token, transfer.args.asset);
  }

  if (transfer.args.amount !== params.amount) {
    throw new DepositAmountMismatchError(params.amount, transfer.args.amount);
  }
  if (!isAddressEqual(transfer.args.owner, params.owner)) {
    throw new DepositOwnerMismatchError(params.owner, transfer.args.owner);
  }
  if (!isAddressEqual(transfer.action.args.spender, params.spender)) {
    throw new DepositSpenderMismatchError(
      params.spender,
      transfer.action.args.spender,
    );
  }

  return {
    kind: PermitKind.Permit2,
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
      [transfer.args.nonce, transfer.args.deadline, transfer.args.signature],
    ),
  };
};
