import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { midnightAbi } from "@morpho-org/midnight-sdk";
import type { ChainAddresses } from "@morpho-org/morpho-ts";
import { marketParamsAbi } from "@morpho-org/morpho-ts/abis";
import { encodeAbiParameters, keccak256, maxUint128, zeroAddress } from "viem";
import {
  checked,
  decode,
  innerCall,
  isCallAddress,
  mainCall,
  requireAccount,
  requireAmount,
  requireTarget,
  sameAddress,
  sameHex,
  uint,
} from "./checks.js";
import {
  CalldataAmountError,
  CalldataCallError,
  CalldataTargetError,
  CalldataUnsupportedError,
} from "./errors.js";
import type { CalldataCall, MidnightOfferManagementIntent } from "./types.js";

type Context = {
  readonly calls: readonly CalldataCall[];
  readonly chain: ChainAddresses;
};

function singleCall({ calls }: Context) {
  const call = mainCall(calls, 1);
  requireAmount(uint(call.value, { field: "value", call }), {
    expected: 0n,
    field: "value",
    call,
  });
  return call;
}

function cancel(
  intent: Extract<
    MidnightOfferManagementIntent,
    { action: "midnight.cancel_offers" }
  >,
  context: Context,
) {
  const call = singleCall(context);
  requireTarget(call, context.chain.midnight);
  if (
    !Array.isArray(intent.groups) ||
    intent.groups.some(
      (group) => typeof group !== "string" || !/^0x[0-9a-f]{64}$/i.test(group),
    )
  ) {
    throw new CalldataTargetError("groups", call.id);
  }
  const groups = new Set(intent.groups.map((group) => group.toLowerCase()));
  if (groups.size === 0 || groups.size !== intent.groups.length) {
    throw new CalldataCallError("groups", call.id);
  }
  const decoded = decode(call, { abi: midnightAbi });
  const checkCancellation = (
    leg: CalldataCall,
    cancellation: typeof decoded,
  ) => {
    if (cancellation.functionName !== "setConsumed") {
      throw new CalldataCallError("function", leg.id);
    }
    const [group, amount, owner] = cancellation.args;
    if (!groups.delete(group.toLowerCase())) {
      throw new CalldataTargetError("groups", leg.id);
    }
    requireAmount(amount, {
      expected: maxUint128,
      field: "consumed",
      call: leg,
    });
    requireAccount(owner, {
      expected: intent.account,
      field: "on_behalf",
      call: leg,
    });
    return checked(leg, cancellation);
  };
  if (decoded.functionName !== "multicall") {
    if (groups.size !== 1) {
      throw new CalldataCallError("groups", call.id);
    }
    return [checkCancellation(call, decoded)];
  }
  if (decoded.args[0].length !== groups.size) {
    throw new CalldataCallError("groups", call.id);
  }
  const calls = decoded.args[0].map((data, index) => {
    const leg = innerCall(call, { data, index });
    return checkCancellation(
      leg,
      decode(leg, { abi: midnightAbi, nested: true }),
    );
  });
  return [checked(call, { ...decoded, calls })];
}

function withdrawFunding(
  intent: Extract<
    MidnightOfferManagementIntent,
    { action: "midnight.withdraw_funding" }
  >,
  context: Context,
) {
  const call = singleCall(context);
  requireTarget(call, context.chain.blue);
  const decoded = decode(call, { abi: blueAbi });
  if (decoded.functionName !== "withdraw") {
    throw new CalldataCallError("function", call.id);
  }
  const [market, assets, shares, owner, receiver] = decoded.args;
  const marketId = keccak256(encodeAbiParameters([marketParamsAbi], [market]));
  if (!sameHex(marketId, intent.funding_market)) {
    throw new CalldataTargetError("funding_market", call.id);
  }
  if (
    !isCallAddress(intent.funding_address) ||
    sameAddress(intent.funding_address, zeroAddress)
  ) {
    throw new CalldataTargetError("funding_address", call.id);
  }
  requireAccount(owner, {
    expected: intent.funding_address,
    field: "funding_address",
    call,
  });
  requireAccount(receiver, {
    expected: intent.account,
    field: "receiver",
    call,
  });
  if (assets !== 0n || shares === 0n) {
    throw new CalldataAmountError("shares", call.id);
  }
  return [checked(call, decoded)];
}

function unsupported(
  intent: MidnightOfferManagementIntent,
  { calls }: Context,
): never {
  throw new CalldataUnsupportedError(intent.action, calls[0]?.id);
}

/** @internal */
export const midnightOfferRules = {
  "midnight.cancel_offers": cancel,
  "midnight.withdraw_funding": withdrawFunding,
  "midnight.make_borrow": unsupported,
  "midnight.make_lend": unsupported,
  "midnight.make_repay": unsupported,
  "midnight.make_withdraw": unsupported,
};
