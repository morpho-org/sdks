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
  type VaultV2DepositAction,
  ZeroDepositAmountError,
} from "../../types/index.js";
import { getRequirementsAction } from "../requirements/getRequirementsAction.js";

export interface VaultV2DepositParams {
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
 * Prepares a deposit transaction for the VaultV2 contract.
 *
 * Routed through the bundler to atomically execute the asset transfer and vault deposit.
 * The general adapter enforces `maxSharePrice` on-chain to prevent inflation attacks.
 * Never bypass the general adapter.
 *
 * When `nativeAmount` is provided, that amount of native ETH is sent as `msg.value`
 * to the Bundler3 multicall and wrapped into WETH via `GeneralAdapter1.wrapNative()`.
 * The vault's underlying asset must be the chain's wrapped native token (wNative).
 *
 * @param {Object} params - The deposit parameters.
 * @param {Object} params.vault - The vault identifiers.
 * @param {number} params.vault.chainId - The chain ID.
 * @param {Address} params.vault.address - The vault address.
 * @param {Address} params.vault.asset - The underlying ERC20 asset address.
 * @param {Object} params.args - The deposit arguments.
 * @param {bigint} [params.args.amount=0n] - Amount of ERC-20 assets to deposit. At least one of amount or nativeAmount must be provided.
 * @param {bigint} params.args.maxSharePrice - Maximum acceptable share price (slippage protection).
 * @param {Address} params.args.recipient - Receives the vault shares.
 * @param {RequirementSignature} [params.args.requirementSignature] - Pre-signed permit/permit2 approval.
 * @param {bigint} [params.args.nativeAmount] - Amount of native token to wrap into wNative for the deposit.
 * @param {Metadata} [params.metadata] - Optional analytics metadata.
 * @returns {Readonly<Transaction<VaultV2DepositAction>>} The prepared deposit transaction.
 */
export const vaultV2Deposit = ({
  vault: { chainId, address: vaultAddress, asset },
  args: {
    amount = 0n,
    maxSharePrice,
    recipient,
    requirementSignature,
    nativeAmount,
  },
  metadata,
}: VaultV2DepositParams): Readonly<Transaction<VaultV2DepositAction>> => {
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
      type: "vaultV2Deposit",
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
