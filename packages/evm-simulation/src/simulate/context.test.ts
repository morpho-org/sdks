import type { MarketId } from "@morpho-org/blue-sdk";
import { getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { OperationLimit, SimulationOperationSubject } from "../limits.js";
import { operationSubject } from "./context.js";

const MARKET = `0x${"11".repeat(32)}` as MarketId;
const SOURCE_MARKET = `0x${"22".repeat(32)}` as MarketId;
const TARGET_MARKET = `0x${"33".repeat(32)}` as MarketId;
const VAULT = getAddress("0x4444444444444444444444444444444444444444");
const ADAPTER = getAddress("0x5555555555555555555555555555555555555555");
const TARGET_VAULT = getAddress("0x6666666666666666666666666666666666666666");

const subjects: {
  readonly name: string;
  readonly limit: OperationLimit;
  readonly expected: SimulationOperationSubject;
}[] = [
  {
    name: "market",
    limit: {
      type: "blueSupply",
      marketId: MARKET,
      quote: { assetsPaid: 1n },
      slippageTolerance: 0n,
    },
    expected: { operation: "blueSupply", marketId: MARKET },
  },
  {
    name: "refinance source and target markets",
    limit: {
      type: "blueRefinance",
      sourceMarketId: SOURCE_MARKET,
      targetMarketId: TARGET_MARKET,
      quote: { sharesMinted: 1n },
      slippageTolerance: 0n,
    },
    expected: {
      operation: "blueRefinance",
      sourceMarketId: SOURCE_MARKET,
      targetMarketId: TARGET_MARKET,
    },
  },
  {
    name: "vault with adapter",
    limit: {
      type: "vaultV2Deposit",
      vault: VAULT,
      adapter: ADAPTER,
      quote: { sharesMinted: 1n },
      slippageTolerance: 0n,
    },
    expected: { operation: "vaultV2Deposit", vault: VAULT, adapter: ADAPTER },
  },
  {
    name: "vault migration source and target",
    limit: {
      type: "vaultV1MigrateToV2",
      sourceVault: VAULT,
      targetVault: TARGET_VAULT,
      quote: { sharesMinted: 1n },
      slippageTolerance: 0n,
    },
    expected: {
      operation: "vaultV1MigrateToV2",
      sourceVault: VAULT,
      targetVault: TARGET_VAULT,
    },
  },
];

describe("operationSubject", () => {
  test.each(subjects)("behavior: $name", ({ limit, expected }) => {
    expect(operationSubject(limit)).toEqual(expected);
  });
});
