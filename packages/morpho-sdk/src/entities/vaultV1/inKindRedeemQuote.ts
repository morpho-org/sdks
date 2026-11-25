import {
  type AccrualVault,
  DEFAULT_SLIPPAGE_TOLERANCE,
  type MarketParams,
  MarketUtils,
  MathLib,
} from "@morpho-org/blue-sdk";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { computeVaultMaxShareAllowance } from "../../helpers/index.js";
import { validateDeadline } from "../../helpers/validate.js";
import {
  EmptyMarketParamsListError,
  ExpiredDeadlineError,
  InKindRedeemCoverageError,
  NonPositiveInputError,
} from "../../types/index.js";

/**
 * @internal Computes the fixed exit quote from a snapshot without reads or signing.
 * @param params - Snapshot, caller intent and explicit quote timestamp.
 * @returns Fixed action fields and the minimum share allowance.
 */
export function computeVaultV1InKindRedeemQuote({
  amount,
  marketParamsList,
  vaultData,
  deadline: deadlineOverride,
  now,
  chainId,
}: {
  readonly amount: bigint;
  readonly marketParamsList: readonly MarketParams[];
  readonly vaultData: AccrualVault;
  readonly deadline?: bigint;
  readonly now: bigint;
  readonly chainId: number;
}) {
  if (amount <= 0n) {
    throw new NonPositiveInputError("amount", amount);
  }
  if (marketParamsList.length === 0) {
    throw new EmptyMarketParamsListError();
  }
  const marketParamsListSnapshot = Object.freeze(
    marketParamsList.map(({ loanToken, collateralToken, oracle, irm, lltv }) =>
      Object.freeze({ loanToken, collateralToken, oracle, irm, lltv }),
    ),
  );

  const deadline = deadlineOverride ?? now + Time.s.from.h(2n);
  // Reject the same bounds the action enforces, before `getRequirements()` can walk the caller
  // through a vault-share approval or an EIP-712 permit for a deadline `buildTx()` cannot encode.
  validateDeadline(deadline);
  if (deadline <= now) {
    throw new ExpiredDeadlineError(deadline, now);
  }

  const vaultExitBundlesV1 = getChainAddress(
    chainId,
    "bundles.vaultExitBundlesV1",
  );
  // Reject unsupported registry configurations before computing coverage.
  getChainAddress(chainId, "blue");
  let covered = 0n;
  const assignedByMarket = new Map<string, bigint>();
  for (const marketParams of marketParamsListSnapshot) {
    if (covered === amount) {
      break;
    }
    const marketId = MarketUtils.getMarketId(marketParams);
    const allocation = vaultData.allocations.get(marketId);
    if (allocation?.config.enabled !== true) {
      continue;
    }
    if (allocation.position.supplyShares === 0n) {
      continue;
    }

    const market = allocation.position.market.accrueInterest(now);
    const available = market.toSupplyAssets(allocation.position.supplyShares);
    const assigned = assignedByMarket.get(marketId) ?? 0n;
    const chunk = MathLib.min(available, amount - covered);
    if (assigned + chunk > available) {
      throw new InKindRedeemCoverageError({
        required: amount,
        covered,
        maxExitAssets: covered,
      });
    }
    assignedByMarket.set(marketId, assigned + chunk);
    covered += chunk;
  }
  if (covered < amount) {
    throw new InKindRedeemCoverageError({
      required: amount,
      covered,
      maxExitAssets: covered,
    });
  }

  const requiredShareAllowance = computeVaultMaxShareAllowance({
    vaultData,
    deadline: now,
    assets: amount,
    slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
  });
  return {
    deadline,
    marketParamsListSnapshot,
    requiredShareAllowance,
    vaultExitBundlesV1,
  };
}
