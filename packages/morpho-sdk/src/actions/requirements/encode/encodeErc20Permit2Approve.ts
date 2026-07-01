import { type Address, MathLib } from "@morpho-org/blue-sdk";
import { getPermit2PermitTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import { verifyTypedData, type WalletClient } from "viem";
import { signTypedData } from "viem/actions";
import { validateUserAddress } from "../../../helpers/validate.js";
import {
  InvalidSignatureError,
  type Permit2Action,
  type Permit2Args,
  type Requirement,
} from "../../../types/index.js";

/** Parameters for {@link encodeErc20Permit2Approve}. */
interface EncodeErc20Permit2ApproveParams {
  token: Address;
  spender: Address;
  amount: bigint;
  chainId: number;
  nonce: bigint;
  expiration?: bigint;
}

/**
 * Builds a Permit2 `Requirement` that, once signed, lets `spender` pull `amount` of `token` via
 * the Permit2 contract.
 *
 * Deadline defaults to two hours from `Time.timestamp()`.
 *
 * @param params - Permit2 encoding parameters.
 * @param params.token - ERC-20 token address.
 * @param params.spender - Address approved as Permit2 spender.
 * @param params.amount - Permit2 allowance amount (per-call).
 * @param params.chainId - Target chain id.
 * @param params.nonce - The user's current Permit2 nonce for `(token, spender)`.
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
 *   spender: GENERAL_ADAPTER_1,
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
): Requirement<Permit2Action, Permit2Args> => {
  const {
    token,
    spender,
    amount,
    chainId,
    nonce,
    expiration = MathLib.MAX_UINT_48,
  } = params;

  const now = Time.timestamp();
  const deadline = now + Time.s.from.h(2n);

  const action: Permit2Action = {
    type: "permit2",
    args: {
      spender,
      amount,
      deadline,
      expiration,
    },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      const account = client.account;
      validateUserAddress(account?.address, userAddress);

      const typedData = getPermit2PermitTypedData(
        {
          spender,
          allowance: amount,
          erc20: token,
          nonce: Number(nonce),
          deadline,
          expiration: Number(expiration),
        },
        chainId,
      );
      const signature = await signTypedData(client, {
        ...typedData,
        account,
      });

      const isValid = await verifyTypedData({
        ...typedData,
        address: userAddress,
        signature,
      });

      if (!isValid) {
        throw new InvalidSignatureError();
      }

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
