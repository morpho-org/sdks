import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, ethAddress, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { UnexpectedTokenTransferError } from "../errors.js";
import type { Transfer } from "../types.js";
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
  findUnexpectedSenderTransfers({ owner, transfers, allowed });

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
        owner,
        allowed,
        nativeValueBudget: 0n,
        transfers: [],
      }),
    ).toEqual([]);
    expect(
      findUnexpectedSenderTransfers({
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
          owner,
          allowed: tokens,
          transfers: [],
        }),
      ).toEqual([]);
      const failures = findUnexpectedSenderTransfers({
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
          owner,
          transfers: [transfer(usdc, 1n)],
          allowed: tokens,
        }),
      ).toEqual([]);
    },
  );
});
