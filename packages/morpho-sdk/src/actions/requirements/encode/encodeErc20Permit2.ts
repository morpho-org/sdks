import { type Address, getChainAddresses, MathLib } from "@morpho-org/blue-sdk";
import { getPermit2PermitTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import { verifyTypedData, type WalletClient } from "viem";
import { signTypedData } from "viem/actions";
import { validateUserAddress } from "../../../helpers/validate.js";
import {
  InvalidSignatureError,
  type Permit2Action,
  type PermitRequirementSignature,
  type Requirement,
} from "../../../types/index.js";

/** Parameters for {@link encodeErc20Permit2}. */
interface EncodeErc20Permit2Params {
  token: Address;
  amount: bigint;
  chainId: number;
  nonce: bigint;
  expiration: bigint;
}

/**
 * Builds a Permit2 `Requirement` that, once signed, lets `GeneralAdapter1` pull `amount` of
 * `token` via the Permit2 contract.
 *
 * The Permit2 spender is hardcoded to `GeneralAdapter1` for the resolved chain — never another
 * address — otherwise the resulting signature could be reused independently of the Morpho
 * bundle. Deadline defaults to two hours from `Time.timestamp()`.
 *
 * @param params - Permit2 encoding parameters.
 * @param params.token - ERC-20 token address.
 * @param params.amount - Permit2 allowance amount (per-call).
 * @param params.chainId - Target chain id (resolves `GeneralAdapter1`).
 * @param params.nonce - The user's current Permit2 nonce for `(token, GeneralAdapter1)`.
 * @param params.expiration - Permit2-managed allowance expiration timestamp.
 * @returns A `Requirement` whose `sign(client, userAddress)` produces the deep-frozen signature.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no `account.address`.
 * @throws {AddressMismatchError} from `sign()` when the client account differs from `userAddress`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { encodeErc20Permit2 } from "@morpho-org/morpho-sdk";
 *
 * const requirement = encodeErc20Permit2({
 *   token: USDC,
 *   amount: 1_000_000n,
 *   chainId: 1,
 *   nonce: 0n,
 *   expiration: 281_474_976_710_655n, // MAX_UINT_48 (2^48 - 1, effectively indefinite)
 * });
 * // requirement satisfies Requirement
 * ```
 */
export const encodeErc20Permit2 = (
  params: EncodeErc20Permit2Params,
): Requirement<PermitRequirementSignature> => {
  const {
    token,
    amount,
    chainId,
    nonce,
    expiration = MathLib.MAX_UINT_48,
  } = params;

  const now = Time.timestamp();
  const deadline = now + Time.s.from.h(2n);

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const action: Permit2Action = {
    type: "permit2",
    args: {
      spender: generalAdapter1,
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
          // Never permit any other address than the GeneralAdapter1 otherwise
          // the signature can be used independently.
          spender: generalAdapter1,
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
