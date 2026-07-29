import type { MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type BlueSupplyCollateralAction,
  type DepositAmountArgs,
  type Metadata,
  NegativeInputError,
  NonPositiveInputError,
  type PermitRequirementSignature,
  type Transaction,
} from "../../types/index.js";
import { buildAssetFundingActions } from "./buildAssetFundingActions.js";

/** Parameters for {@link blueSupplyCollateral}. */
export interface BlueSupplyCollateralParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: DepositAmountArgs & {
    /** Address whose Morpho collateral position is credited. */
    onBehalf: Address;
    /** Optional pre-signed permit/permit2 approval for the collateral transfer. */
    requirementSignature?: PermitRequirementSignature;
  };
  metadata?: Metadata;
}

/**
 * Prepares a supply-collateral transaction for a Morpho Blue market.
 *
 * Routed through bundler3 via `GeneralAdapter1`. When `nativeAmount > 0`, native ETH is wrapped
 * via `GeneralAdapter1.wrapNative()` before the collateral supply; the collateral token must be
 * the chain's wNative for that path.
 *
 * Zero loss: all collateral reaches Morpho. No dust left in bundler or adapter.
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.amount - Amount of ERC-20 collateral to supply. At least one of `amount` or
 *   `nativeAmount` must be positive. Defaults to `0n`.
 * @param params.args.onBehalf - Address whose Morpho position is credited with the collateral.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval.
 * @param params.args.nativeAmount - Optional amount of native token to wrap into wNative for the
 *   supply. Requires the collateral token to be the chain's wNative.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<BlueSupplyCollateralAction>` with `to`, `value`, `data`,
 *   and the typed `action` discriminator the simulation layer consumes.
 * @throws {NegativeInputError} when `amount < 0n` or `nativeAmount < 0n`.
 * @throws {NonPositiveInputError} when both `amount` and `nativeAmount` resolve to zero.
 * @throws {ChainWNativeMissingError} when `nativeAmount > 0n` but the chain has no configured wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the collateral
 *   token is not the chain's wNative.
 * @throws {DepositAssetMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed asset differs from `marketParams.collateralToken`.
 * @throws {DepositAmountMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed amount differs from `args.amount`.
 * @throws {Permit2ExpirationMissingError} from `getTokenRequirementActions` when a Permit2 requirement
 *   signature is missing its expiration.
 * @example
 * ```ts
 * import { blueSupplyCollateral } from "@morpho-org/morpho-sdk";
 *
 * const tx = blueSupplyCollateral({
 *   market: { chainId: 1, marketParams },
 *   args: { amount: 1_000_000_000_000_000_000n, onBehalf },
 * });
 * // tx satisfies Readonly<Transaction<BlueSupplyCollateralAction>>
 * ```
 */
export const blueSupplyCollateral = ({
  market: { chainId, marketParams },
  args: { amount = 0n, onBehalf, requirementSignature, nativeAmount },
  metadata,
}: BlueSupplyCollateralParams): Readonly<
  Transaction<BlueSupplyCollateralAction>
> => {
  if (amount < 0n) {
    throw new NegativeInputError("amount", amount);
  }

  if (nativeAmount !== undefined && nativeAmount < 0n) {
    throw new NegativeInputError("nativeAmount", nativeAmount);
  }

  const totalCollateral = amount + (nativeAmount ?? 0n);

  if (totalCollateral === 0n) {
    throw new NonPositiveInputError("totalCollateral", totalCollateral);
  }

  const actions: Action[] = buildAssetFundingActions({
    chainId,
    asset: marketParams.collateralToken,
    erc20Amount: amount,
    nativeAmount: nativeAmount ?? 0n,
    requirementSignature,
  });

  actions.push({
    type: "morphoSupplyCollateral",
    args: [marketParams, totalCollateral, onBehalf, [], false],
  });

  let tx = BundlerAction.encodeBundle(chainId, actions);

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "blueSupplyCollateral",
      args: {
        market: marketParams.id,
        amount: totalCollateral,
        onBehalf,
        nativeAmount,
      },
    },
  });
};
