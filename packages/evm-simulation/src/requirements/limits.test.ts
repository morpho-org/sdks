import { type MarketId, MarketParams, MathLib } from "@morpho-org/blue-sdk";
import {
  blueRepay,
  blueRepayWithdrawCollateral,
  blueSupply,
  blueSupplyCollateralBorrow,
  blueWithdraw,
  type TransactionAction,
  vaultV2Deposit,
  vaultV2ForceRedeem,
  vaultV2Redeem,
  vaultV2Withdraw,
} from "@morpho-org/morpho-sdk";
import { type Address, ethAddress, getAddress, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";
import {
  LimitAccountMismatchError,
  MissingExpectedQuoteError,
  SimulationValidationError,
  UnsupportedLimitActionError,
} from "../errors.js";
import type { OperationLimit } from "../limits.js";
import type { SimulateParams } from "../params.js";
import { parseRequest } from "../simulate/request/parse-request.js";
import { toSimulationLimits } from "./limits.js";

const OWNER: Address = "0x0000000000000000000000000000000000000001";
const RECEIVER: Address = "0x0000000000000000000000000000000000000002";
const OTHER: Address = "0x0000000000000000000000000000000000000003";
const VAULT: Address = "0x0000000000000000000000000000000000000010";
const VAULT2: Address = "0x0000000000000000000000000000000000000011";
const MARKET =
  "0x3a85e619c15291105e0c6f876f0a14b4a0c3a1f0f8b7d6c5e4f3a2b1c0d9e8f7" as MarketId;
const MARKET2 =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as MarketId;

const mkAction = <T extends Record<string, unknown>>(args: T) =>
  args as unknown as TransactionAction;

const onlyLimit = (action: TransactionAction, options = {}) =>
  toSimulationLimits(action, { owner: OWNER, ...options })
    .operations[0]! as OperationLimit;

describe("toSimulationLimits", () => {
  it("returns a deep-frozen limits object with exactly one operation", () => {
    const limits = toSimulationLimits(
      mkAction({
        type: "vaultV1Deposit",
        args: {
          vault: VAULT,
          amount: 100n,
          netAssets: 90n,
          maxSharePrice: 10n ** 27n,
          onBehalf: OWNER,
        },
      }),
      { owner: OWNER },
    );
    expect(limits.operations).toHaveLength(1);
    expect(Object.isFrozen(limits)).toBe(true);
    expect(Object.isFrozen(limits.operations)).toBe(true);
    expect(Object.isFrozen(limits.operations[0])).toBe(true);
  });

  describe("per action type", () => {
    it.each([
      {
        type: "vaultV1Deposit",
        args: {
          vault: VAULT,
          amount: 100n,
          netAssets: 90n,
          maxSharePrice: 10n ** 27n,
          onBehalf: OWNER,
        },
        quote: { assetsPaid: 100n, sharesMinted: 90n },
      },
      {
        type: "vaultV2Deposit",
        args: {
          vault: VAULT,
          amount: 100n,
          netAssets: 90n,
          maxSharePrice: 10n ** 27n,
          onBehalf: OWNER,
        },
        quote: { assetsPaid: 100n, sharesMinted: 90n },
      },
      {
        type: "vaultV1Withdraw",
        args: { vault: VAULT, amount: 100n, netAssets: 95n, onBehalf: OWNER },
        expected: { sharesBurned: 50n },
        quote: { assetsReceived: 95n, sharesBurned: 50n },
      },
      {
        type: "vaultV1Redeem",
        args: { vault: VAULT, shares: 50n, onBehalf: OWNER },
        expected: { assetsReceived: 95n },
        quote: { sharesBurned: 50n, assetsReceived: 95n },
      },
      {
        type: "vaultV2ForceWithdraw",
        args: {
          vault: VAULT,
          exitAssets: 100n,
          minSharePriceE27: 2n * 10n ** 27n,
          onBehalf: OWNER,
        },
        expected: { assetsReceived: 90n },
        quote: { sharesBurned: 50n, assetsReceived: 90n },
      },
      {
        type: "vaultV2ForceRedeem",
        args: { vault: VAULT, redeem: { shares: 60n, recipient: OWNER } },
        // `redeem.shares` is not derivable: penalty deallocations burn extra
        // shares, so the total burn comes from `expected`.
        expected: { sharesBurned: 65n, assetsReceived: 90n },
        quote: { sharesBurned: 65n, assetsReceived: 90n },
      },
      {
        type: "vaultV1InKindRedeem",
        args: { vault: VAULT, amount: 100n, onBehalf: OWNER },
        expected: {
          sharesBurned: 50n,
          sharesMinted: 60n,
          positions: [{ marketId: MARKET, supplyShares: 7n }],
        },
        quote: {
          sharesBurned: 50n,
          sharesMinted: 60n,
          positions: [{ marketId: MARKET, supplyShares: 7n }],
        },
      },
      {
        type: "vaultV1MigrateToV2",
        args: {
          sourceVault: VAULT,
          targetVault: VAULT2,
          assets: 0n,
          shares: 50n,
          netAssets: 95n,
          maxSharePriceVaultV2: 10n ** 27n,
          onBehalf: OWNER,
        },
        subject: { sourceVault: VAULT, targetVault: VAULT2 },
        quote: { sharesBurned: 50n, sharesMinted: 95n },
      },
      {
        type: "blueSupply",
        args: { market: MARKET, assets: 100n, onBehalf: OWNER },
        expected: { sharesMinted: 50n },
        quote: { assetsPaid: 100n, sharesMinted: 50n },
      },
      {
        type: "blueWithdraw",
        args: {
          market: MARKET,
          withdrawAssets: 100n,
          withdrawShares: 0n,
          reallocationPenaltyAssets: 0n,
          referralFeeAssets: 10n,
          onBehalf: OWNER,
        },
        expected: { sharesBurned: 50n },
        quote: { assetsReceived: 90n, sharesBurned: 50n },
      },
      {
        type: "blueWithdraw",
        args: {
          market: MARKET,
          withdrawAssets: 0n,
          withdrawShares: 50n,
          reallocationPenaltyAssets: 0n,
          onBehalf: OWNER,
        },
        expected: { assetsReceived: 90n },
        quote: { sharesBurned: 50n, assetsReceived: 90n },
      },
      {
        type: "blueSupplyCollateral",
        args: {
          market: MARKET,
          collateralAssets: 100n,
          borrowAssets: 0n,
          reallocationPenaltyAssets: 0n,
          onBehalf: OWNER,
        },
        quote: { assetsPaid: 100n, collateralSupplied: 100n },
      },
      {
        type: "blueBorrow",
        args: {
          market: MARKET,
          collateralAssets: 0n,
          borrowAssets: 100n,
          reallocationPenaltyAssets: 5n,
          referralFeeAssets: 5n,
          onBehalf: OWNER,
        },
        expected: { sharesMinted: 50n },
        quote: { assetsReceived: 90n, sharesMinted: 50n },
      },
      {
        type: "blueSupplyCollateralBorrow",
        args: {
          market: MARKET,
          collateralAssets: 100n,
          borrowAssets: 80n,
          reallocationPenaltyAssets: 0n,
          onBehalf: OWNER,
        },
        expected: { sharesMinted: 40n, assetsReceived: 80n },
        quote: {
          assetsPaid: 100n,
          collateralSupplied: 100n,
          assetsReceived: 80n,
          sharesMinted: 40n,
        },
      },
      {
        type: "blueRepay",
        args: {
          market: MARKET,
          repayAssets: 100n,
          repayShares: 0n,
          maxRepayAssets: 0n,
          collateralAssets: 0n,
          referralFeeAssets: 10n,
          onBehalf: OWNER,
        },
        expected: { sharesBurned: 50n },
        quote: { assetsPaid: 110n, sharesBurned: 50n },
      },
      {
        type: "blueRepay",
        args: {
          market: MARKET,
          repayAssets: 0n,
          repayShares: 50n,
          maxRepayAssets: 110n,
          collateralAssets: 0n,
          onBehalf: OWNER,
        },
        quote: { assetsPaid: 110n, sharesBurned: 50n },
      },
      {
        type: "blueWithdrawCollateral",
        args: {
          market: MARKET,
          repayAssets: 0n,
          repayShares: 0n,
          collateralAssets: 100n,
          onBehalf: OWNER,
        },
        quote: { collateralWithdrawn: 100n, assetsReceived: 100n },
      },
      {
        type: "blueRepayWithdrawCollateral",
        args: {
          market: MARKET,
          repayAssets: 100n,
          repayShares: 0n,
          collateralAssets: 70n,
          referralFeeAssets: 10n,
          onBehalf: OWNER,
        },
        expected: { sharesBurned: 50n, assetsReceived: 70n },
        quote: {
          assetsPaid: 110n,
          sharesBurned: 50n,
          collateralWithdrawn: 70n,
          assetsReceived: 70n,
        },
      },
      {
        type: "blueRefinance",
        args: {
          sourceMarket: MARKET,
          destinationMarket: MARKET2,
          debtAssets: 100n,
          collateralAssets: 80n,
          onBehalf: OWNER,
        },
        expected: { sharesBurned: 50n, sharesMinted: 60n },
        subject: { sourceMarketId: MARKET, targetMarketId: MARKET2 },
        quote: { sharesBurned: 50n, sharesMinted: 60n },
      },
    ])(
      "$type derives the limit sides",
      ({ type, args, expected, quote, subject }) => {
        const limit = onlyLimit(
          mkAction({ type, args }),
          expected ? { expected } : {},
        );
        expect(limit).toMatchObject({
          type,
          account: OWNER,
          quote,
          ...subject,
        });
        // Every payout side carries the receiver.
        if (quote.assetsReceived !== undefined) {
          expect((limit as { receiver?: Address }).receiver).toBe(OWNER);
        }
      },
    );
  });

  it("rejects an action whose onBehalf differs from owner", () => {
    expect(() =>
      onlyLimit(
        mkAction({
          type: "blueSupply",
          args: { market: MARKET, assets: 100n, onBehalf: OTHER },
        }),
        { expected: { sharesMinted: 50n } },
      ),
    ).toThrowError(LimitAccountMismatchError);
    expect(() =>
      onlyLimit(
        mkAction({
          type: "blueSupply",
          args: { market: MARKET, assets: 100n, onBehalf: OTHER },
        }),
        { expected: { sharesMinted: 50n } },
      ),
    ).toThrowError(/onBehalf/);
  });

  it("rejects a forceRedeem recipient other than receiver", () => {
    expect(() =>
      onlyLimit(
        mkAction({
          type: "vaultV2ForceRedeem",
          args: { vault: VAULT, redeem: { shares: 60n, recipient: OTHER } },
        }),
        { expected: { sharesBurned: 65n, assetsReceived: 90n } },
      ),
    ).toThrowError(LimitAccountMismatchError);
  });

  it("requires expected.sharesBurned on forceRedeem, not just assetsReceived", () => {
    try {
      onlyLimit(
        mkAction({
          type: "vaultV2ForceRedeem",
          args: { vault: VAULT, redeem: { shares: 60n, recipient: OWNER } },
        }),
        { expected: { assetsReceived: 90n } },
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingExpectedQuoteError);
      expect((error as MissingExpectedQuoteError).field).toBe("sharesBurned");
    }
  });

  it("accepts a forceRedeem recipient matching the explicit receiver", () => {
    const limit = onlyLimit(
      mkAction({
        type: "vaultV2ForceRedeem",
        args: { vault: VAULT, redeem: { shares: 60n, recipient: RECEIVER } },
      }),
      {
        receiver: RECEIVER,
        expected: { sharesBurned: 65n, assetsReceived: 90n },
      },
    );
    expect(limit).toMatchObject({ account: OWNER, receiver: RECEIVER });
  });

  it("lets expected override a derived value", () => {
    const limit = onlyLimit(
      mkAction({
        type: "vaultV1Redeem",
        args: { vault: VAULT, shares: 50n, onBehalf: OWNER },
      }),
      { expected: { sharesBurned: 40n, assetsReceived: 95n } },
    );
    expect(limit.quote.sharesBurned).toBe(40n);
  });

  it("passes expected.positions through to an in-kind redeem limit", () => {
    const positions = [
      {
        marketId:
          "0x00000000000000000000000000000000000000000000000000000000000000bb" as const,
        supplyShares: 7n,
      },
    ];
    const limit = onlyLimit(
      mkAction({
        type: "vaultV1InKindRedeem",
        args: { vault: VAULT, amount: 100n, onBehalf: OWNER },
      }),
      { expected: { sharesBurned: 50n, positions } },
    );
    expect(limit.quote.positions).toEqual(positions);
  });

  it("behavior: copies structured expected quotes instead of freezing the caller's input", () => {
    const positions = [{ marketId: MARKET, supplyShares: 7n }];
    const deallocations = [{ marketId: MARKET, assets: 1_000n }];
    const inKind = onlyLimit(
      mkAction({
        type: "vaultV1InKindRedeem",
        args: { vault: VAULT, amount: 100n, onBehalf: OWNER },
      }),
      { expected: { sharesBurned: 50n, positions } },
    );
    const forceRedeem = onlyLimit(
      mkAction({
        type: "vaultV2ForceRedeem",
        args: { vault: VAULT, redeem: { shares: 60n, recipient: OWNER } },
      }),
      {
        expected: {
          sharesBurned: 50n,
          assetsReceived: 90n,
          deallocations,
        },
      },
    );
    expect(Object.isFrozen(positions)).toBe(false);
    expect(Object.isFrozen(positions[0])).toBe(false);
    expect(Object.isFrozen(deallocations)).toBe(false);
    expect(Object.isFrozen(deallocations[0])).toBe(false);
    expect(inKind.quote.positions).toEqual(positions);
    expect(forceRedeem.quote.deallocations).toEqual(deallocations);
    expect(Object.isFrozen(inKind.quote.positions)).toBe(true);
    expect(Object.isFrozen(inKind.quote.positions![0])).toBe(true);
    expect(Object.isFrozen(forceRedeem.quote.deallocations)).toBe(true);
    expect(Object.isFrozen(forceRedeem.quote.deallocations![0])).toBe(true);
  });

  it.each(["vaultV1InKindRedeem", "vaultV2InKindRedeem"] as const)(
    "throws MissingExpectedQuoteError when %s lacks expected.positions",
    (type) => {
      expect(() =>
        onlyLimit(
          mkAction({
            type,
            args: { vault: VAULT, amount: 100n, onBehalf: OWNER },
          }),
          { expected: { sharesBurned: 50n } },
        ),
      ).toThrowError(expect.objectContaining({ field: "positions" }));
      expect(() =>
        onlyLimit(
          mkAction({
            type,
            args: { vault: VAULT, amount: 100n, onBehalf: OWNER },
          }),
          { expected: { sharesBurned: 50n } },
        ),
      ).toThrow(MissingExpectedQuoteError);
    },
  );

  it("throws when a required side is neither derivable nor expected", () => {
    expect(() =>
      onlyLimit(
        mkAction({
          type: "blueSupply",
          args: { market: MARKET, assets: 100n, onBehalf: OWNER },
        }),
      ),
    ).toThrowError(MissingExpectedQuoteError);
    expect(() =>
      onlyLimit(
        mkAction({
          type: "blueSupply",
          args: { market: MARKET, assets: 100n, onBehalf: OWNER },
        }),
      ),
    ).toThrowError(/sharesMinted/);
  });

  it("throws for Midnight and unknown action types", () => {
    for (const type of [
      "midnightPredeposit",
      "midnightDeposit",
      "unknownAction",
    ]) {
      expect(() => onlyLimit(mkAction({ type, args: {} }))).toThrowError(
        UnsupportedLimitActionError,
      );
    }
  });

  it("throws UnsupportedLimitActionError before checking onBehalf", () => {
    // A Midnight action carrying a foreign onBehalf is unsupported first.
    expect(() =>
      onlyLimit(
        mkAction({ type: "midnightTakeBorrow", args: { onBehalf: OTHER } }),
      ),
    ).toThrowError(UnsupportedLimitActionError);
  });

  it("marks native-funded payments with the ETH sentinel", () => {
    const limit = onlyLimit(
      mkAction({
        type: "vaultV1Deposit",
        args: {
          vault: VAULT,
          amount: 100n,
          nativeAmount: 100n,
          netAssets: 90n,
          maxSharePrice: 10n ** 27n,
          onBehalf: OWNER,
        },
      }),
    );
    expect((limit as { assetPaid?: Address }).assetPaid).toBe(ethAddress);
  });

  it("caps a native assets-mode repay at repayAssets plus the referral fee", () => {
    // Real morpho-sdk builder output: funding exceeds repayAssets + fee, and
    // the surplus is reimbursed through the bundle's native unwrap path.
    const tx = blueRepay({
      market: {
        chainId: mainnet.id,
        marketParams: new MarketParams({
          loanToken: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
          collateralToken: getAddress(
            "0x0000000000000000000000000000000000000012",
          ),
          oracle: getAddress("0x0000000000000000000000000000000000000013"),
          irm: getAddress("0x0000000000000000000000000000000000000014"),
          lltv: 860000000000000000n,
        }),
      },
      args: {
        userAddress: OWNER,
        repayAssets: 100n,
        repayShares: 0n,
        maxRepayAssets: 150n,
        nativeAmount: 150n,
        referralFeePct: 10_000_000_000_000_000n,
        referralFeeRecipient: OTHER,
        deadline: 1_900_000_000n,
      },
    });
    const limit = onlyLimit(tx.action, {
      expected: { sharesBurned: 42n },
    });
    expect(limit.quote.assetsPaid).toBe(
      100n + (tx.action.args.referralFeeAssets ?? 0n),
    );
    expect((limit as { assetPaid?: Address }).assetPaid).toBe(ethAddress);
  });

  it("requires expected.sharesBurned for the maxUint256 full-repay sentinel", () => {
    // Real morpho-sdk builder output, not hand-built args.
    const tx = blueRepay({
      market: {
        chainId: mainnet.id,
        marketParams: new MarketParams({
          loanToken: getAddress("0x0000000000000000000000000000000000000011"),
          collateralToken: getAddress(
            "0x0000000000000000000000000000000000000012",
          ),
          oracle: getAddress("0x0000000000000000000000000000000000000013"),
          irm: getAddress("0x0000000000000000000000000000000000000014"),
          lltv: 860000000000000000n,
        }),
      },
      args: {
        userAddress: OWNER,
        repayAssets: 0n,
        repayShares: maxUint256,
        maxRepayAssets: 110n,
        deadline: 1_900_000_000n,
      },
    });
    expect(tx.action.args.repayShares).toBe(maxUint256);
    expect(() => onlyLimit(tx.action)).toThrowError(MissingExpectedQuoteError);
    const limit = onlyLimit(tx.action, {
      expected: { sharesBurned: 42n },
    });
    expect(limit.quote).toEqual({ assetsPaid: 110n, sharesBurned: 42n });
  });

  it("emits the 1n cap on the inactive leg of a single-leg combined use", () => {
    const collateralOnly = onlyLimit(
      mkAction({
        type: "blueSupplyCollateralBorrow",
        args: {
          market: MARKET,
          collateralAssets: 100n,
          borrowAssets: 0n,
          reallocationPenaltyAssets: 0n,
          onBehalf: OWNER,
        },
      }),
    );
    expect(collateralOnly.quote.sharesMinted).toBe(1n);

    const repayOnly = onlyLimit(
      mkAction({
        type: "blueRepayWithdrawCollateral",
        args: {
          market: MARKET,
          repayAssets: 0n,
          repayShares: 50n,
          maxRepayAssets: 110n,
          collateralAssets: 0n,
          onBehalf: OWNER,
        },
      }),
    );
    expect(repayOnly.quote).toEqual({
      assetsPaid: 110n,
      sharesBurned: 50n,
      collateralWithdrawn: 1n,
    });

    const borrowOnly = onlyLimit(
      mkAction({
        type: "blueSupplyCollateralBorrow",
        args: {
          market: MARKET,
          collateralAssets: 0n,
          borrowAssets: 100n,
          reallocationPenaltyAssets: 0n,
          referralFeeAssets: 0n,
          onBehalf: OWNER,
        },
      }),
      { expected: { sharesMinted: 90n } },
    );
    expect(borrowOnly.quote.assetsPaid).toBe(1n);
    expect(borrowOnly.quote.assetsReceived).toBe(100n);

    const withdrawOnly = onlyLimit(
      mkAction({
        type: "blueRepayWithdrawCollateral",
        args: {
          market: MARKET,
          repayAssets: 0n,
          repayShares: 0n,
          maxRepayAssets: 0n,
          collateralAssets: 80n,
          onBehalf: OWNER,
        },
      }),
    );
    expect(withdrawOnly.quote.assetsPaid).toBe(1n);
    expect(withdrawOnly.quote.assetsReceived).toBe(80n);
    expect(withdrawOnly.quote.collateralWithdrawn).toBe(80n);
  });

  it("requires expected.sharesBurned on an assets-mode combined repay", () => {
    expect(() =>
      onlyLimit(
        mkAction({
          type: "blueRepayWithdrawCollateral",
          args: {
            market: MARKET,
            repayAssets: 100n,
            repayShares: 0n,
            collateralAssets: 70n,
            onBehalf: OWNER,
          },
        }),
      ),
    ).toThrowError(MissingExpectedQuoteError);
    expect(
      onlyLimit(
        mkAction({
          type: "blueRepayWithdrawCollateral",
          args: {
            market: MARKET,
            repayAssets: 100n,
            repayShares: 0n,
            collateralAssets: 70n,
            onBehalf: OWNER,
          },
        }),
        { expected: { sharesBurned: 50n, assetsReceived: 70n } },
      ).quote.sharesBurned,
    ).toBe(50n);
  });

  it("requires expected.sharesBurned on a combined full repay", () => {
    expect(() =>
      onlyLimit(
        mkAction({
          type: "blueRepayWithdrawCollateral",
          args: {
            market: MARKET,
            repayAssets: 0n,
            repayShares: maxUint256,
            maxRepayAssets: 110n,
            collateralAssets: 70n,
            onBehalf: OWNER,
          },
        }),
      ),
    ).toThrowError(MissingExpectedQuoteError);
    expect(
      onlyLimit(
        mkAction({
          type: "blueRepayWithdrawCollateral",
          args: {
            market: MARKET,
            repayAssets: 0n,
            repayShares: maxUint256,
            maxRepayAssets: 110n,
            collateralAssets: 70n,
            onBehalf: OWNER,
          },
        }),
        { expected: { sharesBurned: 50n, assetsReceived: 70n } },
      ).quote,
    ).toEqual({
      assetsPaid: 110n,
      sharesBurned: 50n,
      collateralWithdrawn: 70n,
      assetsReceived: 70n,
    });
  });

  it("omits derived zero sides", () => {
    const limit = onlyLimit(
      mkAction({
        type: "blueSupplyCollateral",
        args: {
          market: MARKET,
          collateralAssets: 100n,
          borrowAssets: 0n,
          reallocationPenaltyAssets: 0n,
          onBehalf: OWNER,
        },
      }),
    );
    expect(limit.quote).toEqual({
      assetsPaid: 100n,
      collateralSupplied: 100n,
    });
  });

  it("feeds every helper output through parseRequest", () => {
    const cases: [TransactionAction, { expected?: object }][] = [
      [
        mkAction({
          type: "vaultV1Deposit",
          args: {
            vault: VAULT,
            amount: 100n,
            netAssets: 90n,
            maxSharePrice: 10n ** 27n,
            onBehalf: OWNER,
          },
        }),
        {},
      ],
      [
        mkAction({
          type: "vaultV1Withdraw",
          args: { vault: VAULT, amount: 100n, netAssets: 95n, onBehalf: OWNER },
        }),
        { expected: { sharesBurned: 50n, sharesMinted: 60n } },
      ],
      [
        mkAction({
          type: "vaultV1Redeem",
          args: { vault: VAULT, shares: 50n, onBehalf: OWNER },
        }),
        { expected: { assetsReceived: 95n } },
      ],
      [
        mkAction({
          type: "vaultV2ForceWithdraw",
          args: {
            vault: VAULT,
            exitAssets: 100n,
            minSharePriceE27: 2n * 10n ** 27n,
            onBehalf: OWNER,
          },
        }),
        { expected: { assetsReceived: 90n } },
      ],
      [
        mkAction({
          type: "vaultV2ForceRedeem",
          args: { vault: VAULT, redeem: { shares: 60n, recipient: OWNER } },
        }),
        { expected: { sharesBurned: 65n, assetsReceived: 90n } },
      ],
      [
        mkAction({
          type: "vaultV1InKindRedeem",
          args: { vault: VAULT, amount: 100n, onBehalf: OWNER },
        }),
        {
          expected: {
            sharesBurned: 50n,
            sharesMinted: 60n,
            positions: [{ marketId: MARKET, supplyShares: 7n }],
          },
        },
      ],
      [
        mkAction({
          type: "vaultV1MigrateToV2",
          args: {
            sourceVault: VAULT,
            targetVault: VAULT2,
            shares: 50n,
            netAssets: 95n,
            maxSharePriceVaultV2: 10n ** 27n,
            onBehalf: OWNER,
          },
        }),
        {},
      ],
      [
        mkAction({
          type: "blueSupply",
          args: { market: MARKET, assets: 100n, onBehalf: OWNER },
        }),
        { expected: { sharesMinted: 50n } },
      ],
      [
        mkAction({
          type: "blueWithdraw",
          args: {
            market: MARKET,
            withdrawAssets: 0n,
            withdrawShares: 50n,
            reallocationPenaltyAssets: 0n,
            onBehalf: OWNER,
          },
        }),
        { expected: { assetsReceived: 90n } },
      ],
      [
        mkAction({
          type: "blueSupplyCollateral",
          args: {
            market: MARKET,
            collateralAssets: 100n,
            borrowAssets: 0n,
            reallocationPenaltyAssets: 0n,
            onBehalf: OWNER,
          },
        }),
        {},
      ],
      [
        // Collateral-only combined use: the helper emits the 1n inactive-leg cap.
        mkAction({
          type: "blueSupplyCollateralBorrow",
          args: {
            market: MARKET,
            collateralAssets: 100n,
            borrowAssets: 0n,
            reallocationPenaltyAssets: 0n,
            onBehalf: OWNER,
          },
        }),
        {},
      ],
      [
        // Repay-only combined use: the helper emits the 1n inactive-leg cap.
        mkAction({
          type: "blueRepayWithdrawCollateral",
          args: {
            market: MARKET,
            repayAssets: 0n,
            repayShares: 50n,
            maxRepayAssets: 110n,
            collateralAssets: 0n,
            onBehalf: OWNER,
          },
        }),
        {},
      ],
      [
        // Borrow-only combined use: the supply/pay-in legs quote the 1n
        // inactive-leg cap.
        mkAction({
          type: "blueSupplyCollateralBorrow",
          args: {
            market: MARKET,
            collateralAssets: 0n,
            borrowAssets: 100n,
            reallocationPenaltyAssets: 0n,
            onBehalf: OWNER,
          },
        }),
        { expected: { sharesMinted: 90n } },
      ],
      [
        // Withdraw-only combined use: the repay/pay-in legs quote the 1n
        // inactive-leg cap.
        mkAction({
          type: "blueRepayWithdrawCollateral",
          args: {
            market: MARKET,
            repayAssets: 0n,
            repayShares: 0n,
            maxRepayAssets: 0n,
            collateralAssets: 80n,
            onBehalf: OWNER,
          },
        }),
        {},
      ],
      [
        mkAction({
          type: "blueBorrow",
          args: {
            market: MARKET,
            collateralAssets: 0n,
            borrowAssets: 100n,
            reallocationPenaltyAssets: 0n,
            onBehalf: OWNER,
          },
        }),
        { expected: { sharesMinted: 50n } },
      ],
      [
        mkAction({
          type: "blueRepay",
          args: {
            market: MARKET,
            repayAssets: 100n,
            repayShares: 0n,
            collateralAssets: 0n,
            referralFeeAssets: 10n,
            onBehalf: OWNER,
          },
        }),
        { expected: { sharesBurned: 50n, sharesMinted: 60n } },
      ],
      [
        mkAction({
          type: "blueWithdrawCollateral",
          args: {
            market: MARKET,
            repayAssets: 0n,
            repayShares: 0n,
            collateralAssets: 100n,
            onBehalf: OWNER,
          },
        }),
        {},
      ],
      [
        mkAction({
          type: "blueRefinance",
          args: {
            sourceMarket: MARKET,
            destinationMarket: MARKET2,
            onBehalf: OWNER,
          },
        }),
        { expected: { sharesBurned: 50n, sharesMinted: 60n } },
      ],
    ];
    for (const [txAction, options] of cases) {
      const limits = toSimulationLimits(txAction, {
        owner: OWNER,
        ...options,
      } as Parameters<typeof toSimulationLimits>[1]);
      const params: SimulateParams = {
        chainId: 1,
        transactions: [{ from: OWNER, to: VAULT, data: "0x", value: 0n }],
        limits,
      };
      expect(() => parseRequest(params)).not.toThrow();
    }
  });

  it("keeps the derived side when an expected field is undefined", () => {
    const limit = onlyLimit(
      mkAction({
        type: "vaultV1Deposit",
        args: {
          vault: VAULT,
          amount: 100n,
          netAssets: 90n,
          maxSharePrice: 10n ** 27n,
        },
      }),
      { expected: { assetsPaid: undefined } },
    );
    expect(limit.quote.assetsPaid).toBe(100n);
    expect(limit.quote.sharesMinted).toBe(90n);
  });

  it("passes slippageTolerance through to the limit", () => {
    const limit = onlyLimit(
      mkAction({
        type: "vaultV1Deposit",
        args: {
          vault: VAULT,
          amount: 100n,
          netAssets: 90n,
          maxSharePrice: 10n ** 27n,
        },
      }),
      { slippageTolerance: 5n },
    );
    expect(limit.slippageTolerance).toBe(5n);
  });

  it.each([
    {
      type: "vaultV2ForceWithdraw" as const,
      args: { vault: VAULT, exitAssets: 100n, minSharePriceE27: 0n },
      field: "sharesBurned",
    },
    {
      type: "blueRefinance" as const,
      args: {
        sourceMarket: MARKET,
        destinationMarket: MARKET2,
        onBehalf: OWNER,
      },
      field: "sharesBurned",
    },
    {
      // The reallocation penalty eats the whole borrow, so neither the debt cap
      // nor the payout floor is derivable.
      type: "blueSupplyCollateralBorrow" as const,
      args: {
        market: MARKET,
        collateralAssets: 50n,
        borrowAssets: 100n,
        reallocationPenaltyAssets: 100n,
        onBehalf: OWNER,
      },
      field: "sharesMinted",
    },
    {
      // Active borrow leg with no payout floor: the penalty eats the borrow and
      // expected.sharesMinted above 1n activates assetsReceived.
      type: "blueSupplyCollateralBorrow" as const,
      args: {
        market: MARKET,
        collateralAssets: 50n,
        borrowAssets: 100n,
        reallocationPenaltyAssets: 100n,
        onBehalf: OWNER,
      },
      expected: { sharesMinted: 2n },
      field: "assetsReceived",
    },
    {
      // Active collateral leg (expected.collateralWithdrawn above 1n) with no
      // withdrawn collateral encoded.
      type: "blueRepayWithdrawCollateral" as const,
      args: {
        market: MARKET,
        repayAssets: 0n,
        repayShares: 0n,
        maxRepayAssets: 0n,
        collateralAssets: 0n,
        onBehalf: OWNER,
      },
      expected: { collateralWithdrawn: 2n, sharesBurned: 50n },
      field: "assetsReceived",
    },
    {
      // Active pay-in leg (expected.assetsPaid above 1n) without the supply
      // leg's position side.
      type: "blueSupplyCollateralBorrow" as const,
      args: {
        market: MARKET,
        collateralAssets: 0n,
        borrowAssets: 0n,
        reallocationPenaltyAssets: 0n,
        onBehalf: OWNER,
      },
      expected: { assetsPaid: 2n, sharesMinted: 50n },
      field: "collateralSupplied",
    },
    {
      // Active pay-in leg (expected.assetsPaid above 1n) without the repay
      // leg's position side.
      type: "blueRepayWithdrawCollateral" as const,
      args: {
        market: MARKET,
        repayAssets: 0n,
        repayShares: 0n,
        maxRepayAssets: 0n,
        collateralAssets: 80n,
        onBehalf: OWNER,
      },
      expected: { assetsPaid: 2n },
      field: "sharesBurned",
    },
  ])(
    "throws MissingExpectedQuoteError for $type ($field)",
    ({ type, args, expected, field }) => {
      let error: unknown;
      try {
        onlyLimit(mkAction({ type, args }), expected ? { expected } : {});
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeInstanceOf(MissingExpectedQuoteError);
      expect((error as MissingExpectedQuoteError).field).toBe(field);
    },
  );

  it.each([
    {
      type: "blueSupplyCollateralBorrow",
      args: {
        market: MARKET,
        collateralAssets: 100n,
        borrowAssets: 80n,
        reallocationPenaltyAssets: 0n,
        onBehalf: OWNER,
      },
      expected: { sharesMinted: 40n, assetsReceived: 80n },
    },
    {
      type: "blueRepayWithdrawCollateral",
      args: {
        market: MARKET,
        repayAssets: 100n,
        repayShares: 0n,
        collateralAssets: 70n,
        referralFeeAssets: 10n,
        onBehalf: OWNER,
      },
      expected: { sharesBurned: 50n, assetsReceived: 70n },
    },
    {
      type: "blueRepayWithdrawCollateral",
      args: {
        market: MARKET,
        repayAssets: 0n,
        repayShares: 50n,
        maxRepayAssets: 110n,
        collateralAssets: 70n,
        onBehalf: OWNER,
      },
      expected: { assetsReceived: 70n },
    },
  ])(
    "behavior: $type with both legs active requires expected.assetsReceived",
    ({ type, args, expected }) => {
      // Both legs net in the wallet on a same-token market, so the payout
      // floor is underivable and must come from `expected`.
      const action = mkAction({ type, args });
      const { assetsReceived, ...withoutProceeds } = expected;
      let error: unknown;
      try {
        onlyLimit(action, { expected: withoutProceeds });
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeInstanceOf(MissingExpectedQuoteError);
      expect((error as MissingExpectedQuoteError).field).toBe("assetsReceived");

      const limits = toSimulationLimits(action, {
        owner: OWNER,
        expected,
      });
      expect(limits.operations[0]?.quote.assetsReceived).toBe(assetsReceived);
      const params: SimulateParams = {
        chainId: 1,
        transactions: [{ from: OWNER, to: VAULT, data: "0x", value: 0n }],
        limits,
      };
      expect(() => parseRequest(params)).not.toThrow();
    },
  );

  it("rejects a non-owner receiver on any action but vaultV2ForceRedeem", () => {
    const error = (() => {
      try {
        onlyLimit(
          mkAction({
            type: "vaultV2Redeem",
            args: { vault: VAULT, shares: 50n, assets: 90n },
          }),
          { receiver: RECEIVER, expected: { assetsReceived: 90n } },
        );
      } catch (thrown) {
        return thrown;
      }
    })();
    expect(error).toBeInstanceOf(LimitAccountMismatchError);
    expect((error as LimitAccountMismatchError).field).toBe("receiver");
    expect((error as LimitAccountMismatchError).message).toBe(
      `receiver: "${RECEIVER}" was passed, but this action pays msg.sender, ` +
        `so the limit measures "${OWNER}". Omit receiver or set it to ` +
        `owner; only vaultV2ForceRedeem encodes a distinct receiver.`,
    );
  });

  it("passes the receiver through on vaultV2ForceRedeem", () => {
    const limit = onlyLimit(
      mkAction({
        type: "vaultV2ForceRedeem",
        args: { vault: VAULT, redeem: { shares: 60n, recipient: RECEIVER } },
      }),
      {
        receiver: RECEIVER,
        expected: { sharesBurned: 65n, assetsReceived: 90n },
      },
    );
    expect(limit).toMatchObject({ account: OWNER, receiver: RECEIVER });
  });

  describe("real morpho-sdk builder fixtures", () => {
    const marketParams = new MarketParams({
      loanToken: getAddress("0x0000000000000000000000000000000000000011"),
      collateralToken: getAddress("0x0000000000000000000000000000000000000012"),
      oracle: getAddress("0x0000000000000000000000000000000000000013"),
      irm: getAddress("0x0000000000000000000000000000000000000014"),
      lltv: 860000000000000000n,
    });
    const DEADLINE = 1_900_000_000n;
    const ASSET = getAddress("0x0000000000000000000000000000000000000015");
    const ADAPTER = getAddress("0x0000000000000000000000000000000000000016");
    const FEE_PCT = 10000000000000000n; // 1%
    const PENALTY = 10000000000000000n; // 1%

    it("vaultV2Deposit derives assetsPaid and the share-price floor", () => {
      const tx = vaultV2Deposit({
        vault: { chainId: mainnet.id, address: VAULT, asset: ASSET },
        args: {
          amount: 1_000n,
          maxSharePrice: 2n * 10n ** 27n,
          referralFeePct: FEE_PCT,
          referralFeeRecipient: OTHER,
          userAddress: OWNER,
          deadline: DEADLINE,
        },
      });
      const limit = onlyLimit(tx.action);
      expect(limit).toMatchObject({ type: "vaultV2Deposit", vault: VAULT });
      expect(limit.quote).toEqual({
        assetsPaid: tx.action.args.amount,
        sharesMinted: MathLib.mulDivDown(
          tx.action.args.netAssets,
          MathLib.RAY,
          tx.action.args.maxSharePrice,
        ),
      });
      expect(tx.action.args.referralFeeAssets).toBeGreaterThan(0n);
      expect(tx.action.args.netAssets).toBe(
        tx.action.args.amount - tx.action.args.referralFeeAssets,
      );
    });

    it("vaultV2Withdraw derives the fee-deducted payout", () => {
      const tx = vaultV2Withdraw({
        vault: { chainId: mainnet.id, address: VAULT },
        args: {
          amount: 1_000n,
          referralFeePct: FEE_PCT,
          referralFeeRecipient: OTHER,
          userAddress: OWNER,
          deadline: DEADLINE,
        },
      });
      const limit = onlyLimit(tx.action, {
        expected: { sharesBurned: 40n },
      });
      expect(tx.action.args.referralFeeAssets).toBeGreaterThan(0n);
      expect(limit.quote).toEqual({
        assetsReceived: tx.action.args.netAssets,
        sharesBurned: 40n,
      });
    });

    it("vaultV2Redeem derives sharesBurned", () => {
      const tx = vaultV2Redeem({
        vault: { chainId: mainnet.id, address: VAULT },
        args: { shares: 50n, userAddress: OWNER, deadline: DEADLINE },
      });
      const limit = onlyLimit(tx.action, {
        expected: { assetsReceived: 90n },
      });
      expect(limit.quote).toEqual({
        sharesBurned: tx.action.args.shares,
        assetsReceived: 90n,
      });
    });

    it("vaultV2ForceRedeem carries deallocations and requires expected sharesBurned", () => {
      const tx = vaultV2ForceRedeem({
        vault: { address: VAULT },
        args: {
          deallocations: [{ adapter: ADAPTER, marketParams, amount: 1_000n }],
          redeem: { shares: 50n, recipient: OWNER },
          onBehalf: OWNER,
        },
      });
      expect(tx.action.args.deallocations.length).toBeGreaterThan(0);
      expect(() =>
        onlyLimit(tx.action, { expected: { assetsReceived: 90n } }),
      ).toThrowError(MissingExpectedQuoteError);
      const limit = onlyLimit(tx.action, {
        expected: { sharesBurned: 60n, assetsReceived: 90n },
      });
      expect(limit.quote).toEqual({ sharesBurned: 60n, assetsReceived: 90n });
    });

    it("vaultV2ForceRedeem passes expected penalty and deallocations through", () => {
      const deallocations = [{ marketId: MARKET, assets: 1_000n }] as const;
      const tx = vaultV2ForceRedeem({
        vault: { address: VAULT },
        args: {
          deallocations: [{ adapter: ADAPTER, marketParams, amount: 1_000n }],
          redeem: { shares: 50n, recipient: OWNER },
          onBehalf: OWNER,
        },
      });
      const limits = toSimulationLimits(tx.action, {
        owner: OWNER,
        expected: {
          sharesBurned: 60n,
          assetsReceived: 90n,
          penalty: 0n,
          deallocations: [...deallocations],
        },
      });
      const quote = (limits.operations[0] as OperationLimit).quote;
      expect(quote.penalty).toBe(0n);
      expect(quote.deallocations).toEqual([...deallocations]);
      const params: SimulateParams = {
        chainId: 1,
        transactions: [{ from: OWNER, to: VAULT, data: "0x", value: 0n }],
        limits,
      };
      expect(() => parseRequest(params)).not.toThrow();
    });

    it("blueSupply derives assetsPaid from the gross funded amount", () => {
      const tx = blueSupply({
        market: { chainId: mainnet.id, marketParams },
        args: {
          userAddress: OWNER,
          assets: 1_000n,
          referralFeePct: FEE_PCT,
          referralFeeRecipient: OTHER,
          deadline: DEADLINE,
        },
      });
      expect(tx.action.args.referralFeeAssets).toBeGreaterThan(0n);
      const limit = onlyLimit(tx.action, {
        expected: { sharesMinted: 90n },
      });
      expect(limit.quote).toEqual({
        assetsPaid: tx.action.args.assets,
        sharesMinted: 90n,
      });
    });

    it("passes an explicit 0n expected through to parseRequest's rejection", () => {
      const tx = blueSupply({
        market: { chainId: mainnet.id, marketParams },
        args: {
          userAddress: OWNER,
          assets: 1_000n,
          referralFeePct: FEE_PCT,
          referralFeeRecipient: OTHER,
          deadline: DEADLINE,
        },
      });
      const limits = toSimulationLimits(tx.action, {
        owner: OWNER,
        expected: { sharesMinted: 0n },
      });
      expect(limits.operations[0]?.quote.sharesMinted).toBe(0n);
      const params: SimulateParams = {
        chainId: 1,
        transactions: [{ from: OWNER, to: VAULT, data: "0x", value: 0n }],
        limits,
      };
      expect(() => parseRequest(params)).toThrowError(
        SimulationValidationError,
      );
    });

    it("blueWithdraw derives the penalty- and fee-deducted payout", () => {
      const tx = blueWithdraw({
        market: { chainId: mainnet.id, marketParams },
        args: {
          userAddress: OWNER,
          withdrawAssets: 1_000n,
          withdrawShares: 0n,
          reallocations: [
            {
              vault: VAULT2,
              from: { type: "idle" },
              to: { adapter: ADAPTER },
              assets: 500n,
              penalty: PENALTY,
            },
          ],
          referralFeePct: FEE_PCT,
          referralFeeRecipient: OTHER,
          deadline: DEADLINE,
        },
      });
      const { withdrawAssets, reallocationPenaltyAssets, referralFeeAssets } =
        tx.action.args;
      expect(reallocationPenaltyAssets).toBeGreaterThan(0n);
      expect(referralFeeAssets).toBeGreaterThan(0n);
      const limit = onlyLimit(tx.action, {
        expected: { sharesBurned: 40n },
      });
      expect(limit.quote).toEqual({
        assetsReceived:
          withdrawAssets -
          reallocationPenaltyAssets -
          (referralFeeAssets ?? 0n),
        sharesBurned: 40n,
      });
    });

    it("blueSupplyCollateralBorrow derives both legs' sides", () => {
      const tx = blueSupplyCollateralBorrow({
        market: { chainId: mainnet.id, marketParams },
        args: {
          userAddress: OWNER,
          collateralAssets: 1_000n,
          borrowAssets: 800n,
          maxLtv: maxUint256,
          reallocations: [
            {
              vault: VAULT2,
              from: { type: "idle" },
              to: { adapter: ADAPTER },
              assets: 400n,
              penalty: PENALTY,
            },
          ],
          referralFeePct: FEE_PCT,
          referralFeeRecipient: OTHER,
          deadline: DEADLINE,
        },
      });
      const { borrowAssets, reallocationPenaltyAssets, referralFeeAssets } =
        tx.action.args;
      expect(reallocationPenaltyAssets).toBeGreaterThan(0n);
      expect(referralFeeAssets).toBeGreaterThan(0n);
      const limit = onlyLimit(tx.action, {
        expected: {
          sharesMinted: 70n,
          assetsReceived:
            borrowAssets - reallocationPenaltyAssets - referralFeeAssets,
        },
      });
      expect(limit.quote).toEqual({
        assetsPaid: tx.action.args.collateralAssets,
        collateralSupplied: tx.action.args.collateralAssets,
        assetsReceived:
          borrowAssets - reallocationPenaltyAssets - referralFeeAssets,
        sharesMinted: 70n,
      });
    });

    it("blueRepayWithdrawCollateral derives the fee-inclusive pay-in cap", () => {
      const tx = blueRepayWithdrawCollateral({
        market: { chainId: mainnet.id, marketParams },
        args: {
          userAddress: OWNER,
          repayAssets: 1_000n,
          repayShares: 0n,
          maxRepayAssets: 1_100n,
          collateralAssets: 500n,
          maxLtv: maxUint256,
          referralFeePct: FEE_PCT,
          referralFeeRecipient: OTHER,
          deadline: DEADLINE,
        },
      });
      expect(tx.action.args.referralFeeAssets).toBeGreaterThan(0n);
      const limit = onlyLimit(tx.action, {
        expected: {
          sharesBurned: 40n,
          assetsReceived: tx.action.args.collateralAssets,
        },
      });
      expect(limit.quote).toEqual({
        assetsPaid:
          tx.action.args.repayAssets + (tx.action.args.referralFeeAssets ?? 0n),
        sharesBurned: 40n,
        collateralWithdrawn: tx.action.args.collateralAssets,
        assetsReceived: tx.action.args.collateralAssets,
      });
    });

    it("requires expected.sharesBurned on an assets-mode repay leg under the cap", () => {
      // `repayAssets: 1n` with no fee derives `assetsPaid: 1n`, which reads as
      // an inactive pay-in leg to the conditional rules — the repay leg still
      // runs.
      const tx = blueRepayWithdrawCollateral({
        market: { chainId: mainnet.id, marketParams },
        args: {
          userAddress: OWNER,
          repayAssets: 1n,
          repayShares: 0n,
          maxRepayAssets: 1n,
          collateralAssets: 80n,
          maxLtv: maxUint256,
          deadline: DEADLINE,
        },
      });
      let thrown: unknown;
      try {
        onlyLimit(tx.action);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(MissingExpectedQuoteError);
      expect((thrown as MissingExpectedQuoteError).field).toBe("sharesBurned");

      const limit = onlyLimit(tx.action, {
        expected: { sharesBurned: 40n, assetsReceived: 80n },
      });
      expect(limit.quote.sharesBurned).toBe(40n);
    });
  });
});
