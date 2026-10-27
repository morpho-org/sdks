import { type MarketId, MarketUtils, MathLib } from "@morpho-org/blue-sdk";
import type { TransactionAction } from "@morpho-org/morpho-sdk";
import { MarketUtils as MidnightMarketUtils } from "@morpho-org/morpho-sdk/midnight/utils";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, ethAddress, isAddressEqual, maxUint256 } from "viem";
import {
  AmbiguousExpectedQuoteError,
  LimitAccountMismatchError,
  MissingExpectedQuoteError,
  SimulationValidationError,
  UnsupportedLimitActionError,
} from "../errors.js";
import type {
  MidnightCollateralAmount,
  MidnightDebtPositionBounds,
  MidnightMarketStruct,
  OperationLimit,
  OperationType,
  ScalarQuoteField,
  SimulationLimits,
  SlippageQuote,
} from "../limits.js";
import {
  INACTIVE_LEG_CAP,
  MIDNIGHT_MARKET_INPUT_OPERATION_TYPES,
  QUOTE_FIELD_DIRECTION,
} from "../limits.js";
import {
  conditionalQuoteViolations,
  missingInKindProceeds,
  requiredQuoteGroups,
} from "../simulate/request/parse-request.js";

type QuoteField = ScalarQuoteField;

const QUOTE_FIELDS = Object.keys(
  QUOTE_FIELD_DIRECTION,
) as readonly QuoteField[];

type DerivedQuote = { readonly [K in QuoteField]?: bigint };

const isPositive = (amount: bigint | undefined): amount is bigint =>
  amount !== undefined && amount > 0n;

type DerivedLimit = {
  readonly type: OperationType;
  readonly quote: DerivedQuote;
  readonly assetPaid?: Address;
  /** Fields `expected` must carry because the args can't quote them. */
  readonly requiredExpected: readonly QuoteField[];
  readonly position?: MidnightDebtPositionBounds;
  readonly collateralWithdrawals?: readonly {
    readonly collateralIndex: bigint;
    readonly assets?: bigint;
  }[];
  readonly collateralSupplies?: readonly MidnightCollateralAmount[];
};

/**
 * Derives the quote fields an action's args fix, before `expected` overrides.
 * Returns `undefined` when the action type has no {@link OperationType}.
 * Kept apart from `toSimulationLimits` despite one call site: it is the
 * per-action derivation table, and its early returns would not survive inlining.
 */
const deriveQuote = (action: TransactionAction): DerivedLimit | undefined => {
  const nativeAssetPaid =
    "nativeAmount" in action.args && isPositive(action.args.nativeAmount)
      ? ethAddress
      : undefined;
  switch (action.type) {
    case "vaultV1Deposit":
    case "vaultV2Deposit": {
      const { amount, netAssets, maxSharePrice } = action.args;
      return {
        type: action.type,
        requiredExpected: [],
        assetPaid: nativeAssetPaid,
        quote: {
          assetsPaid: amount,
          sharesMinted:
            isPositive(netAssets) && isPositive(maxSharePrice)
              ? MathLib.mulDivDown(netAssets, MathLib.RAY, maxSharePrice)
              : undefined,
        },
      };
    }
    case "vaultV1Withdraw":
    case "vaultV2Withdraw":
      return {
        type: action.type,
        requiredExpected: [],
        quote: { assetsReceived: action.args.netAssets },
      };
    case "vaultV1Redeem":
    case "vaultV2Redeem":
      return {
        type: action.type,
        requiredExpected: [],
        quote: { sharesBurned: action.args.shares },
      };
    case "vaultV2ForceWithdraw": {
      const { exitAssets, minSharePriceE27 } = action.args;
      return {
        type: action.type,
        requiredExpected: [],
        quote: {
          // The contract requires withdrawn * 1e27 / sharesBurnt >= minSharePriceE27,
          // so the burn is capped at ceil(exitAssets * RAY / minSharePriceE27).
          sharesBurned: isPositive(minSharePriceE27)
            ? MathLib.mulDivUp(exitAssets, MathLib.RAY, minSharePriceE27)
            : undefined,
        },
      };
    }
    case "vaultV2ForceRedeem":
      // `forceDeallocate` burns penalty shares from `onBehalf` on top of the
      // redeemed shares, so the total burn is not derivable from `redeem.shares`
      // — `expected.sharesBurned` must carry it.
      return { type: action.type, requiredExpected: [], quote: {} };
    case "vaultV1InKindRedeem":
    case "vaultV2InKindRedeem":
      // `amount` is `exitAssets` (asset-denominated); `sharesBurned` and the
      // in-kind proceeds are not derivable, so `expected.sharesBurned` plus either
      // `expected.positions` or `expected.assetsReceived` must be supplied —
      // `toSimulationLimits` enforces this below.
      return { type: action.type, requiredExpected: [], quote: {} };
    case "vaultV1MigrateToV2": {
      const { shares, netAssets, maxSharePriceVaultV2 } = action.args;
      return {
        type: action.type,
        requiredExpected: [],
        quote: {
          sharesBurned: shares,
          sharesMinted:
            isPositive(netAssets) && isPositive(maxSharePriceVaultV2)
              ? MathLib.mulDivDown(netAssets, MathLib.RAY, maxSharePriceVaultV2)
              : undefined,
        },
      };
    }
    case "blueSupply":
      // `assets` is the gross funded amount; the referral fee is deducted inside
      // it, so the user's payment is `assets` in full.
      return {
        type: action.type,
        requiredExpected: [],
        assetPaid: nativeAssetPaid,
        quote: { assetsPaid: action.args.assets },
      };
    case "blueWithdraw": {
      const {
        withdrawAssets,
        withdrawShares,
        reallocationPenaltyAssets,
        referralFeeAssets,
      } = action.args;
      return {
        type: action.type,
        requiredExpected: [],
        quote: {
          sharesBurned: isPositive(withdrawShares) ? withdrawShares : undefined,
          assetsReceived: isPositive(withdrawAssets)
            ? withdrawAssets -
              reallocationPenaltyAssets -
              (referralFeeAssets ?? 0n)
            : undefined,
        },
      };
    }
    case "blueSupplyCollateral":
    case "blueBorrow":
    case "blueSupplyCollateralBorrow": {
      const {
        collateralAssets,
        borrowAssets,
        reallocationPenaltyAssets,
        referralFeeAssets,
      } = action.args;
      const received = isPositive(borrowAssets)
        ? borrowAssets - reallocationPenaltyAssets - (referralFeeAssets ?? 0n)
        : undefined;
      // Both legs active: on a same-token market the borrow payout nets
      // against the collateral pay-in in the wallet, so the args cannot quote
      // the net wallet gain — `expected.assetsReceived` must carry it.
      const bothLegsActive =
        action.type === "blueSupplyCollateralBorrow" &&
        isPositive(collateralAssets) &&
        isPositive(borrowAssets);
      return {
        type: action.type,
        requiredExpected: bothLegsActive ? ["assetsReceived"] : [],
        assetPaid: nativeAssetPaid,
        quote: {
          // On a combined use without a collateral leg the required pay-in cap
          // cannot be zero, so the helper emits the minimal positive cap.
          assetsPaid: isPositive(collateralAssets)
            ? collateralAssets
            : action.type === "blueSupplyCollateralBorrow"
              ? INACTIVE_LEG_CAP
              : undefined,
          collateralSupplied: collateralAssets,
          assetsReceived: bothLegsActive
            ? undefined
            : isPositive(received)
              ? received
              : undefined,
          // On a collateral-only combined use the required debt-share cap cannot
          // be zero, so the helper emits the minimal positive cap instead.
          ...(action.type === "blueSupplyCollateralBorrow"
            ? {
                sharesMinted: isPositive(borrowAssets)
                  ? undefined
                  : INACTIVE_LEG_CAP,
              }
            : {}),
        },
      };
    }
    case "blueRepay":
    case "blueWithdrawCollateral":
    case "blueRepayWithdrawCollateral": {
      const {
        repayAssets,
        repayShares,
        maxRepayAssets,
        collateralAssets,
        referralFeeAssets,
      } = action.args;
      const byShares = isPositive(repayShares);
      // The full-repay sentinel (`maxUint256`) resolves to the position's live
      // borrow shares at execution, so `sharesBurned` is not derivable from it
      // — `expected.sharesBurned` must carry the quote.
      const derivableShares =
        byShares && repayShares !== maxUint256 ? repayShares : undefined;
      const withCollateral = action.type !== "blueRepay";
      const bothLegsActive =
        action.type === "blueRepayWithdrawCollateral" &&
        (isPositive(repayAssets) || isPositive(repayShares)) &&
        isPositive(collateralAssets);
      const assetsPaid = byShares
        ? maxRepayAssets
        : repayAssets + (referralFeeAssets ?? 0n);
      // BlueBundlesV1 repays before refunding: the native surplus
      // (`maxRepayAssets - repayAssets - fee`) is reimbursed in ETH through the
      // bundle's native unwrap path (BlueBundlesV1.sol `pullOrWrapNative` /
      // remainder reimbursement), so the `repayAssets + referralFeeAssets` cap
      // is not understated by a native assets-mode repay.
      return {
        type: action.type,
        requiredExpected: [
          ...(action.type === "blueRepayWithdrawCollateral" &&
          (repayShares === maxUint256 || isPositive(repayAssets))
            ? (["sharesBurned"] as const)
            : []),
          ...(bothLegsActive ? (["assetsReceived"] as const) : []),
        ],
        assetPaid: nativeAssetPaid,
        quote: {
          // By assets, the user pays exactly repayAssets plus the on-top referral
          // fee; by shares, the funding cap is `maxRepayAssets`. On a
          // withdraw-only combined use the required pay-in cap cannot be zero,
          // so the helper emits the minimal positive cap.
          assetsPaid:
            isPositive(assetsPaid) ||
            action.type !== "blueRepayWithdrawCollateral"
              ? assetsPaid
              : INACTIVE_LEG_CAP,
          sharesBurned: derivableShares,
          ...(withCollateral
            ? {
                // On a repay-only combined use the required collateral cap cannot
                // be zero, so the helper emits the minimal positive cap instead.
                collateralWithdrawn: isPositive(collateralAssets)
                  ? collateralAssets
                  : action.type === "blueRepayWithdrawCollateral"
                    ? INACTIVE_LEG_CAP
                    : undefined,
                // Both legs active: on a same-token market the collateral
                // payout nets against the repay pay-in in the wallet, so the
                // args cannot quote the net wallet gain —
                // `expected.assetsReceived` must carry it.
                assetsReceived: bothLegsActive
                  ? undefined
                  : isPositive(collateralAssets)
                    ? collateralAssets
                    : undefined,
              }
            : {}),
        },
      };
    }
    case "midnightSupplyCollateral":
      // Midnight pulls exactly `assets` from msg.sender and credits them to
      // `onBehalf`'s collateral at `collateralIndex`.
      return {
        type: action.type,
        requiredExpected: [],
        quote: {
          assetsPaid: action.args.assets,
          collateralSupplied: action.args.assets,
        },
      };
    case "midnightCancelAndMake": {
      const blueSupply = action.args.blueSupply;
      if (blueSupply === undefined) return undefined;
      if (action.args.collateralSupplies.length > 0)
        throw new UnsupportedLimitActionError(action.type);
      return {
        type: "midnightSupplyBlueMakeLend",
        requiredExpected: ["sharesMinted"],
        quote: { assetsPaid: blueSupply.assets },
      };
    }
    case "midnightRedeem":
      // Midnight removes exactly `units` of `onBehalf`'s accrued credit and
      // transfers exactly `units` loan tokens to `receiver`.
      return {
        type: action.type,
        requiredExpected: [],
        quote: {
          assetsReceived: action.args.units,
          creditRedeemed: action.args.units,
        },
      };
    case "midnightTakeLend": {
      const { target } = action.args;
      const cap =
        target.type === "assets" ? target.assets : target.maxBuyerAssets;
      return {
        type: action.type,
        requiredExpected: [],
        quote: {
          assetsPaid: cap,
          unitsBought:
            target.type === "assets" ? target.minUnits : target.units,
        },
      };
    }
    case "midnightTakeBorrow":
    case "midnightTakeWithdraw": {
      const { target } = action.args;
      const positionAmount =
        target.type === "assets" ? target.maxUnits : target.units;
      const assetsReceived =
        target.type === "assets" ? target.assets : target.minSellerAssets;
      return {
        type: action.type,
        requiredExpected: [],
        quote: {
          // Both target bounds already express receiver proceeds after fees.
          assetsReceived,
          ...(action.type === "midnightTakeBorrow"
            ? { unitsSold: positionAmount }
            : { creditRedeemed: positionAmount }),
        },
      };
    }
    case "midnightSupplyCollateralTakeBorrow": {
      const supplied = new Map<bigint, bigint>();
      for (const { collateralIndex, assets } of action.args.collateralSupplies)
        supplied.set(
          collateralIndex,
          (supplied.get(collateralIndex) ?? 0n) + assets,
        );
      const { target } = action.args;
      return {
        type: action.type,
        requiredExpected: [],
        collateralSupplies: [...supplied].map(([collateralIndex, assets]) => ({
          collateralIndex,
          assets,
        })),
        quote: {
          assetsReceived:
            target.type === "assets" ? target.assets : target.minSellerAssets,
          unitsSold: target.type === "assets" ? target.maxUnits : target.units,
        },
      };
    }
    case "midnightRepayWithdrawCollateral":
    case "midnightTakeRepayWithdrawCollateral": {
      // A take repay buys back debt units through offers and, when
      // `repayEnabled`, repays the rest directly; either way the bundle pays
      // at most the target's fee-inclusive assets and repays at least its units.
      const repay =
        action.type === "midnightRepayWithdrawCollateral"
          ? action.args.repay
          : action.args.target.type === "assets"
            ? {
                type: "assets" as const,
                assets: action.args.target.assets,
                units: action.args.target.minUnits,
              }
            : action.args.target.units === maxUint256
              ? {
                  type: "full" as const,
                  maxBuyerAssets: action.args.target.maxBuyerAssets,
                }
              : {
                  type: "assets" as const,
                  assets: action.args.target.maxBuyerAssets,
                  units: action.args.target.units,
                };
      const finite = new Map<bigint, bigint>();
      const all = new Set<bigint>();
      const unlimited = new Set<bigint>();
      for (const { collateralIndex, assets } of action.args
        .collateralWithdrawals) {
        all.add(collateralIndex);
        if (assets === maxUint256) unlimited.add(collateralIndex);
        else
          finite.set(
            collateralIndex,
            (finite.get(collateralIndex) ?? 0n) + assets,
          );
      }
      return {
        type: action.type,
        requiredExpected: [],
        quote:
          repay.type === "assets" && repay.assets > 0n
            ? {
                assetsPaid: repay.assets,
                debtRepaid: "units" in repay ? repay.units : repay.assets,
              }
            : repay.type === "full"
              ? { assetsPaid: repay.maxBuyerAssets }
              : {},
        ...(repay.type === "full" || unlimited.size > 0
          ? {
              position: {
                ...(repay.type === "full" ? { maxDebt: 0n } : {}),
                ...(unlimited.size === 0
                  ? {}
                  : {
                      maxCollateral: [...unlimited].map((collateralIndex) => ({
                        collateralIndex,
                        assets: 0n,
                      })),
                    }),
              },
            }
          : {}),
        collateralWithdrawals: [...all].map((collateralIndex) => ({
          collateralIndex,
          ...(unlimited.has(collateralIndex)
            ? {}
            : { assets: finite.get(collateralIndex) ?? 0n }),
        })),
      };
    }
    case "blueRefinance":
      // No side is derivable: the debt moved, the source penalty and the
      // destination fee are all execution-resolved. Every quoted side comes
      // from `expected`.
      return { type: action.type, requiredExpected: [], quote: {} };
    default:
      return undefined;
  }
};

/** What the caller should compute and pass via `expected` when a quote field is missing. */
const FIELD_HINTS: Record<
  QuoteField | "positions" | "collateralWithdrawals",
  string
> = {
  assetsReceived:
    "compute the net wallet gain in the received token (on a same-token market, the payout minus the other leg) and pass it via expected.assetsReceived",
  assetsPaid: "compute the funded amount and pass it via expected.assetsPaid",
  sharesMinted:
    "compute the shares minted and pass it via expected.sharesMinted",
  sharesBurned:
    "compute the shares burned and pass it via expected.sharesBurned",
  collateralSupplied:
    "compute the collateral supplied and pass it via expected.collateralSupplied",
  collateralWithdrawn:
    "compute the collateral withdrawn and pass it via expected.collateralWithdrawn",
  creditRedeemed:
    "compute the Midnight credit units redeemed and pass it via expected.creditRedeemed",
  debtRepaid:
    "compute the Midnight debt units repaid and pass it via expected.debtRepaid",
  unitsSold:
    "compute the net Midnight position reduction and pass it via expected.unitsSold",
  unitsBought:
    "compute the net Midnight position increase and pass it via expected.unitsBought",
  positions:
    "compute the Blue supply shares delivered per market and pass them via expected.positions, or pass the wallet payout of an idle-only redeem via expected.assetsReceived",
  collateralWithdrawals:
    "pass expected.collateralWithdrawals with the delivered amount for the collateral index",
};

const missingQuote = (
  actionType: string,
  field: QuoteField | "positions" | "collateralWithdrawals",
): MissingExpectedQuoteError =>
  new MissingExpectedQuoteError({
    actionType,
    field,
    expectedHint:
      actionType === "midnightCancelAndMake" && field === "sharesMinted"
        ? "quote the BlueBuyCallback's expected Blue supply shares (for example, market.toSupplyShares(assets)) via expected.sharesMinted"
        : FIELD_HINTS[field],
  });

/**
 * Builds the {@link SimulationLimits} of a morpho-sdk action transaction, quoting the sides the
 * encoded calldata fixes and the caller supplies.
 *
 * Derived limits catch on-chain divergence from the encoded calldata, not wrong inputs; pass the
 * UI's quote through `expected` except exact `collateralSupplies`, which cannot be overridden.
 * The helper is pure and synchronous: no RPC reads, no decoding — it only reads `action.args`,
 * which morpho-sdk normalized when it encoded the call.
 *
 * `midnightSupplyBlueMakeLend` checks the sender's exact debit of the full parked amount and the
 * callback's Blue supply shares; `expected.sharesMinted` must quote the expected position increase.
 * For wNative loan tokens, the debit measurement adds ETH sent to the net wNative balance change,
 * so native funding needs no quote adjustment. Combining Blue parking with any collateral supplies
 * is unsupported.
 *
 * Account attribution fails closed: `account` is `owner` (or the caller-intended `onBehalf` on
 * `midnightSupplyCollateral` and `midnightRedeem`), never read from the args. An action whose
 * `args.onBehalf` (or
 * `redeem.recipient` on `vaultV2ForceRedeem`) names another account throws
 * {@link LimitAccountMismatchError} — `simulate()` would observe no movement on the limited
 * account.
 *
 * For `midnightSupplyBlueMakeLend`, the helper sets `account` to `owner`; `simulate()` rejects a
 * raw limit whose `account` is not the bundle sender with `SlippageCheckUnavailableError`, because
 * MidnightBundlesV2 creates the BlueBuyCallback for `msg.sender`.
 *
 * `midnightSupplyCollateral` derives `assetsPaid` and `collateralSupplied` from `args.assets`.
 * Its `account` is `options.onBehalf ?? owner`, the Midnight collateral owner, while `assetsPaid`
 * is measured on the transaction sender. `simulate()` resolves the collateral token from
 * `Midnight.toMarket(marketId)` or the supplied market struct at `collateralIndex`.
 *
 * A `midnightCancelAndMake` action is also supported when it supplies collateral and does not park
 * assets on Blue. The helper groups repeated collateral indices into one operation and preserves
 * the order of distinct indices. Bundles act for `msg.sender`, so each operation measures
 * collateral for `owner`; `onBehalf` cannot change that. If the maker's supply creates the
 * market, `toMarket` has no entry yet: pass its struct via `options.market` or, when no market is
 * passed, set `assetPaid` to `collateralParams[collateralIndex].token` on each returned operation,
 * or `simulate()` throws `SlippageCheckUnavailableError`.
 * The action records `nativeAmount`, but the collateral-only `supplyCollateralMakeBorrow` path
 * ignores it. MidnightBundlesV2 wraps native value before pulling wNative, so `assetsPaid` caps
 * only the sender's wNative debit; these limits do not bound ETH sent as `tx.value`. Bound that
 * separately with a caller-supplied `nativeBalanceAssertion` in the transaction's `assertAfter`,
 * using a bound derived from the sender's pre-transaction native balance. No `assetPaid: ethAddress`
 * is added.
 *
 * `midnightRedeem` derives `assetsReceived` and `creditRedeemed` from `args.units`: Midnight
 * removes exactly `units` of `onBehalf`'s fee- and loss-adjusted credit and pays exactly `units`
 * loan tokens to `args.receiver`. Its `account` is `options.onBehalf ?? owner` (the credit owner)
 * and its `receiver` is `options.receiver ?? owner`; both must match the encoded args. Since the
 * builder defaults `receiver` to `onBehalf`, redeeming for another owner needs `receiver` too.
 *
 * `midnightTakeBorrow` and `midnightTakeWithdraw` derive receiver proceeds and the position cap
 * from the sell target. Assets targets quote `target.assets` and `target.maxUnits`; units targets
 * quote `target.minSellerAssets` and `target.units`. These bounds already account for referral
 * fees. Both bundles act for `msg.sender` and always measure the sender's position. Sell limits
 * have no `account` field; any supplied `account` is rejected. A non-owner `options.onBehalf`
 * throws {@link LimitAccountMismatchError}. An external receiver must match the encoded receiver.
 *
 * `midnightTakeLend` derives the loan-token spend cap and net-position minimum from its buy target:
 * assets targets quote `target.assets` and `target.minUnits`; units targets quote
 * `target.maxBuyerAssets` and `target.units`. The referral fee is included in the assets bound.
 * The bundle acts for `msg.sender`, so its net position is measured; its limit has no `account` or
 * `receiver` override.
 * On wNative markets, `assetsPaid` counts the ETH sent plus the sender's net wNative change,
 * whether native funding covers part or all of the cap.
 *
 * `midnightSupplyCollateralTakeBorrow` sums repeated collateral indices and derives the
 * `unitsSold` cap and loan-token proceeds from the sell target. Its exact per-index supplies
 * set both the minimum collateral credit and wallet pull caps. One net wallet bound per
 * token/account combines pulls and proceeds when they share a token and receiver. The
 * operation acts for `owner`; an external receiver must match the encoded receiver. For
 * native-funded actions, value sent by all owner transactions, including unrelated transactions,
 * reduces the wrapped-native pull cap and may reject an otherwise valid run.
 * `expected.collateralSupplies` cannot override the exact amounts.
 *
 * `midnightRepayWithdrawCollateral` measures debt repayment and collateral withdrawal over the
 * whole bundle. Assets repayment derives `assetsPaid` and `debtRepaid`; full repayment derives
 * the payment cap and `position.maxDebt: 0n`; withdraw-only actions derive neither repayment
 * quote; without a `debtRepaid` quote (withdraw-only or full repay), debt must not increase.
 * Repeated finite withdrawals are aggregated
 * by collateral index. An unlimited
 * `maxUint256` withdrawal requires `expected.collateralWithdrawals` for that index and derives an
 * empty-position bound. The bundle always measures the sender and rejects any explicit `account`; an
 * external receiver is allowed when it matches the builder's `collateralReceiver`. Native-funded
 * repayment counts the ETH sent plus the net wNative change.
 *
 * `midnightTakeRepayWithdrawCollateral` measures repayment through offers and the optional direct
 * fallback together. An assets target derives `assetsPaid: target.assets` and
 * `debtRepaid: minUnits`; a finite units target derives `assetsPaid: maxBuyerAssets` and
 * `debtRepaid: units`; `units: maxUint256` derives `assetsPaid: maxBuyerAssets` and an exact
 * `position.maxDebt: 0n`. Collateral withdrawals, the receiver rule, sender-only measurement and
 * native funding follow `midnightRepayWithdrawCollateral`.
 *
 * `expected` fields override derived values except `collateralSupplies`, which are exact action
 * pulls as well as credit minimums and cannot be overridden. `undefined` entries are ignored,
 * an explicit `0n` is passed through so `simulate()` rejects it, and an unquoted derived side is omitted — the helper
 * never emits a `0n` quote field. For one maker collateral index, `expected` overrides that
 * operation; for multiple indices, any defined `expected` field is ambiguous and throws
 * {@link AmbiguousExpectedQuoteError}. Combined ops quote a `1n` cap on an inactive leg where the
 * limit schema requires the cap (`sharesMinted` on `blueSupplyCollateralBorrow`,
 * `collateralWithdrawn` on `blueRepayWithdrawCollateral`) and the required pay-in cap is `1n`
 * (`assetsPaid`) on the leg it doesn't use. Every operation type's required quote
 * side(s) — including `assetsPaid` on pay-in actions and `assetsReceived` on an active combined
 * leg — must be present after merging or {@link MissingExpectedQuoteError} throws with the field
 * and what to compute. On `blueSupplyCollateralBorrow` and `blueRepayWithdrawCollateral` with both
 * legs active, `assetsReceived` is not derived: the action args carry only the market id, so the
 * helper cannot tell whether the loan and collateral tokens are the same token, where the two legs
 * net in the wallet — `expected.assetsReceived` must quote the net wallet gain in the received
 * token (on a same-token market, the payout minus the other leg). `sharesBurned` is never derived from the `maxUint256` full-repay sentinel
 * (it resolves to live borrow shares at execution), nor from an assets-mode `repayAssets` leg on
 * `blueRepayWithdrawCollateral` (the funding cap can sit at the `1n` inactive-leg cap while the
 * leg still repays), nor from `vaultV2ForceRedeem`'s
 * `redeem.shares` (`forceDeallocate` burns additional penalty shares); each must come from
 * `expected`.
 * `vaultV1InKindRedeem`/`vaultV2InKindRedeem` derive no `assetsReceived` and no `positions`;
 * `expected.positions` (the per-market Blue supply shares delivered to the receiver) or
 * `expected.assetsReceived` (the idle portion paid to the wallet) is required. `blueRefinance` derives no side: its required source
 * `sharesBurned` and target `sharesMinted` (and any other side) come from `expected`.
 * The default `slippageTolerance` applies in addition to the Midnight sell and buy target bounds; pass
 * `slippageTolerance: 0n` to enforce those bounds exactly.
 *
 * Other Midnight actions, including pure publications, and any action type without an
 * {@link OperationType} throw {@link UnsupportedLimitActionError};
 * `limits: "none"` remains the opt-out for transactions no operation type covers.
 *
 * Prefer `InputOperationLimit` for types covered by `OperationInputs`; quote-based
 * limits remain required for refinance, in-kind redeems, force exits and
 * Midnight operations.
 *
 * @param action - The action metadata (`tx.action`) of the transaction to limit.
 * @param options - Limit options.
 * @param options.owner - The connected account: position/share owner and default asset receiver.
 * @param options.onBehalf - Collateral owner for a direct `midnightSupplyCollateral` or credit
 *   owner for `midnightRedeem`; defaults to `owner`. For every other action, including maker
 *   bundles, a value different from `owner` throws {@link LimitAccountMismatchError}.
 * @param options.receiver - Asset receiver; applies to `vaultV2ForceRedeem` and Midnight redeem
 *   and sell actions, including `midnightSupplyCollateralTakeBorrow`, which must match the encoded
 *   `args.receiver`; also applies to `collateralReceiver` when
 *   `midnightRepayWithdrawCollateral` or `midnightTakeRepayWithdrawCollateral` withdraws collateral.
 *   Defaults to `owner`.
 * @param options.slippageTolerance - WAD-scaled tolerance below `1e18`; defaults to blue-sdk's
 *   `DEFAULT_SLIPPAGE_TOLERANCE` (0.03%).
 * @param options.market - Midnight market struct for a market this bundle creates on first use.
 *   Its Midnight `MarketUtils.toId(options.market)` must match the action's market. Forwarded on
 *   the four supported Midnight limit types and on `midnightCancelAndMake` with collateral
 *   supplies and no `blueSupply`.
 * @param options.expected - Caller-computed quote values, overriding derived ones;
 *   exact `collateralSupplies` cannot be overridden.
 * @returns Deep-frozen limits covering the action's subject over the whole bundle, with one
 *   operation per distinct collateral index for an eligible maker action.
 * @throws {LimitAccountMismatchError} when an encoded recipient differs from the requested
 *   `receiver` (`args.receiver`, `redeem.recipient`, or `args.collateralReceiver`), when
 *   `receiver` differs from `owner` outside `vaultV2ForceRedeem`, Midnight redeem/sell, or
 *   repay-withdraw with collateral withdrawals, or when encoded or requested `onBehalf` differs
 *   from its permitted account.
 * @throws {MissingExpectedQuoteError} when a required quote side is neither derivable nor supplied.
 * @throws {AmbiguousExpectedQuoteError} when `expected` has any defined field for a maker action
 *   supplying collateral at multiple indices.
 * @throws {SimulationValidationError} when `expected.collateralSupplies` is
 *   supplied, expected collateral withdrawals are invalid, or a supplied
 *   Midnight market struct cannot be converted.
 * @throws {UnsupportedLimitActionError} when the action type has no operation limit, or
 *   `midnightCancelAndMake` has no `blueSupply` and no collateral supplies, or combines Blue
 *   parking with collateral supplies.
 * @example
 * ```ts
 * import { MarketParams } from "@morpho-org/blue-sdk";
 * import { blueSupply, midnightCancelAndMake } from "@morpho-org/morpho-sdk";
 * import { simulate, toSimulationLimits } from "@morpho-org/evm-simulation";
 * import type { Address, Hex } from "viem";
 * import { maxUint256, zeroHash } from "viem";
 * import { base, mainnet } from "viem/chains";
 *
 * declare const user: Address;
 * declare const marketParams: MarketParams;
 * declare const supplyAssets: bigint;
 * declare const deadline: bigint;
 * declare const quotedShares: bigint;
 * declare const quotedCallbackShares: bigint;
 * const config = {
 *   chains: new Map([
 *     [1, { simulateV1Url: "https://rpc.example" }],
 *     [base.id, { simulateV1Url: "https://base-rpc.example" }],
 *   ]),
 * };
 * declare const rateRatifierV1: Address;
 * declare const root: Hex;
 * declare const groups: readonly Hex[];
 * declare const payload: Hex;
 * declare const blueMarket: MarketParams;
 *
 * const tx = blueSupply({
 *   market: { chainId: mainnet.id, marketParams },
 *   args: {
 *     userAddress: user,
 *     assets: supplyAssets,
 *     deadline,
 *   },
 * });
 * const result = await simulate(config, {
 *   chainId: 1,
 *   transactions: [{ from: user, to: tx.to, data: tx.data, value: tx.value }],
 *   limits: toSimulationLimits(tx.action, {
 *     owner: user,
 *     // Blue supply args carry no share-price guard, so the share floor must
 *     // be supplied.
 *     expected: { sharesMinted: quotedShares },
 *   }),
 *   // { operations: [{ type: "blueSupply", marketId, account: user,
 *   //   quote: { assetsPaid, sharesMinted } }] }
 * });
 *
 * const midnightTx = midnightCancelAndMake({
 *   chainId: base.id,
 *   cancellations: [],
 *   deadline: maxUint256,
 *   publication: {
 *     ratifier: rateRatifierV1,
 *     root,
 *     groups,
 *     payload,
 *     blueSupply: {
 *       market: blueMarket,
 *       assets: supplyAssets,
 *       callbackSalt: zeroHash,
 *     },
 *   },
 * });
 * await simulate(config, {
 *   chainId: base.id,
 *   transactions: [{
 *     from: user,
 *     to: midnightTx.to,
 *     data: midnightTx.data,
 *     value: midnightTx.value,
 *   }],
 *   limits: toSimulationLimits(midnightTx.action, {
 *     owner: user,
 *     expected: { sharesMinted: quotedCallbackShares },
 *   }),
 * });
 * ```
 * @example
 * ```ts
 * import { simulate, toSimulationLimits } from "@morpho-org/evm-simulation";
 * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
 * import {
 *   MarketParams,
 *   type Tree,
 * } from "@morpho-org/morpho-sdk/midnight/entities";
 * import { createPublicClient, type Address, http, maxUint256 } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() }).extend(
 *   morphoViemExtension(),
 * );
 * declare const user: Address;
 * declare const market: MarketParams;
 * declare const offers: Tree<"rateV1">;
 * declare const collateralAssets: bigint;
 * declare const config: Parameters<typeof simulate>[0];
 *
 * const output = await client.morpho.midnight(base.id).supplyCollateralMakeBorrow({
 *   accountAddress: user,
 *   offers,
 *   collateral: {
 *     market,
 *     supplies: [{ collateralIndex: 0n, assets: collateralAssets }],
 *   },
 *   deadline: maxUint256,
 * });
 * const tx = output.buildTx();
 * const result = await simulate(config, {
 *   chainId: base.id,
 *   transactions: [{ from: user, to: tx.to, data: tx.data, value: tx.value }],
 *   limits: toSimulationLimits(tx.action, { owner: user }),
 * });
 * ```
 * @example
 * ```ts
 * import { midnightTakeBorrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightTakeBorrow({
 *   chainId,
 *   market: marketData.params,
 *   target: { type: "units", units, minSellerAssets },
 *   receiver,
 *   takeableOffers,
 *   deadline,
 *   referralFeePct,
 *   referralFeeRecipient,
 * });
 * const result = await simulate(config, {
 *   chainId,
 *   transactions: [{ from: owner, to: tx.to, data: tx.data, value: tx.value }],
 *   limits: toSimulationLimits(tx.action, {
 *     owner,
 *     receiver,
 *     slippageTolerance: 0n,
 *   }),
 * });
 * ```
 * @example
 * ```ts
 * import { midnightSupplyCollateralTakeBorrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightSupplyCollateralTakeBorrow({
 *   chainId,
 *   market: marketData.params,
 *   target: { type: "assets", assets, maxUnits },
 *   receiver: owner,
 *   collateralSupplies: [{ collateralIndex: 0n, assets: collateralAssets }],
 *   takeableOffers,
 *   deadline,
 *   referralFeePct,
 *   referralFeeRecipient,
 * });
 * const result = await simulate(config, {
 *   chainId,
 *   transactions: [{ from: owner, to: tx.to, data: tx.data, value: tx.value }],
 *   limits: toSimulationLimits(tx.action, { owner }),
 * });
 * ```
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightTakeLend } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightTakeLend({
 *   chainId,
 *   market: marketData.params,
 *   target: { type: "units", units, maxBuyerAssets },
 *   takeableOffers,
 *   maxContinuousFee: maxUint256,
 *   deadline,
 *   referralFeePct,
 *   referralFeeRecipient,
 * });
 * const result = await simulate(config, {
 *   chainId,
 *   transactions: [{ from: owner, to: tx.to, data: tx.data, value: tx.value }],
 *   limits: toSimulationLimits(tx.action, {
 *     owner,
 *     slippageTolerance: 0n,
 *   }),
 * });
 * ```
 * @example
 * ```ts
 * import { maxUint256, type Address } from "viem";
 * import { midnightRepayWithdrawCollateral } from "@morpho-org/morpho-sdk";
 * import type { MarketParams } from "@morpho-org/morpho-sdk/midnight/entities";
 * import { simulate, toSimulationLimits, type SimulationConfig } from "@morpho-org/evm-simulation";
 *
 * declare const chainId: 8453;
 * declare const config: SimulationConfig;
 * declare const owner: Address;
 * declare const market: MarketParams;
 * declare const deadline: bigint;
 * const tx = midnightRepayWithdrawCollateral({
 *   chainId,
 *   market,
 *   repay: { type: "assets", assets: 100n },
 *   collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
 *   collateralReceiver: owner,
 *   deadline,
 * });
 * const result = await simulate(config, {
 *   chainId,
 *   transactions: [{ from: owner, to: tx.to, data: tx.data, value: tx.value }],
 *   limits: toSimulationLimits(tx.action, {
 *     owner,
 *     expected: { collateralWithdrawals: [{ collateralIndex: 0n, assets: 1_000n }] },
 *   }),
 * });
 * ```
 * @example
 * ```ts
 * import { maxUint256, type Address } from "viem";
 * import {
 *   midnightTakeRepayWithdrawCollateral,
 *   type MidnightTakeableOffer,
 * } from "@morpho-org/morpho-sdk";
 * import type { MarketParams } from "@morpho-org/morpho-sdk/midnight/entities";
 * import { simulate, toSimulationLimits, type SimulationConfig } from "@morpho-org/evm-simulation";
 *
 * declare const chainId: 8453;
 * declare const config: SimulationConfig;
 * declare const owner: Address;
 * declare const market: MarketParams;
 * declare const takeableOffers: readonly MidnightTakeableOffer[];
 * declare const deadline: bigint;
 * // Repays the whole debt through offers, then directly; spends at most 1_000n.
 * const tx = midnightTakeRepayWithdrawCollateral({
 *   chainId,
 *   market,
 *   target: { type: "units", units: maxUint256, maxBuyerAssets: 1_000n },
 *   repayEnabled: true,
 *   takeableOffers,
 *   maxContinuousFee: 0n,
 *   collateralWithdrawals: [],
 *   collateralReceiver: owner,
 *   deadline,
 * });
 * const result = await simulate(config, {
 *   chainId,
 *   transactions: [{ from: owner, to: tx.to, data: tx.data, value: tx.value }],
 *   // Derives assetsPaid: 1_000n and position.maxDebt: 0n.
 *   limits: toSimulationLimits(tx.action, { owner, slippageTolerance: 0n }),
 * });
 * ```
 */
export const toSimulationLimits = (
  action: TransactionAction,
  options: {
    /** The connected account: position/share owner and default asset receiver. */
    readonly owner: Address;
    /** Collateral owner on `midnightSupplyCollateral`, credit owner on `midnightRedeem` — Midnight acts on `onBehalf`, not msg.sender. Any other action, including Midnight sells, throws when it differs from `owner`. Defaults to `owner`. */
    readonly onBehalf?: Address;
    /**
     * Asset receiver for `vaultV2ForceRedeem`, Midnight redeem and sell actions,
     * including `midnightSupplyCollateralTakeBorrow`, where it must match the
     * encoded `args.receiver`; and `collateralReceiver` when
     * `midnightRepayWithdrawCollateral` or `midnightTakeRepayWithdrawCollateral`
     * withdraws collateral. Every other action pays `msg.sender`, and a non-`owner`
     * receiver throws. Defaults to `owner`.
     */
    readonly receiver?: Address;
    /** WAD-scaled tolerance below `1e18`; defaults to `DEFAULT_SLIPPAGE_TOLERANCE`. */
    readonly slippageTolerance?: bigint;
    /** `Midnight.toMarket` struct for a market this bundle creates on first use; its id must match the action's market id. */
    readonly market?: MidnightMarketStruct;
    /** Caller-computed quote values, overriding derived ones; exact `collateralSupplies` cannot be overridden. */
    readonly expected?: Partial<Omit<SlippageQuote, "collateralSupplies">>;
  },
): SimulationLimits & { readonly operations: readonly OperationLimit[] } => {
  const { owner } = options;
  const supportsMarket =
    MIDNIGHT_MARKET_INPUT_OPERATION_TYPES.some(
      (acceptedType) => acceptedType === action.type,
    ) ||
    (action.type === "midnightCancelAndMake" &&
      (action.args.collateralSupplies?.length ?? 0) > 0 &&
      action.args.blueSupply === undefined);
  let market: MidnightMarketStruct | undefined;
  if (supportsMarket && options.market !== undefined) {
    try {
      market = MidnightMarketUtils.toStruct(options.market);
    } catch (cause) {
      const message =
        "market: must be a valid Midnight market struct; pass the struct used to build the action.";
      throw new SimulationValidationError(message, [message], { cause });
    }
  }
  if (
    options.expected !== undefined &&
    "collateralSupplies" in options.expected &&
    options.expected.collateralSupplies !== undefined
  )
    throw new SimulationValidationError(
      "expected.collateralSupplies cannot override the exact supplies encoded in the action. Omit it; the action's collateralSupplies set both the credit minimum and the pull cap.",
    );

  const limitActions: readonly TransactionAction[] =
    action.type === "midnightCancelAndMake" &&
    (action.args.collateralSupplies?.length ?? 0) > 0 &&
    action.args.blueSupply === undefined
      ? (() => {
          const suppliesByIndex = new Map<bigint, bigint>();
          for (const { collateralIndex, assets } of action.args
            .collateralSupplies) {
            suppliesByIndex.set(
              collateralIndex,
              (suppliesByIndex.get(collateralIndex) ?? 0n) + assets,
            );
          }
          return Array.from(
            suppliesByIndex,
            ([collateralIndex, assets]) =>
              ({
                type: "midnightSupplyCollateral",
                args: {
                  market: action.args.market,
                  collateralIndex,
                  assets,
                  onBehalf: owner,
                },
              }) satisfies TransactionAction,
          );
        })()
      : [action];

  const derivedLimits = limitActions.map((limitAction) => {
    const derived = deriveQuote(limitAction);
    if (derived === undefined) {
      throw new UnsupportedLimitActionError(action.type);
    }
    return { action: limitAction, derived };
  });

  const expected = options.expected ?? {};
  if (
    derivedLimits.length > 1 &&
    Object.values(expected).some((value) => value !== undefined)
  ) {
    throw new AmbiguousExpectedQuoteError({
      actionType: action.type,
      operations: derivedLimits.length,
    });
  }

  const hasCollateralWithdrawals =
    (action.type === "midnightRepayWithdrawCollateral" ||
      action.type === "midnightTakeRepayWithdrawCollateral") &&
    action.args.collateralWithdrawals.length > 0;
  // Bundles pay `msg.sender`, except for the external collateral receiver.
  if (
    !derivedLimits.every(
      ({ derived }) =>
        derived.type === "vaultV2ForceRedeem" ||
        derived.type === "midnightRedeem" ||
        derived.type === "midnightTakeBorrow" ||
        derived.type === "midnightTakeWithdraw" ||
        derived.type === "midnightSupplyCollateralTakeBorrow" ||
        ((derived.type === "midnightRepayWithdrawCollateral" ||
          derived.type === "midnightTakeRepayWithdrawCollateral") &&
          hasCollateralWithdrawals),
    ) &&
    options.receiver !== undefined &&
    !isAddressEqual(options.receiver, owner)
  ) {
    throw new LimitAccountMismatchError({
      field: "receiver",
      expected: owner,
      actual: options.receiver,
    });
  }
  const receiver = options.receiver ?? owner;

  // Only direct Midnight calls act on an account other than msg.sender;
  // bundles act for `owner`.
  if (
    action.type !== "midnightSupplyCollateral" &&
    action.type !== "midnightRedeem" &&
    options.onBehalf !== undefined &&
    !isAddressEqual(options.onBehalf, owner)
  ) {
    throw new LimitAccountMismatchError({
      field: "options.onBehalf",
      expected: owner,
      actual: options.onBehalf,
    });
  }
  const account =
    action.type === "midnightSupplyCollateral" ||
    action.type === "midnightRedeem"
      ? (options.onBehalf ?? owner)
      : owner;

  if (
    "onBehalf" in action.args &&
    action.args.onBehalf !== undefined &&
    !isAddressEqual(action.args.onBehalf, account)
  ) {
    throw new LimitAccountMismatchError({
      field: "onBehalf",
      expected: account,
      actual: action.args.onBehalf,
    });
  }
  if (
    action.type === "vaultV2ForceRedeem" &&
    !isAddressEqual(action.args.redeem.recipient, receiver)
  ) {
    throw new LimitAccountMismatchError({
      field: "redeem.recipient",
      expected: receiver,
      actual: action.args.redeem.recipient,
    });
  }
  // The payout is measured on `receiver`, so the encoded receiver must be the
  // intended one; checking the encoded address against itself proves nothing.
  if (
    action.type === "midnightRedeem" &&
    !isAddressEqual(action.args.receiver, receiver)
  ) {
    throw new LimitAccountMismatchError({
      field: "args.receiver",
      expected: receiver,
      actual: action.args.receiver,
    });
  }
  if (
    (action.type === "midnightTakeBorrow" ||
      action.type === "midnightTakeWithdraw" ||
      action.type === "midnightSupplyCollateralTakeBorrow") &&
    !isAddressEqual(action.args.receiver, receiver)
  ) {
    throw new LimitAccountMismatchError({
      field: "args.receiver",
      expected: receiver,
      actual: action.args.receiver,
    });
  }
  if (
    hasCollateralWithdrawals &&
    !isAddressEqual(action.args.collateralReceiver, receiver)
  ) {
    throw new LimitAccountMismatchError({
      field: "args.collateralReceiver",
      expected: receiver,
      actual: action.args.collateralReceiver,
    });
  }

  const operations = derivedLimits.map(({ action: limitAction, derived }) => {
    const quote: {
      -readonly [K in keyof SlippageQuote]?: SlippageQuote[K];
    } = {};
    for (const field of QUOTE_FIELDS) {
      const amount = expected[field] ?? derived.quote[field];
      if (amount === undefined) continue;
      // A derived zero means the side is not moved; an explicit expected zero is
      // kept so `simulate()` rejects it at parse time.
      if (amount > 0n || expected[field] !== undefined) quote[field] = amount;
    }
    // Structured quote fields are never derived; an explicit `expected` value
    // passes through (an explicit `undefined` never erases).
    if (expected.penalty !== undefined) quote.penalty = expected.penalty;
    if (expected.positions !== undefined)
      quote.positions = expected.positions.map((position) => ({ ...position }));
    if (expected.deallocations !== undefined)
      quote.deallocations = expected.deallocations.map((deallocation) => ({
        ...deallocation,
      }));
    if (derived.collateralSupplies !== undefined) {
      quote.collateralSupplies = derived.collateralSupplies;
    }

    if (
      expected.collateralWithdrawals !== undefined &&
      expected.collateralWithdrawals.length > 0 &&
      derived.collateralWithdrawals === undefined
    )
      throw new SimulationValidationError(
        `expected.collateralWithdrawals: action "${action.type}" withdraws no collateral`,
      );

    if (derived.collateralWithdrawals !== undefined) {
      const expectedIndexes = new Set<bigint>();
      for (const { collateralIndex } of expected.collateralWithdrawals ?? []) {
        if (expectedIndexes.has(collateralIndex))
          throw new SimulationValidationError(
            `expected.collateralWithdrawals: duplicate collateral index "${collateralIndex}"`,
          );
        expectedIndexes.add(collateralIndex);
      }
      const withdrawn = new Set(
        derived.collateralWithdrawals.map(
          ({ collateralIndex }) => collateralIndex,
        ),
      );
      for (const { collateralIndex } of expected.collateralWithdrawals ?? []) {
        if (!withdrawn.has(collateralIndex))
          throw new SimulationValidationError(
            `expected.collateralWithdrawals: collateral index "${collateralIndex}" is not withdrawn by the action`,
          );
      }
      const collateralQuote = derived.collateralWithdrawals.map(
        ({ collateralIndex, assets }) => {
          const expectedEntry = expected.collateralWithdrawals?.find(
            (entry) => entry.collateralIndex === collateralIndex,
          );
          if (expectedEntry !== undefined)
            return { collateralIndex, assets: expectedEntry.assets };
          if (assets === undefined)
            throw missingQuote(limitAction.type, "collateralWithdrawals");
          return { collateralIndex, assets };
        },
      );
      if (collateralQuote.length > 0)
        quote.collateralWithdrawals = collateralQuote;
    }

    for (const fields of requiredQuoteGroups(derived.type)) {
      const missing =
        fields.length === 1
          ? quote[fields[0]!] === undefined
          : !fields.some((field) => quote[field] !== undefined);
      if (missing) {
        throw missingQuote(limitAction.type, fields[0]!);
      }
    }

    for (const { field } of conditionalQuoteViolations(derived.type, quote)) {
      throw missingQuote(limitAction.type, field);
    }
    // `deriveQuote` flags the fields `expected` must carry (`sharesBurned` for an
    // assets-mode or maxUint256-sentinel repay, `assetsReceived` on a both-legs
    // combined use) — anything still missing after the merge is a caller error.
    for (const field of derived.requiredExpected) {
      if (quote[field] === undefined)
        throw missingQuote(limitAction.type, field);
    }
    if (missingInKindProceeds(derived.type, quote))
      // In-kind proceeds land on Blue supply positions or the wallet, neither of
      // which the action args can quote — `expected.positions` or
      // `expected.assetsReceived` must carry them.
      throw missingQuote(limitAction.type, "positions");
    const subject = (() => {
      switch (limitAction.type) {
        case "vaultV1MigrateToV2":
          return {
            type: limitAction.type,
            sourceVault: limitAction.args.sourceVault,
            targetVault: limitAction.args.targetVault,
          };
        case "blueRefinance":
          return {
            type: limitAction.type,
            sourceMarketId: limitAction.args.sourceMarket as MarketId,
            targetMarketId: limitAction.args.destinationMarket as MarketId,
          };
        case "blueSupply":
        case "blueWithdraw":
        case "blueSupplyCollateral":
        case "blueBorrow":
        case "blueSupplyCollateralBorrow":
        case "blueRepay":
        case "blueWithdrawCollateral":
        case "blueRepayWithdrawCollateral":
          return {
            type: limitAction.type,
            marketId: limitAction.args.market as MarketId,
          };
        case "midnightSupplyCollateral":
          return {
            type: limitAction.type,
            marketId: limitAction.args.market,
            collateralIndex: limitAction.args.collateralIndex,
          };
        case "midnightCancelAndMake":
          if (limitAction.args.blueSupply === undefined)
            throw new UnsupportedLimitActionError(limitAction.type);
          return {
            type: "midnightSupplyBlueMakeLend" as const,
            loanToken: limitAction.args.blueSupply.market.loanToken,
            marketId: MarketUtils.getMarketId(
              limitAction.args.blueSupply.market,
            ),
            callbackSalt: limitAction.args.blueSupply.callbackSalt,
          };
        case "midnightRedeem":
          return { type: limitAction.type, marketId: limitAction.args.market };
        case "midnightTakeLend":
          return {
            type: limitAction.type,
            marketId: limitAction.args.market,
          };
        case "midnightTakeBorrow":
          return {
            type: limitAction.type,
            marketId: limitAction.args.market,
          };
        case "midnightTakeWithdraw":
          return {
            type: limitAction.type,
            marketId: limitAction.args.market,
          };
        case "midnightRepayWithdrawCollateral":
          return {
            type: limitAction.type,
            marketId: limitAction.args.market,
            ...(derived.position === undefined
              ? {}
              : { position: derived.position }),
          };
        case "midnightTakeRepayWithdrawCollateral":
          return {
            type: limitAction.type,
            marketId: limitAction.args.market,
            ...(derived.position === undefined
              ? {}
              : { position: derived.position }),
          };
        case "midnightSupplyCollateralTakeBorrow":
          return {
            type: limitAction.type,
            marketId: limitAction.args.market,
          };
        case "vaultV1Deposit":
        case "vaultV1Withdraw":
        case "vaultV1Redeem":
        case "vaultV1InKindRedeem":
        case "vaultV2Deposit":
        case "vaultV2Withdraw":
        case "vaultV2Redeem":
        case "vaultV2InKindRedeem":
        case "vaultV2ForceWithdraw":
        case "vaultV2ForceRedeem":
          return { type: limitAction.type, vault: limitAction.args.vault };
        default:
          // Unreachable: `deriveQuote` already threw for unsupported types.
          throw new UnsupportedLimitActionError(action.type);
      }
    })();

    const assetPaid =
      limitAction.type === "midnightRepayWithdrawCollateral" ||
      limitAction.type === "midnightTakeRepayWithdrawCollateral"
        ? {}
        : derived.assetPaid !== undefined
          ? { assetPaid: derived.assetPaid }
          : {};
    const sharedLimitFields = {
      ...(quote.assetsReceived !== undefined || hasCollateralWithdrawals
        ? { receiver }
        : {}),
      quote,
      ...(options.slippageTolerance !== undefined
        ? { slippageTolerance: options.slippageTolerance }
        : {}),
    };
    if (
      subject.type === "midnightRepayWithdrawCollateral" ||
      subject.type === "midnightTakeRepayWithdrawCollateral"
    ) {
      return { ...subject, ...sharedLimitFields } satisfies OperationLimit;
    }
    if (subject.type === "midnightSupplyCollateralTakeBorrow") {
      return {
        ...subject,
        ...(market === undefined ? {} : { market }),
        ...sharedLimitFields,
      } satisfies OperationLimit;
    }
    if (subject.type === "midnightTakeLend") {
      return {
        ...subject,
        ...(market === undefined ? {} : { market }),
        quote,
        ...(options.slippageTolerance !== undefined
          ? { slippageTolerance: options.slippageTolerance }
          : {}),
      } satisfies OperationLimit;
    }
    if (subject.type === "midnightSupplyBlueMakeLend") {
      return {
        ...subject,
        account,
        ...sharedLimitFields,
      } satisfies OperationLimit;
    }
    if (
      subject.type === "midnightTakeBorrow" ||
      subject.type === "midnightTakeWithdraw"
    ) {
      return {
        ...subject,
        ...(subject.type === "midnightTakeBorrow" && market !== undefined
          ? { market }
          : {}),
        ...sharedLimitFields,
        ...assetPaid,
      } satisfies OperationLimit;
    }
    return {
      ...subject,
      ...(subject.type === "midnightSupplyCollateral" && market !== undefined
        ? { market }
        : {}),
      account,
      ...sharedLimitFields,
      ...assetPaid,
    } satisfies OperationLimit;
  });

  return deepFreeze({ operations });
};
