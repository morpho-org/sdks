import type { Address, Hex } from "viem";
import type {
  BundlesFundingArgs,
  PermitAction,
  RequirementTypedData,
  TransactionAction,
} from "../types/index.js";

interface ActionInputs {
  readonly chainId: number;
  readonly account: Address;
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
 * Recipes supported by Vault V2 plans. Each `type` equals the `action.type` of the
 * {@link TransactionAction} it builds.
 * Snapshot-derived values such as the asset and the quote are fixed on `inputs` at preparation;
 * each action also carries its own chain and account on `inputs`.
 * the role map `signatureRequestIds` is a step's only request reference.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export type Action =
  | {
      readonly type: "erc20Approval";
      readonly inputs: ActionInputs & {
        readonly token: Address;
        readonly spender: Address;
        readonly amount: bigint;
      };
    }
  | {
      readonly type: "vaultV2Deposit";
      readonly inputs: VaultInputs &
        BundlesFundingArgs & {
          /** Vault asset read from the snapshot. */
          readonly asset: Address;
          /** Deadline-accrued RAY-scaled bound quoted from the snapshot for the net deposit. */
          readonly maxSharePrice: bigint;
        };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    }
  | {
      readonly type: "vaultV2Withdraw";
      readonly inputs: VaultInputs & {
        readonly amount: bigint;
        /** Minimum share allowance quoted from the snapshot for the gross withdrawal. */
        readonly requiredShareAllowance: bigint;
      };
      readonly signatureRequestIds: VaultSignatureRequestIds;
    };

/**
 * A recipe with a plan-unique `id`; its request dependencies are the roles its action names.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface Step<TAction extends Action = Action> {
  readonly id: string;
  readonly label: string;
  readonly action: TAction;
}

/**
 * ERC-2612 permit request exposed as `{ id, kind, typedData }`. `signature` is undefined until the
 * account signs `typedData`. Protocol milestones add further `kind`s such as Blue authorization.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface SignatureRequest {
  readonly id: string;
  readonly kind: "permit";
  readonly typedData: RequirementTypedData;
  readonly args: PermitAction["args"] & { readonly nonce: bigint };
  readonly signature?: Hex;
}

/**
 * Data-only operation prepared for one chain and account from the caller's intent and a vault
 * snapshot. Every step and signature request carries its own `id`, unique within the plan. Once
 * prepared, a plan is static: only signatures are added before building.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface TransactionPlan {
  readonly version: 1;
  readonly chainId: number;
  readonly account: Address;
  /** Unix seconds. One expiry governs every step deadline and signature deadline. */
  readonly expiresAt: number;
  /** Appended verbatim to every built transaction's calldata. */
  readonly calldataOrigin?: Hex;
  readonly steps: readonly Step[];
  readonly signatureRequests: readonly SignatureRequest[];
}
