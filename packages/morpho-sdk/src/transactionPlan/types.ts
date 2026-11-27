import type { InputMarketParams, MarketParams } from "@morpho-org/blue-sdk";
import type { MarketUtils } from "@morpho-org/midnight-sdk";
import type { Address, Hex } from "viem";
import type { BlueRepayParams } from "../actions/blue/repay.js";
import type { BlueRepayWithdrawCollateralParams } from "../actions/blue/repayWithdrawCollateral.js";
import type { BlueSupplyCollateralBorrowParams } from "../actions/blue/supplyCollateralBorrow.js";
import type { MidnightRepayWithdrawCollateralParams } from "../actions/midnight/repayWithdrawCollateral.js";
import type { MidnightTakeBorrowParams } from "../actions/midnight/takeBorrow.js";
import type { MidnightTakeLendParams } from "../actions/midnight/takeLend.js";
import type { MidnightTakeRepayWithdrawCollateralParams } from "../actions/midnight/takeRepayWithdrawCollateral.js";
import type { MidnightTakeableOffer } from "../actions/midnight/types.js";
import type {
  MidnightBlueSupply,
  MidnightCollateralTransfer,
} from "../types/action.js";
import type {
  AuthorizationSignatureArgs,
  PermitAction,
  RequirementTypedData,
  VaultV1MigrateToV2AmountArgs,
  VaultV2BlueReallocation,
} from "../types/index.js";
import type { MidnightCancelAndMakeParams } from "../types/midnightCancelAndMake.js";

interface ActionInputs {
  readonly chainId: number;
  readonly account: Address;
}

/** Plain deallocation fields persisted by force-redeem plans, without class-derived values. */
interface StoredDeallocation {
  readonly adapter: Address;
  readonly assets: bigint;
  readonly marketParams?: InputMarketParams;
}

interface VaultInputs extends ActionInputs {
  readonly vault: Address;
  readonly deadline: bigint;
  readonly referralFeePct: bigint;
  readonly referralFeeRecipient: Address;
}

/** Signature request roles a vault action selects by plan-local ID. */
type VaultSignatureRequestIds = {
  /** Token permit consumed by the action; omitted when no permit is needed. */
  readonly tokenPermit?: string;
};

type MidnightSellInputs = ActionInputs &
  Omit<
    MidnightTakeBorrowParams,
    | "chainId"
    | "market"
    | "metadata"
    | "referralFeePct"
    | "referralFeeRecipient"
  > & {
    readonly market: MidnightTakeableOffer["offer"]["market"];
    readonly referralFeePct: bigint;
    readonly referralFeeRecipient: Address;
  };

type MidnightMakerPublicationInputs = ActionInputs &
  Pick<MidnightCancelAndMakeParams, "cancellations" | "deadline"> & {
    readonly ratifierType: "priceV1" | "rateV1";
    readonly ratifier: Address;
    readonly root: Hex;
    readonly groups: readonly Hex[];
    readonly payload: Hex;
  };

/**
 * Recipes supported by TransactionPlan.
 * Snapshot-derived values such as the asset and the quote are fixed on `inputs` at preparation;
 * each action also carries its own chain and account on `inputs`.
 * The role map `signatureRequestIds` is a step's only request reference.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export type Action =
  | {
      readonly type: "midnightMakeBorrow";
      readonly inputs: MidnightMakerPublicationInputs;
    }
  | {
      readonly type: "midnightMakeLend";
      readonly inputs: MidnightMakerPublicationInputs;
    }
  | {
      readonly type: "midnightMakeRepay";
      readonly inputs: MidnightMakerPublicationInputs;
    }
  | {
      readonly type: "midnightMakeWithdraw";
      readonly inputs: MidnightMakerPublicationInputs;
    }
  | {
      readonly type: "midnightSupplyBlueMakeLend";
      readonly inputs: MidnightMakerPublicationInputs & {
        readonly blueSupply: MidnightBlueSupply;
        /** Native ETH in wei, passed as transaction value. */
        readonly nativeAssets?: bigint;
      };
    }
  | {
      readonly type: "midnightSupplyCollateralMakeBorrow";
      readonly inputs: MidnightMakerPublicationInputs & {
        readonly collateral: {
          readonly market: ReturnType<typeof MarketUtils.toStruct>;
          readonly supplies: readonly MidnightCollateralTransfer[];
        };
        /** Native ETH in wei, passed as transaction value. */
        readonly nativeAssets?: bigint;
      };
    }
  | {
      readonly type: "midnightRepayWithdrawCollateral";
      readonly inputs: ActionInputs &
        Omit<
          MidnightRepayWithdrawCollateralParams,
          "chainId" | "market" | "metadata" | "nativeAmount"
        > & {
          readonly market: ReturnType<typeof MarketUtils.toStruct>;
          /** Native ETH in wei, passed as transaction value. Omitted or zero means no ETH funding. */
          readonly nativeAssets?: bigint;
        };
    }
  | {
      readonly type: "midnightTakeBorrow";
      readonly inputs: MidnightSellInputs;
    }
  | {
      readonly type: "midnightTakeRepayWithdrawCollateral";
      readonly inputs: ActionInputs &
        Omit<
          MidnightTakeRepayWithdrawCollateralParams,
          | "chainId"
          | "market"
          | "metadata"
          | "nativeAmount"
          | "referralFeePct"
          | "referralFeeRecipient"
        > & {
          readonly market: MidnightTakeableOffer["offer"]["market"];
          readonly nativeAssets?: bigint;
          readonly referralFeePct: bigint;
          readonly referralFeeRecipient: Address;
        };
    }
  | {
      readonly type: "midnightSupplyCollateralTakeBorrow";
      readonly inputs: MidnightSellInputs & {
        readonly collateralSupplies: readonly MidnightCollateralTransfer[];
        /** Native ETH in wei, passed as transaction value. */
        readonly nativeAssets?: bigint;
      };
    }
  | {
      readonly type: "midnightTakeWithdraw";
      readonly inputs: MidnightSellInputs;
    }
  | {
      readonly type: "midnightTakeLend";
      readonly inputs: ActionInputs &
        Omit<
          MidnightTakeLendParams,
          | "chainId"
          | "market"
          | "metadata"
          | "nativeAmount"
          | "referralFeePct"
          | "referralFeeRecipient"
        > & {
          readonly market: MidnightTakeableOffer["offer"]["market"];
          readonly nativeAssets?: bigint;
          readonly referralFeePct: bigint;
          readonly referralFeeRecipient: Address;
        };
    }
  | {
      readonly type: "midnightAuthorization";
      readonly inputs: ActionInputs;
    }
  | {
      readonly type: "midnightSupplyCollateral";
      readonly inputs: ActionInputs & {
        readonly market: ReturnType<typeof MarketUtils.toStruct>;
        readonly collateralIndex: bigint;
        readonly collateralAssets: bigint;
      };
    }
  | {
      readonly type: "midnightWithdrawCollateral";
      readonly inputs: ActionInputs & {
        readonly market: ReturnType<typeof MarketUtils.toStruct>;
        readonly collateralIndex: bigint;
        readonly assets: bigint;
        readonly receiver: Address;
      };
    }
  | {
      readonly type: "midnightWithdrawCollateralBatch";
      readonly inputs: ActionInputs & {
        readonly market: ReturnType<typeof MarketUtils.toStruct>;
        readonly collateralWithdrawals: readonly MidnightCollateralTransfer[];
        readonly receiver: Address;
      };
    }
  | {
      readonly type: "midnightSupplyCollateralBatch";
      readonly inputs: ActionInputs & {
        readonly market: ReturnType<typeof MarketUtils.toStruct>;
        readonly collateralSupplies: readonly MidnightCollateralTransfer[];
      };
    }
  | {
      readonly type: "midnightSupplyCollateralWithNative";
      readonly inputs: ActionInputs & {
        readonly market: ReturnType<typeof MarketUtils.toStruct>;
        readonly collateralIndex: bigint;
        readonly collateralAssets: bigint;
        /** Native ETH in wei, passed as transaction value. */
        readonly nativeAssets: bigint;
        readonly deadline: bigint;
      };
    }
  | {
      readonly type: "midnightRedeem";
      readonly inputs: ActionInputs & {
        readonly market: ReturnType<typeof MarketUtils.toStruct>;
        readonly units: bigint;
        readonly receiver: Address;
      };
    }
  | {
      readonly type: "vaultV2ForceRedeem";
      readonly inputs: ActionInputs & {
        readonly vault: Address;
        readonly redeem: { readonly shares: bigint };
        readonly deallocations: readonly StoredDeallocation[];
      };
    }
  | {
      readonly type: "vaultV1Redeem";
      readonly inputs: VaultInputs & { readonly shares: bigint };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "vaultV1MigrateToV2";
      readonly inputs: ActionInputs &
        VaultV1MigrateToV2AmountArgs & {
          readonly sourceVault: Address;
          readonly targetVault: Address;
          readonly asset: Address;
          readonly maxSharePrice: bigint;
          readonly vault: Address;
          readonly requiredShareAllowance: bigint;
          readonly deadline: bigint;
          readonly referralFeePct: bigint;
          readonly referralFeeRecipient: Address;
        };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "vaultV1InKindRedeem";
      readonly inputs: ActionInputs & {
        readonly vault: Address;
        readonly assets: bigint;
        readonly deadline: bigint;
        readonly marketParamsList: readonly InputMarketParams[];
      };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "blueSupply";
      readonly inputs: ActionInputs & {
        readonly marketParams: Readonly<InputMarketParams>;
        readonly assets: bigint;
        readonly nativeAssets?: bigint;
        readonly deadline: bigint;
        readonly referralFeePct: bigint;
        readonly referralFeeRecipient: Address;
      };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "blueBorrow";
      readonly inputs: ActionInputs & {
        readonly marketParams: MarketParams;
        readonly borrowAssets: bigint;
        readonly maxLtv: bigint;
        /** Maximum WAD-scaled penalty rate per reallocation, defaulting to zero; it does not bound total proceeds lost. */
        readonly maxPenalty?: bigint;
        readonly reallocations: readonly VaultV2BlueReallocation[];
        readonly deadline: bigint;
        readonly referralFeePct: bigint;
        readonly referralFeeRecipient: Address;
        readonly authorizationNonce: bigint;
      };
      readonly signatureRequestIds: { readonly morphoAuthorization?: string };
    }
  | {
      readonly type: "blueSupplyCollateralBorrow";
      readonly inputs: ActionInputs &
        Omit<
          BlueSupplyCollateralBorrowParams["args"],
          | "userAddress"
          | "requirementSignature"
          | "authorizationSignature"
          | "reallocations"
          | "nativeAmount"
        > & {
          readonly marketParams: BlueSupplyCollateralBorrowParams["market"]["marketParams"];
          readonly nativeAssets?: bigint;
          readonly reallocations: readonly VaultV2BlueReallocation[];
          readonly authorizationNonce?: bigint;
        };
      readonly signatureRequestIds: {
        readonly tokenPermit?: string;
        readonly morphoAuthorization?: string;
      };
    }
  | {
      readonly type: "blueRepay";
      readonly inputs: ActionInputs & {
        readonly marketParams: InputMarketParams;
        readonly referralFeePct: bigint;
        readonly referralFeeRecipient: Address;
        readonly nativeAssets?: bigint;
      } & Omit<
          BlueRepayParams["args"],
          "userAddress" | "requirementSignature" | "nativeAmount"
        >;
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "blueWithdraw";
      readonly inputs: ActionInputs & {
        readonly marketParams: Pick<
          MarketParams,
          "loanToken" | "collateralToken" | "oracle" | "irm" | "lltv"
        >;
        readonly withdrawAssets: bigint;
        readonly withdrawShares: bigint;
        /** Maximum WAD-scaled penalty rate per reallocation, defaulting to zero; it does not bound total proceeds lost. */
        readonly maxPenalty?: bigint;
        readonly reallocations: readonly VaultV2BlueReallocation[];
        readonly deadline: bigint;
        readonly referralFeePct: bigint;
        readonly referralFeeRecipient: Address;
        /** Morpho nonce pinned when preparing an inline authorization signature. */
        readonly authorizationNonce?: bigint;
      };
      readonly signatureRequestIds: { readonly morphoAuthorization?: string };
    }
  | {
      readonly type: "blueWithdrawCollateral";
      readonly signatureRequestIds: { readonly morphoAuthorization?: string };
      readonly inputs: ActionInputs & {
        readonly marketParams: Readonly<InputMarketParams>;
        readonly collateralAssets: bigint;
        readonly maxLtv: bigint;
        readonly authorizationNonce?: bigint;
        readonly deadline: bigint;
        readonly referralFeePct: bigint;
        readonly referralFeeRecipient: Address;
      };
    }
  | {
      readonly type: "blueWithdrawBuyCallback";
      readonly inputs: ActionInputs & {
        readonly marketParams: Readonly<InputMarketParams>;
        /** BlueBuyCallback whose supply position is withdrawn to `account`, its owner. */
        readonly callbackAddress: Address;
        /** Every supply share the callback held in the prepared snapshot. */
        readonly shares: bigint;
      };
    }
  | {
      readonly type: "blueRepayWithdrawCollateral";
      readonly inputs: ActionInputs &
        Omit<
          BlueRepayWithdrawCollateralParams["args"],
          | "userAddress"
          | "requirementSignature"
          | "authorizationSignature"
          | "nativeAmount"
        > & {
          readonly authorizationNonce?: bigint;
          readonly nativeAssets?: bigint;
          readonly referralFeePct: bigint;
          readonly referralFeeRecipient: Address;
          readonly marketParams: Pick<
            BlueRepayWithdrawCollateralParams["market"]["marketParams"],
            "loanToken" | "collateralToken" | "oracle" | "irm" | "lltv"
          >;
        };
      readonly signatureRequestIds: {
        readonly tokenPermit?: string;
        readonly morphoAuthorization?: string;
      };
    }
  | {
      readonly type: "erc20Approval";
      readonly inputs: ActionInputs & {
        readonly token: Address;
        readonly spender: Address;
      } & (
          | { readonly assets: bigint; readonly shares?: never }
          | { readonly shares: bigint; readonly assets?: never }
        );
    }
  | {
      readonly type: "blueSupplyCollateral";
      readonly inputs: ActionInputs & {
        readonly marketParams: Omit<MarketParams, "liquidationIncentiveFactor">;
        readonly collateralAssets: bigint;
        readonly nativeAssets?: bigint;
        readonly deadline: bigint;
        readonly referralFeePct: bigint;
        readonly referralFeeRecipient: Address;
      };
      readonly signatureRequestIds: { readonly tokenPermit?: string };
    }
  | {
      readonly type: "vaultV2Deposit";
      readonly inputs: VaultInputs &
        (
          | { readonly assets: bigint; readonly nativeAssets?: never }
          | { readonly nativeAssets: bigint; readonly assets?: never }
        ) & {
          /** Vault asset read from the snapshot. */
          readonly asset: Address;
          /** Deadline-accrued RAY-scaled bound quoted from the snapshot for the net deposit. */
          readonly maxSharePrice: bigint;
        };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "vaultV1Deposit";
      readonly inputs: VaultInputs &
        (
          | { readonly assets: bigint; readonly nativeAssets?: never }
          | { readonly nativeAssets: bigint; readonly assets?: never }
        ) & {
          /** Vault asset read from the snapshot. */
          readonly asset: Address;
          /** Deadline-accrued RAY-scaled bound quoted from the snapshot for the net deposit. */
          readonly maxSharePrice: bigint;
        };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "vaultV1Withdraw";
      readonly inputs: VaultInputs & {
        readonly assets: bigint;
        /** Minimum share allowance quoted from the snapshot for the gross withdrawal. */
        readonly requiredShareAllowance: bigint;
      };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "vaultV2InKindRedeem";
      readonly inputs: ActionInputs & {
        readonly vault: Address;
        readonly adapter: Address;
        readonly assets: bigint;
        readonly deadline: bigint;
        readonly marketParamsList: readonly InputMarketParams[];
      };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "vaultV2Withdraw";
      readonly inputs: VaultInputs & {
        readonly assets: bigint;
        /** Minimum share allowance quoted from the snapshot for the gross withdrawal. */
        readonly requiredShareAllowance: bigint;
      };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "vaultV2Redeem";
      readonly inputs: VaultInputs & {
        /** Exact shares to burn; no quote is required. */
        readonly shares: bigint;
      };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "vaultV2ForceWithdraw";
      readonly inputs: VaultInputs & {
        readonly adapter: Address;
        /** Penalty-inclusive assets debited from the account's position. */
        readonly assets: bigint;
        /** Snapshot-derived lower bound on the realized exit share price. */
        readonly minSharePriceE27: bigint;
      };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "blueRefinance";
      readonly inputs: ActionInputs & {
        readonly sourceMarketParams: Readonly<MarketParams>;
        readonly destinationMarketParams: Readonly<MarketParams>;
        readonly maxLtv: bigint;
        /** Maximum WAD-scaled penalty rate per reallocation, defaulting to zero; it does not bound the total penalty added to destination debt. */
        readonly maxPenalty?: bigint;
        readonly deadline: bigint;
        readonly referralFeePct: bigint;
        readonly referralFeeRecipient: Address;
        readonly reallocations: readonly VaultV2BlueReallocation[];
        /** Expected Morpho nonce when the migration consumes an inline authorization. */
        readonly authorizationNonce?: bigint;
      };
      readonly signatureRequestIds: { readonly morphoAuthorization?: string };
    }
  | {
      readonly type: "morphoAuthorization";
      readonly inputs: ActionInputs;
    }
  | {
      readonly type: "midnightCancelOffers";
      readonly inputs: ActionInputs & { readonly groups: readonly Hex[] };
    };

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * A recipe with a plan-unique `id`; its request dependencies are the roles its action names.
 */
export interface Step<TAction extends Action = Action> {
  readonly id: string;
  readonly label: string;
  readonly action: TAction;
}

/**
 * ERC-2612 permit or Morpho Blue authorization exposed as `{ id, kind, typedData }`.
 * `signature` is undefined until the account signs `typedData`.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export type SignatureRequest = {
  readonly id: string;
  readonly typedData: RequirementTypedData;
  readonly signature?: Hex;
} & (
  | {
      readonly kind: "permit";
      readonly args: PermitAction["args"] & { readonly nonce: bigint };
    }
  | {
      readonly kind: "morphoAuthorization";
      readonly args: Omit<
        AuthorizationSignatureArgs,
        "signature" | "isAuthorized"
      >;
    }
);

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Data-only operation prepared for one chain and account from the caller's intent and a protocol
 * snapshot. Every step and signature request carries its own `id`, unique within the plan. Once
 * prepared, a plan is static: only signatures are added before building.
 */
export interface TransactionPlan {
  readonly version: 2;
  readonly chainId: number;
  readonly account: Address;
  /** Unix seconds. One expiry governs every step deadline and signature deadline. */
  readonly expiresAt: number;
  /** Appended verbatim to every built transaction's calldata. */
  readonly calldataOrigin?: Hex;
  readonly steps: readonly Step[];
  readonly signatureRequests: readonly SignatureRequest[];
}
