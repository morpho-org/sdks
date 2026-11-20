import { type Address, ethAddress, isAddressEqual, zeroAddress } from "viem";
import { UnexpectedTokenTransferError } from "../errors.js";
import type { Transfer } from "../types.js";
import { resolveApprovalLimits } from "./approval-limits.js";
import type { ResolvedApprovalOperation } from "./backends/resolve-assets.js";

/** Resolve spendable tokens from operation subjects and approval tokens, never explicit approvals. @internal */
export function resolveSenderSpendTokens(params: {
  readonly chainId: number;
  readonly owner: Address;
  readonly operations: readonly ResolvedApprovalOperation[];
  readonly wNative?: Address;
  /** Operation indices whose sender pay-in is measured in native ETH. */
  readonly nativeSpendMeasured?: ReadonlySet<number>;
}): ReadonlySet<string> {
  const operations = params.operations
    .map((operation, index) => ({ ...operation, index }))
    .filter(
      ({ limit }) =>
        limit.type !== "blueBorrow" &&
        limit.type !== "blueWithdrawCollateral" &&
        (limit.type !== "blueSupplyCollateralBorrow" ||
          (limit.inputs === undefined
            ? (limit.quote.collateralSupplied ?? 0n) > 0n
            : limit.inputs.collateralAssets !== undefined)) &&
        (limit.type !== "blueRepayWithdrawCollateral" ||
          (limit.inputs === undefined
            ? limit.quote.sharesBurned !== undefined
            : limit.inputs.repay !== undefined)) &&
        (limit.type !== "midnightRepayWithdrawCollateral" ||
          limit.quote.debtRepaid !== undefined ||
          limit.position?.maxDebt !== undefined),
    );
  const allowed = new Set(
    resolveApprovalLimits({ ...params, operations }).approvals.flatMap(
      (entry) => (entry.type === "token" ? [entry.token.toLowerCase()] : []),
    ),
  );
  for (const { limit } of operations) {
    switch (limit.type) {
      case "vaultV1Withdraw":
      case "vaultV1Redeem":
      case "vaultV2Withdraw":
      case "vaultV2Redeem":
      case "vaultV1InKindRedeem":
      case "vaultV2InKindRedeem":
      case "vaultV2ForceWithdraw":
      case "vaultV2ForceRedeem":
        allowed.add(limit.vault.toLowerCase());
        break;
      case "vaultV1MigrateToV2":
        allowed.add(limit.sourceVault.toLowerCase());
        break;
    }
  }
  const { wNative } = params;
  if (
    wNative !== undefined &&
    operations.some(
      (operation) =>
        params.nativeSpendMeasured?.has(operation.index) &&
        resolveApprovalLimits({
          ...params,
          operations: [operation],
        }).approvals.some(
          (entry) =>
            entry.type === "token" && isAddressEqual(entry.token, wNative),
        ),
    )
  ) {
    allowed.add(ethAddress.toLowerCase());
  }
  return allowed;
}

/** Reject net losses and non-burn outgoing transfers of undeclared tokens, even if returned later. @internal */
export function findUnexpectedSenderTransfers(params: {
  readonly owner: Address;
  readonly transfers: readonly Transfer[];
  readonly allowed: ReadonlySet<string>;
  /** Gross ETH debit cap when no native pay-in measurement covers the sender. */
  readonly nativeValueBudget?: bigint;
}): UnexpectedTokenTransferError[] {
  const tokens = new Map<
    string,
    { token: Address; net: bigint; recipients: Set<Address>; outgoing: boolean }
  >();
  for (const { token, from, to, amount } of params.transfers) {
    if (amount === 0n || params.allowed.has(token.toLowerCase())) {
      continue;
    }
    const sends = isAddressEqual(from, params.owner);
    const receives = isAddressEqual(to, params.owner);
    const budget = isAddressEqual(token, ethAddress)
      ? params.nativeValueBudget
      : undefined;
    if (budget !== undefined && (!sends || receives)) {
      continue;
    }
    if (!sends && !receives) {
      continue;
    }
    const key = token.toLowerCase();
    const entry = tokens.get(key) ?? {
      token,
      net: 0n,
      recipients: new Set<Address>(),
      outgoing: false,
    };
    entry.net += (receives ? amount : 0n) - (sends ? amount : 0n);
    if (sends && !receives) {
      entry.recipients.add(to);
      entry.outgoing ||= !isAddressEqual(to, zeroAddress);
    }
    tokens.set(key, entry);
  }
  return [...tokens.values()].flatMap(({ token, net, recipients, outgoing }) =>
    (
      isAddressEqual(token, ethAddress) &&
      params.nativeValueBudget !== undefined
        ? -net > params.nativeValueBudget
        : net < 0n || outgoing
    )
      ? [
          new UnexpectedTokenTransferError({
            token,
            sender: params.owner,
            recipients: [...recipients],
          }),
        ]
      : [],
  );
}
