import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";

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
  "midnightSupplyCollateral",
  "midnightSupplyBlueMakeLend",
  "midnightRedeem",
  "midnightTakeLend",
  "midnightTakeBorrow",
  "midnightTakeWithdraw",
  "midnightSupplyCollateralTakeBorrow",
  "midnightRepayWithdrawCollateral",
  "midnightTakeRepayWithdrawCollateral",
] as const;

/** Discriminator for operations and their limits. */
export type OperationType = (typeof OPERATION_TYPES)[number];

/** Readonly ABI struct returned by `Midnight.toMarket`. */
export interface MidnightMarketStruct {
  /** Chain id used to derive the Midnight market id. */
  readonly chainId: bigint;
  /** Midnight contract address for the market. */
  readonly midnight: Address;
  /** Market loan token. */
  readonly loanToken: Address;
  /** Collateral tokens and their liquidation parameters. */
  readonly collateralParams: readonly {
    /** Collateral token address. */
    readonly token: Address;
    /** Loan-to-value ratio in WAD. */
    readonly lltv: bigint;
    /** Liquidation cursor in WAD. */
    readonly liquidationCursor: bigint;
    /** Oracle address. */
    readonly oracle: Address;
  }[];
  /** Market maturity timestamp. */
  readonly maturity: bigint;
  /** Recovery close factor threshold. */
  readonly rcfThreshold: bigint;
  /** Gate for entering the market. */
  readonly enterGate: Address;
  /** Gate for liquidation. */
  readonly liquidatorGate: Address;
}

/** Collateral amount keyed by a Midnight market collateral index. */
export interface MidnightCollateralAmount {
  readonly collateralIndex: bigint;
  readonly assets: bigint;
}

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

/** Subject of a direct Midnight collateral supply: one collateral slot of one Midnight market. */
export interface MidnightCollateralOperationSubject {
  readonly operation: "midnightSupplyCollateral";
  /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`), not a Blue market id. */
  readonly marketId: Hex;
  /** Index of the collateral in the market's `collateralParams`. */
  readonly collateralIndex: bigint;
}

/** Subject of a Midnight maker bundle that parks loan assets on Morpho Blue. */
export interface MidnightBlueParkingSubject {
  readonly operation: "midnightSupplyBlueMakeLend";
  /** Blue loan token used to measure the sender's debit of the parked amount. */
  readonly loanToken: Address;
  /** Blue market the callback supplies into. */
  readonly marketId: MarketId;
  /** Salt used to derive the BlueBuyCallback address. */
  readonly callbackSalt: Hex;
}

/** Subject of a direct Midnight redeem: the account's credit in one Midnight market. */
export interface MidnightRedeemSubject {
  readonly operation: "midnightRedeem";
  /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`), not a Blue market id. */
  readonly marketId: Hex;
}

/** Subject of a Midnight sell (borrow, reduce-only withdraw, or collateral supply and borrow). */
export interface MidnightSellSubject {
  readonly operation:
    | "midnightTakeBorrow"
    | "midnightTakeWithdraw"
    | "midnightSupplyCollateralTakeBorrow";
  /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`), not a Blue market id. */
  readonly marketId: Hex;
}

/** Subject of Midnight debt repayment (direct or through offers) and collateral withdrawal. */
export interface MidnightRepayWithdrawCollateralSubject {
  readonly operation:
    | "midnightRepayWithdrawCollateral"
    | "midnightTakeRepayWithdrawCollateral";
  /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`), not a Blue market id. */
  readonly marketId: Hex;
}

/** Subject of a Midnight buy: one market's account net position. */
export interface MidnightBuySubject {
  readonly operation: "midnightTakeLend";
  /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`). */
  readonly marketId: Hex;
}

/** Protocol entity a limit's operation acts on, keyed by `operation`; used by `SimulatedOperation`. */
export type SimulationOperationSubject =
  | BlueMarketOperationSubject
  | BlueRefinanceSubject
  | VaultOperationSubject
  | VaultV1MigrateToV2Subject
  | MidnightCollateralOperationSubject
  | MidnightBlueParkingSubject
  | MidnightRedeemSubject
  | MidnightBuySubject
  | MidnightSellSubject
  | MidnightRepayWithdrawCollateralSubject;

/** Caller-quoted net amounts in raw units over the whole bundle.
 * Every operation requires its applicable position side. Midnight Blue parking
 * requires `sharesMinted` on the callback's Blue supply position and exact
 * `assetsPaid`. Payout operations require `assetsReceived` (in-kind redeems require
 * `positions` or `assetsReceived` in its place), pay-in operations require
 * `assetsPaid`, and the combined collateral operations add the active-leg rules.
 * The package README's `Limits` section lists the required minimums and caps, and
 * the per-operation table is in `docs/migrations/evm-simulation-v7-to-v8.md`.
 * Only optional extra fields go unchecked when omitted.
 */
export interface SlippageQuote {
  /**
   * Expected net assets credited to the receiver. For in-kind vault redemptions,
   * this measures only the wallet balance of the vault asset; quote `positions`
   * for the delivered Morpho Blue supply shares. A derived same-token combined
   * operation reports the signed net wallet change, including zero or a debit.
   */
  readonly assetsReceived?: bigint;
  /**
   * Expected net shares added to the position. For debt shares, this is a
   * maximum: minting more debt shares than quoted is adverse.
   */
  readonly sharesMinted?: bigint;
  /**
   * Expected net assets debited from the sender. `assetPaid` is rejected for
   * every `midnightTakeLend`, `midnightRepayWithdrawCollateral`,
   * `midnightTakeRepayWithdrawCollateral` and `midnightSupplyBlueMakeLend`
   * limit because the paid token is always the market's loan token. On wNative
   * loan markets, payment counts ETH sent plus the net wNative change.
   */
  readonly assetsPaid?: bigint;
  /**
   * Expected net shares removed from the position. For debt shares, this is a
   * minimum: burning fewer debt shares than quoted is adverse.
   */
  readonly sharesBurned?: bigint;
  /**
   * Expected net collateral added to the position. This is a minimum:
   * supplying less collateral than quoted is adverse. Measurable only on
   * `blueSupplyCollateral` and `blueSupplyCollateralBorrow` (the Blue
   * position's `collateral`) and `midnightSupplyCollateral` (Midnight
   * `collateral(marketId, account, collateralIndex)`).
   */
  readonly collateralSupplied?: bigint;
  /**
   * Expected net collateral removed from the Blue position. This is a maximum:
   * withdrawing more collateral than quoted is adverse. Measurable only on
   * `blueWithdrawCollateral` and `blueRepayWithdrawCollateral`.
   */
  readonly collateralWithdrawn?: bigint;
  /**
   * `midnightRedeem` and `midnightTakeWithdraw` only: expected net Midnight
   * credit units removed from the account. Credit units are zero-coupon claims
   * on one loan-token asset each, not ERC-20 shares. Both sides of the bundle
   * read `updatePositionView(market, id, account)` in the simulated block, so
   * continuous fees and realized losses accrued since the position's last update
   * are applied before the change is measured. This is a maximum: removing more
   * credit than quoted is adverse.
   */
  readonly creditRedeemed?: bigint;
  /**
   * `midnightTakeBorrow` and `midnightSupplyCollateralTakeBorrow` only:
   * expected drop in the account's net Midnight
   * position (credit minus debt), in units. Credit is read with
   * `updatePositionView(market, id, account)` and debt with `debt(id, account)`
   * in the simulated block on both sides. This is a maximum: selling more units
   * than quoted is adverse.
   */
  readonly unitsSold?: bigint;
  /**
   * `midnightTakeLend` only: expected increase in the account's net Midnight
   * position (credit minus debt), in units. Credit and debt are read in the
   * simulated block on both sides. This is a minimum: buying fewer units than
   * quoted is adverse.
   */
  readonly unitsBought?: bigint;
  /**
   * `midnightRepayWithdrawCollateral` and `midnightTakeRepayWithdrawCollateral` only: expected net Midnight debt units
   * removed from the account (`debt` before minus after the whole bundle).
   * This is a minimum: repaying less than quoted is adverse.
   */
  readonly debtRepaid?: bigint;
  /**
   * `midnightRepayWithdrawCollateral` and `midnightTakeRepayWithdrawCollateral` only: expected collateral removed from
   * the Midnight position and delivered to `receiver` for each collateral index.
   */
  readonly collateralWithdrawals?: readonly MidnightCollateralAmount[];
  /**
   * `midnightSupplyCollateralTakeBorrow` only: the exact collateral supplied
   * and exact minimum collateral credited to the account at each index.
   * Percentage tolerance does not widen this amount. Each entry is checked
   * independently against the Midnight collateral-slot delta and also sets
   * the sender's exact pull cap for that token.
   */
  readonly collateralSupplies?: readonly MidnightCollateralAmount[];
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
  creditRedeemed: { output: false },
  unitsSold: { output: false },
  unitsBought: { output: true },
  debtRepaid: { output: true },
} as const satisfies Partial<
  Record<keyof SlippageQuote, { readonly output: boolean }>
>;

/** Scalar amount fields identified by the per-side `fieldChecks` report. */
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

/** Absolute bound on the subject's Midnight credit after the whole bundle. */
export interface MidnightPositionBounds {
  /**
   * Maximum allowed credit units, inclusive, read with `updatePositionView`
   * after the bundle. `0n` requires the redeem to close the position.
   */
  readonly maxCredit: bigint;
}

/** Absolute bounds on a Midnight debt position after the whole bundle. */
export interface MidnightDebtPositionBounds {
  /** Maximum allowed debt, inclusive. `0n` requires the bundle to close the debt. */
  readonly maxDebt?: bigint;
  /** Maximum collateral remaining at each index, inclusive. `assets: 0n` requires it emptied. */
  readonly maxCollateral?: readonly MidnightCollateralAmount[];
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
   * Optional absolute bounds on the subject's position after the whole
   * bundle, compared inclusively and not scaled by `slippageTolerance`. Blue
   * operations use `BluePositionBounds`; `midnightRedeem` uses
   * `MidnightPositionBounds`; `midnightRepayWithdrawCollateral` and its take
   * variant use `MidnightDebtPositionBounds`. For `blueRefinance`, bounds
   * apply to the target market, where the debt lands. Midnight bounds allow
   * zero to require a position to be closed or collateral index emptied.
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
  "slippageTolerance" | "position"
> & {
  /** Percentage tolerance applied only to explicitly quoted sides. */
  readonly slippageTolerance: bigint;
  /** Blue bounds, `maxCredit` alone on `midnightRedeem`, or debt and collateral bounds on `midnightRepayWithdrawCollateral` and `midnightTakeRepayWithdrawCollateral`. */
  readonly position?: BluePositionBounds &
    Partial<MidnightPositionBounds> &
    MidnightDebtPositionBounds;
  /**
   * Input-based scalar checks: `exact` requires equality; `minimum` and
   * `maximum` are zero-tolerance derived bounds. `quoted` uses
   * `slippageTolerance`. Absent for quote-only operations.
   */
  readonly fieldChecks?: Readonly<
    Partial<
      Record<ScalarQuoteField, "exact" | "minimum" | "maximum" | "quoted">
    >
  >;
};

/** An operation limit as checked, with per-side checks and the quoted-side tolerance resolved. */
export type CheckedOperationLimit = OperationLimit & CheckedSlippageLimits;

/** An input-based operation with its derived quote and per-side checks resolved. */
export type CheckedInputOperationLimit = InputOperationLimit &
  CheckedSlippageLimits;

/** Checked limits for requests that may contain input-based operations. */
export interface CheckedSimulationInputLimits {
  readonly operations: readonly (
    | CheckedOperationLimit
    | CheckedInputOperationLimit
  )[];
}

/** The limits a simulation checked, as reported in `SimulationVerification.limits`. */
export interface CheckedSimulationLimits {
  readonly operations: readonly CheckedOperationLimit[];
}

/** Midnight operation limits that accept a supplied market struct. @internal */
export const MIDNIGHT_MARKET_INPUT_OPERATION_TYPES = [
  "midnightSupplyCollateral",
  "midnightTakeLend",
  "midnightTakeBorrow",
  "midnightSupplyCollateralTakeBorrow",
] as const satisfies readonly OperationType[];

/** Caller-selected action and subject with the same quote/tolerance shape for every action.
 * Prefer `InputOperationLimit` for types covered by `OperationInputs`. Quotes
 * remain required for refinance, in-kind redeems, force exits and Midnight
 * operations.
 * Measurements cover the entire bundle for the named subject, never an inferred
 * individual transaction. Use separate simulations for per-transaction bounds.
 */
export type OperationLimit = SlippageLimits & {
  readonly inputs?: never;
  readonly referralFee?: never;
  readonly reallocationPenalty?: never;
  /**
   * Position/share owner when supported; defaults to the transaction sender.
   * Midnight sell, takeLend, and repay-withdraw limits always measure the
   * sender and reject any explicit `account`.
   */
  readonly account?: Address;
  /**
   * Explicit asset paid; defaults to the action underlying. For
   * `midnightSupplyCollateral` with a supplied `market`, omit this override or
   * set it to `market.collateralParams[collateralIndex].token`; otherwise
   * `simulate()` throws `SlippageCheckUnavailableError`. In other cases, the
   * quote-only override is trusted as given and never checked against the subject's
   * token: a wrong address measures a token the bundle does not move, so the
   * required caps pass vacuously. Omit it unless native ETH is paid, in which
   * case use viem's `ethAddress`
   * (`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`); sentinels such as
   * `zeroAddress` are read as ERC-20 tokens.
   * Typed-input limits require the canonical subject token, or this native
   * alias when the subject token is the chain's registered wNative. Native
   * input measurements include ETH plus net wNative wallet changes.
   * Typed sender-side wNative measurements also include native value sent by
   * the request without an explicit alias.
   * For a first `midnightSupplyCollateral` into a market not yet created at the
   * state block, pass its market struct via `market` on the operation limit, or
   * set this to `collateralParams[collateralIndex].token`.
   * `midnightTakeLend`, `midnightRepayWithdrawCollateral`,
   * `midnightTakeRepayWithdrawCollateral`, and `midnightSupplyBlueMakeLend`
   * reject `assetPaid` because they measure the market's loan token; on
   * wNative loan markets, payment counts ETH sent plus the net wNative change.
   */
  readonly assetPaid?: Address;
  /**
   * Explicit asset received; defaults to the action underlying. The override
   * is trusted in quote-only limits and never checked against the subject's token: a
   * token the bundle does not move fails the required minimums, but a token
   * the account also receives from another call in the bundle can satisfy
   * them without the operation paying out. Omit it unless native ETH is
   * received, in which case use viem's `ethAddress`
   * (`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`); sentinels such as
   * `zeroAddress` are read as ERC-20 tokens. Typed-input limits require the
   * canonical subject token, or its registered native alias, measured as ETH
   * plus net wNative wallet changes.
   * For typed sender-side wNative measurements, native value sent by the
   * request is included even without an alias.
   */
  readonly assetReceived?: Address;
  /** Asset receiver; defaults to the transaction sender. */
  readonly receiver?: Address;
} & (
    | {
        readonly type: BlueMarketOperationType;
        readonly marketId: MarketId;
      }
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
    | {
        readonly type: "midnightSupplyCollateral";
        /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`). */
        readonly marketId: Hex;
        /**
         * `Midnight.toMarket` struct for a market this bundle creates on first
         * use. Its id must equal `marketId`.
         */
        readonly market?: MidnightMarketStruct;
        /** Index of the supplied collateral in the market's `collateralParams`. */
        readonly collateralIndex: bigint;
      }
    | {
        /**
         * Limit for Midnight `supplyBlueMakeLend`: checks both the sender's
         * exact debit of the parked amount and the BlueBuyCallback's supply
         * shares over the whole bundle. For wNative loan tokens, the debit
         * measurement adds ETH sent to the net wNative balance change, so the
         * quote remains the full parked amount. `slippageTolerance` does not
         * widen the `assetsPaid` equality; it applies to `sharesMinted`.
         * Blue parking combined with collateral supplies is unsupported.
         */
        readonly type: "midnightSupplyBlueMakeLend";
        /** Loan token used to measure the wallet debit. */
        readonly loanToken: Address;
        /** Blue market whose callback supply shares are measured. */
        readonly marketId: MarketId;
        /** Salt used to derive the BlueBuyCallback address. */
        readonly callbackSalt: Hex;
        /** The loan token is measured; `assetPaid` is rejected. */
        readonly assetPaid?: never;
        /** The loan token is measured; `assetReceived` is rejected. */
        readonly assetReceived?: never;
      }
    | {
        readonly type: "midnightRedeem";
        /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`). */
        readonly marketId: Hex;
        /** Bound on the credit left after the bundle; Blue bound fields are rejected. */
        readonly position?: MidnightPositionBounds;
      }
    | {
        readonly type: "midnightTakeBorrow";
        /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`). */
        readonly marketId: Hex;
        /**
         * `Midnight.toMarket` struct for a market this bundle creates on first
         * use. Its id must equal `marketId`.
         */
        readonly market?: MidnightMarketStruct;
        /** Sells always measure the sender; an `account` key is rejected, even when `undefined`. */
        readonly account?: never;
        /** Position bounds are unsupported on sells. */
        readonly position?: never;
      }
    | {
        readonly type: "midnightTakeWithdraw";
        /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`). */
        readonly marketId: Hex;
        /** Sells always measure the sender; an `account` key is rejected, even when `undefined`. */
        readonly account?: never;
        /** Position bounds are unsupported on sells. */
        readonly position?: never;
      }
    | {
        readonly type: "midnightSupplyCollateralTakeBorrow";
        /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`), not a Blue market id. */
        readonly marketId: Hex;
        /**
         * `Midnight.toMarket` struct for a market this bundle creates on first
         * use. Its id must equal `marketId`.
         */
        readonly market?: MidnightMarketStruct;
        /** Sells always measure the sender; an `account` key is rejected, even when `undefined`. */
        readonly account?: never;
        /** Position bounds are unsupported on sells. */
        readonly position?: never;
        /** Pulls are derived from `collateralSupplies`; `assetPaid` is rejected. */
        readonly assetPaid?: never;
        /** Proceeds use the market's loan token; `assetReceived` is rejected. */
        readonly assetReceived?: never;
      }
    | {
        readonly type: "midnightRepayWithdrawCollateral";
        /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`). */
        readonly marketId: Hex;
        /** Repay-withdraw always measures the sender and rejects any explicit `account`. */
        readonly account?: never;
        /** Repayment uses the loan token; `assetPaid` is rejected. */
        readonly assetPaid?: never;
        /** Collateral is measured per index; `assetReceived` is rejected. */
        readonly assetReceived?: never;
        /** Bounds on the debt and collateral left after the bundle; Blue bound fields are rejected. */
        readonly position?: MidnightDebtPositionBounds;
      }
    | {
        readonly type: "midnightTakeRepayWithdrawCollateral";
        /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`). */
        readonly marketId: Hex;
        /** Take repay-withdraw always measures the sender and rejects any explicit `account`. */
        readonly account?: never;
        /** Repayment uses the loan token; `assetPaid` is rejected. */
        readonly assetPaid?: never;
        /** Collateral is measured per index; `assetReceived` is rejected. */
        readonly assetReceived?: never;
        /** Bounds on the debt and collateral left after the bundle; Blue bound fields are rejected. */
        readonly position?: MidnightDebtPositionBounds;
      }
    | {
        readonly type: "midnightTakeLend";
        /** Midnight market id (`MidnightMarketUtils.toId(marketParams)`). */
        readonly marketId: Hex;
        /**
         * `Midnight.toMarket` struct for a market this bundle creates on first
         * use. Its id must equal `marketId`.
         */
        readonly market?: MidnightMarketStruct;
        /** takeLend always measures the sender; `account` is rejected. */
        readonly account?: never;
        /** takeLend pays no external receiver; `receiver` is rejected. */
        readonly receiver?: never;
        /** Payment uses the market's loan token; `assetPaid` is rejected. */
        readonly assetPaid?: never;
        /** `assetReceived` is rejected. */
        readonly assetReceived?: never;
        /** Position bounds are not supported; `position` is rejected. */
        readonly position?: never;
      }
  );

/** User-selected assets or shares, mutually exclusive. */
export type AssetsOrShares =
  | { readonly assets: bigint; readonly shares?: never }
  | { readonly shares: bigint; readonly assets?: never };

/** Repayment by an exact amount, or the owner's entire before-state debt. */
export type RepayInputs = AssetsOrShares | "full";

/** Typed user amounts for operations with pinned-block derivations. */
export interface OperationInputs {
  readonly vaultV1MigrateToV2: AssetsOrShares;
  readonly vaultV1Deposit: { readonly assets: bigint };
  readonly vaultV2Deposit: { readonly assets: bigint };
  readonly vaultV1Withdraw: { readonly assets: bigint };
  readonly vaultV2Withdraw: { readonly assets: bigint };
  readonly vaultV1Redeem: { readonly shares: bigint };
  readonly vaultV2Redeem: { readonly shares: bigint };
  readonly blueSupply: { readonly assets: bigint };
  readonly blueWithdraw: AssetsOrShares;
  readonly blueSupplyCollateral: { readonly assets: bigint };
  readonly blueWithdrawCollateral: { readonly assets: bigint };
  readonly blueBorrow: { readonly assets: bigint };
  readonly blueRepay: RepayInputs;
  readonly blueSupplyCollateralBorrow:
    | { readonly collateralAssets: bigint; readonly borrowAssets?: bigint }
    | { readonly collateralAssets?: bigint; readonly borrowAssets: bigint };
  readonly blueRepayWithdrawCollateral:
    | { readonly repay: RepayInputs; readonly collateralAssets?: bigint }
    | { readonly repay?: RepayInputs; readonly collateralAssets: bigint };
}

/** Input operation types that may declare a reallocation penalty. */
export type ReallocationPenaltyInputType =
  | "blueBorrow"
  | "blueWithdraw"
  | "blueSupplyCollateralBorrow";

/** Input operation types without an integrator-fee-bearing leg. */
export type FeelessInputType =
  | "blueSupplyCollateral"
  | "blueWithdrawCollateral";

/** Operations whose payout may pay an allocator charge. @internal */
export const REALLOCATION_PENALTY_TYPES = [
  "blueBorrow",
  "blueWithdraw",
  "blueSupplyCollateralBorrow",
] as const satisfies readonly ReallocationPenaltyInputType[];

/** Operations without an integrator-fee-bearing leg. @internal */
export const FEELESS_INPUT_TYPES = [
  "blueSupplyCollateral",
  "blueWithdrawCollateral",
] as const satisfies readonly FeelessInputType[];

/** Input-based limits; quote sides override derivations and alone use tolerance. */
export type InputOperationLimit = {
  [T in keyof OperationInputs]: Omit<SlippageLimits, "quote"> &
    Pick<
      OperationLimit,
      "account" | "receiver" | "assetPaid" | "assetReceived"
    > & {
      /** Operation to derive independently from typed amounts and pinned-block state. */
      readonly type: T;
      /** User-selected amounts, independent of the builder and calldata. */
      readonly inputs: OperationInputs[T];
      /** Explicit sides override derivations; only these sides use `slippageTolerance`. */
      readonly quote?: SlippageQuote;
      /** WAD-scaled integrator fee, default zero. Not a user-selected amount. */
      readonly referralFee?: T extends FeelessInputType ? never : bigint;
      /** Declared aggregate allocator charge in loan-token base units, default zero. */
      readonly reallocationPenalty?: T extends ReallocationPenaltyInputType
        ? bigint
        : never;
    } & (T extends "vaultV1MigrateToV2"
      ? {
          /** Vault whose shares are burned. */
          readonly sourceVault: Address;
          /** Vault whose shares are minted. */
          readonly targetVault: Address;
        }
      : T extends BlueMarketOperationType
        ? {
            /** Blue market whose position is checked. */
            readonly marketId: MarketId;
          }
        : {
            /** Vault whose shares are checked. */
            readonly vault: Address;
          });
}[keyof OperationInputs];

/**
 * Caller-selected quote-only checks; use {@link SimulationInputLimits} for
 * typed-input or mixed operations.
 * `operations` must be non-empty. Each operation requires its applicable
 * position and quote sides. `midnightSupplyBlueMakeLend` requires callback-
 * position `sharesMinted` and exact `assetsPaid`; payout operations require
 * `assetsReceived`, pay-in operations require `assetsPaid`, and combined
 * collateral operations require their active-leg sides. The package README's
 * `Limits` section lists the required minimums and caps, and the per-operation
 * table is in `docs/migrations/evm-simulation-v7-to-v8.md`. An omitted
 * `slippageTolerance` defaults to `DEFAULT_SLIPPAGE_TOLERANCE` on explicitly
 * quoted sides only.
 */
export interface SimulationLimits {
  readonly operations: readonly OperationLimit[];
}

/** Caller-selected quoted or input-based operations; input sides derive at the pinned block. */
export interface SimulationInputLimits {
  readonly operations: readonly (OperationLimit | InputOperationLimit)[];
}
