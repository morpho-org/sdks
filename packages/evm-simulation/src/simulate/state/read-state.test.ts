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
  isSimulationPackageError,
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
  test("behavior: refinance reads target debt shares minted and source debt shares burned", () => {
    const sourceMarketId = new MarketParams({
      loanToken: asset,
      collateralToken: vault,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 0n,
    }).id;
    const targetMarketId = new MarketParams({
      loanToken: vault,
      collateralToken: asset,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 0n,
    }).id;
    const plan = planStateReads({
      operations: [
        {
          limit: {
            type: "blueRefinance",
            sourceMarketId,
            targetMarketId,
            quote: { sharesMinted: 1n, sharesBurned: 1n },
            slippageTolerance: 0n,
          },
        },
      ],
      owner,
      morpho: zeroAddress,
    });
    expect(
      plan.reads
        .filter((read) => read.kind === "morpho.position")
        .map((read) => ({ marketId: read.marketId, owner: read.owner })),
    ).toEqual([
      { marketId: targetMarketId, owner },
      { marketId: sourceMarketId, owner },
    ]);
    expect(plan.operations[0]?.measurements).toMatchObject([
      { field: "sharesMinted", shares: "borrowShares" },
      { field: "sharesBurned", shares: "borrowShares" },
    ]);
  });
});

const decodeCtx = { chainId: 1, mode: "final", blockNumber: 1n } as const;

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
        decodeCtx,
      ),
    ).toBe(123n);
  });
  test("error: empty return data means the subject is not a contract", () => {
    const read = planStateReads({
      operations: [{ limit: { ...limit, quote: { sharesMinted: 1n } } }],
      owner,
      morpho: zeroAddress,
    }).reads[0]!;
    const error = (() => {
      try {
        decodeStateRead(read, "0x", decodeCtx);
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(MissingVerificationEvidenceError);
    expect((error as Error).message).toContain(read.id);
    expect(isSimulationPackageError(error)).toBe(true);
    expect(error).toMatchObject({
      context: {
        stage: "verification",
        chainId: 1,
        mode: "final",
        blockNumber: 1n,
        field: read.id,
      },
    });
  });
  test("error: undecodable non-empty return data is an invalid response", () => {
    const read = planStateReads({
      operations: [{ limit: { ...limit, quote: { sharesMinted: 1n } } }],
      owner,
      morpho: zeroAddress,
    }).reads[0]!;
    expect(() => decodeStateRead(read, "0x1234", decodeCtx)).toThrow(
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
        decodeCtx,
      ),
    ).toEqual({ supplyShares: 10n, borrowShares: 20n });
  });
});
