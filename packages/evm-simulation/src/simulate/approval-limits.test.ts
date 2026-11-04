import {
  getChainAddresses,
  registerCustomAddresses,
} from "@morpho-org/blue-sdk";
import { type Address, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { ApprovalCheckUnavailableError } from "../errors.js";
import type { SimulateParams } from "../params.js";
import { resolveApprovalLimits } from "./approval-limits.js";
import type { ResolvedApprovalOperation } from "./backends/resolve-assets.js";
import { parseRequest } from "./request/parse-request.js";

const OWNER = "0x1111111111111111111111111111111111111111";
const VAULT = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const OTHER = "0x4444444444444444444444444444444444444444";
const LOAN = "0x5555555555555555555555555555555555555555";
const COLLATERAL = "0x6666666666666666666666666666666666666666";
const MARKET_ID =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const parsed = (operation: object) => {
  const request = parseRequest({
    chainId: 1,
    transactions: [{ from: OWNER, to: VAULT, data: "0x12345678" }],
    limits: { operations: [operation] },
  } as SimulateParams);
  if (request.limits === "none") throw new Error("test limit was omitted");
  const limit = request.limits.operations[0];
  if (limit === undefined) throw new Error("test limit was not parsed");
  return limit;
};

test("unions explicit approvals with operation-derived registry spenders", () => {
  const request = parseRequest({
    chainId: 1,
    transactions: [
      {
        from: OWNER,
        to: VAULT,
        data: "0x12345678",
      },
    ],
    limits: {
      operations: [
        {
          type: "vaultV1Deposit",
          vault: VAULT,
          quote: { assetsPaid: 1n, sharesMinted: 1n },
        },
      ],
    },
  } as SimulateParams);
  if (request.limits === "none") return;
  const limit = request.limits.operations[0];
  if (limit === undefined) return;
  const operation: ResolvedApprovalOperation = {
    limit,
    approvalToken: TOKEN,
  };
  const explicit = {
    type: "token",
    token: OTHER,
    owner: OWNER,
    spender: OTHER,
  } as const;
  const result = resolveApprovalLimits({
    chainId: 1,
    owner: OWNER,
    operations: [operation],
    explicit: [explicit],
  });
  const registry = getChainAddresses(1)!;

  expect(result.approvals).toContainEqual(explicit);
  expect(result.approvals).toContainEqual({
    type: "token",
    token: TOKEN,
    owner: OWNER,
    spender: registry.bundles!.vaultBundlesV1,
  });
  expect(result.approvals).toContainEqual({
    type: "token",
    token: TOKEN,
    owner: OWNER,
    spender: registry.permit2,
  });
});

test("fails closed when the chain has no approval-check registry", () => {
  expect(() =>
    resolveApprovalLimits({
      chainId: 99_999_999,
      owner: OWNER,
      operations: [],
    }),
  ).toThrow(ApprovalCheckUnavailableError);
});

test("does not derive an approval for V2 forceRedeem", () => {
  const request = parseRequest({
    chainId: 1,
    transactions: [
      {
        from: OWNER,
        to: VAULT,
        data: "0x12345678",
      },
    ],
    limits: {
      operations: [
        {
          type: "vaultV2ForceRedeem",
          vault: VAULT,
          quote: { sharesBurned: 1n, assetsReceived: 1n },
        },
      ],
    },
  } as SimulateParams);
  if (request.limits === "none") return;
  const limit = request.limits.operations[0];
  if (limit === undefined) return;

  expect(
    resolveApprovalLimits({
      chainId: 1,
      owner: OWNER,
      operations: [{ limit }],
    }).approvals,
  ).toEqual([]);
});

describe("approval derivation for every operation type", () => {
  const registry = getChainAddresses(1)!;
  const requiredAddress = (address: Address | undefined): Address => {
    if (address === undefined) throw new TypeError("Expected registry address");
    return address;
  };
  const blueBundles = requiredAddress(registry.bundles?.blueBundlesV1);
  const vaultBundles = requiredAddress(registry.bundles?.vaultBundlesV1);
  const vaultExitBundles = requiredAddress(
    registry.bundles?.vaultExitBundlesV1,
  );
  const morpho = requiredAddress(registry.blue);
  const token = (tokenAddress: string, spenders: readonly string[]) =>
    spenders.map((spender) => ({
      type: "token" as const,
      token: tokenAddress,
      owner: OWNER,
      spender,
    }));
  const funding = (tokenAddress: string) =>
    token(
      tokenAddress,
      [blueBundles, registry.permit2, morpho].filter(
        (address): address is NonNullable<typeof address> =>
          address !== undefined,
      ),
    );
  const auth = [
    {
      type: "morphoAuthorization" as const,
      authorizer: OWNER,
      authorized: blueBundles,
    },
  ];
  const cases = [
    [
      "blueSupply",
      {
        type: "blueSupply",
        marketId: MARKET_ID,
        quote: { assetsPaid: 1n, sharesMinted: 1n },
      },
      funding(LOAN),
    ],
    [
      "blueRepay",
      {
        type: "blueRepay",
        marketId: MARKET_ID,
        quote: { assetsPaid: 1n, sharesBurned: 1n },
      },
      funding(LOAN),
    ],
    [
      "blueSupplyCollateral",
      {
        type: "blueSupplyCollateral",
        marketId: MARKET_ID,
        quote: { assetsPaid: 1n, collateralSupplied: 1n },
      },
      funding(COLLATERAL),
    ],
    [
      "blueSupplyCollateralBorrow",
      {
        type: "blueSupplyCollateralBorrow",
        marketId: MARKET_ID,
        quote: {
          assetsPaid: 1n,
          collateralSupplied: 1n,
          assetsReceived: 1n,
          sharesMinted: 1n,
        },
      },
      [...funding(COLLATERAL), ...auth],
    ],
    [
      "blueRepayWithdrawCollateral",
      {
        type: "blueRepayWithdrawCollateral",
        marketId: MARKET_ID,
        quote: {
          assetsPaid: 1n,
          sharesBurned: 1n,
          assetsReceived: 1n,
          collateralWithdrawn: 1n,
        },
      },
      [...funding(LOAN), ...auth],
    ],
    [
      "blueBorrow",
      {
        type: "blueBorrow",
        marketId: MARKET_ID,
        quote: { assetsReceived: 1n, sharesMinted: 1n },
      },
      auth,
    ],
    [
      "blueWithdraw",
      {
        type: "blueWithdraw",
        marketId: MARKET_ID,
        quote: { assetsReceived: 1n, sharesBurned: 1n },
      },
      auth,
    ],
    [
      "blueWithdrawCollateral",
      {
        type: "blueWithdrawCollateral",
        marketId: MARKET_ID,
        quote: { assetsReceived: 1n, collateralWithdrawn: 1n },
      },
      auth,
    ],
    [
      "blueRefinance",
      {
        type: "blueRefinance",
        sourceMarketId: MARKET_ID,
        targetMarketId: MARKET_ID,
        quote: { sharesBurned: 1n, sharesMinted: 1n },
      },
      auth,
    ],
    [
      "vaultV1Deposit",
      {
        type: "vaultV1Deposit",
        vault: VAULT,
        quote: { assetsPaid: 1n, sharesMinted: 1n },
      },
      [
        ...token(TOKEN, [VAULT]),
        ...token(
          TOKEN,
          [vaultBundles, registry.permit2].filter(
            (address): address is NonNullable<typeof address> =>
              address !== undefined,
          ),
        ),
      ],
    ],
    [
      "vaultV2Deposit",
      {
        type: "vaultV2Deposit",
        vault: VAULT,
        quote: { assetsPaid: 1n, sharesMinted: 1n },
      },
      [
        ...token(TOKEN, [VAULT]),
        ...token(
          TOKEN,
          [vaultBundles, registry.permit2].filter(
            (address): address is NonNullable<typeof address> =>
              address !== undefined,
          ),
        ),
      ],
    ],
    [
      "vaultV1Withdraw",
      {
        type: "vaultV1Withdraw",
        vault: VAULT,
        quote: { assetsReceived: 1n, sharesBurned: 1n },
      },
      token(VAULT, [vaultBundles]),
    ],
    [
      "vaultV2Withdraw",
      {
        type: "vaultV2Withdraw",
        vault: VAULT,
        quote: { assetsReceived: 1n, sharesBurned: 1n },
      },
      token(VAULT, [vaultBundles]),
    ],
    [
      "vaultV1Redeem",
      {
        type: "vaultV1Redeem",
        vault: VAULT,
        quote: { assetsReceived: 1n, sharesBurned: 1n },
      },
      token(VAULT, [vaultBundles]),
    ],
    [
      "vaultV2Redeem",
      {
        type: "vaultV2Redeem",
        vault: VAULT,
        quote: { assetsReceived: 1n, sharesBurned: 1n },
      },
      token(VAULT, [vaultBundles]),
    ],
    [
      "vaultV2ForceWithdraw",
      {
        type: "vaultV2ForceWithdraw",
        vault: VAULT,
        quote: { assetsReceived: 1n, sharesBurned: 1n },
      },
      token(VAULT, [vaultExitBundles]),
    ],
    [
      "vaultV2ForceRedeem",
      {
        type: "vaultV2ForceRedeem",
        vault: VAULT,
        quote: { assetsReceived: 1n, sharesBurned: 1n },
      },
      [],
    ],
    [
      "vaultV1InKindRedeem",
      {
        type: "vaultV1InKindRedeem",
        vault: VAULT,
        quote: {
          sharesBurned: 1n,
          positions: [{ marketId: MARKET_ID, supplyShares: 1n }],
        },
      },
      token(VAULT, [vaultExitBundles]),
    ],
    [
      "vaultV2InKindRedeem",
      {
        type: "vaultV2InKindRedeem",
        vault: VAULT,
        quote: {
          sharesBurned: 1n,
          positions: [{ marketId: MARKET_ID, supplyShares: 1n }],
        },
      },
      token(VAULT, [vaultExitBundles]),
    ],
    [
      "vaultV1MigrateToV2",
      {
        type: "vaultV1MigrateToV2",
        sourceVault: VAULT,
        targetVault: OTHER,
        quote: { sharesBurned: 1n, sharesMinted: 1n },
      },
      token(VAULT, [vaultBundles]),
    ],
  ] as const;

  test.each(
    cases.map(([type, operation, expected]) => ({ type, operation, expected })),
  )("$type derives its exact approval set", ({ type, operation, expected }) => {
    const approvalToken =
      type === "blueSupplyCollateral" || type === "blueSupplyCollateralBorrow"
        ? COLLATERAL
        : type.startsWith("blue")
          ? LOAN
          : TOKEN;
    const result = resolveApprovalLimits({
      chainId: 1,
      owner: OWNER,
      operations: [{ limit: parsed(operation), approvalToken }],
    });
    expect(result.approvals).toEqual(expected);
  });

  test.each(
    cases.map(([type, operation, expected]) => ({ type, operation, expected })),
  )(
    "$type keeps only registry-listed spenders on Fraxtal",
    ({ type, operation, expected }) => {
      const approvalToken =
        type === "blueSupplyCollateral" || type === "blueSupplyCollateralBorrow"
          ? COLLATERAL
          : type.startsWith("blue")
            ? LOAN
            : TOKEN;
      const fraxtalMorpho = getChainAddresses(252)!.blue;
      const result = resolveApprovalLimits({
        chainId: 252,
        owner: OWNER,
        operations: [{ limit: parsed(operation), approvalToken }],
      });
      expect(result.approvals).toEqual(
        expected.flatMap((approval) =>
          approval.type === "token" && approval.spender === morpho
            ? [{ ...approval, spender: fraxtalMorpho }]
            : approval.type === "token" && approval.spender === VAULT
              ? [approval]
              : [],
        ),
      );
    },
  );

  test("derives funding without Permit2 on World Chain", () => {
    const world = getChainAddresses(480)!;
    const result = resolveApprovalLimits({
      chainId: 480,
      owner: OWNER,
      operations: [
        {
          limit: parsed({
            type: "vaultV2Deposit",
            vault: VAULT,
            quote: { assetsPaid: 1n, sharesMinted: 1n },
          }),
          approvalToken: TOKEN,
        },
      ],
    });
    expect(world.permit2).toBeUndefined();
    expect(
      result.approvals.some(
        (approval) =>
          approval.type === "token" && approval.spender === world.permit2,
      ),
    ).toBe(false);
  });

  test("treats a zero Permit2 registry address as absent", () => {
    const chainId = 888_000_646;
    registerCustomAddresses({
      addresses: {
        [chainId]: {
          blue: "0x0000000000000000000000000000000000000001",
          adaptiveCurveIrm: "0x0000000000000000000000000000000000000002",
          permit2: zeroAddress,
        },
      },
    });
    const result = resolveApprovalLimits({
      chainId,
      owner: OWNER,
      operations: [
        {
          limit: parsed({
            type: "vaultV2Deposit",
            vault: VAULT,
            quote: { assetsPaid: 1n, sharesMinted: 1n },
          }),
          approvalToken: TOKEN,
        },
      ],
    });

    expect(result.approvals).not.toContainEqual({
      type: "token",
      token: TOKEN,
      owner: OWNER,
      spender: zeroAddress,
    });
    expect(result.eventAddresses.permit2).toBeUndefined();
  });

  test("fails closed when a funding operation has no approval token", () => {
    expect(() =>
      resolveApprovalLimits({
        chainId: 1,
        owner: OWNER,
        operations: [
          {
            limit: parsed({
              type: "blueSupply",
              marketId: MARKET_ID,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
            }),
          },
        ],
      }),
    ).toThrow(ApprovalCheckUnavailableError);
  });

  test("derives Midnight authorizations for Midnight operations", () => {
    const midnight = (authorized: Address | undefined) => ({
      type: "midnightAuthorization" as const,
      onBehalf: OWNER,
      authorized: requiredAddress(authorized),
    });
    const base = getChainAddresses(8453)!;
    const midnightOperation = {
      limit: {
        type: "midnightRedeem",
        marketId: MARKET_ID,
        quote: { creditRedeemed: 1n, assetsReceived: 1n },
      },
    } as unknown as ResolvedApprovalOperation;
    const collateral = {
      limit: { type: "midnightSupplyCollateral" },
    } as unknown as ResolvedApprovalOperation;
    const makeBorrow = {
      limit: { type: "midnightSupplyCollateralMakeBorrow" },
    } as unknown as ResolvedApprovalOperation;
    const parking = {
      limit: { type: "midnightSupplyBlueMakeLend" },
    } as unknown as ResolvedApprovalOperation;
    const result = resolveApprovalLimits({
      chainId: 8453,
      owner: OWNER,
      operations: [midnightOperation, collateral, makeBorrow, parking],
    });
    expect(result.approvals).toEqual([
      midnight(base.midnightBundlesV2),
      midnight(base.midnightBundlesV2),
      midnight(base.midnightBundlesV2),
      midnight(base.priceRatifierV1),
      midnight(base.rateRatifierV1),
      midnight(base.midnightBundlesV2),
      midnight(base.priceRatifierV1),
      midnight(base.rateRatifierV1),
    ]);
    expect(result.eventAddresses.midnight).toBe(base.midnight);
    expect(() =>
      resolveApprovalLimits({
        chainId: 252,
        owner: OWNER,
        operations: [parking],
      }),
    ).toThrow(ApprovalCheckUnavailableError);
  });

  const midnightBase = getChainAddresses(8453)!;
  test.each([
    {
      type: "midnightSupplyCollateral",
      operation: {
        type: "midnightSupplyCollateral",
        marketId: MARKET_ID,
        collateralIndex: 0n,
        quote: { collateralSupplied: 1n, assetsPaid: 1n },
      },
      expected: [midnightBase.midnightBundlesV2],
    },
    {
      type: "midnightSupplyCollateralMakeBorrow",
      operation: {
        type: "midnightSupplyCollateralMakeBorrow",
        marketId: MARKET_ID,
        collateralIndex: 0n,
        quote: { collateralSupplied: 1n, assetsPaid: 1n },
      },
      expected: [
        midnightBase.midnightBundlesV2,
        midnightBase.priceRatifierV1,
        midnightBase.rateRatifierV1,
      ],
    },
    {
      type: "midnightSupplyBlueMakeLend",
      operation: {
        type: "midnightSupplyBlueMakeLend",
        marketId: MARKET_ID,
        loanToken: LOAN,
        callbackSalt: MARKET_ID,
        quote: { assetsPaid: 1n, sharesMinted: 1n },
      },
      expected: [
        midnightBase.midnightBundlesV2,
        midnightBase.priceRatifierV1,
        midnightBase.rateRatifierV1,
      ],
    },
    {
      type: "midnightRedeem",
      operation: {
        type: "midnightRedeem",
        marketId: MARKET_ID,
        quote: { creditRedeemed: 1n, assetsReceived: 1n },
      },
      expected: [midnightBase.midnightBundlesV2],
    },
    {
      type: "midnightTakeLend",
      operation: {
        type: "midnightTakeLend",
        marketId: MARKET_ID,
        quote: { assetsPaid: 1n, unitsBought: 1n },
      },
      expected: [midnightBase.midnightBundlesV2],
    },
    {
      type: "midnightTakeBorrow",
      operation: {
        type: "midnightTakeBorrow",
        marketId: MARKET_ID,
        quote: { unitsSold: 1n, assetsReceived: 1n },
      },
      expected: [midnightBase.midnightBundlesV2],
    },
    {
      type: "midnightTakeWithdraw",
      operation: {
        type: "midnightTakeWithdraw",
        marketId: MARKET_ID,
        quote: { creditRedeemed: 1n, assetsReceived: 1n },
      },
      expected: [midnightBase.midnightBundlesV2],
    },
    {
      type: "midnightSupplyCollateralTakeBorrow",
      operation: {
        type: "midnightSupplyCollateralTakeBorrow",
        marketId: MARKET_ID,
        quote: {
          collateralSupplies: [{ collateralIndex: 0n, assets: 1n }],
          unitsSold: 1n,
          assetsReceived: 1n,
        },
      },
      expected: [midnightBase.midnightBundlesV2],
    },
    {
      type: "midnightRepayWithdrawCollateral",
      operation: {
        type: "midnightRepayWithdrawCollateral",
        marketId: MARKET_ID,
        quote: { assetsPaid: 1n, debtRepaid: 1n },
      },
      expected: [midnightBase.midnightBundlesV2],
    },
    {
      type: "midnightTakeRepayWithdrawCollateral",
      operation: {
        type: "midnightTakeRepayWithdrawCollateral",
        marketId: MARKET_ID,
        quote: { assetsPaid: 1n, debtRepaid: 1n },
      },
      expected: [midnightBase.midnightBundlesV2],
    },
  ] as const)(
    "$type derives the exact Midnight authorizations",
    ({ operation, expected }) => {
      const result = resolveApprovalLimits({
        chainId: 8453,
        owner: OWNER,
        operations: [{ limit: parsed(operation) }],
      });
      expect(
        result.approvals.filter(
          (approval) => approval.type === "midnightAuthorization",
        ),
      ).toEqual(
        expected.map((authorized) => ({
          type: "midnightAuthorization",
          onBehalf: OWNER,
          authorized: requiredAddress(authorized),
        })),
      );
    },
  );

  test("checks Midnight grants on bundles without a Midnight operation", () => {
    const base = getChainAddresses(8453)!;
    const result = resolveApprovalLimits({
      chainId: 8453,
      owner: OWNER,
      operations: [
        {
          limit: parsed({
            type: "blueSupply",
            marketId: MARKET_ID,
            quote: { assetsPaid: 1n, sharesMinted: 1n },
          }),
          approvalToken: TOKEN,
        },
      ],
    });
    expect(result.eventAddresses.midnight).toBe(base.midnight);
    expect(
      result.approvals.some(
        (approval) => approval.type === "midnightAuthorization",
      ),
    ).toBe(false);
  });

  test("fails closed when a Midnight operation's chain has no Midnight address", () => {
    const chainId = 888_000_694;
    registerCustomAddresses({
      addresses: {
        [chainId]: {
          blue: "0x0000000000000000000000000000000000000001",
          adaptiveCurveIrm: "0x0000000000000000000000000000000000000002",
          midnightBundlesV2: "0x0000000000000000000000000000000000000003",
        },
      },
    });
    expect(() =>
      resolveApprovalLimits({
        chainId,
        owner: OWNER,
        operations: [
          {
            limit: { type: "midnightRedeem" },
          } as unknown as ResolvedApprovalOperation,
        ],
      }),
    ).toThrow(ApprovalCheckUnavailableError);
  });

  test("fails closed when a ratifier operation's chain has no ratifier addresses", () => {
    const chainId = 888_000_695;
    registerCustomAddresses({
      addresses: {
        [chainId]: {
          blue: "0x0000000000000000000000000000000000000001",
          adaptiveCurveIrm: "0x0000000000000000000000000000000000000002",
          midnight: "0x0000000000000000000000000000000000000003",
          midnightBundlesV2: "0x0000000000000000000000000000000000000004",
        },
      },
    });
    const resolve = (type: string) => () =>
      resolveApprovalLimits({
        chainId,
        owner: OWNER,
        operations: [
          { limit: { type } } as unknown as ResolvedApprovalOperation,
        ],
      });
    expect(resolve("midnightSupplyCollateral")).not.toThrow();
    expect(resolve("midnightSupplyCollateralMakeBorrow")).toThrow(
      ApprovalCheckUnavailableError,
    );
    expect(resolve("midnightSupplyBlueMakeLend")).toThrow(
      ApprovalCheckUnavailableError,
    );
    expect(resolve("midnightRedeem")).not.toThrow();
  });

  test("fails closed when a Midnight pay-in has no MidnightBundlesV2 on the chain", () => {
    const chainId = 888_000_645;
    registerCustomAddresses({
      addresses: {
        [chainId]: {
          blue: "0x0000000000000000000000000000000000000001",
          adaptiveCurveIrm: "0x0000000000000000000000000000000000000002",
          midnight: "0x0000000000000000000000000000000000000003",
        },
      },
    });
    const resolve = () =>
      resolveApprovalLimits({
        chainId,
        owner: OWNER,
        operations: [
          {
            limit: { type: "midnightSupplyCollateral" },
            midnightApprovalTokens: [COLLATERAL],
          } as unknown as ResolvedApprovalOperation,
        ],
      });
    expect(resolve).toThrow(ApprovalCheckUnavailableError);
    expect(resolve).toThrow(/midnightBundlesV2/);
  });

  test("Midnight pay-ins allow the paid token to Midnight and MidnightBundlesV2", () => {
    const base = getChainAddresses(8453)!;
    const result = resolveApprovalLimits({
      chainId: 8453,
      owner: OWNER,
      operations: [
        {
          limit: { type: "midnightSupplyCollateral" },
          assetsPaid: OTHER,
          midnightApprovalTokens: [COLLATERAL],
        } as unknown as ResolvedApprovalOperation,
        {
          limit: { type: "midnightTakeBorrow" },
          assetsPaid: OTHER,
        } as unknown as ResolvedApprovalOperation,
        {
          limit: { type: "midnightSupplyCollateralTakeBorrow" },
          midnightApprovalTokens: [LOAN],
        } as unknown as ResolvedApprovalOperation,
      ],
    });
    expect(
      result.approvals.filter((approval) => approval.type === "token"),
    ).toEqual([
      {
        type: "token",
        token: COLLATERAL,
        owner: OWNER,
        spender: base.midnight,
      },
      {
        type: "token",
        token: COLLATERAL,
        owner: OWNER,
        spender: base.midnightBundlesV2,
      },
      { type: "token", token: LOAN, owner: OWNER, spender: base.midnight },
      {
        type: "token",
        token: LOAN,
        owner: OWNER,
        spender: base.midnightBundlesV2,
      },
    ]);
  });

  test("skips bundles spenders the registry does not list", () => {
    expect(
      resolveApprovalLimits({
        chainId: 252,
        owner: OWNER,
        operations: [
          {
            limit: parsed({
              type: "vaultV2Deposit",
              vault: VAULT,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
            }),
            approvalToken: TOKEN,
          },
        ],
      }).approvals,
    ).toEqual([{ type: "token", token: TOKEN, owner: OWNER, spender: VAULT }]);
  });
});
