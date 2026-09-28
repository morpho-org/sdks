import type { MarketId } from "@morpho-org/blue-sdk";
import fc from "fast-check";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  ConsumerLimitViolationError,
  SimulationValidationError,
} from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import type { RiskMetric, VerificationDiff } from "../internal/evidence.js";
import type { OperationLimitFields } from "../internal/limits.js";
import type { VerifiedOperation } from "../internal/result.js";
import { brandVerified, type VerifiedEffects } from "../internal/stages.js";
import type { EffectiveSimulationLimits } from "../request/effective-limits.js";
import { enforceLimits } from "./enforce-limits.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const RECEIVER: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const OTHER: Address = getAddress("0x9999999999999999999999999999999999999999");
const VAULT: Address = getAddress("0x4444444444444444444444444444444444444444");
const VAULT_B: Address = getAddress(
  "0x5555555555555555555555555555555555555555",
);
const ADAPTER: Address = getAddress(
  "0x6666666666666666666666666666666666666666",
);
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const MARKET_A = `0x${"aa".repeat(32)}` as MarketId;
const MARKET_B = `0x${"bb".repeat(32)}` as MarketId;
const WAD = 10n ** 18n;

const context = {
  chainId: 1,
  stateBlockNumber: 24_000_000n,
  stateBlockHash: `0x${"ab".repeat(32)}`,
  stateBlockTimestamp: 1_700_000_000n,
  blockNumber: 24_000_001n,
  blockTimestamp: 1_700_000_000n,
} as const;

const emptyDiff: VerificationDiff = {
  permissions: [],
  markets: [],
  positions: [],
  vaults: [],
  wallet: [],
};

const limits = (
  operations: readonly OperationLimit[] = [],
): EffectiveSimulationLimits =>
  ({
    operations,
    maxSlippageWad: 0n,
    minLltvBufferWad: 0n,
    maxSignatureLifetimeSeconds: 7200n,
  }) as unknown as EffectiveSimulationLimits;

const effects = (
  operations: readonly VerifiedOperation[],
  effectiveLimits: EffectiveSimulationLimits,
): VerifiedEffects =>
  brandVerified({
    evidence: {
      plan: { owner: OWNER },
      context,
    } as unknown as VerifiedEffects["evidence"],
    verification: {
      ...context,
      mode: "final",
      authorizations: [],
      limits: effectiveLimits,
      operations,
      diff: emptyDiff,
      actionDiff: emptyDiff,
      conversions: [],
      fees: [],
      permissionEvidence: [],
      before: {},
      after: {},
    } as unknown as VerifiedEffects["verification"],
  });

type OperationType = keyof OperationLimitFields;
type VerifiedOf<T extends OperationType> = Extract<
  VerifiedOperation,
  { readonly operation: { readonly type: T } }
>;

/** Build a verified operation from the fields the binding table reads. */
// biome-ignore lint/complexity/useMaxParams: fixture builder reads clearest positionally
const verifiedOp = <T extends OperationType>(
  type: T,
  operation: object,
  outcome: object,
  identity: { transactionIndex?: number; callPath?: readonly number[] } = {},
): VerifiedOf<T> =>
  ({
    operation: {
      type,
      chainId: 1,
      deployment: OTHER,
      owner: OWNER,
      transactionIndex: identity.transactionIndex ?? 0,
      callPath: identity.callPath ?? [0],
      ...operation,
    },
    outcome,
  }) as unknown as VerifiedOf<T>;

// biome-ignore lint/complexity/useMaxParams: fixture builder reads clearest positionally
const blueSupplyOp = (
  marketId: MarketId,
  assets: bigint,
  identity?: { transactionIndex?: number; callPath?: readonly number[] },
) =>
  verifiedOp(
    "blueSupply",
    { market: { marketId, params: {} }, assets, onBehalf: OWNER },
    { supplySharesMinted: 950n },
    identity,
  );

/**
 * Field matrix: one fixture per operation type whose limit declares EVERY
 * field at exact equality with the decoded calldata / verified outcome.
 * `Required<>` makes a missing field a compile error, so adding a limit field
 * without a matrix entry does not build.
 */
type FullLimit<T extends OperationType> = Required<
  T extends "vaultV1MigrateToV2"
    ? Omit<OperationLimitFields[T], "expectedShares">
    : OperationLimitFields[T]
> & { readonly type: T };

const deallocation = { adapter: ADAPTER, marketId: MARKET_A, assets: 10n };

const MATRIX: {
  readonly [T in OperationType]: {
    readonly verified: VerifiedOf<T>;
    readonly limit: FullLimit<T>;
  };
} = {
  blueSupply: {
    verified: blueSupplyOp(MARKET_A, 1_000n),
    limit: {
      type: "blueSupply",
      marketId: MARKET_A,
      expectedAssets: 1_000n,
      expectedOnBehalf: OWNER,
      minSupplySharesMinted: 950n,
    },
  },
  blueWithdraw: {
    verified: verifiedOp(
      "blueWithdraw",
      {
        market: { marketId: MARKET_A },
        receiver: RECEIVER,
        fullClose: true,
      },
      {
        assetsReceived: 100n,
        supplySharesBurned: 90n,
        utilizationAfterWad: 5n,
        reallocationPenaltyAssets: 1n,
      },
    ),
    limit: {
      type: "blueWithdraw",
      marketId: MARKET_A,
      expectedReceiver: RECEIVER,
      expectedFullClose: true,
      minAssetsReceived: 100n,
      maxSupplySharesBurned: 90n,
      maxUtilizationAfterWad: 5n,
      maxReallocationPenaltyAssets: 1n,
    },
  },
  blueSupplyCollateral: {
    verified: verifiedOp(
      "blueSupplyCollateral",
      {
        market: { marketId: MARKET_A },
        collateralAssets: 7n,
        onBehalf: OWNER,
        maxLtvWad: WAD,
      },
      { ltvAfterWad: { type: "finite", valueWad: 3n } },
    ),
    limit: {
      type: "blueSupplyCollateral",
      marketId: MARKET_A,
      expectedAssets: 7n,
      expectedOnBehalf: OWNER,
      maxLtvAfterWad: 3n,
    },
  },
  blueBorrow: {
    verified: verifiedOp(
      "blueBorrow",
      {
        market: { marketId: MARKET_A },
        borrowAssets: 100n,
        receiver: RECEIVER,
        maxLtvWad: WAD,
      },
      {
        borrowSharesMinted: 100n,
        ltvAfterWad: { type: "finite", valueWad: 50n },
        healthFactorAfterWad: { type: "finite", valueWad: 2n * WAD },
        utilizationAfterWad: 6n,
        borrowApyAfterWad: 4n,
        reallocationPenaltyAssets: 1n,
      },
    ),
    limit: {
      type: "blueBorrow",
      marketId: MARKET_A,
      expectedAssets: 100n,
      expectedReceiver: RECEIVER,
      maxBorrowSharesMinted: 100n,
      maxLtvAfterWad: 50n,
      minHealthFactorAfterWad: 2n * WAD,
      maxUtilizationAfterWad: 6n,
      maxAfterBorrowApyWad: 4n,
      maxReallocationPenaltyAssets: 1n,
    },
  },
  blueSupplyCollateralBorrow: {
    verified: verifiedOp(
      "blueSupplyCollateralBorrow",
      {
        market: { marketId: MARKET_A },
        collateralAssets: 9n,
        borrowAssets: 100n,
        onBehalf: OWNER,
        receiver: RECEIVER,
        maxLtvWad: WAD,
      },
      {
        borrowSharesMinted: 100n,
        ltvAfterWad: { type: "finite", valueWad: 50n },
        healthFactorAfterWad: { type: "finite", valueWad: 2n * WAD },
        utilizationAfterWad: 6n,
        borrowApyAfterWad: 4n,
        reallocationPenaltyAssets: 1n,
      },
    ),
    limit: {
      type: "blueSupplyCollateralBorrow",
      marketId: MARKET_A,
      expectedCollateralAssets: 9n,
      expectedBorrowAssets: 100n,
      expectedOnBehalf: OWNER,
      expectedReceiver: RECEIVER,
      maxBorrowSharesMinted: 100n,
      maxLtvAfterWad: 50n,
      minHealthFactorAfterWad: 2n * WAD,
      maxUtilizationAfterWad: 6n,
      maxAfterBorrowApyWad: 4n,
      maxReallocationPenaltyAssets: 1n,
    },
  },
  blueRepay: {
    verified: verifiedOp(
      "blueRepay",
      {
        market: { marketId: MARKET_A },
        onBehalf: OWNER,
        fullClose: false,
        maxRepayAssets: 100n,
      },
      {
        assetsPaid: 80n,
        borrowSharesBurned: 70n,
        residualBorrowShares: 5n,
        refundAssets: 20n,
      },
    ),
    limit: {
      type: "blueRepay",
      marketId: MARKET_A,
      expectedOnBehalf: OWNER,
      expectedFullClose: false,
      maxAssetsPaid: 80n,
      minBorrowSharesBurned: 70n,
      maxResidualBorrowShares: 5n,
      minRefundAssets: 20n,
    },
  },
  blueWithdrawCollateral: {
    verified: verifiedOp(
      "blueWithdrawCollateral",
      {
        market: { marketId: MARKET_A },
        collateralAssets: 7n,
        receiver: RECEIVER,
        maxLtvWad: WAD,
      },
      {
        ltvAfterWad: { type: "finite", valueWad: 3n },
        healthFactorAfterWad: { type: "finite", valueWad: 2n * WAD },
      },
    ),
    limit: {
      type: "blueWithdrawCollateral",
      marketId: MARKET_A,
      expectedAssets: 7n,
      expectedReceiver: RECEIVER,
      maxLtvAfterWad: 3n,
      minHealthFactorAfterWad: 2n * WAD,
    },
  },
  blueRepayWithdrawCollateral: {
    verified: verifiedOp(
      "blueRepayWithdrawCollateral",
      {
        market: { marketId: MARKET_A },
        collateralAssets: 7n,
        onBehalf: OWNER,
        receiver: RECEIVER,
        fullClose: true,
        maxRepayAssets: 100n,
        maxLtvWad: WAD,
      },
      {
        assetsPaid: 80n,
        borrowSharesBurned: 70n,
        residualBorrowShares: 1n,
        refundAssets: 20n,
        ltvAfterWad: { type: "finite", valueWad: 3n },
        healthFactorAfterWad: { type: "finite", valueWad: 2n * WAD },
      },
    ),
    limit: {
      type: "blueRepayWithdrawCollateral",
      marketId: MARKET_A,
      expectedWithdrawAssets: 7n,
      expectedOnBehalf: OWNER,
      expectedReceiver: RECEIVER,
      expectedFullClose: true,
      maxAssetsPaid: 80n,
      minBorrowSharesBurned: 70n,
      maxResidualBorrowShares: 1n,
      minRefundAssets: 20n,
      maxLtvAfterWad: 3n,
      minHealthFactorAfterWad: 2n * WAD,
    },
  },
  blueRefinance: {
    verified: verifiedOp(
      "blueRefinance",
      {
        sourceMarket: { marketId: MARKET_A },
        targetMarket: { marketId: MARKET_B },
        maxLtvWad: WAD,
      },
      {
        targetBorrowAssets: 100n,
        targetBorrowSharesMinted: 99n,
        sourceResidualBorrowShares: 1n,
        targetLtvAfterWad: { type: "finite", valueWad: 50n },
        targetHealthFactorAfterWad: { type: "finite", valueWad: 2n * WAD },
        loanDustAssets: 1n,
        reallocationPenaltyAssets: 2n,
      },
    ),
    limit: {
      type: "blueRefinance",
      sourceMarketId: MARKET_A,
      targetMarketId: MARKET_B,
      maxTargetBorrowAssets: 100n,
      maxTargetBorrowSharesMinted: 99n,
      maxSourceResidualBorrowShares: 1n,
      maxTargetLtvAfterWad: 50n,
      minTargetHealthFactorAfterWad: 2n * WAD,
      maxLoanDustAssets: 1n,
      maxReallocationPenaltyAssets: 2n,
    },
  },
  blueAuthorization: {
    verified: verifiedOp(
      "blueAuthorization",
      { authorized: RECEIVER, isAuthorized: true },
      {},
    ),
    limit: {
      type: "blueAuthorization",
      authorized: RECEIVER,
      expectedIsAuthorized: true,
    },
  },
  vaultV1Deposit: {
    verified: verifiedOp(
      "vaultV1Deposit",
      {
        vault: VAULT,
        funding: { type: "erc20", token: TOKEN, assets: 1_000n },
        receiver: RECEIVER,
        maxSharePriceE27: 10n ** 27n,
        referralFee: { rateWad: 0n },
      },
      { sharesMinted: 1_000n },
    ),
    limit: {
      type: "vaultV1Deposit",
      vault: VAULT,
      expectedAssets: 1_000n,
      expectedReceiver: RECEIVER,
      minSharesMinted: 1_000n,
    },
  },
  vaultV2Deposit: {
    verified: verifiedOp(
      "vaultV2Deposit",
      {
        vault: VAULT,
        funding: { type: "erc20", token: TOKEN, assets: 1_000n },
        receiver: RECEIVER,
        maxSharePriceE27: 10n ** 27n,
        referralFee: { rateWad: 0n },
      },
      { sharesMinted: 1_000n },
    ),
    limit: {
      type: "vaultV2Deposit",
      vault: VAULT,
      expectedAssets: 1_000n,
      expectedReceiver: RECEIVER,
      minSharesMinted: 1_000n,
    },
  },
  vaultV1Withdraw: {
    verified: verifiedOp(
      "vaultV1Withdraw",
      { vault: VAULT, assets: 10n, receiver: RECEIVER },
      { sharesBurned: 11n },
    ),
    limit: {
      type: "vaultV1Withdraw",
      vault: VAULT,
      expectedAssets: 10n,
      expectedReceiver: RECEIVER,
      maxSharesBurned: 11n,
    },
  },
  vaultV2Withdraw: {
    verified: verifiedOp(
      "vaultV2Withdraw",
      { vault: VAULT, assets: 10n, receiver: RECEIVER },
      { sharesBurned: 11n },
    ),
    limit: {
      type: "vaultV2Withdraw",
      vault: VAULT,
      expectedAssets: 10n,
      expectedReceiver: RECEIVER,
      maxSharesBurned: 11n,
    },
  },
  vaultV1Redeem: {
    verified: verifiedOp(
      "vaultV1Redeem",
      { vault: VAULT, shares: 10n, receiver: RECEIVER },
      { assetsReceived: 9n },
    ),
    limit: {
      type: "vaultV1Redeem",
      vault: VAULT,
      expectedShares: 10n,
      expectedReceiver: RECEIVER,
      minAssetsReceived: 9n,
    },
  },
  vaultV2Redeem: {
    verified: verifiedOp(
      "vaultV2Redeem",
      { vault: VAULT, shares: 10n, receiver: RECEIVER },
      { assetsReceived: 9n },
    ),
    limit: {
      type: "vaultV2Redeem",
      vault: VAULT,
      expectedShares: 10n,
      expectedReceiver: RECEIVER,
      minAssetsReceived: 9n,
    },
  },
  vaultV2ForceWithdraw: {
    verified: verifiedOp(
      "vaultV2ForceWithdraw",
      { vault: VAULT, exitAssets: 100n, adapter: ADAPTER },
      { sharesBurned: 100n, assetsReceived: 95n, penaltyAssets: 5n },
    ),
    limit: {
      type: "vaultV2ForceWithdraw",
      vault: VAULT,
      expectedExitAssets: 100n,
      expectedAdapter: ADAPTER,
      maxSharesBurned: 100n,
      minAssetsReceived: 95n,
      maxPenaltyAssets: 5n,
    },
  },
  vaultV2ForceRedeem: {
    verified: verifiedOp(
      "vaultV2ForceRedeem",
      {
        vault: VAULT,
        shares: 100n,
        receiver: RECEIVER,
        onBehalf: OWNER,
        deallocations: [deallocation],
      },
      { assetsReceived: 95n, penaltyShares: 2n, penaltyAssets: 5n },
    ),
    limit: {
      type: "vaultV2ForceRedeem",
      vault: VAULT,
      expectedShares: 100n,
      expectedRecipient: RECEIVER,
      expectedOnBehalf: OWNER,
      expectedDeallocations: [deallocation],
      minAssetsReceived: 95n,
      maxPenaltyShares: 2n,
      maxPenaltyAssets: 5n,
    },
  },
  vaultV1InKindRedeem: {
    verified: verifiedOp(
      "vaultV1InKindRedeem",
      {
        vault: VAULT,
        assets: 100n,
        markets: [{ marketId: MARKET_A }, { marketId: MARKET_B }],
      },
      {
        sharesBurned: 100n,
        idleAssetsReceived: 10n,
        supplyAssetsByMarket: [
          { marketId: MARKET_A, assets: 60n },
          { marketId: MARKET_B, assets: 30n },
        ],
        penaltyAssets: 1n,
        residualShareAllowance: 1n,
      },
    ),
    limit: {
      type: "vaultV1InKindRedeem",
      vault: VAULT,
      expectedAssets: 100n,
      expectedMarketIds: [MARKET_A, MARKET_B],
      maxSharesBurned: 100n,
      minIdleAssetsReceived: 10n,
      minSupplyAssetsByMarket: [
        { marketId: MARKET_A, minAssets: 60n },
        { marketId: MARKET_B, minAssets: 30n },
      ],
      maxPenaltyAssets: 1n,
      maxResidualShareAllowance: 1n,
    },
  },
  vaultV2InKindRedeem: {
    verified: verifiedOp(
      "vaultV2InKindRedeem",
      {
        vault: VAULT,
        assets: 100n,
        markets: [{ marketId: MARKET_A }],
      },
      {
        sharesBurned: 100n,
        idleAssetsReceived: 10n,
        supplyAssetsByMarket: [{ marketId: MARKET_A, assets: 90n }],
        penaltyAssets: 1n,
        residualShareAllowance: 1n,
      },
    ),
    limit: {
      type: "vaultV2InKindRedeem",
      vault: VAULT,
      expectedAssets: 100n,
      expectedMarketIds: [MARKET_A],
      maxSharesBurned: 100n,
      minIdleAssetsReceived: 10n,
      minSupplyAssetsByMarket: [{ marketId: MARKET_A, minAssets: 90n }],
      maxPenaltyAssets: 1n,
      maxResidualShareAllowance: 1n,
    },
  },
  vaultV1MigrateToV2: {
    verified: verifiedOp(
      "vaultV1MigrateToV2",
      {
        sourceVault: VAULT,
        targetVault: VAULT_B,
        receiver: RECEIVER,
        amount: { type: "assets", assets: 50n },
      },
      { targetSharesMinted: 49n },
    ),
    limit: {
      type: "vaultV1MigrateToV2",
      sourceVault: VAULT,
      targetVault: VAULT_B,
      expectedReceiver: RECEIVER,
      expectedAssets: 50n,
      minTargetSharesMinted: 49n,
    },
  },
};

/** Identity fields bind the subject; breaching them is a validation error, not a violation. */
const SUBJECT_FIELDS = new Set([
  "type",
  "marketId",
  "sourceMarketId",
  "targetMarketId",
  "vault",
  "sourceVault",
  "targetVault",
  "authorized",
]);

/** Nudge one field so the same successful execution now breaches it. */
const breach = (field: string, value: unknown): unknown => {
  if (typeof value === "bigint")
    return field.startsWith("min") ? value + 1n : value - 1n;
  if (typeof value === "boolean") return !value;
  if (typeof value === "string") return OTHER;
  if (Array.isArray(value)) {
    if (field === "minSupplyAssetsByMarket")
      return value.map((leg: { marketId: MarketId; minAssets: bigint }) => ({
        ...leg,
        minAssets: leg.minAssets + 1n,
      }));
    return [];
  }
  throw new Error(`no breach for ${field}`);
};

describe("enforceLimits", () => {
  test("default: binds a matching limit and returns branded effects", () => {
    const verified = effects(
      [blueSupplyOp(MARKET_A, 1_000n)],
      limits([{ type: "blueSupply", marketId: MARKET_A }]),
    );
    const result = enforceLimits(verified);
    expect(result.effects).toBe(verified);
    expect(result.boundLimits).toHaveLength(1);
  });

  describe("field matrix", () => {
    for (const [type, { verified, limit }] of Object.entries(MATRIX)) {
      test(`behavior: ${type} passes with every field at inclusive equality`, () => {
        expect(() =>
          enforceLimits(effects([verified], limits([limit]))),
        ).not.toThrow();
      });

      for (const [field, value] of Object.entries(limit)) {
        if (SUBJECT_FIELDS.has(field)) continue;
        test(`error: ${type}.${field} breach on a successful execution throws ConsumerLimitViolationError`, () => {
          const breached = { ...limit, [field]: breach(field, value) };
          const run = () =>
            enforceLimits(
              effects([verified], limits([breached as OperationLimit])),
            );
          expect(run).toThrow(ConsumerLimitViolationError);
          try {
            run();
          } catch (error) {
            expect(error).toMatchObject({
              context: { stage: "verification", field: `${type}.${field}` },
            });
          }
        });
      }
    }
  });

  test("behavior: debtFree risk passes every cap and floor; unbounded fails caps and passes floors", () => {
    const risk = (ltv: RiskMetric, hf: RiskMetric) =>
      verifiedOp(
        "blueRepayWithdrawCollateral",
        { market: { marketId: MARKET_A }, maxLtvWad: WAD },
        { ltvAfterWad: ltv, healthFactorAfterWad: hf },
      );
    const run = (verified: VerifiedOperation, limit: object) => () =>
      enforceLimits(
        effects(
          [verified],
          limits([
            {
              type: "blueRepayWithdrawCollateral",
              marketId: MARKET_A,
              ...limit,
            } as OperationLimit,
          ]),
        ),
      );
    const debtFree = risk({ type: "debtFree" }, { type: "debtFree" });
    expect(run(debtFree, { maxLtvAfterWad: 0n })).not.toThrow();
    expect(
      run(debtFree, { minHealthFactorAfterWad: 100n * WAD }),
    ).not.toThrow();

    const unbounded = risk(
      { type: "unbounded", reason: "zeroCollateral" },
      { type: "unbounded", reason: "zeroCollateral" },
    );
    expect(run(unbounded, { maxLtvAfterWad: WAD - 1n })).toThrow(
      ConsumerLimitViolationError,
    );
    expect(
      run(unbounded, { minHealthFactorAfterWad: 100n * WAD }),
    ).not.toThrow();
  });

  test("error: minByMarket with a market the execution never credited throws ConsumerLimitViolationError", () => {
    const { verified } = MATRIX.vaultV2InKindRedeem;
    expect(() =>
      enforceLimits(
        effects(
          [verified],
          limits([
            {
              type: "vaultV2InKindRedeem",
              vault: VAULT,
              minSupplyAssetsByMarket: [{ marketId: MARKET_B, minAssets: 0n }],
            },
          ]),
        ),
      ),
    ).toThrow(ConsumerLimitViolationError);
  });

  test("behavior: repeated subjects are enforced per transactionIndex", () => {
    const ops = [
      blueSupplyOp(MARKET_A, 1_000n, { transactionIndex: 0 }),
      blueSupplyOp(MARKET_A, 2_000n, { transactionIndex: 1 }),
    ];
    const ok = limits([
      {
        type: "blueSupply",
        marketId: MARKET_A,
        transactionIndex: 1,
        expectedAssets: 2_000n,
      },
      {
        type: "blueSupply",
        marketId: MARKET_A,
        transactionIndex: 0,
        expectedAssets: 1_000n,
      },
    ]);
    const bound = enforceLimits(effects(ops, ok)).boundLimits;
    expect(bound.map((b) => b.operation.transactionIndex)).toEqual([0, 1]);
    expect(() =>
      enforceLimits(
        effects(
          ops,
          limits([
            {
              type: "blueSupply",
              marketId: MARKET_A,
              transactionIndex: 1,
              expectedAssets: 1_000n,
            },
          ]),
        ),
      ),
    ).toThrow(ConsumerLimitViolationError);
  });

  test("behavior: repeated pinned inputs give byte-stable bound limits and diagnostics", () => {
    const { verified, limit } = MATRIX.blueBorrow;
    const run = () => enforceLimits(effects([verified], limits([limit])));
    expect(
      JSON.stringify(run(), (_k, v) => (typeof v === "bigint" ? `${v}` : v)),
    ).toBe(
      JSON.stringify(run(), (_k, v) => (typeof v === "bigint" ? `${v}` : v)),
    );
    const breached = { ...limit, maxLtvAfterWad: 49n };
    const fail = () => {
      try {
        enforceLimits(effects([verified], limits([breached])));
      } catch (error) {
        return error instanceof ConsumerLimitViolationError
          ? { message: error.message, context: error.context }
          : error;
      }
    };
    expect(fail()).toEqual(fail());
  });

  test("error: unknown, inapplicable, ambiguous, duplicate and widening limits throw SimulationValidationError before comparison", () => {
    const ops = [
      blueSupplyOp(MARKET_A, 1_000n, { transactionIndex: 0 }),
      blueSupplyOp(MARKET_A, 1_000n, { transactionIndex: 1 }),
    ];
    const cases: readonly [string, OperationLimit][] = [
      ["unknown", { type: "vaultV1Deposit", vault: VAULT }],
      ["inapplicable", { type: "blueSupply", marketId: MARKET_B }],
      ["ambiguous", { type: "blueSupply", marketId: MARKET_A }],
      [
        "widening",
        {
          type: "blueSupply",
          marketId: MARKET_A,
          transactionIndex: 0,
          minSupplySharesMinted: -1n,
        },
      ],
    ];
    for (const [kind, limit] of cases) {
      try {
        enforceLimits(effects(ops, limits([limit])));
        expect.unreachable(kind);
      } catch (error) {
        expect(error).toBeInstanceOf(SimulationValidationError);
        expect((error as SimulationValidationError).fieldErrors?.[0]).toContain(
          `(${kind} limit)`,
        );
      }
    }
    expect(() =>
      enforceLimits(
        effects(
          ops,
          limits([
            { type: "blueSupply", marketId: MARKET_A, transactionIndex: 0 },
            { type: "blueSupply", marketId: MARKET_A, transactionIndex: 0 },
          ]),
        ),
      ),
    ).toThrow(SimulationValidationError);
  });

  test("error: weaker-than-calldata bounds throw SimulationValidationError", () => {
    const weaker: readonly [OperationType, OperationLimit][] = [
      [
        "blueBorrow",
        { type: "blueBorrow", marketId: MARKET_A, maxLtvAfterWad: WAD + 1n },
      ],
      [
        "blueRefinance",
        {
          type: "blueRefinance",
          sourceMarketId: MARKET_A,
          targetMarketId: MARKET_B,
          maxTargetLtvAfterWad: WAD + 1n,
        },
      ],
      [
        "blueRepay",
        { type: "blueRepay", marketId: MARKET_A, maxAssetsPaid: 101n },
      ],
      [
        "vaultV1Deposit",
        { type: "vaultV1Deposit", vault: VAULT, minSharesMinted: 999n },
      ],
    ];
    for (const [type, limit] of weaker) {
      expect(() =>
        enforceLimits(effects([MATRIX[type].verified], limits([limit]))),
      ).toThrow(SimulationValidationError);
    }
  });

  test("error: malformed limit values throw SimulationValidationError instead of being skipped", () => {
    const malformed: readonly [OperationType, object][] = [
      [
        "blueBorrow",
        { type: "blueBorrow", marketId: MARKET_A, maxLtvAfterWad: 1 },
      ],
      [
        "blueBorrow",
        { type: "blueBorrow", marketId: MARKET_A, maxLtvAfterWad: "1" },
      ],
      [
        "vaultV1InKindRedeem",
        {
          type: "vaultV1InKindRedeem",
          vault: VAULT,
          minSupplyAssetsByMarket: "x",
        },
      ],
      [
        "vaultV1InKindRedeem",
        {
          type: "vaultV1InKindRedeem",
          vault: VAULT,
          minSupplyAssetsByMarket: [{ marketId: MARKET_A }],
        },
      ],
    ];
    for (const [type, limit] of malformed) {
      expect(() =>
        enforceLimits(
          effects([MATRIX[type].verified], limits([limit as OperationLimit])),
        ),
      ).toThrow(SimulationValidationError);
    }
  });

  test("property: tightening a bound never turns a failure into a success", () => {
    const { verified, limit } = MATRIX.blueBorrow;
    const run = (l: OperationLimit): boolean => {
      try {
        enforceLimits(effects([verified], limits([l])));
        return true;
      } catch (error) {
        if (error instanceof ConsumerLimitViolationError) return false;
        throw error;
      }
    };
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: WAD }),
        fc.bigInt({ min: 0n, max: WAD }),
        fc.bigInt({ min: 0n, max: 10n * WAD }),
        fc.bigInt({ min: 0n, max: 10n * WAD }),
        // biome-ignore lint/complexity/useMaxParams: one arbitrary per bound edge
        (ltvA, ltvB, hfA, hfB) => {
          const loose = {
            ...limit,
            maxLtvAfterWad: ltvA > ltvB ? ltvA : ltvB,
            minHealthFactorAfterWad: hfA < hfB ? hfA : hfB,
          };
          const tight = {
            ...limit,
            maxLtvAfterWad: ltvA > ltvB ? ltvB : ltvA,
            minHealthFactorAfterWad: hfA < hfB ? hfB : hfA,
          };
          return run(loose) || !run(tight);
        },
      ),
    );
  });
});
