import { getChainAddresses } from "@morpho-org/blue-sdk";
import { type Action, BundlerAction } from "@morpho-org/bundler-sdk-viem";
import { deepFreeze, isDefined } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  ChainWNativeMissingError,
  type DepositAmountArgs,
  type Metadata,
  NativeAmountOnNonWNativeVaultError,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  NonPositiveMaxSharePriceError,
  type RequirementSignature,
  type Transaction,
  type VaultV1DepositAction,
  ZeroDepositAmountError,
} from "../../types/index.js";
import { getRequirementsAction } from "../requirements/getRequirementsAction.js";

/** Parameters for {@link vaultV1Deposit}. */
export interface VaultV1DepositParams {
  vault: {
    chainId: number;
    address: Address;
    asset: Address;
  };
  args: DepositAmountArgs & {
    maxSharePrice: bigint;
    recipient: Address;
    requirementSignature?: RequirementSignature;
  };
  metadata?: Metadata;
}

/**
 * Prepares a deposit transaction for a VaultV1 (MetaMorpho) contract.
 *
 * Routed through bundler3 to atomically execute the asset transfer and vault deposit. The
 * `GeneralAdapter1` enforces `maxSharePrice` on-chain to prevent inflation attacks. Never bypass
 * the general adapter.
 *
 * When `nativeAmount > 0`, that amount of native ETH is sent as `msg.value` to the bundler3
 * multicall and wrapped into wNative via `GeneralAdapter1.wrapNative()`. The vault's underlying
 * asset must be the chain's wrapped native token.
 *
 * @param params.vault.chainId - The chain the vault lives on.
 * @param params.vault.address - The VaultV1 (MetaMorpho) address.
 * @param params.vault.asset - The vault's underlying ERC-20 asset.
 * @param params.args.amount - Amount of ERC-20 assets to deposit. At least one of `amount` or
 *   `nativeAmount` must be positive. Defaults to `0n`.
 * @param params.args.maxSharePrice - Maximum acceptable share price (slippage protection,
 *   enforced on-chain by `GeneralAdapter1`).
 * @param params.args.recipient - Address that receives the minted vault shares.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval. When
 *   absent, the bundle uses a plain `erc20TransferFrom` and assumes the user has already
 *   approved `GeneralAdapter1`.
 * @param params.args.nativeAmount - Optional amount of native token to wrap into wNative for the
 *   deposit. Requires the vault asset to be the chain's wNative.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<VaultV1DepositAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveAssetAmountError} when `amount < 0n`.
 * @throws {NonPositiveMaxSharePriceError} when `maxSharePrice <= 0n`.
 * @throws {NegativeNativeAmountError} when `nativeAmount < 0n`.
 * @throws {ChainWNativeMissingError} when `nativeAmount` is provided but the chain has no
 *   configured wNative.
 * @throws {NativeAmountOnNonWNativeVaultError} when `nativeAmount` is provided but the vault
 *   asset is not the chain's wNative.
 * @throws {ZeroDepositAmountError} when both `amount` and `nativeAmount` resolve to zero.
 * @throws {DepositAssetMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed asset differs from `vault.asset`.
 * @throws {DepositAmountMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed amount differs from `args.amount`.
 * @example
 * ```ts
 * import { vaultV1Deposit } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV1Deposit({
 *   vault: { chainId: 1, address: vaultAddress, asset: USDC },
 *   args: {
 *     amount: 1_000_000n,
 *     maxSharePrice: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
 *     recipient: depositor,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<VaultV1DepositAction>>
 * ```
 */
export const vaultV1Deposit = ({
  vault: { chainId, address: vaultAddress, asset },
  args: {
    amount = 0n,
    maxSharePrice,
    recipient,
    requirementSignature,
    nativeAmount,
  },
  metadata,
}: VaultV1DepositParams): Readonly<Transaction<VaultV1DepositAction>> => {
  if (amount < 0n) {
    throw new NonPositiveAssetAmountError(asset);
  }

  if (maxSharePrice <= 0n) {
    throw new NonPositiveMaxSharePriceError(vaultAddress);
  }

  const actions: Action[] = [];

  const {
    bundler3: { generalAdapter1, bundler3 },
    wNative,
  } = getChainAddresses(chainId);

  if (nativeAmount) {
    if (nativeAmount < 0n) {
      throw new NegativeNativeAmountError(nativeAmount);
    }

    if (!isDefined(wNative)) {
      throw new ChainWNativeMissingError(chainId);
    }
    if (!isAddressEqual(asset, wNative)) {
      throw new NativeAmountOnNonWNativeVaultError(asset, wNative);
    }

    actions.push(
      // Transfers native token from Bundler3 to GeneralAdapter1 for wrapping.
      {
        type: "nativeTransfer",
        args: [bundler3, generalAdapter1, nativeAmount, false /* skipRevert */],
      },
      {
        type: "wrapNative",
        args: [nativeAmount, generalAdapter1, false /* skipRevert */],
      },
    );
  }

  if (amount > 0n) {
    if (requirementSignature) {
      actions.push(
        ...getRequirementsAction({
          chainId,
          asset,
          amount,
          requirementSignature,
        }),
      );
    } else {
      actions.push({
        type: "erc20TransferFrom",
        args: [asset, amount, generalAdapter1, false /* skipRevert */],
      });
    }
  }

  const totalAssets = amount + (nativeAmount ?? 0n);

  if (totalAssets === 0n) {
    throw new ZeroDepositAmountError(vaultAddress);
  }

  actions.push({
    type: "erc4626Deposit",
    args: [
      vaultAddress,
      totalAssets,
      maxSharePrice,
      recipient,
      false /* skipRevert */,
    ],
  });

  let tx = BundlerAction.encodeBundle(chainId, actions);

  if (nativeAmount) {
    tx = { ...tx, value: nativeAmount };
  }

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "vaultV1Deposit",
      args: {
        vault: vaultAddress,
        amount,
        maxSharePrice,
        recipient,
        nativeAmount,
      },
    },
  });
};
