import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import {
  BundlesPermitKind,
  bundlesPermitParameters,
  vaultBundlesV1Abi,
  vaultExitBundlesV1Abi,
} from "@morpho-org/morpho-sdk/abis";
import type { ChainAddresses } from "@morpho-org/morpho-ts";
import { marketParamsAbi } from "@morpho-org/morpho-ts/abis";
import {
  type Address,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
  keccak256,
  maxUint256,
  zeroHash,
} from "viem";
import {
  approval as approve,
  checked,
  decode,
  innerCall,
  isCallAddress,
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
  CalldataTargetError,
} from "./errors.js";
import type {
  CalldataCall,
  DecodedCalldataCall,
  VaultCalldataIntent,
} from "./types.js";

type IntentFor<A extends VaultCalldataIntent["action"]> = Extract<
  VaultCalldataIntent,
  { readonly action: A }
>;

function vaultCall(
  calls: readonly CalldataCall[],
  { asset, maxCalls }: { asset: Address; maxCalls: number },
) {
  const call = mainCall(calls, maxCalls);
  if (!isCallAddress(asset)) {
    throw new CalldataTargetError("asset", call.id);
  }
  return call;
}

function amount(
  intent: IntentFor<"vault_v1.withdraw" | "vault_v2.withdraw">,
  {
    assets,
    shares,
    call,
  }: { assets: bigint; shares: bigint; call: CalldataCall },
) {
  if (intent.amount?.unit === "assets") {
    requireAmount(assets, {
      expected: uint(intent.amount.value, { field: "amount", call }),
      call,
    });
    requireAmount(shares, { expected: 0n, call });
  } else if (
    intent.amount?.unit === "shares" ||
    intent.amount?.unit === "all"
  ) {
    requireAmount(assets, { expected: 0n, call });
    if (intent.amount.unit === "shares") {
      requireAmount(shares, {
        expected: uint(intent.amount.value, { field: "amount", call }),
        call,
      });
    }
  } else {
    throw new CalldataAmountError("amount.unit", call.id);
  }
  if ((assets === 0n) === (shares === 0n)) {
    throw new CalldataAmountError("amount", call.id);
  }
}

function requireVault(
  actual: Address,
  { expected, call }: { expected: Address; call: CalldataCall },
) {
  if (!sameAddress(actual, expected)) {
    throw new CalldataTargetError("vault", call.id);
  }
}

function requireAssets(
  assets: bigint,
  {
    requested,
    call,
  }: {
    requested: { readonly unit: "assets"; readonly value: string };
    call: CalldataCall;
  },
) {
  if (requested?.unit !== "assets") {
    throw new CalldataAmountError("amount.unit", call.id);
  }
  requireAmount(assets, {
    expected: uint(requested.value, { field: "amount", call }),
    call,
  });
  if (assets === 0n) {
    throw new CalldataAmountError("amount", call.id);
  }
}

function checkDepositPermit(
  { kind, data }: { readonly kind: number; readonly data: Hex },
  call: CalldataCall,
) {
  if (kind === BundlesPermitKind.None) {
    if (data !== "0x") {
      throw new CalldataDecodeError("permit.data", call.id);
    }
    return;
  }
  if (
    kind !== BundlesPermitKind.ERC2612 &&
    kind !== BundlesPermitKind.Permit2
  ) {
    throw new CalldataCallError("permit.kind", call.id);
  }
  const parameters = bundlesPermitParameters[kind];
  try {
    const args = decodeAbiParameters(parameters, data);
    if (encodeAbiParameters(parameters, args) === data.toLowerCase()) {
      return;
    }
  } catch {
    throw new CalldataDecodeError("permit.data", call.id);
  }
  throw new CalldataDecodeError("permit.data", call.id);
}

function verifyDeposit(
  intent: IntentFor<"vault_v1.deposit" | "vault_v2.deposit">,
  { calls, chain }: { calls: readonly CalldataCall[]; chain: ChainAddresses },
) {
  const call = vaultCall(calls, { asset: intent.asset, maxCalls: 3 });
  const bundle = chain.bundles?.vaultBundlesV1;
  requireTarget(call, bundle);
  const decoded = decode(call, { abi: vaultBundlesV1Abi });
  if (decoded.functionName !== "vaultBundlesV1Deposit") {
    throw new CalldataCallError("function", call.id);
  }
  const [vault, assets, maxSharePrice, permit, fee, feeRecipient] =
    decoded.args;
  requireVault(vault, { expected: intent.vault, call });
  requireAssets(assets, { requested: intent.amount, call });
  if (maxSharePrice === 0n || maxSharePrice === maxUint256) {
    throw new CalldataAmountError("max_share_price", call.id);
  }
  requireFee({ pct: fee, recipient: feeRecipient }, { intent, call });
  const value = uint(call.value, { field: "value", call });
  requireNativeBudget(value, { funding: intent.funding, call });
  checkDepositPermit(permit, call);
  if (value !== 0n) {
    if (!sameAddress(intent.asset, chain.wNative)) {
      throw new CalldataTargetError("asset", call.id);
    }
    requireAmount(value, { expected: assets, call, field: "value" });
    if (permit.kind !== BundlesPermitKind.None) {
      throw new CalldataCallError("permit", call.id);
    }
  }
  const approval = calls.at(-2);
  if (approval == null) {
    return [checked(call, decoded)];
  }
  if (value !== 0n || permit.kind !== BundlesPermitKind.None) {
    throw new CalldataCallError("approval", approval.id);
  }
  const verified = approve(approval, {
    spender: call.to,
    token: intent.asset,
    minAmount: assets,
  });
  const reset = calls.length === 3 ? calls[0] : undefined;
  if (reset == null) {
    return [verified.call, checked(call, decoded)];
  }
  const verifiedReset = approve(reset, {
    spender: call.to,
    token: intent.asset,
    allowReset: true,
  });
  requireAmount(verifiedReset.args[1], {
    expected: 0n,
    call: reset,
    field: "approval.amount",
  });
  return [verifiedReset.call, verified.call, checked(call, decoded)];
}

function checkSharePermit(
  permit: { value: bigint; v: number; r: Hex; s: Hex },
  {
    call,
    approval,
    minShares = 0n,
  }: { call: CalldataCall; approval?: CalldataCall; minShares?: bigint },
) {
  const signed =
    permit.v !== 0 || permit.r !== zeroHash || permit.s !== zeroHash;
  if (approval != null && (signed || permit.value !== 0n)) {
    throw new CalldataCallError("approval", approval.id);
  }
  if (signed && (permit.value === 0n || permit.value < minShares)) {
    throw new CalldataAmountError("permit.value", call.id);
  }
}

function verifyWithdraw(
  intent: IntentFor<"vault_v1.withdraw" | "vault_v2.withdraw">,
  { calls, chain }: { calls: readonly CalldataCall[]; chain: ChainAddresses },
) {
  const call = vaultCall(calls, { asset: intent.asset, maxCalls: 2 });
  const bundle = chain.bundles?.vaultBundlesV1;
  requireTarget(call, bundle);
  requireAmount(uint(call.value, { field: "value", call }), {
    expected: 0n,
    call,
    field: "value",
  });
  const decoded = decode(call, { abi: vaultBundlesV1Abi });
  if (decoded.functionName !== "vaultBundlesV1Withdraw") {
    throw new CalldataCallError("function", call.id);
  }
  const [vault, assets, shares, permit, fee, feeRecipient] = decoded.args;
  requireVault(vault, { expected: intent.vault, call });
  amount(intent, { assets, shares, call });
  const minShares = shares;
  const approval = calls.length === 2 ? calls[0] : undefined;
  checkSharePermit(permit, { call, approval, minShares });
  requireFee({ pct: fee, recipient: feeRecipient }, { intent, call });
  if (intent.amount.unit === "all" && fee > 0n) {
    requireAccount(feeRecipient, {
      expected: intent.account,
      call,
      field: "referral_fee.recipient",
    });
  }
  if (approval == null) {
    return [checked(call, decoded)];
  }
  return [
    approve(approval, { spender: call.to, token: vault, minAmount: minShares })
      .call,
    checked(call, decoded),
  ];
}

function forceRedeem(
  intent: IntentFor<"vault_v2.force_withdraw">,
  calls: readonly CalldataCall[],
) {
  const call = vaultCall(calls, { asset: intent.asset, maxCalls: 1 });
  requireTarget(call, intent.vault);
  requireAmount(uint(call.value, { field: "value", call }), {
    expected: 0n,
    call,
    field: "value",
  });
  const decoded = decode(call, { abi: vaultV2Abi });
  if (decoded.functionName !== "multicall" || decoded.args[0].length < 2) {
    throw new CalldataCallError("function", call.id);
  }
  const subcalls = decoded.args[0];
  const routes = new Set<string>();
  const nested = subcalls.map((data, index) => {
    const inner = innerCall(call, { data, index });
    const part = decode(inner, { abi: vaultV2Abi, nested: true });
    if (index === subcalls.length - 1) {
      if (part.functionName !== "redeem") {
        throw new CalldataCallError("function", inner.id);
      }
      if (part.args[0] === 0n) {
        throw new CalldataAmountError("amount", inner.id);
      }
      requireAccount(part.args[1], {
        expected: intent.account,
        call: inner,
        field: "receiver",
      });
      requireAccount(part.args[2], {
        expected: intent.account,
        call: inner,
        field: "owner",
      });
      return checked(inner, part);
    }
    if (part.functionName !== "forceDeallocate") {
      throw new CalldataCallError("function", inner.id);
    }
    const [adapter, adapterData, assets, owner] = part.args;
    requireAccount(owner, {
      expected: intent.account,
      call: inner,
      field: "onBehalf",
    });
    if (assets === 0n) {
      throw new CalldataAmountError("amount", inner.id);
    }
    if (adapterData !== "0x") {
      let loanToken: Address;
      try {
        const params = decodeAbiParameters([marketParamsAbi], adapterData);
        if (encodeAbiParameters([marketParamsAbi], params) !== adapterData) {
          throw new CalldataDecodeError("adapterData", inner.id);
        }
        loanToken = params[0].loanToken;
      } catch (cause) {
        if (cause instanceof CalldataDecodeError) {
          throw cause;
        }
        throw new CalldataDecodeError("adapterData", {
          callId: inner.id,
          cause,
        });
      }
      if (!sameAddress(loanToken, intent.asset)) {
        throw new CalldataTargetError("asset", inner.id);
      }
    }
    const route = `${adapter.toLowerCase()}:${adapterData}`;
    if (routes.has(route)) {
      throw new CalldataCallError("forceDeallocate", inner.id);
    }
    routes.add(route);
    return checked(inner, part);
  });
  return [checked(call, { ...decoded, calls: nested })];
}

function verifyForceWithdraw(
  intent: IntentFor<"vault_v2.force_withdraw">,
  { calls, chain }: { calls: readonly CalldataCall[]; chain: ChainAddresses },
) {
  if (intent.amount?.unit === "all") {
    return forceRedeem(intent, calls);
  }
  const call = vaultCall(calls, { asset: intent.asset, maxCalls: 2 });
  const bundle = chain.bundles?.vaultExitBundlesV1;
  requireTarget(call, bundle);
  requireAmount(uint(call.value, { field: "value", call }), {
    expected: 0n,
    call,
    field: "value",
  });
  const decoded = decode(call, { abi: vaultExitBundlesV1Abi });
  if (decoded.functionName !== "vaultExitBundlesV1ForceWithdrawVaultV2") {
    throw new CalldataCallError("function", call.id);
  }
  const [vault, , assets, minSharePrice, permit, fee, feeRecipient] =
    decoded.args;
  requireVault(vault, { expected: intent.vault, call });
  requireAssets(assets, { requested: intent.amount, call });
  if (minSharePrice === 0n) {
    throw new CalldataAmountError("min_share_price", call.id);
  }
  requireFee({ pct: fee, recipient: feeRecipient }, { intent, call });
  const approval = calls.length === 2 ? calls[0] : undefined;
  checkSharePermit(permit, { call, approval });
  if (approval == null) {
    return [checked(call, decoded)];
  }
  return [
    approve(approval, { spender: call.to, token: vault }).call,
    checked(call, decoded),
  ];
}

function verifyInKind(
  intent: IntentFor<"vault_v2.redeem_in_kind">,
  { calls, chain }: { calls: readonly CalldataCall[]; chain: ChainAddresses },
) {
  const call = vaultCall(calls, { asset: intent.asset, maxCalls: 2 });
  const bundle = chain.bundles?.vaultExitBundlesV1;
  requireTarget(call, bundle);
  requireAmount(uint(call.value, { field: "value", call }), {
    expected: 0n,
    call,
    field: "value",
  });
  const decoded = decode(call, { abi: vaultExitBundlesV1Abi });
  if (decoded.functionName !== "vaultExitBundlesV1InKindRedemptionVaultV2") {
    throw new CalldataCallError("function", call.id);
  }
  const [vault, , markets, assets, permit] = decoded.args;
  requireVault(vault, { expected: intent.vault, call });
  requireAssets(assets, { requested: intent.amount, call });
  const market = markets[0];
  if (
    markets.length !== 1 ||
    market == null ||
    typeof intent.market !== "string" ||
    `${intent.chain_id}:${keccak256(encodeAbiParameters([marketParamsAbi], [market]))}` !==
      intent.market.toLowerCase()
  ) {
    throw new CalldataTargetError("market", call.id);
  }
  if (!sameAddress(market.loanToken, intent.asset)) {
    throw new CalldataTargetError("asset", call.id);
  }
  const approval = calls.length === 2 ? calls[0] : undefined;
  checkSharePermit(permit, { call, approval });
  if (approval == null) {
    return [checked(call, decoded)];
  }
  return [
    approve(approval, { spender: call.to, token: vault }).call,
    checked(call, decoded),
  ];
}

/** @internal */
export const vaultRules: {
  [A in VaultCalldataIntent["action"]]: (
    intent: IntentFor<A>,
    context: { calls: readonly CalldataCall[]; chain: ChainAddresses },
  ) => readonly DecodedCalldataCall[];
} = {
  "vault_v1.deposit": verifyDeposit,
  "vault_v2.deposit": verifyDeposit,
  "vault_v1.withdraw": verifyWithdraw,
  "vault_v2.withdraw": verifyWithdraw,
  "vault_v2.force_withdraw": verifyForceWithdraw,
  "vault_v2.redeem_in_kind": verifyInKind,
};
