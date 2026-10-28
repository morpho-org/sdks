import type { MarketId } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import {
  ConsumerLimitViolationError,
  SlippageCheckUnavailableError,
} from "../errors.js";
import type { CheckedSlippageLimits } from "../limits.js";
import { checkSlippage } from "./slippage.js";

describe("checkSlippage", () => {
  test("derived bound violations direct callers to the typed inputs or explicit quote", () => {
    const depositError = (() => {
      try {
        checkSlippage({
          label: "deposit",
          limits: {
            type: "vaultV2Deposit",
            inputs: { assets: 100n },
            quote: { sharesMinted: 100n },
            slippageTolerance: 0n,
          },
          observed: { sharesMinted: 99n },
          derivedFields: ["sharesMinted"],
        });
      } catch (error) {
        return error;
      }
    })();
    expect(depositError).toBeInstanceOf(ConsumerLimitViolationError);
    expect((depositError as Error).message).toBe(
      'deposit: derived minimum for "sharesMinted" is "100", got "99". Check the transaction against the typed inputs, or quote "sharesMinted" explicitly.',
    );

    const withdrawError = (() => {
      try {
        checkSlippage({
          label: "withdraw",
          limits: {
            type: "blueWithdraw",
            inputs: { assets: 100n },
            quote: { sharesBurned: 50n },
            slippageTolerance: 0n,
          },
          observed: { sharesBurned: 51n },
          derivedFields: ["sharesBurned"],
        });
      } catch (error) {
        return error;
      }
    })();
    expect(withdrawError).toBeInstanceOf(ConsumerLimitViolationError);
    expect((withdrawError as Error).message).toBe(
      'withdraw: derived maximum for "sharesBurned" is "50", got "51". Check the transaction against the typed inputs, or quote "sharesBurned" explicitly.',
    );
  });
  test("collateral-only combined supply accepts zero debt shares", () => {
    const quote = {
      assetsPaid: 100n,
      collateralSupplied: 100n,
      sharesMinted: 1n,
    };
    const checked = checkSlippage({
      label: "collateral only",
      limits: {
        type: "blueSupplyCollateralBorrow",
        inputs: { collateralAssets: 100n },
        quote,
        slippageTolerance: 0n,
      },
      observed: { ...quote, sharesMinted: 0n },
      derivedFields: ["assetsPaid", "collateralSupplied", "sharesMinted"],
      exactFields: ["assetsPaid", "collateralSupplied"],
      debtShares: true,
      inactiveFields: ["sharesMinted"],
    });
    expect(checked.quote).toEqual(quote);
  });
  test.each([
    { field: "assetsReceived", accepted: 990n, rejected: 989n },
    { field: "sharesMinted", accepted: 990n, rejected: 989n },
    { field: "assetsPaid", accepted: 1010n, rejected: 1011n },
    { field: "sharesBurned", accepted: 1010n, rejected: 1011n },
  ] as const)(
    "behavior: inclusive 1% tolerance for $field",
    ({ field, accepted, rejected }) => {
      const limits: CheckedSlippageLimits & { type: "blueSupply" } = {
        type: "blueSupply",
        quote: { [field]: 1000n },
        slippageTolerance: 10_000000000000000n,
      };
      expect(
        checkSlippage({
          label: "Limit operation 0 (vaultV2Deposit)",
          limits,
          observed: { [field]: accepted },
        }),
      ).toEqual({
        quote: limits.quote,
        slippageTolerance: limits.slippageTolerance,
      });
      expect(
        checkSlippage({
          label: "Limit operation 0 (vaultV2Deposit)",
          limits,
          observed: { [field]: 1000n },
        }),
      ).toEqual({
        quote: limits.quote,
        slippageTolerance: limits.slippageTolerance,
      });
      expect(() =>
        checkSlippage({
          label: "Limit operation 0 (vaultV2Deposit)",
          limits,
          observed: { [field]: rejected },
        }),
      ).toThrow(ConsumerLimitViolationError);
    },
  );
  test("behavior: minting debt shares is capped and burning debt shares is floored", () => {
    const debtLimits: CheckedSlippageLimits & { type: "blueBorrow" } = {
      type: "blueBorrow",

      quote: { sharesMinted: 1000n },
      slippageTolerance: 10_000000000000000n,
    };
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: debtLimits,
        observed: { sharesMinted: 1011n },
        debtShares: true,
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: debtLimits,
        observed: { sharesMinted: 980n },
        debtShares: true,
      }),
    ).toEqual({
      quote: debtLimits.quote,
      slippageTolerance: debtLimits.slippageTolerance,
    });

    const repayLimits: CheckedSlippageLimits & { type: "blueRepay" } = {
      type: "blueRepay",

      quote: { sharesBurned: 1000n },
      slippageTolerance: 10_000000000000000n,
    };
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: repayLimits,
        observed: { sharesBurned: 980n },
        debtShares: true,
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: repayLimits,
        observed: { sharesBurned: 1020n },
        debtShares: true,
      }),
    ).toEqual({
      quote: repayLimits.quote,
      slippageTolerance: repayLimits.slippageTolerance,
    });
  });
  test.each(["sharesMinted", "assetsPaid"] as const)(
    "behavior: rounding does not weaken tolerance for $field",
    (field) => {
      const limits = {
        type: "blueSupply" as const,
        quote: { [field]: 1n },
        slippageTolerance: 10_000000000000000n,
      };
      expect(
        checkSlippage({
          label: "Limit operation 0 (vaultV2Deposit)",
          limits,
          observed: { [field]: 1n },
        }),
      ).toEqual({
        quote: limits.quote,
        slippageTolerance: limits.slippageTolerance,
      });
      expect(() =>
        checkSlippage({
          label: "Limit operation 0 (vaultV2Deposit)",
          limits,
          observed: { [field]: field === "sharesMinted" ? 0n : 2n },
        }),
      ).toThrow(ConsumerLimitViolationError);
    },
  );
  test("behavior: zero tolerance and zero quote remain explicit", () => {
    const limits = {
      type: "blueSupply" as const,
      quote: { assetsPaid: 0n },
      slippageTolerance: 0n,
    };
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits,
        observed: { assetsPaid: 0n },
      }),
    ).toEqual({
      quote: limits.quote,
      slippageTolerance: limits.slippageTolerance,
    });
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits,
        observed: { assetsPaid: 1n },
      }),
    ).toThrow(ConsumerLimitViolationError);
  });
  test("behavior: in-kind positions accept down to the rounded bound per market", () => {
    const marketId =
      "0x00000000000000000000000000000000000000000000000000000000000000aa" as MarketId;
    const limits: CheckedSlippageLimits & { type: "vaultV1InKindRedeem" } = {
      type: "vaultV1InKindRedeem",
      quote: { positions: [{ marketId, supplyShares: 1000n }] },
      slippageTolerance: 10_000000000000000n,
    };
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV1InKindRedeem)",
        limits,
        observed: { positions: [{ marketId, supplyShares: 990n }] },
      }),
    ).toEqual({
      quote: { positions: [{ marketId, supplyShares: 1000n }] },
      slippageTolerance: 10_000000000000000n,
    });
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV1InKindRedeem)",
        limits,
        observed: { positions: [{ marketId, supplyShares: 989n }] },
      }),
    ).toThrow(ConsumerLimitViolationError);
    const error = (() => {
      try {
        checkSlippage({
          label: "Limit operation 0 (vaultV1InKindRedeem)",
          limits,
          observed: {},
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect((error as Error).message).toContain(marketId);
  });
  test("behavior: force-exit penalty is a cost bounded above the quote", () => {
    const limits: CheckedSlippageLimits & { type: "vaultV2ForceRedeem" } = {
      type: "vaultV2ForceRedeem",
      quote: { penalty: 1000n },
      slippageTolerance: 10_000000000000000n,
    };
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2ForceRedeem)",
        limits,
        observed: { penalty: 1010n },
      }),
    ).toEqual({
      quote: limits.quote,
      slippageTolerance: limits.slippageTolerance,
    });
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2ForceRedeem)",
        limits,
        observed: { penalty: 0n },
      }),
    ).toEqual({
      quote: limits.quote,
      slippageTolerance: limits.slippageTolerance,
    });
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2ForceRedeem)",
        limits,
        observed: { penalty: 1011n },
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2ForceRedeem)",
        limits,
        observed: {},
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
  test("behavior: deallocations bound realized assets per quoted market", () => {
    const marketId =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId;
    const otherMarket =
      "0x2222222222222222222222222222222222222222222222222222222222222222" as MarketId;
    const limits: CheckedSlippageLimits & { type: "vaultV2ForceRedeem" } = {
      type: "vaultV2ForceRedeem",
      quote: { deallocations: [{ marketId, assets: 1000n }] },
      slippageTolerance: 10_000000000000000n,
    };
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2ForceRedeem)",
        limits,
        observed: { deallocations: [{ marketId, assets: 1010n }] },
      }),
    ).toEqual({
      quote: limits.quote,
      slippageTolerance: limits.slippageTolerance,
    });
    // An unobserved market deallocated nothing; less than quoted is not adverse.
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2ForceRedeem)",
        limits,
        observed: { deallocations: [] },
      }),
    ).toEqual({
      quote: limits.quote,
      slippageTolerance: limits.slippageTolerance,
    });
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2ForceRedeem)",
        limits,
        observed: {},
      }),
    ).toThrowError(
      'Limit operation 0 (vaultV2ForceRedeem): missing observation for "deallocations". Supply the force-exit call logs.',
    );
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2ForceRedeem)",
        limits,
        observed: { deallocations: [{ marketId, assets: 1011n }] },
      }),
    ).toThrow(ConsumerLimitViolationError);
    // A realized deallocation in an unquoted market violates.
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2ForceRedeem)",
        limits,
        observed: { deallocations: [{ marketId: otherMarket, assets: 1n }] },
      }),
    ).toThrow(ConsumerLimitViolationError);
  });
  test("behavior: sharePrice bounds the realized rate in the adverse direction", () => {
    // A 100% amount tolerance keeps the amount checks permissive so the
    // sharePrice comparison is what rejects each adverse observation.
    const sharePrice = { expected: 10n ** 27n, tolerance: 10_000000000000000n };

    // Deposit shape: a higher assetsPaid-per-sharesMinted rate is adverse.
    const deposit: CheckedSlippageLimits & { type: "vaultV2Deposit" } = {
      type: "vaultV2Deposit",
      quote: { assetsPaid: 1010n, sharesMinted: 1000n },
      slippageTolerance: 10n ** 18n,
      sharePrice,
    };
    // Realized 1.01, bound 1.01 inclusive.
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: deposit,
        observed: { assetsPaid: 1010n, sharesMinted: 1000n },
      }),
    ).toEqual({
      quote: deposit.quote,
      slippageTolerance: deposit.slippageTolerance,
      sharePrice,
    });
    const overpriced = { assetsPaid: 1011n, sharesMinted: 1000n };
    const { sharePrice: _depositSharePrice, ...depositAmounts } = deposit;
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: depositAmounts,
        observed: overpriced,
      }),
    ).toEqual({
      quote: deposit.quote,
      slippageTolerance: deposit.slippageTolerance,
    });
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: deposit,
        observed: overpriced,
      }),
    ).toThrowError(/"sharePrice"/);
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: deposit,
        observed: overpriced,
      }),
    ).toThrow(ConsumerLimitViolationError);

    // Repay shape: a higher assetsPaid-per-debt-sharesBurned rate is adverse.
    const repay: CheckedSlippageLimits & { type: "blueRepay" } = {
      type: "blueRepay",
      quote: { assetsPaid: 1010n, sharesBurned: 1000n },
      slippageTolerance: 10n ** 18n,
      sharePrice,
    };
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: repay,
        observed: { assetsPaid: 1010n, sharesBurned: 1000n },
        debtShares: true,
      }),
    ).toEqual({
      quote: repay.quote,
      slippageTolerance: repay.slippageTolerance,
      sharePrice,
    });
    const overpricedRepay = { assetsPaid: 1011n, sharesBurned: 1000n };
    const { sharePrice: _repaySharePrice, ...repayAmounts } = repay;
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: repayAmounts,
        observed: overpricedRepay,
        debtShares: true,
      }),
    ).toEqual({
      quote: repay.quote,
      slippageTolerance: repay.slippageTolerance,
    });
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: repay,
        observed: overpricedRepay,
        debtShares: true,
      }),
    ).toThrowError(/"sharePrice"/);
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: repay,
        observed: overpricedRepay,
        debtShares: true,
      }),
    ).toThrow(ConsumerLimitViolationError);

    // Withdraw shape: a lower assetsReceived-per-sharesBurned rate is adverse.
    const withdraw: CheckedSlippageLimits & { type: "blueWithdraw" } = {
      type: "blueWithdraw",
      quote: { assetsReceived: 990n, sharesBurned: 1000n },
      slippageTolerance: 10n ** 18n,
      sharePrice,
    };
    // Realized 0.99, floor 0.99 inclusive.
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: withdraw,
        observed: { assetsReceived: 990n, sharesBurned: 1000n },
      }),
    ).toEqual({
      quote: withdraw.quote,
      slippageTolerance: withdraw.slippageTolerance,
      sharePrice,
    });
    const underpriced = { assetsReceived: 989n, sharesBurned: 1000n };
    const { sharePrice: _withdrawSharePrice, ...withdrawAmounts } = withdraw;
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: withdrawAmounts,
        observed: underpriced,
      }),
    ).toEqual({
      quote: withdraw.quote,
      slippageTolerance: withdraw.slippageTolerance,
    });
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: withdraw,
        observed: underpriced,
      }),
    ).toThrowError(/"sharePrice"/);
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: withdraw,
        observed: underpriced,
      }),
    ).toThrow(ConsumerLimitViolationError);

    // Borrow shape: a lower assetsReceived-per-debt-sharesMinted rate is adverse.
    const borrow: CheckedSlippageLimits & { type: "blueBorrow" } = {
      type: "blueBorrow",
      quote: { assetsReceived: 990n, sharesMinted: 1000n },
      slippageTolerance: 10n ** 18n,
      sharePrice,
    };
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: borrow,
        observed: { assetsReceived: 990n, sharesMinted: 1000n },
        debtShares: true,
      }),
    ).toEqual({
      quote: borrow.quote,
      slippageTolerance: borrow.slippageTolerance,
      sharePrice,
    });
    const underborrow = { assetsReceived: 989n, sharesMinted: 1000n };
    const { sharePrice: _borrowSharePrice, ...borrowAmounts } = borrow;
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: borrowAmounts,
        observed: underborrow,
        debtShares: true,
      }),
    ).toEqual({
      quote: borrow.quote,
      slippageTolerance: borrow.slippageTolerance,
    });
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: borrow,
        observed: underborrow,
        debtShares: true,
      }),
    ).toThrowError(/"sharePrice"/);
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: borrow,
        observed: underborrow,
        debtShares: true,
      }),
    ).toThrow(ConsumerLimitViolationError);
  });
  test("error: sharePrice throws SlippageCheckUnavailableError when a pair side is unobserved", () => {
    const limits: CheckedSlippageLimits & { type: "vaultV2Deposit" } = {
      type: "vaultV2Deposit",
      quote: { assetsPaid: 1010n, sharesMinted: 1000n },
      slippageTolerance: 0n,
      sharePrice: { expected: 10n ** 27n, tolerance: 0n },
    };
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits,
        observed: { assetsPaid: 1010n },
      }),
    ).toThrow(SlippageCheckUnavailableError);
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits,
        observed: { sharesMinted: 1000n },
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
  test("error: sharePrice throws when no shares moved", () => {
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: {
          type: "vaultV2Deposit",
          quote: { assetsPaid: 0n, sharesMinted: 0n },
          slippageTolerance: 0n,
          sharePrice: { expected: 10n ** 27n, tolerance: 0n },
        },
        observed: { assetsPaid: 0n, sharesMinted: 0n },
      }),
    ).toThrow(ConsumerLimitViolationError);
  });
  test("error: SlippageCheckUnavailableError", () => {
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits: {
          type: "blueSupply",
          quote: { assetsPaid: 0n },
          slippageTolerance: 0n,
        },
        observed: {},
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });
  test("behavior: favorable movement and unquoted amounts are unchecked", () => {
    const limits = {
      type: "blueSupply" as const,
      quote: { sharesMinted: 100n, assetsPaid: 100n },
      slippageTolerance: 0n,
    };
    const result = checkSlippage({
      label: "Limit operation 0 (vaultV2Deposit)",
      limits,
      observed: { sharesMinted: 110n, assetsPaid: 90n, sharesBurned: 999n },
    });
    expect(result).toEqual({
      quote: limits.quote,
      slippageTolerance: limits.slippageTolerance,
    });
    expect(Object.isFrozen(result.quote)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(limits.quote)).toBe(false);
  });
  test.each([
    {
      bound: "maxBorrowShares" as const,
      bounds: { maxBorrowShares: 100n },
      accepted: { supplyShares: 0n, borrowShares: 100n, collateral: 0n },
      rejected: { supplyShares: 0n, borrowShares: 101n, collateral: 0n },
    },
    {
      bound: "minSupplyShares" as const,
      bounds: { minSupplyShares: 100n },
      accepted: { supplyShares: 100n, borrowShares: 0n, collateral: 0n },
      rejected: { supplyShares: 99n, borrowShares: 0n, collateral: 0n },
    },
    {
      bound: "minCollateral" as const,
      bounds: { minCollateral: 100n },
      accepted: { supplyShares: 0n, borrowShares: 0n, collateral: 100n },
      rejected: { supplyShares: 0n, borrowShares: 0n, collateral: 99n },
    },
  ] as const)(
    "behavior: position.$bound bounds the after-state inclusively",
    ({ bounds, accepted, rejected }) => {
      const label = "Limit operation 0 (blueSupply)";
      const limits = {
        type: "blueSupply" as const,
        quote: { sharesMinted: 1n },
        slippageTolerance: 0n,
        position: bounds,
      };
      expect(
        checkSlippage({
          label,
          limits,
          observed: { sharesMinted: 1n },
          position: accepted,
        }),
      ).toEqual({
        quote: { sharesMinted: 1n },
        slippageTolerance: 0n,
        position: bounds,
      });
      const error = (() => {
        try {
          checkSlippage({
            label,
            limits,
            observed: { sharesMinted: 1n },
            position: rejected,
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(ConsumerLimitViolationError);
      expect((error as Error).message.startsWith(label)).toBe(true);
    },
  );
  test("error: position bounds throw when the after-state is missing", () => {
    const label = "Limit operation 0 (blueSupply)";
    const error = (() => {
      try {
        checkSlippage({
          label,
          limits: {
            type: "blueSupply",
            quote: { sharesMinted: 1n },
            slippageTolerance: 0n,
            position: { maxBorrowShares: 1n },
          },
          observed: { sharesMinted: 1n },
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect((error as Error).message.startsWith(label)).toBe(true);
  });
  test("behavior: position.maxCredit is an inclusive final bound not scaled by tolerance", () => {
    const limits: CheckedSlippageLimits & { type: "midnightRedeem" } = {
      type: "midnightRedeem",
      quote: { creditRedeemed: 10n },
      slippageTolerance: 10_000000000000000n,
      position: { maxCredit: 5n },
    };
    const label = "Limit operation 0 (midnightRedeem)";
    const observed = { creditRedeemed: 10n };
    expect(checkSlippage({ label, limits, observed, credit: 5n })).toEqual({
      quote: limits.quote,
      slippageTolerance: limits.slippageTolerance,
      position: { maxCredit: 5n },
    });
    expect(() =>
      checkSlippage({ label, limits, observed, credit: 6n }),
    ).toThrow(ConsumerLimitViolationError);
  });

  test("error: position.maxCredit throws when the credit read is missing", () => {
    const label = "Limit operation 0 (midnightRedeem)";
    expect(() =>
      checkSlippage({
        label,
        limits: {
          type: "midnightRedeem",
          quote: { creditRedeemed: 1n },
          slippageTolerance: 0n,
          position: { maxCredit: 0n },
        },
        observed: { creditRedeemed: 1n },
      }),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("behavior: 100% tolerance retains inclusive boundaries", () => {
    const limits = {
      type: "blueSupply" as const,
      quote: { sharesMinted: 100n, assetsPaid: 100n },
      slippageTolerance: 10n ** 18n,
    };
    expect(
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits,
        observed: { sharesMinted: 0n, assetsPaid: 200n },
      }),
    ).toEqual({
      quote: limits.quote,
      slippageTolerance: limits.slippageTolerance,
    });
    expect(() =>
      checkSlippage({
        label: "Limit operation 0 (vaultV2Deposit)",
        limits,
        observed: { sharesMinted: 0n, assetsPaid: 201n },
      }),
    ).toThrow(ConsumerLimitViolationError);
  });
});
