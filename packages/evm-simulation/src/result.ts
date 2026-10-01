import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
import type { SimulationAuthorization } from "./authorizations.js";
import type { SimulationLimits, SimulationOperationSubject } from "./limits.js";
import type { SimulationMode } from "./params.js";
import type {
  SimulationCall,
  SimulationResult,
  SimulationTransaction,
} from "./types.js";

/** One operation described by the caller's `limits.operations`. */
export type SimulatedOperation = {
  /** Index into `simulationTxs`, when the caller pinned one. */
  readonly transactionIndex?: number;
} & SimulationOperationSubject;

/** How a pending authorization was modeled in preview. */
export interface AuthorizationPreparation {
  readonly authorizationIndex: number;
  readonly authorization: SimulationAuthorization;
  /** Approval calls simulated before the user transactions; empty when a state override was used. */
  readonly calls: readonly {
    readonly transaction: SimulationTransaction;
    readonly result: SimulationCall;
  }[];
  readonly stateOverride?: {
    readonly address: Address;
    readonly slot: Hex;
    readonly value: Hex;
  };
}

/** One account's balance of one token. */
export interface TokenBalance {
  readonly account: Address;
  readonly token: Address;
  readonly assets: bigint;
}

/** One ERC-20 allowance. */
export interface TokenAllowance {
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
  readonly amount: bigint;
}

/** One Morpho `isAuthorized` flag before and after the bundle. */
export interface MorphoAuthorizationChange {
  readonly authorizer: Address;
  readonly authorized: Address;
  readonly before: boolean;
  readonly after: boolean;
}

/** One sequential signature nonce before and after the bundle. */
export interface SequentialNonceChange {
  readonly type: "erc2612" | "blueAuthorization";
  /** Token for erc2612, Morpho for blueAuthorization. */
  readonly verifyingContract: Address;
  readonly owner: Address;
  readonly before: bigint;
  readonly after: bigint;
}

/** One Permit2 `nonceBitmap(owner, nonce >> 8n)` word before and after the bundle. */
export interface Permit2NonceChange {
  readonly type: "permit2";
  readonly verifyingContract: Address;
  readonly owner: Address;
  /** Signed unordered nonce; the word read is `nonce >> 8n` and the bit checked is `nonce & 0xffn`. */
  readonly nonce: bigint;
  readonly before: bigint;
  readonly after: bigint;
}

/** One signature nonce before and after the bundle. */
export type SignatureNonceChange = SequentialNonceChange | Permit2NonceChange;

/** One user's position in one Blue market. */
export interface PositionState {
  readonly marketId: MarketId;
  readonly user: Address;
  readonly supplyAssets: bigint;
  readonly supplyShares: bigint;
  readonly borrowAssets: bigint;
  readonly borrowShares: bigint;
  readonly collateral: bigint;
  /** Undefined when the position has no debt. */
  readonly ltvWad?: bigint;
  /** Undefined when the position has no debt. */
  readonly healthFactorWad?: bigint;
}

/** One Blue market's state. */
export interface MarketState {
  readonly marketId: MarketId;
  readonly totalSupplyAssets: bigint;
  readonly totalSupplyShares: bigint;
  readonly totalBorrowAssets: bigint;
  readonly totalBorrowShares: bigint;
  readonly liquidityAssets: bigint;
  readonly lastUpdate: bigint;
  readonly feeWad: bigint;
  /** Undefined when the market has no supply. */
  readonly utilizationWad?: bigint;
  /** Undefined when the market has no IRM. */
  readonly borrowApyWad?: bigint;
  /** Undefined when the market has no oracle. */
  readonly oraclePrice?: bigint;
}

/** One vault allocation. */
interface VaultAllocation {
  /** Set for Vault V2. */
  readonly adapter?: Address;
  readonly marketId?: MarketId;
  readonly assets: bigint;
}

/** One Vault V1 (MetaMorpho) or Vault V2 vault's state. */
export interface VaultState {
  readonly vault: Address;
  readonly version: "v1" | "v2";
  readonly asset: Address;
  readonly totalAssets: bigint;
  readonly totalShares: bigint;
  /** Shares held by the transactions' sender. */
  readonly userShares: bigint;
  readonly idleAssets: bigint;
  readonly allocations: readonly VaultAllocation[];
}

/** Full state at one point; unchanged entries are included. */
export interface SimulationState {
  readonly balances: readonly TokenBalance[];
  readonly allowances: readonly TokenAllowance[];
  readonly morphoAuthorizations: readonly MorphoAuthorizationChange[];
  readonly nonces: readonly SignatureNonceChange[];
  readonly positions: readonly PositionState[];
  readonly markets: readonly MarketState[];
  readonly vaults: readonly VaultState[];
}

/** Signed differences (after − before) of the amounts in `SimulationState`. */
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

/** Verification report attached to a verified simulation result. */
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
  readonly before: SimulationState;
  readonly after: SimulationState;
  /** Everything that changed, including preparation and interest accrual. */
  readonly diff: SimulationStateChange;
  /** Changes caused by the user's transactions only. */
  readonly actionDiff: SimulationStateChange;
}

/** `simulationTxs` equals the caller's `transactions`; `txIdx` indexes only those. */
export interface VerifiedSimulationResult extends SimulationResult {
  readonly verification: SimulationVerification;
}
