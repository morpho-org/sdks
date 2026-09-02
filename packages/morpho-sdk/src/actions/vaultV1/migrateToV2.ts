import { getChainAddresses } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, maxUint256 } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Metadata,
  NegativeInputError,
  NonPositiveInputError,
  type PermitRequirementSignature,
  type Transaction,
  VaultAssetMismatchError,
  type VaultV1MigrateToV2Action,
} from "../../types/index.js";
import { getTokenRequirementActions } from "../signatures/getTokenRequirementActions.js";

/** Parameters for {@link vaultV1MigrateToV2}. */
export interface VaultV1MigrateToV2Params {
  readonly vault: {
    readonly chainId: number;
    readonly address: Address;
    /** Underlying asset of the source V1 vault. */
    readonly asset: Address;
  };
  readonly args: {
    readonly targetVault: Address;
    /** Underlying asset of the target V2 vault. */
    readonly targetAsset: Address;
    /** Number of V1 shares to migrate. */
    readonly shares: bigint;
    /** Maximum acceptable share price for V2 deposit (inflation protection, in RAY). */
    readonly maxSharePriceVaultV2: bigint;
    /** Pre-signed permit/permit2 approval for V1 share transfer. */
    readonly requirementSignature?: PermitRequirementSignature;
  } & (
    | {
        /** Account that receives V2 shares and submits the successor bundles route. */
        readonly userAddress: Address;
        readonly minSharePriceVaultV1?: never;
        readonly recipient?: never;
      }
    | {
        /**
         * @deprecated Omit this field and use `userAddress`; the V1 bound is removed in
         * morpho-sdk v6 because VaultBundlesV1 cannot enforce it.
         */
        readonly minSharePriceVaultV1: bigint;
        /** @deprecated Use `userAddress`; `recipient` is removed in morpho-sdk v6. */
        readonly recipient: Address;
        readonly userAddress?: never;
      }
  );
  readonly metadata?: Metadata;
}

/**
 * Prepares an atomic full-migration transaction from VaultV1 to VaultV2.
 *
 * Routed through bundler3: transfers V1 shares to `GeneralAdapter1` (via `erc20TransferFrom` or
 * permit/permit2), redeems them via `erc4626Redeem` (GA1 redeems its own shares — no allowance
 * check), then deposits the resulting assets into V2 via `erc4626Deposit`. All operations
 * execute atomically in a single transaction.
 *
 * Prerequisite: the user must either approve `GeneralAdapter1` to spend their V1 vault shares
 * (classic approve) or provide a pre-signed permit/permit2 via `requirementSignature`. Use
 * `getRequirements()` on the entity to resolve the appropriate approval.
 *
 * @param params.vault.chainId - The chain the source vault lives on (used to resolve bundler
 *   addresses).
 * @param params.vault.address - The source VaultV1 (MetaMorpho) address.
 * @param params.vault.asset - The underlying asset of the source V1 vault.
 * @param params.args.targetVault - The target VaultV2 address.
 * @param params.args.targetAsset - The underlying asset of the target V2 vault. Must equal
 *   `vault.asset`.
 * @param params.args.shares - Number of V1 shares to migrate.
 * @param params.args.maxSharePriceVaultV2 - Maximum V2 share price in RAY (inflation protection
 *   for the deposit leg).
 * @param params.args.userAddress - Account that receives the V2 vault shares. This
 *   bundles-compatible successor replaces `recipient` before morpho-sdk v6.
 * @param params.args.minSharePriceVaultV1 - Deprecated V1 redeem share-price floor. The successor
 *   omits it because VaultBundlesV1 cannot enforce it.
 * @param params.args.recipient - Deprecated address that receives the V2 vault shares.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 for the V1 share
 *   transfer.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<VaultV1MigrateToV2Action>` with `to`, `value`, `data`, and
 *   the typed `action` discriminator the simulation layer consumes.
 * @throws {VaultAssetMismatchError} when `targetAsset` differs from `vault.asset`.
 * @throws {NonPositiveInputError} when `shares <= 0n` or `maxSharePriceVaultV2 <= 0n`.
 * @throws {NegativeInputError} when `minSharePriceVaultV1 < 0n`.
 * @throws {DepositAssetMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed asset differs from `vault.address` (the V1 share token).
 * @throws {DepositAmountMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed amount differs from `args.shares`.
 * @throws {Permit2ExpirationMissingError} from `getTokenRequirementActions` when a Permit2 requirement
 *   signature is missing its expiration.
 * @example
 * ```ts
 * import { vaultV1MigrateToV2 } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV1MigrateToV2({
 *   vault: { chainId: 1, address: sourceVault, asset: USDC },
 *   args: {
 *     targetVault,
 *     targetAsset: USDC,
 *     shares: 1_000_000n,
 *     maxSharePriceVaultV2: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
 *     userAddress,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<VaultV1MigrateToV2Action>>
 * ```
 */
export const vaultV1MigrateToV2 = ({
  vault: { chainId, address: sourceVault, asset: sourceAsset },
  args,
  metadata,
}: VaultV1MigrateToV2Params): Readonly<
  Transaction<VaultV1MigrateToV2Action>
> => {
  const {
    targetVault,
    targetAsset,
    shares,
    maxSharePriceVaultV2,
    requirementSignature,
  } = args;
  const minSharePriceVaultV1 = args.minSharePriceVaultV1 ?? 0n;
  const recipient = args.userAddress ?? args.recipient;
  // Both bundle legs use maxUint256: an asset mismatch leaves the redeemed
  // source asset stranded on GA1 while the user receives only dust shares.
  if (!isAddressEqual(sourceAsset, targetAsset)) {
    throw new VaultAssetMismatchError(sourceAsset, targetAsset);
  }

  if (shares <= 0n) {
    throw new NonPositiveInputError("shares", shares);
  }

  if (minSharePriceVaultV1 < 0n) {
    throw new NegativeInputError("minSharePriceVaultV1", minSharePriceVaultV1);
  }

  if (maxSharePriceVaultV2 <= 0n) {
    throw new NonPositiveInputError(
      "maxSharePriceVaultV2",
      maxSharePriceVaultV2,
    );
  }

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [];

  // Transfer V1 shares from user to GA1.
  // With a signature: permit/permit2 + transferFrom for the signed amount.
  // Without a signature: use ERC-20 transferFrom for the specified shares amount.
  actions.push(
    ...getTokenRequirementActions({
      asset: sourceVault,
      amount: shares,
      recipient: generalAdapter1,
      requirementSignature,
    }),
  );

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
