import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, ethAddress, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { UnexpectedTokenTransferError } from "../errors.js";
import { makeCall, makeTransferLog } from "../test-helpers/index.js";
import arcUsdcLogs from "../test-helpers/paired-emitter-arc-usdc.json" with {
  type: "json",
};
import eureLogs from "../test-helpers/paired-emitter-eure.json" with {
  type: "json",
};
import wstHypeLogs from "../test-helpers/paired-emitter-wsthype.json" with {
  type: "json",
};
import type { RawLog, Transfer } from "../types.js";
import { parseTransfers } from "./parsing/transfers.js";
import {
  findUnexpectedSenderTransfers,
  resolveSenderSpendTokens,
} from "./sender-transfers.js";

const owner: Address = "0x1111111111111111111111111111111111111111";
const recipient: Address = "0x2222222222222222222222222222222222222222";
const usdc: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const weth: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const vault: Address = "0x3333333333333333333333333333333333333333";
const marketId =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as MarketId;

const pairs = [
  {
    name: "legacy EURe / EURe v2",
    chainId: 1,
    primary: "0x3231Cb76718CDeF2155FC47b5286d82e6eDA273f",
    paired: "0x39b8B6385416f4cA36a20319F70D28621895279D",
    primaryAmount: 221807379888574931n,
    pairedAmount: 221807379888574931n,
  },
  {
    name: "wstHYPE / stHYPE",
    chainId: 999,
    primary: "0x94e8396e0869c9F2200760aF0621aFd240E1CF38",
    paired: "0xfFaa4a3D97fE9107Cef8a3F48c069F577Ff76cC1",
    primaryAmount: 289318008520960n,
    pairedAmount: 300212164354264n,
  },
  {
    name: "Arc USDC / native mirror",
    chainId: 5042,
    primary: "0x3600000000000000000000000000000000000000",
    paired: "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE",
    primaryAmount: 1_000_000n,
    pairedAmount: 10n ** 18n,
  },
] as const;

describe.each([eureLogs, wstHypeLogs, arcUsdcLogs])(
  "recorded eth_simulateV1 logs: $name",
  (fixture) => {
    const parse = () =>
      parseTransfers([makeCall(fixture.logs as RawLog[])], {
        chainId: 1,
        ...{ wNative: null },
      }).transfers;
    const params = {
      chainId: fixture.chainId,
      owner: fixture.source.holder as Address,
      allowed: new Set([fixture.primary]),
    };

    test("accepts the paired emitter when the primary is spendable on its chain", () => {
      const transfers = parse();
      expect(transfers).toHaveLength(2);
      expect(transfers.map(({ token }) => token.toLowerCase())).toEqual(
        expect.arrayContaining([fixture.primary, fixture.paired]),
      );
      expect(findUnexpectedSenderTransfers({ ...params, transfers })).toEqual(
        [],
      );
    });

    test("flags the paired emitter when nothing is spendable", () => {
      const findings = findUnexpectedSenderTransfers({
        ...params,
        transfers: parse(),
        allowed: new Set(),
      });
      expect(findings).toHaveLength(2);
      expect(
        findings.find(({ token }) => token.toLowerCase() === fixture.paired),
      ).toBeInstanceOf(UnexpectedTokenTransferError);
    });

    test("flags the paired emitter on a different chain", () => {
      const findings = findUnexpectedSenderTransfers({
        ...params,
        transfers: parse(),
        chainId: fixture.chainId === 1 ? 999 : 1,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]).toBeInstanceOf(UnexpectedTokenTransferError);
      expect(findings[0]?.token.toLowerCase()).toBe(fixture.paired);
    });
  },
);

describe.each(pairs)("paired emitters: $name", (pair) => {
  const primary = (): Transfer => ({
    token: pair.primary,
    from: owner,
    to: recipient,
    amount: pair.primaryAmount,
    txIdx: 0,
  });
  const paired = (): Transfer => ({
    ...primary(),
    token: pair.paired,
    amount: pair.pairedAmount,
  });
  const checkPair = (transfers: readonly Transfer[]) =>
    findUnexpectedSenderTransfers({
      chainId: pair.chainId,
      owner,
      transfers,
      allowed: new Set([pair.primary.toLowerCase()]),
    });

  test("accepts parsed real-shaped logs without removing transfer evidence", () => {
    const transfers = parseTransfers(
      [makeCall([makeTransferLog(paired()), makeTransferLog(primary())])],
      { chainId: 1, ...{ wNative: null } },
    ).transfers;
    expect(transfers).toHaveLength(2);
    expect(checkPair(transfers)).toEqual([]);
    expect(transfers).toHaveLength(2);
    expect(checkPair([...transfers].reverse())).toEqual([]);
  });

  test("allows empty evidence and harmless incoming, self and zero transfers", () => {
    expect(checkPair([])).toEqual([]);
    expect(
      checkPair([
        { ...paired(), from: recipient, to: owner },
        { ...paired(), to: owner },
        { ...paired(), amount: 0n },
      ]),
    ).toEqual([]);
  });

  test.each([
    ["missing primary", () => [paired()]],
    ["different recipient", () => [primary(), { ...paired(), to: vault }]],
    ["different transaction", () => [primary(), { ...paired(), txIdx: 1 }]],
    [
      "different primary sender",
      () => [{ ...primary(), from: vault }, paired()],
    ],
    ["zero primary amount", () => [{ ...primary(), amount: 0n }, paired()]],
    [
      "incoming primary",
      () => [{ ...primary(), from: recipient, to: owner }, paired()],
    ],
    ["self primary", () => [{ ...primary(), to: owner }, paired()]],
  ] as const)("ignores paired emitter despite %s", (_name, transfers) => {
    expect(checkPair(transfers())).toEqual([]);
  });

  test("ignores any number of paired events without requiring primary transfer evidence", () => {
    const mirror = paired();
    expect(checkPair([mirror, mirror])).toEqual([]);
    expect(checkPair([primary(), mirror, mirror])).toEqual([]);
    expect(checkPair([primary(), primary(), mirror, mirror])).toEqual([]);
  });

  test("does not mutate the caller's spendable set", () => {
    const allowed = new Set([pair.primary.toLowerCase()]);
    expect(
      findUnexpectedSenderTransfers({
        chainId: pair.chainId,
        owner,
        allowed,
        transfers: [paired()],
      }),
    ).toEqual([]);
    expect([...allowed]).toEqual([pair.primary.toLowerCase()]);
  });

  test("still flags unrelated undeclared tokens", () => {
    expect(checkPair([{ ...paired(), token: weth }])).toHaveLength(1);
  });

  test("matches addresses case-insensitively", () => {
    expect(
      checkPair([
        {
          ...primary(),
          token: pair.primary.toLowerCase() as Address,
          from: owner.toUpperCase().replace("0X", "0x") as Address,
        },
        { ...paired(), token: pair.paired.toLowerCase() as Address },
      ]),
    ).toEqual([]);
  });

  test.each([8453, 5042002])("rejects on unregistered chain %s", (chainId) => {
    const failures = findUnexpectedSenderTransfers({
      chainId,
      owner,
      transfers: [primary(), paired()],
      allowed: new Set([pair.primary.toLowerCase()]),
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toBeInstanceOf(UnexpectedTokenTransferError);
  });

  test("rejects when the primary is not allowed; the exception is directional", () => {
    const failures = findUnexpectedSenderTransfers({
      chainId: pair.chainId,
      owner,
      transfers: [primary(), paired()],
      allowed: new Set(),
    });
    expect(failures).toHaveLength(2);
    expect(
      failures.every((f) => f instanceof UnexpectedTokenTransferError),
    ).toBe(true);
    expect(
      findUnexpectedSenderTransfers({
        chainId: pair.chainId,
        owner,
        transfers: [primary(), paired()],
        allowed: new Set([pair.paired.toLowerCase()]),
      }),
    ).toHaveLength(1);
  });

  test("ignores all paired transfers even if returned later", () => {
    expect(
      checkPair([
        primary(),
        paired(),
        paired(),
        { ...paired(), from: recipient, to: owner },
      ]),
    ).toEqual([]);
  });

  test("an unrelated allowed token cannot cover the paired emitter", () => {
    expect(
      findUnexpectedSenderTransfers({
        chainId: pair.chainId,
        owner,
        allowed: new Set([usdc.toLowerCase()]),
        transfers: [{ ...primary(), token: usdc }, paired()],
      }),
    ).toHaveLength(1);
  });

  test.each([-1n, 1n, 10n ** 30n])(
    "ignores paired delta %s without an amount check",
    (delta) => {
      const failures = checkPair([
        primary(),
        { ...paired(), amount: pair.pairedAmount + delta },
      ]);
      expect(failures).toEqual([]);
    },
  );
});
// biome-ignore lint/complexity/useMaxParams: positional fixture builder
const transfer = (
  token: Address,
  amount: bigint,
  from = owner,
  to = recipient,
): Transfer => ({ token, amount, from, to, txIdx: 0 });
const allowed = resolveSenderSpendTokens({
  chainId: 1,
  owner,
  wNative: weth,
  operations: [
    {
      limit: {
        type: "vaultV2Deposit",
        vault,
        quote: { assetsPaid: 100n, sharesMinted: 100n },
        slippageTolerance: 0n,
      },
      approvalToken: usdc,
    },
  ],
});
const check = (transfers: readonly Transfer[]) =>
  findUnexpectedSenderTransfers({ chainId: 1, owner, transfers, allowed });

describe("sender transfers", () => {
  test.each([10n ** 18n, 123456789n * 10n ** 18n])(
    "rejects an undeclared WETH transfer/sweep of %s after a declared USDC deposit",
    (amount) => {
      const failures = check([transfer(usdc, 100n), transfer(weth, amount)]);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toBeInstanceOf(UnexpectedTokenTransferError);
      expect(failures[0]).toMatchObject({
        token: weth,
        sender: owner,
        recipients: [recipient],
      });
    },
  );
  test("allows the declared token within limits, empty evidence and incoming transfers", () => {
    expect(check([transfer(usdc, 100n)])).toEqual([]);
    expect(check([])).toEqual([]);
    expect(check([transfer(weth, 1n, recipient, owner)])).toEqual([]);
    expect(
      check([transfer(weth, 0n), transfer(weth, 1n, owner, owner)]),
    ).toEqual([]);
  });
  test("rejects transfer-out-then-back and received-then-forwarded tokens", () => {
    expect(
      check([transfer(weth, 1n), transfer(weth, 1n, recipient, owner)]),
    ).toHaveLength(1);
    expect(
      check([transfer(weth, 1n, recipient, owner), transfer(weth, 1n)]),
    ).toHaveLength(1);
  });
  test("rejects undeclared net burns but allows mint-then-burn", () => {
    expect(check([transfer(weth, 1n, owner, zeroAddress)])).toHaveLength(1);
    expect(
      check([
        transfer(weth, 1n, zeroAddress, owner),
        transfer(weth, 1n, owner, zeroAddress),
      ]),
    ).toEqual([]);
  });
  test("rejects native value independently of gas", () => {
    expect(check([transfer(ethAddress, 1n)])).toHaveLength(1);
  });
  test.each([0n, 1n, 2n])(
    "wallet-bound native funding rejects extra debit %s even if returned",
    (extra) => {
      const failures = findUnexpectedSenderTransfers({
        chainId: 1,
        owner,
        allowed,
        nativeValueBudget: 3n,
        transfers: [
          transfer(ethAddress, 3n),
          transfer(ethAddress, 10n, owner, owner),
          transfer(ethAddress, extra),
          transfer(ethAddress, extra, recipient, owner),
        ],
      });
      expect(failures).toHaveLength(extra === 0n ? 0 : 1);
      if (extra > 0n)
        expect(failures[0]).toMatchObject({
          code: "UNEXPECTED_TOKEN_TRANSFER",
          token: ethAddress,
          sender: owner,
          recipients: [recipient],
        });
    },
  );
  test("native budgets allow empty evidence but do not offset burns with incoming ETH", () => {
    expect(
      findUnexpectedSenderTransfers({
        chainId: 1,
        owner,
        allowed,
        nativeValueBudget: 0n,
        transfers: [],
      }),
    ).toEqual([]);
    expect(
      findUnexpectedSenderTransfers({
        chainId: 1,
        owner,
        allowed,
        nativeValueBudget: 0n,
        transfers: [
          transfer(ethAddress, 1n, recipient, owner),
          transfer(ethAddress, 1n, owner, zeroAddress),
        ],
      }),
    ).toHaveLength(1);
  });
  test("fully measured ETH payments use their native measurement rather than the wallet budget", () => {
    expect(
      findUnexpectedSenderTransfers({
        chainId: 1,
        owner,
        allowed: new Set([ethAddress.toLowerCase()]),
        nativeValueBudget: 0n,
        transfers: [transfer(ethAddress, 1n)],
      }),
    ).toEqual([]);
  });
  test.each([false, true])(
    "native alias requires a measured pay-in (%s)",
    (nativeSpendMeasured) => {
      const tokens = resolveSenderSpendTokens({
        chainId: 1,
        owner,
        wNative: weth,
        nativeSpendMeasured: new Set(nativeSpendMeasured ? [0] : []),
        operations: [
          {
            limit: {
              type: "vaultV2Deposit",
              vault,
              assetPaid: usdc,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
            approvalToken: weth,
          },
        ],
      });
      expect(tokens.has(usdc.toLowerCase())).toBe(false);
      expect(tokens.has(weth.toLowerCase())).toBe(true);
      expect(tokens.has(ethAddress.toLowerCase())).toBe(nativeSpendMeasured);
    },
  );
  test.each([undefined, 0, 1])(
    "native measurement %s must belong to the operation permitting wNative spending",
    (measuredIndex) => {
      const tokens = resolveSenderSpendTokens({
        chainId: 1,
        owner,
        wNative: weth,
        nativeSpendMeasured: new Set(
          measuredIndex === undefined ? [] : [measuredIndex],
        ),
        operations: [
          {
            limit: {
              type: "vaultV2Deposit",
              vault,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
            approvalToken: weth,
          },
          {
            limit: {
              type: "vaultV2Deposit",
              vault: recipient,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
            approvalToken: usdc,
          },
        ],
      });
      expect(tokens.has(weth.toLowerCase())).toBe(true);
      expect(tokens.has(ethAddress.toLowerCase())).toBe(measuredIndex === 0);
    },
  );
  test("allows vault-share burns even when the operation needs no approval", () => {
    const tokens = resolveSenderSpendTokens({
      chainId: 1,
      owner,
      operations: [
        {
          limit: {
            type: "vaultV2ForceRedeem",
            vault,
            quote: { sharesBurned: 1n, assetsReceived: 1n },
            slippageTolerance: 0n,
          },
        },
      ],
    });
    expect(
      findUnexpectedSenderTransfers({
        chainId: 1,
        owner,
        transfers: [transfer(vault, 1n, owner, zeroAddress)],
        allowed: tokens,
      }),
    ).toEqual([]);
  });
  test.each(["blueBorrow", "blueWithdrawCollateral"] as const)(
    "%s does not make zero-pull approval tokens spendable",
    (type) => {
      const tokens = resolveSenderSpendTokens({
        chainId: 1,
        owner,
        operations: [
          {
            limit: {
              type,
              marketId,
              quote: {
                assetsReceived: 1n,
                ...(type === "blueBorrow"
                  ? { sharesMinted: 1n }
                  : { collateralWithdrawn: 1n }),
              },
              slippageTolerance: 0n,
            },
            approvalToken: usdc,
          },
        ],
      });
      expect(
        findUnexpectedSenderTransfers({
          chainId: 1,
          owner,
          transfers: [transfer(usdc, 1n)],
          allowed: tokens,
        }),
      ).toHaveLength(1);
    },
  );
  describe.each([
    "blueSupplyCollateralBorrow",
    "blueRepayWithdrawCollateral",
  ] as const)("%s pay-in leg", (type) => {
    test.each([
      "quote-inactive",
      "quote-active",
      "input-inactive",
      "input-active",
    ] as const)("%s controls round-trip spending", (mode) => {
      const active = mode === "quote-active" || mode === "input-active";
      const typed = mode.startsWith("input");
      const common = { marketId, slippageTolerance: 0n };
      const limit =
        type === "blueSupplyCollateralBorrow"
          ? {
              ...common,
              type,
              quote: {
                assetsPaid: 1n,
                sharesMinted: 1n,
                ...(!typed && active ? { collateralSupplied: 1n } : {}),
              },
              ...(typed
                ? {
                    inputs: {
                      borrowAssets: 1n,
                      ...(active ? { collateralAssets: 1n } : {}),
                    },
                  }
                : {}),
            }
          : {
              ...common,
              type,
              quote: {
                assetsPaid: 1n,
                collateralWithdrawn: 1n,
                ...(!typed && active ? { sharesBurned: 1n } : {}),
              },
              ...(typed
                ? {
                    inputs: {
                      collateralAssets: 1n,
                      ...(active ? { repay: { assets: 1n } } : {}),
                    },
                  }
                : {}),
            };
      const tokens = resolveSenderSpendTokens({
        chainId: 1,
        owner,
        operations: [{ limit, approvalToken: usdc }],
      });
      expect(tokens.has(usdc.toLowerCase())).toBe(active);
      expect(
        findUnexpectedSenderTransfers({
          chainId: 1,
          owner,
          allowed: tokens,
          transfers: [],
        }),
      ).toEqual([]);
      const failures = findUnexpectedSenderTransfers({
        chainId: 1,
        owner,
        allowed: tokens,
        transfers: [transfer(usdc, 1n), transfer(usdc, 1n, recipient, owner)],
      });
      expect(failures).toHaveLength(active ? 0 : 1);
      if (!active)
        expect(failures[0]).toMatchObject({
          code: "UNEXPECTED_TOKEN_TRANSFER",
          token: usdc,
          recipients: [recipient],
        });
    });
  });
  test("typed full repayment permits the loan token before quotes are derived", () => {
    const tokens = resolveSenderSpendTokens({
      chainId: 1,
      owner,
      operations: [
        {
          limit: {
            type: "blueRepayWithdrawCollateral",
            marketId,
            inputs: { repay: "full" },
            quote: {},
            slippageTolerance: 0n,
          },
          approvalToken: usdc,
        },
      ],
    });
    expect(
      findUnexpectedSenderTransfers({
        chainId: 1,
        owner,
        allowed: tokens,
        transfers: [transfer(usdc, 1n)],
      }),
    ).toEqual([]);
  });
  test("migration permits source shares, not target shares", () => {
    const tokens = resolveSenderSpendTokens({
      chainId: 1,
      owner,
      operations: [
        {
          limit: {
            type: "vaultV1MigrateToV2",
            sourceVault: vault,
            targetVault: recipient,
            quote: { sharesBurned: 1n, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
        },
      ],
    });
    expect(tokens.has(vault.toLowerCase())).toBe(true);
    expect(tokens.has(recipient.toLowerCase())).toBe(false);
    expect(
      findUnexpectedSenderTransfers({
        chainId: 1,
        owner,
        transfers: [transfer(vault, 1n)],
        allowed: tokens,
      }),
    ).toEqual([]);
  });
  test("Midnight batch pay-ins permit every resolved collateral token", () => {
    const tokens = resolveSenderSpendTokens({
      chainId: 1,
      owner,
      operations: [
        {
          limit: {
            type: "midnightSupplyCollateralBatch",
            marketId,
            quote: {
              collateralSupplies: [
                { collateralIndex: 0n, assets: 1n },
                { collateralIndex: 1n, assets: 1n },
              ],
            },
            slippageTolerance: 0n,
          },
          midnightApprovalTokens: [usdc, weth],
        },
      ],
    });
    expect(
      findUnexpectedSenderTransfers({
        chainId: 1,
        owner,
        transfers: [transfer(usdc, 1n), transfer(weth, 1n)],
        allowed: tokens,
      }),
    ).toEqual([]);
  });
  test("Midnight withdrawal-only limits do not authorize loan-token spending", () => {
    const tokens = resolveSenderSpendTokens({
      chainId: 1,
      owner,
      operations: [
        {
          limit: {
            type: "midnightRepayWithdrawCollateral",
            marketId,
            quote: {
              collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
            },
            slippageTolerance: 0n,
          },
          midnightApprovalTokens: [usdc],
        },
      ],
    });
    const failures = findUnexpectedSenderTransfers({
      chainId: 1,
      owner,
      transfers: [transfer(usdc, 1n)],
      allowed: tokens,
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.code).toBe("UNEXPECTED_TOKEN_TRANSFER");
  });
  test.each(["partial", "full"] as const)(
    "Midnight %s repayment permits the resolved loan token",
    (repay) => {
      const tokens = resolveSenderSpendTokens({
        chainId: 1,
        owner,
        operations: [
          {
            limit: {
              type: "midnightRepayWithdrawCollateral",
              marketId,
              quote: {
                assetsPaid: 1n,
                ...(repay === "partial" ? { debtRepaid: 1n } : {}),
              },
              ...(repay === "full" ? { position: { maxDebt: 0n } } : {}),
              slippageTolerance: 0n,
            },
            midnightApprovalTokens: [usdc],
          },
        ],
      });
      expect(
        findUnexpectedSenderTransfers({
          chainId: 1,
          owner,
          transfers: [transfer(usdc, 1n)],
          allowed: tokens,
        }),
      ).toEqual([]);
    },
  );
});
