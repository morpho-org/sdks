import { blueAbi } from "@morpho-org/blue-sdk-viem";
import {
  BundlesPermitKind,
  blueBundlesV1Abi,
  bundlesPermitParameters,
} from "@morpho-org/morpho-sdk/abis";
import type { ChainAddresses } from "@morpho-org/morpho-ts";
import { marketParamsAbi } from "@morpho-org/morpho-ts/abis";
import {
  type AbiParameterToPrimitiveType,
  type Address,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
  keccak256,
  maxUint256,
  zeroAddress,
  zeroHash,
} from "viem";
import {
  approval,
  checked,
  decode,
  mainCall,
  requireAccount,
  requireAmount,
  requireFee,
  requireNativeBudget,
  requireTarget,
  sameAddress,
  uint,
} from "./checks.js";
import {
  CalldataAmountError,
  CalldataCallError,
  CalldataDecodeError,
  CalldataFeeError,
  CalldataTargetError,
} from "./errors.js";
import type {
  BlueCalldataIntent,
  CalldataCall,
  DecodedCalldataCall,
} from "./types.js";

type MarketParams = AbiParameterToPrimitiveType<typeof marketParamsAbi>;
type Context = {
  readonly calls: readonly CalldataCall[];
  readonly chain: ChainAddresses;
};
type Amount = Extract<BlueCalldataIntent, { action: "blue.repay" }>["amount"];
type SignedAuthorization = {
  readonly signature: { readonly v: number; readonly r: Hex; readonly s: Hex };
};

const DEFAULT_LLTV_BUFFER = 10n ** 18n / 200n;
const erc2612PermitParameters =
  bundlesPermitParameters[BundlesPermitKind.ERC2612];

function checkLtv(
  maxLtv: bigint,
  { lltv, call }: { lltv?: bigint; call: CalldataCall },
) {
  const buffered =
    lltv != null && lltv > DEFAULT_LLTV_BUFFER
      ? lltv - DEFAULT_LLTV_BUFFER
      : 0n;
  const expected = lltv == null ? maxUint256 : buffered;
  requireAmount(maxLtv, { expected, call, field: "max_ltv" });
}

function checkPermit(
  { kind, data }: { kind: number; data: Hex },
  { call, funded }: { call: CalldataCall; funded: boolean },
) {
  if (kind === BundlesPermitKind.None && data === "0x") {
    return;
  }
  if (kind !== BundlesPermitKind.ERC2612 || !funded) {
    throw new CalldataCallError("permit.kind", call.id);
  }
  try {
    const args = decodeAbiParameters(erc2612PermitParameters, data);
    const [, v, r, s] = args;
    if (
      (v !== 27 && v !== 28) ||
      r === zeroHash ||
      s === zeroHash ||
      encodeAbiParameters(erc2612PermitParameters, args) !== data.toLowerCase()
    ) {
      throw new CalldataDecodeError("permit.data", call.id);
    }
  } catch (cause) {
    if (cause instanceof CalldataDecodeError) {
      throw cause;
    }
    throw new CalldataDecodeError("permit.data", { callId: call.id, cause });
  }
}

function embeddedAuthorization(
  { signature: { v, r, s } }: SignedAuthorization,
  call: CalldataCall,
) {
  if (v === 0 && r === zeroHash && s === zeroHash) {
    return false;
  }
  if ((v !== 27 && v !== 28) || r === zeroHash || s === zeroHash) {
    throw new CalldataDecodeError("authorization.signature", call.id);
  }
  return true;
}

function marketId(params: MarketParams) {
  return keccak256(encodeAbiParameters([marketParamsAbi], [params]));
}

function requireMarket(
  params: MarketParams,
  {
    chainId,
    selector,
    call,
    field = "market",
  }: {
    chainId?: number;
    selector: string;
    call: CalldataCall;
    field?: string;
  },
) {
  const id = marketId(params);
  const expected = chainId === undefined ? id : `${chainId}:${id}`;
  if (typeof selector !== "string" || expected !== selector.toLowerCase()) {
    throw new CalldataTargetError(field, call.id);
  }
}

function requireReallocations(
  entries: readonly {
    marketParams: MarketParams;
    sourceMarketParams: MarketParams;
    fromIdle: boolean;
    vault: Address;
    adapter: Address;
    sourceAdapter: Address;
    penalty: bigint;
    assets: bigint;
  }[],
  { params, call }: { params: MarketParams; call: CalldataCall },
) {
  const expected = marketId(params);
  const used = new Set<string>();
  for (const entry of entries) {
    const source = marketId(entry.sourceMarketParams);
    const destination = `${entry.vault}:${entry.adapter}`;
    const route = entry.fromIdle
      ? destination
      : `${destination}:${entry.sourceAdapter}:${source}`;
    if (entry.penalty !== 0n) {
      throw new CalldataFeeError("reallocations.penalty", call.id);
    }
    if (
      entry.assets === 0n ||
      used.has(route) ||
      sameAddress(entry.vault, zeroAddress) ||
      sameAddress(entry.adapter, zeroAddress) ||
      marketId(entry.marketParams) !== expected ||
      !sameAddress(entry.sourceMarketParams.loanToken, params.loanToken) ||
      (entry.fromIdle
        ? !sameAddress(entry.sourceAdapter, zeroAddress)
        : sameAddress(entry.sourceAdapter, zeroAddress) || source === expected)
    ) {
      throw new CalldataCallError("reallocations", call.id);
    }
    used.add(route);
  }
}

function requirePositionAmount(
  amount: Amount,
  {
    assets,
    shares,
    call,
  }: { assets: bigint; shares: bigint; call: CalldataCall },
) {
  if (amount?.unit === "all") {
    if ((assets === 0n) === (shares === 0n)) {
      throw new CalldataAmountError("amount", call.id);
    }
    return;
  }
  if (amount?.unit !== "assets" && amount?.unit !== "shares") {
    throw new CalldataAmountError("amount.unit", call.id);
  }
  const expected = uint(amount.value, { field: "amount", call });
  if (expected === 0n) {
    throw new CalldataAmountError("amount", call.id);
  }
  const [used, unused] =
    amount.unit === "assets" ? [assets, shares] : [shares, assets];
  requireAmount(used, { expected, call });
  requireAmount(unused, { expected: 0n, call });
}

function requireAssets(
  assets: bigint,
  {
    amount,
    call,
    field = "amount",
  }: {
    amount: { unit: "assets"; value: string };
    call: CalldataCall;
    field?: string;
  },
) {
  if (amount?.unit !== "assets") {
    throw new CalldataAmountError(`${field}.unit`, call.id);
  }
  requireAmount(assets, {
    expected: uint(amount.value, { field, call }),
    call,
    field,
  });
  if (assets === 0n) {
    throw new CalldataAmountError(field, call.id);
  }
}

function checkPrerequisites(
  { calls, chain }: Context,
  {
    approvalSpender,
    approvalFunding,
    authorization,
  }: {
    approvalSpender: Address;
    approvalFunding?: Requirements["funding"];
    authorization?: "call" | "embedded";
  },
) {
  const checkedCalls: DecodedCalldataCall[] = [];
  const approvals: bigint[] = [];
  let hasAuthorization = false;
  const prerequisites = calls.slice(0, -1);
  for (const [index, call] of prerequisites.entries()) {
    if (sameAddress(call.to, chain.blue)) {
      if (authorization !== "call" || hasAuthorization) {
        throw new CalldataCallError("authorization", call.id);
      }
      requireAmount(uint(call.value, { field: "value", call }), {
        expected: 0n,
        call,
        field: "value",
      });
      const decoded = decode(call, { abi: blueAbi });
      if (decoded.functionName !== "setAuthorization" || !decoded.args[1]) {
        throw new CalldataCallError("authorization", call.id);
      }
      if (!sameAddress(decoded.args[0], chain.bundles?.blueBundlesV1)) {
        throw new CalldataTargetError("authorization.spender", call.id);
      }
      hasAuthorization = true;
      checkedCalls.push(checked(call, decoded));
    } else {
      if (approvalFunding == null || approvals.length === 2) {
        throw new CalldataCallError("approval", call.id);
      }
      const verified = approval(call, {
        spender: approvalSpender,
        token: approvalFunding.token,
        minAmount: approvalFunding.amount,
        allowReset: sameAddress(
          prerequisites[index + 1]?.to,
          approvalFunding.token,
        ),
      });
      const [, amount] = verified.args;
      const first = approvals[0];
      if (first != null && (first !== 0n || amount === 0n)) {
        throw new CalldataCallError("approval", call.id);
      }
      approvals.push(amount);
      checkedCalls.push(verified.call);
    }
  }
  return checkedCalls;
}

type BundleCall = ReturnType<typeof decode<typeof blueBundlesV1Abi>>;
type BundleContext = {
  intent: BlueCalldataIntent;
  call: CalldataCall;
  checkMarket: (params: MarketParams) => void;
  checkFee: (fee: bigint, recipient: Address) => void;
};
type Requirements = {
  funding?: { token: Address; amount: bigint; kind: number };
  authorization?: "call" | "embedded";
};

function checkSupply(
  args: Extract<BundleCall, { functionName: "blueBundlesV1Supply" }>["args"],
  { intent, call, checkMarket, checkFee }: BundleContext,
): Requirements {
  if (intent.action !== "blue.supply") {
    throw new CalldataCallError("function", call.id);
  }
  const [params, assets, permit, fee, recipient] = args;
  checkMarket(params);
  requireAssets(assets, { amount: intent.amount, call });
  checkPermit(permit, { call, funded: assets > 0n });
  checkFee(fee, recipient);
  return {
    funding: { token: params.loanToken, amount: assets, kind: permit.kind },
  };
}

function checkSupplyBorrow(
  args: Extract<
    BundleCall,
    { functionName: "blueBundlesV1SupplyCollateralAndBorrow" }
  >["args"],
  { intent, call, checkMarket, checkFee }: BundleContext,
): Requirements {
  let funding: Requirements["funding"];
  let authorization: Requirements["authorization"];
  const [
    params,
    collateral,
    borrow,
    maxLtv,
    permit,
    auth,
    reallocations,
    fee,
    recipient,
  ] = args;
  checkMarket(params);
  if (intent.action === "blue.supply_collateral") {
    requireAssets(collateral, { amount: intent.amount, call });
    requireAmount(borrow, { expected: 0n, call });
    if (reallocations.length !== 0 || embeddedAuthorization(auth, call)) {
      throw new CalldataCallError("borrow", call.id);
    }
  } else if (intent.action === "blue.borrow") {
    requireAssets(borrow, { amount: intent.amount, call });
    if (intent.collateral_amount === undefined) {
      requireAmount(collateral, {
        expected: 0n,
        call,
        field: "collateral_amount",
      });
      if (permit.kind !== 0) {
        throw new CalldataCallError("permit", call.id);
      }
    } else {
      requireAssets(collateral, {
        amount: intent.collateral_amount,
        call,
        field: "collateral_amount",
      });
    }
    requireReallocations(reallocations, { params, call });
    authorization = embeddedAuthorization(auth, call) ? "embedded" : "call";
  } else {
    throw new CalldataCallError("function", call.id);
  }
  checkFee(fee, recipient);
  checkLtv(maxLtv, { lltv: borrow > 0n ? params.lltv : undefined, call });
  checkPermit(permit, { call, funded: collateral > 0n });
  if (collateral > 0n) {
    funding = {
      token: params.collateralToken,
      amount: collateral,
      kind: permit.kind,
    };
  }

  return { funding, authorization };
}

function checkRepayWithdraw(
  args: Extract<
    BundleCall,
    { functionName: "blueBundlesV1RepayAndWithdrawCollateral" }
  >["args"],
  { intent, call, checkMarket, checkFee }: BundleContext,
): Requirements {
  let funding: Requirements["funding"];
  let authorization: Requirements["authorization"];
  const [
    params,
    assets,
    shares,
    maximum,
    collateral,
    maxLtv,
    permit,
    auth,
    fee,
    recipient,
  ] = args;
  checkMarket(params);
  checkFee(fee, recipient);
  if (intent.action === "blue.withdraw_collateral") {
    requireAssets(collateral, { amount: intent.amount, call });
    if (assets !== 0n || shares !== 0n || maximum !== 0n || permit.kind !== 0) {
      throw new CalldataCallError("repay", call.id);
    }
    authorization = embeddedAuthorization(auth, call) ? "embedded" : "call";
  } else if (intent.action === "blue.repay") {
    requirePositionAmount(intent.amount, { assets, shares, call });
    if (
      (intent.amount.unit === "all") !== (shares === maxUint256) ||
      maximum === 0n
    ) {
      throw new CalldataAmountError("amount", call.id);
    }
    if (intent.amount.unit === "assets") {
      requireAmount(maximum, {
        expected: assets + (assets * fee) / (10n ** 18n - fee),
        call,
        field: "max_repay_assets",
      });
    }
    if (intent.collateral_amount === undefined) {
      requireAmount(collateral, {
        expected: 0n,
        call,
        field: "collateral_amount",
      });
      if (embeddedAuthorization(auth, call)) {
        throw new CalldataCallError("authorization", call.id);
      }
    } else {
      requireAssets(collateral, {
        amount: intent.collateral_amount,
        call,
        field: "collateral_amount",
      });
      authorization = embeddedAuthorization(auth, call) ? "embedded" : "call";
    }
    funding = { token: params.loanToken, amount: maximum, kind: permit.kind };
  } else {
    throw new CalldataCallError("function", call.id);
  }

  checkLtv(maxLtv, { lltv: collateral > 0n ? params.lltv : undefined, call });
  checkPermit(permit, { call, funded: funding != null });
  return { funding, authorization };
}

function checkWithdraw(
  args: Extract<BundleCall, { functionName: "blueBundlesV1Withdraw" }>["args"],
  { intent, call, checkMarket, checkFee }: BundleContext,
): Requirements {
  if (intent.action !== "blue.withdraw") {
    throw new CalldataCallError("function", call.id);
  }
  const [params, assets, shares, auth, reallocations, fee, recipient] = args;
  checkMarket(params);
  requirePositionAmount(intent.amount, { assets, shares, call });
  requireReallocations(reallocations, { params, call });
  checkFee(fee, recipient);
  return {
    authorization: embeddedAuthorization(auth, call) ? "embedded" : "call",
  };
}

function checkRefinance(
  args: Extract<
    BundleCall,
    { functionName: "blueBundlesV1MigrateBorrowPosition" }
  >["args"],
  { intent, call, checkMarket, checkFee }: BundleContext,
): Requirements {
  if (intent.action !== "blue.refinance") {
    throw new CalldataCallError("function", call.id);
  }
  const [source, destination, maxLtv, auth, reallocations, fee, recipient] =
    args;
  checkMarket(source);
  requireMarket(destination, {
    chainId: intent.chain_id,
    selector: intent.destination_market,
    call,
    field: "destination_market",
  });
  requireReallocations(reallocations, { params: destination, call });
  checkLtv(maxLtv, { lltv: destination.lltv, call });
  checkFee(fee, recipient);
  return {
    authorization: embeddedAuthorization(auth, call) ? "embedded" : "call",
  };
}

function bundleRequirements(
  decoded: BundleCall,
  context: BundleContext,
): Requirements {
  switch (decoded.functionName) {
    case "blueBundlesV1Supply":
      return checkSupply(decoded.args, context);
    case "blueBundlesV1SupplyCollateralAndBorrow":
      return checkSupplyBorrow(decoded.args, context);
    case "blueBundlesV1RepayAndWithdrawCollateral":
      return checkRepayWithdraw(decoded.args, context);
    case "blueBundlesV1Withdraw":
      return checkWithdraw(decoded.args, context);
    case "blueBundlesV1MigrateBorrowPosition":
      return checkRefinance(decoded.args, context);
    default:
      throw new CalldataCallError("function", context.call.id);
  }
}

function verifyBlue(
  intent: BlueCalldataIntent,
  context: Context,
): readonly DecodedCalldataCall[] {
  const { calls, chain } = context;
  const call = mainCall(calls, 4);
  requireTarget(call, chain.bundles?.blueBundlesV1);
  const decoded = decode(call, { abi: blueBundlesV1Abi });
  if (decoded.functionName !== functions[intent.action]) {
    throw new CalldataCallError("function", call.id);
  }
  const value = uint(call.value, { field: "value", call });
  const checkMarket = (params: MarketParams) =>
    requireMarket(params, {
      selector: intent.market,
      call,
    });
  const checkFee = (pct: bigint, recipient: Address) => {
    requireFee({ pct, recipient }, { intent, call });
    if (pct > 0n && "amount" in intent && intent.amount?.unit === "all") {
      requireAccount(recipient, {
        expected: intent.account,
        call,
        field: "referral_fee.recipient",
      });
    }
  };
  const bundleContext = { intent, call, checkMarket, checkFee };
  const { funding, authorization } = bundleRequirements(decoded, bundleContext);

  if (value !== 0n) {
    requireNativeBudget(value, {
      funding: "funding" in intent ? intent.funding : undefined,
      call,
    });
    if (
      funding == null ||
      funding.kind !== 0 ||
      !sameAddress(funding.token, chain.wNative)
    ) {
      throw new CalldataAmountError("value", call.id);
    }
    requireAmount(value, { expected: funding.amount, call, field: "value" });
  }
  const approvalFunding =
    value === 0n && funding?.kind === BundlesPermitKind.None
      ? funding
      : undefined;
  return [
    ...checkPrerequisites(context, {
      approvalSpender: call.to,
      approvalFunding,
      authorization,
    }),
    checked(call, decoded),
  ];
}

const functions = {
  "blue.supply": "blueBundlesV1Supply",
  "blue.withdraw": "blueBundlesV1Withdraw",
  "blue.supply_collateral": "blueBundlesV1SupplyCollateralAndBorrow",
  "blue.withdraw_collateral": "blueBundlesV1RepayAndWithdrawCollateral",
  "blue.borrow": "blueBundlesV1SupplyCollateralAndBorrow",
  "blue.repay": "blueBundlesV1RepayAndWithdrawCollateral",
  "blue.refinance": "blueBundlesV1MigrateBorrowPosition",
} as const satisfies Record<BlueCalldataIntent["action"], string>;

/** @internal */
export const blueRules = {
  "blue.supply": verifyBlue,
  "blue.withdraw": verifyBlue,
  "blue.supply_collateral": verifyBlue,
  "blue.withdraw_collateral": verifyBlue,
  "blue.borrow": verifyBlue,
  "blue.repay": verifyBlue,
  "blue.refinance": verifyBlue,
};
