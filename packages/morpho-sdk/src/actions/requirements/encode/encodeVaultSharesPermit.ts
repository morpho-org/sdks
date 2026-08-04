import { type Address, Eip5267Domain, Token } from "@morpho-org/blue-sdk";
import { getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { maxUint256, type WalletClient, zeroHash } from "viem";
import { signAndVerifyTypedData } from "../../../helpers/signAndVerifyTypedData.js";
import { validateUserAddress } from "../../../helpers/validate.js";
import { validateRequirementSpender } from "../../../helpers/validateRequirementSpender.js";
import type {
  PermitAction,
  PermitRequirementSignature,
  Requirement,
} from "../../../types/index.js";

/** Parameters for {@link encodeVaultSharesPermit}. */
export interface EncodeVaultSharesPermitParams {
  /** Vault share token, including V1 permit-domain metadata when available. */
  readonly vault: Token;
  /** Vault generation, which selects the standard V1 or two-field V2 domain. */
  readonly version: "vaultV1" | "vaultV2";
  /** VaultExitBundlesV1 spender. */
  readonly spender: Address;
  /** Account that owns the vault shares. */
  readonly owner: Address;
  /** Target chain. */
  readonly chainId: number;
  /** Current vault permit nonce for the owner. */
  readonly nonce: bigint;
  /** Shared permit and bundle deadline. */
  readonly deadline: bigint;
}

/**
 * Builds the max-value ERC-2612 shares-permit requirement used by an in-kind vault exit.
 *
 * Vault V1 uses the standard token permit domain. Vault V2 uses its protocol-specific domain with
 * only `chainId` and `verifyingContract`. The amount is always `maxUint256` because the exit burns
 * shares across both the main and penalty legs and cannot be sized exactly before execution.
 *
 * @param params - Vault share permit parameters.
 * @returns A requirement whose `sign()` result can be embedded in VaultExitBundlesV1 calldata.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not the registered VaultExitBundlesV1.
 * @throws {MissingClientPropertyError} from `sign()` when the wallet has no account.
 * @throws {AddressMismatchError} from `sign()` when the wallet account differs from `owner`.
 * @throws {ChainIdMismatchError} from `sign()` when the wallet targets another chain.
 * @throws {InvalidSignatureError} from `sign()` when signature recovery fails.
 * @throws {InvalidPermitDomainChainIdError} from `sign()` when a Vault V1 permit domain targets another chain or omits `chainId`.
 * @throws {InvalidPermitDomainVerifyingContractError} from `sign()` when a Vault V1 permit domain targets another token or omits `verifyingContract`.
 * @throws {UnsupportedPermitDomainExtensionsError} from `sign()` when a Vault V1 permit domain advertises unsupported extensions.
 * @example
 * ```ts
 * import { encodeVaultSharesPermit } from "@morpho-org/morpho-sdk";
 *
 * const requirement = encodeVaultSharesPermit({
 *   vault: vaultData,
 *   version: "vaultV2",
 *   spender: vaultExitBundlesV1,
 *   owner,
 *   chainId: 1,
 *   nonce: 0n,
 *   deadline,
 * });
 * const signature = await requirement.sign(walletClient, owner);
 * ```
 */
export const encodeVaultSharesPermit = (
  params: EncodeVaultSharesPermitParams,
): Requirement<PermitRequirementSignature> => {
  // Bind the permit to the standalone vault-exit deployment for this chain.
  validateRequirementSpender({
    chainId: params.chainId,
    spender: params.spender,
    allowed: ["vaultExitBundlesV1"],
  });

  const action: PermitAction = {
    type: "permit",
    args: {
      spender: params.spender,
      amount: maxUint256,
      deadline: params.deadline,
    },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      // The bundle spends msg.sender's shares, so another signer cannot authorize this exit.
      validateUserAddress(userAddress, params.owner);
      const permit = {
        owner: params.owner,
        spender: params.spender,
        allowance: maxUint256,
        nonce: params.nonce,
        deadline: params.deadline,
      };
      const typedData = getPermitTypedData(
        {
          ...permit,
          erc20:
            params.version === "vaultV2"
              ? new Token({
                  ...params.vault,
                  eip5267Domain: new Eip5267Domain({
                    // Only the bitmap-selected fields enter Vault V2's domain separator.
                    fields: "0x0c",
                    name: "",
                    version: "",
                    chainId: BigInt(params.chainId),
                    verifyingContract: params.vault.address,
                    salt: zeroHash,
                    extensions: [],
                  }),
                })
              : params.vault,
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
          owner: params.owner,
          signature,
          deadline: params.deadline,
          amount: maxUint256,
          asset: params.vault.address,
          nonce: params.nonce,
        },
        action,
      });
    },
  };
};
