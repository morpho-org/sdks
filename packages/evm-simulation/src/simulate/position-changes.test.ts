import type { MarketId } from "@morpho-org/blue-sdk";
import { blueAbi, midnightEventsAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  type Hex,
  parseAbiParameters,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import { UnexpectedPositionChangeError } from "../errors.js";
import type { OperationLimit } from "../limits.js";
import { findUnexpectedPositionChanges as findPositionChanges } from "./position-changes.js";

const OWNER: Address = "0x0000000000000000000000000000000000000001";
const ATTACKER: Address = "0x0000000000000000000000000000000000000002";
const MORPHO: Address = "0x0000000000000000000000000000000000000003";
const MIDNIGHT: Address = "0x0000000000000000000000000000000000000004";
const MARKET = `0x${"11".repeat(32)}` as MarketId;
const TARGET = `0x${"22".repeat(32)}` as MarketId;
const THIRD = `0x${"33".repeat(32)}` as MarketId;
const FOURTH = `0x${"44".repeat(32)}` as MarketId;

function findUnexpectedPositionChanges(
  params: Parameters<typeof findPositionChanges>[0],
) {
  return findPositionChanges({
    ...params,
    refinanceMarketTokens:
      params.refinanceMarketTokens ??
      params.operations.flatMap((operation) =>
        operation.type === "blueRefinance"
          ? [
              {
                sourceMarketId: operation.sourceMarketId,
                targetMarketId: operation.targetMarketId,
                sourceToken: ATTACKER,
                targetToken: ATTACKER,
              },
            ]
          : [],
      ),
  });
}

// biome-ignore lint/complexity/useMaxParams: positional fixture builder
function blueCollateralLog(
  eventName: "SupplyCollateral" | "WithdrawCollateral",
  marketId = MARKET,
  assets = 1n,
  flowAccount: Address = ATTACKER,
  onBehalf: Address = OWNER,
) {
  const args = {
    id: marketId,
    caller: flowAccount,
    onBehalf,
    receiver: flowAccount,
    assets,
  };
  return {
    address: MORPHO,
    topics: encodeEventTopics({ abi: blueAbi, eventName, args }) as Hex[],
    data:
      eventName === "SupplyCollateral"
        ? encodeAbiParameters([{ type: "uint256" }], [assets])
        : encodeAbiParameters(
            [{ type: "address" }, { type: "uint256" }],
            [flowAccount, assets],
          ),
  };
}

function blueBorrowLog(
  onBehalf: Address = OWNER,
  eventName: "Borrow" | "Withdraw" | "WithdrawCollateral" = "Borrow",
) {
  const topics = encodeEventTopics({
    abi: blueAbi,
    eventName,
    args: { id: MARKET, onBehalf, receiver: ATTACKER },
  });
  return {
    address: MORPHO,
    topics: topics as Hex[],
    data: encodeAbiParameters(
      eventName === "WithdrawCollateral"
        ? [{ type: "address" }, { type: "uint256" }]
        : [{ type: "address" }, { type: "uint256" }, { type: "uint256" }],
      eventName === "WithdrawCollateral" ? [OWNER, 1n] : [OWNER, 1n, 1n],
    ),
  };
}

function midnightWithdrawLog(onBehalf: Address = OWNER) {
  const topics = encodeEventTopics({
    abi: midnightEventsAbi,
    eventName: "Withdraw",
    args: { id_: MARKET, onBehalf, receiver: ATTACKER },
  });
  return {
    address: MIDNIGHT,
    topics: topics as Hex[],
    data: encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "uint256" }],
      [OWNER, 1n, 0n],
    ),
  };
}

const blueSupply = {
  type: "blueSupply",
  marketId: MARKET,
  quote: { assetsPaid: 1n, sharesMinted: 1n },
  slippageTolerance: 0n,
} as const;
const blueBorrow = {
  type: "blueBorrow",
  marketId: MARKET,
  quote: { assetsReceived: 1n, sharesMinted: 1n },
  slippageTolerance: 0n,
} as const;

// biome-ignore lint/complexity/useMaxParams: positional fixture builder
function midnightLog(
  eventName: "Take" | "Withdraw" | "WithdrawCollateral",
  onBehalf: Address = OWNER,
  collateral: Address = ATTACKER,
) {
  if (eventName === "Take") {
    return {
      address: MIDNIGHT,
      topics: encodeEventTopics({
        abi: midnightEventsAbi,
        eventName,
        args: { id_: MARKET, maker: ATTACKER, taker: onBehalf },
      }) as Hex[],
      data: encodeAbiParameters(
        getAbiItem({ abi: midnightEventsAbi, name: "Take" }).inputs.filter(
          (input) => !input.indexed,
        ),
        [
          ATTACKER,
          zeroHash,
          true,
          zeroHash,
          ATTACKER,
          "0x",
          1n,
          1n,
          1n,
          1n,
          0n,
          0n,
          0n,
          ATTACKER,
          ATTACKER,
        ],
      ),
    };
  }
  return {
    address: MIDNIGHT,
    topics: encodeEventTopics({
      abi: midnightEventsAbi,
      eventName,
      args: { id_: MARKET, onBehalf, receiver: ATTACKER, collateral },
    }) as Hex[],
    data:
      eventName === "Withdraw"
        ? midnightWithdrawLog(onBehalf).data
        : encodeAbiParameters(
            getAbiItem({
              abi: midnightEventsAbi,
              name: "WithdrawCollateral",
            }).inputs.filter((input) => !input.indexed),
            [OWNER, 1n, ATTACKER],
          ),
  };
}

const quote = {
  assetsPaid: 1n,
  assetsReceived: 1n,
  sharesMinted: 1n,
  sharesBurned: 1n,
  collateralWithdrawn: 1n,
  collateralSupplied: 1n,
  unitsSold: 1n,
  creditRedeemed: 1n,
  collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
};

describe("findUnexpectedPositionChanges", () => {
  test.each([
    "midnightWithdrawCollateralBatch",
    "midnightRepayWithdrawCollateral",
    "midnightTakeRepayWithdrawCollateral",
  ] as const)("%s permits only resolved, quoted collateral tokens", (type) => {
    const params = {
      owner: OWNER,
      morpho: MORPHO,
      midnight: MIDNIGHT,
      operations: [{ type, marketId: MARKET, quote }],
      resolvedOperations: [
        {
          midnightCollateralTokens: [
            { collateralIndex: 0n, token: ATTACKER },
            { collateralIndex: 1n, token: MORPHO },
          ],
        },
      ],
    };
    expect(
      findUnexpectedPositionChanges({
        ...params,
        logs: [midnightLog("WithdrawCollateral")],
      }),
    ).toEqual([]);
    const failures = findUnexpectedPositionChanges({
      ...params,
      logs: [midnightLog("WithdrawCollateral", OWNER, MORPHO)],
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      code: "UNEXPECTED_POSITION_CHANGE",
      protocol: "Midnight",
      marketId: MARKET,
    });
    expect(
      findUnexpectedPositionChanges({
        ...params,
        operations: [
          {
            type,
            marketId: MARKET,
            quote: {
              ...quote,
              collateralWithdrawals: [
                { collateralIndex: 0n, assets: 1n },
                { collateralIndex: 1n, assets: 1n },
              ],
            },
          },
        ],
        logs: [
          midnightLog("WithdrawCollateral"),
          midnightLog("WithdrawCollateral", OWNER, MORPHO),
        ],
      }),
    ).toEqual([]);
    expect(
      findUnexpectedPositionChanges({
        ...params,
        logs: [],
      }),
    ).toEqual([]);
    expect(
      findUnexpectedPositionChanges({
        ...params,
        resolvedOperations: [],
        logs: [midnightLog("WithdrawCollateral")],
      }),
    ).toHaveLength(1);
    expect(
      findUnexpectedPositionChanges({
        ...params,
        operations: [
          {
            type,
            marketId: MARKET,
            quote: { ...quote, collateralWithdrawals: [] },
          },
        ],
        logs: [midnightLog("WithdrawCollateral")],
      }),
    ).toHaveLength(1);
    expect(
      findUnexpectedPositionChanges({
        ...params,
        logs: [{ ...midnightLog("WithdrawCollateral"), data: "0x" }],
      }),
    ).toHaveLength(1);
  });
  test.each([
    ["blueWithdraw", "Withdraw"],
    ["blueBorrow", "Borrow"],
    ["blueWithdrawCollateral", "WithdrawCollateral"],
    ["blueSupplyCollateralBorrow", "Borrow"],
    ["blueRepayWithdrawCollateral", "WithdrawCollateral"],
    ["midnightWithdrawCollateralBatch", "WithdrawCollateral"],
    ["midnightRedeem", "Withdraw"],
    ["midnightTakeBorrow", "Take"],
    ["midnightTakeBorrow", "Withdraw"],
    ["midnightTakeWithdraw", "Take"],
    ["midnightTakeWithdraw", "Withdraw"],
    ["midnightSupplyCollateralTakeBorrow", "Take"],
    ["midnightSupplyCollateralTakeBorrow", "Withdraw"],
    ["midnightRepayWithdrawCollateral", "WithdrawCollateral"],
    ["midnightTakeRepayWithdrawCollateral", "WithdrawCollateral"],
  ] as const)(
    "quote-only %s permits positive one-unit %s on an arbitrary market",
    (type, event) => {
      const log = type.startsWith("blue")
        ? blueBorrowLog(OWNER, event === "Take" ? "Borrow" : event)
        : midnightLog(event === "Borrow" ? "Take" : event);
      expect(
        findUnexpectedPositionChanges({
          owner: OWNER,
          logs: [log],
          morpho: MORPHO,
          midnight: MIDNIGHT,
          resolvedOperations: [
            {
              midnightCollateralTokens: [
                { collateralIndex: 0n, token: ATTACKER },
              ],
            },
          ],
          operations: [
            {
              type,
              marketId: MARKET,
              collateralIndex: 0n,
              quote,
            } as OperationLimit,
          ],
        }),
      ).toEqual([]);
    },
  );

  test("does not match a user-funded target top-up to an attacker withdrawal", () => {
    const target = `0x${"22".repeat(32)}` as MarketId;
    const operation: OperationLimit = {
      type: "blueRefinance",
      sourceMarketId: MARKET,
      targetMarketId: target,
      quote,
    };
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        morpho: MORPHO,
        operations: [operation],
        logs: [
          blueCollateralLog("WithdrawCollateral", MARKET, 1n, ATTACKER),
          blueCollateralLog("SupplyCollateral", target, 1n, OWNER),
        ],
      }),
    ).toHaveLength(1);
  });

  test("refinance permits only source collateral withdrawal and target borrowing", () => {
    const target = `0x${"22".repeat(32)}` as MarketId;
    const operation: OperationLimit = {
      type: "blueRefinance",
      sourceMarketId: MARKET,
      targetMarketId: target,
      quote,
    };
    const params = { owner: OWNER, morpho: MORPHO, operations: [operation] };
    const borrow = blueBorrowLog();
    expect(
      findUnexpectedPositionChanges({
        ...params,
        logs: [
          blueBorrowLog(OWNER, "WithdrawCollateral"),
          blueCollateralLog("SupplyCollateral", target),
          {
            ...borrow,
            topics: [borrow.topics[0]!, target, ...borrow.topics.slice(2)],
          },
        ],
      }),
    ).toEqual([]);
    expect(
      findUnexpectedPositionChanges({ ...params, logs: [borrow] }),
    ).toHaveLength(1);
  });

  test.each([
    [10n, 10n, 0],
    [4n, 4n, 0],
    [3n, 2n, 1],
    [2n, 0n, 1],
    [0n, 0n, 0],
  ] as const)(
    "refinance collateral flow %s withdrawn and %s supplied",
    // biome-ignore lint/complexity/useMaxParams: parameterized expected values
    (withdrawn, supplied, expectedFailures) => {
      const target = `0x${"22".repeat(32)}` as MarketId;
      const params = {
        owner: OWNER,
        morpho: MORPHO,
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: MARKET,
            targetMarketId: target,
            quote,
          },
        ] satisfies OperationLimit[],
      };
      expect(
        findUnexpectedPositionChanges({
          ...params,
          logs: [
            blueCollateralLog(
              "WithdrawCollateral",
              MARKET,
              withdrawn,
              ATTACKER,
            ),
            blueCollateralLog("SupplyCollateral", target, supplied, ATTACKER),
          ],
        }),
      ).toHaveLength(expectedFailures);
    },
  );

  test.each([OWNER, ATTACKER, MORPHO, MIDNIGHT])(
    "refinance resupply is route-independent for receiver/caller %s",
    (adapter) => {
      expect(
        findUnexpectedPositionChanges({
          owner: OWNER,
          morpho: MORPHO,
          operations: [
            {
              type: "blueRefinance",
              sourceMarketId: MARKET,
              targetMarketId: TARGET,
              quote,
            },
          ],
          logs: [
            blueCollateralLog("SupplyCollateral", TARGET, 10n, adapter),
            blueCollateralLog("WithdrawCollateral", MARKET, 10n, adapter),
          ],
        }),
      ).toEqual([]);
    },
  );

  test.each([
    { name: "missing", supplies: [] },
    {
      name: "another owner",
      supplies: [
        blueCollateralLog("SupplyCollateral", TARGET, 1n, ATTACKER, ATTACKER),
      ],
    },
    {
      name: "another market",
      supplies: [blueCollateralLog("SupplyCollateral", THIRD)],
    },
    {
      name: "another emitter",
      supplies: [
        { ...blueCollateralLog("SupplyCollateral", TARGET), address: ATTACKER },
      ],
    },
    {
      name: "another supplier",
      supplies: [blueCollateralLog("SupplyCollateral", TARGET, 1n, OWNER)],
    },
  ])("refinance rejects $name target supply evidence", ({ supplies }) => {
    const failures = findUnexpectedPositionChanges({
      owner: OWNER,
      morpho: MORPHO,
      operations: [
        {
          type: "blueRefinance",
          sourceMarketId: MARKET,
          targetMarketId: TARGET,
          quote,
        },
      ],
      logs: [blueCollateralLog("WithdrawCollateral"), ...supplies],
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      code: "UNEXPECTED_POSITION_CHANGE",
      marketId: MARKET,
    });
  });

  test("refinance sums split resupplies and allows separately declared collateral withdrawals", () => {
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        morpho: MORPHO,
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: MARKET,
            targetMarketId: TARGET,
            quote,
          },
        ],
        logs: [
          blueCollateralLog("WithdrawCollateral", MARKET, 10n),
          blueCollateralLog("SupplyCollateral", TARGET, 4n),
          blueCollateralLog("SupplyCollateral", TARGET, 6n),
        ],
      }),
    ).toEqual([]);
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        morpho: MORPHO,
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: MARKET,
            targetMarketId: TARGET,
            quote,
          },
          { type: "blueWithdrawCollateral", marketId: MARKET, quote },
        ],
        logs: [blueCollateralLog("WithdrawCollateral")],
      }),
    ).toEqual([]);
  });

  test("refinance aggregates many split logs per route", () => {
    const logs = Array.from({ length: 100 }, () => [
      blueCollateralLog("WithdrawCollateral", MARKET, 1n),
      blueCollateralLog("SupplyCollateral", TARGET, 1n),
    ]).flat();
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        morpho: MORPHO,
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: MARKET,
            targetMarketId: TARGET,
            quote,
          },
        ],
        logs,
      }),
    ).toEqual([]);
  });

  test("rejects cross-token refinance collateral matching", () => {
    const failures = findUnexpectedPositionChanges({
      owner: OWNER,
      morpho: MORPHO,
      operations: [
        {
          type: "blueRefinance",
          sourceMarketId: MARKET,
          targetMarketId: TARGET,
          quote,
        },
      ],
      refinanceMarketTokens: [
        {
          sourceMarketId: MARKET,
          targetMarketId: TARGET,
          sourceToken: ATTACKER,
          targetToken: MORPHO,
        },
      ],
      logs: [
        blueCollateralLog("WithdrawCollateral", MARKET),
        blueCollateralLog("SupplyCollateral", TARGET),
      ],
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      code: "UNEXPECTED_POSITION_CHANGE",
      marketId: MARKET,
    });
  });

  test("rejects refinance matching without resolved market tokens", () => {
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        morpho: MORPHO,
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: MARKET,
            targetMarketId: TARGET,
            quote,
          },
        ],
        refinanceMarketTokens: [],
        logs: [
          blueCollateralLog("WithdrawCollateral", MARKET),
          blueCollateralLog("SupplyCollateral", TARGET),
        ],
      }),
    ).toMatchObject([{ code: "UNEXPECTED_POSITION_CHANGE" }]);
  });

  test("matches refinance flows independently for many receivers", () => {
    const logs = Array.from({ length: 2000 }, (_, index) => {
      const account =
        `0x${(index + 10).toString(16).padStart(40, "0")}` as Address;
      return [
        blueCollateralLog("WithdrawCollateral", MARKET, 1n, account),
        blueCollateralLog("SupplyCollateral", TARGET, 1n, account),
      ];
    }).flat();
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        morpho: MORPHO,
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: MARKET,
            targetMarketId: TARGET,
            quote,
          },
        ],
        logs,
      }),
    ).toEqual([]);
  });

  test.each([false, true])(
    "unrelated-account supplies do not consume the refinance node budget: matched=%s",
    (matched) => {
      const failures = findUnexpectedPositionChanges({
        owner: OWNER,
        morpho: MORPHO,
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: MARKET,
            targetMarketId: TARGET,
            quote,
          },
        ],
        logs: [
          blueCollateralLog("WithdrawCollateral", MARKET),
          ...(matched ? [blueCollateralLog("SupplyCollateral", TARGET)] : []),
          ...Array.from({ length: 4095 }, (_, index) =>
            blueCollateralLog(
              "SupplyCollateral",
              `0x${(index + 1).toString(16).padStart(64, "0")}` as MarketId,
              1n,
              OWNER,
            ),
          ),
        ],
      });
      if (matched) {
        expect(failures).toEqual([]);
      } else {
        expect(failures).toMatchObject([
          { code: "UNEXPECTED_POSITION_CHANGE" },
        ]);
      }
    },
  );

  test("fails closed when a refinance flow exceeds the graph node budget", () => {
    const logs = [
      blueCollateralLog("WithdrawCollateral", MARKET),
      blueCollateralLog("SupplyCollateral", TARGET),
      ...Array.from({ length: 4095 }, (_, index) =>
        blueCollateralLog(
          "SupplyCollateral",
          `0x${(index + 1).toString(16).padStart(64, "0")}` as MarketId,
        ),
      ),
    ];
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        morpho: MORPHO,
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: MARKET,
            targetMarketId: TARGET,
            quote,
          },
        ],
        logs,
      }),
    ).toMatchObject([{ code: "UNEXPECTED_POSITION_CHANGE" }]);
  });

  test("fails closed when overlapping refinance routes exceed the edge budget", () => {
    const sources = Array.from(
      { length: 101 },
      (_, index) =>
        `0x${(index + 1).toString(16).padStart(64, "0")}` as MarketId,
    );
    const targets = Array.from(
      { length: 101 },
      (_, index) =>
        `0x${(index + 102).toString(16).padStart(64, "0")}` as MarketId,
    );
    const failures = findUnexpectedPositionChanges({
      owner: OWNER,
      morpho: MORPHO,
      operations: sources.flatMap((sourceMarketId) =>
        targets.map((targetMarketId) => ({
          type: "blueRefinance" as const,
          sourceMarketId,
          targetMarketId,
          quote,
        })),
      ),
      logs: [
        ...sources.map((source) =>
          blueCollateralLog("WithdrawCollateral", source),
        ),
        ...targets.map((target) =>
          blueCollateralLog("SupplyCollateral", target),
        ),
      ],
    });
    expect(failures).toHaveLength(sources.length);
    expect(
      failures.every(({ code }) => code === "UNEXPECTED_POSITION_CHANGE"),
    ).toBe(true);
  });

  test("rejects split refinance withdrawals when target supply is short", () => {
    const failures = findUnexpectedPositionChanges({
      owner: OWNER,
      morpho: MORPHO,
      operations: [
        {
          type: "blueRefinance",
          sourceMarketId: MARKET,
          targetMarketId: TARGET,
          quote,
        },
      ],
      refinanceMarketTokens: [
        {
          sourceMarketId: MARKET,
          targetMarketId: TARGET,
          sourceToken: ATTACKER,
          targetToken: ATTACKER,
        },
      ],
      logs: [
        blueCollateralLog("WithdrawCollateral", MARKET, 1n),
        blueCollateralLog("WithdrawCollateral", MARKET, 1n),
        blueCollateralLog("WithdrawCollateral", MARKET, 1n),
        blueCollateralLog("SupplyCollateral", TARGET, 2n),
      ],
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      code: "UNEXPECTED_POSITION_CHANGE",
      marketId: MARKET,
    });
  });

  test.each([false, true])(
    "refinance cannot reuse a shared target supply: enough=%s",
    (enough) => {
      expect(
        findUnexpectedPositionChanges({
          owner: OWNER,
          morpho: MORPHO,
          operations: [
            {
              type: "blueRefinance",
              sourceMarketId: MARKET,
              targetMarketId: TARGET,
              quote,
            },
            {
              type: "blueRefinance",
              sourceMarketId: THIRD,
              targetMarketId: TARGET,
              quote,
            },
          ],
          logs: [
            blueCollateralLog("WithdrawCollateral", MARKET),
            blueCollateralLog("WithdrawCollateral", THIRD),
            blueCollateralLog("SupplyCollateral", TARGET, enough ? 2n : 1n),
          ],
        }),
      ).toHaveLength(enough ? 0 : 1);
    },
  );

  test("overlapping refinance routes do not depend on greedy log order", () => {
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        morpho: MORPHO,
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: MARKET,
            targetMarketId: TARGET,
            quote,
          },
          {
            type: "blueRefinance",
            sourceMarketId: MARKET,
            targetMarketId: FOURTH,
            quote,
          },
          {
            type: "blueRefinance",
            sourceMarketId: THIRD,
            targetMarketId: TARGET,
            quote,
          },
        ],
        logs: [
          blueCollateralLog("WithdrawCollateral", MARKET),
          blueCollateralLog("WithdrawCollateral", THIRD),
          blueCollateralLog("SupplyCollateral", TARGET),
          blueCollateralLog("SupplyCollateral", FOURTH),
        ],
      }),
    ).toEqual([]);
  });

  test("malformed refinance supply evidence fails closed", () => {
    const supply = blueCollateralLog("SupplyCollateral", TARGET);
    const params = {
      owner: OWNER,
      morpho: MORPHO,
      logs: [{ ...supply, data: "0x" as Hex }],
    };
    expect(
      findUnexpectedPositionChanges({
        ...params,
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: MARKET,
            targetMarketId: TARGET,
            quote,
          },
        ],
      })[0],
    ).toBeInstanceOf(UnexpectedPositionChangeError);
    expect(
      findUnexpectedPositionChanges({ ...params, operations: [blueSupply] }),
    ).toEqual([]);
  });

  test("Blue-to-vault composition declares the owner's Blue withdrawal separately", () => {
    const operations: OperationLimit[] = [
      { type: "blueWithdraw", marketId: MARKET, quote },
      { type: "vaultV2Deposit", vault: ATTACKER, quote },
    ];
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        logs: [blueBorrowLog(OWNER, "Withdraw")],
        operations,
        morpho: MORPHO,
      }),
    ).toEqual([]);
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        logs: [blueBorrowLog(OWNER, "Borrow")],
        operations,
        morpho: MORPHO,
      }),
    ).toHaveLength(1);
  });

  test.each([
    [ATTACKER, 1],
    [OWNER, 0],
  ] as const)(
    "blueWithdraw account %s %s owner position decrease",
    (account, expectedFailures) => {
      expect(
        findUnexpectedPositionChanges({
          owner: OWNER,
          logs: [blueBorrowLog(OWNER, "Withdraw")],
          operations: [
            { type: "blueWithdraw", marketId: MARKET, account, quote },
          ],
          morpho: MORPHO,
        }),
      ).toHaveLength(expectedFailures);
    },
  );

  test.each([
    ["blueSupplyCollateralBorrow", "Borrow"],
    ["blueRepayWithdrawCollateral", "WithdrawCollateral"],
  ] as const)(
    "%s permits an adapter caller acting for the owner",
    (type, event) => {
      const log = blueBorrowLog(OWNER, event);
      log.data =
        event === "Borrow"
          ? encodeAbiParameters(parseAbiParameters("address,uint256,uint256"), [
              ATTACKER,
              1n,
              1n,
            ])
          : encodeAbiParameters(parseAbiParameters("address,uint256"), [
              ATTACKER,
              1n,
            ]);
      expect(
        findUnexpectedPositionChanges({
          owner: OWNER,
          morpho: MORPHO,
          logs: [log],
          operations: [{ type, marketId: MARKET, quote }],
        }),
      ).toEqual([]);
    },
  );

  test.each([
    "vaultV1MigrateToV2",
    "vaultV2ForceWithdraw",
    "vaultV2ForceRedeem",
    "vaultV1InKindRedeem",
    "vaultV2InKindRedeem",
    "midnightSupplyBlueMakeLend",
  ] as const)(
    "%s ignores Blue withdrawals owned by a vault, adapter or callback",
    (type) => {
      const operation: OperationLimit =
        type === "midnightSupplyBlueMakeLend"
          ? {
              type,
              marketId: MARKET,
              loanToken: ATTACKER,
              callbackSalt: zeroHash,
              quote,
            }
          : type === "vaultV1MigrateToV2"
            ? { type, sourceVault: ATTACKER, targetVault: MIDNIGHT, quote }
            : { type, vault: ATTACKER, quote };
      expect(
        findUnexpectedPositionChanges({
          owner: OWNER,
          logs: [blueBorrowLog(ATTACKER, "Withdraw")],
          operations: [operation],
          morpho: MORPHO,
        }),
      ).toEqual([]);
    },
  );

  test("maker publications do not permit fills until a seller operation is declared", () => {
    const publication: OperationLimit = {
      type: "midnightSupplyCollateralMakeBorrow",
      marketId: MARKET,
      collateralIndex: 0n,
      quote,
    };
    const log = midnightLog("Take");
    const makerSale = {
      ...log,
      topics: encodeEventTopics({
        abi: midnightEventsAbi,
        eventName: "Take",
        args: { id_: MARKET, maker: OWNER, taker: ATTACKER },
      }) as Hex[],
      data: encodeAbiParameters(
        getAbiItem({ abi: midnightEventsAbi, name: "Take" }).inputs.filter(
          (input) => !input.indexed,
        ),
        [
          ATTACKER,
          zeroHash,
          false,
          zeroHash,
          ATTACKER,
          "0x",
          1n,
          1n,
          1n,
          1n,
          0n,
          0n,
          0n,
          ATTACKER,
          ATTACKER,
        ],
      ),
    };
    const params = {
      owner: OWNER,
      logs: [makerSale],
      morpho: MORPHO,
      midnight: MIDNIGHT,
    };
    expect(
      findUnexpectedPositionChanges({ ...params, operations: [publication] }),
    ).toHaveLength(1);
    expect(
      findUnexpectedPositionChanges({
        ...params,
        operations: [
          publication,
          { type: "midnightTakeBorrow", marketId: MARKET, quote },
        ],
      }),
    ).toEqual([]);
  });
  test.each([
    { offerIsBuy: true, maker: ATTACKER, taker: OWNER, decreasesOwner: true },
    { offerIsBuy: false, maker: OWNER, taker: ATTACKER, decreasesOwner: true },
    { offerIsBuy: true, maker: OWNER, taker: ATTACKER, decreasesOwner: false },
    { offerIsBuy: false, maker: ATTACKER, taker: OWNER, decreasesOwner: false },
  ])(
    "Midnight Take seller classification: %s",
    ({ offerIsBuy, maker, taker, decreasesOwner }) => {
      const log = {
        address: MIDNIGHT,
        topics: encodeEventTopics({
          abi: midnightEventsAbi,
          eventName: "Take",
          args: { id_: MARKET, maker, taker },
        }) as Hex[],
        data: encodeAbiParameters(
          parseAbiParameters(
            "address, bytes32, bool, bytes32, address, bytes, uint256, uint256, uint256, uint256, uint256, uint256, int256, address, address",
          ),
          [
            ATTACKER,
            zeroHash,
            offerIsBuy,
            zeroHash,
            ATTACKER,
            "0x",
            1n,
            1n,
            1n,
            1n,
            0n,
            0n,
            0n,
            ATTACKER,
            ATTACKER,
          ],
        ),
      };
      const params = {
        owner: OWNER,
        logs: [log],
        morpho: MORPHO,
        midnight: MIDNIGHT,
      };
      const failures = findUnexpectedPositionChanges({
        ...params,
        operations: [blueSupply],
      });
      expect(failures).toHaveLength(decreasesOwner ? 1 : 0);
      if (decreasesOwner) {
        expect(failures[0]).toMatchObject({
          event: "Take",
          protocol: "Midnight",
          marketId: MARKET,
          owner: OWNER,
        });
      }
      expect(
        findUnexpectedPositionChanges({
          ...params,
          operations: [
            {
              type: "midnightTakeBorrow",
              marketId: MARKET,
              quote: { unitsSold: 1n, assetsReceived: 1n },
            },
          ],
        }),
      ).toEqual([]);
      expect(
        findUnexpectedPositionChanges({
          ...params,
          logs: [{ ...log, data: "0x" }],
          operations: [],
        }),
      ).toHaveLength(1);
    },
  );

  test.each([
    ["Withdraw", "blueWithdraw"],
    ["WithdrawCollateral", "blueWithdrawCollateral"],
    ["Borrow", "blueBorrow"],
  ] as const)("permits only %s for %s", (event, type) => {
    const params = {
      owner: OWNER,
      logs: [blueBorrowLog(OWNER, event)],
      morpho: MORPHO,
    };
    expect(
      findUnexpectedPositionChanges({
        ...params,
        operations: [{ ...blueBorrow, type }],
      }),
    ).toEqual([]);
    expect(
      findUnexpectedPositionChanges({ ...params, operations: [blueSupply] }),
    ).toHaveLength(1);
    expect(
      findUnexpectedPositionChanges({
        ...params,
        operations: [
          { ...blueBorrow, type, marketId: `0x${"22".repeat(32)}` as MarketId },
        ],
      }),
    ).toHaveLength(1);
  });

  test.each([
    { type: "blueSupplyCollateralBorrow", quote: { sharesMinted: 1n } },
    { type: "blueSupplyCollateralBorrow", inputs: { collateralAssets: 1n } },
  ] as const)("combined operation requires an active borrow leg: %s", (leg) => {
    const params = { owner: OWNER, logs: [blueBorrowLog()], morpho: MORPHO };
    expect(
      findUnexpectedPositionChanges({
        ...params,
        operations: [{ marketId: MARKET, ...leg }],
      }),
    ).toHaveLength(1);
    expect(
      findUnexpectedPositionChanges({
        ...params,
        operations: [
          {
            type: "blueSupplyCollateralBorrow",
            marketId: MARKET,
            inputs: { borrowAssets: 1n },
          },
        ],
      }),
    ).toEqual([]);
  });

  test("permits Midnight redeems but not cross-protocol or unrelated emitters", () => {
    const params = {
      owner: OWNER,
      logs: [midnightWithdrawLog()],
      morpho: MORPHO,
      midnight: MIDNIGHT,
    };
    const operation: OperationLimit = {
      type: "midnightRedeem",
      marketId: MARKET,
      quote: { creditRedeemed: 1n, assetsReceived: 1n },
    };
    expect(
      findUnexpectedPositionChanges({ ...params, operations: [operation] }),
    ).toEqual([]);
    expect(
      findUnexpectedPositionChanges({
        ...params,
        operations: [{ ...blueBorrow, type: "blueWithdraw" }],
      }),
    ).toHaveLength(1);
    expect(
      findUnexpectedPositionChanges({
        ...params,
        logs: [{ ...blueBorrowLog(), address: ATTACKER }],
        operations: [],
      }),
    ).toEqual([]);
  });

  test("returns no findings for empty logs and unrelated owners", () => {
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        logs: [],
        operations: [],
        morpho: MORPHO,
        midnight: MIDNIGHT,
      }),
    ).toEqual([]);
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        logs: [blueBorrowLog(ATTACKER)],
        operations: [],
        morpho: MORPHO,
        midnight: MIDNIGHT,
      }),
    ).toEqual([]);
  });

  test("rejects an undeclared Blue position decrease", () => {
    const [failure] = findUnexpectedPositionChanges({
      owner: OWNER,
      logs: [blueBorrowLog()],
      operations: [blueSupply],
      morpho: MORPHO,
      midnight: MIDNIGHT,
    });
    expect(failure).toBeInstanceOf(UnexpectedPositionChangeError);
    expect(failure).toMatchObject({
      code: "UNEXPECTED_POSITION_CHANGE",
      protocol: "Blue",
      event: "Borrow",
      marketId: MARKET,
    });
    expect(failure?.message).toMatch(/Do not sign this request\.$/);
  });

  test("permits a declared event only on its market", () => {
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        logs: [blueBorrowLog()],
        operations: [blueBorrow],
        morpho: MORPHO,
        midnight: MIDNIGHT,
      }),
    ).toEqual([]);
    expect(
      findUnexpectedPositionChanges({
        owner: OWNER,
        logs: [midnightWithdrawLog()],
        operations: [blueSupply],
        morpho: MORPHO,
        midnight: MIDNIGHT,
      }),
    ).toHaveLength(1);
  });

  test("fails closed on malformed matching logs", () => {
    const log = {
      address: MORPHO,
      topics: blueBorrowLog().topics,
      data: "0x00" as Hex,
    };
    const [failure] = findUnexpectedPositionChanges({
      owner: OWNER,
      logs: [log],
      operations: [],
      morpho: MORPHO,
      midnight: MIDNIGHT,
    });
    expect(failure).toBeInstanceOf(UnexpectedPositionChangeError);
    expect(failure?.marketId).toBeUndefined();
  });
});
