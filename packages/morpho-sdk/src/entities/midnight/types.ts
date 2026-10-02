import type { InputMarketParams as BlueMarketParams } from "@morpho-org/blue-sdk";
import type {
  AccrualPosition,
  Market,
  MarketInput,
  MidnightFetchParams,
  PriceRatifierV1TreeCreateRequest,
  RateRatifierV1TreeCreateRequest,
  Tree,
  TreeMempoolValidateParams,
} from "@morpho-org/midnight-sdk";
import type { Address, Hex } from "viem";
import type { MidnightTakeableOffer } from "../../actions/midnight/types.js";
import type {
  ActionOutput,
  BaseAction,
  MidnightCancelAndMakeAction,
  MidnightCollateralTransfer,
  MidnightGroupCancellation,
} from "../../types/action.js";

/** Optional Midnight API validation controls for make-offer flows. */
export type OfferValidationParams = Omit<
  TreeMempoolValidateParams,
  "chainId" | "ratification"
>;

/**
 * Offers accepted by Midnight maker flows: a PriceRatifierV1 or RateRatifierV1 tree, or
 * the `Tree.create` request that builds one.
 */
export type MidnightMakerTreeInput =
  | PriceRatifierV1TreeCreateRequest
  | RateRatifierV1TreeCreateRequest
  | Tree<"priceV1">
  | Tree<"rateV1">;

/** Parameters for building and validating Midnight offer data. */
export interface GetOffersDataParams {
  readonly accountAddress: Address;
  readonly offers: MidnightMakerTreeInput;
  readonly validation?: OfferValidationParams;
}

/** Prepared Midnight maker-offer data with the payload derived from its tree. */
export interface OffersData {
  readonly accountAddress: Address;
  readonly groups: readonly Hex[];
  readonly tree: Tree<"priceV1"> | Tree<"rateV1">;
  readonly ratifierType: "priceV1" | "rateV1";
  readonly ratifier: Address;
  /** Encoded offer payload for `tree.root`. */
  readonly payload: Hex;
}

/** Parameters shared by Midnight cancel-and-make maker flows. */
export interface CancelAndMakeParams {
  /** Maker expected on every offer. Must send the transaction: V2 acts on `msg.sender`. */
  readonly accountAddress: Address;
  readonly offers: MidnightMakerTreeInput;
  /** Previous offer groups to cancel atomically. Omit or pass `[]` for a new publication. */
  readonly cancellations?: readonly MidnightGroupCancellation[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly validation?: OfferValidationParams;
}

/** Parameters for the Midnight cancel-and-make-lend maker flow. */
export interface CancelAndMakeLendParams extends CancelAndMakeParams {
  readonly loanToken: Address;
  /** New group loan reserve. For grouped OCA offers, pass the group reserve once instead of summing every leg. */
  readonly loanAssets: bigint;
  /** Existing loan assets reserved across the maker's other open groups, including consumed amounts when available. */
  readonly reservedLoanAssets?: bigint;
}

/** Parameters for the Midnight Blue-funded lend maker flow. */
export interface SupplyBlueMakeLendParams extends CancelAndMakeParams {
  /**
   * Morpho Blue market the parked assets are supplied to; its loan token must match every offer.
   * The contract does not check supply share-price slippage: use only markets protected against
   * supply-share-price inflation. Markets with no supply shares are rejected.
   */
  readonly blueMarket: BlueMarketParams;
  /** Loan assets pulled from the maker and supplied to `blueMarket` for the maker's callback. */
  readonly assetsToPark: bigint;
  /** Salt selecting the maker's `BlueBuyCallback`. Defaults to the zero hash. */
  readonly callbackSalt?: Hex;
}

/** Parameters for the Midnight cancel-and-make-borrow maker flow. */
export interface CancelAndMakeBorrowParams extends CancelAndMakeParams {
  /** Optional collateral supplied before activation; every offer must target `collateral.market`. */
  readonly collateral?: {
    readonly market: MarketInput;
    readonly supplies: readonly MidnightCollateralTransfer[];
  };
}

/**
 * Lazy Midnight entity result with async requirements and sync transaction building.
 *
 * Call `getRequirements()` first to collect approvals, authorizations, or
 * signatures. Once those are handled, pass any requirement signatures to
 * `buildTx`; the transaction builder itself performs no fetching or signing.
 *
 * @example
 * ```ts
 * const output = midnight.takeLend(params);
 * const requirements = await output.getRequirements();
 * for (const requirement of requirements) {
 *   if (!("sign" in requirement)) {
 *     await walletClient.sendTransaction({
 *       to: requirement.to,
 *       data: requirement.data,
 *       value: requirement.value,
 *     });
 *   }
 * }
 * const tx = output.buildTx();
 * ```
 */
export type MidnightActionOutput<
  TAction extends BaseAction,
  TSignatures = undefined,
> = ActionOutput<TAction, TSignatures, undefined>;

/**
 * Output returned by cancel-and-make maker flows after offer-tree preparation.
 *
 * Use `groups` and `root` for review UI, send the approval and authorization
 * requirements from `getRequirements()`, then send `buildTx()` from the maker.
 *
 * @example
 * ```ts
 * const output = await midnight.cancelAndMakeBorrow(params);
 * console.log(output.root, output.groups);
 * for (const requirement of await output.getRequirements()) {
 *   await walletClient.sendTransaction(requirement);
 * }
 * await walletClient.sendTransaction(output.buildTx());
 * ```
 */
export interface CancelAndMakeOutput
  extends MidnightActionOutput<MidnightCancelAndMakeAction> {
  readonly groups: readonly Hex[];
  readonly root: Hex;
  readonly ratifierType: "priceV1" | "rateV1";
}

/** Parameters shared by Midnight market action flows. */
export interface MarketActionParams {
  readonly accountAddress: Address;
  readonly marketData: Market;
}

/** Parameters for the Midnight take-lend taker flow. */
export interface TakeLendParams extends MarketActionParams {
  readonly assets: bigint;
  readonly minUnits: bigint;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
}

/** Parameters for the Midnight take-borrow taker flow. */
export interface TakeBorrowParams extends MarketActionParams {
  readonly loanAssets: bigint;
  readonly maxUnits: bigint;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
}

/** Parameters for the Midnight supply-collateral-and-take-borrow taker flow. */
export interface SupplyCollateralTakeBorrowParams extends TakeBorrowParams {
  readonly collateralAssets: bigint;
  readonly collateralIndex?: bigint;
}

/** Parameters for the Midnight supply-collateral flow. */
export interface SupplyCollateralParams extends MarketActionParams {
  readonly collateralAssets: bigint;
  /** Existing collateral assets reserved across the maker's open groups, including consumed amounts when available. */
  readonly reservedCollateralAssets?: bigint;
  readonly collateralIndex?: bigint;
}

/** Parameters for the Midnight redeem flow. */
export interface RedeemParams {
  readonly accountAddress: Address;
  /** Owner-bound snapshot returned by `getPositionData`; manually constructed ownerless snapshots are rejected. */
  readonly positionData: AccrualPosition;
  readonly receiver?: Address;
  readonly units?: bigint;
}

/** Parameters for the Midnight repay-and-withdraw-collateral flow. */
export interface RepayWithdrawCollateralParams extends MarketActionParams {
  readonly repayAssets: bigint;
  readonly withdrawCollateralAssets: bigint;
  readonly collateralIndex?: bigint;
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
}

/** Parameters for fetching a Midnight user position with market data. */
export interface GetPositionDataParams {
  readonly marketId: Hex;
  readonly accountAddress: Address;
  /** Optional fetch controls. Pass an externally fetched block number to coordinate this snapshot with other reads. */
  readonly parameters?: MidnightFetchParams;
}
