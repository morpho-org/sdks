import { MarketParams } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  ethAddress,
  zeroAddress,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
} from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import { decodeStateRead, planStateReads } from "./read-state.js";

const owner = "0x0000000000000000000000000000000000000001";
const receiver = "0x0000000000000000000000000000000000000002";
const vault = "0x0000000000000000000000000000000000000003";
const asset = "0x0000000000000000000000000000000000000004";
const marketId = new MarketParams({
  loanToken: asset,
  collateralToken: vault,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
}).id;
const limit: OperationLimit = {
  type: "vaultV2Deposit",
  vault,
  account: receiver,
  quote: { assetsPaid: 100n, sharesMinted: 90n },
  slippageTolerance: 0n,
};

describe("planStateReads", () => {
  test("default: no limits produce no reads", () => {
    expect(
      planStateReads({ operations: [], owner, morpho: zeroAddress }),
    ).toEqual({ reads: [], operations: [] });
  });
  test("behavior: deposit reads only payer assets and recipient shares", () => {
    const plan = planStateReads({
      operations: [{ limit, assetsPaid: asset }],
      owner,
      morpho: zeroAddress,
    });
    expect(plan.reads).toHaveLength(2);
    expect(
      plan.reads.map((r) => [
        r.to,
        decodeFunctionData({ abi: erc20Abi, data: r.data }).args,
      ]),
    ).toEqual([
      [asset, [owner]],
      [vault, [receiver]],
    ]);
  });
  test("behavior: unquoted assets are not read and duplicate subjects share calls", () => {
    const sharesOnly = {
      ...limit,
      quote: { sharesMinted: 90n, sharesBurned: 0n },
    };
    const plan = planStateReads({
      operations: [{ limit: sharesOnly }, { limit: sharesOnly }],
      owner,
      morpho: zeroAddress,
    });
    expect(plan.reads).toHaveLength(1);
    expect(plan.operations).toHaveLength(2);
    expect(plan.operations[0]?.measurements).toHaveLength(2);
  });
  test("behavior: native quotes use traces without reads", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: { ...limit, receiver, quote: { assetsReceived: 100n } },
          assetsReceived: ethAddress,
        },
      ],
      owner,
      morpho: zeroAddress,
    });
    expect(plan.reads).toEqual([]);
    expect(plan.operations[0]?.measurements).toEqual([
      { field: "assetsReceived", type: "native", account: receiver },
    ]);
  });
  test.each(["blueSupply", "blueBorrow", "blueRepay"] as const)(
    "behavior: %s uses only position shares",
    (type) => {
      const plan = planStateReads({
        operations: [
          {
            limit: {
              type,
              marketId,
              account: receiver,
              quote: { sharesMinted: 1n, sharesBurned: 1n },
              slippageTolerance: 0n,
            },
          },
        ],
        owner,
        morpho: zeroAddress,
      });
      expect(plan.reads).toHaveLength(1);
      expect(
        decodeFunctionData({ abi: blueAbi, data: plan.reads[0]!.data }),
      ).toMatchObject({ functionName: "position", args: [marketId, receiver] });
      expect(plan.operations[0]?.measurements[0]).toMatchObject({
        shares: type === "blueSupply" ? "supplyShares" : "borrowShares",
      });
    },
  );
  test("behavior: migration chooses source burn and target mint balances", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: {
            type: "vaultV1MigrateToV2",
            sourceVault: vault,
            targetVault: asset,
            quote: { sharesMinted: 1n, sharesBurned: 1n },
            slippageTolerance: 0n,
          },
        },
      ],
      owner,
      morpho: zeroAddress,
    });
    expect(plan.reads.map((r) => r.to)).toEqual([asset, vault]);
  });
  test("error: MissingVerificationEvidenceError for collateral-only share quote", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: {
              type: "blueSupplyCollateral",
              marketId,
              quote: { sharesMinted: 1n },
              slippageTolerance: 0n,
            },
          },
        ],
        owner,
        morpho: zeroAddress,
      }),
    ).toThrow(MissingVerificationEvidenceError);
  });
});

describe("decodeStateRead", () => {
  test("default: balance", () => {
    const read = planStateReads({
      operations: [{ limit: { ...limit, quote: { sharesMinted: 1n } } }],
      owner,
      morpho: zeroAddress,
    }).reads[0]!;
    expect(
      decodeStateRead(
        read,
        encodeFunctionResult({
          abi: erc20Abi,
          functionName: "balanceOf",
          result: 123n,
        }),
      ),
    ).toBe(123n);
    expect(() => decodeStateRead(read, "0x")).toThrow(
      InvalidSimulationResponseError,
    );
  });
  test("behavior: position decodes shares without market or oracle data", () => {
    const read = planStateReads({
      operations: [
        {
          limit: {
            type: "blueSupply",
            marketId,
            quote: { sharesMinted: 1n },
            slippageTolerance: 0n,
          },
        },
      ],
      owner,
      morpho: zeroAddress,
    }).reads[0]!;
    expect(
      decodeStateRead(
        read,
        encodeFunctionResult({
          abi: blueAbi,
          functionName: "position",
          result: [10n, 20n, 30n],
        }),
      ),
    ).toEqual({ supplyShares: 10n, borrowShares: 20n });
  });
});
