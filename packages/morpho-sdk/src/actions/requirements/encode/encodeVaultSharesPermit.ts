import { type Address, Eip5267Domain, Token } from "@morpho-org/blue-sdk";
import { getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type WalletClient, zeroHash } from "viem";
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
  /** Registered fixed vault bundles spender. */
  readonly spender: Address;
  /** Account that owns the vault shares. */
  readonly owner: Address;
  /** Target chain. */
  readonly chainId: number;
  /** Current vault permit nonce for the owner. */
  readonly nonce: bigint;
  /** Vault-share allowance to authorize. */
  readonly amount: bigint;
  /** Shared permit and bundle deadline. */
  readonly deadline: bigint;
}

/**
 * Builds the bounded ERC-2612 shares-permit requirement used by an in-kind vault exit.
 *
 * Vault V1 uses the standard token permit domain. Vault V2 uses its protocol-specific domain with
 * only `chainId` and `verifyingContract`.
 *
 * @param params.vault - Vault share token, including V1 permit-domain metadata when available.
 * @param params.version - Vault generation selecting the standard V1 or two-field V2 domain.
 * @param params.spender - Registered VaultBundlesV1 or VaultExitBundlesV1 spender.
 * @param params.owner - Account that owns and authorizes spending of the vault shares.
 * @param params.chainId - Chain on which the vault and spender are deployed.
 * @param params.nonce - Current vault permit nonce for the owner.
 * @param params.amount - Vault-share allowance to authorize.
 * @param params.deadline - Shared permit and bundle deadline.
 * @returns A requirement whose `sign()` result can be embedded in fixed vault-bundles calldata.
 * @throws {UnsupportedChainIdError} when no address registry exists for `chainId`.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not a registered fixed vault-bundles contract.
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
 *   amount: 1_000_000n,
 *   deadline,
 * });
 * const signature = await requirement.sign(walletClient, owner);
 * // signature satisfies PermitRequirementSignature
 * ```
 */
export const encodeVaultSharesPermit = (
  params: EncodeVaultSharesPermitParams,
): Requirement<PermitRequirementSignature> => {
  const {
    vault: inputVault,
    version,
    spender,
    owner,
    chainId,
    nonce,
    amount,
    deadline,
  } = params;
  const inputDomain = inputVault.eip5267Domain;
  const vault = new Token({
    address: inputVault.address,
    name: inputVault.name,
    eip5267Domain:
      version === "vaultV2"
        ? new Eip5267Domain({
            // Only the bitmap-selected fields enter Vault V2's domain separator.
            fields: "0x0c",
            name: "",
            version: "",
            chainId: BigInt(chainId),
            verifyingContract: inputVault.address,
            salt: zeroHash,
            extensions: [],
          })
        : inputDomain == null
          ? undefined
          : new Eip5267Domain({
              fields: inputDomain.fields,
              name: inputDomain.name,
              version: inputDomain.version,
              chainId: inputDomain.chainId,
              verifyingContract: inputDomain.verifyingContract,
              salt: inputDomain.salt,
              extensions: [...inputDomain.extensions],
            }),
  });

  // Bind the permit to one of the registered fixed vault bundles deployments.
  validateRequirementSpender({
    chainId,
    spender,
    allowed: ["vaultExitBundlesV1", "vaultBundlesV1"],
  });

  const action: PermitAction = {
    type: "permit",
    args: {
      spender,
      amount,
      deadline,
      nonce,
    },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      // The bundle spends msg.sender's shares, so another signer cannot authorize this exit.
      validateUserAddress(userAddress, owner);
      const permit = {
        owner,
        spender,
        allowance: amount,
        nonce,
        deadline,
      };
      const typedData = getPermitTypedData(
        {
          ...permit,
          erc20: vault,
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
          owner,
          signature,
          deadline,
          amount,
          asset: vault.address,
          nonce,
        },
        action,
      });
    },
  };
};
