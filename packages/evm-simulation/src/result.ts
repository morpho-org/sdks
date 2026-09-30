import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
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

/** @internal Approval calls simulated before the user transactions for one pending authorization. */
export interface AuthorizationPreparation {
  readonly authorizationIndex: number;
  readonly authorization: PendingAuthorization;
  readonly calls: readonly {
    readonly transaction: SimulationTransaction;
    readonly result: SimulationCall;
  }[];
}

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

/** @internal One Morpho `isAuthorized` flag before and after the bundle. */
export interface MorphoAuthorizationChange {
  readonly authorizer: Address;
  readonly authorized: Address;
  readonly before: boolean;
  readonly after: boolean;
}

/** @internal One sequential signature nonce before and after the bundle. */
export interface SequentialNonceChange {
  readonly type: "erc2612" | "blueAuthorization";
  /** Token for erc2612, Morpho for blueAuthorization. */
  readonly verifyingContract: Address;
  readonly owner: Address;
  readonly before: bigint;
  readonly after: bigint;
}

/** @internal One Permit2 `nonceBitmap(owner, nonce >> 8n)` word before and after the bundle. */
export interface Permit2NonceChange {
  readonly type: "permit2";
  readonly verifyingContract: Address;
  readonly owner: Address;
  /** Signed unordered nonce; the word read is `nonce >> 8n` and the bit checked is `nonce & 0xffn`. */
  readonly nonce: bigint;
  readonly before: bigint;
  readonly after: bigint;
}

/** @internal One signature nonce before and after the bundle. */
export type SignatureNonceChange = SequentialNonceChange | Permit2NonceChange;

/**
 * @internal Everything the bundle changed, including preparation calls and
 * interest accrual. Numeric entries are signed differences (after − before);
 * authorizations and nonces carry both values.
 */
export interface SimulationStateChange {
  readonly balances: readonly TokenBalance[];
  readonly allowances: readonly TokenAllowance[];
  readonly morphoAuthorizations: readonly MorphoAuthorizationChange[];
  readonly nonces: readonly SignatureNonceChange[];
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
