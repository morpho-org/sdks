import { type MarketParams, getChainAddresses } from "@morpho-org/blue-sdk";
import { type Action, BundlerAction } from "@morpho-org/bundler-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
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
 * Routed through bundler via GeneralAdapter1.
 * When `nativeAmount` is provided, native token is wrapped via GeneralAdapter1.
 * Collateral token must be the chain's wNative when `nativeAmount` is used.
 *
 * Zero loss: all collateral reaches Morpho. No dust left in bundler or adapter.
 *
 * @param params - Supply collateral parameters.
 * @returns Deep-frozen transaction.
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
          chainId,
          asset: marketParams.collateralToken,
          amount,
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
