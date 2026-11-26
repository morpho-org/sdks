import { type MarketId, MathLib } from "@morpho-org/blue-sdk";
import { midnightSupplyCollateralWithNative } from "@morpho-org/morpho-sdk";
import { MarketParams } from "@morpho-org/morpho-sdk/midnight/entities";
import { MarketUtils } from "@morpho-org/morpho-sdk/midnight/utils";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, ethAddress, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { toSimulationLimits } from "../requirements/limits.js";
import type { Transfer } from "../types.js";
import type { CheckContext } from "./context.js";
import type { ParsedOperationLimit } from "./request/parse-request.js";
import { planStateReads, type StateValue } from "./state/read-state.js";
import { findOperationSlippageFailures } from "./verify-slippage.js";

const owner: Address = "0x0000000000000000000000000000000000000001";
const morpho = getChainAddress(1, "blue");
const midnight = getChainAddress(1, "midnight");
const helper = getChainAddress(1, "midnightBundlesV2");
const wrapped = getChainAddress(1, "wNative");
const marketId = `0x${"22".repeat(32)}` as MarketId;
const assets = 100n;
const ctx: CheckContext = {
  chainId: 1,
  mode: "final",
  owner,
  limits: { operations: [] },
  block: {
    chainId: 1,
    stateBlockNumber: 1n,
    stateBlockHash: "0x00",
    stateBlockTimestamp: 1n,
    blockNumber: 2n,
    blockTimestamp: 2n,
  },
};

function routedWrapTransfers(
  nativeAmount: bigint,
  recipient: Address,
): Transfer[] {
  return [
    {
      token: ethAddress,
      from: owner,
      to: helper,
      amount: nativeAmount,
      txIdx: 0,
    },
    {
      token: ethAddress,
      from: helper,
      to: wrapped,
      amount: nativeAmount,
      txIdx: 0,
    },
    {
      token: wrapped,
      from: zeroAddress,
      to: helper,
      amount: nativeAmount,
      txIdx: 0,
    },
    { token: wrapped, from: helper, to: owner, amount: nativeAmount, txIdx: 0 },
    { token: wrapped, from: owner, to: helper, amount: assets, txIdx: 0 },
    { token: wrapped, from: helper, to: recipient, amount: assets, txIdx: 0 },
  ];
}

describe("routed native collateral", () => {
  test.each([40n, 100n])(
    "behavior: Midnight SDK routed wrap accepts exact funding (native=%s)",
    (nativeAmount) => {
      const market = new MarketParams({
        chainId: 1,
        midnight,
        loanToken: getChainAddress(1, "usdc"),
        collateralParams: [
          {
            token: wrapped,
            oracle: "0x0000000000000000000000000000000000080000",
            lltv: MathLib.WAD / 2n,
            liquidationCursor: MathLib.WAD / 2n,
          },
        ],
        maturity: 2_000_000_000n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      });
      const tx = midnightSupplyCollateralWithNative({
        chainId: 1,
        market,
        assets,
        accountAddress: owner,
        nativeAmount,
        deadline: 1000n,
      });
      const limits = toSimulationLimits(tx.action, {
        owner,
        market: MarketUtils.toStruct(market),
        slippageTolerance: 0n,
      });
      const quoted = limits.operations[0];
      expect(quoted).toMatchObject({
        type: "midnightSupplyCollateral",
        quote: { assetsPaid: assets, collateralSupplied: assets },
      });
      if (quoted?.type !== "midnightSupplyCollateral") {
        throw new Error("Expected a Midnight collateral limit");
      }
      const limit: ParsedOperationLimit = { ...quoted, slippageTolerance: 0n };
      const plan = planStateReads({
        owner,
        morpho,
        midnight,
        wNative: wrapped,
        nativeValueSent: true,
        operations: [{ limit, assetsPaid: wrapped }],
      });
      const payment = plan.operations[0]!.measurements.find(
        (measurement) => measurement.field === "assetsPaid",
      );
      expect(payment).toMatchObject({
        type: "native",
        readId: expect.any(String),
      });
      expect(payment).not.toHaveProperty("collateralPayInToken");
      expect(payment).not.toHaveProperty("wrappedDebitOnly");
      const before = new Map<string, StateValue>();
      const after = new Map<string, StateValue>();
      for (const read of plan.reads) {
        before.set(read.id, read.kind === "midnight.collateral" ? 0n : 1000n);
        after.set(
          read.id,
          read.kind === "midnight.collateral"
            ? assets
            : 1000n + nativeAmount - assets,
        );
      }
      const params = {
        ctx,
        operations: plan.operations,
        before,
        after,
        logs: [],
        morpho,
        transfers: routedWrapTransfers(nativeAmount, midnight),
        requestTransactions: [{ from: owner, value: tx.value }],
      };
      expect(findOperationSlippageFailures(params).failures).toEqual([]);
      const tighterLimit = {
        ...limit,
        quote: { ...limit.quote, assetsPaid: assets - 1n },
      };
      expect(
        findOperationSlippageFailures({
          ...params,
          operations: [{ ...plan.operations[0]!, limit: tighterLimit }],
        }).failures,
      ).toContainEqual(
        expect.objectContaining({
          field: "assetsPaid",
          observed: assets,
          bound: assets - 1n,
        }),
      );
    },
  );

  test("behavior: Blue proceeds read keeps routed-wrap payment ETH-only", () => {
    const limit: ParsedOperationLimit = {
      type: "blueSupplyCollateralBorrow",
      marketId,
      assetPaid: ethAddress,
      quote: {
        assetsPaid: assets,
        assetsReceived: assets,
        collateralSupplied: assets,
        sharesMinted: assets,
      },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      owner,
      morpho,
      midnight,
      wNative: wrapped,
      nativeValueSent: true,
      operations: [
        {
          limit,
          assetsPaid: wrapped,
          assetsReceived: wrapped,
          approvalToken: wrapped,
        },
      ],
    });
    const payment = plan.operations[0]!.measurements.find(
      (measurement) => measurement.field === "assetsPaid",
    );
    expect(payment).toMatchObject({
      type: "native",
      collateralPayInToken: ethAddress,
      nativeConversionWrapper: wrapped,
    });
    expect(payment).not.toHaveProperty("readId");
    const before = new Map<string, StateValue>();
    const after = new Map<string, StateValue>();
    for (const read of plan.reads) {
      before.set(
        read.id,
        read.kind === "morpho.position"
          ? { supplyShares: 0n, borrowShares: 0n, collateral: 0n }
          : 1000n,
      );
      after.set(
        read.id,
        read.kind === "morpho.position"
          ? { supplyShares: 0n, borrowShares: assets, collateral: assets }
          : 1000n + assets,
      );
    }
    const params = {
      ctx,
      operations: plan.operations,
      before,
      after,
      logs: [],
      morpho,
      transfers: [
        ...routedWrapTransfers(assets, morpho),
        { token: wrapped, from: morpho, to: owner, amount: assets, txIdx: 0 },
      ],
      requestTransactions: [{ from: owner, value: assets }],
    };
    expect(findOperationSlippageFailures(params).failures).toEqual([]);
    const tighterLimit = {
      ...limit,
      quote: { ...limit.quote, assetsReceived: assets + 1n },
    };
    expect(
      findOperationSlippageFailures({
        ...params,
        operations: [{ ...plan.operations[0]!, limit: tighterLimit }],
      }).failures,
    ).toContainEqual(
      expect.objectContaining({
        field: "assetsReceived",
        observed: assets,
        bound: assets + 1n,
      }),
    );
  });

  test("error: Blue combined payment rejects a helper returning wrapped ETH to the owner", () => {
    const limit: ParsedOperationLimit = {
      type: "blueSupplyCollateral",
      marketId,
      assetPaid: ethAddress,
      quote: { assetsPaid: assets, collateralSupplied: assets },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      owner,
      morpho,
      midnight,
      wNative: wrapped,
      nativeValueSent: true,
      operations: [{ limit, assetsPaid: wrapped, approvalToken: wrapped }],
    });
    expect(
      plan.operations[0]!.measurements.find(
        (measurement) => measurement.field === "assetsPaid",
      ),
    ).toMatchObject({
      type: "native",
      readId: expect.any(String),
      collateralPayInToken: wrapped,
    });
    const before = new Map<string, StateValue>();
    const after = new Map<string, StateValue>();
    for (const read of plan.reads) {
      before.set(
        read.id,
        read.kind === "morpho.position"
          ? { supplyShares: 0n, borrowShares: 0n, collateral: 0n }
          : 1000n,
      );
      after.set(
        read.id,
        read.kind === "morpho.position"
          ? { supplyShares: 0n, borrowShares: 0n, collateral: assets }
          : 1000n,
      );
    }
    expect(
      findOperationSlippageFailures({
        ctx,
        operations: plan.operations,
        before,
        after,
        logs: [],
        morpho,
        transfers: routedWrapTransfers(assets, morpho),
        requestTransactions: [{ from: owner, value: assets }],
      }).failures,
    ).toContainEqual(
      expect.objectContaining({
        field: "assetsPaid",
        observed: 2n * assets,
        bound: assets,
      }),
    );
  });
});
