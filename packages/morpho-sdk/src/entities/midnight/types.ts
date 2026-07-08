import type {
  AccrualPosition,
  Market,
  MarketInput,
  MidnightFetchParams,
  Tree,
  TreeInput,
  TreeMempoolValidateParams,
} from "@morpho-org/midnight-sdk";
import type { Address, Hex } from "viem";
import type {
  MidnightCollateralWithdrawal,
  MidnightTakeableOffer,
} from "../../actions/midnight/types.js";
import type {
  ActionOutput,
  AnyRequirementSignature,
  MempoolSubmitOffersAction,
} from "../../types/action.js";

/** Optional Midnight API validation controls for make-offer flows. */
export type OfferValidationParams = Omit<TreeMempoolValidateParams, "chainId">;

/** Parameters for building and validating Midnight offer data. */
export interface GetOffersDataParams {
  readonly accountAddress: Address;
  readonly offers: TreeInput;
  readonly validation?: OfferValidationParams;
}

/** Prepared Midnight maker-offer data derived from a tree-like offer set. */
export interface OffersData {
  readonly accountAddress: Address;
  readonly groups: readonly Hex[];
  readonly tree: Tree;
  readonly ratifierType: "ecrecover" | "setter";
  readonly ratifier: Address;
  readonly setterPayload?: Hex;
}

/** Parameters shared by Midnight maker-offer flows. */
export interface MakeOffersParams {
  readonly accountAddress: Address;
  readonly offers: TreeInput;
  readonly validation?: OfferValidationParams;
}

/** Parameters for the Midnight make-lend maker flow. */
export interface MakeLendParams extends MakeOffersParams {
  readonly loanToken: Address;
  /** New group loan reserve. For grouped OCA offers, pass the group reserve once instead of summing every leg. */
  readonly loanAssets: bigint;
  /** Existing loan assets reserved across the maker's other open groups, including consumed amounts when available. */
  readonly reservedLoanAssets?: bigint;
}

/** Parameters for the Midnight supply-collateral-and-make-borrow maker flow. */
export interface SupplyCollateralMakeBorrowParams extends MakeOffersParams {
  readonly market: MarketInput;
  /** Collateral supplied before offer submission and the new group collateral reserve counted once for grouped offers. */
  readonly collateralAssets: bigint;
  /** Existing collateral assets reserved across the maker's other open groups, including consumed amounts when available. */
  readonly reservedCollateralAssets?: bigint;
  readonly collateralIndex?: bigint;
}

/** Requirement-resolution options accepted by Midnight action outputs. */
export interface MidnightRequirementsParams {
  /**
   * Prefer the ERC-2612 simple-permit path when the SDK detects support.
   * Leave unset or set to `false` to force the Permit2/classic approval fallback when
   * a token is known to be incompatible despite passing the SDK's shallow `nonces`
   * compatibility probe.
   */
  readonly useSimplePermit?: boolean;
}

/** Signatures accepted by Midnight action-output transaction builders. */
export type MidnightActionSignatures =
  | AnyRequirementSignature
  | readonly AnyRequirementSignature[];

/** Output returned by maker-offer flows. */
export interface MakeOffersOutput
  extends ActionOutput<MempoolSubmitOffersAction, MidnightActionSignatures> {
  readonly groups: readonly Hex[];
  readonly root: Hex;
  readonly ratifierType: "ecrecover" | "setter";
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
  readonly reduceOnly?: boolean;
  readonly collateralWithdrawals?: readonly MidnightCollateralWithdrawal[];
  readonly collateralReceiver?: Address;
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
  readonly maxContinuousFee?: bigint;
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
}

/** Parameters for the Midnight take-borrow taker flow. */
export interface TakeBorrowParams extends MarketActionParams {
  readonly loanAssets: bigint;
  readonly maxUnits: bigint;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  readonly reduceOnly?: boolean;
  readonly receiver?: Address;
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
  readonly maxContinuousFee?: bigint;
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
export interface RedeemParams extends MarketActionParams {
  readonly positionData: AccrualPosition;
  readonly receiver?: Address;
  readonly units?: bigint;
}

/** Parameters for the Midnight repay-and-withdraw-collateral flow. */
export interface RepayWithdrawCollateralParams extends MarketActionParams {
  readonly repayAssets: bigint;
  readonly withdrawCollateralAssets: bigint;
  readonly collateralIndex?: bigint;
  readonly receiver?: Address;
  readonly collateralReceiver?: Address;
  readonly collateralWithdrawals?: readonly MidnightCollateralWithdrawal[];
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
}

/** Parameters for fetching a Midnight user position with market data. */
export interface GetPositionDataParams {
  readonly marketId: Hex;
  readonly accountAddress: Address;
  readonly parameters?: MidnightFetchParams;
}
