import type { MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type AuthorizationRequirementSignature,
  type BlueReallocation,
  type BlueSupplyCollateralBorrowAction,
  type DepositAmountArgs,
  type Metadata,
  NegativeInputError,
  NonPositiveInputError,
  type PermitRequirementSignature,
  type Transaction,
} from "../../types/index.js";
import { getBlueAuthorizationAction } from "../signatures/getBlueAuthorizationAction.js";
import { buildAssetFundingActions } from "./buildAssetFundingActions.js";
import { buildReallocationActions } from "./buildReallocationActions.js";

/** Parameters for {@link blueSupplyCollateralBorrow}. */
export interface BlueSupplyCollateralBorrowParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: DepositAmountArgs & {
    /** Amount of loan asset to borrow after the collateral is supplied. */
    borrowAmount: bigint;
    /** Address whose Morpho collateral and borrow positions are credited. */
    onBehalf: Address;
    /** Address that receives the borrowed assets. */
    receiver: Address;
    /** Minimum borrow share price (in ray). Protects against share price manipulation. */
    minSharePrice: bigint;
    /** Optional pre-signed permit/permit2 approval for the collateral transfer. */
    requirementSignature?: PermitRequirementSignature;
    /** Public Allocator V1 or V2 reallocations to execute before borrowing. */
    reallocations?: Iterable<BlueReallocation>;
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
 * Routed through bundler3: collateral funding → `morphoSupplyCollateral` → optional Public
 * Allocator calls → `morphoBorrow`. V1 entries encode `reallocateTo`; V2 market and idle entries
 * encode `reallocate` and `allocateFromIdle`. When `nativeAmount > 0`, native ETH is wrapped via
 * `GeneralAdapter1.wrapNative()` before the supply leg. V1 fees add to
 * `tx.value`; V2 penalties are paid in the target loan token and donated to the vaults. When the
 * collateral and loan tokens match, one combined pull funds both collateral and penalties through
 * `GeneralAdapter1`.
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
 *   collateral funding. When collateral and loan tokens match, its amount includes V2 penalties.
 * @param params.args.nativeAmount - Optional amount of native token to wrap into wNative for the
 *   collateral supply. Requires the collateral token to be the chain's wNative.
 * @param params.args.reallocations - Optional Public Allocator V1 or V2 reallocations to execute
 *   between the supply and borrow legs.
 * @param params.args.authorizationSignature - Optional signed Morpho authorization; when present,
 *   a `setAuthorizationWithSig` call is prepended to the bundle.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<BlueSupplyCollateralBorrowAction>` with `to`, `value`,
 *   `data`, and the typed `action` discriminator the simulation layer consumes.
 * @throws {NegativeInputError} when `amount`, `nativeAmount`, `minSharePrice`, a V1 fee, or a V2
 *   penalty is negative.
 * @throws {NonPositiveInputError} when `borrowAmount <= 0n`, both collateral amounts resolve to
 *   zero, or any reallocation withdrawal amount is non-positive.
 * @throws {InputExceedsMaxError} when a V2 reallocation asset amount exceeds `uint128` or its penalty exceeds WAD.
 * @throws {InconsistentReallocationPenaltyError} when V2 entries for one vault use different penalties.
 * @throws {InvalidReallocationAddressError} when a V2 vault or adapter address is malformed.
 * @throws {InvalidReallocationSourceTypeError} when a V2 source is absent, incomplete, or has an unknown discriminator.
 * @throws {InvalidReallocationShapeError} when an entry matches both or neither V1/V2 shape.
 * @throws {ChainWNativeMissingError} when `nativeAmount > 0n` but the chain has no configured wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the collateral
 *   token is not the chain's wNative.
 * @throws {DepositAssetMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed asset differs from `marketParams.collateralToken`.
 * @throws {DepositAmountMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed amount differs from the total ERC-20 funding amount.
 * @throws {Permit2ExpirationMissingError} from `getTokenRequirementActions` when a Permit2 requirement
 *   signature is missing its expiration.
 * @throws {EmptyReallocationWithdrawalsError} from `buildReallocationActions` when any
 *   `reallocation.withdrawals` is empty.
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
    throw new NegativeInputError("amount", amount);
  }

  if (nativeAmount !== undefined && nativeAmount < 0n) {
    throw new NegativeInputError("nativeAmount", nativeAmount);
  }

  if (borrowAmount <= 0n) {
    throw new NonPositiveInputError("borrowAmount", borrowAmount);
  }

  if (minSharePrice < 0n) {
    throw new NegativeInputError("minSharePrice", minSharePrice);
  }

  const totalCollateral = amount + (nativeAmount ?? 0n);

  if (totalCollateral === 0n) {
    throw new NonPositiveInputError("totalCollateral", totalCollateral);
  }

  const usesSharedFundingToken = isAddressEqual(
    marketParams.collateralToken,
    marketParams.loanToken,
  );
  const reallocationResult = buildReallocationActions({
    chainId,
    reallocations,
    targetMarketParams: marketParams,
    penaltyFundingSource: usesSharedFundingToken
      ? "generalAdapter1"
      : "initiator",
  });
  const erc20FundingAmount =
    amount + (usesSharedFundingToken ? reallocationResult.penaltyAssets : 0n);

  const actions: Action[] = [];

  if (authorizationSignature) {
    actions.push(getBlueAuthorizationAction(chainId, authorizationSignature));
  }

  actions.push(
    ...buildAssetFundingActions({
      chainId,
      asset: marketParams.collateralToken,
      erc20Amount: erc20FundingAmount,
      nativeAmount: nativeAmount ?? 0n,
      requirementSignature,
    }),
  );

  actions.push({
    type: "morphoSupplyCollateral",
    args: [marketParams, totalCollateral, onBehalf, [], false],
  });
  actions.push(...reallocationResult.actions);

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
        reallocationFee: reallocationResult.fee,
        reallocationPenaltyAssets: reallocationResult.penaltyAssets,
      },
    },
  });
};
