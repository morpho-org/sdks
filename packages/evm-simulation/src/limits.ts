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

/** Protocol entity a limit's operation acts on, keyed by `operation`; used by `SimulatedOperation`. */
export type SimulationOperationSubject =
  | BlueMarketOperationSubject
  | BlueRefinanceSubject
  | VaultOperationSubject
  | VaultV1MigrateToV2Subject;

/** Caller-quoted net amounts in raw units over the whole bundle.
 * In short, every operation requires its position side, payout operations
 * require `assetsReceived` (in-kind redeems require `positions` or
 * `assetsReceived` in its place), pay-in operations require `assetsPaid`, and the
 * combined collateral operations add the active-leg rules. The package
 * README's `Limits` section lists the required minimums and caps, and the
 * per-operation table is in `docs/migrations/evm-simulation-v7-to-v8.md`.
 * Only optional extra fields go unchecked when omitted.
 */
export interface SlippageQuote {
  /**
   * Expected net assets credited to the receiver. For in-kind vault redemptions,
   * this measures only the wallet balance of the vault asset; quote `positions`
   * for the delivered Morpho Blue supply shares.
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
  /**
   * Expected net collateral added to the Blue position. This is a minimum:
   * supplying less collateral than quoted is adverse. Measurable only on
   * `blueSupplyCollateral` and `blueSupplyCollateralBorrow`.
   */
  readonly collateralSupplied?: bigint;
  /**
   * Expected net collateral removed from the Blue position. This is a maximum:
   * withdrawing more collateral than quoted is adverse. Measurable only on
   * `blueWithdrawCollateral` and `blueRepayWithdrawCollateral`.
   */
  readonly collateralWithdrawn?: bigint;
  /**
   * In-kind vault redemptions only: the expected Blue supply shares delivered
   * to the receiver in each market, measured over the whole bundle. Required
   * unless `assetsReceived` is quoted — proceeds can land on Blue supply
   * positions or the wallet — and supplied entries must be a non-empty array
   * with positive `supplyShares`. This is an
   * output, so delivering less than the quote (minus tolerance) is adverse.
   * Quote shares, not assets: convert a preview's delivered assets with the
   * accrued market's `toSupplyShares(assets, "Down")` at the simulated block.
   * Interest accrued between quote and execution lowers the delivered shares.
   */
  readonly positions?: readonly InKindPositionQuote[];
  /**
   * Vault V2 force exits only (`vaultV2ForceWithdraw`, `vaultV2ForceRedeem`):
   * the expected total penalty assets charged to the account across all force
   * deallocations in the bundle. This is a cost, so a higher realized penalty
   * than the quote (plus tolerance) is adverse.
   */
  readonly penalty?: bigint;
  /**
   * Vault V2 force exits only (`vaultV2ForceWithdraw`, `vaultV2ForceRedeem`):
   * the expected assets withdrawn from each Blue market by the force
   * deallocations. Each entry is a cost-side bound: deallocating more than the
   * quote (plus tolerance), or deallocating in a market not listed, is adverse.
   */
  readonly deallocations?: readonly ForceExitDeallocationQuote[];
}

/**
 * Scalar quote fields and their bound direction: `output: true` marks a minimum
 * bound (observed may not fall below the quote), `output: false` a cap. Debt
 * shares flip the direction at each use site. Array and object quote fields
 * (`positions`, `deallocations`, `sharePrice`, `position`) are checked by their
 * own rules and are not scaled here. @internal
 */
export const QUOTE_FIELD_DIRECTION = {
  assetsReceived: { output: true },
  assetsPaid: { output: false },
  sharesMinted: { output: true },
  sharesBurned: { output: false },
  collateralSupplied: { output: true },
  collateralWithdrawn: { output: false },
} as const satisfies Partial<
  Record<keyof SlippageQuote, { readonly output: boolean }>
>;

/** The scalar quote fields {@link QUOTE_FIELD_DIRECTION} scales. @internal */
export type ScalarQuoteField = keyof typeof QUOTE_FIELD_DIRECTION;

/**
 * The cap an inactive combined-op leg quotes: `0` is rejected, so `1n` marks
 * "this leg is not used".
 * @internal
 */
export const INACTIVE_LEG_CAP = 1n;

/** One Blue market's expected delivered supply shares in an in-kind vault redemption. */
export interface InKindPositionQuote {
  /** Blue market the position is delivered in. */
  readonly marketId: MarketId;
  /** Expected supply shares delivered to the receiver. */
  readonly supplyShares: bigint;
}

/** One Blue market's expected deallocated assets in a Vault V2 force exit. */
export interface ForceExitDeallocationQuote {
  /** Blue market the assets are deallocated from. */
  readonly marketId: MarketId;
  /** Expected assets deallocated from the market. */
  readonly assets: bigint;
}

/** Bound on the realized conversion rate between two quoted amounts. */
export interface SharePriceLimit {
  /**
   * Expected RAY-scaled assets per share: raw assets per raw share × 1e27, the
   * scaling VaultBundlesV1 `maxSharePrice` and VaultExitBundlesV1
   * `minSharePriceE27` use. The realized rate is measured on what moves in and
   * out of the wallet. Referral fees, a flat share of the amount on every
   * route that takes `referralFeePct`, must be folded into `expected`:
   * `price * WAD / (WAD - feePct)` when a higher price is adverse (deposits,
   * supply, repays), `price * (WAD - feePct) / WAD` when a lower one is
   * (withdrawals, redeems, force exits, borrows). A force exit's
   * `minSharePriceE27` already nets the force-deallocation penalty — only its
   * referral fee is deducted after the check, so it needs only the
   * referral-fee adjustment; never apply the percentage formula to a penalty.
   * For any other charge that isn't a flat share of the amount, derive
   * `expected` from the quoted delivered amount (e.g.
   * `previewVaultV2ForceWithdraw`) instead of a percentage.
   */
  readonly expected: bigint;
  /** WAD-scaled fraction from 0 to 1e18 inclusive; 1e16 means 1%. No default. */
  readonly tolerance: bigint;
}

/** Absolute bounds on the subject's Blue position after the whole bundle. */
export interface BluePositionBounds {
  /** Maximum allowed `borrowShares`, inclusive. */
  readonly maxBorrowShares?: bigint;
  /** Minimum allowed `supplyShares`, inclusive. */
  readonly minSupplyShares?: bigint;
  /** Minimum allowed `collateral`, inclusive. */
  readonly minCollateral?: bigint;
}

/** Caller quote and permitted adverse percentage deviation. */
export interface SlippageLimits {
  readonly quote: SlippageQuote;
  /**
   * WAD-scaled fraction strictly below 1e18; 1e16 means 1%. Defaults to
   * blue-sdk's `DEFAULT_SLIPPAGE_TOLERANCE` (3e14, 0.03%).
   */
  readonly slippageTolerance?: bigint;
  /**
   * Optional bound on the realized assets-per-share rate, computed from the two
   * quoted amounts the operation prices. Both amounts of the priced pair must be
   * quoted in `quote`; the adverse direction depends on the operation type.
   */
  readonly sharePrice?: SharePriceLimit;
  /**
   * Optional absolute bounds on the subject's Blue position after the whole
   * bundle, compared inclusively. These are final values, not deltas, and are
   * not scaled by `slippageTolerance`. For `blueRefinance` the bounds apply to
   * the target market, where the debt lands. Blue operations only.
   */
  readonly position?: BluePositionBounds;
}

/**
 * The limits actually checked, with the tolerance that was applied (defaults
 * resolved) and the caller's optional `sharePrice`/`position` bounds carried
 * through. Returned in the verification result.
 */
export type CheckedSlippageLimits = Omit<
  SlippageLimits,
  "slippageTolerance"
> & {
  readonly slippageTolerance: bigint;
};

/** An operation limit as checked: `slippageTolerance` holds the applied value (defaults resolved). */
export type CheckedOperationLimit = OperationLimit & {
  readonly slippageTolerance: bigint;
};

/** The limits a simulation checked, as reported in `SimulationVerification.limits`. */
export interface CheckedSimulationLimits {
  readonly operations: readonly CheckedOperationLimit[];
}

/** Caller-selected action and subject with the same quote/tolerance shape for every action.
 * Measurements cover the entire bundle for the named subject, never an inferred
 * individual transaction. Use separate simulations for per-transaction bounds.
 */
export type OperationLimit = SlippageLimits & {
  /** Position/share owner; defaults to the transaction sender. */
  readonly account?: Address;
  /**
   * Explicit asset paid; defaults to the action underlying. The override is
   * trusted as given and never checked against the subject's token: a wrong
   * address measures a token the bundle does not move, so the required caps
   * pass vacuously. Omit it unless native ETH is paid, in which case use
   * viem's `ethAddress` (`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`);
   * sentinels such as `zeroAddress` are read as ERC-20 tokens.
   */
  readonly assetPaid?: Address;
  /**
   * Explicit asset received; defaults to the action underlying. The override
   * is trusted as given and never checked against the subject's token: a
   * token the bundle does not move fails the required minimums, but a token
   * the account also receives from another call in the bundle can satisfy
   * them without the operation paying out. Omit it unless native ETH is
   * received, in which case use viem's `ethAddress`
   * (`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`); sentinels such as
   * `zeroAddress` are read as ERC-20 tokens.
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

/**
 * Caller-selected checks. No action discovery or inferred quote amounts;
 * `operations` must be non-empty. Each operation requires its position side,
 * payout operations `assetsReceived`, pay-in operations `assetsPaid`, and the
 * combined collateral operations their active-leg sides — the package README's
 * `Limits` section lists the required minimums and caps, and the per-operation
 * table is in `docs/migrations/evm-simulation-v7-to-v8.md`. An
 * omitted `slippageTolerance` defaults to `DEFAULT_SLIPPAGE_TOLERANCE`.
 */
export interface SimulationLimits {
  readonly operations: readonly OperationLimit[];
}
