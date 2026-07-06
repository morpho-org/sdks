import { getPermit2TransferFromTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import type { Address, WalletClient } from "viem";
import type {
  Permit2TransferAction,
  Permit2TransferArgs,
  Requirement,
} from "../../../types/index.js";
import { signAndVerifyTypedData } from "../signAndVerifyTypedData.js";
import { validateRequirementSpender } from "./validateRequirementSpender.js";

/** Parameters for {@link encodeErc20Permit2Transfer}. */
export interface EncodeErc20Permit2TransferParams {
  readonly token: Address;
  readonly spender: Address;
  readonly amount: bigint;
  readonly chainId: number;
  readonly nonce: bigint;
}

/**
 * Builds a Permit2 SignatureTransfer requirement for a supported SDK spender.
 *
 * Today only MidnightBundles consumes this signature shape. The spender remains explicit so the
 * API can support future consumers without changing shape, but unsupported values are rejected
 * before signing.
 *
 * @param params - Permit2 SignatureTransfer parameters.
 * @param params.token - ERC20 token the spender will pull.
 * @param params.spender - Address that will spend the Permit2 SignatureTransfer. Must be
 *   MidnightBundles for the chain.
 * @param params.amount - Exact token amount the spender will pull.
 * @param params.chainId - Chain id whose MidnightBundles and Permit2 deployments verify the signature.
 * @param params.nonce - One-shot Permit2 unordered nonce.
 * @returns A `permit2Transfer` requirement whose signature can be encoded into Midnight `TokenPermit`.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not MidnightBundles for `chainId`.
 * @throws {AddressMismatchError} from `sign()` when the client account differs from `userAddress`.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no account address.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { encodeErc20Permit2Transfer } from "@morpho-org/morpho-sdk";
 *
 * const requirement = encodeErc20Permit2Transfer({
 *   token: loanToken,
 *   spender: midnightBundles,
 *   amount: 1_000_000n,
 *   chainId: 1,
 *   nonce: 42n,
 * });
 * ```
 */
export const encodeErc20Permit2Transfer = (
  params: EncodeErc20Permit2TransferParams,
): Requirement<Permit2TransferAction, Permit2TransferArgs> => {
  validateRequirementSpender({
    chainId: params.chainId,
    spender: params.spender,
    allowed: ["midnightBundles"],
  });

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
      const signature = await signAndVerifyTypedData({
        client,
        userAddress,
        typedData,
      });

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
