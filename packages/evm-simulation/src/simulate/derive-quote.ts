import { MarketUtils, MathLib } from "@morpho-org/blue-sdk";
import {
  SimulationValidationError,
  SlippageCheckUnavailableError,
} from "../errors.js";
import {
  INACTIVE_LEG_CAP,
  type ScalarQuoteField,
  type SlippageQuote,
} from "../limits.js";
import {
  type ParsedOperationLimit,
  requiredQuoteErrors,
} from "./request/parse-request.js";

/** Decoded in-block values needed to derive an operation's quote. @internal */
export interface DerivationState {
  readonly netWalletAssets?: boolean;
  readonly preview?: bigint;
  readonly market?: {
    readonly totalSupplyAssets: bigint;
    readonly totalSupplyShares: bigint;
    readonly totalBorrowAssets: bigint;
    readonly totalBorrowShares: bigint;
  };
  readonly borrowShares?: bigint;
  readonly targetVault?: {
    readonly totalAssets: bigint;
    readonly totalSupply: bigint;
    readonly virtualShares: bigint;
  };
}

type InputLimit = Exclude<
  ParsedOperationLimit,
  { readonly inputs?: undefined }
>;
type InputLimitOf<T extends InputLimit["type"]> = Extract<
  InputLimit,
  { readonly type: T }
>;
type DerivationContextState = Parameters<typeof deriveQuote>[1];

/** Quote one `deriveQuote` call accumulates, with its fee and state accessors. @internal */
interface QuoteDraft {
  readonly quote: { -readonly [K in keyof SlippageQuote]: SlippageQuote[K] };
  readonly exactFields: ScalarQuoteField[];
  readonly inactiveFields: ScalarQuoteField[];
  readonly fee: bigint;
  readonly reallocationPenalty: bigint;
  readonly state: DerivationContextState;
  /** Sets a derived side and marks it exact. */
  readonly exact: (field: ScalarQuoteField, value: bigint) => void;
  /** Proceeds after the reallocation penalty and referral fee. */
  readonly net: (assets: bigint, penalty?: bigint) => bigint;
  readonly market: () => NonNullable<DerivationState["market"]>;
  readonly preview: () => bigint;
}

function createQuoteDraft(
  limit: InputLimit,
  state: DerivationContextState,
): QuoteDraft {
  const fee = limit.referralFee ?? 0n;
  const quote: QuoteDraft["quote"] = {};
  const exactFields: ScalarQuoteField[] = [];
  return {
    quote,
    exactFields,
    inactiveFields: [],
    fee,
    reallocationPenalty: limit.reallocationPenalty ?? 0n,
    state,
    exact: (field, value) => {
      quote[field] = value;
      exactFields.push(field);
    },
    net: (assets, penalty = 0n) => {
      if (penalty > 0n && penalty >= assets) {
        throw new SimulationValidationError("Invalid reallocation penalty", [
          `limits.operations[${state.operationIndex ?? 0}].reallocationPenalty: must be less than the gross proceeds`,
        ]);
      }
      const remaining = assets - penalty;
      return remaining - MathLib.wMulDown(remaining, fee);
    },
    market: () => {
      if (state.market === undefined) {
        throw new SlippageCheckUnavailableError(
          `Missing accrued market state for "${limit.type}".`,
          {
            operationIndex: state.operationIndex ?? 0,
            operationType: limit.type,
            field: "market",
            reason: "missingRead",
          },
        );
      }
      return state.market;
    },
    preview: () => {
      if (state.preview === undefined) {
        throw new SlippageCheckUnavailableError(
          `Missing vault preview for "${limit.type}".`,
          {
            operationIndex: state.operationIndex ?? 0,
            operationType: limit.type,
            field: "preview",
            reason: "missingRead",
          },
        );
      }
      return state.preview;
    },
  };
}

function deriveVaultQuote(
  limit: InputLimitOf<
    | "vaultV1MigrateToV2"
    | "vaultV1Deposit"
    | "vaultV2Deposit"
    | "vaultV1Withdraw"
    | "vaultV2Withdraw"
    | "vaultV1Redeem"
    | "vaultV2Redeem"
  >,
  { quote, exact, net, preview, state }: QuoteDraft,
): void {
  switch (limit.type) {
    case "vaultV1MigrateToV2": {
      const withdrawn = limit.inputs.assets ?? preview();
      if (limit.inputs.shares === undefined) {
        exact("sharesBurned", preview());
      } else {
        exact("sharesBurned", limit.inputs.shares);
      }
      const target = state.targetVault;
      if (target === undefined) {
        throw new SlippageCheckUnavailableError(
          "Missing target vault conversion state for migration.",
          {
            operationIndex: state.operationIndex ?? 0,
            operationType: limit.type,
            field: "sharesMinted",
            reason: "missingRead",
          },
        );
      }
      quote.sharesMinted = MathLib.mulDivDown(
        net(withdrawn),
        target.totalSupply + target.virtualShares,
        target.totalAssets + 1n,
      );
      break;
    }
    case "vaultV1Deposit":
    case "vaultV2Deposit":
      exact("assetsPaid", limit.inputs.assets);
      quote.sharesMinted = preview();
      break;
    case "vaultV1Withdraw":
    case "vaultV2Withdraw":
      exact("assetsReceived", net(limit.inputs.assets));
      exact("sharesBurned", preview());
      break;
    case "vaultV1Redeem":
    case "vaultV2Redeem":
      exact("sharesBurned", limit.inputs.shares);
      quote.assetsReceived = net(preview());
      break;
  }
}

function deriveBlueQuote(
  limit: InputLimitOf<
    | "blueSupply"
    | "blueWithdraw"
    | "blueSupplyCollateral"
    | "blueWithdrawCollateral"
    | "blueBorrow"
    | "blueSupplyCollateralBorrow"
  >,
  {
    quote,
    exact,
    net,
    market,
    reallocationPenalty,
    inactiveFields,
  }: QuoteDraft,
): void {
  switch (limit.type) {
    case "blueSupply":
      exact("assetsPaid", limit.inputs.assets);
      quote.sharesMinted = MarketUtils.toSupplyShares(
        net(limit.inputs.assets),
        market(),
        "Down",
      );
      break;
    case "blueWithdraw": {
      const { assets, shares } = limit.inputs;
      if (assets === undefined) {
        exact("sharesBurned", shares);
        quote.assetsReceived = net(
          MarketUtils.toSupplyAssets(shares, market(), "Down"),
          reallocationPenalty,
        );
      } else {
        exact("assetsReceived", net(assets, reallocationPenalty));
        quote.sharesBurned = MarketUtils.toSupplyShares(assets, market(), "Up");
      }
      break;
    }
    case "blueSupplyCollateral":
      exact("assetsPaid", limit.inputs.assets);
      exact("collateralSupplied", limit.inputs.assets);
      break;
    case "blueWithdrawCollateral":
      exact("assetsReceived", limit.inputs.assets);
      exact("collateralWithdrawn", limit.inputs.assets);
      break;
    case "blueBorrow":
      exact("assetsReceived", net(limit.inputs.assets, reallocationPenalty));
      exact(
        "sharesMinted",
        MarketUtils.toBorrowShares(limit.inputs.assets, market(), "Up"),
      );
      break;
    case "blueSupplyCollateralBorrow": {
      const collateral = limit.inputs.collateralAssets;
      const borrow = limit.inputs.borrowAssets;
      if (collateral === undefined) {
        quote.assetsPaid = INACTIVE_LEG_CAP;
        quote.collateralSupplied = 0n;
        inactiveFields.push("collateralSupplied");
      } else {
        exact("assetsPaid", collateral);
        exact("collateralSupplied", collateral);
      }
      if (borrow === undefined) {
        quote.sharesMinted = INACTIVE_LEG_CAP;
        inactiveFields.push("sharesMinted");
      } else {
        exact("assetsReceived", net(borrow, reallocationPenalty));
        exact(
          "sharesMinted",
          MarketUtils.toBorrowShares(borrow, market(), "Up"),
        );
      }
      break;
    }
  }
}

function deriveBlueRepayQuote(
  limit: InputLimitOf<"blueRepay" | "blueRepayWithdrawCollateral">,
  { quote, exact, market, fee, state, inactiveFields }: QuoteDraft,
): void {
  switch (limit.type) {
    case "blueRepay":
    case "blueRepayWithdrawCollateral": {
      const repay =
        limit.type === "blueRepay" ? limit.inputs : limit.inputs.repay;
      if (repay === undefined) {
        quote.assetsPaid = INACTIVE_LEG_CAP;
        quote.sharesMinted = 0n;
        inactiveFields.push("sharesMinted");
      } else if (repay !== "full" && repay.assets !== undefined) {
        exact(
          "assetsPaid",
          repay.assets +
            MathLib.mulDivDown(repay.assets, fee, MathLib.WAD - fee),
        );
        quote.sharesBurned = MarketUtils.toBorrowShares(
          repay.assets,
          market(),
          "Down",
        );
      } else {
        const shares = repay === "full" ? state.borrowShares : repay.shares;
        if (shares === undefined) {
          throw new SlippageCheckUnavailableError(
            `Missing owner debt for "${limit.type}" full repayment.`,
            {
              operationIndex: state.operationIndex ?? 0,
              operationType: limit.type,
              field: "sharesBurned",
              reason: "missingRead",
            },
          );
        }
        exact("sharesBurned", shares);
        const assets = MarketUtils.toBorrowAssets(shares, market(), "Up");
        quote.assetsPaid =
          assets + MathLib.mulDivDown(assets, fee, MathLib.WAD - fee);
      }
      if (limit.type === "blueRepayWithdrawCollateral") {
        const collateral = limit.inputs.collateralAssets;
        if (collateral === undefined) {
          quote.collateralWithdrawn = 0n;
          inactiveFields.push("collateralWithdrawn");
        } else {
          exact("collateralWithdrawn", collateral);
          exact("assetsReceived", collateral);
        }
      }
      break;
    }
  }
}

/** Derive expectations from user amounts and before-state, never calldata. @internal */
export function deriveQuote(
  limit: ParsedOperationLimit,
  state: DerivationState & { readonly operationIndex?: number },
): ParsedOperationLimit {
  if (limit.inputs === undefined) {
    return limit;
  }
  const draft = createQuoteDraft(limit, state);
  // The matching branch fills the draft from the before-state.
  switch (limit.type) {
    case "vaultV1MigrateToV2":
    case "vaultV1Deposit":
    case "vaultV2Deposit":
    case "vaultV1Withdraw":
    case "vaultV2Withdraw":
    case "vaultV1Redeem":
    case "vaultV2Redeem":
      deriveVaultQuote(limit, draft);
      break;
    case "blueSupply":
    case "blueWithdraw":
    case "blueSupplyCollateral":
    case "blueWithdrawCollateral":
    case "blueBorrow":
    case "blueSupplyCollateralBorrow":
      deriveBlueQuote(limit, draft);
      break;
    case "blueRepay":
    case "blueRepayWithdrawCollateral":
      deriveBlueRepayQuote(limit, draft);
      break;
  }
  const netWalletAssets =
    state.netWalletAssets === true &&
    ((limit.type === "blueSupplyCollateralBorrow" &&
      limit.inputs.collateralAssets !== undefined &&
      limit.inputs.borrowAssets !== undefined) ||
      (limit.type === "blueRepayWithdrawCollateral" &&
        limit.inputs.repay !== undefined &&
        limit.inputs.collateralAssets !== undefined));
  if (netWalletAssets) {
    const { assetsReceived, assetsPaid } = draft.quote;
    if (assetsReceived === undefined || assetsPaid === undefined) {
      throw new SlippageCheckUnavailableError(
        "Cannot derive net wallet assets without both wallet sides.",
        {
          operationIndex: state.operationIndex ?? 0,
          operationType: limit.type,
          field: assetsReceived === undefined ? "assetsReceived" : "assetsPaid",
          reason: "missingRead",
        },
      );
    }
    const received = assetsReceived - assetsPaid;
    draft.quote.assetsReceived = received;
    draft.quote.assetsPaid = MathLib.max(0n, -received);
    const receivedIndex = draft.exactFields.indexOf("assetsReceived");
    if (!draft.exactFields.includes("assetsPaid") && receivedIndex >= 0) {
      draft.exactFields.splice(receivedIndex, 1);
    }
  }
  const derivedFields = limit.derivedFields ?? [];
  for (const field of derivedFields) {
    if (
      draft.quote[field] === 0n &&
      !draft.inactiveFields.includes(field) &&
      !(
        netWalletAssets &&
        (field === "assetsPaid" || field === "assetsReceived")
      )
    ) {
      throw new SlippageCheckUnavailableError(
        `Derived "${field}" is zero for "${limit.type}". Increase the amount or supply an explicit quote.`,
        {
          operationIndex: state.operationIndex ?? 0,
          operationType: limit.type,
          field: field,
          reason: "zeroDerivedAmount",
        },
      );
    }
  }
  const mergedQuote: SlippageQuote = {
    ...draft.quote,
    ...Object.fromEntries(
      Object.entries(limit.quote).filter(
        ([key]) => !derivedFields.includes(key as ScalarQuoteField),
      ),
    ),
  };
  const errors = requiredQuoteErrors({
    type: limit.type,
    quote: mergedQuote,
    path: `limits.operations[${state.operationIndex ?? 0}]`,
  });
  if (errors.length > 0) {
    throw new SimulationValidationError(
      "Derived quote is missing required sides. Supply the active leg's inputs or quote its required sides.",
      errors,
    );
  }
  return {
    ...limit,
    quote: mergedQuote,
    exactFields: draft.exactFields.filter((field) =>
      derivedFields.includes(field),
    ),
    inactiveFields: draft.inactiveFields,
  };
}
