import type { Address } from "@morpho-org/blue-sdk";
import { getPermit2TransferFromTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { maxUint256, type WalletClient } from "viem";
import { signAndVerifyTypedData } from "../../../helpers/signAndVerifyTypedData.js";
import { validateUint256Field } from "../../../helpers/validate.js";
import { validateRequirementSpender } from "../../../helpers/validateRequirementSpender.js";
import {
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NonPositiveInputError,
  type Permit2SignatureTransferRequirementSignature,
  type ReferenceTimestampParams,
  type Requirement,
} from "../../../types/index.js";

/**
 * Parameters for {@link encodeErc20Permit2SignatureTransfer}.
 * @deprecated The SDK no longer requests Permit2 funding; use ERC-2612 permits or ERC-20 approvals.
 */
export interface EncodeErc20Permit2SignatureTransferParams
  extends ReferenceTimestampParams {
  /** ERC-20 token pulled through Permit2. */
  readonly token: Address;
  /** Registered fixed bundles deployment receiving permission to pull the token. */
  readonly spender: Address;
  /** Exact token amount authorized by the one-time transfer. */
  readonly amount: bigint;
  /** Target chain id. */
  readonly chainId: number;
  /** Unused Permit2 unordered nonce. */
  readonly nonce: bigint;
  /** Signature expiration timestamp in seconds. */
  readonly deadline: bigint;
}

declare const erc20Permit2SignatureTransferInput: unique symbol;
/** Complete checked legacy SignatureTransfer invocation. @internal */
export type Erc20Permit2SignatureTransferInput =
  Readonly<EncodeErc20Permit2SignatureTransferParams> & {
    readonly [erc20Permit2SignatureTransferInput]: true;
  };

/** Shared pure bounds check; the public boundary calls this before observing its legacy clock. */
const validateTransferQuantities = (
  params: EncodeErc20Permit2SignatureTransferParams,
): void => {
  validateUint256Field("amount", params.amount);
  validateUint256Field("nonce", params.nonce);
  if (params.deadline <= 0n) {
    throw new NonPositiveInputError("deadline", params.deadline);
  }
  if (params.deadline > maxUint256) {
    throw new InputExceedsMaxError({
      field: "deadline",
      value: params.deadline,
      max: maxUint256,
    });
  }
};

/** Checks the complete legacy invocation without reading a clock. @internal */
export const parseErc20Permit2SignatureTransfer = (
  params: EncodeErc20Permit2SignatureTransferParams,
): Erc20Permit2SignatureTransferInput => {
  const input = {
    token: params.token,
    spender: params.spender,
    amount: params.amount,
    chainId: params.chainId,
    nonce: params.nonce,
    deadline: params.deadline,
    now: params.now,
  };
  validateTransferQuantities(input);
  // An explicit reference time preserves expiry-before-spender precedence without I/O.
  if (input.now != null && input.deadline <= input.now) {
    throw new ExpiredDeadlineError(input.deadline, input.now);
  }
  validateRequirementSpender({
    chainId: input.chainId,
    spender: input.spender,
    allowed: ["vaultBundlesV1", "blueBundlesV1"],
  });
  getChainAddress(input.chainId, "permit2"); // Reject missing canonical deployment before constructing typed data.
  return { ...input } as Erc20Permit2SignatureTransferInput;
};

/**
 * Builds a Permit2 SignatureTransfer requirement for a direct fixed-bundles token pull.
 *
 * Unlike Permit2 AllowanceTransfer, this signs a one-time `uint256` amount and unordered nonce;
 * it has no managed allowance expiration. The requirement's `action.typedData` holds the EIP-712
 * payload so it can be inspected or displayed before signing.
 *
 * @param params - SignatureTransfer parameters.
 * @param params.token - ERC-20 token pulled through Permit2.
 * @param params.spender - Registered BlueBundlesV1 or VaultBundlesV1 deployment that performs the pull.
 * @param params.amount - Exact `uint256` token amount authorized.
 * @param params.chainId - Target chain id.
 * @param params.nonce - Unused Permit2 unordered nonce.
 * @param params.deadline - Signature expiration timestamp in seconds.
 * @param params.now - See {@link ReferenceTimestampParams.now}.
 * @returns A requirement whose `action.typedData` is the EIP-712 payload and whose
 *   `sign(client, userAddress)` returns a deep-frozen signature result.
 * @throws {NegativeInputError} when `amount` or `nonce` is negative.
 * @throws {NonPositiveInputError} when `deadline` is not positive.
 * @throws {InputExceedsMaxError} when `amount`, `nonce`, or `deadline` exceeds `uint256`.
 * @throws {ExpiredDeadlineError} when `deadline` is positive but not in the future.
 * @throws {UnsupportedChainIdError} when `chainId` is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no registered canonical Permit2 deployment.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not a registered fixed bundles deployment for `chainId`.
 * @throws {MissingClientPropertyError} from `sign()` when the wallet client has no account.
 * @throws {AddressMismatchError} from `sign()` when the wallet account differs from `userAddress`.
 * @throws {ChainIdMismatchError} from `sign()` when the wallet chain differs from `chainId`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @throws {MalformedSignatureError} from `sign()` when the wallet returns a malformed signature.
 * @example
 * ```ts
 * import { addressesRegistry } from "@morpho-org/blue-sdk";
 * import { encodeErc20Permit2SignatureTransfer } from "@morpho-org/morpho-sdk";
 * import { getChainAddress } from "@morpho-org/morpho-ts";
 * import { mainnet } from "viem/chains";
 *
 * const requirement = encodeErc20Permit2SignatureTransfer({
 *   token: addressesRegistry[mainnet.id].usdc,
 *   spender: getChainAddress(mainnet.id, "bundles.vaultBundlesV1"),
 *   amount: 1_000_000n,
 *   chainId: mainnet.id,
 *   nonce: 0n,
 *   now: (await client.getBlock()).timestamp,
 *   deadline: (await client.getBlock()).timestamp + 3_600n,
 * });
 * // requirement satisfies Requirement<Permit2SignatureTransferRequirementSignature>
 * ```
 * @deprecated The SDK no longer requests Permit2 funding; use ERC-2612 permits or ERC-20 approvals.
 */
export const encodeErc20Permit2SignatureTransfer = (
  params: EncodeErc20Permit2SignatureTransferParams,
): Requirement<Permit2SignatureTransferRequirementSignature> => {
  const input = {
    token: params.token,
    spender: params.spender,
    amount: params.amount,
    chainId: params.chainId,
    nonce: params.nonce,
    deadline: params.deadline,
    now: params.now,
  };
  // Keep invalid quantities ahead of the deprecated clock observation and expiry ahead of spender errors.
  validateTransferQuantities(input);
  const now = input.now ?? Time.timestamp();
  return encodeParsedErc20Permit2SignatureTransfer(
    parseErc20Permit2SignatureTransfer({ ...input, now }),
  );
};

/** Encodes the complete checked legacy SignatureTransfer. @internal */
export const encodeParsedErc20Permit2SignatureTransfer = (
  params: Erc20Permit2SignatureTransferInput,
): Requirement<Permit2SignatureTransferRequirementSignature> => {
  const { token, spender, amount, chainId, nonce, deadline } = params;

  // Nested callers retain this dynamic freshness check after their ordered approval preparation.
  const timestamp = params.now ?? Time.timestamp();
  if (deadline <= timestamp) {
    throw new ExpiredDeadlineError(deadline, timestamp);
  }

  // Permit2 SignatureTransfer signs over `PermitTransferFrom` (permitted, spender, nonce,
  // deadline), which does not include the owner, so the payload is fully determined at build time.
  const typedData = deepFreeze(
    getPermit2TransferFromTypedData(
      {
        erc20: token,
        allowance: amount,
        spender,
        nonce,
        deadline,
      },
      chainId,
    ),
  );

  const action: Requirement<Permit2SignatureTransferRequirementSignature>["action"] =
    {
      type: "permit2SignatureTransfer",
      args: { spender, amount, nonce, deadline },
      typedData,
    };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      const signature = await signAndVerifyTypedData({
        client,
        userAddress,
        typedData,
      });

      return deepFreeze({
        args: {
          owner: userAddress,
          asset: token,
          amount,
          nonce,
          deadline,
          signature,
        },
        action,
      });
    },
  };
};
