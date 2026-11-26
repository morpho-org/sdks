import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Abi, Address, Hex } from "viem";
import {
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  isAddress,
  isAddressEqual,
  isHex,
  maxUint256,
} from "viem";
import {
  CalldataAmountError,
  CalldataCallError,
  CalldataDecodeError,
  CalldataFeeError,
  CalldataRecipientError,
  CalldataTargetError,
} from "./errors.js";
import type { CalldataCall, DecodedCalldataCall } from "./types.js";

/** @internal */
export function sameAddress(a: Address | undefined, b: Address | undefined) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    isAddress(a, { strict: false }) &&
    isAddress(b, { strict: false }) &&
    isAddressEqual(a, b)
  );
}

/** @internal */
export function sameHex(a: Hex | undefined, b: Hex | undefined) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    isHex(a) &&
    a.toLowerCase() === b.toLowerCase()
  );
}

/** @internal */
export function requireTarget(call: CalldataCall, target: Address | undefined) {
  if (!sameAddress(call.to, target)) {
    throw new CalldataTargetError("to", call.id);
  }
}

/** @internal */
export function uint(
  value: string,
  { field, call }: { field: string; call: CalldataCall },
) {
  if (typeof value !== "string" || !/^[0-9]{1,78}$/.test(value)) {
    throw new CalldataAmountError(field, call.id);
  }
  const parsed = BigInt(value);
  if (parsed > maxUint256) {
    throw new CalldataAmountError(field, call.id);
  }
  return parsed;
}

/** @internal */
export function requireAmount(
  actual: bigint,
  {
    expected,
    call,
    field = "amount",
  }: { expected: bigint; call: CalldataCall; field?: string },
) {
  if (actual !== expected) {
    throw new CalldataAmountError(field, call.id);
  }
}

/** @internal */
export function requireAccount(
  actual: Address,
  {
    expected,
    call,
    field,
  }: { expected: Address; call: CalldataCall; field: string },
) {
  if (!sameAddress(actual, expected)) {
    throw new CalldataRecipientError(field, call.id);
  }
}

/** @internal */
export function requireFee(
  { pct, recipient }: { pct: bigint; recipient: Address | undefined },
  {
    intent,
    call,
  }: {
    intent: {
      readonly max_fee_bps: number;
      readonly referral_fee?: {
        readonly bps: number;
        readonly recipient: Address;
      };
    };
    call: CalldataCall;
  },
) {
  if (pct >= 10n ** 18n || pct > BigInt(intent.max_fee_bps) * 10n ** 14n) {
    throw new CalldataFeeError("max_fee_bps", call.id);
  }
  if (intent.referral_fee !== undefined) {
    const bps = intent.referral_fee?.bps;
    if (
      typeof bps !== "number" ||
      !Number.isInteger(bps) ||
      bps < 0 ||
      bps > 10_000 ||
      pct > BigInt(bps) * 10n ** 14n
    ) {
      throw new CalldataFeeError("referral_fee.bps", call.id);
    }
  }
  if (pct > 0n && !sameAddress(recipient, intent.referral_fee?.recipient)) {
    throw new CalldataFeeError("referral_fee.recipient", call.id);
  }
}

/** @internal */
export function requireNativeBudget(
  value: bigint,
  {
    funding,
    call,
  }: {
    funding?:
      | { type: "erc20" }
      | { type: "native" | "auto"; max_native_assets: string };
    call: CalldataCall;
  },
) {
  if (
    value !== 0n &&
    ((funding?.type !== "native" && funding?.type !== "auto") ||
      value >
        uint(funding.max_native_assets, { field: "max_native_assets", call }))
  ) {
    throw new CalldataAmountError("value", call.id);
  }
}

/** @internal */
export function decode<const A extends Abi>(
  call: CalldataCall,
  { abi, nested = false }: { abi: A; nested?: boolean },
) {
  try {
    const decoded = decodeFunctionData({ abi, data: call.data });
    const canonical = encodeFunctionData({
      abi: abi as Abi,
      functionName: decoded.functionName,
      args: decoded.args as readonly unknown[] | undefined,
    });
    const data = call.data.toLowerCase();
    if (
      !/^0x(?:[0-9a-f]{2})+$/.test(data) ||
      !data.startsWith(canonical.toLowerCase()) ||
      (nested && data.length !== canonical.length)
    ) {
      throw new CalldataDecodeError("data", call.id);
    }
    return decoded;
  } catch (cause) {
    if (cause instanceof CalldataDecodeError) {
      throw cause;
    }
    throw new CalldataDecodeError("data", { callId: call.id, cause });
  }
}

/** @internal */
export function checked(
  call: CalldataCall,
  decoded: {
    readonly functionName: string;
    readonly args?: readonly unknown[];
    readonly calls?: readonly DecodedCalldataCall[];
  },
): DecodedCalldataCall {
  return deepFreeze({
    call: {
      id: call.id,
      kind: call.kind,
      to: call.to,
      data: call.data,
      value: call.value,
    },
    functionName: decoded.functionName,
    args: decoded.args ?? [],
    ...(decoded.calls ? { calls: decoded.calls } : {}),
  });
}

/** @internal */
export function innerCall(
  call: CalldataCall,
  { data, index }: { data: Hex; index: number },
): CalldataCall {
  return { ...call, id: `${call.id}.${index}`, data, value: "0" };
}

/** @internal */
export function mainCall(calls: readonly CalldataCall[], maxCount: number) {
  const call = calls.at(-1);
  if (call == null || calls.length > maxCount) {
    throw new CalldataCallError("calls", calls[0]?.id);
  }
  return call;
}

/** @internal */
export function isCallAddress(value: Address) {
  return typeof value === "string" && isAddress(value, { strict: false });
}

/** @internal */
export function approval(
  call: CalldataCall,
  {
    spender: expectedSpender,
    token: expectedToken,
    allowReset = false,
    minAmount = 0n,
  }: {
    spender: Address;
    token?: Address;
    allowReset?: boolean;
    minAmount?: bigint;
  },
) {
  if (expectedToken != null && !sameAddress(call.to, expectedToken)) {
    throw new CalldataTargetError("approval.token", call.id);
  }
  requireAmount(uint(call.value, { field: "value", call }), {
    expected: 0n,
    call,
    field: "value",
  });
  const decoded = decode(call, { abi: erc20Abi });
  if (decoded.functionName !== "approve") {
    throw new CalldataCallError("function", call.id);
  }
  const [spender, amount] = decoded.args;
  if (!sameAddress(spender, expectedSpender)) {
    throw new CalldataTargetError("approval.spender", call.id);
  }
  if (amount === 0n && !allowReset) {
    throw new CalldataCallError("approval", call.id);
  }
  if (amount !== 0n && amount < minAmount) {
    throw new CalldataAmountError("approval.amount", call.id);
  }
  return { ...decoded, call: checked(call, decoded) };
}
