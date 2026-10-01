import type { AccrualVault, MarketId } from "@morpho-org/blue-sdk";
import type { ChainAddresses } from "@morpho-org/morpho-ts";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { SimulationAuthorization } from "../../authorizations.js";
import type { OperationLimit } from "../../limits.js";
import { collectSubjects, planStateReads } from "./read-state.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const COLLATERAL: Address = getAddress(
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
);
const BUNDLE: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);
const MORPHO: Address = getAddress(
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
);
const MARKET_ID =
  "0xb8c25cd0a6f03f8b34c8b9b12e24a2a1b3f0f0f0f0f0f0f0f0f0f0f0f0f0f0f" as MarketId;

const addresses = {
  blue: MORPHO,
  bundles: { blueBundlesV1: BUNDLE },
} as unknown as ChainAddresses;

const marketBinding = {
  marketId: MARKET_ID,
  params: {
    loanToken: TOKEN,
    collateralToken: COLLATERAL,
    oracle: getAddress("0x0000000000000000000000000000000000000001"),
    irm: getAddress("0x0000000000000000000000000000000000000002"),
    lltv: 900000000000000000n,
  },
} as const;

const supplyLimit: OperationLimit = {
  type: "blueSupply",
  marketId: MARKET_ID,
  expectedAssets: 100n,
};

const approval: SimulationAuthorization = {
  type: "erc20Approval",
  token: TOKEN,
  owner: OWNER,
  spender: BUNDLE,
  amount: 100n,
};

describe("collectSubjects + planStateReads", () => {
  test("market limits add the market's loan/collateral tokens", () => {
    const subjects = collectSubjects({
      owner: OWNER,
      operations: [supplyLimit],
      authorizations: [],
      markets: [marketBinding],
      vaults: [],
      preLiquidations: [],
      addresses,
    });
    expect(subjects.tokens.has(TOKEN)).toBe(true);
    expect(subjects.tokens.has(COLLATERAL)).toBe(true);
    expect(subjects.markets.map((m) => m.marketId)).toContain(MARKET_ID);
  });

  test("authorizations contribute allowance/authorization subjects", () => {
    const subjects = collectSubjects({
      owner: OWNER,
      operations: [supplyLimit],
      authorizations: [
        approval,
        {
          type: "blueAuthorization",
          authorizer: OWNER,
          authorized: BUNDLE,
          isAuthorized: true,
        },
      ],
      markets: [marketBinding],
      vaults: [],
      preLiquidations: [],
      addresses,
    });
    expect(subjects.blueAuthorizations).toContainEqual({
      authorizer: OWNER,
      authorized: BUNDLE,
    });
    expect(subjects.spenders).toContainEqual({
      owner: OWNER,
      token: TOKEN,
      spender: BUNDLE,
    });
  });

  test("planStateReads dedupes ids and emits morpho reads for bound markets", () => {
    const subjects = collectSubjects({
      owner: OWNER,
      operations: [supplyLimit],
      authorizations: [approval],
      markets: [marketBinding],
      vaults: [],
      preLiquidations: [],
      addresses,
    });
    const reads = planStateReads({
      subjects,
      owner: OWNER,
      morpho: MORPHO,
      vaultData: new Map(),
    });
    const ids = reads.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(reads.some((r) => r.kind === "erc20.balance")).toBe(true);
    expect(reads.some((r) => r.kind === "erc20.allowance")).toBe(true);
    expect(reads.some((r) => r.kind === "morpho.market")).toBe(true);
    expect(reads.some((r) => r.kind === "morpho.position")).toBe(true);
  });

  test("positions are read for a pinned expectedOnBehalf account", () => {
    const onBehalf = getAddress("0x2222222222222222222222222222222222222222");
    const subjects = collectSubjects({
      owner: OWNER,
      operations: [
        {
          type: "blueSupply",
          marketId: MARKET_ID,
          expectedOnBehalf: onBehalf,
        } satisfies OperationLimit,
      ],
      authorizations: [],
      markets: [marketBinding],
      vaults: [],
      preLiquidations: [],
      addresses,
    });
    const reads = planStateReads({
      subjects,
      owner: OWNER,
      morpho: MORPHO,
      vaultData: new Map(),
    });
    const owners = reads
      .filter((r) => r.kind === "morpho.position")
      .map((r) => ("owner" in r ? r.owner : undefined));
    expect(owners).toContain(onBehalf);
    expect(owners).toContain(OWNER);
  });

  test("Vault V1 queue markets without a limit get market + params reads", () => {
    const VAULT: Address = getAddress(
      "0x4444444444444444444444444444444444444444",
    );
    const QUEUE_MARKET =
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as MarketId;
    const entity = { withdrawQueue: [QUEUE_MARKET] } as unknown as AccrualVault;
    const subjects = collectSubjects({
      owner: OWNER,
      operations: [supplyLimit],
      authorizations: [],
      markets: [marketBinding],
      vaults: [{ address: VAULT, kind: "vaultV1", asset: TOKEN }],
      preLiquidations: [],
      addresses,
    });
    const reads = planStateReads({
      subjects,
      owner: OWNER,
      morpho: MORPHO,
      vaultData: new Map([[VAULT, entity]]),
    });
    const kinds = reads
      .filter((r) => "marketId" in r && r.marketId === QUEUE_MARKET)
      .map((r) => r.kind);
    expect(kinds).toContain("morpho.market");
    expect(kinds).toContain("morpho.marketParams");
    expect(kinds).toContain("morpho.position");
  });
});
