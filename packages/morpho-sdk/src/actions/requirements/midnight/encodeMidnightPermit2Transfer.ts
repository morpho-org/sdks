import { getPermit2TransferFromTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import { type Address, verifyTypedData, type WalletClient } from "viem";
import { signTypedData } from "viem/actions";
import { validateUserAddress } from "../../../helpers/index.js";
import {
  InvalidSignatureError,
  type Permit2TransferAction,
  type Permit2TransferArgs,
  type Requirement,
} from "../../../types/index.js";

/** Parameters for {@link encodeMidnightPermit2Transfer}. */
export interface EncodeMidnightPermit2TransferParams {
  readonly token: Address;
  readonly spender: Address;
  readonly amount: bigint;
  readonly chainId: number;
  readonly nonce: bigint;
}

/**
 * Builds a Permit2 SignatureTransfer requirement for a Midnight bundle token pull.
 *
 * @param params - Permit2 SignatureTransfer parameters.
 * @param params.token - ERC20 token the Midnight bundle will pull.
 * @param params.spender - Midnight bundle address that will call Permit2.
 * @param params.amount - Exact token amount the bundle will pull.
 * @param params.chainId - Chain id whose Permit2 deployment verifies the signature.
 * @param params.nonce - One-shot Permit2 unordered nonce.
 * @returns A `permit2Transfer` requirement whose signature can be encoded into Midnight `TokenPermit`.
 * @throws {AddressMismatchError} from `sign()` when the client account differs from `userAddress`.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no account address.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { encodeMidnightPermit2Transfer } from "@morpho-org/morpho-sdk";
 *
 * const requirement = encodeMidnightPermit2Transfer({
 *   token: loanToken,
 *   spender: midnightBundles,
 *   amount: 1_000_000n,
 *   chainId: 1,
 *   nonce: 42n,
 * });
 * ```
 */
export const encodeMidnightPermit2Transfer = (
  params: EncodeMidnightPermit2TransferParams,
): Requirement<Permit2TransferAction, Permit2TransferArgs> => {
  const deadline = Time.timestamp() + Time.s.from.h(2n);
  const action: Permit2TransferAction = {
    type: "permit2Transfer",
    args: {
      spender: params.spender,
      amount: params.amount,
      deadline,
    },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      const account = client.account;
      validateUserAddress(account?.address, userAddress);

      const typedData = getPermit2TransferFromTypedData(
        {
          erc20: params.token,
          allowance: params.amount,
          spender: params.spender,
          nonce: params.nonce,
          deadline,
        },
        params.chainId,
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

      if (!isValid) throw new InvalidSignatureError();

      return deepFreeze({
        args: {
          owner: userAddress,
          nonce: params.nonce,
          asset: params.token,
          signature,
          amount: params.amount,
          deadline,
        },
        action,
      });
    },
  };
};
