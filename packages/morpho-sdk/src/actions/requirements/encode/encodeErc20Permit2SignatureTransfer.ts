import type { Address } from "@morpho-org/blue-sdk";
import { getPermit2TransferFromTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { WalletClient } from "viem";
import { signAndVerifyTypedData } from "../../../helpers/signAndVerifyTypedData.js";
import { validateRequirementSpender } from "../../../helpers/validateRequirementSpender.js";
import type {
  Permit2SignatureTransferAction,
  Permit2SignatureTransferRequirementSignature,
  Requirement,
} from "../../../types/index.js";

/** Parameters for {@link encodeErc20Permit2SignatureTransfer}. */
export interface EncodeErc20Permit2SignatureTransferParams {
  /** ERC-20 token pulled through Permit2. */
  token: Address;
  /** Registered fixed bundles deployment receiving permission to pull the token. */
  spender: Address;
  /** Exact token amount authorized by the one-time transfer. */
  amount: bigint;
  /** Target chain id. */
  chainId: number;
  /** Unused Permit2 unordered nonce. */
  nonce: bigint;
  /** Signature expiration timestamp in seconds. */
  deadline: bigint;
}

/**
 * Builds a Permit2 SignatureTransfer requirement for a direct fixed-bundles token pull.
 *
 * Unlike Permit2 AllowanceTransfer, this signs a one-time `uint256` amount and unordered nonce;
 * it has no managed allowance expiration.
 *
 * @param params - SignatureTransfer parameters.
 * @param params.token - ERC-20 token pulled through Permit2.
 * @param params.spender - Registered BlueBundlesV1 or VaultBundlesV1 deployment that performs the pull.
 * @param params.amount - Exact `uint256` token amount authorized.
 * @param params.chainId - Target chain id.
 * @param params.nonce - Unused Permit2 unordered nonce.
 * @param params.deadline - Signature expiration timestamp in seconds.
 * @returns A requirement whose `sign(client, userAddress)` returns a deep-frozen signature result.
 * @throws {UnsupportedChainIdError} when `chainId` is absent from the address registry.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not a registered fixed bundles deployment for `chainId`.
 * @throws {MissingClientPropertyError} from `sign()` when the wallet client has no account.
 * @throws {AddressMismatchError} from `sign()` when the wallet account differs from `userAddress`.
 * @throws {ChainIdMismatchError} from `sign()` when the wallet chain differs from `chainId`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
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
 *   deadline: BigInt(Math.floor(Date.now() / 1_000) + 3_600),
 * });
 * // requirement satisfies Requirement<Permit2SignatureTransferRequirementSignature>
 * ```
 */
export const encodeErc20Permit2SignatureTransfer = (
  params: EncodeErc20Permit2SignatureTransferParams,
): Requirement<Permit2SignatureTransferRequirementSignature> => {
  const { token, spender, amount, chainId, nonce, deadline } = params;
  validateRequirementSpender({
    chainId,
    spender,
    allowed: ["vaultBundlesV1", "blueBundlesV1"],
  });

  const action: Permit2SignatureTransferAction = {
    type: "permit2SignatureTransfer",
    args: { spender, amount, nonce, deadline },
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
