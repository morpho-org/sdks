import type { InputMarketParams } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
import type {
  PermitAction,
  RequirementTypedData,
  TransactionAction,
  VaultV1MigrateToV2AmountArgs,
} from "../types/index.js";

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

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Recipes supported by vault plans. Each `type` equals the `action.type` of the
 * {@link TransactionAction} it builds.
 * Snapshot-derived values such as the asset and the quote are fixed on `inputs` at preparation;
 * each action also carries its own chain and account on `inputs`.
 * the role map `signatureRequestIds` is a step's only request reference.
 */
export type Action =
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
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * ERC-2612 permit request exposed as `{ id, kind, typedData }`. `signature` is undefined until the
 * account signs `typedData`. Protocol milestones add further `kind`s such as Blue authorization.
 */
export interface SignatureRequest {
  readonly id: string;
  readonly kind: "permit";
  readonly typedData: RequirementTypedData;
  readonly args: PermitAction["args"] & { readonly nonce: bigint };
  readonly signature?: Hex;
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Data-only operation prepared for one chain and account from the caller's intent and a vault
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
