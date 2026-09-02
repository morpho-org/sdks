import { getChainAddresses } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import type { Action } from "../../bundler/index.js";
import { validateNativeAsset } from "../../helpers/index.js";
import type { PermitRequirementSignature } from "../../types/index.js";
import { getTokenRequirementActions } from "../signatures/getTokenRequirementActions.js";

/** Parameters for {@link buildAssetFundingActions}. */
export interface BuildAssetFundingActionsParams {
  /** Chain the operation runs on — resolves adapter addresses and validates wNative. */
  readonly chainId: number;
  /** Asset wrapped and/or pulled into `GeneralAdapter1` (loan token, collateral token, …). */
  readonly asset: Address;
  /** ERC-20 amount of `asset` to pull from the payer (`0n` on a fully-native funding). */
  readonly erc20Amount: bigint;
  /** Native ETH to wrap into wNative before the pull (`0n` when not wrapping). */
  readonly nativeAmount: bigint;
  /** Optional pre-signed permit/permit2 approval for the ERC-20 pull. */
  readonly requirementSignature?: PermitRequirementSignature;
}

/**
 * Builds the shared asset-funding actions — native wrapping followed by the ERC-20 pull — that move
 * `asset` into `GeneralAdapter1` before a bundled Morpho operation (`blueSupply`,
 * `blueSupplyCollateral`, `blueSupplyCollateralBorrow`, `blueRepay`, `blueRepayWithdrawCollateral`).
 *
 * Encode-only and synchronous: returns a fresh `Action[]` (never mutates its inputs, mirroring
 * `buildVaultV2BlueReallocationActions`) and reads no on-chain state. When `nativeAmount > 0n`, validates
 * `asset` is the chain's wNative and emits `nativeTransfer → wrapNative`. When `erc20Amount > 0n`,
 * pulls the ERC-20 via a signed permit/permit2 (`requirementSignature`) or a plain
 * `erc20TransferFrom` — `getTokenRequirementActions` emits the latter itself when no signature is
 * supplied. A fully-native funding emits no ERC-20 action; funding nothing returns `[]`.
 *
 * Single source of truth for the native-wrap + ERC-20-pull composition every bundled Blue funding
 * path depends on — a fix here applies to all of them instead of risking a silent divergence
 * between copies.
 *
 * @param params - See {@link BuildAssetFundingActionsParams}.
 * @returns The `nativeTransfer`/`wrapNative`/pull actions, in bundle order (empty when nothing is
 *   funded).
 * @throws {ChainWNativeMissingError} when `nativeAmount > 0n` but the chain has no configured wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but `asset` is not the
 *   chain's wNative.
 * @throws {DepositAssetMismatchError} from `getTokenRequirementActions` when `requirementSignature` is
 *   provided and the signed asset differs from `asset`.
 * @throws {DepositAmountMismatchError} from `getTokenRequirementActions` when `requirementSignature` is
 *   provided and the signed amount differs from `erc20Amount`.
 * @throws {Permit2ExpirationMissingError} from `getTokenRequirementActions` when a Permit2 requirement
 *   signature is missing its expiration.
 * @internal
 */
export const buildAssetFundingActions = ({
  chainId,
  asset,
  erc20Amount,
  nativeAmount,
  requirementSignature,
}: BuildAssetFundingActionsParams): Action[] => {
  const {
    bundler3: { generalAdapter1, bundler3 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [];

  // Wrap native into wNative before pulling the ERC-20 remainder.
  if (nativeAmount > 0n) {
    validateNativeAsset(chainId, asset);

    actions.push(
      {
        type: "nativeTransfer",
        args: [bundler3, generalAdapter1, nativeAmount, false],
      },
      {
        type: "wrapNative",
        args: [nativeAmount, generalAdapter1, false],
      },
    );
  }

  // Pull the ERC-20 portion (0 on a fully native funding). getTokenRequirementActions emits a plain
  // erc20TransferFrom itself when no permit/permit2 signature is supplied.
  if (erc20Amount > 0n) {
    actions.push(
      ...getTokenRequirementActions({
        asset,
        amount: erc20Amount,
        recipient: generalAdapter1,
        requirementSignature,
      }),
    );
  }

  return actions;
};
