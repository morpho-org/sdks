import {
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import type { ChainAddresses } from "@morpho-org/morpho-ts";
import { type Address, maxUint256, zeroAddress, zeroHash } from "viem";
import {
  approval,
  checked,
  decode,
  innerCall,
  mainCall,
  requireAccount,
  requireAmount,
  requireFee,
  requireNativeBudget,
  requireTarget,
  sameAddress,
  sameHex,
  uint,
} from "./checks.js";
import {
  CalldataAmountError,
  CalldataCallError,
  CalldataFeeError,
  CalldataTargetError,
  CalldataUnsupportedError,
} from "./errors.js";
import type {
  CalldataCall,
  DecodedCalldataCall,
  MidnightMarketIntent,
  MidnightTakeIntent,
} from "./types.js";

type Intent = MidnightMarketIntent | MidnightTakeIntent;

type Context = {
  readonly intent: Intent;
  readonly chain: ChainAddresses;
  readonly call: CalldataCall;
};
type BundleCall = ReturnType<typeof decode<typeof midnightBundlesV2Abi>>;
type Transfer = { readonly collateralIndex: bigint; readonly assets: bigint };
type TokenPull = { readonly token: Address; readonly assets: bigint };
type RequestedTransfer = {
  readonly collateral: { readonly address: Address };
  readonly amount:
    | { readonly unit: "all" }
    | { readonly unit: "assets"; readonly value: string };
};
type Market = Extract<
  BundleCall,
  { functionName: "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral" }
>["args"][0];

function isTake(intent: Intent): intent is MidnightTakeIntent {
  return (
    intent.action === "midnight.take_borrow" ||
    intent.action === "midnight.supply_collateral_take_borrow" ||
    intent.action === "midnight.take_lend"
  );
}

function requireMarket(market: Market, { intent, chain, call }: Context) {
  try {
    if (
      market.collateralParams.every((collateral, index) => {
        const previous = market.collateralParams[index - 1];
        return (
          previous == null ||
          MarketUtils.compareCollateralTokens(previous, collateral) < 0
        );
      }) &&
      BigInt(market.chainId) === BigInt(intent.chain_id) &&
      sameAddress(market.midnight, chain.midnight) &&
      sameHex(
        MarketUtils.toId(market),
        isTake(intent) ? intent.market_id : intent.market,
      )
    ) {
      return;
    }
  } catch (cause) {
    throw new CalldataTargetError("market", { callId: call.id, cause });
  }
  throw new CalldataTargetError("market", call.id);
}

function assetsMatch(
  assets: bigint,
  {
    requested,
    withdrawal,
    call,
  }: {
    requested: RequestedTransfer["amount"];
    withdrawal: "core" | "bundle" | undefined;
    call: CalldataCall;
  },
) {
  const all = requested?.unit === "all" && withdrawal !== undefined;
  if (requested?.unit !== "assets" && !all) {
    throw new CalldataAmountError("collateral.amount.unit", call.id);
  }
  if (
    assets === 0n ||
    (withdrawal === "bundle" && assets === maxUint256 && !all)
  ) {
    throw new CalldataAmountError("collateral.amount", call.id);
  }
  if (requested.unit === "all") {
    return;
  }
  requireAmount(assets, {
    expected: uint(requested.value, { field: "collateral.amount", call }),
    call,
    field: "collateral.amount",
  });
}

function checkCollateral(
  transfers: readonly Transfer[],
  {
    requested,
    market,
    call,
    withdrawal,
  }: {
    requested: readonly RequestedTransfer[];
    market: Market;
    call: CalldataCall;
    withdrawal?: "core" | "bundle";
  },
) {
  if (!Array.isArray(requested) || transfers.length !== requested.length) {
    throw new CalldataCallError("collateral", call.id);
  }
  const seen = new Set<string>();
  return transfers.map(({ collateralIndex, assets }) => {
    const token = market.collateralParams[Number(collateralIndex)]?.token;
    const match = requested.find((item) =>
      sameAddress(item?.collateral?.address, token),
    );
    if (token == null || match == null || seen.has(token.toLowerCase())) {
      throw new CalldataTargetError("collateral", call.id);
    }
    seen.add(token.toLowerCase());
    assetsMatch(assets, { requested: match.amount, withdrawal, call });
    return { token, assets };
  });
}

function noValue(call: CalldataCall) {
  requireAmount(uint(call.value, { field: "value", call }), {
    expected: 0n,
    call,
    field: "value",
  });
}

function checkPrerequisites(
  calls: readonly CalldataCall[],
  {
    intent,
    chain,
    call: main,
    pulls,
    allowAuthorization,
  }: Context & {
    pulls: readonly TokenPull[];
    allowAuthorization: boolean;
  },
) {
  let authorized = false;
  const approved = new Map<string, bigint>();
  return calls.map((call, index) => {
    if (sameAddress(call.to, chain.midnight)) {
      noValue(call);
      const decoded = decode(call, { abi: midnightAbi });
      if (
        !allowAuthorization ||
        authorized ||
        decoded.functionName !== "setIsAuthorized" ||
        !decoded.args[1]
      ) {
        throw new CalldataCallError("authorization", call.id);
      }
      const [spender, , owner] = decoded.args;
      if (!sameAddress(spender, chain.midnightBundlesV2)) {
        throw new CalldataTargetError("authorization.spender", call.id);
      }
      requireAccount(owner, {
        expected: intent.account,
        call,
        field: "on_behalf",
      });
      authorized = true;
      return checked(call, decoded);
    }
    const pull = pulls.find((candidate) =>
      sameAddress(call.to, candidate.token),
    );
    if (pull == null) {
      throw new CalldataTargetError("approval.token", call.id);
    }
    const { token, assets } = pull;
    const verified = approval(call, {
      spender: main.to,
      token,
      minAmount: assets,
      allowReset: sameAddress(calls[index + 1]?.to, token),
    });
    const [, amount] = verified.args;
    const key = token.toLowerCase();
    const previous = approved.get(key);
    if (previous != null && (previous !== 0n || amount === 0n)) {
      throw new CalldataCallError("approval", call.id);
    }
    approved.set(key, amount);
    return verified.call;
  });
}

function checkCore(calls: readonly CalldataCall[], context: Context) {
  const { intent, chain, call } = context;
  requireTarget(call, chain.midnight);
  noValue(call);
  const decoded = decode(call, { abi: midnightAbi });
  if (
    intent.action === "midnight.supply_collateral" &&
    decoded.functionName === "supplyCollateral"
  ) {
    const [market, collateralIndex, assets, owner] = decoded.args;
    requireMarket(market, context);
    requireAccount(owner, {
      expected: intent.account,
      call,
      field: "on_behalf",
    });
    const collateral = checkCollateral([{ collateralIndex, assets }], {
      requested: [intent],
      market,
      call,
    });
    return [
      ...checkPrerequisites(calls, {
        ...context,
        pulls: collateral,
        allowAuthorization: false,
      }),
      checked(call, decoded),
    ];
  }
  if (calls.length !== 0) {
    throw new CalldataCallError("calls", call.id);
  }
  if (intent.action === "midnight.withdraw_collateral") {
    return [
      checkCoreWithdrawals(decoded, {
        ...context,
        requested: intent.collateral_withdrawals,
      }),
    ];
  }
  if (
    (intent.action === "midnight.withdraw" ||
      intent.action === "midnight.redeem") &&
    decoded.functionName === "withdraw"
  ) {
    const [market, units, owner, receiver] = decoded.args;
    requireMarket(market, context);
    requireAccount(owner, {
      expected: intent.account,
      call,
      field: "on_behalf",
    });
    requireAccount(receiver, {
      expected: intent.account,
      call,
      field: "receiver",
    });
    const amount = intent.amount;
    if (
      amount?.unit !== "all" &&
      amount?.unit !== "units" &&
      amount?.unit !== "assets"
    ) {
      throw new CalldataAmountError("amount.unit", call.id);
    }
    if (units === 0n) {
      throw new CalldataAmountError("amount", call.id);
    }
    if (amount.unit !== "all") {
      requireAmount(units, {
        expected: uint(amount.value, { field: "amount", call }),
        call,
      });
    }
    checkAmountGuard({ unit: "units", target: units, bound: units }, context);
    return [checked(call, decoded)];
  }
  throw new CalldataCallError("function", call.id);
}

function checkCoreWithdrawals(
  decoded: ReturnType<typeof decode<typeof midnightAbi>>,
  context: Context & { requested: readonly RequestedTransfer[] },
) {
  const { call, intent, requested } = context;
  const entries =
    decoded.functionName === "multicall"
      ? decoded.args[0].map((data, index) => {
          const child = innerCall(call, { data, index });
          return {
            call: child,
            decoded: decode(child, { abi: midnightAbi, nested: true }),
          };
        })
      : [{ call, decoded }];
  const transfers = entries.map(({ call: child, decoded: entry }) => {
    if (entry.functionName !== "withdrawCollateral") {
      throw new CalldataCallError("function", child.id);
    }
    const [market, collateralIndex, assets, owner, receiver] = entry.args;
    requireMarket(market, { ...context, call: child });
    requireAccount(owner, {
      expected: intent.account,
      call: child,
      field: "on_behalf",
    });
    requireAccount(receiver, {
      expected: intent.account,
      call: child,
      field: "receiver",
    });
    return { market, collateralIndex, assets, result: checked(child, entry) };
  });
  const [first] = transfers;
  if (!first) {
    throw new CalldataCallError("collateral", call.id);
  }
  checkCollateral(transfers, {
    requested,
    market: first.market,
    call,
    withdrawal: "core",
  });
  return decoded.functionName === "multicall"
    ? checked(call, {
        ...decoded,
        calls: transfers.map(({ result }) => result),
      })
    : first.result;
}

function checkNative(
  wrappedNative: Address,
  {
    intent,
    chain,
    call,
    cap,
    requireValue = false,
  }: Context & { cap: bigint; requireValue?: boolean },
) {
  const value = uint(call.value, { field: "value", call });
  if (
    !requireValue &&
    value === 0n &&
    sameAddress(wrappedNative, zeroAddress)
  ) {
    return;
  }
  if (
    value === 0n ||
    !sameAddress(wrappedNative, chain.wNative) ||
    value > cap
  ) {
    throw new CalldataAmountError("value", call.id);
  }
  requireNativeBudget(value, {
    funding: "funding" in intent ? intent.funding : undefined,
    call,
  });
}

function checkTargetAmount(
  amount:
    | { readonly unit: "assets" | "units"; readonly value: string }
    | { readonly unit: "all" },
  {
    unit,
    target,
    call,
    allowZero = false,
  }: {
    unit: "assets" | "units";
    target: bigint;
    call: CalldataCall;
    allowZero?: boolean;
  },
) {
  if (amount?.unit === "all") {
    if (unit !== "units" || target !== maxUint256) {
      throw new CalldataAmountError("amount", call.id);
    }
    return;
  }
  if (
    amount?.unit !== unit ||
    target === maxUint256 ||
    (target === 0n && !allowZero)
  ) {
    throw new CalldataAmountError("amount", call.id);
  }
  requireAmount(target, {
    expected: uint(amount.value, { field: "amount", call }),
    call,
  });
}

function checkAmountBound(
  bound: bigint,
  {
    call,
    guard,
  }: {
    call: CalldataCall;
    guard: {
      readonly type: "min_units" | "min_assets" | "max_assets" | "max_units";
      readonly value: string;
    };
  },
) {
  const requested = uint(guard.value, { field: "guard.value", call });
  const minimum = guard.type === "min_units" || guard.type === "min_assets";
  if (minimum ? bound < requested : bound > requested) {
    throw new CalldataAmountError("guard.value", call.id);
  }
}

const guardSides: Partial<Record<Intent["action"], "buy" | "sell">> = {
  "midnight.lend": "buy",
  "midnight.market_repay": "buy",
  "midnight.take_lend": "buy",
  "midnight.borrow": "sell",
  "midnight.take_borrow": "sell",
  "midnight.supply_collateral_take_borrow": "sell",
  "midnight.withdraw": "sell",
  "midnight.redeem": "sell",
};

function checkGuardType({ intent, call }: Context) {
  const guard = "guard" in intent ? intent.guard : undefined;
  if (guard === undefined || guard?.type === "slippage") {
    return;
  }
  const side = guardSides[intent.action];
  if (
    (side === "buy" &&
      (guard?.type === "min_units" || guard?.type === "max_assets")) ||
    (side === "sell" &&
      (guard?.type === "max_units" || guard?.type === "min_assets"))
  ) {
    return;
  }
  throw new CalldataUnsupportedError("guard.type", call.id);
}

function checkAmountGuard(
  {
    unit,
    target,
    bound,
  }: { unit: "assets" | "units"; target: bigint; bound: bigint },
  { intent, call }: Context,
) {
  const guard = "guard" in intent ? intent.guard : undefined;
  switch (guard?.type) {
    case "min_assets":
    case "max_assets":
      checkAmountBound(unit === "assets" ? target : bound, {
        guard: { type: guard.type, value: guard.value },
        call,
      });
      break;
    case "min_units":
    case "max_units":
      checkAmountBound(unit === "units" ? target : bound, {
        guard: { type: guard.type, value: guard.value },
        call,
      });
      break;
    case "slippage":
    case "min_rate":
    case "max_rate":
    case undefined:
      break;
  }
}

function checkBuy(
  decoded: Extract<
    BundleCall,
    {
      functionName:
        | "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
        | "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral";
    }
  >,
  context: Context,
) {
  const { intent, call } = context;
  if (
    intent.action !== "midnight.lend" &&
    intent.action !== "midnight.take_lend" &&
    intent.action !== "midnight.repay" &&
    intent.action !== "midnight.market_repay"
  ) {
    throw new CalldataCallError("function", call.id);
  }
  const [
    market,
    target,
    bound,
    reduceOnly,
    repayEnabled,
    fills,
    withdrawals,
    receiver,
    pct,
    recipient,
    ,
    ,
    wrappedNative,
  ] = decoded.args;
  requireMarket(market, context);
  const direct = intent.action === "midnight.repay";
  const lend =
    intent.action === "midnight.lend" || intent.action === "midnight.take_lend";
  if (
    reduceOnly === lend ||
    repayEnabled !== direct ||
    (direct ? fills.length !== 0 : fills.length === 0)
  ) {
    throw new CalldataCallError("repay", call.id);
  }
  const unit =
    decoded.functionName ===
    "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
      ? "assets"
      : "units";
  if (
    direct
      ? intent.amount?.unit !== "all" && intent.amount?.unit !== "assets"
      : intent.amount?.unit !== "assets" && intent.amount?.unit !== "units"
  ) {
    throw new CalldataAmountError("amount.unit", call.id);
  }
  checkTargetAmount(intent.amount, {
    unit,
    target,
    call,
    allowZero: direct && withdrawals.length > 0,
  });
  if (direct && unit === "assets") {
    requireAmount(bound, { expected: target, call, field: "min_units" });
  }
  if (
    direct &&
    intent.amount.unit === "all" &&
    (bound === 0n || bound === maxUint256)
  ) {
    throw new CalldataAmountError("max_assets", call.id);
  }
  checkAmountGuard({ unit, target, bound }, context);
  const requested =
    (intent.action === "midnight.repay" ||
      intent.action === "midnight.market_repay") &&
    intent.collateral_withdrawals !== undefined
      ? intent.collateral_withdrawals
      : [];
  checkCollateral(withdrawals, {
    requested,
    market,
    call,
    withdrawal: "bundle",
  });
  if (withdrawals.length !== 0 || !sameAddress(receiver, zeroAddress)) {
    requireAccount(receiver, {
      expected: intent.account,
      call,
      field: "collateral_receiver",
    });
  }
  checkFills(fills, { ...context, buy: false });
  checkFee({ pct, recipient }, context);
  const maxAssets = unit === "assets" ? target : bound;
  checkNative(wrappedNative, {
    ...context,
    cap: sameAddress(wrappedNative, market.loanToken) ? maxAssets : 0n,
  });
  return maxAssets === 0n
    ? []
    : [{ token: market.loanToken, assets: maxAssets }];
}

function checkSell(
  decoded: Extract<
    BundleCall,
    {
      functionName:
        | "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget"
        | "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget";
    }
  >,
  context: Context,
) {
  const { intent, call } = context;
  if (
    intent.action !== "midnight.borrow" &&
    intent.action !== "midnight.take_borrow" &&
    intent.action !== "midnight.supply_collateral_take_borrow" &&
    intent.action !== "midnight.withdraw"
  ) {
    throw new CalldataCallError("function", call.id);
  }
  const [
    market,
    target,
    bound,
    reduceOnly,
    receiver,
    supplies,
    fills,
    pct,
    recipient,
    ,
    wrappedNative,
  ] = decoded.args;
  requireMarket(market, context);
  const withdraw = intent.action === "midnight.withdraw";
  if (
    reduceOnly !== withdraw ||
    fills.length === 0 ||
    intent.amount?.unit === "all"
  ) {
    throw new CalldataCallError("offers", call.id);
  }
  const unit =
    decoded.functionName ===
    "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget"
      ? "assets"
      : "units";
  checkTargetAmount(intent.amount, { unit, target, call });
  checkAmountGuard({ unit, target, bound }, context);
  requireAccount(receiver, {
    expected: intent.account,
    call,
    field: "receiver",
  });
  checkFills(fills, { ...context, buy: true });
  checkFee({ pct, recipient }, context);
  const collateral = checkCollateral(supplies, {
    requested:
      (intent.action === "midnight.borrow" ||
        intent.action === "midnight.supply_collateral_take_borrow") &&
      intent.collateral_supplies !== undefined
        ? intent.collateral_supplies
        : [],
    market,
    call,
  });
  const nativeCollateral = collateral.find(({ token }) =>
    sameAddress(token, wrappedNative),
  );
  checkNative(wrappedNative, {
    ...context,
    cap: nativeCollateral?.assets ?? 0n,
  });
  return collateral;
}

function checkSupplyCollateralWithNative(
  decoded: Extract<
    BundleCall,
    { functionName: "midnightBundlesV2CancelAndMake" }
  >,
  context: Context,
) {
  const { intent, call } = context;
  if (intent.action !== "midnight.supply_collateral") {
    throw new CalldataCallError("function", call.id);
  }
  const [
    blueMarket,
    assetsToPark,
    callbackSalt,
    market,
    supplies,
    ratifier,
    newRoot,
    signatureHeight,
    signatureNonce,
    signatureDeadline,
    v,
    r,
    s,
    groupsToCancel,
    payload,
    deadline,
    wrappedNative,
  ] = decoded.args;
  const emptyBlueMarket =
    sameAddress(blueMarket.loanToken, zeroAddress) &&
    sameAddress(blueMarket.collateralToken, zeroAddress) &&
    sameAddress(blueMarket.oracle, zeroAddress) &&
    sameAddress(blueMarket.irm, zeroAddress) &&
    blueMarket.lltv === 0n;
  const emptyPublication =
    sameAddress(ratifier, zeroAddress) &&
    sameHex(newRoot, zeroHash) &&
    signatureHeight === 0n &&
    signatureNonce === 0n &&
    signatureDeadline === 0n &&
    v === 0 &&
    sameHex(r, zeroHash) &&
    sameHex(s, zeroHash) &&
    groupsToCancel.length === 0 &&
    sameHex(payload, "0x");
  if (
    !emptyBlueMarket ||
    assetsToPark !== 0n ||
    !sameHex(callbackSalt, zeroHash) ||
    !emptyPublication
  ) {
    throw new CalldataCallError("cancel_and_make", call.id);
  }
  if (deadline === 0n) {
    throw new CalldataAmountError("deadline", call.id);
  }
  requireMarket(market, context);
  const collateral = checkCollateral(supplies, {
    requested: [intent],
    market,
    call,
  });
  const nativeCollateral = collateral.find(({ token }) =>
    sameAddress(token, wrappedNative),
  );
  checkNative(wrappedNative, {
    ...context,
    cap: nativeCollateral?.assets ?? 0n,
    requireValue: true,
  });
  return collateral;
}

function checkFills(
  fills: readonly {
    readonly offer: {
      readonly market: Market;
      readonly buy: boolean;
      readonly maker: Address;
      readonly group: `0x${string}`;
      readonly reduceOnly: boolean;
    };
    readonly units: bigint;
  }[],
  context: Context & { buy: boolean },
) {
  for (const { offer, units } of fills) {
    requireMarket(offer.market, context);
    if (
      offer.buy !== context.buy ||
      units === 0n ||
      sameAddress(offer.maker, context.intent.account)
    ) {
      throw new CalldataCallError("offer_fills", context.call.id);
    }
    if (isTake(context.intent)) {
      const { group, maker } = context.intent;
      if (!sameHex(offer.group, group)) {
        throw new CalldataTargetError("group", context.call.id);
      }
      if (offer.reduceOnly) {
        throw new CalldataUnsupportedError(
          "offer.reduce_only",
          context.call.id,
        );
      }
      if (!sameAddress(offer.maker, maker ?? fills[0]?.offer.maker)) {
        throw new CalldataCallError("offer_fills", context.call.id);
      }
    }
  }
}

function checkFee(
  { pct, recipient }: { pct: bigint; recipient: Address },
  { intent, call }: Context,
) {
  if (pct >= 10n ** 18n) {
    throw new CalldataFeeError("referral_fee", call.id);
  }
  requireFee(
    { pct, recipient },
    {
      intent: {
        ...intent,
        referral_fee:
          intent.action !== "midnight.repay" &&
          intent.action !== "midnight.market_repay" &&
          "referral_fee" in intent
            ? intent.referral_fee
            : undefined,
      },
      call,
    },
  );
}

function verifyMidnight(
  intent: Intent,
  {
    calls,
    chain,
  }: {
    readonly calls: readonly CalldataCall[];
    readonly chain: ChainAddresses;
  },
): readonly DecodedCalldataCall[] {
  const call = mainCall(calls, Number.MAX_SAFE_INTEGER);
  const context = { intent, chain, call };
  checkGuardType(context);
  if (isTake(intent)) {
    if (intent.market_id == null) {
      throw new CalldataUnsupportedError("market_id", call.id);
    }
    if (
      typeof intent.group !== "string" ||
      !/^0x[0-9a-f]{64}$/i.test(intent.group)
    ) {
      throw new CalldataTargetError("group", call.id);
    }
  }
  const prerequisites = calls.slice(0, -1);
  if (sameAddress(call.to, chain.midnight)) {
    return checkCore(prerequisites, context);
  }
  requireTarget(call, chain.midnightBundlesV2);
  const decoded = decode(call, { abi: midnightBundlesV2Abi });
  let pulls: readonly TokenPull[];
  switch (decoded.functionName) {
    case "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral":
    case "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral":
      pulls = checkBuy(decoded, context);
      break;
    case "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget":
    case "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget":
      pulls = checkSell(decoded, context);
      break;
    case "midnightBundlesV2CancelAndMake":
      pulls = checkSupplyCollateralWithNative(decoded, context);
      break;
    default:
      throw new CalldataCallError("function", call.id);
  }
  return [
    ...checkPrerequisites(prerequisites, {
      ...context,
      pulls,
      allowAuthorization: true,
    }),
    checked(call, decoded),
  ];
}

function verifyRepay(
  intent: Extract<Intent, { type: "direct" | "market" }>,
  context: Parameters<typeof verifyMidnight>[1],
) {
  const expected = intent.action === "midnight.repay" ? "direct" : "market";
  if (intent.type !== expected) {
    const call = mainCall(context.calls, Number.MAX_SAFE_INTEGER);
    throw new CalldataCallError("type", call.id);
  }
  return verifyMidnight(intent, context);
}

/** @internal */
export const midnightRules = {
  "midnight.borrow": verifyMidnight,
  "midnight.lend": verifyMidnight,
  "midnight.repay": verifyRepay,
  "midnight.market_repay": verifyRepay,
  "midnight.withdraw": verifyMidnight,
  "midnight.redeem": verifyMidnight,
  "midnight.supply_collateral": verifyMidnight,
  "midnight.withdraw_collateral": verifyMidnight,
  "midnight.take_borrow": verifyMidnight,
  "midnight.supply_collateral_take_borrow": (
    intent: Extract<
      Intent,
      { action: "midnight.supply_collateral_take_borrow" }
    >,
    context: Parameters<typeof verifyMidnight>[1],
  ) => {
    if (!intent.collateral_supplies?.length) {
      const call = mainCall(context.calls, Number.MAX_SAFE_INTEGER);
      throw new CalldataCallError("collateral_supplies", call.id);
    }
    return verifyMidnight(intent, context);
  },
  "midnight.take_lend": verifyMidnight,
};
