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

/** Derive expectations from user amounts and before-state, never calldata. @internal */
export function deriveQuote(
  limit: ParsedOperationLimit,
  state: DerivationState & { readonly operationIndex?: number },
): ParsedOperationLimit {
  if (limit.inputs === undefined) return limit;
  const fee = limit.referralFee ?? 0n;
  const net = (assets: bigint, penalty = 0n) => {
    if (penalty > 0n && penalty >= assets)
      throw new SimulationValidationError("Invalid reallocation penalty", [
        `limits.operations[${state.operationIndex ?? 0}].reallocationPenalty: must be less than the gross proceeds`,
      ]);
    const remaining = assets - penalty;
    return remaining - MathLib.wMulDown(remaining, fee);
  };
  const reallocationPenalty = limit.reallocationPenalty ?? 0n;
  const quote: { -readonly [K in keyof SlippageQuote]: SlippageQuote[K] } = {};
  const exactFields: ScalarQuoteField[] = [];
  const inactiveFields: ScalarQuoteField[] = [];
  const exact = (field: ScalarQuoteField, value: bigint) => {
    quote[field] = value;
    exactFields.push(field);
  };
  const market = () => {
    if (state.market === undefined)
      throw new SlippageCheckUnavailableError(
        `Missing accrued market state for "${limit.type}".`,
      );
    return state.market;
  };
  const preview = () => {
    if (state.preview === undefined)
      throw new SlippageCheckUnavailableError(
        `Missing vault preview for "${limit.type}".`,
      );
    return state.preview;
  };
  switch (limit.type) {
    case "vaultV1MigrateToV2": {
      const withdrawn = limit.inputs.assets ?? preview();
      if (limit.inputs.shares !== undefined)
        exact("sharesBurned", limit.inputs.shares);
      else exact("sharesBurned", preview());
      const target = state.targetVault;
      if (target === undefined)
        throw new SlippageCheckUnavailableError(
          "Missing target vault conversion state for migration.",
        );
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
      if (assets !== undefined) {
        exact("assetsReceived", net(assets, reallocationPenalty));
        quote.sharesBurned = MarketUtils.toSupplyShares(assets, market(), "Up");
      } else {
        exact("sharesBurned", shares);
        quote.assetsReceived = net(
          MarketUtils.toSupplyAssets(shares, market(), "Down"),
          reallocationPenalty,
        );
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
      if (collateral !== undefined) {
        exact("assetsPaid", collateral);
        exact("collateralSupplied", collateral);
      } else {
        quote.assetsPaid = INACTIVE_LEG_CAP;
        quote.collateralSupplied = 0n;
        inactiveFields.push("collateralSupplied");
      }
      if (borrow !== undefined) {
        exact("assetsReceived", net(borrow, reallocationPenalty));
        exact(
          "sharesMinted",
          MarketUtils.toBorrowShares(borrow, market(), "Up"),
        );
      } else {
        quote.sharesMinted = INACTIVE_LEG_CAP;
        inactiveFields.push("sharesMinted");
      }
      break;
    }
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
        if (shares === undefined)
          throw new SlippageCheckUnavailableError(
            `Missing owner debt for "${limit.type}" full repayment.`,
          );
        exact("sharesBurned", shares);
        const assets = MarketUtils.toBorrowAssets(shares, market(), "Up");
        quote.assetsPaid =
          assets + MathLib.mulDivDown(assets, fee, MathLib.WAD - fee);
      }
      if (limit.type === "blueRepayWithdrawCollateral") {
        const collateral = limit.inputs.collateralAssets;
        if (collateral !== undefined) {
          exact("collateralWithdrawn", collateral);
          exact("assetsReceived", collateral);
        } else {
          quote.collateralWithdrawn = 0n;
          inactiveFields.push("collateralWithdrawn");
        }
      }
      break;
    }
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
    const received = quote.assetsReceived! - quote.assetsPaid!;
    quote.assetsReceived = received;
    quote.assetsPaid = MathLib.max(0n, -received);
    const receivedIndex = exactFields.indexOf("assetsReceived");
    if (!exactFields.includes("assetsPaid") && receivedIndex >= 0)
      exactFields.splice(receivedIndex, 1);
  }
  const derivedFields = limit.derivedFields ?? [];
  for (const field of derivedFields) {
    if (
      quote[field] === 0n &&
      !inactiveFields.includes(field) &&
      !(
        netWalletAssets &&
        (field === "assetsPaid" || field === "assetsReceived")
      )
    )
      throw new SlippageCheckUnavailableError(
        `Derived "${field}" is zero for "${limit.type}". Increase the amount or supply an explicit quote.`,
      );
  }
  const mergedQuote: SlippageQuote = {
    ...quote,
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
  if (errors.length > 0)
    throw new SimulationValidationError(
      "Derived quote is missing required sides. Supply the active leg's inputs or quote its required sides.",
      errors,
    );
  return {
    ...limit,
    quote: mergedQuote,
    exactFields: exactFields.filter((field) => derivedFields.includes(field)),
    inactiveFields,
  };
}
