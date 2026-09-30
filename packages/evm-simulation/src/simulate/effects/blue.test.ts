import { SharesMath } from "@morpho-org/blue-sdk";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { SimulationErrorContext } from "../../domain/diagnostics.js";
import type { VerificationDiff } from "../../domain/evidence.js";
import type { EffectiveSimulationLimits } from "../../domain/limits.js";
import type { DecodedOperation } from "../../domain/operations.js";
import type { DecodedBundle } from "../../domain/stages.js";
import {
  MarketConstraintViolationError,
  MissingVerificationEvidenceError,
  StateChangeMismatchError,
} from "../../errors.js";
import {
  FIXTURE_NOW,
  FIXTURE_OWNER,
  FIXTURE_TOKEN,
  fixtureMarket,
  fixturePosition,
  fixtureSnapshot,
} from "../../test-helpers/index.js";
import { checkUnrelatedState, verifyBlueOperation } from "./blue.js";

const limits: EffectiveSimulationLimits = {
  maxSlippageWad: 10n ** 15n,
  minLltvBufferWad: 5n * 10n ** 15n,
  maxSignatureLifetimeSeconds: 7_200n,
  wallet: { maxDebit: [], minCredit: [] },
  operations: [],
};

const context: SimulationErrorContext = { stage: "verification" };

const bundle = (operations: readonly DecodedOperation[]): DecodedBundle =>
  ({
    request: { chainId: 1, mode: "final", authorizations: [] },
    owner: FIXTURE_OWNER,
    operations,
  }) as unknown as DecodedBundle;

const emptyDiff: VerificationDiff = {
  wallet: [],
  permissions: [],
  positions: [],
  vaults: [],
  markets: [],
};

const op = (
  type: string,
  overrides: Record<string, unknown> = {},
): DecodedOperation =>
  ({
    type,
    transactionIndex: 0,
    callPath: [],
    chainId: 1,
    deployment: "0xbBbBB9fc5e258E8B39f9c12A1C3bb3D18Ed9c48A",
    owner: FIXTURE_OWNER,
    route: "blueBundlesV1",
    market: fixtureMarket().market,
    onBehalf: FIXTURE_OWNER,
    receiver: FIXTURE_OWNER,
    deadline: FIXTURE_NOW + 3600n,
    referralFee: { rateWad: 0n, recipient: FIXTURE_OWNER },
    tokenSignature: { type: "none" },
    authorizationSignature: { type: "none" },
    ...overrides,
  }) as unknown as DecodedOperation;

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const verify = (
  operation: DecodedOperation,
  accruedBefore: ReturnType<typeof fixtureSnapshot>,
  after: ReturnType<typeof fixtureSnapshot>,
) =>
  verifyBlueOperation({
    bundle: bundle([operation]),
    operation: operation as Extract<DecodedOperation, { type: "blueSupply" }>,
    before: accruedBefore,
    accruedBefore,
    after,
    actionDiff: emptyDiff,
    limits,
    context,
  });

describe("blueSupply", () => {
  const assets = 1_000n;
  const shares = SharesMath.toShares(assets, 10_000n, 10_000n, "Down");

  test("default: supply shares and market totals grow as decoded", () => {
    const operation = op("blueSupply", {
      assets,
      funding: { type: "erc20", token: FIXTURE_TOKEN, assets },
    });
    const accruedBefore = fixtureSnapshot({
      markets: [fixtureMarket()],
      positions: [fixturePosition()],
    });
    const after = fixtureSnapshot({
      markets: [
        fixtureMarket({
          totalSupplyAssets: 10_000n + assets,
          totalSupplyShares: 10_000n + shares,
          liquidityAssets: 7_000n,
        }),
      ],
      positions: [
        fixturePosition({ supplyShares: shares, supplyAssets: assets }),
      ],
    });
    const verified = verify(operation, accruedBefore, after);
    expect(verified.operation).toBe(operation);
    expect(
      (verified.outcome as { supplySharesMinted: bigint }).supplySharesMinted,
    ).toBe(shares);
  });

  test("error: StateChangeMismatchError on short share mint", () => {
    const operation = op("blueSupply", {
      assets,
      funding: { type: "erc20", token: FIXTURE_TOKEN, assets },
    });
    const accruedBefore = fixtureSnapshot({
      markets: [fixtureMarket()],
      positions: [fixturePosition()],
    });
    const after = fixtureSnapshot({
      markets: [
        fixtureMarket({
          totalSupplyAssets: 11_000n,
          totalSupplyShares: 10_000n + shares,
          liquidityAssets: 7_000n,
        }),
      ],
      positions: [fixturePosition({ supplyShares: shares - 1n })],
    });
    expect(() => verify(operation, accruedBefore, after)).toThrow(
      StateChangeMismatchError,
    );
  });
});

describe("blueBorrow", () => {
  const borrowAssets = 500n;
  const shares = SharesMath.toShares(borrowAssets, 4_000n, 4_000n, "Up");

  const setup = (borrowShares = shares, lltv = 8n * 10n ** 17n) => {
    const operation = op("blueBorrow", { borrowAssets });
    const accruedBefore = fixtureSnapshot({
      markets: [
        fixtureMarket({
          market: {
            ...fixtureMarket().market,
            params: { ...fixtureMarket().market.params, lltv },
          },
        }),
      ],
      positions: [fixturePosition({ collateralAssets: 10_000n })],
    });
    const after = fixtureSnapshot({
      markets: [
        fixtureMarket({
          totalBorrowAssets: 4_000n + borrowAssets,
          totalBorrowShares: 4_000n + shares,
          liquidityAssets: 5_500n,
          market: {
            ...fixtureMarket().market,
            params: { ...fixtureMarket().market.params, lltv },
          },
        }),
      ],
      positions: [
        fixturePosition({
          collateralAssets: 10_000n,
          borrowShares,
          borrowAssets: 4_000n + borrowAssets,
        }),
      ],
    });
    return { operation, accruedBefore, after };
  };

  test("default: borrow shares minted and LTV passes", () => {
    const { operation, accruedBefore, after } = setup();
    const verified = verify(operation, accruedBefore, after);
    expect(
      (verified.outcome as { borrowSharesMinted: bigint }).borrowSharesMinted,
    ).toBe(shares);
  });

  test("error: MarketConstraintViolationError when LTV exceeds LLTV − buffer", () => {
    // lltv of 1% → any debt violates bound.
    const { operation, accruedBefore, after } = setup(shares, 10n ** 15n);
    expect(() => verify(operation, accruedBefore, after)).toThrow(
      MarketConstraintViolationError,
    );
  });

  test("error: MissingVerificationEvidenceError without oracle", () => {
    const { operation, accruedBefore, after } = setup();
    const noOracle = fixtureSnapshot({
      ...accruedBefore,
      markets: [
        fixtureMarket({
          oraclePrice: { type: "notApplicable", reason: "noOracle" },
        }),
      ],
    });
    expect(() => verify(operation, noOracle, after)).toThrow(
      MissingVerificationEvidenceError,
    );
  });
});

describe("blueRepay", () => {
  test("default: full-close burns every borrow share", () => {
    fc.assert(
      fc.property(fc.bigInt(1n, 4_000n), (shares) => {
        const operation = op("blueRepay", {
          repay: { type: "shares", shares },
          fullClose: true,
          funding: { type: "erc20", token: FIXTURE_TOKEN, assets: 10_000n },
        });
        const accruedBefore = fixtureSnapshot({
          markets: [fixtureMarket()],
          positions: [
            fixturePosition({
              borrowShares: shares,
              collateralAssets: 10_000n,
            }),
          ],
        });
        const after = fixtureSnapshot({
          markets: [fixtureMarket()],
          positions: [
            fixturePosition({
              borrowShares: 0n,
              collateralAssets: 10_000n,
            }),
          ],
        });
        const verified = verify(operation, accruedBefore, after);
        expect(
          (verified.outcome as { residualBorrowShares: bigint })
            .residualBorrowShares,
        ).toBe(0n);
      }),
    );
  });

  test("error: StateChangeMismatchError on residual debt after full close", () => {
    const operation = op("blueRepay", {
      repay: { type: "shares", shares: 100n },
      fullClose: true,
      funding: { type: "erc20", token: FIXTURE_TOKEN, assets: 100n },
    });
    const accruedBefore = fixtureSnapshot({
      markets: [fixtureMarket()],
      positions: [
        fixturePosition({ borrowShares: 200n, collateralAssets: 10_000n }),
      ],
    });
    const after = fixtureSnapshot({
      markets: [fixtureMarket()],
      positions: [
        fixturePosition({ borrowShares: 100n, collateralAssets: 10_000n }),
      ],
    });
    expect(() => verify(operation, accruedBefore, after)).toThrow(
      StateChangeMismatchError,
    );
  });
});

describe("blueWithdraw", () => {
  test("supply then withdraw all leaves zero shares", () => {
    fc.assert(
      fc.property(fc.bigInt(1n, 1_000n), (assets) => {
        const minted = SharesMath.toShares(assets, 10_000n, 10_000n, "Down");
        const operation = op("blueWithdraw", {
          amount: { type: "shares", shares: minted },
          fullClose: true,
        });
        const accruedBefore = fixtureSnapshot({
          markets: [fixtureMarket()],
          positions: [
            fixturePosition({ supplyShares: minted, supplyAssets: assets }),
          ],
        });
        const out = SharesMath.toAssets(minted, 10_000n, 10_000n, "Down");
        const after = fixtureSnapshot({
          markets: [
            fixtureMarket({
              totalSupplyAssets: 10_000n - out,
              totalSupplyShares: 10_000n - minted,
              liquidityAssets: 6_000n - out,
            }),
          ],
          positions: [fixturePosition()],
        });
        const verified = verify(operation, accruedBefore, after);
        expect(
          (verified.outcome as { supplySharesBurned: bigint })
            .supplySharesBurned,
        ).toBe(minted);
      }),
    );
  });
});

describe("blueWithdrawCollateral", () => {
  test("error: MarketConstraintViolationError on zero collateral with debt", () => {
    const operation = op("blueWithdrawCollateral", { collateralAssets: 500n });
    const accruedBefore = fixtureSnapshot({
      markets: [fixtureMarket()],
      positions: [
        fixturePosition({ collateralAssets: 500n, borrowShares: 100n }),
      ],
    });
    const after = fixtureSnapshot({
      markets: [fixtureMarket()],
      positions: [
        fixturePosition({ collateralAssets: 0n, borrowShares: 100n }),
      ],
    });
    expect(() => verify(operation, accruedBefore, after)).toThrow(
      MarketConstraintViolationError,
    );
  });
});

describe("blueAuthorization", () => {
  test("records authorization outcome without state checks", () => {
    const operation = op("blueAuthorization", { isAuthorized: true });
    const verified = verify(operation, fixtureSnapshot(), fixtureSnapshot());
    expect(verified.outcome).toEqual({ isAuthorized: true });
  });
});

describe("checkUnrelatedState", () => {
  test("unchanged unrelated positions pass", () => {
    const snapshot = fixtureSnapshot({
      positions: [fixturePosition({ supplyShares: 5n })],
    });
    expect(() =>
      checkUnrelatedState({
        accruedBefore: snapshot,
        after: snapshot,
        touchedMarketIds: new Set(),
        context,
      }),
    ).not.toThrow();
  });

  test("error: unrelated position change rejected", () => {
    const before = fixtureSnapshot({
      positions: [fixturePosition({ supplyShares: 5n })],
    });
    const after = fixtureSnapshot({
      positions: [fixturePosition({ supplyShares: 6n })],
    });
    expect(() =>
      checkUnrelatedState({
        accruedBefore: before,
        after,
        touchedMarketIds: new Set(),
        context,
      }),
    ).toThrow(StateChangeMismatchError);
  });
});
