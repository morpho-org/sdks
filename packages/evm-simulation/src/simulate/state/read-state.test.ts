import type { MarketId } from "@morpho-org/blue-sdk";
import type { ChainAddresses } from "@morpho-org/morpho-ts";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { PendingAuthorization } from "../../authorizations.js";
import type { DecodedOperation } from "../../decode/operation.js";
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

const supplyOp: DecodedOperation = {
  type: "blueSupply",
  route: "blueBundlesV1",
  transactionIndex: 0,
  market: {
    marketId: MARKET_ID,
    params: {
      loanToken: TOKEN,
      collateralToken: COLLATERAL,
      oracle: getAddress("0x0000000000000000000000000000000000000001"),
      irm: getAddress("0x0000000000000000000000000000000000000002"),
      lltv: 900000000000000000n,
    },
  },
  assets: 100n,
  onBehalf: OWNER,
  receiver: OWNER,
  funding: { type: "erc20", token: TOKEN, assets: 100n },
  referralFee: { rateWad: 0n, recipient: OWNER },
  tokenSignature: { type: "none" },
  authorizationSignature: { type: "none" },
} as unknown as DecodedOperation;

const approval: PendingAuthorization = {
  type: "erc20Approval",
  token: TOKEN,
  owner: OWNER,
  spender: BUNDLE,
  amount: 100n,
};

describe("collectSubjects + planStateReads", () => {
  test("funding ops add token, allowance subject and bundle account", () => {
    const subjects = collectSubjects({
      owner: OWNER,
      operations: [supplyOp],
      authorizations: [],
      vaults: [],
      preLiquidations: [],
      addresses,
    });
    expect(subjects.tokens.has(TOKEN)).toBe(true);
    expect(subjects.spenders).toContainEqual({
      owner: OWNER,
      token: TOKEN,
      spender: BUNDLE,
    });
    expect(subjects.markets.map((m) => m.marketId)).toContain(MARKET_ID);
  });

  test("authorizations contribute allowance/authorization subjects", () => {
    const subjects = collectSubjects({
      owner: OWNER,
      operations: [supplyOp],
      authorizations: [
        approval,
        {
          type: "blueAuthorization",
          authorizer: OWNER,
          authorized: BUNDLE,
          isAuthorized: true,
        },
      ],
      vaults: [],
      preLiquidations: [],
      addresses,
    });
    expect(subjects.blueAuthorizations).toContainEqual({
      authorizer: OWNER,
      authorized: BUNDLE,
    });
  });

  test("planStateReads dedupes ids and emits morpho reads for touched markets", () => {
    const subjects = collectSubjects({
      owner: OWNER,
      operations: [supplyOp],
      authorizations: [approval],
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
});
