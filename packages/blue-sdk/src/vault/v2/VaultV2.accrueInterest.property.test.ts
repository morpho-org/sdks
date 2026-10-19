import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
  SECONDS_PER_YEAR,
  WAD,
} from "../../__test__/adaptiveCurveIrmReference.js";
import { edgeBiased } from "../../__test__/arbitraries.js";
import { vaultV2AdapterInput, vaultV2Input } from "../../__test__/fixtures.js";
import { MathLib } from "../../math/MathLib.js";
import { CapacityLimitReason } from "../../utils.js";
import { AccrualVaultV2 } from "./VaultV2.js";
import type { IAccrualVaultV2Adapter } from "./VaultV2Adapter.js";

const MAX_MAX_RATE = 2_000000000000000000n / SECONDS_PER_YEAR;
const MAX_PERFORMANCE_FEE = 500_000000000000000n;
const MAX_MANAGEMENT_FEE = 50_000000000000000n / SECONDS_PER_YEAR;
const MAX_ASSETS = (1n << 127n) - 1n;

const assetArb = edgeBiased(0n, MAX_ASSETS);
const supplyArb = edgeBiased(0n, MathLib.MAX_UINT_128);
const virtualSharesArb = fc.oneof(
  fc.constantFrom(1_000_000n, 1_000_000_000_000n),
  edgeBiased(1n, WAD),
);
const v2CaseArb = fc.record({
  totalAssets: assetArb,
  totalSupply: supplyArb,
  virtualShares: virtualSharesArb,
  maxRate: edgeBiased(0n, MAX_MAX_RATE),
  performanceFee: edgeBiased(0n, MAX_PERFORMANCE_FEE),
  managementFee: edgeBiased(0n, MAX_MANAGEMENT_FEE),
  performanceFeeRecipientCanReceiveShares: fc.boolean(),
  managementFeeRecipientCanReceiveShares: fc.boolean(),
  realAssets: assetArb,
  assetBalance: assetArb,
  elapsed: edgeBiased(0n, 10n * SECONDS_PER_YEAR),
});
const forwardCaseArb = v2CaseArb.chain((state) =>
  edgeBiased(1n, 10n * SECONDS_PER_YEAR).map((elapsed) => ({
    ...state,
    elapsed,
  })),
);
const noLossCaseArb = v2CaseArb.chain((state) =>
  assetArb.chain((gain) => {
    const realTotal = state.totalAssets + gain;
    return edgeBiased(0n, realTotal).map((assetBalance) => ({
      ...state,
      realAssets: realTotal - assetBalance,
      assetBalance,
    }));
  }),
);
const elapsedZeroLossCaseArb = fc
  .record({
    totalAssets: edgeBiased(1n, MAX_ASSETS),
    totalSupply: supplyArb,
    virtualShares: virtualSharesArb,
    maxRate: edgeBiased(0n, MAX_MAX_RATE),
    performanceFee: edgeBiased(0n, MAX_PERFORMANCE_FEE),
    managementFee: edgeBiased(0n, MAX_MANAGEMENT_FEE),
    performanceFeeRecipientCanReceiveShares: fc.boolean(),
    managementFeeRecipientCanReceiveShares: fc.boolean(),
  })
  .chain((state) =>
    edgeBiased(0n, state.totalAssets - 1n).chain((realTotal) =>
      edgeBiased(0n, realTotal).map((assetBalance) => ({
        ...state,
        realAssets: realTotal - assetBalance,
        assetBalance,
        elapsed: 0n,
      })),
    ),
  );

function accrueVault(
  state: {
    totalAssets: bigint;
    totalSupply: bigint;
    virtualShares: bigint;
    maxRate: bigint;
    performanceFee: bigint;
    managementFee: bigint;
    performanceFeeRecipientCanReceiveShares: boolean;
    managementFeeRecipientCanReceiveShares: boolean;
    realAssets: bigint;
    assetBalance: bigint;
    elapsed: bigint;
  },
  timestamp?: bigint,
) {
  const adapter: IAccrualVaultV2Adapter = {
    ...vaultV2AdapterInput({ type: "AccrualAdapter" }),
    realAssets: () => state.realAssets,
    maxDeposit: (_data, assets) => ({
      value: BigInt(assets),
      limiter: CapacityLimitReason.balance,
    }),
    maxWithdraw: () => ({
      value: 0n,
      limiter: CapacityLimitReason.balance,
    }),
  };
  const vault = new AccrualVaultV2(
    vaultV2Input({
      _totalAssets: state.totalAssets,
      totalSupply: state.totalSupply,
      virtualShares: state.virtualShares,
      maxRate: state.maxRate,
      lastUpdate: 100n,
      performanceFee: state.performanceFee,
      managementFee: state.managementFee,
      performanceFeeRecipientCanReceiveShares:
        state.performanceFeeRecipientCanReceiveShares,
      managementFeeRecipientCanReceiveShares:
        state.managementFeeRecipientCanReceiveShares,
    }),
    undefined,
    [adapter],
    state.assetBalance,
    {},
  );

  return vault.accrueInterest(timestamp ?? vault.lastUpdate + state.elapsed);
}

// Reference models a fresh transaction (`firstTotalAssets == 0`); after same-transaction accrual,
// `accrueInterestView` returns `_totalAssets` unchanged.
function accrueVaultRef(state: {
  totalAssets: bigint;
  totalSupply: bigint;
  virtualShares: bigint;
  maxRate: bigint;
  performanceFee: bigint;
  managementFee: bigint;
  performanceFeeRecipientCanReceiveShares: boolean;
  managementFeeRecipientCanReceiveShares: boolean;
  realAssets: bigint;
  assetBalance: bigint;
  elapsed: bigint;
}) {
  const realAssets = state.assetBalance + state.realAssets;
  const maxTotalAssets =
    state.totalAssets +
    (state.totalAssets * state.elapsed * state.maxRate) / WAD;
  const totalAssets = realAssets < maxTotalAssets ? realAssets : maxTotalAssets;
  const interest =
    totalAssets > state.totalAssets ? totalAssets - state.totalAssets : 0n;
  const performanceFeeAssets =
    interest > 0n &&
    state.performanceFee > 0n &&
    state.performanceFeeRecipientCanReceiveShares
      ? (interest * state.performanceFee) / WAD
      : 0n;
  const managementFeeAssets =
    state.elapsed > 0n &&
    state.managementFee > 0n &&
    state.managementFeeRecipientCanReceiveShares
      ? (totalAssets * state.elapsed * state.managementFee) / WAD
      : 0n;
  const assetsAfterFees =
    totalAssets - performanceFeeAssets - managementFeeAssets;
  const performanceFeeShares =
    (performanceFeeAssets * (state.totalSupply + state.virtualShares)) /
    (assetsAfterFees + 1n);
  const managementFeeShares =
    (managementFeeAssets * (state.totalSupply + state.virtualShares)) /
    (assetsAfterFees + 1n);

  return {
    totalAssets,
    performanceFeeShares,
    managementFeeShares,
    totalSupply: state.totalSupply + performanceFeeShares + managementFeeShares,
    lastUpdate: 100n + state.elapsed,
  };
}

// vault-v2 src/VaultV2.sol accrueInterestView, accrueInterest
describe("VaultV2.accrueInterest", () => {
  test.prop([forwardCaseArb], { numRuns: 1_000 })("default", (state) => {
    const { vault, performanceFeeShares, managementFeeShares } =
      accrueVault(state);
    const expected = accrueVaultRef(state);

    expect({
      totalAssets: vault._totalAssets,
      performanceFeeShares,
      managementFeeShares,
      totalSupply: vault.totalSupply,
      lastUpdate: vault.lastUpdate,
    }).toStrictEqual(expected);
  });

  test.prop([v2CaseArb], { numRuns: 1_000 })(
    "behavior: growth is capped by maxRate",
    (state) => {
      const result = accrueVault(state);
      const maxTotalAssets =
        state.totalAssets +
        (state.totalAssets * state.elapsed * state.maxRate) / WAD;

      expect(result.vault._totalAssets).toBeLessThanOrEqual(maxTotalAssets);
    },
  );

  test.prop([v2CaseArb], { numRuns: 1_000 })(
    "behavior: zero fees and disabled recipients mint no fee shares",
    (state) => {
      const zeroPerformanceFee = accrueVault({
        ...state,
        performanceFee: 0n,
      });
      const zeroManagementFee = accrueVault({
        ...state,
        managementFee: 0n,
      });
      const disabledPerformanceRecipient = accrueVault({
        ...state,
        performanceFeeRecipientCanReceiveShares: false,
      });
      const disabledManagementRecipient = accrueVault({
        ...state,
        managementFeeRecipientCanReceiveShares: false,
      });

      expect(zeroPerformanceFee.performanceFeeShares).toBe(0n);
      expect(zeroManagementFee.managementFeeShares).toBe(0n);
      expect(disabledPerformanceRecipient.performanceFeeShares).toBe(0n);
      expect(disabledManagementRecipient.managementFeeShares).toBe(0n);
    },
  );

  test.prop(
    [
      v2CaseArb.chain((state) =>
        edgeBiased(1n, 100n).map((d) => ({ ...state, d })),
      ),
    ],
    { numRuns: 1_000 },
  )("behavior: accrual before lastUpdate is unchanged", (state) => {
    const result = accrueVault(state, 100n - state.d);

    expect(result.vault._totalAssets).toBe(state.totalAssets);
    expect(result.vault.totalSupply).toBe(state.totalSupply);
    expect(result.vault.lastUpdate).toBe(100n);
    expect(result.performanceFeeShares).toBe(0n);
    expect(result.managementFeeShares).toBe(0n);
  });

  test.prop([noLossCaseArb], { numRuns: 1_000 })(
    "behavior: no-loss accrual does not decrease total assets",
    (state) => {
      const result = accrueVault(state);
      const expected = accrueVaultRef(state);

      expect(result.vault._totalAssets).toBe(expected.totalAssets);
      expect(result.vault._totalAssets).toBeGreaterThanOrEqual(
        state.totalAssets,
      );
    },
  );

  test.prop([noLossCaseArb.map((state) => ({ ...state, elapsed: 0n }))], {
    numRuns: 1_000,
  })("behavior: elapsed 0 without losses is unchanged", (state) => {
    const result = accrueVault(state);

    expect(result.vault._totalAssets).toBe(state.totalAssets);
    expect(result.vault.totalSupply).toBe(state.totalSupply);
    expect(result.vault.lastUpdate).toBe(100n);
    expect(result.performanceFeeShares).toBe(0n);
    expect(result.managementFeeShares).toBe(0n);
  });

  test.prop([elapsedZeroLossCaseArb], { numRuns: 1_000 })(
    "behavior: accrual at elapsed 0 with a loss does not throw",
    (state) => {
      expect(() => accrueVault(state)).not.toThrow();
    },
  );

  // SDK divergence (fresh transaction): elapsed 0 ignores losses; drop .fails once the SDK realizes the loss.
  test.fails.prop([elapsedZeroLossCaseArb], {
    numRuns: 1_000,
    examples: [
      [
        {
          totalAssets: 1n,
          totalSupply: 0n,
          virtualShares: 1n,
          maxRate: 0n,
          performanceFee: 0n,
          managementFee: 0n,
          performanceFeeRecipientCanReceiveShares: false,
          managementFeeRecipientCanReceiveShares: false,
          assetBalance: 0n,
          realAssets: 0n,
          elapsed: 0n,
        },
      ],
    ],
  })("behavior: elapsed 0 with a loss matches accrueInterestView", (state) => {
    const result = accrueVault(state);
    const expected = accrueVaultRef(state);

    expect(result.vault._totalAssets).toBe(expected.totalAssets);
    expect(result.vault.totalSupply).toBe(expected.totalSupply);
    expect(result.vault.lastUpdate).toBe(expected.lastUpdate);
    expect(result.performanceFeeShares).toBe(expected.performanceFeeShares);
    expect(result.managementFeeShares).toBe(expected.managementFeeShares);
  });
});
