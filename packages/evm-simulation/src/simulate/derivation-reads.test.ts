import { type MarketId, MarketParams } from "@morpho-org/blue-sdk";
import { blueAbi, vaultV2Abi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeFunctionData,
  encodeFunctionResult,
  erc4626Abi,
  type Hex,
} from "viem";
import { describe, expect, test } from "vitest";
import { SlippageCheckUnavailableError } from "../errors.js";
import {
  decodeDerivationState,
  planDerivationReads,
} from "./derivation-reads.js";
import { planExecution } from "./plan/plan-execution.js";
import { parseRequest } from "./request/parse-request.js";

const owner: Address = "0x1111111111111111111111111111111111111111";
const vault: Address = "0x2222222222222222222222222222222222222222";
const market = new MarketParams({
  loanToken: owner,
  collateralToken: vault,
  oracle: owner,
  irm: vault,
  lltv: 1n,
});
const request = parseRequest({
  chainId: 1,
  transactions: [{ from: owner, to: vault, data: "0x12345678" }],
  limits: {
    operations: [
      { type: "blueRepay", marketId: market.id as MarketId, inputs: "full" },
    ],
  },
});
if (request.limits === "none") throw new TypeError("Missing limits");
const limit = request.limits.operations[0]!;

describe("hidden derivation calls", () => {
  test.each(["vaultV1Deposit", "vaultV2Deposit"] as const)(
    "%s previews the deposit after deducting referral fees",
    (type) => {
      const parsed = parseRequest({
        chainId: 1,
        transactions: [{ from: owner, to: vault, data: "0x12345678" }],
        limits: {
          operations: [
            {
              type,
              vault,
              inputs: { assets: 101n },
              referralFee: 100_000_000_000_000_000n,
            },
          ],
        },
      });
      if (parsed.limits === "none") throw new TypeError("Missing limits");
      const reads = planDerivationReads(
        parsed.limits.operations.map((operation) => ({ limit: operation })),
        { morpho: owner, owner },
      );
      const preview = reads.find(({ id }) => id === "derive:0:preview")!;
      expect(preview).toMatchObject({
        operationIndex: 0,
        subject: `vault ${vault}`,
      });
      expect(
        decodeFunctionData({ abi: erc4626Abi, data: preview.data }),
      ).toMatchObject({ functionName: "previewDeposit", args: [91n] });
    },
  );
  test("accrues before totals and position reads, then executes only the user transaction", () => {
    const reads = planDerivationReads([{ limit, marketParams: market }], {
      morpho: owner,
      owner,
    });
    expect(reads.map(({ id }) => id)).toEqual([
      "derive:0:accrue",
      "derive:0:market",
      "derive:0:position",
    ]);
    const plan = planExecution({
      request,
      owner,
      preparations: [],
      reads: [],
      derivationReads: reads,
    });
    expect(plan.calls.map(({ type }) => type)).toEqual([
      "stateRead",
      "stateRead",
      "stateRead",
      "transaction",
    ]);
    expect(
      plan.calls
        .filter((call) => call.type === "stateRead")
        .every((call) => call.phase === "before"),
    ).toBe(true);
  });
  test("quote-only operations add no derivation calls", () => {
    expect(
      planDerivationReads(
        [
          {
            limit: {
              type: "blueSupply",
              marketId: market.id,
              quote: { sharesMinted: 1n, assetsPaid: 1n },
              slippageTolerance: 0n,
            },
          },
        ],
        { morpho: owner, owner },
      ),
    ).toEqual([]);
  });
  test("decodes totals, owner debt, preview and V2 accrued conversion state", () => {
    const data = new Map<string, Hex>([
      [
        "derive:0:market",
        encodeFunctionResult({
          abi: blueAbi,
          functionName: "market",
          result: [1n, 2n, 3n, 4n, 5n, 6n],
        }),
      ],
      [
        "derive:0:position",
        encodeFunctionResult({
          abi: blueAbi,
          functionName: "position",
          result: [7n, 8n, 9n],
        }),
      ],
      [
        "derive:0:preview",
        encodeFunctionResult({
          abi: erc4626Abi,
          functionName: "previewDeposit",
          result: 10n,
        }),
      ],
      [
        "derive:0:targetAccrual",
        encodeFunctionResult({
          abi: vaultV2Abi,
          functionName: "accrueInterestView",
          result: [100n, 2n, 3n],
        }),
      ],
      [
        "derive:0:targetSupply",
        encodeFunctionResult({
          abi: erc4626Abi,
          functionName: "totalSupply",
          result: 20n,
        }),
      ],
      [
        "derive:0:targetVirtualShares",
        encodeFunctionResult({
          abi: vaultV2Abi,
          functionName: "virtualShares",
          result: 1n,
        }),
      ],
    ]);
    expect(decodeDerivationState(0, data)).toEqual({
      market: {
        totalSupplyAssets: 1n,
        totalSupplyShares: 2n,
        totalBorrowAssets: 3n,
        totalBorrowShares: 4n,
      },
      borrowShares: 8n,
      preview: 10n,
      targetVault: { totalAssets: 100n, totalSupply: 25n, virtualShares: 1n },
    });
  });
  test("empty optional evidence is absent; malformed evidence fails closed", () => {
    expect(decodeDerivationState(0, new Map())).toEqual({
      market: undefined,
      borrowShares: undefined,
      preview: undefined,
      targetVault: undefined,
    });
    expect(() =>
      decodeDerivationState(0, new Map([["derive:0:market", "0x"]])),
    ).toThrow(SlippageCheckUnavailableError);
    expect(() =>
      planDerivationReads([{ limit }], { morpho: owner, owner }),
    ).toThrow(SlippageCheckUnavailableError);
  });
});
