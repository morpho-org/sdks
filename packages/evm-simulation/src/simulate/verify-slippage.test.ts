import { type MarketId, MathLib } from "@morpho-org/blue-sdk";
import { blueAbi, vaultV2Abi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  ethAddress,
  type Hex,
  parseAbiParameters,
  zeroAddress,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  ConsumerLimitViolationError,
  InvalidSimulationResponseError,
  SlippageCheckUnavailableError,
} from "../errors.js";
import type { RawLog } from "../types.js";
import type { CheckContext } from "./context.js";
import type { ParsedOperationLimit } from "./request/parse-request.js";
import { planStateReads, type StateValue } from "./state/read-state.js";
import { verifySlippage } from "./verify-slippage.js";

type ParsedRepayWithdrawLimit = Extract<
  ParsedOperationLimit,
  {
    type:
      | "midnightRepayWithdrawCollateral"
      | "midnightTakeRepayWithdrawCollateral";
  }
>;

const owner: Address = "0x0000000000000000000000000000000000000001";
const vault: Address = "0x0000000000000000000000000000000000000002";
const receiver: Address = "0x0000000000000000000000000000000000000003";
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
const limit: ParsedOperationLimit = {
  type: "vaultV2Deposit",
  vault,
  account: receiver,
  quote: { sharesMinted: 100n },
  slippageTolerance: 10_000000000000000n,
};

describe("verifySlippage", () => {
  test.each([
    "blueSupply",
    "blueWithdraw",
    "blueSupplyCollateral",
    "blueWithdrawCollateral",
    "blueBorrow",
    "blueRepay",
    "blueSupplyCollateralBorrow",
    "blueRepayWithdrawCollateral",
  ] as const)("typed %s rejects undeclared counter-side movement", (type) => {
    const marketId = `0x${"ab".repeat(32)}` as MarketId;
    const common = {
      marketId,
      account: receiver,
      quote: {},
      slippageTolerance: 0n,
    };
    const operation: ParsedOperationLimit =
      type === "blueSupplyCollateralBorrow"
        ? {
            ...common,
            type,
            inputs: { collateralAssets: 1n, borrowAssets: 1n },
          }
        : type === "blueRepayWithdrawCollateral"
          ? {
              ...common,
              type,
              inputs: { repay: { assets: 1n }, collateralAssets: 1n },
            }
          : { ...common, type, inputs: { assets: 1n } };
    const plan = planStateReads({
      operations: [{ limit: operation }],
      owner,
      morpho: vault,
      midnight: zeroAddress,
    });
    const counterSide = plan.operations[0]!.counterSide!;
    expect(counterSide.guards.map(({ field }) => field)).toEqual(
      type === "blueSupply" || type === "blueWithdraw"
        ? ["borrowShares", "collateral"]
        : type === "blueBorrow" || type === "blueRepay"
          ? ["collateral", "supplyShares"]
          : type === "blueSupplyCollateral" || type === "blueWithdrawCollateral"
            ? ["borrowShares", "supplyShares"]
            : ["supplyShares"],
    );
    expect(plan.reads).toHaveLength(1);
    expect(plan.reads[0]).toMatchObject({ owner: receiver, marketId });
    const position = { supplyShares: 50n, borrowShares: 10n, collateral: 100n };
    for (const guard of counterSide.guards) {
      const check = (
        change: bigint,
        { missing = false, quoteOnly = false } = {},
      ) =>
        verifySlippage({
          ctx,
          operations: quoteOnly
            ? planStateReads({
                operations: [
                  {
                    limit: {
                      type,
                      marketId,
                      account: receiver,
                      quote: {},
                      slippageTolerance: 0n,
                    },
                  },
                ],
                owner,
                morpho: vault,
                midnight: zeroAddress,
              }).operations
            : plan.operations,
          before: missing
            ? new Map()
            : new Map([[counterSide.readId, position]]),
          after: new Map([
            [
              counterSide.readId,
              {
                ...position,
                [guard.field]: position[guard.field] + change,
              },
            ],
          ]),
          transfers: [],
          logs: [],
          morpho: vault,
          requestTransactions: [],
        });
      const adverse = guard.direction === "increase" ? 1n : -1n;
      expect(() => check(0n)).not.toThrow();
      expect(() => check(-adverse)).not.toThrow();
      expect(() => check(adverse)).toThrow(ConsumerLimitViolationError);
      expect(() => check(adverse, { quoteOnly: true })).not.toThrow();
      expect(() => check(0n, { missing: true })).toThrow(
        SlippageCheckUnavailableError,
      );
    }
  });
  test.each(["assetPaid", "assetReceived"] as const)(
    "shared-wallet %s alias retains the aggregate native bound",
    (nativeOverride) => {
      const marketId = `0x${"ab".repeat(32)}` as MarketId;
      const operation: ParsedOperationLimit = {
        type: "blueSupplyCollateralBorrow",
        marketId,
        inputs: { collateralAssets: 10n, borrowAssets: 20n },
        [nativeOverride]: ethAddress,
        quote: { assetsPaid: 0n, assetsReceived: 10n },
        derivedFields: ["assetsPaid", "assetsReceived"],
        slippageTolerance: 0n,
      };
      const plan = planStateReads({
        operations: [
          { limit: operation, assetsPaid: receiver, assetsReceived: receiver },
        ],
        owner,
        morpho: vault,
        midnight: zeroAddress,
        wNative: receiver,
      });
      const position = {
        supplyShares: 50n,
        borrowShares: 10n,
        collateral: 100n,
      };
      const check = (nativePaid: bigint) =>
        verifySlippage({
          ctx,
          operations: plan.operations,
          before: new Map(
            plan.reads.map((read) => [
              read.id,
              read.kind === "morpho.position" ? position : 100n,
            ]),
          ),
          after: new Map(
            plan.reads.map((read) => [
              read.id,
              read.kind === "morpho.position" ? position : 120n,
            ]),
          ),
          transfers: [
            {
              token: ethAddress,
              from: owner,
              to: vault,
              amount: nativePaid,
              txIdx: 0,
            },
          ],
          logs: [],
          morpho: vault,
          requestTransactions: [],
        });
      expect(() => check(10n)).not.toThrow();
      expect(() => check(15n)).toThrow(ConsumerLimitViolationError);
    },
  );
  test.each(["assetsPaid", "assetsReceived"] as const)(
    "native input %s includes wrapped balance changes",
    (field) => {
      const wrapped = receiver;
      const operation: ParsedOperationLimit = {
        type: field === "assetsPaid" ? "vaultV2Deposit" : "vaultV2Withdraw",
        vault,
        inputs: { assets: 10n },
        ...(field === "assetsPaid"
          ? { assetPaid: ethAddress }
          : { assetReceived: ethAddress }),
        quote: { [field]: 10n },
        derivedFields: [field],
        exactFields: [field],
        slippageTolerance: 0n,
      };
      const plan = planStateReads({
        operations: [{ limit: operation, [field]: wrapped }],
        owner,
        morpho: vault,
        midnight: zeroAddress,
        wNative: wrapped,
      });
      const id = plan.reads[0]!.id;
      expect(plan.operations[0]!.measurements[0]).toMatchObject({
        type: "native",
        readId: id,
      });
      const paying = field === "assetsPaid";
      const check = (wrappedChange: bigint, missing = false) =>
        verifySlippage({
          ctx,
          operations: plan.operations,
          before: missing ? new Map() : new Map([[id, 100n]]),
          after: new Map([[id, 100n + wrappedChange]]),
          transfers: [
            {
              token: ethAddress,
              from: paying ? owner : vault,
              to: paying ? vault : owner,
              amount: 10n,
              txIdx: 0,
            },
          ],
          logs: [],
          morpho: vault,
          requestTransactions: [],
        });
      expect(() => check(0n)).not.toThrow();
      expect(() => check(-10n)).toThrow(ConsumerLimitViolationError);
      expect(() => check(10n)).toThrow(ConsumerLimitViolationError);
      expect(() => check(0n, true)).toThrow(SlippageCheckUnavailableError);
    },
  );
  test.each([true, false])(
    "input withdrawal rounding uses simulated evidence (explicit account: %s)",
    (explicit) => {
      const marketId = `0x${"aa".repeat(32)}` as MarketId;
      const account = explicit ? receiver : owner;
      const operation: ParsedOperationLimit = {
        type: "blueWithdraw",
        marketId,
        ...(explicit ? { account } : {}),
        inputs: { assets: 100n },
        quote: { sharesBurned: 100n },
        derivedFields: ["sharesBurned"],
        slippageTolerance: 0n,
      };
      const plan = planStateReads({
        operations: [{ limit: operation }],
        owner,
        morpho: vault,
        midnight: zeroAddress,
      });
      const id = plan.reads[0]!.id;
      const position = (supplyShares: bigint) => ({
        supplyShares,
        borrowShares: 0n,
        collateral: 0n,
      });
      const supply: RawLog = {
        address: vault,
        topics: encodeEventTopics({
          abi: blueAbi,
          eventName: "Supply",
          args: { id: marketId, caller: owner, onBehalf: owner },
        }).filter((topic): topic is Hex => typeof topic === "string"),
        data: encodeAbiParameters(parseAbiParameters("uint256, uint256"), [
          100n,
          100n,
        ]),
      };
      const withdrawal: RawLog = {
        address: vault,
        topics: encodeEventTopics({
          abi: blueAbi,
          eventName: "Withdraw",
          args: { id: marketId, onBehalf: account, receiver: account },
        }).filter((topic): topic is Hex => typeof topic === "string"),
        data: encodeAbiParameters(
          parseAbiParameters("address, uint256, uint256"),
          [account, 100n, 98n],
        ),
      };
      const check = (
        sharesBurned: bigint,
        evidence: {
          readonly logs: readonly (readonly RawLog[])[];
          readonly operations?: typeof plan.operations;
        },
      ) =>
        verifySlippage({
          ctx,
          logs: evidence.logs,
          morpho: vault,
          operations: evidence.operations ?? plan.operations,
          before: new Map([[id, position(200n)]]),
          after: new Map([[id, position(200n - sharesBurned)]]),
          transfers: [],
          requestTransactions: [],
        });
      const logs = [
        [supply, supply],
        [withdrawal, supply],
      ];
      expect(() => check(98n, { logs })).not.toThrow();
      expect(() => check(97n, { logs })).toThrow(ConsumerLimitViolationError);
      expect(() => check(99n, { logs: [[withdrawal]] })).toThrow(
        ConsumerLimitViolationError,
      );
      expect(() =>
        check(99n, { logs: [[{ ...supply, address: owner }, withdrawal]] }),
      ).toThrow(ConsumerLimitViolationError);
      const sharesMode = plan.operations.map((op) => ({
        ...op,
        limit: {
          ...operation,
          inputs: { shares: 100n },
          exactFields: ["sharesBurned"] as const,
        },
      }));
      expect(() => check(98n, { logs, operations: sharesMode })).toThrow(
        ConsumerLimitViolationError,
      );
    },
  );
  test("behavior: Midnight Blue parking requires exact sender debit despite tolerance", () => {
    const parkingLimit: ParsedOperationLimit = {
      type: "midnightSupplyBlueMakeLend",
      loanToken: vault,
      marketId:
        "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
      callbackSalt:
        "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex,
      quote: { assetsPaid: 100n, sharesMinted: 10n },
      slippageTolerance: 500_000000000000000n,
    };
    const plan = planStateReads({
      operations: [
        {
          limit: parkingLimit,
          assetsPaid: vault,
          blueBuyCallback: receiver,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    const readId = plan.reads[0]!.id;
    const positionReadId = plan.reads.find(
      ({ kind }) => kind === "morpho.position",
    )!.id;
    const input = {
      ctx,
      logs: [] as const,
      morpho: zeroAddress,
      operations: plan.operations,
      before: new Map<string, StateValue>([
        [readId, 1_000n],
        [
          positionReadId,
          { supplyShares: 0n, borrowShares: 0n, collateral: 0n },
        ],
      ]),
      after: new Map<string, StateValue>(),
      transfers: [],
      requestTransactions: [],
    };
    expect(
      verifySlippage({
        ...input,
        after: new Map<string, StateValue>([
          [readId, 900n],
          [
            positionReadId,
            { supplyShares: 7n, borrowShares: 0n, collateral: 0n },
          ],
        ]),
      })[0],
    ).toMatchObject({
      operation: "midnightSupplyBlueMakeLend",
      loanToken: vault,
    });
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map<string, StateValue>([
          [readId, 900n],
          [
            positionReadId,
            { supplyShares: 0n, borrowShares: 0n, collateral: 0n },
          ],
        ]),
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map<string, StateValue>([
          [readId, 900n],
          [
            positionReadId,
            { supplyShares: 0n, borrowShares: 0n, collateral: 0n },
          ],
        ]),
      }),
    ).toThrow("sharesMinted");
    for (const balance of [901n, 899n, 1_000n]) {
      expect(() =>
        verifySlippage({
          ...input,
          after: new Map<string, StateValue>([
            [readId, balance],
            [
              positionReadId,
              { supplyShares: 7n, borrowShares: 0n, collateral: 0n },
            ],
          ]),
        }),
      ).toThrow(ConsumerLimitViolationError);
      expect(() =>
        verifySlippage({
          ...input,
          after: new Map<string, StateValue>([
            [readId, balance],
            [
              positionReadId,
              { supplyShares: 7n, borrowShares: 0n, collateral: 0n },
            ],
          ]),
        }),
      ).toThrow(/midnightSupplyBlueMakeLend, loanToken/);
    }
  });

  test("default: no operations", () => {
    expect(
      verifySlippage({
        ctx,
        logs: [] as const,
        morpho: zeroAddress,
        operations: [],
        before: new Map(),
        after: new Map(),
        transfers: [],
        requestTransactions: [],
      }),
    ).toEqual([]);
  });
  test("behavior: recipient balance and inclusive percentage", () => {
    const plan = planStateReads({
      operations: [{ limit }],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    const id = plan.reads[0]!.id;
    const input = {
      ctx,
      logs: [] as const,
      morpho: zeroAddress,
      operations: plan.operations,
      before: new Map([[id, 20n]]),
      transfers: [],
      requestTransactions: [],
    };
    expect(
      verifySlippage({ ...input, after: new Map([[id, 119n]]) })[0],
    ).toMatchObject({
      account: receiver,
      checkedLimits: {
        quote: limit.quote,
        slippageTolerance: limit.slippageTolerance,
      },
    });
    expect(() =>
      verifySlippage({ ...input, after: new Map([[id, 118n]]) }),
    ).toThrow(ConsumerLimitViolationError);
    expect(() =>
      verifySlippage({ ...input, after: new Map([[id, 118n]]) }),
    ).toThrow(`Limit operation 0 (${limit.type}): slippage for`);
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map([[`balance:${vault}:${owner}`, 10000n]]),
      }),
    ).toThrow(SlippageCheckUnavailableError);
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map([[`balance:${vault}:${owner}`, 10000n]]),
      }),
    ).toThrow(`Limit operation 0 (${limit.type}): missing observation for`);
  });
  test("behavior: names the index of the failing operation", () => {
    const second: ParsedOperationLimit = { ...limit, vault: receiver };
    const plan = planStateReads({
      operations: [{ limit }, { limit: second }],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    const [first, failing] = plan.reads.map((read) => read.id);
    expect(() =>
      verifySlippage({
        ctx,
        operations: plan.operations,
        before: new Map([
          [first!, 20n],
          [failing!, 20n],
        ]),
        after: new Map([
          [first!, 119n],
          [failing!, 118n],
        ]),
        transfers: [],
        logs: [],
        morpho: zeroAddress,
        requestTransactions: [],
      }),
    ).toThrow(`Limit operation 1 (${second.type}): slippage for`);
  });
  test("behavior: native payments use net user traces and exclude other accounts/tokens", () => {
    const nativeLimit = {
      ...limit,
      quote: { assetsPaid: 10n },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [{ limit: nativeLimit, assetsPaid: ethAddress }],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    const input = {
      ctx,
      logs: [] as const,
      morpho: zeroAddress,
      operations: plan.operations,
      before: new Map(),
      after: new Map(),
      transfers: [
        { token: ethAddress, from: owner, to: vault, amount: 12n, txIdx: 0 },
        { token: ethAddress, from: vault, to: owner, amount: 2n, txIdx: 0 },
        { token: vault, from: owner, to: receiver, amount: 1000n, txIdx: 0 },
        {
          token: ethAddress,
          from: receiver,
          to: vault,
          amount: 1000n,
          txIdx: 0,
        },
      ],
      requestTransactions: [],
    };
    expect(verifySlippage(input)[0]?.checkedLimits.quote).toEqual({
      assetsPaid: 10n,
    });
    expect(() =>
      verifySlippage({ ...input, transfers: input.transfers.slice(0, 1) }),
    ).toThrow(ConsumerLimitViolationError);
  });
  test("error: ConsumerLimitViolationError reports the observed bound violation", () => {
    const plan = planStateReads({
      operations: [{ limit }],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    const id = plan.reads[0]!.id;
    const error = (() => {
      try {
        verifySlippage({
          ctx,
          logs: [] as const,
          morpho: zeroAddress,
          operations: plan.operations,
          before: new Map([[id, 20n]]),
          after: new Map([[id, 118n]]),
          transfers: [],
          requestTransactions: [],
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain('allowed bound "99", got "98"');
  });
  test("behavior: a native assetsReceived quote uses incoming traces", () => {
    const nativeLimit = {
      ...limit,
      receiver,
      quote: { assetsReceived: 10n },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [{ limit: nativeLimit, assetsReceived: ethAddress }],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    const input = {
      ctx,
      logs: [] as const,
      morpho: zeroAddress,
      operations: plan.operations,
      before: new Map(),
      after: new Map(),
      requestTransactions: [] as { from: Address; value?: bigint }[],
    };
    expect(
      verifySlippage({
        ...input,
        transfers: [
          {
            token: ethAddress,
            from: vault,
            to: receiver,
            amount: 10n,
            txIdx: 0,
          },
        ],
      })[0]?.checkedLimits.quote,
    ).toEqual({ assetsReceived: 10n });
    const error = (() => {
      try {
        verifySlippage({ ...input, transfers: [] });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect(error).not.toBeInstanceOf(SlippageCheckUnavailableError);
  });
  test("behavior: position shares use requested component and direction", () => {
    const operations = [
      {
        limit: {
          ...limit,
          quote: { sharesBurned: 10n },
          slippageTolerance: 0n,
        },
        measurements: [
          {
            field: "sharesBurned" as const,
            type: "position" as const,
            readId: "position",
            marketId:
              "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
            shares: "borrowShares" as const,
          },
        ],
      },
    ];
    const before = new Map<string, StateValue>([
      ["position", { supplyShares: 900n, borrowShares: 30n, collateral: 0n }],
    ]);
    const after = new Map<string, StateValue>([
      ["position", { supplyShares: 1n, borrowShares: 20n, collateral: 0n }],
    ]);
    expect(
      verifySlippage({
        ctx,
        logs: [] as const,
        morpho: zeroAddress,
        operations,
        before,
        after,
        transfers: [],
        requestTransactions: [],
      })[0]?.checkedLimits.quote,
    ).toEqual({ sharesBurned: 10n });
    expect(() =>
      verifySlippage({
        ctx,
        logs: [] as const,
        morpho: zeroAddress,
        operations,
        before,
        after: new Map(),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
  test("behavior: debt shares minted are capped and debt shares burned are floored", () => {
    const borrow: ParsedOperationLimit = {
      type: "blueBorrow",
      marketId:
        "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
      quote: { sharesMinted: 1000n },
      slippageTolerance: 10_000000000000000n,
    };
    const borrowOps = [
      {
        limit: borrow,
        measurements: [
          {
            field: "sharesMinted" as const,
            type: "position" as const,
            readId: "position",
            marketId:
              "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
            shares: "borrowShares" as const,
          },
        ],
      },
    ];
    const borrowBefore = new Map<string, StateValue>([
      ["position", { supplyShares: 0n, borrowShares: 0n, collateral: 0n }],
    ]);
    const input = {
      ctx,
      logs: [] as const,
      morpho: zeroAddress,
      operations: borrowOps,
      before: borrowBefore,
      transfers: [] as const,
      requestTransactions: [] as const,
    };
    // A debt `sharesMinted` quote is a cap, not a floor: +1011 exceeds the 1%
    // bound on 1000, +980 is inside it.
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map([
          [
            "position",
            { supplyShares: 0n, borrowShares: 1011n, collateral: 0n },
          ],
        ]),
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(
      verifySlippage({
        ...input,
        after: new Map([
          [
            "position",
            { supplyShares: 0n, borrowShares: 980n, collateral: 0n },
          ],
        ]),
      })[0]?.checkedLimits.quote,
    ).toEqual({ sharesMinted: 1000n });

    const repay: ParsedOperationLimit = {
      type: "blueRepay",
      marketId:
        "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
      quote: { sharesBurned: 1000n },
      slippageTolerance: 10_000000000000000n,
    };
    const repayOps = [
      {
        limit: repay,
        measurements: [
          {
            field: "sharesBurned" as const,
            type: "position" as const,
            readId: "position",
            marketId:
              "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
            shares: "borrowShares" as const,
          },
        ],
      },
    ];
    const repayBefore = new Map<string, StateValue>([
      ["position", { supplyShares: 0n, borrowShares: 2000n, collateral: 0n }],
    ]);
    // A debt `sharesBurned` quote is a floor: burning 980 is below the 1%
    // bound on 1000, burning 1000 satisfies it.
    expect(() =>
      verifySlippage({
        ctx,
        logs: [] as const,
        morpho: zeroAddress,
        operations: repayOps,
        before: repayBefore,
        after: new Map([
          [
            "position",
            { supplyShares: 0n, borrowShares: 1020n, collateral: 0n },
          ],
        ]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(
      verifySlippage({
        ctx,
        logs: [] as const,
        morpho: zeroAddress,
        operations: repayOps,
        before: repayBefore,
        after: new Map([
          [
            "position",
            { supplyShares: 0n, borrowShares: 1000n, collateral: 0n },
          ],
        ]),
        transfers: [],
        requestTransactions: [],
      })[0]?.checkedLimits.quote,
    ).toEqual({ sharesBurned: 1000n });
  });
  test("behavior: in-kind positions measure receiver supply shares per market", () => {
    const marketId =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId;
    const inKindLimit: ParsedOperationLimit = {
      type: "vaultV2InKindRedeem",
      vault,
      quote: { positions: [{ marketId, supplyShares: 100n }] },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [{ limit: inKindLimit }],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    const id = plan.reads[0]!.id;
    const input = {
      ctx,
      logs: [] as const,
      morpho: zeroAddress,
      operations: plan.operations,
      transfers: [] as const,
      requestTransactions: [] as const,
    };
    expect(
      verifySlippage({
        ...input,
        before: new Map([
          [id, { supplyShares: 0n, borrowShares: 0n, collateral: 0n }],
        ]),
        after: new Map([
          [id, { supplyShares: 100n, borrowShares: 0n, collateral: 0n }],
        ]),
      })[0]?.checkedLimits.quote,
    ).toEqual({ positions: [{ marketId, supplyShares: 100n }] });
    expect(() =>
      verifySlippage({
        ...input,
        before: new Map([
          [id, { supplyShares: 0n, borrowShares: 0n, collateral: 0n }],
        ]),
        after: new Map([
          [id, { supplyShares: 99n, borrowShares: 0n, collateral: 0n }],
        ]),
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(() =>
      verifySlippage({
        ...input,
        before: new Map(),
        after: new Map(),
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
  const forceExitTest = (
    type: "vaultV2ForceWithdraw" | "vaultV2ForceRedeem",
  ) => {
    const morpho: Address = "0x0000000000000000000000000000000000000004";
    const adapter: Address = "0x0000000000000000000000000000000000000005";
    const other: Address = "0x0000000000000000000000000000000000000006";
    const notMorpho: Address = "0x0000000000000000000000000000000000000007";
    const marketId =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId;
    const otherMarket =
      "0x2222222222222222222222222222222222222222222222222222222222222222" as MarketId;
    const forceLimit: ParsedOperationLimit = {
      type,
      vault,
      quote: { penalty: 7n, deallocations: [{ marketId, assets: 993n }] },
      slippageTolerance: 0n,
    };
    const forceDeallocate = ({
      onBehalf,
      penaltyAssets,
      assets = 993n,
    }: {
      onBehalf: Address;
      penaltyAssets: bigint;
      assets?: bigint;
    }): RawLog => ({
      address: vault,
      topics: encodeEventTopics({
        abi: vaultV2Abi,
        eventName: "ForceDeallocate",
        args: { sender: owner, onBehalf },
      }).filter((topic): topic is Hex => typeof topic === "string"),
      data: encodeAbiParameters(
        parseAbiParameters(
          "address adapter, uint256 assets, bytes32[] ids, uint256 penaltyAssets",
        ),
        [adapter, assets, [marketId], penaltyAssets],
      ),
    });
    const vaultWithdraw = (logOwner: Address): RawLog => ({
      address: vault,
      topics: encodeEventTopics({
        abi: vaultV2Abi,
        eventName: "Withdraw",
        args: { sender: owner, receiver: owner, onBehalf: logOwner },
      }).filter((topic): topic is Hex => typeof topic === "string"),
      data: encodeAbiParameters(
        parseAbiParameters("uint256 assets, uint256 shares"),
        [1000n, 500n],
      ),
    });
    const withdraw = ({
      id,
      onBehalf,
      assets,
      emitter = morpho,
    }: {
      id: MarketId;
      onBehalf: Address;
      assets: bigint;
      emitter?: Address;
    }): RawLog => ({
      address: emitter,
      topics: encodeEventTopics({
        abi: blueAbi,
        eventName: "Withdraw",
        args: { id, onBehalf, receiver: vault },
      }).filter((topic): topic is Hex => typeof topic === "string"),
      data: encodeAbiParameters(
        parseAbiParameters("address caller, uint256 assets, uint256 shares"),
        [adapter, assets, 0n],
      ),
    });
    const input = {
      ctx,
      morpho,
      operations: [{ limit: forceLimit, measurements: [] as const }] as const,
      before: new Map<string, StateValue>(),
      after: new Map<string, StateValue>(),
      transfers: [] as const,
      requestTransactions: [] as const,
    };
    // Exact quote passes; a zero-penalty ForceDeallocate for another account
    // is ignored, and the liquidity withdrawal stays uncounted.
    expect(
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: otherMarket, onBehalf: adapter, assets: 500n }),
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
            forceDeallocate({ onBehalf: other, penaltyAssets: 0n }),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      })[0]?.checkedLimits.quote,
    ).toEqual({
      penalty: 7n,
      deallocations: [{ marketId, assets: 993n }],
    });
    expect(
      verifySlippage({
        ...input,
        operations: [
          {
            limit: { ...forceLimit, account: other },
            measurements: [] as const,
          },
        ],
        logs: [
          [
            vaultWithdraw(other),
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
            forceDeallocate({ onBehalf: other, penaltyAssets: 7n }),
          ],
        ],
      })[0]?.checkedLimits.quote,
    ).toEqual({
      penalty: 7n,
      deallocations: [{ marketId, assets: 993n }],
    });
    const summedLimit: ParsedOperationLimit = {
      ...forceLimit,
      quote: { deallocations: [{ marketId, assets: 200n }] },
    };
    const summedInput = {
      ...input,
      operations: [{ limit: summedLimit, measurements: [] as const }] as const,
      logs: [
        [
          vaultWithdraw(owner),
          withdraw({ id: marketId, onBehalf: adapter, assets: 80n }),
          forceDeallocate({
            onBehalf: owner,
            penaltyAssets: 1n,
            assets: 80n,
          }),
          withdraw({ id: marketId, onBehalf: adapter, assets: 120n }),
          forceDeallocate({
            onBehalf: owner,
            penaltyAssets: 2n,
            assets: 120n,
          }),
        ],
      ],
    };
    expect(verifySlippage(summedInput)[0]?.checkedLimits.quote).toEqual({
      deallocations: [{ marketId, assets: 200n }],
    });
    expect(() =>
      verifySlippage({
        ...summedInput,
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: marketId, onBehalf: adapter, assets: 80n }),
            forceDeallocate({
              onBehalf: owner,
              penaltyAssets: 1n,
              assets: 80n,
            }),
            withdraw({ id: marketId, onBehalf: adapter, assets: 121n }),
            forceDeallocate({
              onBehalf: owner,
              penaltyAssets: 2n,
              assets: 121n,
            }),
          ],
        ],
      }),
    ).toThrow(ConsumerLimitViolationError);
    // Realized penalty above the quote violates.
    expect(() =>
      verifySlippage({
        ...input,
        operations: [
          {
            limit: { ...forceLimit, quote: { penalty: 6n } },
            measurements: [] as const,
          },
        ],
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      }),
    ).toThrow(ConsumerLimitViolationError);
    // Deallocating more than quoted violates.
    expect(() =>
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: marketId, onBehalf: adapter, assets: 994n }),
            forceDeallocate({
              onBehalf: owner,
              penaltyAssets: 7n,
              assets: 994n,
            }),
          ],
        ],
      }),
    ).toThrow(ConsumerLimitViolationError);
    // A realized deallocation in an unquoted market violates.
    expect(() =>
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: otherMarket, onBehalf: adapter, assets: 1n }),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n, assets: 1n }),
          ],
        ],
      }),
    ).toThrow(ConsumerLimitViolationError);
    // A withdraw with a non-adapter onBehalf is ignored; a withdraw from a
    // non-Morpho emitter is ignored.
    expect(
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: otherMarket, onBehalf: other, assets: 999n }),
            withdraw({
              id: otherMarket,
              onBehalf: adapter,
              assets: 999n,
              emitter: notMorpho,
            }),
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      })[0]?.checkedLimits.quote,
    ).toEqual({
      penalty: 7n,
      deallocations: [{ marketId, assets: 993n }],
    });
    // The vault's penalty pull can emit a same-adapter liquidity `Withdraw`
    // between the forced withdraw and the `ForceDeallocate`; the pair is the
    // preceding withdraw of the same amount, not the penalty leg.
    expect(
      verifySlippage({
        ...input,
        logs: [
          [
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
            withdraw({ id: otherMarket, onBehalf: adapter, assets: 7n }),
            vaultWithdraw(owner),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      })[0]?.checkedLimits.quote,
    ).toEqual({
      penalty: 7n,
      deallocations: [{ marketId, assets: 993n }],
    });
    // A same-adapter withdraw in a different user call is not paired: the
    // force-deallocation stays unpaired and fails closed.
    expect(() =>
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
          ],
          [
            vaultWithdraw(owner),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      }),
    ).toThrow(SlippageCheckUnavailableError);
    // A malformed matching withdraw log is an invalid response.
    expect(() =>
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            {
              ...withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
              data: "0x12",
            },
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      }),
    ).toThrow(InvalidSimulationResponseError);
    // An unpaired ForceDeallocate (e.g. a non-Blue adapter) fails closed when
    // deallocations are quoted.
    expect(() =>
      verifySlippage({
        ...input,
        logs: [
          [
            vaultWithdraw(owner),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      }),
    ).toThrow(SlippageCheckUnavailableError);
    // The vault's own Withdraw log must evidence the exit.
    expect(() =>
      verifySlippage({
        ...input,
        logs: [
          [
            withdraw({ id: marketId, onBehalf: adapter, assets: 993n }),
            forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
          ],
        ],
      }),
    ).toThrow(SlippageCheckUnavailableError);
    // A pure idle exit: the vault Withdraw is present, no ForceDeallocate —
    // realized penalty is zero and a quoted market simply saw no deallocation.
    expect(
      verifySlippage({
        ...input,
        operations: [
          {
            limit: {
              ...forceLimit,
              quote: { penalty: 0n, deallocations: [{ marketId, assets: 1n }] },
            },
            measurements: [] as const,
          },
        ],
        logs: [[vaultWithdraw(owner)]],
      })[0]?.checkedLimits.quote,
    ).toEqual({ penalty: 0n, deallocations: [{ marketId, assets: 1n }] });
  };
  test.each(["vaultV2ForceWithdraw", "vaultV2ForceRedeem"] as const)(
    "behavior: force-exit penalty and deallocations come from event logs for %s",
    forceExitTest,
  );
  test("behavior: position bounds compare the absolute after-state", () => {
    const borrowLimit: ParsedOperationLimit = {
      type: "blueSupplyCollateralBorrow",
      marketId:
        "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
      quote: { sharesMinted: 200n },
      slippageTolerance: 0n,
      position: { maxBorrowShares: 100n, minCollateral: 5n },
    };
    const plan = planStateReads({
      operations: [{ limit: borrowLimit }],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    const label = `Limit operation 0 (${borrowLimit.type})`;
    const id = plan.operations[0]!.positionBoundsReadId!;
    const input = {
      ctx,
      logs: [] as const,
      morpho: zeroAddress,
      operations: plan.operations,
      before: new Map<string, StateValue>([
        [id, { supplyShares: 0n, borrowShares: 50n, collateral: 3n }],
      ]),
      transfers: [] as const,
      requestTransactions: [] as const,
    };
    expect(
      verifySlippage({
        ...input,
        after: new Map<string, StateValue>([
          [id, { supplyShares: 0n, borrowShares: 100n, collateral: 5n }],
        ]),
      })[0]?.checkedLimits.position,
    ).toEqual({ maxBorrowShares: 100n, minCollateral: 5n });
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map<string, StateValue>([
          [id, { supplyShares: 0n, borrowShares: 101n, collateral: 5n }],
        ]),
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(() =>
      verifySlippage({
        ...input,
        after: new Map<string, StateValue>([
          [id, { supplyShares: 0n, borrowShares: 101n, collateral: 5n }],
        ]),
      }),
    ).toThrow(
      `${label}: post-bundle position.maxBorrowShares "101" is above the maximum "100". Adjust the transaction or the bound.`,
    );
    const missingPositionPlan = planStateReads({
      operations: [
        {
          limit: { ...borrowLimit, quote: { assetsPaid: 1n } },
          assetsPaid: ethAddress,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    const missingPositionInput = {
      ...input,
      operations: missingPositionPlan.operations,
      before: new Map<string, StateValue>(),
      after: new Map<string, StateValue>(),
      transfers: [
        { token: ethAddress, from: owner, to: vault, amount: 1n, txIdx: 0 },
      ],
    };
    expect(() => verifySlippage(missingPositionInput)).toThrow(
      SlippageCheckUnavailableError,
    );
    expect(() => verifySlippage(missingPositionInput)).toThrow(
      `${label}: missing post-bundle position observation for "position"`,
    );
  });
  test("behavior: collateralSupplied is a floored minimum, collateralWithdrawn a cap", () => {
    const collateralLimit: ParsedOperationLimit = {
      type: "blueSupplyCollateral",
      marketId:
        "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
      quote: { collateralSupplied: 1000n },
      slippageTolerance: 10_000000000000000n,
    };
    const collateralOps = [
      {
        limit: collateralLimit,
        measurements: [
          {
            field: "collateralSupplied" as const,
            type: "position" as const,
            readId: "position",
            marketId: collateralLimit.marketId,
            shares: "collateral" as const,
          },
        ],
      },
    ];
    const before = new Map<string, StateValue>([
      ["position", { supplyShares: 0n, borrowShares: 0n, collateral: 100n }],
    ]);
    const input = {
      ctx,
      logs: [] as const,
      morpho: zeroAddress,
      operations: collateralOps,
      before,
      transfers: [] as const,
      requestTransactions: [] as const,
    };
    // +1100 within 1% of 1000 passes; +989 is below the floor; no change fails.
    expect(
      verifySlippage({
        ...input,
        after: new Map([
          [
            "position",
            { supplyShares: 0n, borrowShares: 0n, collateral: 1100n },
          ],
        ]),
      })[0]?.checkedLimits.quote,
    ).toEqual({ collateralSupplied: 1000n });
    for (const after_ of [989n, 100n]) {
      expect(() =>
        verifySlippage({
          ...input,
          after: new Map([
            [
              "position",
              { supplyShares: 0n, borrowShares: 0n, collateral: after_ },
            ],
          ]),
        }),
      ).toThrow(ConsumerLimitViolationError);
    }

    const withdrawLimit: ParsedOperationLimit = {
      type: "blueWithdrawCollateral",
      marketId:
        "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
      quote: { collateralWithdrawn: 1000n },
      slippageTolerance: 10_000000000000000n,
    };
    const withdrawOps = [
      {
        limit: withdrawLimit,
        measurements: [
          {
            field: "collateralWithdrawn" as const,
            type: "position" as const,
            readId: "position",
            marketId: withdrawLimit.marketId,
            shares: "collateral" as const,
          },
        ],
      },
    ];
    const withdrawBefore = new Map<string, StateValue>([
      ["position", { supplyShares: 0n, borrowShares: 0n, collateral: 2000n }],
    ]);
    // A cap: -1000 exactly passes; -1011 (989 left) is over the cap. A zero
    // withdrawal passes the cap — it is caught by the required assetsReceived
    // side instead (rejected at parse time).
    expect(
      verifySlippage({
        ctx,
        logs: [] as const,
        morpho: zeroAddress,
        operations: withdrawOps,
        before: withdrawBefore,
        after: new Map([
          [
            "position",
            { supplyShares: 0n, borrowShares: 0n, collateral: 1000n },
          ],
        ]),
        transfers: [],
        requestTransactions: [],
      })[0]?.checkedLimits.quote,
    ).toEqual({ collateralWithdrawn: 1000n });
    for (const after_ of [989n]) {
      expect(() =>
        verifySlippage({
          ctx,
          logs: [] as const,
          morpho: zeroAddress,
          operations: withdrawOps,
          before: withdrawBefore,
          after: new Map([
            [
              "position",
              { supplyShares: 0n, borrowShares: 0n, collateral: after_ },
            ],
          ]),
          transfers: [],
          requestTransactions: [],
        }),
      ).toThrow(ConsumerLimitViolationError);
    }
  });
  test("error: incoming native refund does not cover outgoing value evidence", () => {
    const nativeLimit = {
      ...limit,
      quote: { assetsPaid: 10n },
      slippageTolerance: 10_000000000000000n,
    };
    const plan = planStateReads({
      operations: [{ limit: nativeLimit, assetsPaid: ethAddress }],
      owner,
      morpho: zeroAddress,
      midnight: zeroAddress,
    });
    expect(() =>
      verifySlippage({
        ctx,
        logs: [] as const,
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map(),
        after: new Map(),
        transfers: [
          {
            token: ethAddress,
            from: receiver,
            to: owner,
            amount: 2n,
            txIdx: 0,
          },
        ],
        requestTransactions: [{ from: owner, value: 10n }],
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
});

describe("verifySlippage — Midnight collateral", () => {
  const midnight: Address = "0x0000000000000000000000000000000000000005";
  const token: Address = "0x0000000000000000000000000000000000000006";
  const marketId =
    "0x2222222222222222222222222222222222222222222222222222222222222222" as MarketId;
  const verify = (
    operationLimit: ParsedOperationLimit,
    after: { readonly spent: bigint; readonly credited: bigint },
  ) => {
    const plan = planStateReads({
      operations: [
        {
          limit: operationLimit,
          assetsPaid: token,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const [balanceId, collateralId] = plan.reads.map((read) => read.id);
    return verifySlippage({
      ctx,
      logs: [],
      morpho: zeroAddress,
      operations: plan.operations,
      before: new Map([
        [balanceId!, 10_000n],
        [collateralId!, 5n],
      ]),
      after: new Map([
        [balanceId!, 10_000n - after.spent],
        [collateralId!, 5n + after.credited],
      ]),
      transfers: [],
      requestTransactions: [],
    });
  };
  const midnightLimit: ParsedOperationLimit = {
    type: "midnightSupplyCollateral",
    marketId,
    collateralIndex: 0n,
    account: receiver,
    quote: { assetsPaid: 1_000n, collateralSupplied: 1_000n },
    slippageTolerance: 0n,
  };

  test("behavior: checks sender debit and onBehalf credit and reports the indexed subject", () => {
    expect(verify(midnightLimit, { spent: 1_000n, credited: 1_000n })).toEqual([
      {
        operation: "midnightSupplyCollateral",
        marketId,
        collateralIndex: 0n,
        account: receiver,
        receiver: owner,
        checkedLimits: { quote: midnightLimit.quote, slippageTolerance: 0n },
      },
    ]);
  });
  test("behavior: two supplies in one bundle are checked against their aggregate quote", () => {
    const aggregate = {
      ...midnightLimit,
      quote: { assetsPaid: 3_000n, collateralSupplied: 3_000n },
    };
    expect(() =>
      verify(aggregate, { spent: 3_000n, credited: 3_000n }),
    ).not.toThrow();
    // Only one of the two supplies reached the account.
    expect(() =>
      verify(aggregate, { spent: 3_000n, credited: 1_000n }),
    ).toThrow(ConsumerLimitViolationError);
  });
  test("error: collateral credited to another owner fails the economic limit", () => {
    const error = (() => {
      try {
        verify(midnightLimit, { spent: 1_000n, credited: 0n });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain(
      'Limit operation 0 (midnightSupplyCollateral): slippage for "collateralSupplied"',
    );
  });
  test("error: a short receipt or an overspend exceeds tolerance", () => {
    expect(() =>
      verify(midnightLimit, { spent: 1_000n, credited: 999n }),
    ).toThrow(ConsumerLimitViolationError);
    expect(() =>
      verify(midnightLimit, { spent: 1_001n, credited: 1_000n }),
    ).toThrow(/slippage for "assetsPaid"/);
  });
  test("error: a missing collateral observation fails closed", () => {
    const plan = planStateReads({
      operations: [
        {
          limit: midnightLimit,
          assetsPaid: token,
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const balanceId = plan.reads[0]!.id;
    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map([[balanceId, 10_000n]]),
        after: new Map([[balanceId, 9_000n]]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
});

describe("verifySlippage — Midnight redeem", () => {
  const midnight: Address = "0x0000000000000000000000000000000000000005";
  const token: Address = "0x0000000000000000000000000000000000000006";
  const onBehalf: Address = "0x0000000000000000000000000000000000000007";
  const marketId: Hex =
    "0x3333333333333333333333333333333333333333333333333333333333333333";
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
    account: onBehalf,
    receiver,
    quote: { assetsReceived: 1_234_567n, creditRedeemed: 1_234_567n },
    slippageTolerance: 0n,
  };
  // Accrued credit before the bundle (stored credit after fees and losses).
  const creditBefore = 5_000_003n;
  const verify = (
    operationLimit: ParsedOperationLimit,
    after: { readonly redeemed: bigint; readonly paid: bigint },
  ) => {
    const plan = planStateReads({
      operations: [
        { limit: operationLimit, assetsReceived: token, midnightMarket },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const [creditId, balanceId] = plan.reads.map((read) => read.id);
    return verifySlippage({
      ctx,
      logs: [],
      morpho: zeroAddress,
      operations: plan.operations,
      before: new Map([
        [creditId!, creditBefore],
        [balanceId!, 7n],
      ]),
      after: new Map([
        [creditId!, creditBefore - after.redeemed],
        [balanceId!, 7n + after.paid],
      ]),
      transfers: [],
      requestTransactions: [],
    });
  };
  const violation = (run: () => unknown): Error => {
    try {
      run();
    } catch (caught) {
      return caught as Error;
    }
    throw new Error("expected a violation");
  };

  test("behavior: checks the exact accrued credit reduction and receiver payout", () => {
    expect(
      verify(redeemLimit, { redeemed: 1_234_567n, paid: 1_234_567n }),
    ).toEqual([
      {
        operation: "midnightRedeem",
        marketId,
        account: onBehalf,
        receiver,
        checkedLimits: { quote: redeemLimit.quote, slippageTolerance: 0n },
      },
    ]);
  });
  test("error: a short payout fails assetsReceived on the receiver", () => {
    const error = violation(() =>
      verify(redeemLimit, { redeemed: 1_234_567n, paid: 1_234_566n }),
    );
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect(error.message).toContain(
      'Limit operation 0 (midnightRedeem): slippage for "assetsReceived"',
    );
  });
  test("error: a payout to another address leaves the intended receiver short", () => {
    expect(() =>
      verify(redeemLimit, { redeemed: 1_234_567n, paid: 0n }),
    ).toThrow(/slippage for "assetsReceived"/);
  });
  test("error: removing more credit than quoted fails creditRedeemed", () => {
    expect(() =>
      verify(redeemLimit, { redeemed: 1_234_568n, paid: 1_234_567n }),
    ).toThrow(/slippage for "creditRedeemed"/);
  });
  test("behavior: two redeems in one bundle are checked as one aggregate change", () => {
    const aggregate = {
      ...redeemLimit,
      quote: { assetsReceived: 2_000_001n, creditRedeemed: 2_000_001n },
    };
    expect(() =>
      verify(aggregate, { redeemed: 2_000_001n, paid: 2_000_001n }),
    ).not.toThrow();
    expect(() =>
      verify(aggregate, { redeemed: 2_000_001n, paid: 1_234_567n }),
    ).toThrow(ConsumerLimitViolationError);
  });
  test("behavior: maxCredit 0 requires the bundle to close the position", () => {
    const closing = {
      ...redeemLimit,
      quote: { assetsReceived: creditBefore, creditRedeemed: creditBefore },
      position: { maxCredit: 0n },
    };
    expect(
      verify(closing, { redeemed: creditBefore, paid: creditBefore })[0]
        ?.checkedLimits.position,
    ).toEqual({ maxCredit: 0n });
    const error = violation(() =>
      verify(
        { ...redeemLimit, position: { maxCredit: 0n } },
        { redeemed: 1_234_567n, paid: 1_234_567n },
      ),
    );
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect(error.message).toContain(
      `post-bundle position.maxCredit "${creditBefore - 1_234_567n}" is above the maximum "0"`,
    );
  });
  test("error: a missing credit observation fails closed", () => {
    const plan = planStateReads({
      operations: [
        { limit: redeemLimit, assetsReceived: token, midnightMarket },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const balanceId = plan.reads[1]!.id;
    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map([[balanceId, 0n]]),
        after: new Map([[balanceId, 1_234_567n]]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
});

describe("verifySlippage — Midnight sells", () => {
  const midnight: Address = "0x0000000000000000000000000000000000000005";
  const token: Address = "0x0000000000000000000000000000000000000006";
  const marketId =
    "0x3333333333333333333333333333333333333333333333333333333333333333" as MarketId;
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
  const borrowLimit: ParsedOperationLimit = {
    type: "midnightTakeBorrow",
    marketId,
    receiver,
    quote: { unitsSold: 25n, assetsReceived: 10n },
    slippageTolerance: 0n,
  };
  const withdrawLimit: ParsedOperationLimit = {
    type: "midnightTakeWithdraw",
    marketId,
    receiver,
    quote: { creditRedeemed: 10n, assetsReceived: 10n },
    slippageTolerance: 0n,
  };
  const runBorrow = (
    values: {
      creditBefore?: bigint;
      creditAfter?: bigint;
      debtBefore?: bigint;
      debtAfter?: bigint;
    } = {},
  ) => {
    const plan = planStateReads({
      operations: [
        { limit: borrowLimit, assetsReceived: token, midnightMarket },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const creditId = plan.reads.find(
      (read) => read.kind === "midnight.credit",
    )!.id;
    const debtId = plan.reads.find((read) => read.kind === "midnight.debt")!.id;
    const balanceId = plan.reads.find(
      (read) => read.kind === "erc20.balance",
    )!.id;
    return verifySlippage({
      ctx,
      logs: [],
      morpho: zeroAddress,
      operations: plan.operations,
      before: new Map([
        [creditId, values.creditBefore ?? 100n],
        [debtId, values.debtBefore ?? 50n],
        [balanceId, 20n],
      ]),
      after: new Map([
        [creditId, values.creditAfter ?? 75n],
        [debtId, values.debtAfter ?? 50n],
        [balanceId, 30n],
      ]),
      transfers: [],
      requestTransactions: [],
    });
  };

  test.each([
    [
      "credit-only",
      { creditBefore: 100n, creditAfter: 75n, debtBefore: 5n, debtAfter: 5n },
    ],
    [
      "debt-only",
      { creditBefore: 100n, creditAfter: 100n, debtBefore: 5n, debtAfter: 30n },
    ],
    [
      "crossing zero",
      { creditBefore: 50n, creditAfter: 0n, debtBefore: 40n, debtAfter: 10n },
    ],
  ])("behavior: computes net sold units for %s changes", (_name, values) => {
    expect(runBorrow(values)).toHaveLength(1);
  });

  test.each([
    [
      "debt-only overrun",
      { creditBefore: 100n, creditAfter: 100n, debtBefore: 5n, debtAfter: 31n },
    ],
    [
      "credit-to-debt overrun",
      { creditBefore: 50n, creditAfter: 0n, debtBefore: 40n, debtAfter: 66n },
    ],
  ])("error: rejects %s against the unitsSold quote", (_name, values) => {
    const verify = () => runBorrow(values);
    expect(verify).toThrow(ConsumerLimitViolationError);
    expect(verify).toThrow("unitsSold");
  });

  test("error: missing credit or debt observations fail closed", () => {
    const plan = planStateReads({
      operations: [
        { limit: borrowLimit, assetsReceived: token, midnightMarket },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const balanceId = plan.reads.find(
      (read) => read.kind === "erc20.balance",
    )!.id;
    const creditId = plan.reads.find(
      (read) => read.kind === "midnight.credit",
    )!.id;
    const debtId = plan.reads.find((read) => read.kind === "midnight.debt")!.id;
    const input = {
      ctx,
      logs: [],
      morpho: zeroAddress,
      operations: plan.operations,
      transfers: [],
      requestTransactions: [],
    } as const;
    expect(() =>
      verifySlippage({
        ...input,
        before: new Map([
          [debtId, 0n],
          [balanceId, 0n],
        ]),
        after: new Map([
          [debtId, 0n],
          [balanceId, 10n],
        ]),
      }),
    ).toThrow(SlippageCheckUnavailableError);
    expect(() =>
      verifySlippage({
        ...input,
        before: new Map([
          [creditId, 0n],
          [balanceId, 0n],
        ]),
        after: new Map([
          [creditId, 0n],
          [balanceId, 10n],
        ]),
      }),
    ).toThrow(SlippageCheckUnavailableError);

    const withdrawPlan = planStateReads({
      operations: [
        { limit: withdrawLimit, assetsReceived: token, midnightMarket },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const withdrawCreditId = withdrawPlan.reads.find(
      (read) => read.kind === "midnight.credit",
    )!.id;
    const withdrawBalanceId = withdrawPlan.reads.find(
      (read) => read.kind === "erc20.balance",
    )!.id;
    expect(() =>
      verifySlippage({
        ...input,
        operations: withdrawPlan.operations,
        before: new Map([
          [withdrawCreditId, 10n],
          [withdrawBalanceId, 0n],
        ]),
        after: new Map([
          [withdrawCreditId, 0n],
          [withdrawBalanceId, 10n],
        ]),
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("behavior: combined collateral and loan-token pulls use one net bound with native funding", () => {
    const combinedLimit: ParsedOperationLimit = {
      type: "midnightSupplyCollateralTakeBorrow",
      marketId,
      receiver: owner,
      quote: {
        collateralSupplies: [{ collateralIndex: 0n, assets: 30n }],
        unitsSold: 10n,
        assetsReceived: 20n,
      },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [
        {
          limit: combinedLimit,
          assetsReceived: token,
          midnightMarket,
          midnightCollateralTokens: [{ collateralIndex: 0n, token }],
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
      wNative: token,
      nativeValue: 5n,
    });
    expect(plan.operations[0]?.walletBounds).toHaveLength(1);
    expect(plan.operations[0]?.walletBounds?.[0]).toMatchObject({
      token,
      account: owner,
      maxPulls: 25n,
      minProceeds: 20n,
    });
    expect(
      plan.reads.filter((read) => read.kind === "erc20.balance"),
    ).toHaveLength(1);
    const collateralReadId =
      plan.operations[0]?.collateralSupplyReads?.[0]?.readId;
    const balanceReadId = plan.operations[0]?.walletBounds?.[0]?.readId;
    const creditReadId = plan.reads.find(
      (read) => read.kind === "midnight.credit",
    )?.id;
    const debtReadId = plan.reads.find(
      (read) => read.kind === "midnight.debt",
    )?.id;
    expect(
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map([
          [collateralReadId!, 0n],
          [balanceReadId!, 100n],
          [creditReadId!, 100n],
          [debtReadId!, 20n],
        ]),
        after: new Map([
          [collateralReadId!, 30n],
          [balanceReadId!, 95n],
          [creditReadId!, 90n],
          [debtReadId!, 20n],
        ]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toHaveLength(1);
  });

  test("error: wNative debit violates a zero-pull bound after native funding", () => {
    const wNativeToken: Address = "0x0000000000000000000000000000000000000009";
    const combinedLimit: ParsedOperationLimit = {
      type: "midnightSupplyCollateralTakeBorrow",
      marketId,
      receiver: owner,
      quote: {
        collateralSupplies: [{ collateralIndex: 0n, assets: 30n }],
        unitsSold: 10n,
        assetsReceived: 20n,
      },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [
        {
          limit: combinedLimit,
          assetsReceived: token,
          midnightMarket,
          midnightCollateralTokens: [
            { collateralIndex: 0n, token: wNativeToken },
          ],
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
      wNative: wNativeToken,
      nativeValue: 30n,
    });
    const wNativeReadId = plan.operations[0]?.walletBounds?.find(
      (bound) => bound.token === wNativeToken,
    )?.readId;
    const proceedsReadId = plan.operations[0]?.walletBounds?.find(
      (bound) => bound.token === token,
    )?.readId;
    const collateralReadId =
      plan.operations[0]?.collateralSupplyReads?.[0]?.readId;
    const creditReadId = plan.reads.find(
      (read) => read.kind === "midnight.credit",
    )?.id;
    const debtReadId = plan.reads.find(
      (read) => read.kind === "midnight.debt",
    )?.id;

    expect(
      plan.operations[0]?.walletBounds?.find(
        (bound) => bound.token === wNativeToken,
      ),
    ).toMatchObject({ maxPulls: 0n, minProceeds: 0n });
    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map([
          [wNativeReadId!, 100n],
          [proceedsReadId!, 100n],
          [collateralReadId!, 0n],
          [creditReadId!, 100n],
          [debtReadId!, 20n],
        ]),
        after: new Map([
          [wNativeReadId!, 99n],
          [proceedsReadId!, 120n],
          [collateralReadId!, 30n],
          [creditReadId!, 90n],
          [debtReadId!, 20n],
        ]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrowError(ConsumerLimitViolationError);
  });

  test.each([
    ["short proceeds", 94n],
    ["excess spend", 93n],
  ] as const)("error: combined limits reject %s", (_scenario, walletAfter) => {
    const combinedLimit: ParsedOperationLimit = {
      type: "midnightSupplyCollateralTakeBorrow",
      marketId,
      receiver: owner,
      quote: {
        collateralSupplies: [{ collateralIndex: 0n, assets: 30n }],
        unitsSold: 10n,
        assetsReceived: 20n,
      },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [
        {
          limit: combinedLimit,
          assetsReceived: token,
          midnightMarket,
          midnightCollateralTokens: [{ collateralIndex: 0n, token }],
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
      wNative: token,
      nativeValue: 5n,
    });
    const collateralReadId =
      plan.operations[0]?.collateralSupplyReads?.[0]?.readId;
    const balanceReadId = plan.operations[0]?.walletBounds?.[0]?.readId;
    const creditReadId = plan.reads.find(
      (read) => read.kind === "midnight.credit",
    )?.id;
    const debtReadId = plan.reads.find(
      (read) => read.kind === "midnight.debt",
    )?.id;
    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map([
          [collateralReadId!, 0n],
          [balanceReadId!, 100n],
          [creditReadId!, 100n],
          [debtReadId!, 20n],
        ]),
        after: new Map([
          [collateralReadId!, 30n],
          [balanceReadId!, walletAfter],
          [creditReadId!, 90n],
          [debtReadId!, 20n],
        ]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrowError(ConsumerLimitViolationError);
  });

  const tolerance = MathLib.WAD / 10n;
  const minimumNetChange = MathLib.wMulUp(20n, MathLib.WAD - tolerance) - 30n;

  test.each([
    [
      "at the minimum net change",
      { walletAfter: 100n + minimumNetChange, shouldThrow: false },
    ],
    [
      "one unit below the minimum",
      { walletAfter: 100n + minimumNetChange - 1n, shouldThrow: true },
    ],
  ] as const)(
    "behavior: combined same-token wallet bound handles %s",
    (_scenario, { walletAfter, shouldThrow }) => {
      const combinedLimit: ParsedOperationLimit = {
        type: "midnightSupplyCollateralTakeBorrow",
        marketId,
        receiver: owner,
        quote: {
          collateralSupplies: [{ collateralIndex: 0n, assets: 30n }],
          unitsSold: 10n,
          assetsReceived: 20n,
        },
        slippageTolerance: tolerance,
      };
      const plan = planStateReads({
        operations: [
          {
            limit: combinedLimit,
            assetsReceived: token,
            midnightMarket,
            midnightCollateralTokens: [{ collateralIndex: 0n, token }],
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      });
      const collateralReadId =
        plan.operations[0]?.collateralSupplyReads?.[0]?.readId;
      const balanceReadId = plan.operations[0]?.walletBounds?.[0]?.readId;
      const creditReadId = plan.reads.find(
        (read) => read.kind === "midnight.credit",
      )?.id;
      const debtReadId = plan.reads.find(
        (read) => read.kind === "midnight.debt",
      )?.id;
      const verify = () =>
        verifySlippage({
          ctx,
          logs: [],
          morpho: zeroAddress,
          operations: plan.operations,
          before: new Map([
            [collateralReadId!, 0n],
            [balanceReadId!, 100n],
            [creditReadId!, 100n],
            [debtReadId!, 20n],
          ]),
          after: new Map([
            [collateralReadId!, 30n],
            [balanceReadId!, walletAfter],
            [creditReadId!, 90n],
            [debtReadId!, 20n],
          ]),
          transfers: [],
          requestTransactions: [],
        });
      if (shouldThrow) expect(verify).toThrowError(ConsumerLimitViolationError);
      else expect(verify).not.toThrow();
    },
  );

  test("error: tolerance does not widen a distinct collateral pull cap", () => {
    const distinctTokenTolerance = MathLib.WAD / 10n;
    const combinedLimit: ParsedOperationLimit = {
      type: "midnightSupplyCollateralTakeBorrow",
      marketId,
      receiver: owner,
      quote: {
        collateralSupplies: [{ collateralIndex: 0n, assets: 30n }],
        unitsSold: 10n,
        assetsReceived: 20n,
      },
      slippageTolerance: distinctTokenTolerance,
    };
    const plan = planStateReads({
      operations: [
        {
          limit: combinedLimit,
          assetsReceived: token,
          midnightMarket,
          midnightCollateralTokens: [{ collateralIndex: 0n, token: vault }],
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const collateralReadId =
      plan.operations[0]?.collateralSupplyReads?.[0]?.readId;
    const collateralBalanceReadId = plan.operations[0]?.walletBounds?.find(
      (bound) => bound.token === vault,
    )?.readId;
    const proceedsReadId = plan.operations[0]?.walletBounds?.find(
      (bound) => bound.token === token,
    )?.readId;
    const creditReadId = plan.reads.find(
      (read) => read.kind === "midnight.credit",
    )?.id;
    const debtReadId = plan.reads.find(
      (read) => read.kind === "midnight.debt",
    )?.id;
    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map([
          [collateralReadId!, 0n],
          [collateralBalanceReadId!, 100n],
          [proceedsReadId!, 100n],
          [creditReadId!, 100n],
          [debtReadId!, 20n],
        ]),
        after: new Map([
          [collateralReadId!, 30n],
          [collateralBalanceReadId!, 69n],
          [proceedsReadId!, 120n],
          [creditReadId!, 90n],
          [debtReadId!, 20n],
        ]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrowError(ConsumerLimitViolationError);
  });

  test("error: combined limits reject a unitsSold overrun", () => {
    const combinedLimit: ParsedOperationLimit = {
      type: "midnightSupplyCollateralTakeBorrow",
      marketId,
      receiver: owner,
      quote: {
        collateralSupplies: [{ collateralIndex: 0n, assets: 30n }],
        unitsSold: 10n,
        assetsReceived: 20n,
      },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [
        {
          limit: combinedLimit,
          assetsReceived: token,
          midnightMarket,
          midnightCollateralTokens: [{ collateralIndex: 0n, token }],
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const collateralReadId =
      plan.operations[0]?.collateralSupplyReads?.[0]?.readId;
    const balanceReadId = plan.operations[0]?.walletBounds?.[0]?.readId;
    const creditReadId = plan.reads.find(
      (read) => read.kind === "midnight.credit",
    )?.id;
    const debtReadId = plan.reads.find(
      (read) => read.kind === "midnight.debt",
    )?.id;
    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map([
          [collateralReadId!, 0n],
          [balanceReadId!, 100n],
          [creditReadId!, 100n],
          [debtReadId!, 20n],
        ]),
        after: new Map([
          [collateralReadId!, 30n],
          [balanceReadId!, 100n],
          [creditReadId!, 85n],
          [debtReadId!, 20n],
        ]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrowError(ConsumerLimitViolationError);
  });

  test.each(["undefined", "empty"] as const)(
    "error: combined limits fail closed when wallet bounds are %s",
    (kind) => {
      const combinedLimit: ParsedOperationLimit = {
        type: "midnightSupplyCollateralTakeBorrow",
        marketId,
        receiver: owner,
        quote: {
          collateralSupplies: [{ collateralIndex: 0n, assets: 30n }],
          unitsSold: 10n,
          assetsReceived: 20n,
        },
        slippageTolerance: 0n,
      };
      const plan = planStateReads({
        operations: [
          {
            limit: combinedLimit,
            assetsReceived: token,
            midnightMarket,
            midnightCollateralTokens: [{ collateralIndex: 0n, token }],
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      });
      const plannedOperation = plan.operations[0]!;
      const operationWithoutWalletBounds =
        kind === "empty"
          ? { ...plannedOperation, walletBounds: [] }
          : (() => {
              const { walletBounds, ...operation } = plannedOperation;
              expect(walletBounds).toBeDefined();
              return operation;
            })();
      const state = new Map(plan.reads.map(({ id }) => [id, 100n] as const));
      expect(() =>
        verifySlippage({
          ctx,
          logs: [],
          morpho: zeroAddress,
          operations: [operationWithoutWalletBounds],
          before: state,
          after: state,
          transfers: [],
          requestTransactions: [],
        }),
      ).toThrow(SlippageCheckUnavailableError);
    },
  );

  test.each(["undefined", "empty"] as const)(
    "error: combined limits fail closed when collateral supplies are %s",
    (kind) => {
      const combinedLimit = {
        type: "midnightSupplyCollateralTakeBorrow",
        marketId,
        receiver: owner,
        quote: {
          collateralSupplies: [{ collateralIndex: 0n, assets: 30n }],
          unitsSold: 10n,
          assetsReceived: 20n,
        },
        slippageTolerance: 0n,
      } satisfies ParsedOperationLimit;
      const plan = planStateReads({
        operations: [
          {
            limit: combinedLimit,
            assetsReceived: token,
            midnightMarket,
            midnightCollateralTokens: [{ collateralIndex: 0n, token }],
          },
        ],
        owner,
        morpho: zeroAddress,
        midnight,
      });
      const quote =
        kind === "empty"
          ? { ...combinedLimit.quote, collateralSupplies: [] }
          : (() => {
              const { collateralSupplies, ...remainingQuote } =
                combinedLimit.quote;
              expect(collateralSupplies).toBeDefined();
              return remainingQuote;
            })();
      const plannedOperation = plan.operations[0]!;
      const state = new Map(plan.reads.map(({ id }) => [id, 100n] as const));
      expect(() =>
        verifySlippage({
          ctx,
          logs: [],
          morpho: zeroAddress,
          operations: [
            { ...plannedOperation, limit: { ...combinedLimit, quote } },
          ],
          before: state,
          after: state,
          transfers: [],
          requestTransactions: [],
        }),
      ).toThrow(SlippageCheckUnavailableError);
    },
  );

  test("error: combined limits fail closed when collateral evidence is missing", () => {
    const combinedLimit: ParsedOperationLimit = {
      type: "midnightSupplyCollateralTakeBorrow",
      marketId,
      receiver: owner,
      quote: {
        collateralSupplies: [{ collateralIndex: 0n, assets: 30n }],
        unitsSold: 10n,
        assetsReceived: 20n,
      },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [
        {
          limit: combinedLimit,
          assetsReceived: token,
          midnightMarket,
          midnightCollateralTokens: [{ collateralIndex: 0n, token }],
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map(),
        after: new Map(),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("error: combined limits fail closed when wallet evidence is missing", () => {
    const combinedLimit: ParsedOperationLimit = {
      type: "midnightSupplyCollateralTakeBorrow",
      marketId,
      receiver: owner,
      quote: {
        collateralSupplies: [{ collateralIndex: 0n, assets: 30n }],
        unitsSold: 10n,
        assetsReceived: 20n,
      },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [
        {
          limit: combinedLimit,
          assetsReceived: token,
          midnightMarket,
          midnightCollateralTokens: [{ collateralIndex: 0n, token }],
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const collateralReadId =
      plan.operations[0]?.collateralSupplyReads?.[0]?.readId;
    const creditReadId = plan.reads.find(
      (read) => read.kind === "midnight.credit",
    )?.id;
    const debtReadId = plan.reads.find(
      (read) => read.kind === "midnight.debt",
    )?.id;
    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map([
          [collateralReadId!, 0n],
          [creditReadId!, 100n],
          [debtReadId!, 20n],
        ]),
        after: new Map([
          [collateralReadId!, 30n],
          [creditReadId!, 90n],
          [debtReadId!, 20n],
        ]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("error: combined limits reject collateral credit below the exact quote", () => {
    const combinedLimit: ParsedOperationLimit = {
      type: "midnightSupplyCollateralTakeBorrow",
      marketId,
      receiver: owner,
      quote: {
        collateralSupplies: [{ collateralIndex: 0n, assets: 30n }],
        unitsSold: 10n,
        assetsReceived: 20n,
      },
      slippageTolerance: 500_000000000000000n,
    };
    const plan = planStateReads({
      operations: [
        {
          limit: combinedLimit,
          assetsReceived: token,
          midnightMarket,
          midnightCollateralTokens: [{ collateralIndex: 0n, token }],
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const collateralReadId =
      plan.operations[0]?.collateralSupplyReads?.[0]?.readId;
    const creditReadId = plan.reads.find(
      (read) => read.kind === "midnight.credit",
    )?.id;
    const debtReadId = plan.reads.find(
      (read) => read.kind === "midnight.debt",
    )?.id;
    const walletReadId = plan.operations[0]?.walletBounds?.[0]?.readId;
    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map([
          [collateralReadId!, 0n],
          [creditReadId!, 100n],
          [debtReadId!, 20n],
          [walletReadId!, 100n],
        ]),
        after: new Map([
          [collateralReadId!, 20n],
          [creditReadId!, 90n],
          [debtReadId!, 20n],
          [walletReadId!, 90n],
        ]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrow(ConsumerLimitViolationError);
  });

  test("error: combined limits fail closed when only collateral evidence is missing", () => {
    const combinedLimit: ParsedOperationLimit = {
      type: "midnightSupplyCollateralTakeBorrow",
      marketId,
      receiver: owner,
      quote: {
        collateralSupplies: [{ collateralIndex: 0n, assets: 30n }],
        unitsSold: 10n,
        assetsReceived: 20n,
      },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [
        {
          limit: combinedLimit,
          assetsReceived: token,
          midnightMarket,
          midnightCollateralTokens: [{ collateralIndex: 0n, token }],
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const collateralReadId =
      plan.operations[0]?.collateralSupplyReads?.[0]?.readId;
    const creditReadId = plan.reads.find(
      (read) => read.kind === "midnight.credit",
    )?.id;
    const debtReadId = plan.reads.find(
      (read) => read.kind === "midnight.debt",
    )?.id;
    const walletReadId = plan.operations[0]?.walletBounds?.[0]?.readId;
    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map([
          [creditReadId!, 100n],
          [debtReadId!, 20n],
          [walletReadId!, 100n],
        ]),
        after: new Map([
          [creditReadId!, 90n],
          [debtReadId!, 20n],
          [walletReadId!, 90n],
        ]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrow(SlippageCheckUnavailableError);
    expect(collateralReadId).toBeDefined();
  });

  test("error: reduce-only sell rejects any bundle debt change", () => {
    const plan = planStateReads({
      operations: [
        { limit: withdrawLimit, assetsReceived: token, midnightMarket },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const creditId = plan.reads.find(
      (read) => read.kind === "midnight.credit",
    )!.id;
    const debtId = plan.reads.find((read) => read.kind === "midnight.debt")!.id;
    const error = (() => {
      try {
        verifySlippage({
          ctx,
          logs: [],
          morpho: zeroAddress,
          operations: plan.operations,
          before: new Map([
            [creditId, 100n],
            [debtId, 20n],
          ]),
          after: new Map([
            [creditId, 90n],
            [debtId, 21n],
          ]),
          transfers: [],
          requestTransactions: [],
        });
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain(
      "Limit operation 0 (midnightTakeWithdraw)",
    );
    expect((error as Error).message).toContain("debt changed");
    expect((error as Error).message).not.toMatch(/transaction \d+/);
  });
});
describe("verifySlippage — Midnight buys", () => {
  const midnight: Address = "0x0000000000000000000000000000000000000005";
  const token: Address = "0x0000000000000000000000000000000000000006";
  const marketId =
    "0x4444444444444444444444444444444444444444444444444444444444444444" as MarketId;
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
  const buyLimit: ParsedOperationLimit = {
    type: "midnightTakeLend",
    marketId,
    quote: { assetsPaid: 10n, unitsBought: 25n },
    slippageTolerance: 0n,
  };
  const plan = planStateReads({
    operations: [{ limit: buyLimit, assetsPaid: token, midnightMarket }],
    owner,
    morpho: zeroAddress,
    midnight,
  });
  const creditId = plan.reads.find(
    (read) => read.kind === "midnight.credit",
  )!.id;
  const debtId = plan.reads.find((read) => read.kind === "midnight.debt")!.id;
  const balanceId = plan.reads.find(
    (read) => read.kind === "erc20.balance",
  )!.id;
  const verify = ({
    creditAfter = 125n,
    debtAfter = 50n,
    balanceAfter = 10n,
  }: {
    creditAfter?: bigint;
    debtAfter?: bigint;
    balanceAfter?: bigint;
  } = {}) =>
    verifySlippage({
      ctx,
      logs: [],
      morpho: zeroAddress,
      operations: plan.operations,
      before: new Map([
        [creditId, 100n],
        [debtId, 50n],
        [balanceId, 20n],
      ]),
      after: new Map([
        [creditId, creditAfter],
        [debtId, debtAfter],
        [balanceId, balanceAfter],
      ]),
      transfers: [],
      requestTransactions: [],
    });

  test("behavior: verifies the minimum net position increase and spend cap", () => {
    expect(verify()[0]).toMatchObject({
      operation: "midnightTakeLend",
      marketId,
      account: owner,
    });
  });
  test("error: fewer net units bought than quoted violates the buy subject", () => {
    expect(() => verify({ creditAfter: 124n })).toThrow(
      ConsumerLimitViolationError,
    );
    expect(() => verify({ creditAfter: 124n })).toThrow(
      "Limit operation 0 (midnightTakeLend): slippage for",
    );
  });
  test("error: spending over assetsPaid violates the spend cap", () => {
    expect(() => verify({ balanceAfter: 9n })).toThrow(
      ConsumerLimitViolationError,
    );
    expect(() => verify({ balanceAfter: 9n })).toThrow("assetsPaid");
  });
  test("error: missing net-position observations fail closed", () => {
    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before: new Map([
          [balanceId, 20n],
          [debtId, 50n],
        ]),
        after: new Map([
          [balanceId, 10n],
          [debtId, 50n],
        ]),
        transfers: [],
        requestTransactions: [],
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
});
describe("verifySlippage — Midnight repay-withdraw", () => {
  const midnight: Address = "0x0000000000000000000000000000000000000005";
  const token: Address = "0x0000000000000000000000000000000000000006";
  const collateralToken: Address = "0x0000000000000000000000000000000000000009";
  const marketId =
    "0x3333333333333333333333333333333333333333333333333333333333333333" as MarketId;
  const midnightMarket = {
    chainId: 8453n,
    midnight,
    loanToken: token,
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
  const quote = {
    assetsPaid: 10n,
    debtRepaid: 10n,
    collateralWithdrawals: [{ collateralIndex: 0n, assets: 20n }],
  };
  const midnightLimit: ParsedRepayWithdrawLimit = {
    type: "midnightRepayWithdrawCollateral",
    marketId,
    receiver,
    quote,
    slippageTolerance: 0n,
  };
  const withdrawOnlyLimit: ParsedRepayWithdrawLimit = {
    ...midnightLimit,
    quote: {
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 20n }],
    },
  };
  const run = (
    operationLimit: ParsedOperationLimit = midnightLimit,
    changes: {
      readonly debtAfter?: bigint;
      readonly creditAfter?: bigint;
      readonly collateralBefore?: bigint;
      readonly collateralAfter?: bigint;
      readonly receiverBefore?: bigint;
      readonly receiverAfter?: bigint;
      readonly paymentAfter?: bigint;
      readonly missing?:
        | "debt"
        | "credit"
        | "collateral"
        | "receiver"
        | "payment";
    } = {},
  ) => {
    const plan = planStateReads({
      operations: [
        {
          limit: operationLimit,
          assetsPaid: token,
          midnightMarket,
          midnightCollateralTokens: [
            { collateralIndex: 0n, token: collateralToken },
          ],
        },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
    });
    const before = new Map<string, bigint>();
    const after = new Map<string, bigint>();
    for (const read of plan.reads) {
      if (read.kind === "midnight.debt") {
        before.set(read.id, 100n);
        after.set(read.id, changes.debtAfter ?? 90n);
      } else if (read.kind === "midnight.credit") {
        before.set(read.id, 50n);
        after.set(read.id, changes.creditAfter ?? 50n);
      } else if (read.kind === "midnight.collateral") {
        before.set(read.id, changes.collateralBefore ?? 40n);
        after.set(read.id, changes.collateralAfter ?? 20n);
      } else if (read.kind === "erc20.balance" && read.token === token) {
        before.set(read.id, 100n);
        after.set(read.id, changes.paymentAfter ?? 90n);
      } else {
        before.set(read.id, changes.receiverBefore ?? 0n);
        after.set(read.id, changes.receiverAfter ?? 20n);
      }
    }
    if (changes.missing !== undefined) {
      const missingRead = plan.reads.find((read) => {
        if (changes.missing === "debt") return read.kind === "midnight.debt";
        if (changes.missing === "credit")
          return read.kind === "midnight.credit";
        if (changes.missing === "collateral")
          return read.kind === "midnight.collateral";
        if (changes.missing === "receiver")
          return (
            read.kind === "erc20.balance" && read.token === collateralToken
          );
        return read.kind === "erc20.balance" && read.token === token;
      });
      if (missingRead !== undefined) after.delete(missingRead.id);
    }
    return verifySlippage({
      ctx,
      logs: [],
      morpho: zeroAddress,
      operations: plan.operations,
      before,
      after,
      transfers: [],
      requestTransactions: [],
    });
  };

  test("behavior: checks repayment, debt reduction, collateral reduction, and receiver delivery", () => {
    expect(run()).toMatchObject([
      {
        operation: "midnightRepayWithdrawCollateral",
        checkedLimits: { quote, slippageTolerance: 0n },
      },
    ]);
  });

  test("error: withdraw-only repayment cannot increase sender debt", () => {
    expect(() => run(withdrawOnlyLimit, { debtAfter: 101n })).toThrowError(
      new ConsumerLimitViolationError(
        'Limit operation 0 (midnightRepayWithdrawCollateral): Midnight debt increased from "100" to "101"; a repay-withdraw without a debtRepaid quote must not increase debt. Remove the debt-increasing transaction from the bundle.',
      ),
    );
  });

  test("behavior: full repayment without a debtRepaid quote cannot increase sender debt", () => {
    const fullRepayLimit: ParsedRepayWithdrawLimit = {
      ...midnightLimit,
      quote: { assetsPaid: 100n },
      position: { maxDebt: 0n },
    };
    expect(() => run(fullRepayLimit, { debtAfter: 150n })).toThrowError(
      new ConsumerLimitViolationError(
        'Limit operation 0 (midnightRepayWithdrawCollateral): Midnight debt increased from "100" to "150"; a repay-withdraw without a debtRepaid quote must not increase debt. Remove the debt-increasing transaction from the bundle.',
      ),
    );
  });

  test("behavior: take repayment without a debtRepaid quote cannot increase sender debt", () => {
    const takeRepayLimit: ParsedRepayWithdrawLimit = {
      ...midnightLimit,
      type: "midnightTakeRepayWithdrawCollateral",
      quote: { assetsPaid: 100n },
      position: { maxDebt: 200n },
    };
    expect(() => run(takeRepayLimit, { debtAfter: 150n })).toThrowError(
      new ConsumerLimitViolationError(
        'Limit operation 0 (midnightTakeRepayWithdrawCollateral): Midnight debt increased from "100" to "150"; a repay-withdraw without a debtRepaid quote must not increase debt. Remove the debt-increasing transaction from the bundle.',
      ),
    );
  });

  test("behavior: withdraw-only repayment allows unchanged or decreased debt", () => {
    expect(run(withdrawOnlyLimit, { debtAfter: 100n })).toHaveLength(1);
    expect(run(withdrawOnlyLimit, { debtAfter: 90n })).toHaveLength(1);
  });

  test("error: withdraw-only repayment without a debt observation fails closed", () => {
    expect(() => run(withdrawOnlyLimit, { missing: "debt" })).toThrow(
      SlippageCheckUnavailableError,
    );
  });

  test("error: debt reduction below the quote fails the whole-bundle minimum", () => {
    expect(() => run(midnightLimit, { debtAfter: 91n })).toThrow(
      /Limit operation 0 \(midnightRepayWithdrawCollateral\).*debtRepaid/,
    );
  });

  test("error: a residual final debt violates maxDebt zero after repayment", () => {
    const fullRepay: ParsedRepayWithdrawLimit = {
      ...midnightLimit,
      quote: { assetsPaid: 100n },
      position: { maxDebt: 0n },
    };
    expect(() => run(fullRepay, { debtAfter: 1n, paymentAfter: 0n })).toThrow(
      /post-bundle position\.maxDebt/,
    );
  });

  test("error: missing final debt observation for full repayment fails closed", () => {
    const fullRepay: ParsedRepayWithdrawLimit = {
      ...midnightLimit,
      quote: { assetsPaid: 100n },
      position: { maxDebt: 0n },
    };
    const runWithMissingDebt = () => run(fullRepay, { missing: "debt" });
    expect(runWithMissingDebt).toThrow(SlippageCheckUnavailableError);
    expect(runWithMissingDebt).toThrow(/missing observation for Midnight debt/);
  });

  test("behavior: exact collateral tolerance cap and minimum pass", () => {
    const tolerantLimit: ParsedOperationLimit = {
      ...midnightLimit,
      quote: {
        ...quote,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 10_000n }],
      },
      slippageTolerance: 10_000_000_000_000_000n,
    };

    expect(
      run(tolerantLimit, {
        collateralBefore: 20_000n,
        collateralAfter: 9_900n,
        receiverAfter: 9_900n,
      }),
    ).toHaveLength(1);
  });

  test.each([
    {
      name: "position decrease above the cap",
      changes: { collateralBefore: 20_000n, collateralAfter: 9_899n },
    },
    {
      name: "receiver delivery below the minimum",
      changes: {
        collateralBefore: 20_000n,
        collateralAfter: 9_900n,
        receiverAfter: 9_899n,
      },
    },
  ])("error: rejects $name beyond the 1% tolerance", ({ changes }) => {
    const tolerantLimit: ParsedOperationLimit = {
      ...midnightLimit,
      quote: {
        ...quote,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 10_000n }],
      },
      slippageTolerance: 10_000_000_000_000_000n,
    };

    expect(() => run(tolerantLimit, changes)).toThrow(
      ConsumerLimitViolationError,
    );
  });

  test("behavior: native-funded wNative repayment counts ETH and net wNative", () => {
    const wNative: Address = "0x000000000000000000000000000000000000000A";
    const operationLimit: ParsedOperationLimit = {
      ...midnightLimit,
      quote: { assetsPaid: 100n, debtRepaid: 100n },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [
        { limit: operationLimit, assetsPaid: wNative, midnightMarket },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
      wNative,
    });
    const before = new Map<string, bigint>();
    const after = new Map<string, bigint>();
    for (const read of plan.reads) {
      if (read.kind === "midnight.debt") {
        before.set(read.id, 100n);
        after.set(read.id, 0n);
      } else if (read.kind === "midnight.credit") {
        before.set(read.id, 50n);
        after.set(read.id, 50n);
      } else {
        before.set(read.id, 1_000n);
        after.set(read.id, 1_000n);
      }
    }
    expect(
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before,
        after,
        transfers: [
          {
            token: ethAddress,
            from: owner,
            to: zeroAddress,
            amount: 100n,
            txIdx: 0,
          },
        ],
        requestTransactions: [],
      }),
    ).toHaveLength(1);
  });

  test("error: missing wNative repayment observation fails closed", () => {
    const wNative: Address = "0x000000000000000000000000000000000000000A";
    const operationLimit: ParsedOperationLimit = {
      ...midnightLimit,
      quote: { assetsPaid: 100n, debtRepaid: 100n },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [
        { limit: operationLimit, assetsPaid: wNative, midnightMarket },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
      wNative,
    });
    const before = new Map<string, bigint>();
    const after = new Map<string, bigint>();
    for (const read of plan.reads) {
      if (read.kind === "midnight.debt") {
        before.set(read.id, 100n);
        after.set(read.id, 0n);
      } else if (read.kind === "midnight.credit") {
        before.set(read.id, 50n);
        after.set(read.id, 50n);
      } else {
        before.set(read.id, 1_000n);
        after.set(read.id, 900n);
      }
    }
    const wNativeRead = plan.reads.find(
      (read) => read.kind === "erc20.balance" && read.token === wNative,
    );
    expect(wNativeRead).toBeDefined();
    before.delete(wNativeRead!.id);

    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before,
        after,
        transfers: [
          {
            token: ethAddress,
            from: owner,
            to: zeroAddress,
            amount: 100n,
            txIdx: 0,
          },
        ],
        requestTransactions: [],
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("error: wNative plus native repayment above the quote violates the cap", () => {
    const wNative: Address = "0x000000000000000000000000000000000000000A";
    const operationLimit: ParsedOperationLimit = {
      ...midnightLimit,
      quote: { assetsPaid: 100n, debtRepaid: 100n },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [
        { limit: operationLimit, assetsPaid: wNative, midnightMarket },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
      wNative,
    });
    const before = new Map<string, bigint>();
    const after = new Map<string, bigint>();
    for (const read of plan.reads) {
      if (read.kind === "midnight.debt") {
        before.set(read.id, 100n);
        after.set(read.id, 0n);
      } else if (read.kind === "midnight.credit") {
        before.set(read.id, 50n);
        after.set(read.id, 50n);
      } else {
        before.set(read.id, 1_000n);
        after.set(read.id, 939n);
      }
    }
    expect(() =>
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before,
        after,
        transfers: [
          {
            token: ethAddress,
            from: owner,
            to: zeroAddress,
            amount: 40n,
            txIdx: 0,
          },
        ],
        requestTransactions: [],
      }),
    ).toThrow(ConsumerLimitViolationError);
  });

  test("behavior: non-wNative repayment remains ERC-20-only", () => {
    const wNative: Address = "0x000000000000000000000000000000000000000A";
    const operationLimit: ParsedOperationLimit = {
      ...midnightLimit,
      quote: { assetsPaid: 100n, debtRepaid: 100n },
      slippageTolerance: 0n,
    };
    const plan = planStateReads({
      operations: [
        { limit: operationLimit, assetsPaid: token, midnightMarket },
      ],
      owner,
      morpho: zeroAddress,
      midnight,
      wNative,
    });
    expect(plan.operations[0]?.measurements).toContainEqual(
      expect.objectContaining({ field: "assetsPaid", type: "balance" }),
    );
    const before = new Map<string, bigint>();
    const after = new Map<string, bigint>();
    for (const read of plan.reads) {
      if (read.kind === "midnight.debt") {
        before.set(read.id, 100n);
        after.set(read.id, 0n);
      } else if (read.kind === "midnight.credit") {
        before.set(read.id, 50n);
        after.set(read.id, 50n);
      } else {
        before.set(read.id, 1_000n);
        after.set(read.id, 900n);
      }
    }
    expect(
      verifySlippage({
        ctx,
        logs: [],
        morpho: zeroAddress,
        operations: plan.operations,
        before,
        after,
        transfers: [],
        requestTransactions: [],
      }),
    ).toHaveLength(1);
  });

  test("error: later debt increase in the bundle violates the final debt bound", () => {
    const fullRepay: ParsedRepayWithdrawLimit = {
      ...midnightLimit,
      quote: { assetsPaid: 100n },
      position: { maxDebt: 0n },
    };
    expect(() => run(fullRepay, { debtAfter: 5n, paymentAfter: 0n })).toThrow(
      /post-bundle position\.maxDebt/,
    );
  });

  test("error: withdraw-all requires an empty final collateral position", () => {
    const withdrawAll: ParsedRepayWithdrawLimit = {
      ...midnightLimit,
      quote: {
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 40n }],
      },
      position: { maxCollateral: [{ collateralIndex: 0n, assets: 0n }] },
    };
    expect(() =>
      run(withdrawAll, { collateralAfter: 1n, receiverAfter: 40n }),
    ).toThrow(/post-bundle position\.maxCollateral for index "0"/);
  });

  test.each([
    {
      name: "short receiver delivery",
      changes: { receiverAfter: 19n },
      message: "collateral index",
    },
    {
      name: "over-withdrawal",
      changes: { collateralAfter: 19n },
      message: "collateral index",
    },
    {
      name: "changed credit",
      changes: { creditAfter: 49n },
      message: "credit changed",
    },
    {
      name: "missing debt",
      changes: { missing: "debt" },
      message: "midnightRepayWithdrawCollateral",
    },
    {
      name: "missing credit",
      changes: { missing: "credit" },
      message: "midnightRepayWithdrawCollateral",
    },
    {
      name: "missing collateral position",
      changes: { missing: "collateral" },
      message: "midnightRepayWithdrawCollateral",
    },
    {
      name: "missing receiver balance",
      changes: { missing: "receiver" },
      message: "midnightRepayWithdrawCollateral",
    },
    {
      name: "missing payment balance",
      changes: { missing: "payment" },
      message: "midnightRepayWithdrawCollateral",
    },
  ] as const)("error: rejects $name", ({ changes, message }) => {
    const error = (() => {
      try {
        run(midnightLimit, changes);
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(
      changes.missing === undefined
        ? ConsumerLimitViolationError
        : SlippageCheckUnavailableError,
    );
    expect((error as Error).message).toContain(message);
  });
});
