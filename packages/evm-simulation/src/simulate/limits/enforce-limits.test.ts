import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { VerificationDiff } from "../../domain/evidence.js";
import type { EffectiveSimulationLimits } from "../../domain/limits.js";
import type { DecodedOperation } from "../../domain/operations.js";
import type { VerifiedOperation } from "../../domain/result.js";
import { brandVerified, type VerifiedEffects } from "../../domain/stages.js";
import { ConsumerLimitViolationError } from "../../errors.js";
import { enforceLimits } from "./enforce-limits.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const RECEIVER: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const MARKET_A = `0x${"aa".repeat(32)}` as MarketId;
const MARKET_B = `0x${"bb".repeat(32)}` as MarketId;

const context = {
  chainId: 1,
  stateBlockNumber: 24_000_000n,
  stateBlockHash: `0x${"ab".repeat(32)}`,
  blockNumber: 24_000_001n,
  blockTimestamp: 1_700_000_000n,
};

const emptyDiff: VerificationDiff = {
  permissions: [],
  markets: [],
  positions: [],
  vaults: [],
  wallet: [],
};

const limits = (
  operations: EffectiveSimulationLimits["operations"] = [],
): EffectiveSimulationLimits =>
  ({
    wallet: { maxDebit: [], minCredit: [] },
    operations,
    maxSlippageWad: 0n,
    minLltvBufferWad: 0n,
  }) as unknown as EffectiveSimulationLimits;

const blueSupplyOp = (
  marketId: MarketId,
  assets: bigint,
): Extract<DecodedOperation, { readonly type: "blueSupply" }> =>
  ({
    type: "blueSupply",
    chainId: 1,
    deployment: getAddress("0x3333333333333333333333333333333333333333"),
    owner: OWNER,
    transactionIndex: 0,
    market: { marketId, params: {} },
    assets,
    onBehalf: OWNER,
  }) as unknown as Extract<DecodedOperation, { readonly type: "blueSupply" }>;

const effects = (
  operations: readonly VerifiedOperation[],
  effectiveLimits: EffectiveSimulationLimits,
): VerifiedEffects =>
  brandVerified({
    evidence: {
      plan: { owner: OWNER },
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

describe("enforceLimits", () => {
  test("default: binds a matching limit and returns branded effects", () => {
    const verified = effects(
      [
        {
          operation: blueSupplyOp(MARKET_A, 1_000n),
          outcome: { supplySharesMinted: 950n },
        },
      ],
      limits([{ type: "blueSupply", marketId: MARKET_A }]),
    );
    const result = enforceLimits(verified);
    expect(result.effects).toBe(verified);
    expect(result.boundLimits).toHaveLength(1);
  });

  test("error: equals binding mismatch throws ConsumerLimitViolationError", () => {
    const verified = effects(
      [
        {
          operation: blueSupplyOp(MARKET_A, 1_000n),
          outcome: { supplySharesMinted: 950n },
        },
      ],
      limits([{ type: "blueSupply", marketId: MARKET_B }]),
    );
    expect(() => enforceLimits(verified)).toThrow(ConsumerLimitViolationError);
  });

  test("error: equals binding on expectedAssets throws ConsumerLimitViolationError", () => {
    const verified = effects(
      [
        {
          operation: blueSupplyOp(MARKET_A, 1_000n),
          outcome: { supplySharesMinted: 950n },
        },
      ],
      limits([
        { type: "blueSupply", marketId: MARKET_A, expectedAssets: 2_000n },
      ]),
    );
    expect(() => enforceLimits(verified)).toThrow(ConsumerLimitViolationError);
  });

  test("error: min binding below bound throws ConsumerLimitViolationError", () => {
    const verified = effects(
      [
        {
          operation: blueSupplyOp(MARKET_A, 1_000n),
          outcome: { supplySharesMinted: 950n },
        },
      ],
      limits([
        {
          type: "blueSupply",
          marketId: MARKET_A,
          minSupplySharesMinted: 999n,
        },
      ]),
    );
    expect(() => enforceLimits(verified)).toThrow(ConsumerLimitViolationError);
  });

  test("error: max binding with non-finite RiskMetric throws ConsumerLimitViolationError", () => {
    const verified = effects(
      [
        {
          operation: {
            type: "blueBorrow",
            chainId: 1,
            deployment: getAddress(
              "0x3333333333333333333333333333333333333333",
            ),
            owner: OWNER,
            transactionIndex: 0,
            market: { marketId: MARKET_A, params: {} },
            borrowAssets: 100n,
            receiver: RECEIVER,
          } as unknown as Extract<
            DecodedOperation,
            { readonly type: "blueBorrow" }
          >,
          outcome: {
            borrowSharesMinted: 100n,
            ltvAfterWad: { type: "unbounded" },
            healthFactorAfterWad: { type: "unbounded" },
            utilizationAfterWad: 0n,
            borrowApyAfterWad: 0n,
            reallocationPenaltyAssets: 0n,
          } as unknown as Extract<
            VerifiedOperation,
            { readonly operation: { readonly type: "blueBorrow" } }
          >["outcome"],
        },
      ],
      limits([
        { type: "blueBorrow", marketId: MARKET_A, maxLtvAfterWad: 900n },
      ]),
    );
    expect(() => enforceLimits(verified)).toThrow(ConsumerLimitViolationError);
  });

  test("error: unmatched operation limit throws ConsumerLimitViolationError", () => {
    const verified = effects(
      [],
      limits([{ type: "blueSupply", marketId: MARKET_A }]),
    );
    expect(() => enforceLimits(verified)).toThrow(ConsumerLimitViolationError);
  });

  test("error: wallet maxDebit breach throws ConsumerLimitViolationError", () => {
    const verified = effects([], limits());
    const withDiff = brandVerified({
      evidence: verified.evidence,
      verification: {
        ...verified.verification,
        diff: {
          ...emptyDiff,
          wallet: [{ account: OWNER, token: TOKEN, assets: -500n }],
        },
      } as unknown as VerifiedEffects["verification"],
    });
    const limited = brandVerified({
      evidence: withDiff.evidence,
      verification: {
        ...withDiff.verification,
        limits: {
          ...limits(),
          wallet: { maxDebit: [{ token: TOKEN, amount: 100n }], minCredit: [] },
        },
      } as unknown as VerifiedEffects["verification"],
    });
    expect(() => enforceLimits(limited)).toThrow(ConsumerLimitViolationError);
  });
});
