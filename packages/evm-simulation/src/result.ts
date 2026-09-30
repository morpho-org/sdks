import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
import type { PendingAuthorization } from "./authorizations.js";
import type { SimulationLimits, SimulationOperationSubject } from "./limits.js";
import type { SimulationMode } from "./params.js";
import type {
  SimulationCall,
  SimulationResult,
  SimulationTransaction,
} from "./types.js";

/** @internal One operation decoded from the caller's transactions. */
export type SimulatedOperation = {
  /** Index into `simulationTxs`. */
  readonly transactionIndex: number;
} & SimulationOperationSubject;

/** @internal How a pending authorization was modeled in preview. */
export type AuthorizationPreparation = {
  readonly authorizationIndex: number;
  readonly authorization: PendingAuthorization;
} & (
  | {
      readonly type: "approvalCalls";
      /** Approval calls simulated before the user transactions. */
      readonly calls: readonly {
        readonly transaction: SimulationTransaction;
        readonly result: SimulationCall;
      }[];
    }
  | {
      readonly type: "stateOverride";
      readonly address: Address;
      /** Contract storage variable the override writes (e.g. `allowance`, `nonces`). */
      readonly storageVariable: string;
      readonly slot: Hex;
      readonly value: Hex;
    }
);

/** @internal One account's balance of one token. */
export interface TokenBalance {
  readonly account: Address;
  readonly token: Address;
  readonly assets: bigint;
}

/** @internal One ERC-20 allowance. */
export interface TokenAllowance {
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
  readonly amount: bigint;
}

/** @internal One Morpho `isAuthorized` state. */
export interface MorphoAuthorizationState {
  readonly authorizer: Address;
  readonly authorized: Address;
  readonly isAuthorized: boolean;
}

/** @internal One signature nonce tracked by the simulation. */
export interface SignatureNonce {
  readonly type: "erc2612" | "blueAuthorization" | "permit2";
  /** Token for erc2612, Morpho for blueAuthorization, Permit2 for permit2. */
  readonly verifyingContract: Address;
  readonly owner: Address;
  readonly nonce: bigint;
  /** Permit2 only: whether this unordered nonce is spent. */
  readonly used?: boolean;
}

/**
 * @internal Signed differences (after − before) over the whole bundle,
 * including preparation calls and interest accrual.
 */
export interface SimulationStateChange {
  readonly balances: readonly TokenBalance[];
  readonly allowances: readonly TokenAllowance[];
  readonly morphoAuthorizations: readonly MorphoAuthorizationState[];
  readonly nonces: readonly SignatureNonce[];
  readonly positions: readonly {
    readonly marketId: MarketId;
    readonly user: Address;
    readonly supplyAssets: bigint;
    readonly supplyShares: bigint;
    readonly borrowAssets: bigint;
    readonly borrowShares: bigint;
    readonly collateral: bigint;
  }[];
  readonly markets: readonly {
    readonly marketId: MarketId;
    readonly totalSupplyAssets: bigint;
    readonly totalSupplyShares: bigint;
    readonly totalBorrowAssets: bigint;
    readonly totalBorrowShares: bigint;
    readonly liquidityAssets: bigint;
  }[];
  readonly vaults: readonly {
    readonly vault: Address;
    readonly totalAssets: bigint;
    readonly totalShares: bigint;
    readonly userShares: bigint;
    readonly idleAssets: bigint;
  }[];
}

/** @internal A fee charged during the simulation. */
export interface Fee {
  readonly type:
    | "referral"
    | "performance"
    | "management"
    | "exitPenalty"
    | "reallocationPenalty";
  readonly token: Address;
  readonly recipient: Address;
  readonly amount: bigint;
}

/** @internal Verification report attached to a verified simulation result. */
export interface SimulationVerification {
  readonly mode: SimulationMode;
  readonly chainId: number;
  readonly blockNumber: bigint;
  readonly blockTimestamp: bigint;
  /** Limits actually enforced: caller values with SDK defaults filled in. */
  readonly limits: Required<SimulationLimits>;
  readonly operations: readonly SimulatedOperation[];
  /** Preview only; always empty in final. */
  readonly authorizations: readonly AuthorizationPreparation[];
  readonly diff: SimulationStateChange;
  readonly fees: readonly Fee[];
}

/** @internal `simulationTxs` equals the caller's `transactions`; `txIdx` indexes only those. */
export interface VerifiedSimulationResult extends SimulationResult {
  readonly verification: SimulationVerification;
}
