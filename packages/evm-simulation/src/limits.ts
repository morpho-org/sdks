import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address } from "viem";

/** Every operation type; source of `OperationType`. */
export const OPERATION_TYPES = [
  "blueSupply",
  "blueWithdraw",
  "blueSupplyCollateral",
  "blueBorrow",
  "blueSupplyCollateralBorrow",
  "blueRepay",
  "blueWithdrawCollateral",
  "blueRepayWithdrawCollateral",
  "blueRefinance",
  "blueAuthorization",
  "vaultV1Deposit",
  "vaultV2Deposit",
  "vaultV1Withdraw",
  "vaultV2Withdraw",
  "vaultV1Redeem",
  "vaultV2Redeem",
  "vaultV2ForceWithdraw",
  "vaultV2ForceRedeem",
  "vaultV1InKindRedeem",
  "vaultV2InKindRedeem",
  "vaultV1MigrateToV2",
] as const;

/** Discriminator for operations and their limits. */
export type OperationType = (typeof OPERATION_TYPES)[number];

/** Operations acting on one Blue market; source of `BlueMarketOperationType`. */
export const BLUE_MARKET_OPERATION_TYPES = [
  "blueSupply",
  "blueWithdraw",
  "blueSupplyCollateral",
  "blueBorrow",
  "blueSupplyCollateralBorrow",
  "blueRepay",
  "blueWithdrawCollateral",
  "blueRepayWithdrawCollateral",
] as const satisfies readonly OperationType[];

/** Operations acting on one Blue market. */
export type BlueMarketOperationType =
  (typeof BLUE_MARKET_OPERATION_TYPES)[number];

/** Operations acting on one vault (V1 or V2); source of `VaultOperationType`. */
export const VAULT_OPERATION_TYPES = [
  "vaultV1Deposit",
  "vaultV2Deposit",
  "vaultV1Withdraw",
  "vaultV2Withdraw",
  "vaultV1Redeem",
  "vaultV2Redeem",
  "vaultV2ForceWithdraw",
  "vaultV2ForceRedeem",
  "vaultV1InKindRedeem",
  "vaultV2InKindRedeem",
] as const satisfies readonly OperationType[];

/** Operations acting on one vault (V1 or V2). */
export type VaultOperationType = (typeof VAULT_OPERATION_TYPES)[number];

/** Subject of an operation acting on one Blue market. */
export interface BlueMarketOperationSubject {
  readonly operation: BlueMarketOperationType;
  /** Blue market the operation acts on. */
  readonly marketId: MarketId;
}

/** Subject of a Blue refinance between two markets. */
export interface BlueRefinanceSubject {
  readonly operation: "blueRefinance";
  /** Market the refinance closes. */
  readonly sourceMarketId: MarketId;
  /** Market the refinance opens. */
  readonly targetMarketId: MarketId;
}

/** Subject of a Morpho authorization change. */
export interface BlueAuthorizationSubject {
  readonly operation: "blueAuthorization";
  /** Operator whose Morpho authorization the operation sets. */
  readonly authorized: Address;
}

/** Subject of an operation acting on one vault (V1 or V2). */
export interface VaultOperationSubject {
  readonly operation: VaultOperationType;
  /** Vault the operation acts on. */
  readonly vault: Address;
}

/** Subject of a Vault V1 → V2 migration. */
export interface VaultV1MigrateToV2Subject {
  readonly operation: "vaultV1MigrateToV2";
  /** Vault the migration exits. */
  readonly sourceVault: Address;
  /** Vault the migration enters. */
  readonly targetVault: Address;
}

/** Protocol entity a decoded operation acts on, keyed by `operation`; shared by `SimulatedOperation` and the execution/verification error contexts. */
export type SimulationOperationSubject =
  | BlueMarketOperationSubject
  | BlueRefinanceSubject
  | BlueAuthorizationSubject
  | VaultOperationSubject
  | VaultV1MigrateToV2Subject;

/** Caller-quoted net amounts in raw units over the whole bundle.
 * Supply at least one amount. Unquoted amounts are not checked.
 */
export interface SlippageQuote {
  /**
   * Expected net assets credited to the receiver. For in-kind vault redemptions,
   * this measures only the wallet balance of the vault asset, not Morpho positions.
   */
  readonly assetsReceived?: bigint;
  /**
   * Expected net shares added to the position. For debt shares, this is a
   * maximum: minting more debt shares than quoted is adverse.
   */
  readonly sharesMinted?: bigint;
  /** Expected net assets debited from the sender. */
  readonly assetsPaid?: bigint;
  /**
   * Expected net shares removed from the position. For debt shares, this is a
   * minimum: burning fewer debt shares than quoted is adverse.
   */
  readonly sharesBurned?: bigint;
}

/** Caller quote and permitted adverse percentage deviation. */
export interface SlippageLimits {
  readonly quote: SlippageQuote;
  /** WAD-scaled fraction from 0 to 1e18 inclusive; 1e16 means 1%. No default. */
  readonly slippageTolerance: bigint;
}

/** Caller-selected action and subject with the same quote/tolerance shape for every action.
 * Measurements cover the entire bundle for the named subject, never an inferred
 * individual transaction. Use separate simulations for per-transaction bounds.
 */
export type OperationLimit = SlippageLimits & {
  /** Position/share owner; defaults to the transaction sender. */
  readonly account?: Address;
  /**
   * Explicit asset paid; defaults to the action underlying. Use viem's
   * `ethAddress` (`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`) for native ETH;
   * sentinels such as `zeroAddress` are read as ERC-20 tokens.
   */
  readonly assetPaid?: Address;
  /**
   * Explicit asset received; defaults to the action underlying. Use viem's
   * `ethAddress` (`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`) for native ETH;
   * sentinels such as `zeroAddress` are read as ERC-20 tokens.
   */
  readonly assetReceived?: Address;
  /** Asset receiver; defaults to the transaction sender. */
  readonly receiver?: Address;
} & (
    | { readonly type: BlueMarketOperationType; readonly marketId: MarketId }
    | {
        readonly type: "blueRefinance";
        readonly sourceMarketId: MarketId;
        readonly targetMarketId: MarketId;
      }
    | {
        readonly type: VaultOperationType;
        readonly vault: Address;
      }
    | {
        readonly type: "vaultV1MigrateToV2";
        readonly sourceVault: Address;
        readonly targetVault: Address;
      }
  );

/** Optional caller-selected checks. No action discovery or default bounds. */
export interface SimulationLimits {
  readonly operations?: readonly OperationLimit[];
}
