import { type Address, getChainAddresses, MathLib } from "@morpho-org/blue-sdk";
import { getPermit2PermitTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import type { WalletClient } from "viem";
import { signAndVerifyTypedData } from "../../../helpers/signAndVerifyTypedData.js";
import type {
  Permit2Action,
  PermitRequirementSignature,
  Requirement,
} from "../../../types/index.js";

/** Parameters for {@link encodeErc20Permit2Approve}. */
interface EncodeErc20Permit2ApproveParams {
  token: Address;
  amount: bigint;
  chainId: number;
  nonce: bigint;
  expiration?: bigint;
}

/**
 * Builds a Permit2 `Requirement` that, once signed, lets GeneralAdapter1 pull `amount` of `token`
 * via the Permit2 contract.
 *
 * Deadline defaults to two hours from `Time.timestamp()`.
 *
 * @param params - Permit2 encoding parameters.
 * @param params.token - ERC-20 token address.
 * @param params.amount - Permit2 allowance amount (per-call).
 * @param params.chainId - Target chain id.
 * @param params.nonce - The user's current Permit2 nonce for `(token, GeneralAdapter1)`.
 * @param params.expiration - Permit2-managed allowance expiration timestamp.
 * @returns A `Requirement` whose `sign(client, userAddress)` produces the deep-frozen signature.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no `account.address`.
 * @throws {AddressMismatchError} from `sign()` when the client account differs from `userAddress`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { encodeErc20Permit2Approve } from "@morpho-org/morpho-sdk";
 *
 * const requirement = encodeErc20Permit2Approve({
 *   token: USDC,
 *   amount: 1_000_000n,
 *   chainId: 1,
 *   nonce: 0n,
 *   expiration: 281_474_976_710_655n, // MAX_UINT_48 (2^48 - 1, effectively indefinite)
 * });
 * // requirement satisfies Requirement
 * ```
 */
export const encodeErc20Permit2Approve = (
  params: EncodeErc20Permit2ApproveParams,
): Requirement<PermitRequirementSignature> => {
  const {
    token,
    amount,
    chainId,
    nonce,
    expiration = MathLib.MAX_UINT_48,
  } = params;
  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const now = Time.timestamp();
  const deadline = now + Time.s.from.h(2n);

  const action: Permit2Action = {
    type: "permit2",
    args: {
      token,
      spender: generalAdapter1,
      amount,
      deadline,
      expiration,
      chainId,
    },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      const typedData = getPermit2PermitTypedData(
        {
          spender: generalAdapter1,
          allowance: amount,
          erc20: token,
          nonce: Number(nonce),
          deadline,
          expiration: Number(expiration),
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
          signature,
          deadline,
          amount,
          asset: token,
          expiration,
          nonce,
        },
        action,
      });
    },
  };
};
