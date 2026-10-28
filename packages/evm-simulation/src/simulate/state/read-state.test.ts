import { MarketParams } from "@morpho-org/blue-sdk";
import { blueAbi, midnightAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  ethAddress,
  type Hex,
  zeroAddress,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  InvalidSimulationResponseError,
  isSimulationPackageError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import type { ParsedOperationLimit } from "../request/parse-request.js";
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
const limit: ParsedOperationLimit = {
  type: "vaultV2Deposit",
  vault,
  account: receiver,
  quote: { assetsPaid: 100n, sharesMinted: 90n },
  slippageTolerance: 0n,
};
const typedDepositLimit: ParsedOperationLimit = {
  type: "vaultV2Deposit",
  vault,
  inputs: { assets: 100n },
  quote: { assetsPaid: 100n, sharesMinted: 90n },
  slippageTolerance: 0n,
};
const nativeValueCoverageErrorMessage =
  "Native value sent by the request is not covered by any measured native side. Remove the transaction value, or declare the native or wNative asset on the operation it funds.";

describe("planStateReads", () => {
  test.each([owner, receiver] as const)(
    "implicit native funding only applies to an owner-held payout (%s)",
    (payoutReceiver) => {
      const plan = () =>
        planStateReads({
          owner,
          morpho: zeroAddress,
          midnight: zeroAddress,
          wNative: asset,
          nativeValueSent: true,
          operations: [
            {
              limit: {
                type: "blueBorrow",
                marketId,
                receiver: payoutReceiver,
                inputs: { assets: 10n },
                quote: { assetsReceived: 10n },
                slippageTolerance: 0n,
              },
              assetsReceived: asset,
            },
          ],
        });
      if (payoutReceiver === owner)
        expect(plan().operations[0]!.measurements[0]!.type).toBe("native");
      else {
        expect(plan).toThrow(SlippageCheckUnavailableError);
        expect(plan).toThrow(nativeValueCoverageErrorMessage);
      }
    },
  );
  test("typed non-native inputs fail closed when native value is unmeasured", () => {
    const plan = () =>
      planStateReads({
        owner,
        morpho: zeroAddress,
        midnight: zeroAddress,
        nativeValueSent: true,
        operations: [{ limit: typedDepositLimit, assetsPaid: asset }],
      });
    expect(plan).toThrow(SlippageCheckUnavailableError);
    expect(plan).toThrow(nativeValueCoverageErrorMessage);
  });
  test("typed non-native inputs allow requests without native value", () => {
    expect(() =>
      planStateReads({
        owner,
        morpho: zeroAddress,
        midnight: zeroAddress,
        nativeValueSent: false,
        operations: [{ limit: typedDepositLimit, assetsPaid: asset }],
      }),
    ).not.toThrow();
  });
  test("typed wNative inputs cover native value", () => {
    const plan = planStateReads({
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
      wNative: asset,
      nativeValueSent: true,
      operations: [
        {
          limit: {
            type: "blueSupply",
            marketId,
            inputs: { assets: 100n },
            quote: { assetsPaid: 100n },
            slippageTolerance: 0n,
          },
          assetsPaid: asset,
        },
      ],
    });
    expect(plan.operations[0]?.measurements[0]).toMatchObject({
      field: "assetsPaid",
      type: "native",
      account: owner,
    });
  });
  test("quote-only operations remain unchanged when native value is sent", () => {
    expect(() =>
      planStateReads({
        owner,
        morpho: zeroAddress,
        midnight: zeroAddress,
        nativeValueSent: true,
        operations: [{ limit, assetsPaid: asset }],
      }),
    ).not.toThrow();
  });
  test("native measurement on another operation covers typed non-native value", () => {
    const plan = planStateReads({
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
      nativeValueSent: true,
      operations: [
        { limit: typedDepositLimit, assetsPaid: asset },
        {
          limit: {
            type: "blueBorrow",
            marketId,
            assetReceived: ethAddress,
            quote: { assetsReceived: 10n },
            slippageTolerance: 0n,
          },
          assetsReceived: ethAddress,
        },
      ],
    });
    expect(plan.operations[1]?.measurements[0]).toMatchObject({
      field: "assetsReceived",
      type: "native",
      account: owner,
    });
  });
  test("typed owner wNative measurements include native funding without an alias", () => {
    for (const input of [false, true]) {
      for (const nativeValueSent of [false, true]) {
        const base = {
          type: "blueSupply" as const,
          marketId,
          quote: { assetsPaid: 10n },
          slippageTolerance: 0n,
        };
        const operation: ParsedOperationLimit = input
          ? { ...base, inputs: { assets: 10n } }
          : base;
        const plan = planStateReads({
          owner,
          morpho: zeroAddress,
          midnight: zeroAddress,
          wNative: asset,
          nativeValueSent,
          operations: [{ limit: operation, assetsPaid: asset }],
        });
        expect(plan.operations[0]!.measurements[0]!.type).toBe(
          input && nativeValueSent ? "native" : "balance",
        );
      }
    }
  });
  test.each(["assetsPaid", "assetsReceived"] as const)(
    "%s native alias stays field-local unless both sides share one net wallet",
    (nativeField) => {
      for (const payoutReceiver of [owner, receiver] as const) {
        const plan = planStateReads({
          owner,
          morpho: zeroAddress,
          midnight: zeroAddress,
          wNative: asset,
          operations: [
            {
              limit: {
                type: "blueSupplyCollateralBorrow",
                marketId,
                receiver: payoutReceiver,
                inputs: { collateralAssets: 100n, borrowAssets: 50n },
                ...(nativeField === "assetsPaid"
                  ? { assetPaid: ethAddress }
                  : { assetReceived: ethAddress }),
                quote: { assetsPaid: 100n, assetsReceived: 50n },
                slippageTolerance: 0n,
              },
              assetsPaid: asset,
              assetsReceived: asset,
            },
          ],
        });
        for (const field of ["assetsPaid", "assetsReceived"] as const) {
          const measurement = plan.operations[0]!.measurements.find(
            (entry) => entry.field === field,
          )!;
          expect(measurement.type).toBe(
            payoutReceiver === owner || field === nativeField
              ? "native"
              : "balance",
          );
        }
      }
    },
  );
  test.each([
    "blueSupplyCollateralBorrow",
    "blueRepayWithdrawCollateral",
  ] as const)(
    "same-token %s nets the sender wallet independently of the position account",
    (type) => {
      for (const payoutReceiver of [undefined, owner, receiver] as const) {
        const plan = planStateReads({
          owner,
          midnight: zeroAddress,
          morpho: zeroAddress,
          operations: [
            {
              limit: {
                type,
                marketId,
                account: receiver,
                receiver: payoutReceiver,
                quote: {
                  assetsPaid: 100n,
                  assetsReceived: 50n,
                  sharesMinted: 1n,
                },
                slippageTolerance: 0n,
              },
              assetsPaid: asset,
              assetsReceived: asset,
            },
          ],
        });
        expect(plan.operations[0]!.netWalletAssets).toBe(
          payoutReceiver !== receiver,
        );
        expect(
          plan.reads.find((read) => read.kind === "morpho.position"),
        ).toMatchObject({ owner: receiver });
        expect(
          plan.operations[0]!.measurements.find(
            (measurement) => measurement.field === "assetsPaid",
          ),
        ).toMatchObject({ readId: `balance:${asset}:${owner}` });
      }
      const differentTokens = planStateReads({
        owner,
        midnight: zeroAddress,
        morpho: zeroAddress,
        operations: [
          {
            limit: {
              type,
              marketId,
              account: receiver,
              quote: {},
              slippageTolerance: 0n,
            },
            assetsPaid: asset,
            assetsReceived: vault,
          },
        ],
      });
      expect(differentTokens.operations[0]!.netWalletAssets).toBe(false);
    },
  );
  test.each([
    [true, true],
    [true, false],
    [false, true],
  ])(
    "rejects shared input wallet measurements (inputs: %s, %s)",
    (firstInput, secondInput) => {
      for (const token of [asset, ethAddress] as const) {
        const operations = [firstInput, secondInput].map((input) => ({
          limit: input
            ? {
                ...limit,
                type: "vaultV2Deposit" as const,
                inputs: { assets: 100n },
              }
            : limit,
          assetsPaid: token,
        }));
        expect(() =>
          planStateReads({
            operations,
            owner,
            midnight: zeroAddress,
            morpho: zeroAddress,
          }),
        ).toThrow(SimulationValidationError);
        expect(() =>
          planStateReads({
            operations,
            owner,
            midnight: zeroAddress,
            morpho: zeroAddress,
          }),
        ).toThrow("Split the bundle or use quote-only limits");
        try {
          planStateReads({
            operations,
            owner,
            midnight: zeroAddress,
            morpho: zeroAddress,
          });
        } catch (error) {
          expect(error).toMatchObject({
            fieldErrors: [expect.stringContaining("limits.operations[1]")],
          });
        }
      }
    },
  );
  test("distinct input wallets and quote-only overlaps retain independent planning", () => {
    const input = {
      ...limit,
      type: "vaultV2Deposit" as const,
      inputs: { assets: 100n },
      quote: { assetsReceived: 100n },
    };
    expect(() =>
      planStateReads({
        owner,
        midnight: zeroAddress,
        morpho: zeroAddress,
        operations: [
          { limit: input, assetsReceived: asset },
          { limit: { ...input, receiver }, assetsReceived: asset },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      planStateReads({
        owner,
        midnight: zeroAddress,
        morpho: zeroAddress,
        operations: [
          { limit: input, assetsReceived: asset },
          { limit: input, assetsReceived: vault },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      planStateReads({
        owner,
        midnight: zeroAddress,
        morpho: zeroAddress,
        operations: [
          { limit, assetsPaid: asset },
          { limit, assetsPaid: asset },
        ],
      }),
    ).not.toThrow();
  });
  test("behavior: Midnight Blue parking plans only the sender's loan-token balance", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: {
            type: "midnightSupplyBlueMakeLend",
            loanToken: asset,
            marketId,
            callbackSalt: marketId,
            quote: { assetsPaid: 1n, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
          assetsPaid: asset,
          blueBuyCallback: receiver,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    expect(plan.reads).toHaveLength(2);
    expect(plan.reads[0]).toMatchObject({
      kind: "erc20.balance",
      token: asset,
      account: owner,
    });
    expect(plan.reads[1]).toMatchObject({
      kind: "morpho.position",
      owner: receiver,
      marketId,
    });
  });
  test("error: missing callback address makes the position unreadable", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: {
              type: "midnightSupplyBlueMakeLend",
              loanToken: asset,
              marketId,
              callbackSalt: marketId,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
            assetsPaid: asset,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight: zeroAddress,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
  test("default: no limits produce no reads", () => {
    expect(
      planStateReads({
        operations: [],
        owner,
        morpho: zeroAddress,
        midnight: zeroAddress,
      }),
    ).toEqual({ reads: [], operations: [] });
  });
  test("behavior: deposit reads only payer assets and recipient shares", () => {
    const plan = planStateReads({
      operations: [{ limit, assetsPaid: asset }],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
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
      midnight: zeroAddress,
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
      midnight: zeroAddress,
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
        midnight: zeroAddress,
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
      midnight: zeroAddress,
    });
    expect(plan.reads.map((r) => r.to)).toEqual([asset, vault]);
  });
  test.each(["vaultV1InKindRedeem", "vaultV2InKindRedeem"] as const)(
    "behavior: %s reads receiver supply shares only for quoted markets",
    (type) => {
      const otherMarketId = new MarketParams({
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
              type,
              vault,
              receiver,
              quote: {
                positions: [
                  { marketId, supplyShares: 1n },
                  { marketId: otherMarketId, supplyShares: 2n },
                ],
              },
              slippageTolerance: 0n,
            },
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight: zeroAddress,
      });
      expect(plan.reads).toHaveLength(2);
      expect(
        plan.reads
          .filter((read) => read.kind === "morpho.position")
          .map((read) => ({
            marketId: read.marketId,
            owner: read.owner,
          })),
      ).toEqual([
        { marketId, owner: receiver },
        { marketId: otherMarketId, owner: receiver },
      ]);
      expect(plan.operations[0]?.measurements).toMatchObject([
        { field: "positions", marketId, shares: "supplyShares" },
        { field: "positions", marketId: otherMarketId, shares: "supplyShares" },
      ]);
    },
  );
  test("behavior: in-kind position reads default to the sender and dedupe with share reads", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: {
            type: "vaultV2InKindRedeem",
            vault,
            quote: {
              sharesBurned: 1n,
              positions: [{ marketId, supplyShares: 1n }],
            },
            slippageTolerance: 0n,
          },
        },
        {
          limit: {
            type: "blueWithdraw",
            marketId,
            quote: { sharesBurned: 1n },
            slippageTolerance: 0n,
          },
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    const positionReads = plan.reads.filter(
      (read) => read.kind === "morpho.position",
    );
    // One read serves both the in-kind delivery and the blue withdraw on the
    // same market/owner; the vault share burn adds a balance read.
    expect(positionReads).toHaveLength(1);
    expect(positionReads[0]?.owner).toBe(owner);
  });
  test("behavior: position bounds plan one after-state read, deduped with share reads", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: {
            type: "blueSupplyCollateralBorrow",
            marketId,
            quote: { sharesMinted: 1n },
            slippageTolerance: 0n,
            position: { maxBorrowShares: 1n, minCollateral: 1n },
          },
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    const positionReads = plan.reads.filter(
      (read) => read.kind === "morpho.position",
    );
    // The borrow-share delta and the absolute bounds share one position read.
    expect(positionReads).toHaveLength(1);
    expect(positionReads[0]?.owner).toBe(owner);
    expect(plan.operations[0]?.positionBoundsReadId).toBe(positionReads[0]?.id);
  });
  test("behavior: position bounds read the limit account instead of the owner or receiver", () => {
    const account = "0x0000000000000000000000000000000000000005";
    const morpho = "0x0000000000000000000000000000000000000006";
    const blueLimit: ParsedOperationLimit = {
      type: "blueSupply",
      marketId,
      account,
      receiver,
      quote: { sharesMinted: 1n },
      slippageTolerance: 0n,
      position: { minSupplyShares: 1n },
    };
    const plan = planStateReads({
      operations: [{ limit: blueLimit }],
      owner,
      morpho,
      midnight: zeroAddress,
    });
    const boundsRead = plan.reads.find(
      (read) => read.id === plan.operations[0]?.positionBoundsReadId,
    );
    expect(boundsRead).toMatchObject({
      kind: "morpho.position",
      owner: blueLimit.account,
      to: morpho,
    });
  });
  test("behavior: blueRefinance position bounds read the target market", () => {
    const sourceMarketId = new MarketParams({
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
            targetMarketId: marketId,
            quote: { sharesMinted: 1n },
            slippageTolerance: 0n,
            position: { maxBorrowShares: 1n },
          },
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    expect(sourceMarketId).not.toBe(marketId);
    const boundsRead = plan.reads.find(
      (read) => read.id === plan.operations[0]?.positionBoundsReadId,
    );
    expect(boundsRead?.kind).toBe("morpho.position");
    if (boundsRead?.kind === "morpho.position") {
      expect(boundsRead.marketId).toBe(marketId);
      expect(boundsRead.marketId).not.toBe(sourceMarketId);
    }
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
      midnight: zeroAddress,
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
  test("behavior: collateral quotes plan a position read on the collateral field", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: {
            type: "blueSupplyCollateral",
            marketId,
            account: receiver,
            quote: { collateralSupplied: 1n },
            slippageTolerance: 0n,
          },
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    expect(plan.reads).toHaveLength(1);
    expect(
      decodeFunctionData({ abi: blueAbi, data: plan.reads[0]!.data }),
    ).toMatchObject({ functionName: "position", args: [marketId, receiver] });
    expect(plan.operations[0]?.measurements).toEqual([
      {
        field: "collateralSupplied",
        type: "position",
        readId: plan.reads[0]!.id,
        marketId,
        shares: "collateral",
      },
    ]);
  });
});

describe("decodeStateRead", () => {
  test("rejects derivation reads rather than decoding them as positions", () => {
    expect(() =>
      decodeStateRead(
        {
          id: "derive:0:market",
          kind: "derivation",
          to: zeroAddress,
          data: "0x",
        },
        "0x",
      ),
    ).toThrow(InvalidSimulationResponseError);
  });
  test("default: balance", () => {
    const read = planStateReads({
      operations: [{ limit: { ...limit, quote: { sharesMinted: 1n } } }],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
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
  });
  test("error: empty return data means the subject is not a contract", () => {
    const read = planStateReads({
      operations: [{ limit: { ...limit, quote: { sharesMinted: 1n } } }],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    }).reads[0]!;
    const error = (() => {
      try {
        decodeStateRead(read, "0x");
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect((error as Error).message).toContain(read.id);
    expect(isSimulationPackageError(error)).toBe(true);
    expect(error).not.toHaveProperty("context");
  });
  test("error: undecodable non-empty return data is an invalid response", () => {
    const read = planStateReads({
      operations: [{ limit: { ...limit, quote: { sharesMinted: 1n } } }],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    }).reads[0]!;
    expect(() => decodeStateRead(read, "0x1234")).toThrow(
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
      midnight: zeroAddress,
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
    ).toEqual({ supplyShares: 10n, borrowShares: 20n, collateral: 30n });
  });
});

describe("planStateReads — Midnight collateral", () => {
  const midnight: Address = "0x0000000000000000000000000000000000000005";
  const midnightLimit: ParsedOperationLimit = {
    type: "midnightSupplyCollateral",
    marketId,
    collateralIndex: 1n,
    account: receiver,
    quote: { assetsPaid: 10n, collateralSupplied: 10n },
    slippageTolerance: 0n,
  };
  test("behavior: reads sender spending and the onBehalf collateral slot, deduplicated", () => {
    const operation = {
      limit: midnightLimit,
      assetsPaid: asset,
    } as const;
    const plan = planStateReads({
      operations: [operation, operation],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    expect(plan.reads).toHaveLength(2);
    const [balance, collateral] = plan.reads;
    expect(balance).toMatchObject({
      kind: "erc20.balance",
      token: asset,
      account: owner,
    });
    expect(collateral).toMatchObject({
      kind: "midnight.collateral",
      to: midnight,
      marketId,
      collateralIndex: 1n,
      owner: receiver,
    });
    expect(
      decodeFunctionData({ abi: midnightAbi, data: collateral!.data }),
    ).toEqual({
      functionName: "collateral",
      args: [marketId, receiver, 1n],
    });
    expect(plan.operations[1]?.measurements).toEqual(
      plan.operations[0]?.measurements,
    );
  });
  test("behavior: reads each collateral index separately on the same market", () => {
    const plan = planStateReads({
      operations: [
        { limit: { ...midnightLimit, collateralIndex: 0n }, assetsPaid: asset },
        { limit: midnightLimit, assetsPaid: asset },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const collaterals = plan.reads.filter(
      (read) => read.kind === "midnight.collateral",
    );
    expect(collaterals).toHaveLength(2);
    expect(
      collaterals.map(
        (read) =>
          decodeFunctionData({ abi: midnightAbi, data: read.data }).args,
      ),
    ).toEqual([
      [marketId, receiver, 0n],
      [marketId, receiver, 1n],
    ]);
  });
  test("behavior: decodes the Midnight collateral amount", () => {
    const read = planStateReads({
      operations: [
        {
          limit: midnightLimit,
          assetsPaid: asset,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    }).reads[1]!;
    expect(
      decodeStateRead(
        read,
        encodeFunctionResult({
          abi: midnightAbi,
          functionName: "collateral",
          result: 77n,
        }),
      ),
    ).toBe(77n);
  });
});

describe("planStateReads — Midnight redeem", () => {
  const midnight = "0x0000000000000000000000000000000000000005";
  const token = asset;
  const midnightMarket = {
    chainId: 8453n,
    midnight,
    loanToken: token,
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000000009",
        lltv: 0n,
        liquidationCursor: 0n,
        oracle: zeroAddress,
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  } as const;
  const redeemLimit: ParsedOperationLimit = {
    type: "midnightRedeem",
    marketId,
    account: receiver,
    receiver: owner,
    quote: { assetsReceived: 10n, creditRedeemed: 10n },
    position: { maxCredit: 0n },
    slippageTolerance: 0n,
  };
  test("behavior: reads onBehalf accrued credit once and the receiver's loan balance", () => {
    const plan = planStateReads({
      operations: [
        { limit: redeemLimit, assetsReceived: asset, midnightMarket },
        { limit: redeemLimit, assetsReceived: asset, midnightMarket },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    expect(plan.reads).toHaveLength(2);
    const [credit, balance] = plan.reads;
    expect(credit).toMatchObject({
      kind: "midnight.credit",
      to: midnight,
      marketId,
      owner: receiver,
    });
    expect(
      decodeFunctionData({ abi: midnightAbi, data: credit!.data }),
    ).toEqual({
      functionName: "updatePositionView",
      args: [midnightMarket, marketId, receiver],
    });
    expect(balance).toMatchObject({
      kind: "erc20.balance",
      token: asset,
      account: owner,
    });
    // The final-credit bound reuses the credit read.
    expect(plan.operations[0]?.positionBoundsReadId).toBe(credit!.id);
  });
  test("error: a redeem without a resolved Midnight market fails closed", () => {
    expect(() =>
      planStateReads({
        operations: [{ limit: redeemLimit, assetsReceived: asset }],
        owner,
        morpho: zeroAddress,
        midnight,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
  test("behavior: decodes the accrued credit from updatePositionView", () => {
    const read = planStateReads({
      operations: [
        { limit: redeemLimit, assetsReceived: asset, midnightMarket },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    }).reads[0]!;
    expect(
      decodeStateRead(
        read,
        encodeFunctionResult({
          abi: midnightAbi,
          functionName: "updatePositionView",
          result: [1_234_567n, 89n, 3n],
        }),
      ),
    ).toBe(1_234_567n);
  });
});

describe("planStateReads — Midnight sells", () => {
  const midnight = "0x0000000000000000000000000000000000000005";
  const midnightMarket = {
    chainId: 8453n,
    midnight,
    loanToken: asset,
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000000009",
        lltv: 0n,
        liquidationCursor: 0n,
        oracle: zeroAddress,
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  } as const;
  const sellLimit: ParsedOperationLimit = {
    type: "midnightTakeBorrow",
    marketId,
    receiver: owner,
    quote: { unitsSold: 10n, assetsReceived: 10n },
    slippageTolerance: 0n,
  };
  const buyLimit: ParsedOperationLimit = {
    type: "midnightTakeLend",
    marketId,
    quote: { assetsPaid: 10n, unitsBought: 10n },
    slippageTolerance: 0n,
  };
  const sellWithdrawLimit: ParsedOperationLimit = {
    type: "midnightTakeWithdraw",
    marketId,
    receiver: owner,
    quote: { creditRedeemed: 10n, assetsReceived: 10n },
    slippageTolerance: 0n,
  };

  test("behavior: reads both sides of the account net position for buys", () => {
    const plan = planStateReads({
      operations: [{ limit: buyLimit, assetsPaid: asset, midnightMarket }],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    expect(plan.reads.map((read) => read.kind).sort()).toEqual([
      "erc20.balance",
      "midnight.credit",
      "midnight.debt",
    ]);
    const credit = plan.reads.find((read) => read.kind === "midnight.credit");
    const debt = plan.reads.find((read) => read.kind === "midnight.debt");
    expect(credit?.owner).toBe(owner);
    expect(debt?.owner).toBe(owner);
    expect(plan.operations[0]?.measurements).toContainEqual({
      field: "unitsBought",
      type: "midnightNet",
      creditReadId: credit!.id,
      debtReadId: debt!.id,
    });
  });
  test("behavior: deduplicates accrued credit and debt reads for the sender", () => {
    const redeemLimit: ParsedOperationLimit = {
      type: "midnightRedeem",
      marketId,
      account: owner,
      receiver: owner,
      quote: { creditRedeemed: 10n, assetsReceived: 10n },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [
        { limit: sellLimit, assetsReceived: asset, midnightMarket },
        { limit: buyLimit, assetsPaid: asset, midnightMarket },
        { limit: sellLimit, assetsReceived: asset, midnightMarket },
        {
          limit: redeemLimit,
          assetsReceived: asset,
          midnightMarket,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const credit = plan.reads.find((read) => read.kind === "midnight.credit");
    const debt = plan.reads.find((read) => read.kind === "midnight.debt");
    expect(credit?.id).toBe(
      `midnight-credit:${marketId}:${owner}`.toLowerCase(),
    );
    expect(debt).toMatchObject({
      id: `midnight-debt:${marketId}:${owner}`.toLowerCase(),
      kind: "midnight.debt",
      owner,
      to: midnight,
    });
    expect(decodeFunctionData({ abi: midnightAbi, data: debt!.data })).toEqual({
      functionName: "debt",
      args: [marketId, owner],
    });
    expect(
      plan.reads.filter((read) => read.kind === "midnight.credit"),
    ).toHaveLength(1);
    expect(
      plan.reads.filter((read) => read.kind === "midnight.debt"),
    ).toHaveLength(1);
  });

  test("behavior: decodes debt as a bigint", () => {
    const debt = planStateReads({
      operations: [{ limit: sellLimit, assetsReceived: asset, midnightMarket }],
      owner,
      morpho: zeroAddress,
      midnight,
    }).reads.find((read) => read.kind === "midnight.debt")!;
    expect(
      decodeStateRead(
        debt,
        encodeFunctionResult({
          abi: midnightAbi,
          functionName: "debt",
          result: 89n,
        }),
      ),
    ).toBe(89n);
  });

  test("error: missing Midnight market fails closed", () => {
    expect(() =>
      planStateReads({
        operations: [{ limit: sellLimit, assetsReceived: asset }],
        owner,
        morpho: zeroAddress,
        midnight,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test.each([
    { type: "midnightTakeBorrow", limit: sellLimit, account: receiver },
    { type: "midnightTakeBorrow", limit: sellLimit, account: owner },
    { type: "midnightTakeBorrow", limit: sellLimit, account: undefined },
    {
      type: "midnightTakeWithdraw",
      limit: sellWithdrawLimit,
      account: receiver,
    },
    { type: "midnightTakeWithdraw", limit: sellWithdrawLimit, account: owner },
    {
      type: "midnightTakeWithdraw",
      limit: sellWithdrawLimit,
      account: undefined,
    },
  ])(
    "error: rejects any account for $type",
    ({ limit: limitUnderTest, account }) => {
      expect(() =>
        planStateReads({
          operations: [
            {
              limit: {
                ...limitUnderTest,
                account,
              } as unknown as ParsedOperationLimit,
              assetsReceived: asset,
              midnightMarket,
            },
          ],
          owner,
          morpho: zeroAddress,
          midnight,
        }),
      ).toThrowError(SlippageCheckUnavailableError);
    },
  );
});

describe("planStateReads — Midnight repay-withdraw", () => {
  const midnight = "0x0000000000000000000000000000000000000005";
  const midnightMarketId: Hex = `0x${"11".repeat(32)}`;
  const collateralToken = "0x0000000000000000000000000000000000000009";
  const midnightMarket = {
    chainId: 8453n,
    midnight,
    loanToken: asset,
    collateralParams: [
      {
        token: collateralToken,
        lltv: 0n,
        liquidationCursor: 0n,
        oracle: zeroAddress,
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  } as const;
  const repayLimit: ParsedOperationLimit = {
    type: "midnightRepayWithdrawCollateral",
    marketId: midnightMarketId,
    receiver,
    quote: {
      assetsPaid: 10n,
      debtRepaid: 10n,
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 20n }],
    },
    position: {
      maxDebt: 0n,
      maxCollateral: [{ collateralIndex: 0n, assets: 0n }],
    },
    slippageTolerance: 0n,
  };
  const takeLendLimit: ParsedOperationLimit = {
    type: "midnightTakeLend",
    marketId: midnightMarketId,
    quote: { assetsPaid: 10n, unitsBought: 10n },
    slippageTolerance: 0n,
  };
  const collateralTokens: {
    readonly collateralIndex: bigint;
    readonly token: Address;
  }[] = [{ collateralIndex: 0n, token: collateralToken }];

  test.each([
    { type: "midnightRepayWithdrawCollateral", account: owner },
    { type: "midnightRepayWithdrawCollateral", account: receiver },
    { type: "midnightTakeRepayWithdrawCollateral", account: owner },
    { type: "midnightTakeRepayWithdrawCollateral", account: receiver },
  ])(
    "error: rejects an explicit account on $type ($account)",
    ({ type, account }) => {
      expect(() =>
        planStateReads({
          operations: [
            {
              limit: {
                ...repayLimit,
                type,
                account,
              } as unknown as ParsedOperationLimit,
              assetsPaid: asset,
              midnightMarket,
              midnightCollateralTokens: collateralTokens,
            },
          ],
          owner,
          morpho: zeroAddress,
          midnight,
        }),
      ).toThrowError(SlippageCheckUnavailableError);
    },
  );

  test("behavior: withdraw-only repayment plans a sender debt read", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: {
            type: "midnightRepayWithdrawCollateral",
            marketId: midnightMarketId,
            receiver,
            quote: {
              collateralWithdrawals: [{ collateralIndex: 0n, assets: 20n }],
            },
            slippageTolerance: 0n,
          },
          midnightMarket,
          midnightCollateralTokens: collateralTokens,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const debtReadId =
      `midnight-debt:${midnightMarketId}:${owner}`.toLowerCase();

    expect(plan.operations[0]?.debtReadId).toBe(debtReadId);
    expect(plan.reads).toContainEqual(
      expect.objectContaining({ id: debtReadId, kind: "midnight.debt" }),
    );
  });

  test("behavior: deduplicates debt, credit, collateral, and receiver balance reads", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: repayLimit,
          assetsPaid: asset,
          midnightMarket,
          midnightCollateralTokens: collateralTokens,
        },
        {
          limit: repayLimit,
          assetsPaid: asset,
          midnightMarket,
          midnightCollateralTokens: collateralTokens,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    expect(plan.reads.map(({ kind }) => kind).sort()).toEqual([
      "erc20.balance",
      "erc20.balance",
      "midnight.collateral",
      "midnight.credit",
      "midnight.debt",
    ]);
    expect(
      plan.reads.filter((read) => read.kind === "midnight.collateral"),
    ).toHaveLength(1);
    const operationReads = plan.operations[0]!;
    expect(operationReads.debtReadId).toBe(
      `midnight-debt:${midnightMarketId}:${owner}`.toLowerCase(),
    );
    expect(operationReads.creditReadId).toBe(
      `midnight-credit:${midnightMarketId}:${owner}`.toLowerCase(),
    );
    expect(operationReads.collateralReads).toEqual([
      {
        collateralIndex: 0n,
        positionReadId:
          `midnight-collateral:${midnightMarketId}:0:${owner}`.toLowerCase(),
        receiverBalanceReadId:
          `balance:${collateralToken}:${receiver}`.toLowerCase(),
      },
    ]);
  });

  test("behavior: no withdrawal quote means no collateral reads", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: {
            ...repayLimit,
            quote: { assetsPaid: 10n, debtRepaid: 10n },
            position: { maxDebt: 0n },
          },
          assetsPaid: asset,
          midnightMarket,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    expect(plan.reads.map(({ kind }) => kind).sort()).toEqual([
      "erc20.balance",
      "midnight.credit",
      "midnight.debt",
    ]);
    expect(plan.operations[0]?.collateralReads).toBeUndefined();
  });

  test("error: same-token repayment and delivery to the payer fails closed", () => {
    const sameTokenMarket = {
      ...midnightMarket,
      collateralParams: [
        { ...midnightMarket.collateralParams[0], token: asset as Address },
      ],
    };
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: { ...repayLimit, receiver: owner },
            assetsPaid: asset,
            midnightMarket: sameTokenMarket,
            midnightCollateralTokens: [{ collateralIndex: 0n, token: asset }],
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("behavior: same-token repayment can deliver collateral to another receiver", () => {
    const sameTokenMarket = {
      ...midnightMarket,
      collateralParams: [
        { ...midnightMarket.collateralParams[0], token: asset as Address },
      ],
    };
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: repayLimit,
            assetsPaid: asset,
            midnightMarket: sameTokenMarket,
            midnightCollateralTokens: [{ collateralIndex: 0n, token: asset }],
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      }),
    ).not.toThrow();
  });

  test("error: native value sent without a registered wNative fails closed", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: {
              type: "midnightRepayWithdrawCollateral",
              marketId: midnightMarketId,
              receiver,
              quote: {},
              slippageTolerance: 0n,
            },
            midnightMarket,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
        nativeValueSent: true,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("error: native-funded takeLend without a registered wNative fails closed", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: takeLendLimit,
            assetsPaid: asset,
            midnightMarket,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
        nativeValueSent: true,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("behavior: takeLend without wNative is measurable with no ETH sent", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: takeLendLimit,
            assetsPaid: asset,
            midnightMarket,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
        nativeValueSent: false,
      }),
    ).not.toThrow();
  });

  test("error: native funding and wNative collateral delivery to the payer fail closed", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: { ...repayLimit, receiver: owner },
            assetsPaid: asset,
            midnightMarket,
            midnightCollateralTokens: collateralTokens,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
        wNative: collateralToken,
        nativeValueSent: true,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("behavior: wNative collateral delivery to the payer is measurable with no ETH sent", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: { ...repayLimit, receiver: owner },
            assetsPaid: asset,
            midnightMarket,
            midnightCollateralTokens: collateralTokens,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
        wNative: collateralToken,
        nativeValueSent: false,
      }),
    ).not.toThrow();
  });

  test("error: native funding and wNative collateral delivery fail closed on a wNative loan market", () => {
    const wNativeMarket = {
      ...midnightMarket,
      loanToken: collateralToken as Address,
      collateralParams: [
        {
          ...midnightMarket.collateralParams[0],
          token: collateralToken as Address,
        },
      ],
    };
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: {
              type: "midnightRepayWithdrawCollateral",
              marketId: midnightMarketId,
              receiver: owner,
              quote: {
                collateralWithdrawals: [{ collateralIndex: 0n, assets: 20n }],
              },
              slippageTolerance: 0n,
            },
            midnightMarket: wNativeMarket,
            midnightCollateralTokens: [
              { collateralIndex: 0n, token: collateralToken },
            ],
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
        wNative: collateralToken,
        nativeValueSent: true,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("behavior: wNative repayment plans a balance read with native traces", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: {
            ...repayLimit,
            quote: { assetsPaid: 10n, debtRepaid: 10n },
            position: { maxDebt: 0n },
          },
          assetsPaid: asset,
          midnightMarket,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
      wNative: asset,
    });

    const paymentRead = plan.reads.find(
      (read) => read.kind === "erc20.balance" && read.token === asset,
    );
    expect(paymentRead).toBeDefined();
    expect(plan.operations[0]?.measurements).toContainEqual({
      field: "assetsPaid",
      type: "native",
      account: owner,
      readId: paymentRead?.id,
    });
  });

  test("behavior: wNative takeLend plans a balance read with native traces", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: takeLendLimit,
          assetsPaid: asset,
          midnightMarket,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
      wNative: asset,
    });

    const paymentRead = plan.reads.find(
      (read) => read.kind === "erc20.balance" && read.token === asset,
    );
    expect(paymentRead).toBeDefined();
    expect(plan.operations[0]?.measurements).toContainEqual({
      field: "assetsPaid",
      type: "native",
      account: owner,
      readId: paymentRead?.id,
    });
  });

  test("behavior: wNative parking plans a balance read with native traces", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: {
            type: "midnightSupplyBlueMakeLend",
            loanToken: asset,
            marketId,
            callbackSalt: marketId,
            quote: { assetsPaid: 10n, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
          assetsPaid: asset,
          blueBuyCallback: receiver,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
      wNative: asset,
      nativeValueSent: true,
    });

    const paymentRead = plan.reads.find(
      (read) => read.kind === "erc20.balance" && read.token === asset,
    );
    expect(paymentRead).toBeDefined();
    expect(plan.operations[0]?.measurements).toContainEqual({
      field: "assetsPaid",
      type: "native",
      account: owner,
      readId: paymentRead?.id,
    });
  });

  test("error: Blue parking rejects an account other than the bundle sender", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: {
              type: "midnightSupplyBlueMakeLend",
              loanToken: asset,
              marketId,
              callbackSalt: marketId,
              account: receiver,
              quote: { assetsPaid: 10n, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
            assetsPaid: asset,
            blueBuyCallback: receiver,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight: zeroAddress,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("behavior: Blue parking accepts an account equal to the bundle sender", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: {
              type: "midnightSupplyBlueMakeLend",
              loanToken: asset,
              marketId,
              callbackSalt: marketId,
              account: owner,
              quote: { assetsPaid: 10n, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
            assetsPaid: asset,
            blueBuyCallback: receiver,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight: zeroAddress,
      }),
    ).not.toThrow();
  });

  test("error: native-funded Blue parking fails closed without registered wNative", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: {
              type: "midnightSupplyBlueMakeLend",
              loanToken: asset,
              marketId,
              callbackSalt: marketId,
              quote: { assetsPaid: 10n, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
            assetsPaid: asset,
            blueBuyCallback: receiver,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight: zeroAddress,
        nativeValueSent: true,
      }),
    ).toThrow(
      "Limit operation 0 (midnightSupplyBlueMakeLend): native value is sent but no wNative is registered for this chain, so native-funded Blue parking cannot be measured. Send no native value.",
    );
  });

  test("behavior: Blue parking without native value plans a balance read without registered wNative", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: {
            type: "midnightSupplyBlueMakeLend",
            loanToken: asset,
            marketId,
            callbackSalt: marketId,
            quote: { assetsPaid: 10n, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
          assetsPaid: asset,
          blueBuyCallback: receiver,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
      nativeValueSent: false,
    });

    expect(plan.operations[0]?.measurements[0]).toMatchObject({
      field: "assetsPaid",
      type: "balance",
    });
  });

  test("error: missing collateral token or resolved market fails closed", () => {
    expect(() =>
      planStateReads({
        operations: [{ limit: repayLimit, assetsPaid: asset, midnightMarket }],
        owner,
        morpho: zeroAddress,
        midnight,
      }),
    ).toThrow(SlippageCheckUnavailableError);
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: repayLimit,
            assetsPaid: asset,
            midnightCollateralTokens: collateralTokens,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
});

describe("planStateReads — Midnight combined supply-take", () => {
  const midnight: Address = "0x0000000000000000000000000000000000000005";
  const collateralToken: Address = "0x0000000000000000000000000000000000000009";
  const midnightMarket = {
    chainId: 8453n,
    midnight,
    loanToken: asset,
    collateralParams: [
      {
        token: collateralToken,
        lltv: 0n,
        liquidationCursor: 0n,
        oracle: zeroAddress,
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  } as const;
  const combinedOperationLimit: ParsedOperationLimit = {
    type: "midnightSupplyCollateralTakeBorrow",
    marketId,
    receiver: owner,
    quote: {
      collateralSupplies: [{ collateralIndex: 0n, assets: 20n }],
      unitsSold: 10n,
      assetsReceived: 15n,
    },
    slippageTolerance: 0n,
  };
  const collateralTokens = [{ collateralIndex: 0n, token: collateralToken }];

  test("behavior: aliases collateral and loan-token bounds for an external receiver", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: { ...combinedOperationLimit, receiver },
          assetsReceived: collateralToken,
          midnightMarket: { ...midnightMarket, loanToken: collateralToken },
          midnightCollateralTokens: collateralTokens,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const walletBounds = plan.operations[0]?.walletBounds ?? [];
    const ownerBound = walletBounds.find((bound) => bound.account === owner);
    const receiverBound = walletBounds.find(
      (bound) => bound.account === receiver,
    );

    expect(walletBounds).toHaveLength(2);
    expect(ownerBound).toMatchObject({
      token: collateralToken,
      account: owner,
      maxPulls: 20n,
      minProceeds: 0n,
    });
    expect(receiverBound).toMatchObject({
      token: collateralToken,
      account: receiver,
      maxPulls: 0n,
      minProceeds: 15n,
    });
    expect(ownerBound?.readId).not.toBe(receiverBound?.readId);
    expect(
      plan.reads.find((read) => read.id === ownerBound?.readId),
    ).toMatchObject({
      kind: "erc20.balance",
      token: collateralToken,
      account: owner,
    });
    expect(
      plan.reads.find((read) => read.id === receiverBound?.readId),
    ).toMatchObject({
      kind: "erc20.balance",
      token: collateralToken,
      account: receiver,
    });
  });

  test("behavior: owner native value equal to wNative supply yields a zero pull cap", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: combinedOperationLimit,
          assetsReceived: asset,
          midnightMarket,
          midnightCollateralTokens: collateralTokens,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
      wNative: collateralToken,
      nativeValue: 20n,
    });

    expect(
      plan.operations[0]?.walletBounds?.find(
        (bound) => bound.token === collateralToken && bound.account === owner,
      ),
    ).toMatchObject({
      token: collateralToken,
      account: owner,
      maxPulls: 0n,
      minProceeds: 0n,
    });
  });

  test("behavior: owner native value below wNative supply reduces the pull cap", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: combinedOperationLimit,
          assetsReceived: asset,
          midnightMarket,
          midnightCollateralTokens: collateralTokens,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
      wNative: collateralToken,
      nativeValue: 5n,
    });

    expect(
      plan.operations[0]?.walletBounds?.find(
        (bound) => bound.token === collateralToken && bound.account === owner,
      ),
    ).toMatchObject({
      token: collateralToken,
      account: owner,
      maxPulls: 15n,
      minProceeds: 0n,
    });
  });

  test("error: owner native value above wNative supply fails closed", () => {
    let error: unknown;
    try {
      planStateReads({
        operations: [
          {
            limit: combinedOperationLimit,
            assetsReceived: asset,
            midnightMarket,
            midnightCollateralTokens: collateralTokens,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
        wNative: collateralToken,
        nativeValue: 21n,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect(error).toHaveProperty(
      "message",
      "Limit operation 0 (midnightSupplyCollateralTakeBorrow): native value sent by the owner (21) exceeds this operation's quoted wNative collateral supply (20), so wNative pulls cannot be attributed. Send at most the quoted wNative collateral supply (20) as native value.",
    );
  });

  test("error: missing resolved collateral tokens fails closed", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: combinedOperationLimit,
            assetsReceived: asset,
            midnightMarket,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("error: missing resolved proceeds token fails closed", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: combinedOperationLimit,
            midnightMarket,
            midnightCollateralTokens: collateralTokens,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("error: native value without a registered wNative fails closed", () => {
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: combinedOperationLimit,
            assetsReceived: asset,
            midnightMarket,
            midnightCollateralTokens: collateralTokens,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
        nativeValueSent: true,
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("error: overlapping wallet bounds across combined operations fail validation", () => {
    const secondLimit = {
      ...combinedOperationLimit,
      marketId: `0x${"22".repeat(32)}` as typeof marketId,
    };
    const plan = () =>
      planStateReads({
        operations: [
          {
            limit: combinedOperationLimit,
            assetsReceived: asset,
            midnightMarket,
            midnightCollateralTokens: collateralTokens,
          },
          {
            limit: secondLimit,
            assetsReceived: asset,
            midnightMarket,
            midnightCollateralTokens: collateralTokens,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      });
    expect(plan).toThrow(SimulationValidationError);
    expect(plan).toThrow("Limit operation 0 cannot share wallet token");
    expect(plan).toThrow("with limit operation 1");
  });

  test("error: combined collateral read cannot overlap Midnight supply collateral", () => {
    const supplyLimit: ParsedOperationLimit = {
      type: "midnightSupplyCollateral",
      marketId,
      collateralIndex: 0n,
      account: owner,
      quote: { assetsPaid: 20n, collateralSupplied: 20n },
      slippageTolerance: 0n,
    };
    const plan = () =>
      planStateReads({
        operations: [
          {
            limit: combinedOperationLimit,
            assetsReceived: asset,
            midnightMarket,
            midnightCollateralTokens: collateralTokens,
          },
          { limit: supplyLimit, assetsPaid: asset },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      });
    expect(plan).toThrow(SimulationValidationError);
    expect(plan).toThrow(
      /^Limit operation 0 cannot share Midnight position read ".*" with limit operation 1; whole-bundle position deltas would overlap\. Simulate these operations in separate requests or drop one of the overlapping limit operations\.$/,
    );
  });

  test("error: combined position reads cannot overlap Midnight take borrow", () => {
    const borrowLimit: ParsedOperationLimit = {
      type: "midnightTakeBorrow",
      marketId,
      receiver: owner,
      quote: { unitsSold: 10n, assetsReceived: 15n },
      slippageTolerance: 0n,
    };
    const plan = () =>
      planStateReads({
        operations: [
          {
            limit: combinedOperationLimit,
            assetsReceived: asset,
            midnightMarket,
            midnightCollateralTokens: collateralTokens,
          },
          {
            limit: borrowLimit,
            assetsReceived: asset,
            midnightMarket,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      });
    expect(plan).toThrow(SimulationValidationError);
    expect(plan).toThrow(
      /^Limit operation 0 cannot share Midnight position read ".*" with limit operation 1; whole-bundle position deltas would overlap\. Simulate these operations in separate requests or drop one of the overlapping limit operations\.$/,
    );
  });

  test("behavior: combined collateral read can coexist with supply on another market", () => {
    const otherCollateralToken: Address =
      "0x000000000000000000000000000000000000000A";
    const supplyLimit: ParsedOperationLimit = {
      type: "midnightSupplyCollateral",
      marketId: `0x${"22".repeat(32)}` as typeof marketId,
      collateralIndex: 0n,
      account: owner,
      quote: { assetsPaid: 20n, collateralSupplied: 20n },
      slippageTolerance: 0n,
    };
    expect(() =>
      planStateReads({
        operations: [
          {
            limit: combinedOperationLimit,
            assetsReceived: asset,
            midnightMarket,
            midnightCollateralTokens: collateralTokens,
          },
          { limit: supplyLimit, assetsPaid: otherCollateralToken },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      }),
    ).not.toThrow();
  });

  test("error: repayment collateral delivery cannot overlap a combined wallet bound", () => {
    const repayLimit: ParsedOperationLimit = {
      type: "midnightRepayWithdrawCollateral",
      marketId: `0x${"22".repeat(32)}` as typeof marketId,
      receiver: owner,
      quote: {
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
      },
      slippageTolerance: 0n,
    };
    const plan = () =>
      planStateReads({
        operations: [
          {
            limit: combinedOperationLimit,
            assetsReceived: asset,
            midnightMarket,
            midnightCollateralTokens: collateralTokens,
          },
          {
            limit: repayLimit,
            midnightMarket,
            midnightCollateralTokens: collateralTokens,
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      });
    expect(plan).toThrow(SimulationValidationError);
    expect(plan).toThrow("Limit operation 0 cannot share wallet token");
    expect(plan).toThrow("with limit operation 1");
  });
});
