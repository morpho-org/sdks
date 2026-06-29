import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import {
  addTransactionMetadata,
  validateNativeAsset,
} from "../../helpers/index.js";
import {
  type AuthorizationRequirementSignature,
  type BlueSupplyCollateralBorrowAction,
  type DepositAmountArgs,
  type Metadata,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  NonPositiveBorrowAmountError,
  NonPositiveMinBorrowSharePriceError,
  type PermitRequirementSignature,
  type Transaction,
  type VaultReallocation,
  ZeroCollateralAmountError,
} from "../../types/index.js";
import { getAuthorizationAction } from "../requirements/getAuthorizationAction.js";
import { getRequirementsAction } from "../requirements/getRequirementsAction.js";
import { buildReallocationActions } from "./buildReallocationActions.js";

/** Parameters for {@link blueSupplyCollateralBorrow}. */
export interface BlueSupplyCollateralBorrowParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: DepositAmountArgs & {
    borrowAmount: bigint;
    onBehalf: Address;
    receiver: Address;
    /** Minimum borrow share price (in ray). Protects against share price manipulation. */
    minSharePrice: bigint;
    /** Optional pre-signed permit/permit2 approval for the collateral transfer. */
    requirementSignature?: PermitRequirementSignature;
    /** Vault reallocations to execute before borrowing (computed by entity). */
    reallocations?: readonly VaultReallocation[];
    /**
     * Optional signed Morpho authorization. When provided, a `setAuthorizationWithSig` call is
     * prepended to the bundle so GeneralAdapter1 is authorized in-bundle instead of via a
     * standalone `setAuthorization` transaction.
     */
    authorizationSignature?: AuthorizationRequirementSignature;
  };
  metadata?: Metadata;
}

/**
 * Prepares an atomic supply-collateral-and-borrow transaction for a Morpho Blue market.
 *
 * Routed through bundler3: collateral transfer → `morphoSupplyCollateral` → optional
 * `reallocateTo` calls → `morphoBorrow`. When `nativeAmount > 0`, native ETH is wrapped via
 * `GeneralAdapter1.wrapNative()` before the supply leg.
 *
 * Prerequisite: `GeneralAdapter1` must be authorized on Morpho to borrow on behalf of the user.
 * Use `getRequirements()` on the entity to check and obtain the authorization transaction.
 *
 * Zero loss: all collateral reaches Morpho, all borrowed tokens reach the receiver. No dust left
 * in bundler or adapter.
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.amount - Amount of ERC-20 collateral to supply. At least one of `amount` or
 *   `nativeAmount` must be positive. Defaults to `0n`.
 * @param params.args.borrowAmount - Loan asset amount to borrow.
 * @param params.args.onBehalf - Address whose Morpho position is credited with the collateral.
 * @param params.args.receiver - Address that receives the borrowed assets.
 * @param params.args.minSharePrice - Minimum borrow share price (in ray). Slippage protection.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval for the
 *   collateral transfer.
 * @param params.args.nativeAmount - Optional amount of native token to wrap into wNative for the
 *   collateral supply. Requires the collateral token to be the chain's wNative.
 * @param params.args.reallocations - Optional vault reallocations to execute between the supply
 *   and borrow legs, computed by the entity layer.
 * @param params.args.authorizationSignature - Optional signed Morpho authorization; when present,
 *   a `setAuthorizationWithSig` call is prepended to the bundle.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<BlueSupplyCollateralBorrowAction>` with `to`, `value`,
 *   `data`, and the typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveAssetAmountError} when `amount < 0n`.
 * @throws {NegativeNativeAmountError} when `nativeAmount < 0n`.
 * @throws {NonPositiveBorrowAmountError} when `borrowAmount <= 0n`.
 * @throws {NonPositiveMinBorrowSharePriceError} when `minSharePrice < 0n`.
 * @throws {ZeroCollateralAmountError} when both `amount` and `nativeAmount` resolve to zero.
 * @throws {ChainWNativeMissingError} when `nativeAmount > 0n` but the chain has no configured wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the collateral
 *   token is not the chain's wNative.
 * @throws {DepositAssetMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed asset differs from `marketParams.collateralToken`.
 * @throws {DepositAmountMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed amount differs from `args.amount`.
 * @throws {Permit2ExpirationMissingError} from `getRequirementsAction` when a Permit2 requirement
 *   signature is missing its expiration.
 * @throws {NegativeReallocationFeeError} from `buildReallocationActions` when
 *   `reallocations` is non-empty and any `reallocation.fee < 0n`.
 * @throws {EmptyReallocationWithdrawalsError} from `buildReallocationActions` when any
 *   `reallocation.withdrawals` is empty.
 * @throws {NonPositiveReallocationAmountError} from `buildReallocationActions` when any
 *   `reallocation.withdrawals[i].amount <= 0n`.
 * @throws {ReallocationWithdrawalOnTargetMarketError} from `buildReallocationActions` when any
 *   reallocation withdrawal references the target market.
 * @throws {UnsortedReallocationWithdrawalsError} from `buildReallocationActions` when
 *   reallocation withdrawals are not strictly sorted by market id.
 * @example
 * ```ts
 * import { blueSupplyCollateralBorrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = blueSupplyCollateralBorrow({
 *   market: { chainId: 1, marketParams },
 *   args: {
 *     amount: 1_000_000_000_000_000_000n,
 *     borrowAmount: 500_000_000n,
 *     onBehalf: borrower,
 *     receiver: borrower,
 *     minSharePrice: 0n, // disables slippage protection — production code should compute via `computeMinBorrowSharePrice` from market state + slippage tolerance
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueSupplyCollateralBorrowAction>>
 * ```
 */
export const blueSupplyCollateralBorrow = ({
  market: { chainId, marketParams },
  args: {
    amount = 0n,
    borrowAmount,
    onBehalf,
    receiver,
    minSharePrice,
    requirementSignature,
    nativeAmount,
    reallocations,
    authorizationSignature,
  },
  metadata,
}: BlueSupplyCollateralBorrowParams): Readonly<
  Transaction<BlueSupplyCollateralBorrowAction>
> => {
  if (amount < 0n) {
    throw new NonPositiveAssetAmountError(marketParams.collateralToken);
  }

  if (nativeAmount !== undefined && nativeAmount < 0n) {
    throw new NegativeNativeAmountError(nativeAmount);
  }

  if (borrowAmount <= 0n) {
    throw new NonPositiveBorrowAmountError(marketParams.id);
  }

  if (minSharePrice < 0n) {
    throw new NonPositiveMinBorrowSharePriceError(marketParams.id);
  }

  const totalCollateral = amount + (nativeAmount ?? 0n);

  if (totalCollateral === 0n) {
    throw new ZeroCollateralAmountError(marketParams.id);
  }

  const {
    bundler3: { generalAdapter1, bundler3 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [];

  if (authorizationSignature) {
    actions.push(getAuthorizationAction(authorizationSignature));
  }

  if (nativeAmount !== undefined && nativeAmount > 0n) {
    validateNativeAsset(chainId, marketParams.collateralToken);

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

  let reallocationFee = 0n;

  if (reallocations && reallocations.length > 0) {
    const result = buildReallocationActions(reallocations, marketParams);
    actions.push(...result.actions);
    reallocationFee = result.fee;
  }

  actions.push({
    type: "morphoBorrow",
    args: [marketParams, borrowAmount, 0n, minSharePrice, receiver, false],
  });

  let tx = BundlerAction.encodeBundle(chainId, actions);

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "blueSupplyCollateralBorrow",
      args: {
        market: marketParams.id,
        collateralAmount: totalCollateral,
        borrowAmount,
        minSharePrice,
        onBehalf,
        receiver,
        nativeAmount,
        reallocationFee,
      },
    },
  });
};
