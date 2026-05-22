import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { type Action, BundlerAction } from "@morpho-org/bundler-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import {
  addTransactionMetadata,
  validateNativeAsset,
} from "../../helpers/index.js";
import {
  type DepositAmountArgs,
  type MarketV1SupplyAction,
  type Metadata,
  NegativeNativeAmountError,
  NegativeSupplyAmountError,
  NegativeSupplyMaxSharePriceError,
  type RequirementSignature,
  type Transaction,
  ZeroSupplyAmountError,
} from "../../types/index.js";
import { getRequirementsAction } from "../requirements/getRequirementsAction.js";

/** Parameters for {@link marketV1Supply}. */
export interface MarketV1SupplyParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: DepositAmountArgs & {
    onBehalf: Address;
    /** Maximum supply share price (in ray). Slippage protection against inflation attacks. */
    maxSharePrice: bigint;
    requirementSignature?: RequirementSignature;
  };
  metadata?: Metadata;
}

/**
 * Prepares a loan-asset supply transaction for a Morpho Blue market.
 *
 * Routed through bundler3 via `GeneralAdapter1`. When `nativeAmount > 0`, native ETH is wrapped
 * via `GeneralAdapter1.wrapNative()` before the supply; the loan token must be the chain's
 * wNative for that path. Uses `maxSharePrice` to protect against share-price inflation between
 * transaction construction and execution.
 *
 * Zero loss: all supplied assets reach Morpho. No dust left in bundler or adapter.
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.amount - Amount of ERC-20 loan asset to supply. At least one of `amount` or
 *   `nativeAmount` must be positive. Defaults to `0n`.
 * @param params.args.onBehalf - Address whose Morpho supply position is credited.
 * @param params.args.maxSharePrice - Maximum acceptable supply share price (in ray). Slippage
 *   protection.
 * @param params.args.nativeAmount - Optional amount of native token to wrap into wNative for the
 *   supply. Requires the loan token to be the chain's wNative.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval. When
 *   absent, the bundle uses a plain `erc20TransferFrom` and assumes the user has already
 *   approved `GeneralAdapter1`.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<MarketV1SupplyAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NegativeSupplyAmountError} when `amount < 0n`.
 * @throws {NegativeNativeAmountError} when `nativeAmount < 0n`.
 * @throws {ZeroSupplyAmountError} when both `amount` and `nativeAmount` resolve to zero.
 * @throws {NegativeSupplyMaxSharePriceError} when `maxSharePrice < 0n`.
 * @throws {ChainWNativeMissingError} when `nativeAmount > 0n` but the chain has no configured wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the loan token is not
 *   the chain's wNative.
 * @throws {DepositAssetMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed asset differs from `marketParams.loanToken`.
 * @throws {DepositAmountMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed amount differs from `args.amount`.
 * @example
 * ```ts
 * import { marketV1Supply } from "@morpho-org/morpho-sdk";
 *
 * const tx = marketV1Supply({
 *   market: { chainId: 1, marketParams },
 *   args: {
 *     amount: 1_000_000_000n,
 *     onBehalf: supplier,
 *     maxSharePrice: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
 *   },
 * });
 * // tx satisfies Readonly<Transaction<MarketV1SupplyAction>>
 * ```
 */
export const marketV1Supply = ({
  market: { chainId, marketParams },
  args: {
    amount = 0n,
    onBehalf,
    maxSharePrice,
    requirementSignature,
    nativeAmount,
  },
  metadata,
}: MarketV1SupplyParams): Readonly<Transaction<MarketV1SupplyAction>> => {
  if (amount < 0n) {
    throw new NegativeSupplyAmountError(marketParams.id);
  }

  if (nativeAmount !== undefined && nativeAmount < 0n) {
    throw new NegativeNativeAmountError(nativeAmount);
  }

  if (maxSharePrice < 0n) {
    throw new NegativeSupplyMaxSharePriceError(marketParams.id);
  }

  const totalAssets = amount + (nativeAmount ?? 0n);

  if (totalAssets === 0n) {
    throw new ZeroSupplyAmountError(marketParams.id);
  }

  const {
    bundler3: { generalAdapter1, bundler3 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [];

  if (nativeAmount !== undefined && nativeAmount > 0n) {
    validateNativeAsset(chainId, marketParams.loanToken);

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
          asset: marketParams.loanToken,
          amount,
          recipient: generalAdapter1,
          requirementSignature,
        }),
      );
    } else {
      actions.push({
        type: "erc20TransferFrom",
        args: [marketParams.loanToken, amount, generalAdapter1, false],
      });
    }
  }

  actions.push({
    type: "morphoSupply",
    args: [marketParams, totalAssets, 0n, maxSharePrice, onBehalf, [], false],
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
      type: "marketV1Supply",
      args: {
        market: marketParams.id,
        amount: totalAssets,
        onBehalf,
        maxSharePrice,
        nativeAmount,
      },
    },
  });
};
