import { SharesMath } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import type { SimulationErrorContext } from "../../domain/diagnostics.js";
import type { VerificationDiff } from "../../domain/evidence.js";
import type { EffectiveSimulationLimits } from "../../domain/limits.js";
import type { DecodedOperation } from "../../domain/operations.js";
import type { DecodedBundle } from "../../domain/stages.js";
import {
  MarketConstraintViolationError,
  ProtocolBindingMismatchError,
  StateChangeMismatchError,
} from "../../errors.js";
import {
  FIXTURE_MARKET_ID_2,
  FIXTURE_NOW,
  FIXTURE_OWNER,
  fixtureMarket,
  fixturePosition,
  fixtureSnapshot,
} from "../../test-helpers/index.js";
import { verifyRefinanceOperation } from "./refinance.js";

const limits: EffectiveSimulationLimits = {
  maxSlippageWad: 10n ** 15n,
  minLltvBufferWad: 5n * 10n ** 15n,
  maxSignatureLifetimeSeconds: 7_200n,
  wallet: { maxDebit: [], minCredit: [] },
  operations: [],
};

const context: SimulationErrorContext = { stage: "verification" };

const SOURCE_MARKET = fixtureMarket();
const TARGET_MARKET = fixtureMarket({}, FIXTURE_MARKET_ID_2);

const op = (overrides: Record<string, unknown> = {}): DecodedOperation =>
  ({
    type: "blueRefinance",
    transactionIndex: 0,
    callPath: [],
    chainId: 1,
    deployment: "0xbBbBB9fc5e258E8B39f9c12A1C3bb3D18Ed9c48A",
    owner: FIXTURE_OWNER,
    route: "blueBundlesV1",
    sourceMarket: SOURCE_MARKET.market,
    targetMarket: TARGET_MARKET.market,
    onBehalf: FIXTURE_OWNER,
    receiver: FIXTURE_OWNER,
    deadline: FIXTURE_NOW + 3600n,
    referralFee: { rateWad: 0n, recipient: FIXTURE_OWNER },
    authorizationSignature: { type: "none" },
    maxLtvWad: 0n,
    reallocations: [],
    sourceFullClose: true,
    ...overrides,
  }) as unknown as DecodedOperation;

const bundle = (operations: readonly DecodedOperation[]): DecodedBundle =>
  ({
    request: { chainId: 1, mode: "final", authorizations: [] },
    owner: FIXTURE_OWNER,
    operations,
  }) as unknown as DecodedBundle;

const SOURCE_DEBT_SHARES = 1_000n;
const SOURCE_COLLATERAL = 10_000n;
const repaidAssets = SharesMath.toAssets(
  SOURCE_DEBT_SHARES,
  4_000n,
  4_000n,
  "Up",
);
const mintedShares = SharesMath.toShares(repaidAssets, 4_000n, 4_000n, "Up");

const setup = (
  overrides: {
    sourceAfter?: Parameters<typeof fixturePosition>[0];
    targetAfter?: Parameters<typeof fixturePosition>[0];
    op?: Record<string, unknown>;
    afterMarkets?: Parameters<typeof fixtureMarket>[0][];
  } = {},
) => {
  const operation = op(overrides.op);
  const accruedBefore = fixtureSnapshot({
    markets: [SOURCE_MARKET, TARGET_MARKET],
    positions: [
      fixturePosition({
        borrowShares: SOURCE_DEBT_SHARES,
        collateralAssets: SOURCE_COLLATERAL,
      }),
      fixturePosition({}),
      // second market position — same shape, different marketId
    ],
  });
  // second position on target market
  const beforeWithTarget = fixtureSnapshot({
    ...accruedBefore,
    positions: [
      accruedBefore.positions[0]!,
      fixturePosition({ marketId: FIXTURE_MARKET_ID_2 }),
    ],
  });
  const after = fixtureSnapshot({
    markets: [SOURCE_MARKET, fixtureMarket({}, FIXTURE_MARKET_ID_2)],
    positions: [
      fixturePosition({
        borrowShares: 0n,
        collateralAssets: 0n,
        ...overrides.sourceAfter,
      }),
      fixturePosition({
        marketId: FIXTURE_MARKET_ID_2,
        collateralAssets: SOURCE_COLLATERAL,
        borrowShares: mintedShares,
        ...overrides.targetAfter,
      }),
    ],
  });
  return { operation, accruedBefore: beforeWithTarget, after };
};

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const verify = (
  operation: DecodedOperation,
  accruedBefore: ReturnType<typeof fixtureSnapshot>,
  after: ReturnType<typeof fixtureSnapshot>,
  actionDiff: VerificationDiff = {
    wallet: [],
    permissions: [],
    positions: [],
    vaults: [],
    markets: [],
  },
) =>
  verifyRefinanceOperation({
    bundle: bundle([operation]),
    operation: operation as Extract<
      DecodedOperation,
      { type: "blueRefinance" }
    >,
    before: accruedBefore,
    accruedBefore,
    after,
    actionDiff,
    limits,
    context,
  });

describe("verifyRefinanceOperation", () => {
  test("default: full source close + exact target collateral + minted shares", () => {
    const { operation, accruedBefore, after } = setup();
    const verified = verify(operation, accruedBefore, after);
    const outcome = verified.outcome as {
      targetBorrowSharesMinted: bigint;
      sourceResidualBorrowShares: bigint;
    };
    expect(outcome.targetBorrowSharesMinted).toBe(mintedShares);
    expect(outcome.sourceResidualBorrowShares).toBe(0n);
  });

  test("error: StateChangeMismatchError on residual source collateral", () => {
    const { operation, accruedBefore, after } = setup({
      sourceAfter: { collateralAssets: 1n },
    });
    expect(() => verify(operation, accruedBefore, after)).toThrow(
      StateChangeMismatchError,
    );
  });

  test("error: MarketConstraintViolationError when target LTV bound breaks", () => {
    // Tiny lltv on the target makes any debt violate the buffer bound.
    const tightTarget = fixtureMarket(
      {
        market: {
          ...TARGET_MARKET.market,
          params: { ...TARGET_MARKET.market.params, lltv: 10n ** 15n },
        },
      },
      FIXTURE_MARKET_ID_2,
    );
    const { accruedBefore } = setup();
    const after = fixtureSnapshot({
      markets: [SOURCE_MARKET, tightTarget],
      positions: [
        fixturePosition({ borrowShares: 0n, collateralAssets: 0n }),
        fixturePosition({
          marketId: FIXTURE_MARKET_ID_2,
          collateralAssets: SOURCE_COLLATERAL,
          borrowShares: mintedShares,
        }),
      ],
    });
    const opWithTightTarget = op({ targetMarket: tightTarget.market });
    expect(() => verify(opWithTightTarget, accruedBefore, after)).toThrow(
      MarketConstraintViolationError,
    );
  });

  test("error: ProtocolBindingMismatchError when target market is unbound", () => {
    const operation = op();
    const accruedBefore = fixtureSnapshot({
      markets: [SOURCE_MARKET, TARGET_MARKET],
      positions: [
        fixturePosition({ borrowShares: 1_000n, collateralAssets: 10_000n }),
        fixturePosition({ marketId: FIXTURE_MARKET_ID_2 }),
      ],
    });
    const after = fixtureSnapshot({
      markets: [SOURCE_MARKET],
      positions: [fixturePosition({ borrowShares: 0n, collateralAssets: 0n })],
    });
    expect(() => verify(operation, accruedBefore, after)).toThrow(
      ProtocolBindingMismatchError,
    );
  });
});
