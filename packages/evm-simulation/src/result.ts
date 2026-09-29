import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
import type { PendingAuthorization } from "./authorizations.js";
import type { OperationType, SimulationLimits } from "./limits.js";
import type { SimulationMode } from "./params.js";
import type {
  SimulationCall,
  SimulationResult,
  SimulationTransaction,
} from "./types.js";

/** @internal One operation decoded from the caller's transactions. */
export interface SimulatedOperation {
  readonly type: OperationType;
  /** Index into `simulationTxs`. */
  readonly transactionIndex: number;
  /** Set for Blue operations except refinance and authorization. */
  readonly marketId?: MarketId;
  /** Set for refinance. */
  readonly sourceMarketId?: MarketId;
  readonly targetMarketId?: MarketId;
  /** Set for vault operations except migration. */
  readonly vault?: Address;
  /** Set for migration. */
  readonly sourceVault?: Address;
  readonly targetVault?: Address;
  /** Set for blueAuthorization. */
  readonly authorized?: Address;
}

/** @internal How a pending authorization was modeled in preview. */
export interface AuthorizationPreparation {
  readonly authorizationIndex: number;
  readonly authorization: PendingAuthorization;
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

/** @internal One user's position in one Blue market. */
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

/** @internal One Blue market's state. */
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

/** @internal One vault allocation. */
export interface VaultAllocation {
  /** Set for Vault V2. */
  readonly adapter?: Address;
  readonly marketId?: MarketId;
  readonly assets: bigint;
}

/** @internal One Vault V1 (MetaMorpho) or Vault V2 vault's state. */
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

/** @internal Full state at one point; unchanged entries are included. */
export interface SimulationState {
  readonly balances: readonly TokenBalance[];
  readonly allowances: readonly TokenAllowance[];
  readonly morphoAuthorizations: readonly MorphoAuthorizationState[];
  readonly nonces: readonly SignatureNonce[];
  readonly positions: readonly PositionState[];
  readonly markets: readonly MarketState[];
  readonly vaults: readonly VaultState[];
}

/** @internal Signed differences (after − before) of the amounts in `SimulationState`. */
export interface SimulationStateChange {
  readonly balances: readonly TokenBalance[];
  readonly allowances: readonly TokenAllowance[];
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

/** @internal An asset/share conversion and the bounds it was checked against. */
export interface Conversion {
  readonly transactionIndex: number;
  readonly marketId?: MarketId;
  readonly vault?: Address;
  readonly assets: bigint;
  readonly shares: bigint;
  readonly quotedSharePriceE27: bigint;
  readonly actualSharePriceE27: bigint;
  readonly minSharePriceE27: bigint;
  readonly maxSharePriceE27: bigint;
}

/** @internal A fee observed during the simulation. */
export interface Fee {
  readonly transactionIndex: number;
  readonly type:
    | "referral"
    | "performance"
    | "management"
    | "exitPenalty"
    | "reallocationPenalty";
  readonly token: Address;
  readonly recipient: Address;
  readonly expectedAmount: bigint;
  readonly observedAmount: bigint;
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
  readonly before: SimulationState;
  readonly after: SimulationState;
  /** Everything that changed, including preparation and interest accrual. */
  readonly diff: SimulationStateChange;
  /** Changes caused by the user's transactions only. */
  readonly actionDiff: SimulationStateChange;
  readonly conversions: readonly Conversion[];
  readonly fees: readonly Fee[];
}

/** @internal `simulationTxs` equals the caller's `transactions`; `txIdx` indexes only those. */
export interface VerifiedSimulationResult extends SimulationResult {
  readonly verification: SimulationVerification;
}
