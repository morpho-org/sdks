import { getChainAddresses } from "@morpho-org/blue-sdk";
import { type Action, BundlerAction } from "@morpho-org/bundler-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Metadata,
  NegativeMinSharePriceError,
  NonPositiveMaxSharePriceError,
  NonPositiveSharesAmountError,
  type RequirementSignature,
  type Transaction,
  type VaultV1MigrateToV2Action,
} from "../../types/index.js";
import { getRequirementsAction } from "../requirements/getRequirementsAction.js";

/** Parameters for {@link vaultV1MigrateToV2}. */
export interface VaultV1MigrateToV2Params {
  vault: {
    chainId: number;
    address: Address;
  };
  args: {
    targetVault: Address;
    /** Number of V1 shares to migrate. */
    shares: bigint;
    /** Minimum acceptable share price for V1 redeem (slippage protection, in RAY). */
    minSharePriceVaultV1: bigint;
    /** Maximum acceptable share price for V2 deposit (inflation protection, in RAY). */
    maxSharePriceVaultV2: bigint;
    /** Receives the V2 vault shares. */
    recipient: Address;
    /** Pre-signed permit/permit2 approval for V1 share transfer. */
    requirementSignature?: RequirementSignature;
  };
  metadata?: Metadata;
}

/**
 * Prepares an atomic full-migration transaction from VaultV1 to VaultV2.
 *
 * Routed through bundler3: transfers V1 shares to GeneralAdapter1 (via
 * `erc20TransferFrom` or permit/permit2), redeems them via `erc4626Redeem`
 * (GA1 redeems its own shares — no allowance check), then deposits the
 * resulting assets into V2 via `erc4626Deposit`. All operations execute
 * atomically in a single transaction.
 *
 * **Prerequisite:** The user must either approve GeneralAdapter1 to spend
 * their V1 vault shares (classic approve) or provide a pre-signed
 * permit/permit2 via `requirementSignature`. Use `getRequirements()` on the
 * entity to resolve the appropriate approval.
 *
 * @param params - The migration parameters.
 * @param params.vault.chainId - The chain ID (used to resolve bundler addresses).
 * @param params.vault.address - The VaultV1 (MetaMorpho) address.
 * @param params.args.targetVault - The VaultV2 address to deposit into.
 * @param params.args.shares - Number of V1 shares to migrate.
 * @param params.args.minSharePriceVaultV1 - Minimum V1 share price in RAY (slippage protection for redeem).
 * @param params.args.maxSharePriceVaultV2 - Maximum V2 share price in RAY (inflation protection for deposit).
 * @param params.args.recipient - Receives the V2 vault shares.
 * @param params.args.requirementSignature - Pre-signed permit/permit2 for V1 share transfer.
 * @param params.metadata - Optional analytics metadata.
 * @returns Deep-frozen transaction.
 */
export const vaultV1MigrateToV2 = ({
  vault: { chainId, address: sourceVault },
  args: {
    targetVault,
    shares,
    minSharePriceVaultV1,
    maxSharePriceVaultV2,
    recipient,
    requirementSignature,
  },
  metadata,
}: VaultV1MigrateToV2Params): Readonly<
  Transaction<VaultV1MigrateToV2Action>
> => {
  if (shares <= 0n) {
    throw new NonPositiveSharesAmountError(sourceVault);
  }

  if (minSharePriceVaultV1 < 0n) {
    throw new NegativeMinSharePriceError(sourceVault);
  }

  if (maxSharePriceVaultV2 <= 0n) {
    throw new NonPositiveMaxSharePriceError(targetVault);
  }

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [];

  // Transfer V1 shares from user to GA1.
  // With a signature: permit/permit2 + transferFrom for the signed amount.
  // Without: plain erc20TransferFrom for the specified shares amount.
  if (requirementSignature) {
    actions.push(
      ...getRequirementsAction({
        chainId,
        asset: sourceVault,
        amount: shares,
        requirementSignature,
      }),
    );
  } else {
    actions.push({
      type: "erc20TransferFrom",
      args: [sourceVault, shares, generalAdapter1, false /* skipRevert */],
    });
  }

  // GA1 redeems its own shares (owner = GA1, no allowance check).
  actions.push({
    type: "erc4626Redeem",
    args: [
      sourceVault,
      maxUint256,
      minSharePriceVaultV1,
      generalAdapter1,
      generalAdapter1,
      false /* skipRevert */,
    ],
  });

  // Deposit all resulting assets into V2.
  actions.push({
    type: "erc4626Deposit",
    args: [
      targetVault,
      maxUint256,
      maxSharePriceVaultV2,
      recipient,
      false /* skipRevert */,
    ],
  });

  let tx = BundlerAction.encodeBundle(chainId, actions);

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "vaultV1MigrateToV2",
      args: {
        sourceVault,
        targetVault,
        shares,
        minSharePriceVaultV1,
        maxSharePriceVaultV2,
        recipient,
      },
    },
  });
};
