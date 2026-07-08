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
import type { MidnightTakeableOffer } from "../../actions/midnight/types.js";
import type {
  ActionRequirement,
  BaseAction,
  MempoolSubmitOffersAction,
  MidnightOfferRootSignature,
  Transaction,
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

/** Signatures accepted by Midnight action-output transaction builders. */
export type MidnightActionSignatures =
  | MidnightOfferRootSignature
  | readonly MidnightOfferRootSignature[];

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
export interface MidnightActionOutput<
  TAction extends BaseAction,
  TSignatures = undefined,
> {
  readonly buildTx: (
    signatures?: TSignatures,
  ) => Readonly<Transaction<TAction>>;
  readonly getRequirements: () => Promise<readonly ActionRequirement[]>;
}

/**
 * Output returned by maker-offer flows after offer-tree preparation.
 *
 * Use `groups` and `root` for review UI, call `getRequirements()` to collect
 * ratifier approval or signature requirements, then call `buildTx(signatures)`
 * to publish the encoded payload to the Midnight mempool.
 *
 * @example
 * ```ts
 * const output = await midnight.makeLend(params);
 * console.log(output.root, output.groups);
 * const requirements = await output.getRequirements();
 * const signatures = [];
 * for (const requirement of requirements) {
 *   if ("sign" in requirement) {
 *     signatures.push(await requirement.sign(walletClient, maker));
 *   } else {
 *     await walletClient.sendTransaction({
 *       to: requirement.to,
 *       data: requirement.data,
 *       value: requirement.value,
 *     });
 *   }
 * }
 * const tx = output.buildTx(signatures);
 * ```
 */
export interface MakeOffersOutput
  extends MidnightActionOutput<
    MempoolSubmitOffersAction,
    MidnightActionSignatures
  > {
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
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
}

/** Parameters for fetching a Midnight user position with market data. */
export interface GetPositionDataParams {
  readonly marketId: Hex;
  readonly accountAddress: Address;
  readonly parameters?: MidnightFetchParams;
}
