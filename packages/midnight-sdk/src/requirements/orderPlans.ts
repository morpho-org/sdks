import type { Address, Hex } from "viem";
import {
  type EcrecoverRatificationTypedData,
  OfferPayloadUtils,
} from "../signatures/index.js";
import type { BigIntish, MidnightCall, RatifierInfo } from "../types.js";
import {
  type MidnightApprovalRequirement,
  planApprovalRequirement,
} from "./approval.js";
import {
  type MidnightAuthorizationRequirement,
  planAuthorizationRequirement,
} from "./authorization.js";

/**
 * Signature requirement descriptor.
 *
 * @example
 * ```ts
 * import type { MidnightSignatureRequirement } from "@morpho-org/midnight-sdk";
 *
 * const requirement = {} as MidnightSignatureRequirement;
 * console.log(requirement.type);
 * ```
 */
export interface MidnightSignatureRequirement {
  /** Requirement discriminator. */
  readonly type: "signature";
  /** Typed data to sign. */
  readonly typedData: EcrecoverRatificationTypedData;
}

/**
 * Setter root-approval requirement descriptor.
 *
 * @example
 * ```ts
 * import type { MidnightRootApprovalRequirement } from "@morpho-org/midnight-sdk";
 *
 * const requirement = {} as MidnightRootApprovalRequirement;
 * console.log(requirement.call.to);
 * ```
 */
export interface MidnightRootApprovalRequirement {
  /** Requirement discriminator. */
  readonly type: "rootApproval";
  /** Root being ratified. */
  readonly root: Hex;
  /** Call that ratifies the root. */
  readonly call: MidnightCall;
}

/**
 * Payload-validation requirement descriptor.
 *
 * @example
 * ```ts
 * import type { MidnightPayloadValidationRequirement } from "@morpho-org/midnight-sdk";
 *
 * const requirement = {} as MidnightPayloadValidationRequirement;
 * console.log(requirement.payload);
 * ```
 */
export interface MidnightPayloadValidationRequirement {
  /** Requirement discriminator. */
  readonly type: "payloadValidation";
  /** Payload to validate. */
  readonly payload: Hex;
}

/**
 * Union of neutral Midnight requirement descriptors.
 *
 * @example
 * ```ts
 * import type { MidnightRequirement } from "@morpho-org/midnight-sdk";
 *
 * const requirement = {} as MidnightRequirement;
 * console.log(requirement.type);
 * ```
 */
export type MidnightRequirement =
  | MidnightApprovalRequirement
  | MidnightAuthorizationRequirement
  | MidnightSignatureRequirement
  | MidnightRootApprovalRequirement
  | MidnightPayloadValidationRequirement;

/**
 * Parameters for {@link planBorrowMarketOrderRequirements}.
 *
 * @example
 * ```ts
 * import type { PlanBorrowMarketOrderRequirementsParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as PlanBorrowMarketOrderRequirementsParams;
 * console.log(params.collateralAmount);
 * ```
 */
export interface PlanBorrowMarketOrderRequirementsParams {
  /** Core Midnight contract address. */
  readonly midnight: Address | string;
  /** MidnightBundles contract address. */
  readonly midnightBundles: Address | string;
  /** Borrower/taker account. */
  readonly borrower: Address | string;
  /** Collateral token approved to the bundler. */
  readonly collateralToken: Address | string;
  /** Collateral amount required by the route. */
  readonly collateralAmount: BigIntish;
  /** Current collateral allowance to the bundler. */
  readonly collateralAllowance: BigIntish;
  /** Current borrower authorization for the bundler. */
  readonly isBundlerAuthorized: boolean;
}

/**
 * Parameters for {@link planLendMarketOrderRequirements}.
 *
 * @example
 * ```ts
 * import type { PlanLendMarketOrderRequirementsParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as PlanLendMarketOrderRequirementsParams;
 * console.log(params.loanTokenAmount);
 * ```
 */
export interface PlanLendMarketOrderRequirementsParams {
  /** Core Midnight contract address. */
  readonly midnight: Address | string;
  /** MidnightBundles contract address. */
  readonly midnightBundles: Address | string;
  /** Lender/taker account. */
  readonly lender: Address | string;
  /** Loan token approved to the bundler. */
  readonly loanToken: Address | string;
  /** Loan token amount required by the route. */
  readonly loanTokenAmount: BigIntish;
  /** Current loan-token allowance to the bundler. */
  readonly loanTokenAllowance: BigIntish;
  /** Current lender authorization for the bundler. */
  readonly isBundlerAuthorized: boolean;
}

/**
 * Parameters for {@link planSupplyCollateralRequirements}.
 *
 * @example
 * ```ts
 * import type { PlanSupplyCollateralRequirementsParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as PlanSupplyCollateralRequirementsParams;
 * console.log(params.collateralAmount);
 * ```
 */
export interface PlanSupplyCollateralRequirementsParams {
  /** Core Midnight contract address. */
  readonly midnight: Address | string;
  /** Supplier account. */
  readonly supplier: Address | string;
  /** Collateral token approved to Midnight. */
  readonly collateralToken: Address | string;
  /** Collateral amount required. */
  readonly collateralAmount: BigIntish;
  /** Current collateral allowance to Midnight. */
  readonly collateralAllowance: BigIntish;
}

/**
 * Parameters for {@link planMakeOfferRequirements}.
 *
 * @example
 * ```ts
 * import type { PlanMakeOfferRequirementsParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as PlanMakeOfferRequirementsParams;
 * console.log(params.ratifierInfo.type);
 * ```
 */
export interface PlanMakeOfferRequirementsParams {
  /** Core Midnight contract address. */
  readonly midnight: Address | string;
  /** Maker account creating the offer. */
  readonly maker: Address | string;
  /** Ratifier route selected for the maker. */
  readonly ratifierInfo: RatifierInfo;
  /** Current maker authorization for the selected ratifier signer/operator. */
  readonly isRatifierAuthorized: boolean;
  /** Typed data required by Ecrecover ratification. */
  readonly typedData?: EcrecoverRatificationTypedData;
  /** Root used by Setter ratification. */
  readonly root?: Hex;
  /** Whether the Setter root has already been ratified. */
  readonly isRootRatified?: boolean;
  /** Setter root-approval call. */
  readonly rootApprovalCall?: MidnightCall;
  /** Router/app payload requiring validation. */
  readonly payload?: Hex;
  /** Whether payload validation is already complete. */
  readonly payloadValidated?: boolean;
}

const push = (
  requirements: MidnightRequirement[],
  requirement?: MidnightRequirement,
) => {
  if (requirement != null) requirements.push(requirement);
};

/**
 * Plans borrow market-order requirements.
 *
 * @param params - Requirement planning inputs.
 * @returns Neutral requirement descriptors.
 * @example
 * ```ts
 * import { planBorrowMarketOrderRequirements } from "@morpho-org/midnight-sdk";
 *
 * const requirements = planBorrowMarketOrderRequirements({} as never);
 * console.log(requirements.length);
 * ```
 */
export function planBorrowMarketOrderRequirements(
  params: PlanBorrowMarketOrderRequirementsParams,
): readonly MidnightRequirement[] {
  const requirements: MidnightRequirement[] = [];
  push(
    requirements,
    planApprovalRequirement({
      token: params.collateralToken,
      owner: params.borrower,
      spender: params.midnightBundles,
      requiredAmount: params.collateralAmount,
      currentAllowance: params.collateralAllowance,
    }),
  );
  push(
    requirements,
    planAuthorizationRequirement({
      midnight: params.midnight,
      authorizer: params.borrower,
      authorized: params.midnightBundles,
      isAuthorized: params.isBundlerAuthorized,
    }),
  );

  return requirements;
}

/**
 * Plans lend market-order requirements.
 *
 * @param params - Requirement planning inputs.
 * @returns Neutral requirement descriptors.
 * @example
 * ```ts
 * import { planLendMarketOrderRequirements } from "@morpho-org/midnight-sdk";
 *
 * const requirements = planLendMarketOrderRequirements({} as never);
 * console.log(requirements.length);
 * ```
 */
export function planLendMarketOrderRequirements(
  params: PlanLendMarketOrderRequirementsParams,
): readonly MidnightRequirement[] {
  const requirements: MidnightRequirement[] = [];
  push(
    requirements,
    planApprovalRequirement({
      token: params.loanToken,
      owner: params.lender,
      spender: params.midnightBundles,
      requiredAmount: params.loanTokenAmount,
      currentAllowance: params.loanTokenAllowance,
    }),
  );
  push(
    requirements,
    planAuthorizationRequirement({
      midnight: params.midnight,
      authorizer: params.lender,
      authorized: params.midnightBundles,
      isAuthorized: params.isBundlerAuthorized,
    }),
  );

  return requirements;
}

/**
 * Plans supply-collateral requirements.
 *
 * @param params - Requirement planning inputs.
 * @returns Neutral requirement descriptors.
 * @example
 * ```ts
 * import { planSupplyCollateralRequirements } from "@morpho-org/midnight-sdk";
 *
 * const requirements = planSupplyCollateralRequirements({} as never);
 * console.log(requirements.length);
 * ```
 */
export function planSupplyCollateralRequirements(
  params: PlanSupplyCollateralRequirementsParams,
): readonly MidnightRequirement[] {
  const requirement = planApprovalRequirement({
    token: params.collateralToken,
    owner: params.supplier,
    spender: params.midnight,
    requiredAmount: params.collateralAmount,
    currentAllowance: params.collateralAllowance,
  });

  return requirement == null ? [] : [requirement];
}

/**
 * Plans make-offer signature, root approval, and payload-validation requirements.
 *
 * @param params - Requirement planning inputs.
 * @returns Neutral requirement descriptors.
 * @example
 * ```ts
 * import { planMakeOfferRequirements } from "@morpho-org/midnight-sdk";
 *
 * const requirements = planMakeOfferRequirements({} as never);
 * console.log(requirements.length);
 * ```
 */
export function planMakeOfferRequirements(
  params: PlanMakeOfferRequirementsParams,
): readonly MidnightRequirement[] {
  const requirements: MidnightRequirement[] = [];
  push(
    requirements,
    planAuthorizationRequirement({
      midnight: params.midnight,
      authorizer: params.maker,
      authorized: params.ratifierInfo.ratifier,
      isAuthorized: params.isRatifierAuthorized,
    }),
  );

  if (params.ratifierInfo.type === "ecrecover" && params.typedData != null) {
    requirements.push({ type: "signature", typedData: params.typedData });
  }

  if (
    params.ratifierInfo.type === "setter" &&
    params.root != null &&
    params.isRootRatified !== true
  ) {
    const root = params.root as Hex;
    requirements.push({
      type: "rootApproval",
      root,
      call:
        params.rootApprovalCall ??
        OfferPayloadUtils.buildSetterRootApprovalCall({
          setterRatifier: params.ratifierInfo.ratifier,
          maker: params.maker,
          root,
        }),
    });
  }

  if (params.payload != null && params.payloadValidated !== true) {
    requirements.push({
      type: "payloadValidation",
      payload: params.payload as Hex,
    });
  }

  return requirements;
}

/**
 * Builds a root-approval requirement from Setter parameters.
 *
 * @param params - Root approval inputs.
 * @returns Root-approval requirement.
 * @example
 * ```ts
 * import { buildRootApprovalRequirement } from "@morpho-org/midnight-sdk";
 *
 * const requirement = buildRootApprovalRequirement({
 *   setterRatifier: "0x0000000000000000000000000000000000000001",
 *   maker: "0x0000000000000000000000000000000000000002",
 *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
 * });
 * console.log(requirement.type);
 * ```
 */
export function buildRootApprovalRequirement(params: {
  readonly setterRatifier: Address | string;
  readonly maker: Address | string;
  readonly root: Hex;
}): MidnightRootApprovalRequirement {
  return {
    type: "rootApproval",
    root: params.root as Hex,
    call: OfferPayloadUtils.buildSetterRootApprovalCall(params),
  };
}
