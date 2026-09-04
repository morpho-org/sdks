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
  type Permit2TransferFromAction,
  type Permit2TransferFromRequirementSignature,
  type Requirement,
} from "../../../types/index.js";

/** Parameters for {@link encodeErc20Permit2TransferFrom}. */
export interface EncodeErc20Permit2TransferFromParams {
  /** ERC-20 token pulled through Permit2. */
  readonly token: Address;
  /** BlueBundlesV1 deployment receiving permission to pull the token. */
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

/**
 * Builds a Permit2 SignatureTransfer requirement for a direct BlueBundlesV1 token pull.
 *
 * Unlike Permit2 AllowanceTransfer, this signs a one-time `uint256` amount and unordered nonce;
 * it has no managed allowance expiration.
 *
 * @param params - SignatureTransfer parameters.
 * @param params.token - ERC-20 token pulled through Permit2.
 * @param params.spender - Registered BlueBundlesV1 deployment that performs the pull.
 * @param params.amount - Exact `uint256` token amount authorized.
 * @param params.chainId - Target chain id.
 * @param params.nonce - Unused Permit2 unordered nonce.
 * @param params.deadline - Signature expiration timestamp in seconds.
 * @returns A requirement whose `sign(client, userAddress)` returns a deep-frozen signature result.
 * @throws {NegativeInputError} when `amount` or `nonce` is negative.
 * @throws {NonPositiveInputError} when `deadline` is not positive.
 * @throws {InputExceedsMaxError} when `amount`, `nonce`, or `deadline` exceeds `uint256`.
 * @throws {ExpiredDeadlineError} when `deadline` is positive but not in the future.
 * @throws {UnsupportedChainIdError} when `chainId` is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no registered canonical Permit2 deployment.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not BlueBundlesV1 for `chainId`.
 * @throws {MissingClientPropertyError} from `sign()` when the wallet client has no account.
 * @throws {AddressMismatchError} from `sign()` when the wallet account differs from `userAddress`.
 * @throws {ChainIdMismatchError} from `sign()` when the wallet chain differs from `chainId`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { addressesRegistry } from "@morpho-org/blue-sdk";
 * import { encodeErc20Permit2TransferFrom } from "@morpho-org/morpho-sdk";
 * import { getChainAddress } from "@morpho-org/morpho-ts";
 * import { mainnet } from "viem/chains";
 *
 * const requirement = encodeErc20Permit2TransferFrom({
 *   token: addressesRegistry[mainnet.id].usdc,
 *   spender: getChainAddress(mainnet.id, "bundles.blueBundlesV1"),
 *   amount: 1_000_000n,
 *   chainId: mainnet.id,
 *   nonce: 0n,
 *   deadline: BigInt(Math.floor(Date.now() / 1_000) + 3_600),
 * });
 * // requirement satisfies Requirement<Permit2TransferFromRequirementSignature>
 * ```
 */
export const encodeErc20Permit2TransferFrom = (
  params: EncodeErc20Permit2TransferFromParams,
): Requirement<Permit2TransferFromRequirementSignature> => {
  const { token, spender, amount, chainId, nonce, deadline } = params;
  // Bound every uint256 field before signing: getPermit2TransferFromTypedData silently clamps an
  // oversized allowance to maxUint256, which would desync the signed value from the requirement
  // metadata that blueSupply verifies. Direct callers bypass the token-requirement resolver, so
  // this public encoder must reject the same out-of-range inputs itself.
  validateUint256Field("amount", amount);
  validateUint256Field("nonce", nonce);
  if (deadline <= 0n) {
    throw new NonPositiveInputError("deadline", deadline);
  }
  if (deadline > maxUint256) {
    throw new InputExceedsMaxError({
      field: "deadline",
      value: deadline,
      max: maxUint256,
    });
  }
  // Reject an already-expired deadline before signing so a direct caller is never walked through a
  // wallet EIP-712 prompt for a SignatureTransfer that Permit2 would revert with `SignatureExpired`.
  // The sibling encodeErc20Permit and the token-requirement resolver enforce the same guard.
  const timestamp = Time.timestamp();
  if (deadline <= timestamp) {
    throw new ExpiredDeadlineError(deadline, timestamp);
  }
  validateRequirementSpender({
    chainId,
    spender,
    allowed: ["blueBundlesV1"],
  });
  // getPermit2TransferFromTypedData derives its EIP-712 domain's verifyingContract from
  // getChainAddresses(chainId).permit2. A chain that registers BlueBundlesV1 but no canonical Permit2
  // leaves that undefined, and viem drops the undefined field from the domain — the wallet would then
  // sign a domain-less separator that Permit2 can never accept. The resolver gates on permit2 != null;
  // this exported encoder is reachable directly, so it must reject the same unsupported chain itself.
  getChainAddress(chainId, "permit2"); // throws UnknownAddressError when Permit2 is unregistered

  const action: Permit2TransferFromAction = {
    type: "permit2TransferFrom",
    args: { spender, amount, deadline },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      const typedData = getPermit2TransferFromTypedData(
        {
          erc20: token,
          allowance: amount,
          spender,
          nonce,
          deadline,
        },
        chainId,
      );
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
