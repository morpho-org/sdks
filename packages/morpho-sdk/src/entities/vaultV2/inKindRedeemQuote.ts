import {
  type AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  type MarketParams,
  MarketUtils,
  MathLib,
} from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual } from "viem";
import { validateDeadline } from "../../helpers/validate.js";
import {
  AdapterNotPartOfVaultError,
  EmptyMarketParamsListError,
  ExpiredDeadlineError,
  InKindRedeemCoverageError,
  InKindRedeemZeroDeallocationError,
  NonPositiveInputError,
  VaultV2SingleAdapterRequiredError,
  VaultV2UnsupportedExitAdapterError,
} from "../../types/index.js";

/**
 * @internal Computes the fixed exit quote from a snapshot without reads or signing.
 * @param params - Snapshot, caller intent and explicit quote timestamp.
 * @returns Fixed action fields and the minimum share allowance.
 */
export function computeVaultV2InKindRedeemQuote({
  amount,
  marketParamsList,
  vaultData,
  adapter: adapterOverride,
  deadline: deadlineOverride,
  now,
  vault,
}: {
  readonly amount: bigint;
  readonly marketParamsList: readonly MarketParams[];
  readonly vaultData: AccrualVaultV2;
  readonly adapter?: Address;
  readonly deadline?: bigint;
  readonly now: bigint;
  readonly vault: Address;
}) {
  if (amount <= 0n) {
    throw new NonPositiveInputError("amount", amount);
  }
  const marketParamsListSnapshot = Object.freeze(
    marketParamsList.map(({ loanToken, collateralToken, oracle, irm, lltv }) =>
      Object.freeze({ loanToken, collateralToken, oracle, irm, lltv }),
    ),
  );
  const marketIdListSnapshot = marketParamsListSnapshot.map((marketParams) =>
    MarketUtils.getMarketId(marketParams),
  );

  const deadline = deadlineOverride ?? now + Time.s.from.h(2n);
  // Reject the same bounds the action enforces, before `getRequirements()` can walk the caller
  // through a vault-share approval or an EIP-712 permit for a deadline `buildTx()` cannot encode.
  validateDeadline(deadline);
  if (deadline <= now) {
    throw new ExpiredDeadlineError(deadline, now);
  }
  if (vaultData.accrualAdapters.length !== 1) {
    throw new VaultV2SingleAdapterRequiredError(
      vault,
      vaultData.accrualAdapters.length,
    );
  }

  const soleAdapter = vaultData.accrualAdapters[0];
  if (soleAdapter == null) {
    throw new VaultV2SingleAdapterRequiredError(vault, 0);
  }
  const adapter = adapterOverride ?? soleAdapter.address;
  if (!isAddressEqual(adapter, soleAdapter.address)) {
    throw new AdapterNotPartOfVaultError(vault, adapter);
  }
  if (!(soleAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
    throw new VaultV2UnsupportedExitAdapterError(adapter);
  }

  const penalty = vaultData.forceDeallocatePenalties[soleAdapter.address] ?? 0n;
  const idleAssets = MathLib.min(vaultData.assetBalance, amount);
  const assetsToDeallocate = MathLib.wDivDown(
    amount - idleAssets,
    MathLib.WAD + penalty,
  );
  if (idleAssets === 0n && assetsToDeallocate === 0n) {
    throw new InKindRedeemZeroDeallocationError({
      vault: vault,
      amount,
      penalty,
    });
  }
  if (assetsToDeallocate > 0n && marketParamsListSnapshot.length === 0) {
    throw new EmptyMarketParamsListError();
  }

  const assetsByMarket = new Map(
    soleAdapter.markets
      .filter((market) => (soleAdapter.supplyShares[market.id] ?? 0n) !== 0n)
      .map((market) => [
        market.id,
        market
          .accrueInterest(now)
          .toSupplyAssets(soleAdapter.supplyShares[market.id] ?? 0n),
      ]),
  );
  const uniqueMarketIds = new Set(marketIdListSnapshot);
  let covered = 0n;
  for (const id of uniqueMarketIds) {
    covered += assetsByMarket.get(id) ?? 0n;
  }
  if (covered < assetsToDeallocate) {
    const maxExitAssets =
      covered === 0n
        ? idleAssets
        : idleAssets + MathLib.wMulUp(covered + 1n, MathLib.WAD + penalty) - 1n;
    throw new InKindRedeemCoverageError({
      required: assetsToDeallocate,
      covered,
      maxExitAssets,
    });
  }

  let remaining = assetsToDeallocate;
  let peak = 0n;
  const consumedMarketIds = new Set<string>();
  const { vault: allowanceVault } = vaultData.accrueInterest(deadline);
  // Interest can lower the burn, while management fees can raise it; bound both endpoints.
  const previewAllowance = (assets: bigint) =>
    MathLib.max(
      vaultData.toShares(assets, "Up"),
      allowanceVault.toShares(assets, "Up"),
    );

  let requiredShareAllowance = previewAllowance(
    BigInt(marketParamsListSnapshot.length),
  );
  // Pre-burn previews upper-bound each separately rounded idle, penalty, and main burn.
  requiredShareAllowance += previewAllowance(idleAssets);
  for (const id of marketIdListSnapshot) {
    const available = consumedMarketIds.has(id)
      ? 0n
      : (assetsByMarket.get(id) ?? 0n);
    consumedMarketIds.add(id);
    const chunk = MathLib.min(available, remaining);
    peak = MathLib.max(peak, chunk);
    requiredShareAllowance += previewAllowance(MathLib.wMulUp(chunk, penalty));
    requiredShareAllowance += previewAllowance(chunk);
    remaining -= chunk;
  }

  return {
    deadline,
    adapter,
    marketParamsListSnapshot,
    requiredShareAllowance,
    peak,
  };
}
