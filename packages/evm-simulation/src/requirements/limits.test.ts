import {
  type MarketId,
  MarketParams,
  MarketUtils,
  MathLib,
} from "@morpho-org/blue-sdk";
import {
  blueRepay,
  blueRepayWithdrawCollateral,
  blueSupply,
  blueSupplyCollateral,
  blueSupplyCollateralBorrow,
  blueWithdraw,
  type MidnightBuyTarget,
  midnightCancelAndMake,
  midnightRedeem,
  midnightRepayWithdrawCollateral,
  midnightSupplyCollateral,
  midnightSupplyCollateralTakeBorrow,
  midnightTakeBorrow,
  midnightTakeLend,
  midnightTakeRepayWithdrawCollateral,
  midnightTakeWithdraw,
  type TransactionAction,
  vaultV2Deposit,
  vaultV2ForceRedeem,
  vaultV2Redeem,
  vaultV2Withdraw,
} from "@morpho-org/morpho-sdk";
import {
  MarketParams as MidnightMarketParams,
  Offer,
} from "@morpho-org/morpho-sdk/midnight/entities";
import {
  MarketUtils as MidnightMarketUtils,
  OfferUtils,
} from "@morpho-org/morpho-sdk/midnight/utils";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  ethAddress,
  getAddress,
  type Hex,
  maxUint256,
  zeroAddress,
  zeroHash,
} from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";
import {
  AmbiguousExpectedQuoteError,
  LimitAccountMismatchError,
  MissingExpectedQuoteError,
  SimulationValidationError,
  UnsupportedLimitActionError,
} from "../errors.js";
import type { MidnightMarketStruct, OperationLimit } from "../limits.js";
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
const BLUE_LOAN = getChainAddress(base.id, "usdc");
const W_NATIVE = getChainAddress(base.id, "wNative");
const MIDNIGHT_MARKET = new MidnightMarketParams({
  chainId: base.id,
  midnight: getChainAddress(base.id, "midnight"),
  loanToken: BLUE_LOAN,
  collateralParams: [
    {
      token: W_NATIVE,
      lltv: 770000000000000000n,
      liquidationCursor: 300000000000000000n,
      oracle: "0x0000000000000000000000000000000000080000",
    },
  ],
  maturity: 2_000_000_000n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});

const makeMidnightCancelAndMake = (
  options: {
    readonly loanToken?: Address;
    readonly assets?: bigint;
    readonly nativeAmount?: bigint;
    readonly blue?: boolean;
    readonly collateral?: boolean;
  } = {},
) =>
  midnightCancelAndMake({
    chainId: base.id,
    cancellations: [],
    deadline: maxUint256,
    ...(options.nativeAmount === undefined
      ? {}
      : { nativeAmount: options.nativeAmount }),
    publication: {
      ratifier: getChainAddress(base.id, "rateRatifierV1"),
      root: `0x${"11".repeat(32)}`,
      groups: [`0x${"22".repeat(32)}`],
      payload: "0x1234",
      ...(options.blue === false
        ? {}
        : {
            blueSupply: {
              market: {
                loanToken: options.loanToken ?? BLUE_LOAN,
                collateralToken: zeroAddress,
                oracle: zeroAddress,
                irm: zeroAddress,
                lltv: 0n,
              },
              assets: options.assets ?? 100n,
              callbackSalt: zeroHash,
            },
          }),
      ...(options.collateral
        ? {
            collateral: {
              market: MIDNIGHT_MARKET,
              supplies: [{ collateralIndex: 0n, assets: 40n }],
            },
          }
        : {}),
    },
  });

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
        mkAction({ type: "midnightCancelAndMake", args: { onBehalf: OTHER } }),
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

  it("rejects expected collateral withdrawals for a Blue repay", () => {
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
        repayAssets: 100n,
        repayShares: 0n,
        maxRepayAssets: 110n,
        deadline: 1_900_000_000n,
      },
    });
    expect(() =>
      onlyLimit(tx.action, {
        expected: {
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
        },
      }),
    ).toThrowError(
      'expected.collateralWithdrawals: action "blueRepay" withdraws no collateral',
    );
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
        `owner; only vaultV2ForceRedeem, midnightRedeem, midnightTakeBorrow, ` +
        `midnightSupplyCollateralTakeBorrow, midnightTakeWithdraw and a collateral-withdrawing ` +
        `midnightRepayWithdrawCollateral or ` +
        `midnightTakeRepayWithdrawCollateral encode a distinct receiver.`,
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
    const mainnetWNative = getChainAddress(mainnet.id, "wNative");
    const nativeLoanMarketParams = new MarketParams({
      loanToken: mainnetWNative,
      collateralToken: marketParams.collateralToken,
      oracle: marketParams.oracle,
      irm: marketParams.irm,
      lltv: marketParams.lltv,
    });
    const nativeCollateralMarketParams = new MarketParams({
      loanToken: marketParams.loanToken,
      collateralToken: mainnetWNative,
      oracle: marketParams.oracle,
      irm: marketParams.irm,
      lltv: marketParams.lltv,
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

    it.each([
      {
        name: "blueSupply",
        action: blueSupply({
          market: { chainId: mainnet.id, marketParams: nativeLoanMarketParams },
          args: {
            userAddress: OWNER,
            assets: 1_000n,
            nativeAmount: 1_000n,
            deadline: DEADLINE,
          },
        }).action,
        options: { expected: { sharesMinted: 1n } },
      },
      {
        name: "blueSupplyCollateral",
        action: blueSupplyCollateral({
          market: {
            chainId: mainnet.id,
            marketParams: nativeCollateralMarketParams,
          },
          args: {
            userAddress: OWNER,
            collateralAssets: 1_000n,
            nativeAmount: 1_000n,
            deadline: DEADLINE,
          },
        }).action,
        options: {},
      },
      {
        name: "blueSupplyCollateralBorrow",
        action: blueSupplyCollateralBorrow({
          market: {
            chainId: mainnet.id,
            marketParams: nativeCollateralMarketParams,
          },
          args: {
            userAddress: OWNER,
            collateralAssets: 1_000n,
            borrowAssets: 0n,
            maxLtv: maxUint256,
            nativeAmount: 1_000n,
            deadline: DEADLINE,
          },
        }).action,
        options: {},
      },
      {
        name: "blueRepayWithdrawCollateral",
        action: blueRepayWithdrawCollateral({
          market: { chainId: mainnet.id, marketParams: nativeLoanMarketParams },
          args: {
            userAddress: OWNER,
            repayAssets: 1_000n,
            repayShares: 0n,
            maxRepayAssets: 1_000n,
            collateralAssets: 0n,
            maxLtv: maxUint256,
            nativeAmount: 1_000n,
            deadline: DEADLINE,
          },
        }).action,
        options: { expected: { sharesBurned: 1n } },
      },
      {
        name: "vaultV2Deposit",
        action: vaultV2Deposit({
          vault: {
            chainId: mainnet.id,
            address: VAULT,
            asset: mainnetWNative,
          },
          args: {
            nativeAmount: 1_000n,
            maxSharePrice: 2n * MathLib.RAY,
            userAddress: OWNER,
            deadline: DEADLINE,
          },
        }).action,
        options: {},
      },
    ])("$name derives assetPaid from native funding", ({ action, options }) => {
      const limit = onlyLimit(action, options);
      expect((limit as { assetPaid?: Address }).assetPaid).toBe(ethAddress);
    });

    it("leaves assetPaid undefined for a builder output without native funding", () => {
      const tx = blueSupply({
        market: { chainId: mainnet.id, marketParams: nativeLoanMarketParams },
        args: { userAddress: OWNER, assets: 1_000n, deadline: DEADLINE },
      });
      const limit = onlyLimit(tx.action, {
        expected: { sharesMinted: 1n },
      });
      expect((limit as { assetPaid?: Address }).assetPaid).toBeUndefined();
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

describe("toSimulationLimits — midnightSupplyCollateral", () => {
  const midnight = getChainAddress(base.id, "midnight");
  const collateralParams = {
    lltv: 770000000000000000n,
    liquidationCursor: 300000000000000000n,
    oracle: getAddress("0x0000000000000000000000000000000000000013"),
  };
  const market = new MidnightMarketParams({
    chainId: base.id,
    midnight,
    loanToken: getAddress("0x0000000000000000000000000000000000000011"),
    collateralParams: [
      {
        token: getAddress("0x0000000000000000000000000000000000000012"),
        ...collateralParams,
      },
      {
        token: getAddress("0x0000000000000000000000000000000000000014"),
        ...collateralParams,
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: getAddress("0x0000000000000000000000000000000000000000"),
    liquidatorGate: getAddress("0x0000000000000000000000000000000000000000"),
  });
  const marketStruct = MidnightMarketUtils.toStruct(market);
  const supply = (onBehalf: Address) =>
    midnightSupplyCollateral({
      chainId: base.id,
      market,
      collateralIndex: 1n,
      assets: 2_000n,
      onBehalf,
    });
  const makerRoot = `0x${"aa".repeat(32)}` as Hex;
  const makerGroup = `0x${"bb".repeat(32)}` as Hex;
  const maker = (
    collateralSupplies?: readonly {
      readonly collateralIndex: bigint;
      readonly assets: bigint;
    }[],
    includeBlueSupply = false,
  ) =>
    midnightCancelAndMake({
      chainId: base.id,
      cancellations: [],
      deadline: maxUint256,
      publication: {
        ratifier: getChainAddress(base.id, "rateRatifierV1"),
        root: makerRoot,
        groups: [makerGroup],
        payload: "0x1234",
        ...(collateralSupplies !== undefined
          ? { collateral: { market, supplies: collateralSupplies } }
          : {}),
        ...(includeBlueSupply
          ? {
              blueSupply: {
                market: {
                  loanToken: getAddress(
                    "0x0000000000000000000000000000000000000021",
                  ),
                  collateralToken: getAddress(
                    "0x0000000000000000000000000000000000000022",
                  ),
                  oracle: getAddress(
                    "0x0000000000000000000000000000000000000023",
                  ),
                  irm: getAddress("0x0000000000000000000000000000000000000024"),
                  lltv: 0n,
                },
                assets: 100n,
                callbackSalt: zeroHash,
              },
            }
          : {}),
      },
    });
  const parse = (limits: ReturnType<typeof toSimulationLimits>) =>
    parseRequest({
      chainId: base.id,
      transactions: [{ from: OWNER, to: midnight, data: "0x", value: 0n }],
      limits,
    });

  it("derives the debit cap and indexed collateral floor from the real builder", () => {
    const tx = supply(OWNER);
    const limits = toSimulationLimits(tx.action, {
      owner: OWNER,
      market: marketStruct,
    });
    expect(limits.operations).toEqual([
      {
        type: "midnightSupplyCollateral",
        marketId: tx.action.args.market,
        market: expect.objectContaining({ loanToken: market.loanToken }),
        collateralIndex: 1n,
        account: OWNER,
        quote: { assetsPaid: 2_000n, collateralSupplied: 2_000n },
      },
    ]);
    expect(Object.isFrozen(market)).toBe(false);
    expect(() => parse(limits)).not.toThrow();
  });

  it("rejects an invalid market struct with validation context", () => {
    const tx = supply(OWNER);
    const invalidMarket = {
      ...marketStruct,
      maturity: "invalid",
    } as unknown as MidnightMarketStruct;
    let thrown: unknown;
    try {
      toSimulationLimits(tx.action, { owner: OWNER, market: invalidMarket });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SimulationValidationError);
    expect(thrown).toMatchObject({
      message:
        "market: must be a valid Midnight market struct; pass the struct used to build the action.",
      cause: expect.any(Error),
    });
  });

  it("forwards the market struct to every derived maker collateral operation", () => {
    const tx = maker([
      { collateralIndex: 1n, assets: 2_000n },
      { collateralIndex: 0n, assets: 3_000n },
    ]);
    const limits = toSimulationLimits(tx.action, {
      owner: OWNER,
      market: marketStruct,
    });
    expect(limits.operations).toHaveLength(2);
    for (const operation of limits.operations) {
      expect(operation).toMatchObject({
        type: "midnightSupplyCollateral",
        marketId: MidnightMarketUtils.toId(market),
        market: MidnightMarketUtils.toStruct(market),
      });
    }
    expect(() => parse(limits)).not.toThrow();
  });

  it("drops market when the maker action has a Blue supply", () => {
    const tx = maker(undefined, true);
    const limits = toSimulationLimits(tx.action, {
      owner: OWNER,
      market: marketStruct,
      expected: { sharesMinted: 10n },
    });
    expect(limits.operations[0]).toMatchObject({
      type: "midnightSupplyBlueMakeLend",
    });
    expect(limits.operations[0]).not.toHaveProperty("market");
    expect(() => parse(limits)).not.toThrow();
  });

  it("measures collateral on the intended onBehalf, independently of the sender", () => {
    const tx = supply(OTHER);
    const limits = toSimulationLimits(tx.action, {
      owner: OWNER,
      onBehalf: OTHER,
    });
    expect((limits.operations[0] as OperationLimit).account).toBe(OTHER);
    expect(() => parse(limits)).not.toThrow();
  });

  it("rejects collateral built for an account other than the intended one", () => {
    let thrown: unknown;
    try {
      toSimulationLimits(supply(OTHER).action, { owner: OWNER });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LimitAccountMismatchError);
    expect(thrown).toMatchObject({
      field: "onBehalf",
      expected: OWNER,
      actual: OTHER,
    });
    expect(() =>
      toSimulationLimits(supply(OWNER).action, {
        owner: OWNER,
        onBehalf: OTHER,
      }),
    ).toThrowError(LimitAccountMismatchError);
  });

  it("rejects onBehalf intent on actions that act for owner", () => {
    expect(() =>
      onlyLimit(
        mkAction({
          type: "blueSupply",
          args: { market: MARKET, assets: 100n, onBehalf: OWNER },
        }),
        { onBehalf: OTHER, expected: { sharesMinted: 50n } },
      ),
    ).toThrowError(
      expect.objectContaining({
        name: "LimitAccountMismatchError",
        field: "options.onBehalf",
        message: expect.stringMatching(/^onBehalf: ".*" was passed/),
      }),
    );
  });

  it("lets expected carry an aggregate quote for two supplies in one bundle", () => {
    const limits = toSimulationLimits(supply(OWNER).action, {
      owner: OWNER,
      expected: { assetsPaid: 4_000n, collateralSupplied: 4_000n },
    });
    expect((limits.operations[0] as OperationLimit).quote).toEqual({
      assetsPaid: 4_000n,
      collateralSupplied: 4_000n,
    });
    expect(() => parse(limits)).not.toThrow();
  });

  it("derives callback position and wallet debit quotes for Midnight Blue parking", () => {
    const tx = makeMidnightCancelAndMake();
    const sharesMinted = 10n;
    expect(onlyLimit(tx.action, { expected: { sharesMinted } })).toMatchObject({
      type: "midnightSupplyBlueMakeLend",
      loanToken: BLUE_LOAN,
      marketId: MarketUtils.getMarketId({
        loanToken: BLUE_LOAN,
        collateralToken: zeroAddress,
        oracle: zeroAddress,
        irm: zeroAddress,
        lltv: 0n,
      }),
      callbackSalt: zeroHash,
      account: OWNER,
      quote: { assetsPaid: 100n, sharesMinted },
    });
  });

  it("quotes the full parked amount for partial native funding", () => {
    const tx = makeMidnightCancelAndMake({
      loanToken: W_NATIVE,
      nativeAmount: 40n,
    });
    const limit = onlyLimit(tx.action, { expected: { sharesMinted: 10n } });
    expect(limit.quote).toEqual({ assetsPaid: 100n, sharesMinted: 10n });
    expect(limit.assetPaid).toBeUndefined();
  });

  it("quotes the full parked amount for fully native-funded parking", () => {
    const tx = makeMidnightCancelAndMake({
      loanToken: W_NATIVE,
      nativeAmount: 100n,
    });
    const limit = onlyLimit(tx.action, { expected: { sharesMinted: 10n } });
    expect(limit.quote).toEqual({ assetsPaid: 100n, sharesMinted: 10n });
    expect(limit.assetPaid).toBeUndefined();
  });

  it("requires the caller to quote callback supply shares", () => {
    const tx = makeMidnightCancelAndMake();
    expect(() => onlyLimit(tx.action)).toThrowError(MissingExpectedQuoteError);
  });

  it("rejects Blue parking when collateral is also supplied", () => {
    const tx = makeMidnightCancelAndMake({ collateral: true });
    expect(() => onlyLimit(tx.action)).toThrowError(
      UnsupportedLimitActionError,
    );
    expect(() =>
      onlyLimit(tx.action, { expected: { assetsPaid: 140n } }),
    ).toThrowError(UnsupportedLimitActionError);
  });

  it.each([40n, 100n])(
    "rejects native funding with collateral supplies (%s)",
    (nativeAmount) => {
      const tx = makeMidnightCancelAndMake({
        loanToken: W_NATIVE,
        nativeAmount,
        collateral: true,
      });
      expect(() => onlyLimit(tx.action)).toThrowError(
        UnsupportedLimitActionError,
      );
    },
  );

  it("rejects a different onBehalf account on a Midnight maker action", () => {
    const tx = makeMidnightCancelAndMake();
    let error: unknown;
    try {
      onlyLimit(tx.action, { onBehalf: OTHER });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(LimitAccountMismatchError);
    expect(error).toMatchObject({ field: "options.onBehalf" });
  });

  it("keeps publication-only Midnight actions unsupported", () => {
    const tx = makeMidnightCancelAndMake({ blue: false });
    expect(() => onlyLimit(tx.action)).toThrowError(
      UnsupportedLimitActionError,
    );
  });

  it("derives one maker collateral operation from a real single-supply publication", () => {
    const tx = maker([{ collateralIndex: 1n, assets: 2_000n }]);
    const limits = toSimulationLimits(tx.action, { owner: OWNER });
    expect(limits.operations).toEqual([
      {
        type: "midnightSupplyCollateral",
        marketId: tx.action.args.market,
        collateralIndex: 1n,
        account: OWNER,
        quote: { assetsPaid: 2_000n, collateralSupplied: 2_000n },
      },
    ]);
  });

  it("rejects a non-owner receiver for a single-index maker action", () => {
    expect(() =>
      toSimulationLimits(
        maker([{ collateralIndex: 1n, assets: 2_000n }]).action,
        { owner: OWNER, receiver: OTHER },
      ),
    ).toThrowError(
      expect.objectContaining({
        name: "LimitAccountMismatchError",
        field: "receiver",
        expected: OWNER,
        actual: OTHER,
      }),
    );
  });

  it("rejects a non-owner receiver for a two-index maker action", () => {
    expect(() =>
      toSimulationLimits(
        maker([
          { collateralIndex: 1n, assets: 2_000n },
          { collateralIndex: 0n, assets: 3_000n },
        ]).action,
        { owner: OWNER, receiver: OTHER },
      ),
    ).toThrowError(
      expect.objectContaining({
        name: "LimitAccountMismatchError",
        field: "receiver",
        expected: OWNER,
        actual: OTHER,
      }),
    );
  });

  it("preserves first-seen order for distinct maker collateral indices", () => {
    const tx = maker([
      { collateralIndex: 1n, assets: 2_000n },
      { collateralIndex: 0n, assets: 3_000n },
    ]);
    const limits = toSimulationLimits(tx.action, { owner: OWNER });
    expect(limits.operations).toEqual([
      {
        type: "midnightSupplyCollateral",
        marketId: tx.action.args.market,
        collateralIndex: 1n,
        account: OWNER,
        quote: { assetsPaid: 2_000n, collateralSupplied: 2_000n },
      },
      {
        type: "midnightSupplyCollateral",
        marketId: tx.action.args.market,
        collateralIndex: 0n,
        account: OWNER,
        quote: { assetsPaid: 3_000n, collateralSupplied: 3_000n },
      },
    ]);
    expect(() => parse(limits)).not.toThrow();
  });

  it("aggregates repeated maker collateral indices into one operation", () => {
    const tx = maker([
      { collateralIndex: 1n, assets: 2_000n },
      { collateralIndex: 1n, assets: 3_000n },
    ]);
    const limits = toSimulationLimits(tx.action, { owner: OWNER });
    expect(limits.operations).toEqual([
      {
        type: "midnightSupplyCollateral",
        marketId: tx.action.args.market,
        collateralIndex: 1n,
        account: OWNER,
        quote: { assetsPaid: 5_000n, collateralSupplied: 5_000n },
      },
    ]);
    expect(() => parse(limits)).not.toThrow();
  });

  it("uses an expected quote for one maker collateral index", () => {
    const limits = toSimulationLimits(
      maker([{ collateralIndex: 1n, assets: 2_000n }]).action,
      {
        owner: OWNER,
        expected: { assetsPaid: 2_500n, collateralSupplied: 2_500n },
      },
    );
    expect((limits.operations[0] as OperationLimit).quote).toEqual({
      assetsPaid: 2_500n,
      collateralSupplied: 2_500n,
    });
  });

  it("rejects expected quotes that cannot be attributed to multiple maker indices", () => {
    let thrown: unknown;
    try {
      toSimulationLimits(
        maker([
          { collateralIndex: 1n, assets: 2_000n },
          { collateralIndex: 0n, assets: 3_000n },
        ]).action,
        { owner: OWNER, expected: { assetsPaid: 5_000n } },
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AmbiguousExpectedQuoteError);
    expect(thrown).toMatchObject({
      actionType: "midnightCancelAndMake",
      operations: 2,
      message:
        '"midnightCancelAndMake": expected cannot be attributed: the action ' +
        "supplies 2 collateral indexes, each verified as its own operation. " +
        "Omit expected, or build the limits by hand.",
    });
  });

  it("always measures maker collateral for owner", () => {
    const tx = maker([{ collateralIndex: 1n, assets: 2_000n }]);
    let thrown: unknown;
    try {
      toSimulationLimits(tx.action, { owner: OWNER, onBehalf: OTHER });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LimitAccountMismatchError);
    expect(thrown).toMatchObject({
      field: "options.onBehalf",
      expected: OWNER,
      actual: OTHER,
    });
    expect(
      toSimulationLimits(tx.action, { owner: OWNER, onBehalf: OWNER })
        .operations[0],
    ).toMatchObject({ account: OWNER });
  });

  it("keeps pure and cancel-only maker actions unsupported", () => {
    const unsupported = [
      maker().action,
      midnightCancelAndMake({
        chainId: base.id,
        cancellations: [{ group: makerGroup, maxConsumed: 0n }],
        deadline: maxUint256,
      }).action,
    ];
    for (const action of unsupported) {
      let thrown: unknown;
      try {
        toSimulationLimits(action, { owner: OWNER });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(UnsupportedLimitActionError);
      expect(thrown).toMatchObject({ actionType: "midnightCancelAndMake" });
    }
  });
});

describe("toSimulationLimits — Midnight sells", () => {
  const midnight = getChainAddress(base.id, "midnight");
  const receiver: Address = "0x0000000000000000000000000000000000000c0E";
  const market = new MidnightMarketParams({
    chainId: base.id,
    midnight,
    loanToken: getAddress("0x0000000000000000000000000000000000000011"),
    collateralParams: [
      {
        token: getAddress("0x0000000000000000000000000000000000000012"),
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle: getAddress("0x0000000000000000000000000000000000000013"),
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: getAddress("0x0000000000000000000000000000000000000000"),
    liquidatorGate: getAddress("0x0000000000000000000000000000000000000000"),
  });
  const marketStruct = MidnightMarketUtils.toStruct(market);
  const args = {
    chainId: base.id,
    market,
    receiver,
    takeableOffers: [
      {
        units: 123n,
        offer: OfferUtils.toStruct({
          offer: Offer.create({
            market,
            buy: true,
            maker: receiver,
            expiry: market.maturity,
            tick: 5_000n,
            ratifier: getChainAddress(base.id, "setterRatifier"),
            maxUnits: 123n,
            continuousFeeCap: 0n,
          }),
        }),
        ratifierData: "0x",
      },
    ],
    deadline: 2_000_000_000n,
    referralFeePct: 3_000_000_000_000_000n,
    referralFeeRecipient: receiver,
  } as const;
  const borrowUnits = midnightTakeBorrow({
    ...args,
    target: { type: "units", units: 123n, minSellerAssets: 100n },
  });
  const borrowAssets = midnightTakeBorrow({
    ...args,
    target: { type: "assets", assets: 100n, maxUnits: 123n },
  });
  const withdrawUnits = midnightTakeWithdraw({
    ...args,
    target: { type: "units", units: 123n, minSellerAssets: 100n },
  });
  const withdrawAssets = midnightTakeWithdraw({
    ...args,
    target: { type: "assets", assets: 100n, maxUnits: 123n },
  });
  const parse = (limits: ReturnType<typeof toSimulationLimits>) =>
    parseRequest({
      chainId: base.id,
      transactions: [{ from: OWNER, to: midnight, data: "0x", value: 0n }],
      limits,
    });

  it.each([
    [borrowUnits, { assetsReceived: 100n, unitsSold: 123n }],
    [borrowAssets, { assetsReceived: 100n, unitsSold: 123n }],
    [withdrawUnits, { assetsReceived: 100n, creditRedeemed: 123n }],
    [withdrawAssets, { assetsReceived: 100n, creditRedeemed: 123n }],
  ] as const)("derives contract bounds from the real builder", (tx, quote) => {
    const limits = toSimulationLimits(tx.action, { owner: OWNER, receiver });
    expect(limits.operations[0]).toMatchObject({
      type: tx.action.type,
      marketId: tx.action.args.market,
      receiver,
      quote,
    });
    expect(limits.operations[0]).not.toHaveProperty("account");
    expect(() => parse(limits)).not.toThrow();
  });

  it.each([
    [
      { type: "units", units: 123n, minSellerAssets: 100n },
      { unitsSold: 123n, assetsReceived: 100n },
    ],
    [
      { type: "assets", assets: 100n, maxUnits: 123n },
      { unitsSold: 123n, assetsReceived: 100n },
    ],
  ] as const)(
    "derives combined supply/take quotes for %s target",
    (target, quote) => {
      const tx = midnightSupplyCollateralTakeBorrow({
        ...args,
        target,
        collateralSupplies: [
          { collateralIndex: 0n, assets: 30n },
          { collateralIndex: 0n, assets: 70n },
        ],
      });
      const limits = toSimulationLimits(tx.action, {
        owner: OWNER,
        receiver,
        market: marketStruct,
      });
      expect(limits.operations[0]).toMatchObject({
        type: "midnightSupplyCollateralTakeBorrow",
        marketId: tx.action.args.market,
        market: { loanToken: market.loanToken },
        receiver,
        quote: {
          ...quote,
          collateralSupplies: [{ collateralIndex: 0n, assets: 100n }],
        },
      });
      expect(limits.operations[0]).not.toHaveProperty("account");
      expect(tx.value).toBe(0n);
      expect(() => parse(limits)).not.toThrow();
    },
  );

  it("rejects collateral-supply quote overrides for every action", () => {
    const tx = midnightSupplyCollateralTakeBorrow({
      ...args,
      target: { type: "units", units: 123n, minSellerAssets: 100n },
      collateralSupplies: [{ collateralIndex: 0n, assets: 100n }],
    });
    const expectedWithCollateralSupplies = {
      collateralSupplies: [],
    } as NonNullable<Parameters<typeof toSimulationLimits>[1]["expected"]> & {
      readonly collateralSupplies: readonly [];
    };
    for (const action of [tx.action, borrowUnits.action])
      expect(() =>
        toSimulationLimits(action, {
          owner: OWNER,
          expected: expectedWithCollateralSupplies,
        }),
      ).toThrowError(SimulationValidationError);
  });

  it("accepts an external encoded receiver and rejects a mismatch", () => {
    expect(() =>
      toSimulationLimits(borrowUnits.action, { owner: OWNER, receiver }),
    ).not.toThrow();
    expect(() =>
      toSimulationLimits(borrowUnits.action, {
        owner: OWNER,
        receiver: OWNER,
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "LimitAccountMismatchError",
        field: "args.receiver",
      }),
    );
    expect(() =>
      toSimulationLimits(withdrawUnits.action, { owner: OWNER, receiver }),
    ).not.toThrow();
    expect(() =>
      toSimulationLimits(withdrawUnits.action, {
        owner: OWNER,
        receiver: OWNER,
      }),
    ).toThrowError(LimitAccountMismatchError);
    const combined = midnightSupplyCollateralTakeBorrow({
      ...args,
      target: { type: "units", units: 123n, minSellerAssets: 100n },
      collateralSupplies: [{ collateralIndex: 0n, assets: 100n }],
    });
    expect(() =>
      toSimulationLimits(combined.action, {
        owner: OWNER,
        receiver: OWNER,
      }),
    ).toThrowError(LimitAccountMismatchError);
  });

  it("rejects onBehalf other than owner and preserves expected overrides", () => {
    expect(() =>
      toSimulationLimits(borrowUnits.action, {
        owner: OWNER,
        receiver,
        onBehalf: receiver,
      }),
    ).toThrowError(LimitAccountMismatchError);
    const limits = toSimulationLimits(borrowUnits.action, {
      owner: OWNER,
      receiver,
      market: marketStruct,
      expected: { assetsReceived: 999n, unitsSold: 888n },
    });
    expect(limits.operations[0]).toMatchObject({
      type: "midnightTakeBorrow",
      market: { loanToken: market.loanToken },
    });
    expect((limits.operations[0] as OperationLimit).quote).toEqual({
      assetsReceived: 999n,
      unitsSold: 888n,
    });
  });
});

describe("toSimulationLimits — Midnight buys", () => {
  const midnight = getChainAddress(base.id, "midnight");
  const receiver: Address = "0x0000000000000000000000000000000000000c0E";
  const market = new MidnightMarketParams({
    chainId: base.id,
    midnight,
    loanToken: getAddress("0x0000000000000000000000000000000000000011"),
    collateralParams: [
      {
        token: getAddress("0x0000000000000000000000000000000000000012"),
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle: getAddress("0x0000000000000000000000000000000000000013"),
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: getAddress("0x0000000000000000000000000000000000000000"),
    liquidatorGate: getAddress("0x0000000000000000000000000000000000000000"),
  });
  const marketStruct = MidnightMarketUtils.toStruct(market);
  const txArgs = (loanMarket: MidnightMarketParams) =>
    ({
      chainId: base.id,
      market: loanMarket,
      takeableOffers: [
        {
          units: 123n,
          offer: OfferUtils.toStruct({
            offer: Offer.create({
              market: loanMarket,
              buy: false,
              maker: receiver,
              expiry: loanMarket.maturity,
              tick: 5_000n,
              ratifier: getChainAddress(base.id, "setterRatifier"),
              maxUnits: 123n,
              continuousFeeCap: 0n,
            }),
          }),
          ratifierData: "0x",
        },
      ],
      maxContinuousFee: maxUint256,
      deadline: 2_000_000_000n,
      referralFeePct: 3_000_000_000_000_000n,
      referralFeeRecipient: receiver,
    }) as const;
  const nativeMarket = new MidnightMarketParams({
    ...market,
    loanToken: getChainAddress(base.id, "wNative"),
  });
  const lendAssets = midnightTakeLend({
    ...txArgs(market),
    target: { type: "assets", assets: 500n, minUnits: 100n },
  });
  const lendUnits = midnightTakeLend({
    ...txArgs(market),
    target: { type: "units", units: 123n, maxBuyerAssets: 600n },
  });

  it.each([
    [lendAssets, { assetsPaid: 500n, unitsBought: 100n }],
    [lendUnits, { assetsPaid: 600n, unitsBought: 123n }],
  ] as const)("derives limits from the buy target", (tx, quote) => {
    const limits = toSimulationLimits(tx.action, {
      owner: OWNER,
      market: marketStruct,
    });
    expect(limits.operations[0]).toMatchObject({
      type: "midnightTakeLend",
      marketId: tx.action.args.market,
      market: { loanToken: market.loanToken },
      quote,
    });
    expect(limits.operations[0]).not.toHaveProperty("account");
  });

  it("rejects another receiver and keeps expected overrides", () => {
    expect(() =>
      toSimulationLimits(lendUnits.action, { owner: OWNER, receiver }),
    ).toThrowError(LimitAccountMismatchError);
    const limits = toSimulationLimits(lendUnits.action, {
      owner: OWNER,
      expected: { assetsPaid: 999n, unitsBought: 888n },
    });
    expect((limits.operations[0] as OperationLimit).quote).toEqual({
      assetsPaid: 999n,
      unitsBought: 888n,
    });
  });

  it.each([{ nativeAmount: 250n }, { nativeAmount: 500n }] as const)(
    "%# accounts for native assets in an assets-target spend cap",
    ({ nativeAmount }) => {
      const tx = midnightTakeLend({
        ...txArgs(nativeMarket),
        target: { type: "assets", assets: 500n, minUnits: 100n },
        nativeAmount,
      });
      const limit = toSimulationLimits(tx.action, { owner: OWNER })
        .operations[0];
      expect(limit).toMatchObject({
        quote: { assetsPaid: 500n, unitsBought: 100n },
      });
      expect(limit?.assetPaid).toBeUndefined();
    },
  );

  it("quotes the full units-target cap without native payment metadata", () => {
    const cap = 600n;
    const tx = midnightTakeLend({
      ...txArgs(nativeMarket),
      target: { type: "units", units: 123n, maxBuyerAssets: cap },
      nativeAmount: cap,
    });
    const limit = toSimulationLimits(tx.action, { owner: OWNER }).operations[0];
    expect(limit).toMatchObject({
      quote: { assetsPaid: cap, unitsBought: 123n },
    });
    expect(limit?.assetPaid).toBeUndefined();
  });
});

describe("toSimulationLimits — midnightRedeem", () => {
  const midnight = getChainAddress(base.id, "midnight");
  const PAYEE: Address = "0x0000000000000000000000000000000000000c0E";
  const market = new MidnightMarketParams({
    chainId: base.id,
    midnight,
    loanToken: getAddress("0x0000000000000000000000000000000000000011"),
    collateralParams: [
      {
        token: getAddress("0x0000000000000000000000000000000000000012"),
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle: getAddress("0x0000000000000000000000000000000000000013"),
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: getAddress("0x0000000000000000000000000000000000000000"),
    liquidatorGate: getAddress("0x0000000000000000000000000000000000000000"),
  });
  const marketStruct = MidnightMarketUtils.toStruct(market);
  const redeem = (onBehalf: Address, receiver?: Address) =>
    midnightRedeem({
      chainId: base.id,
      market,
      units: 1_234_567n,
      onBehalf,
      ...(receiver === undefined ? {} : { receiver }),
    });
  const parse = (limits: ReturnType<typeof toSimulationLimits>) =>
    parseRequest({
      chainId: base.id,
      transactions: [{ from: OWNER, to: midnight, data: "0x", value: 0n }],
      limits,
    });

  it("derives the exact payout floor and credit cap from the real builder", () => {
    const tx = redeem(OWNER);
    const limits = toSimulationLimits(tx.action, { owner: OWNER });
    expect(limits.operations).toEqual([
      {
        type: "midnightRedeem",
        marketId: tx.action.args.market,
        account: OWNER,
        receiver: OWNER,
        quote: { assetsReceived: 1_234_567n, creditRedeemed: 1_234_567n },
      },
    ]);
    expect(() => parse(limits)).not.toThrow();
  });

  it.each([
    [
      "midnightRedeem",
      () =>
        toSimulationLimits(redeem(OWNER).action, {
          owner: OWNER,
          market: marketStruct,
        }),
    ],
    [
      "blueSupply",
      () =>
        toSimulationLimits(
          blueSupply({
            market: {
              chainId: base.id,
              marketParams: new MarketParams({
                loanToken: BLUE_LOAN,
                collateralToken: W_NATIVE,
                oracle: zeroAddress,
                irm: zeroAddress,
                lltv: 0n,
              }),
            },
            args: {
              userAddress: OWNER,
              assets: 1n,
              referralFeePct: 0n,
              referralFeeRecipient: zeroAddress,
              deadline: 1n,
            },
          }).action,
          {
            owner: OWNER,
            market: marketStruct,
            expected: { sharesMinted: 1n },
          },
        ),
    ],
  ])("does not forward market on %s", (_type, buildLimits) => {
    const limits = buildLimits();
    expect(
      limits.operations.every((operation) => !("market" in operation)),
    ).toBe(true);
    expect(() => parse(limits)).not.toThrow();
  });

  it("measures credit on onBehalf and the payout on an explicit receiver", () => {
    const tx = redeem(OTHER, PAYEE);
    const limits = toSimulationLimits(tx.action, {
      owner: OWNER,
      onBehalf: OTHER,
      receiver: PAYEE,
    });
    expect(limits.operations[0]).toMatchObject({
      account: OTHER,
      receiver: PAYEE,
    });
    expect(() => parse(limits)).not.toThrow();
  });

  it("rejects an action paying a receiver other than the intended one", () => {
    let thrown: unknown;
    try {
      toSimulationLimits(redeem(OWNER, OTHER).action, {
        owner: OWNER,
        receiver: PAYEE,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LimitAccountMismatchError);
    expect(thrown).toMatchObject({
      field: "args.receiver",
      expected: PAYEE,
      actual: OTHER,
    });
    // The builder defaults receiver to onBehalf; omitting receiver intent
    // measures `owner`, so it must be stated.
    expect(() =>
      toSimulationLimits(redeem(OTHER).action, {
        owner: OWNER,
        onBehalf: OTHER,
      }),
    ).toThrowError(LimitAccountMismatchError);
  });

  it("rejects credit owned by an account other than the intended one", () => {
    expect(() =>
      toSimulationLimits(redeem(OTHER).action, { owner: OWNER }),
    ).toThrowError(LimitAccountMismatchError);
  });

  it("keeps explicit expected overrides for an aggregate of two redeems", () => {
    const limits = toSimulationLimits(redeem(OWNER).action, {
      owner: OWNER,
      expected: { assetsReceived: 2_000_001n, creditRedeemed: 2_000_001n },
    });
    expect((limits.operations[0] as OperationLimit).quote).toEqual({
      assetsReceived: 2_000_001n,
      creditRedeemed: 2_000_001n,
    });
    expect(() => parse(limits)).not.toThrow();
  });
});

describe("toSimulationLimits — midnightRepayWithdrawCollateral", () => {
  const midnight = getChainAddress(base.id, "midnight");
  const loanToken = getAddress("0x0000000000000000000000000000000000000011");
  const collateralToken = getAddress(
    "0x0000000000000000000000000000000000000012",
  );
  const market = new MidnightMarketParams({
    chainId: base.id,
    midnight,
    loanToken,
    collateralParams: [
      {
        token: collateralToken,
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle: getAddress("0x0000000000000000000000000000000000000013"),
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: getAddress("0x0000000000000000000000000000000000000000"),
    liquidatorGate: getAddress("0x0000000000000000000000000000000000000000"),
  });
  const build = (options: {
    readonly repay:
      | { readonly type: "assets"; readonly assets: bigint }
      | {
          readonly type: "full";
          readonly maxBuyerAssets: bigint;
        };
    readonly collateralWithdrawals?: readonly {
      readonly collateralIndex: bigint;
      readonly assets: bigint;
    }[];
    readonly collateralReceiver?: Address;
    readonly market?: MidnightMarketParams;
    readonly nativeAmount?: bigint;
  }) =>
    midnightRepayWithdrawCollateral({
      chainId: base.id,
      market: options.market ?? market,
      repay: options.repay,
      collateralWithdrawals: options.collateralWithdrawals ?? [],
      collateralReceiver: options.collateralReceiver ?? OWNER,
      deadline: 2_000_000_000n,
      ...(options.nativeAmount === undefined
        ? {}
        : { nativeAmount: options.nativeAmount }),
    });

  it("derives payment and debt reduction for an assets repay", () => {
    const tx = build({ repay: { type: "assets", assets: 123n } });
    const limit = onlyLimit(tx.action);
    expect(limit).toMatchObject({
      type: "midnightRepayWithdrawCollateral",
      marketId: tx.action.args.market,
      quote: { assetsPaid: 123n, debtRepaid: 123n },
    });
    expect(limit).not.toHaveProperty("account");
  });

  it("derives full-repay payment cap and an exact zero final debt bound", () => {
    const tx = build({ repay: { type: "full", maxBuyerAssets: 500n } });
    expect(onlyLimit(tx.action)).toMatchObject({
      quote: { assetsPaid: 500n },
      position: { maxDebt: 0n },
    });
    expect(onlyLimit(tx.action).quote.debtRepaid).toBeUndefined();
    expect(
      onlyLimit(tx.action, { expected: { debtRepaid: 400n } }).quote.debtRepaid,
    ).toBe(400n);
  });

  it("does not synthesize repayment quotes for withdraw-only actions", () => {
    const tx = build({
      repay: { type: "assets", assets: 0n },
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
    });
    expect(onlyLimit(tx.action).quote).toEqual({
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
    });
  });

  it("behavior: uses the expected amount for a finite collateral withdrawal without a position bound", () => {
    const tx = build({
      repay: { type: "assets", assets: 10n },
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
    });
    const limit = onlyLimit(tx.action, {
      expected: {
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 9n }],
      },
    }) as Extract<
      OperationLimit,
      { readonly type: "midnightRepayWithdrawCollateral" }
    >;

    expect(limit.quote.collateralWithdrawals).toEqual([
      { collateralIndex: 0n, assets: 9n },
    ]);
    expect(limit.position?.maxCollateral).toBeUndefined();
  });

  it("aggregates repeated finite indices and requires an expected amount for withdraw-all", () => {
    const finite = build({
      repay: { type: "assets", assets: 10n },
      collateralWithdrawals: [
        { collateralIndex: 0n, assets: 3n },
        { collateralIndex: 0n, assets: 7n },
      ],
    });
    expect(onlyLimit(finite.action).quote.collateralWithdrawals).toEqual([
      { collateralIndex: 0n, assets: 10n },
    ]);

    const unlimited = build({
      repay: { type: "assets", assets: 10n },
      collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
    });
    expect(() => onlyLimit(unlimited.action)).toThrowError(
      MissingExpectedQuoteError,
    );
    expect(
      onlyLimit(unlimited.action, {
        expected: {
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 50n }],
        },
      }),
    ).toMatchObject({
      quote: { collateralWithdrawals: [{ collateralIndex: 0n, assets: 50n }] },
      position: {
        maxCollateral: [{ collateralIndex: 0n, assets: 0n }],
      },
    });
  });

  it("requires the expected quote when a repeated index contains withdraw-all", () => {
    const tx = build({
      repay: { type: "assets", assets: 10n },
      collateralWithdrawals: [
        { collateralIndex: 0n, assets: 5n },
        { collateralIndex: 0n, assets: maxUint256 },
      ],
    });
    expect(() => onlyLimit(tx.action)).toThrowError(MissingExpectedQuoteError);
    expect(
      onlyLimit(tx.action, {
        expected: {
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 55n }],
        },
      }),
    ).toMatchObject({
      quote: { collateralWithdrawals: [{ collateralIndex: 0n, assets: 55n }] },
      position: { maxCollateral: [{ collateralIndex: 0n, assets: 0n }] },
    });
  });

  it("accepts a matching external receiver and rejects mismatches and another account", () => {
    const tx = build({
      repay: { type: "assets", assets: 10n },
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 5n }],
      collateralReceiver: RECEIVER,
    });
    const limit = onlyLimit(tx.action, { receiver: RECEIVER });
    expect(limit).toMatchObject({
      receiver: RECEIVER,
    });
    expect(limit).not.toHaveProperty("account");
    expect(() => onlyLimit(tx.action, { receiver: OTHER })).toThrowError(
      expect.objectContaining({
        name: "LimitAccountMismatchError",
        field: "args.collateralReceiver",
      }),
    );
    expect(() => onlyLimit(tx.action, { onBehalf: OTHER })).toThrowError(
      LimitAccountMismatchError,
    );
  });

  it("rejects an external receiver when there are no collateral withdrawals", () => {
    const tx = build({ repay: { type: "assets", assets: 10n } });
    expect(() => onlyLimit(tx.action, { receiver: RECEIVER })).toThrowError(
      expect.objectContaining({
        name: "LimitAccountMismatchError",
        field: "receiver",
      }),
    );
  });

  it("rejects expected collateral indices that the action does not withdraw", () => {
    const tx = build({ repay: { type: "assets", assets: 10n } });
    expect(() =>
      onlyLimit(tx.action, {
        expected: {
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
        },
      }),
    ).toThrowError(SimulationValidationError);
  });

  it("rejects duplicate expected collateral indices", () => {
    const tx = build({
      repay: { type: "assets", assets: 10n },
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 5n }],
    });
    let caught: unknown;
    try {
      onlyLimit(tx.action, {
        expected: {
          collateralWithdrawals: [
            { collateralIndex: 0n, assets: 5n },
            { collateralIndex: 0n, assets: 6n },
          ],
        },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SimulationValidationError);
    expect(caught).toHaveProperty(
      "message",
      'expected.collateralWithdrawals: duplicate collateral index "0"',
    );
  });

  it("keeps native-funded repayment measured in the ERC-20 loan token", () => {
    const wNativeMarket = new MidnightMarketParams({
      ...market,
      loanToken: getChainAddress(base.id, "wNative"),
    });
    const tx = build({
      market: wNativeMarket,
      repay: { type: "assets", assets: 100n },
      nativeAmount: 100n,
    });
    expect(onlyLimit(tx.action).assetPaid).toBeUndefined();
    expect(onlyLimit(tx.action).quote).toMatchObject({
      assetsPaid: 100n,
      debtRepaid: 100n,
    });
    expect(onlyLimit(tx.action).assetPaid).not.toBe(ethAddress);
  });
});

describe("toSimulationLimits — midnightTakeRepayWithdrawCollateral", () => {
  const midnight = getChainAddress(base.id, "midnight");
  const market = new MidnightMarketParams({
    chainId: base.id,
    midnight,
    loanToken: getAddress("0x0000000000000000000000000000000000000011"),
    collateralParams: [
      {
        token: getAddress("0x0000000000000000000000000000000000000012"),
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle: getAddress("0x0000000000000000000000000000000000000013"),
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: getAddress("0x0000000000000000000000000000000000000000"),
    liquidatorGate: getAddress("0x0000000000000000000000000000000000000000"),
  });
  const build = (options: {
    readonly target: MidnightBuyTarget;
    readonly collateralWithdrawals?: readonly {
      readonly collateralIndex: bigint;
      readonly assets: bigint;
    }[];
    readonly collateralReceiver?: Address;
    readonly nativeAmount?: bigint;
    readonly market?: MidnightMarketParams;
  }) => {
    const offerMarket = options.market ?? market;
    return midnightTakeRepayWithdrawCollateral({
      chainId: base.id,
      market: offerMarket,
      target: options.target,
      repayEnabled: true,
      takeableOffers: [
        {
          units: 123n,
          offer: OfferUtils.toStruct({
            offer: Offer.create({
              market: offerMarket,
              buy: false,
              maker: OTHER,
              expiry: market.maturity,
              tick: 5_000n,
              ratifier: getChainAddress(base.id, "setterRatifier"),
              maxUnits: 123n,
              continuousFeeCap: 0n,
            }),
          }),
          ratifierData: "0x",
        },
      ],
      maxContinuousFee: 0n,
      collateralWithdrawals: options.collateralWithdrawals ?? [],
      collateralReceiver: options.collateralReceiver ?? OWNER,
      deadline: 2_000_000_000n,
      ...(options.nativeAmount === undefined
        ? {}
        : { nativeAmount: options.nativeAmount }),
    });
  };

  it("derives exact spend and a unit floor for an assets target", () => {
    const tx = build({
      target: { type: "assets", assets: 100n, minUnits: 90n },
    });
    expect(onlyLimit(tx.action)).toMatchObject({
      type: "midnightTakeRepayWithdrawCollateral",
      marketId: tx.action.args.market,
      quote: { assetsPaid: 100n, debtRepaid: 90n },
    });
    expect(onlyLimit(tx.action)).not.toHaveProperty("account");
    expect(onlyLimit(tx.action).position).toBeUndefined();
  });

  it("derives spend cap and exact units for a finite units target", () => {
    const tx = build({
      target: { type: "units", units: 120n, maxBuyerAssets: 110n },
    });
    expect(onlyLimit(tx.action).quote).toEqual({
      assetsPaid: 110n,
      debtRepaid: 120n,
    });
  });

  it("maps the full-debt sentinel to a spend cap and a zero final debt bound", () => {
    const tx = build({
      target: { type: "units", units: maxUint256, maxBuyerAssets: 500n },
    });
    expect(onlyLimit(tx.action)).toMatchObject({
      quote: { assetsPaid: 500n },
      position: { maxDebt: 0n },
    });
    expect(onlyLimit(tx.action).quote.debtRepaid).toBeUndefined();
  });

  it("derives collateral delivery and withdraw-all bounds like direct repay", () => {
    const tx = build({
      target: { type: "units", units: maxUint256, maxBuyerAssets: 500n },
      collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
      collateralReceiver: RECEIVER,
    });
    expect(() => onlyLimit(tx.action, { receiver: RECEIVER })).toThrowError(
      MissingExpectedQuoteError,
    );
    expect(
      onlyLimit(tx.action, {
        receiver: RECEIVER,
        expected: {
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 50n }],
        },
      }),
    ).toMatchObject({
      receiver: RECEIVER,
      quote: { collateralWithdrawals: [{ collateralIndex: 0n, assets: 50n }] },
      position: {
        maxDebt: 0n,
        maxCollateral: [{ collateralIndex: 0n, assets: 0n }],
      },
    });
    expect(() => onlyLimit(tx.action, { receiver: OTHER })).toThrowError(
      LimitAccountMismatchError,
    );
  });

  it("keeps native-funded spending measured in the ERC-20 loan token", () => {
    const tx = build({
      market: new MidnightMarketParams({
        ...market,
        loanToken: getChainAddress(base.id, "wNative"),
      }),
      target: { type: "assets", assets: 100n, minUnits: 90n },
      nativeAmount: 40n,
    });
    expect(onlyLimit(tx.action).assetPaid).toBeUndefined();
  });

  it("rejects an external receiver or another account when there are no collateral withdrawals", () => {
    const tx = build({
      target: { type: "assets", assets: 100n, minUnits: 90n },
    });
    expect(() => onlyLimit(tx.action, { receiver: RECEIVER })).toThrowError(
      expect.objectContaining({
        name: "LimitAccountMismatchError",
        field: "receiver",
      }),
    );
    expect(() => onlyLimit(tx.action, { onBehalf: OTHER })).toThrowError(
      LimitAccountMismatchError,
    );
  });
});
