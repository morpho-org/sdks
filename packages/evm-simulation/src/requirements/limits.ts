import { type MarketId, MathLib } from "@morpho-org/blue-sdk";
import type { TransactionAction } from "@morpho-org/morpho-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, ethAddress, isAddressEqual, maxUint256 } from "viem";
import {
  LimitAccountMismatchError,
  MissingExpectedQuoteError,
  UnsupportedLimitActionError,
} from "../errors.js";
import type {
  OperationLimit,
  OperationType,
  ScalarQuoteField,
  SimulationLimits,
  SlippageQuote,
} from "../limits.js";
import { INACTIVE_LEG_CAP, QUOTE_FIELD_DIRECTION } from "../limits.js";
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
  /** Fields `expected` must carry because the args can't quote them. */
  readonly requiredExpected: readonly QuoteField[];
};

/**
 * Derives the quote fields an action's args fix, before `expected` overrides.
 * Returns `undefined` when the action type has no {@link OperationType}.
 * Kept apart from `toSimulationLimits` despite one call site: it is the
 * per-action derivation table, and its early returns would not survive inlining.
 */
const deriveQuote = (action: TransactionAction): DerivedLimit | undefined => {
  switch (action.type) {
    case "vaultV1Deposit":
    case "vaultV2Deposit": {
      const { amount, netAssets, maxSharePrice } = action.args;
      return {
        type: action.type,
        requiredExpected: [],
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
const FIELD_HINTS: Record<QuoteField | "positions", string> = {
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
  positions:
    "compute the Blue supply shares delivered per market and pass them via expected.positions, or pass the wallet payout of an idle-only redeem via expected.assetsReceived",
};

const missingQuote = (
  actionType: string,
  field: QuoteField | "positions",
): MissingExpectedQuoteError =>
  new MissingExpectedQuoteError({
    actionType,
    field,
    expectedHint: FIELD_HINTS[field],
  });

/**
 * Builds the {@link SimulationLimits} of a morpho-sdk action transaction, quoting the sides the
 * encoded calldata fixes and the caller supplies.
 *
 * Derived limits catch on-chain divergence from the encoded calldata, not wrong inputs; pass the
 * UI's quote through `expected`. The helper is pure and synchronous: no RPC reads, no decoding —
 * it only reads `action.args`, which morpho-sdk normalized when it encoded the call.
 *
 * Account attribution fails closed: `account` is always `owner`, never read from the args. An
 * action whose `args.onBehalf` (or `redeem.recipient` on `vaultV2ForceRedeem`) names another
 * account throws {@link LimitAccountMismatchError} — `simulate()` would observe no movement on the
 * limited account.
 *
 * `expected` fields override derived values; `undefined` entries are ignored, an explicit `0n` is
 * passed through so `simulate()` rejects it, and an unquoted derived side is omitted — the helper
 * never emits a `0n` quote field. Combined ops quote a `1n` cap on an inactive leg where the
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
 *
 * Midnight and any action type without an {@link OperationType} throw
 * {@link UnsupportedLimitActionError}; `limits: "none"` remains the opt-out for transactions no
 * operation type covers.
 *
 * @param action - The action metadata (`tx.action`) of the transaction to limit.
 * @param options - Limit options.
 * @param options.owner - The connected account: position/share owner and default asset receiver.
 * @param options.receiver - Asset receiver; applies only to `vaultV2ForceRedeem`, defaults
 *   to `owner`.
 * @param options.slippageTolerance - WAD-scaled tolerance below `1e18`; defaults to blue-sdk's
 *   `DEFAULT_SLIPPAGE_TOLERANCE` (0.03%).
 * @param options.expected - Caller-computed quote values, overriding derived ones.
 * @returns A deep-frozen `{ operations: [limit] }` covering the action's subject over the whole bundle.
 * @throws {LimitAccountMismatchError} when the action encodes a recipient other than
 *   `owner`/`receiver`, or when `receiver` differs from `owner` on an action
 *   other than `vaultV2ForceRedeem` (`field: "receiver"`).
 * @throws {MissingExpectedQuoteError} when a required quote side is neither derivable nor supplied.
 * @throws {UnsupportedLimitActionError} when the action type has no operation limit.
 * @example
 * ```ts
 * import { MarketParams } from "@morpho-org/blue-sdk";
 * import { blueSupply } from "@morpho-org/morpho-sdk";
 * import { simulate, toSimulationLimits } from "@morpho-org/evm-simulation";
 * import type { Address } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * declare const user: Address;
 * declare const marketParams: MarketParams;
 * declare const supplyAssets: bigint;
 * declare const deadline: bigint;
 * declare const quotedShares: bigint;
 * const config = {
 *   chains: new Map([[1, { simulateV1Url: "https://rpc.example" }]]),
 * };
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
 * ```
 */
export const toSimulationLimits = (
  action: TransactionAction,
  options: {
    /** The connected account: position/share owner and default asset receiver. */
    readonly owner: Address;
    /** Asset receiver; applies only to `vaultV2ForceRedeem` — every other action pays `msg.sender` and a non-`owner` receiver throws. Defaults to `owner`. */
    readonly receiver?: Address;
    /** WAD-scaled tolerance below `1e18`; defaults to `DEFAULT_SLIPPAGE_TOLERANCE`. */
    readonly slippageTolerance?: bigint;
    /** Caller-computed quote values, overriding derived ones. */
    readonly expected?: Partial<SlippageQuote>;
  },
): SimulationLimits => {
  const { owner } = options;

  const derived = deriveQuote(action);
  if (derived === undefined) {
    throw new UnsupportedLimitActionError(action.type);
  }

  // Bundles pay `msg.sender`, so `receiver` applies only to
  // `vaultV2ForceRedeem` (the forceDeallocate recipient); on every other
  // action another receiver could never be measured.
  if (
    derived.type !== "vaultV2ForceRedeem" &&
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

  if (
    "onBehalf" in action.args &&
    action.args.onBehalf !== undefined &&
    !isAddressEqual(action.args.onBehalf, owner)
  ) {
    throw new LimitAccountMismatchError({
      field: "onBehalf",
      expected: owner,
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

  const expected = options.expected ?? {};
  const quote: { -readonly [K in keyof SlippageQuote]?: SlippageQuote[K] } = {};
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

  for (const fields of requiredQuoteGroups(derived.type)) {
    const missing =
      fields.length === 1
        ? quote[fields[0]!] === undefined
        : !fields.some((field) => quote[field] !== undefined);
    if (missing) {
      throw missingQuote(action.type, fields[0]!);
    }
  }

  for (const { field } of conditionalQuoteViolations(derived.type, quote)) {
    throw missingQuote(action.type, field);
  }
  // `deriveQuote` flags the fields `expected` must carry (`sharesBurned` for an
  // assets-mode or maxUint256-sentinel repay, `assetsReceived` on a both-legs
  // combined use) — anything still missing after the merge is a caller error.
  for (const field of derived.requiredExpected) {
    if (quote[field] === undefined) throw missingQuote(action.type, field);
  }
  if (missingInKindProceeds(derived.type, quote))
    // In-kind proceeds land on Blue supply positions or the wallet, neither of
    // which the action args can quote — `expected.positions` or
    // `expected.assetsReceived` must carry them.
    throw missingQuote(action.type, "positions");

  const subject = (() => {
    switch (action.type) {
      case "vaultV1MigrateToV2":
        return {
          type: action.type,
          sourceVault: action.args.sourceVault,
          targetVault: action.args.targetVault,
        };
      case "blueRefinance":
        return {
          type: action.type,
          sourceMarketId: action.args.sourceMarket as MarketId,
          targetMarketId: action.args.destinationMarket as MarketId,
        };
      case "blueSupply":
      case "blueWithdraw":
      case "blueSupplyCollateral":
      case "blueBorrow":
      case "blueSupplyCollateralBorrow":
      case "blueRepay":
      case "blueWithdrawCollateral":
      case "blueRepayWithdrawCollateral":
        return { type: action.type, marketId: action.args.market as MarketId };
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
        return { type: action.type, vault: action.args.vault };
      default:
        // Unreachable: `deriveQuote` already threw for unsupported types.
        throw new UnsupportedLimitActionError(action.type);
    }
  })();

  const limit = {
    ...subject,
    account: owner,
    ...(quote.assetsReceived !== undefined ? { receiver } : {}),
    // morpho-sdk only accepts native funding for the full payment, so the paid
    // asset is then ETH.
    ...("nativeAmount" in action.args && isPositive(action.args.nativeAmount)
      ? { assetPaid: ethAddress }
      : {}),
    quote,
    ...(options.slippageTolerance !== undefined
      ? { slippageTolerance: options.slippageTolerance }
      : {}),
  } satisfies OperationLimit;

  return deepFreeze({ operations: [limit] });
};
