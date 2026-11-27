import { InvalidBigIntInputError } from "../../types/error.js";
import { InvalidTransactionPlanError } from "../error.js";
import { getPlanObject, validatePlanFields } from "../validation.js";
import { validateSignaturelessMidnightAction } from "./authorization.js";

/** @internal Reports an invalid sell target discriminator in an input or stored recipe. */
export function invalidSellTargetType(targetPath: string) {
  return new InvalidTransactionPlanError({
    path: `${targetPath}.type`,
    reason: "expected assets or units",
  });
}

/** @internal Validates a stored sell recipe shape without encoding or reading market state. */
export function validateMidnightSellPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputsPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputsPath);
  validatePlanFields(inputs, {
    path: inputsPath,
    fields: {
      receiver: "address",
      deadline: "uint256 bigint",
      referralFeePct: "uint256 bigint",
      referralFeeRecipient: "address",
    },
  });
  const targetPath = `${inputsPath}.target`;
  const target = getPlanObject(inputs.target, targetPath);
  switch (target.type) {
    case "assets":
      validatePlanFields(target, {
        path: targetPath,
        fields: { assets: "uint128 bigint", maxUnits: "uint128 bigint" },
      });
      break;
    case "units":
      validatePlanFields(target, {
        path: targetPath,
        fields: { units: "uint128 bigint", minSellerAssets: "uint128 bigint" },
      });
      break;
    default:
      throw invalidSellTargetType(targetPath);
  }
  const chainId = inputs.chainId as number; // Checked by the parse dispatcher.
  validateStoredMidnightMarket(inputs.market, {
    path: `${inputsPath}.market`,
    chainId,
  });
  validateStoredMidnightFills(inputs.takeableOffers, {
    path: `${inputsPath}.takeableOffers`,
    chainId,
  });
  validateSignaturelessMidnightAction(action, path);
}

type StoredMarketContext = {
  readonly path: string;
  readonly chainId: number;
};

/** @internal Validates the plain market tuple used by a restored Midnight plan. */
export function validateStoredMidnightMarket(
  value: unknown,
  { path, chainId }: StoredMarketContext,
): void {
  const market = getPlanObject(value, path);
  validatePlanFields(market, {
    path,
    fields: {
      chainId: "uint256 bigint",
      midnight: "address",
      loanToken: "address",
      maturity: "uint256 bigint",
      rcfThreshold: "uint256 bigint",
      enterGate: "address",
      liquidatorGate: "address",
    },
  });
  if (market.chainId !== BigInt(chainId)) {
    throw new InvalidTransactionPlanError({
      path: `${path}.chainId`,
      reason: "expected the plan chainId",
    });
  }
  if (!Array.isArray(market.collateralParams)) {
    throw new InvalidTransactionPlanError({
      path: `${path}.collateralParams`,
      reason: "expected an array",
    });
  }
  for (const [index, item] of market.collateralParams.entries()) {
    const collateralPath = `${path}.collateralParams[${index}]`;
    validatePlanFields(getPlanObject(item, collateralPath), {
      path: collateralPath,
      fields: {
        token: "address",
        oracle: "address",
        lltv: "uint256 bigint",
        liquidationCursor: "uint256 bigint",
      },
    });
  }
}

/** @internal Validates ABI-ready quote fields without testing onchain fill availability. */
export function validateStoredMidnightFills(
  value: unknown,
  { path, chainId }: StoredMarketContext,
): void {
  if (!Array.isArray(value)) {
    throw new InvalidTransactionPlanError({
      path,
      reason: "expected an array",
    });
  }
  for (const [index, item] of value.entries()) {
    const fillPath = `${path}[${index}]`;
    const fill = getPlanObject(item, fillPath);
    validatePlanFields(fill, {
      path: fillPath,
      fields: { units: "uint256 bigint", ratifierData: "hex" },
    });
    const offerPath = `${fillPath}.offer`;
    const offer = getPlanObject(fill.offer, offerPath);
    validatePlanFields(offer, {
      path: offerPath,
      fields: {
        buy: "boolean",
        maker: "address",
        start: "uint256 bigint",
        expiry: "uint256 bigint",
        tick: "uint256 bigint",
        group: "bytes32",
        callback: "address",
        callbackData: "hex",
        receiverIfMakerIsSeller: "address",
        ratifier: "address",
        reduceOnly: "boolean",
        maxUnits: "uint128 bigint",
        maxAssets: "uint128 bigint",
        continuousFeeCap: "uint256 bigint",
      },
    });
    // The offer's market tuple is independently present in the quote.
    validateStoredMidnightMarket(offer.market, {
      path: `${offerPath}.market`,
      chainId,
    });
  }
}

/**
 * @internal Rejects a non-bigint take target amount before any read, so a JavaScript caller's
 * number fails at preparation instead of when the saved plan is restored.
 * @param target - Caller's take target.
 * @param fields - Amount fields of the target's variant.
 * @throws {InvalidBigIntInputError} If one of `fields` is not a bigint.
 */
export function validateMidnightTargetAmountTypes(
  target: object,
  fields: readonly string[],
): void {
  for (const field of fields) {
    const value = (target as Record<string, unknown>)[field];
    if (typeof value !== "bigint") {
      throw new InvalidBigIntInputError(`target.${field}`, value);
    }
  }
}
