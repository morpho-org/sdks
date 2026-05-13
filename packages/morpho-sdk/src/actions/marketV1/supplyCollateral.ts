import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import {
  addTransactionMetadata,
  validateNativeCollateral,
} from "../../helpers/index.js";
import {
  type DepositAmountArgs,
  type MarketV1SupplyCollateralAction,
  type Metadata,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  type RequirementSignature,
  type Transaction,
  ZeroCollateralAmountError,
} from "../../types/index.js";
import { getRequirementsAction } from "../requirements/getRequirementsAction.js";

/** Parameters for {@link marketV1SupplyCollateral}. */
export interface MarketV1SupplyCollateralParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: DepositAmountArgs & {
    onBehalf: Address;
    requirementSignature?: RequirementSignature;
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
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval. When
 *   absent, the bundle uses a plain `erc20TransferFrom` and assumes the user has already
 *   approved `GeneralAdapter1`.
 * @param params.args.nativeAmount - Optional amount of native token to wrap into wNative for the
 *   supply. Requires the collateral token to be the chain's wNative.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<MarketV1SupplyCollateralAction>` with `to`, `value`, `data`,
 *   and the typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveAssetAmountError} when `amount < 0n`.
 * @throws {NegativeNativeAmountError} when `nativeAmount < 0n`.
 * @throws {ZeroCollateralAmountError} when both `amount` and `nativeAmount` resolve to zero.
 * @throws {ChainWNativeMissingError} when `nativeAmount > 0n` but the chain has no configured wNative.
 * @throws {NativeAmountOnNonWNativeCollateralError} when `nativeAmount > 0n` but the collateral
 *   token is not the chain's wNative.
 * @throws {DepositAssetMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed asset differs from `marketParams.collateralToken`.
 * @throws {DepositAmountMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed amount differs from `args.amount`.
 * @example
 * ```ts
 * import { marketV1SupplyCollateral } from "@morpho-org/morpho-sdk";
 *
 * const tx = marketV1SupplyCollateral({
 *   market: { chainId: 1, marketParams },
 *   args: { amount: 1_000_000_000_000_000_000n, onBehalf },
 * });
 * // tx satisfies Readonly<Transaction<MarketV1SupplyCollateralAction>>
 * ```
 */
export const marketV1SupplyCollateral = ({
  market: { chainId, marketParams },
  args: { amount = 0n, onBehalf, requirementSignature, nativeAmount },
  metadata,
}: MarketV1SupplyCollateralParams): Readonly<
  Transaction<MarketV1SupplyCollateralAction>
> => {
  if (amount < 0n) {
    throw new NonPositiveAssetAmountError(marketParams.collateralToken);
  }

  if (nativeAmount !== undefined && nativeAmount < 0n) {
    throw new NegativeNativeAmountError(nativeAmount);
  }

  const totalCollateral = amount + (nativeAmount ?? 0n);

  if (totalCollateral === 0n) {
    throw new ZeroCollateralAmountError(marketParams.id);
  }

  const {
    bundler3: { generalAdapter1, bundler3 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [];

  if (nativeAmount !== undefined && nativeAmount > 0n) {
    validateNativeCollateral(chainId, marketParams.collateralToken);

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

  if (amount > 0n) {
    if (requirementSignature) {
      actions.push(
        ...getRequirementsAction({
          asset: marketParams.collateralToken,
          amount,
          recipient: generalAdapter1,
          requirementSignature,
        }),
      );
    } else {
      actions.push({
        type: "erc20TransferFrom",
        args: [marketParams.collateralToken, amount, generalAdapter1, false],
      });
    }
  }

  actions.push({
    type: "morphoSupplyCollateral",
    args: [marketParams, totalCollateral, onBehalf, [], false],
  });

  let tx = {
    ...BundlerAction.encodeBundle(chainId, actions),
    value: nativeAmount ?? 0n,
  };

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "marketV1SupplyCollateral",
      args: {
        market: marketParams.id,
        amount: totalCollateral,
        onBehalf,
        nativeAmount,
      },
    },
  });
};
