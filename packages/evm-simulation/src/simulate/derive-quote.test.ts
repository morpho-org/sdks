import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  ConsumerLimitViolationError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
} from "../errors.js";
import type { InputOperationLimit } from "../limits.js";
import { deriveQuote } from "./derive-quote.js";
import { parseRequest } from "./request/parse-request.js";
import { checkSlippage } from "./slippage.js";

const owner: Address = "0x1111111111111111111111111111111111111111";
const vault: Address = "0x2222222222222222222222222222222222222222";
const marketId = `0x${"aa".repeat(32)}` as MarketId;
const market = {
  totalSupplyAssets: 999n,
  totalSupplyShares: 999_000_000n,
  totalBorrowAssets: 999n,
  totalBorrowShares: 999_000_000n,
};
const state = {
  market,
  preview: 100n,
  borrowShares: 100_000_000n,
  targetVault: {
    totalAssets: 99n,
    totalSupply: 99_000_000n,
    virtualShares: 1_000_000n,
  },
};

const parse = (operation: InputOperationLimit, data: Hex = "0x12345678") => {
  const request = parseRequest({
    chainId: 1,
    transactions: [{ from: owner, to: vault, data }],
    limits: { operations: [operation] },
  });
  if (request.limits === "none") throw new TypeError("Missing limits");
  return request.limits.operations[0]!;
};

test.each([
  "blueSupplyCollateralBorrow",
  "blueRepayWithdrawCollateral",
] as const)(
  "same-token %s derives net wallet amounts and retains subject checks",
  (type) => {
    for (const collateral of [50n, 100n, 150n]) {
      const operation: InputOperationLimit =
        type === "blueSupplyCollateralBorrow"
          ? {
              type,
              marketId,
              inputs: { collateralAssets: collateral, borrowAssets: 100n },
            }
          : {
              type,
              marketId,
              inputs: { repay: { assets: 100n }, collateralAssets: collateral },
            };
      const limit = deriveQuote(parse(operation), {
        ...state,
        netWalletAssets: true,
      });
      const received =
        type === "blueSupplyCollateralBorrow"
          ? 100n - collateral
          : collateral - 100n;
      expect(limit.quote.assetsReceived).toBe(received);
      expect(limit.quote.assetsPaid).toBe(received < 0n ? -received : 0n);
      const check = (observed: typeof limit.quote) =>
        checkSlippage({
          label: type,
          limits: limit,
          observed,
          derivedFields: limit.derivedFields,
          exactFields: limit.exactFields,
          debtShares: true,
        });
      expect(() => check(limit.quote)).not.toThrow();
      expect(() =>
        check({ ...limit.quote, assetsReceived: received - 1n }),
      ).toThrow(ConsumerLimitViolationError);
      expect(() =>
        check({ ...limit.quote, assetsReceived: undefined }),
      ).toThrow(SlippageCheckUnavailableError);
      const subjectField =
        type === "blueSupplyCollateralBorrow" ? "sharesMinted" : "sharesBurned";
      expect(() =>
        check({
          ...limit.quote,
          [subjectField]: limit.quote[subjectField]! - 1n,
        }),
      ).toThrow(ConsumerLimitViolationError);
      const unnetted = deriveQuote(parse(operation), state);
      expect(unnetted.quote.assetsPaid).toBe(
        type === "blueSupplyCollateralBorrow" ? collateral : 100n,
      );
      expect(unnetted.quote.assetsReceived).toBe(
        type === "blueSupplyCollateralBorrow" ? 100n : collateral,
      );
    }
  },
);

test.each([{ shares: 100_000_000n }, "full"] as const)(
  "same-token converted repay keeps adverse-only net wallet bounds %#",
  (repay) => {
    const limit = deriveQuote(
      parse({
        type: "blueRepayWithdrawCollateral",
        marketId,
        inputs: { repay, collateralAssets: 50n },
      }),
      { ...state, netWalletAssets: true },
    );
    expect(limit.quote.assetsReceived).toBe(-50n);
    expect(limit.exactFields).not.toContain("assetsReceived");
    const check = (assetsReceived: bigint) =>
      checkSlippage({
        label: "repay",
        limits: limit,
        observed: {
          ...limit.quote,
          assetsReceived,
          assetsPaid: -assetsReceived,
        },
        derivedFields: limit.derivedFields,
        exactFields: limit.exactFields,
        debtShares: true,
      });
    expect(() => check(-50n)).not.toThrow();
    expect(() => check(-49n)).not.toThrow();
    expect(() => check(-51n)).toThrow(ConsumerLimitViolationError);
  },
);

const cases: readonly [InputOperationLimit, object][] = [
  [
    { type: "vaultV1Deposit", vault, inputs: { assets: 100n } },
    { assetsPaid: 100n, sharesMinted: 100n },
  ],
  [
    { type: "vaultV2Deposit", vault, inputs: { assets: 100n } },
    { assetsPaid: 100n, sharesMinted: 100n },
  ],
  [
    { type: "vaultV1Withdraw", vault, inputs: { assets: 100n } },
    { assetsReceived: 100n, sharesBurned: 100n },
  ],
  [
    { type: "vaultV2Withdraw", vault, inputs: { assets: 100n } },
    { assetsReceived: 100n, sharesBurned: 100n },
  ],
  [
    { type: "vaultV1Redeem", vault, inputs: { shares: 100n } },
    { sharesBurned: 100n, assetsReceived: 100n },
  ],
  [
    { type: "vaultV2Redeem", vault, inputs: { shares: 100n } },
    { sharesBurned: 100n, assetsReceived: 100n },
  ],
  [
    { type: "blueSupply", marketId, inputs: { assets: 100n } },
    { assetsPaid: 100n, sharesMinted: 100_000_000n },
  ],
  [
    { type: "blueWithdraw", marketId, inputs: { assets: 100n } },
    { assetsReceived: 100n, sharesBurned: 100_000_000n },
  ],
  [
    { type: "blueWithdraw", marketId, inputs: { shares: 100_000_000n } },
    { assetsReceived: 100n, sharesBurned: 100_000_000n },
  ],
  [
    { type: "blueBorrow", marketId, inputs: { assets: 100n } },
    { assetsReceived: 100n, sharesMinted: 100_000_000n },
  ],
  [
    { type: "blueSupplyCollateral", marketId, inputs: { assets: 100n } },
    { assetsPaid: 100n, collateralSupplied: 100n },
  ],
  [
    { type: "blueWithdrawCollateral", marketId, inputs: { assets: 100n } },
    { assetsReceived: 100n, collateralWithdrawn: 100n },
  ],
  [
    { type: "blueRepay", marketId, inputs: { assets: 100n } },
    { assetsPaid: 100n, sharesBurned: 100_000_000n },
  ],
  [
    { type: "blueRepay", marketId, inputs: { shares: 100_000_000n } },
    { assetsPaid: 100n, sharesBurned: 100_000_000n },
  ],
  [
    { type: "blueRepay", marketId, inputs: "full" },
    { assetsPaid: 100n, sharesBurned: 100_000_000n },
  ],
  [
    {
      type: "blueSupplyCollateralBorrow",
      marketId,
      inputs: { collateralAssets: 100n, borrowAssets: 50n },
    },
    {
      assetsPaid: 100n,
      collateralSupplied: 100n,
      assetsReceived: 50n,
      sharesMinted: 50_000_000n,
    },
  ],
  [
    {
      type: "blueRepayWithdrawCollateral",
      marketId,
      inputs: { repay: "full", collateralAssets: 100n },
    },
    {
      assetsPaid: 100n,
      sharesBurned: 100_000_000n,
      assetsReceived: 100n,
      collateralWithdrawn: 100n,
    },
  ],
  [
    {
      type: "vaultV1MigrateToV2",
      sourceVault: vault,
      targetVault: owner,
      inputs: { assets: 100n },
    },
    { sharesBurned: 100n, sharesMinted: 100_000_000n },
  ],
  [
    {
      type: "vaultV1MigrateToV2",
      sourceVault: vault,
      targetVault: owner,
      inputs: { shares: 100n },
    },
    { sharesBurned: 100n, sharesMinted: 100_000_000n },
  ],
];

test.each([
  "vaultV1Withdraw",
  "vaultV2Withdraw",
  "vaultV1Redeem",
  "vaultV2Redeem",
] as const)("%s nets the declared fee exactly once", (type) => {
  const operation: InputOperationLimit =
    type === "vaultV1Withdraw" || type === "vaultV2Withdraw"
      ? {
          type,
          vault,
          inputs: { assets: 100n },
          referralFee: 100_000_000_000_000_000n,
        }
      : {
          type,
          vault,
          inputs: { shares: 100n },
          referralFee: 100_000_000_000_000_000n,
        };
  expect(deriveQuote(parse(operation), state).quote.assetsReceived).toBe(90n);
});

test.each([
  "blueRepayWithdrawCollateral",
  "blueSupplyCollateralBorrow",
] as const)(
  "%s bounds inactive subject legs even with quote overrides",
  (type) => {
    const operation: InputOperationLimit =
      type === "blueRepayWithdrawCollateral"
        ? {
            type,
            marketId,
            inputs: { collateralAssets: 10n },
            quote: { sharesMinted: 100n },
          }
        : {
            type,
            marketId,
            inputs: { borrowAssets: 10n },
            quote: { collateralSupplied: 1n },
          };
    const derived = deriveQuote(parse(operation), state);
    const field =
      type === "blueRepayWithdrawCollateral"
        ? "sharesMinted"
        : "collateralSupplied";
    const observed = { ...derived.quote, [field]: 0n };
    const check = (amount: bigint) =>
      checkSlippage({
        label: "inactive",
        limits: derived,
        observed: { ...observed, [field]: amount },
        debtShares: true,
        derivedFields: derived.derivedFields,
        exactFields: derived.exactFields,
        inactiveFields: derived.inactiveFields,
      });
    expect(() =>
      check(type === "blueRepayWithdrawCollateral" ? 1n : -1n),
    ).toThrow(ConsumerLimitViolationError);
    expect(derived.inactiveFields).toContain(field);
  },
);

test.each([
  "blueRepayWithdrawCollateral",
  "blueSupplyCollateralBorrow",
] as const)(
  "%s inactive subject accepts zero and rejects missing or adverse observations",
  (type) => {
    const operation: InputOperationLimit =
      type === "blueRepayWithdrawCollateral"
        ? { type, marketId, inputs: { collateralAssets: 10n } }
        : { type, marketId, inputs: { borrowAssets: 10n } };
    const limit = deriveQuote(parse(operation), state);
    const field =
      type === "blueRepayWithdrawCollateral"
        ? "sharesMinted"
        : "collateralSupplied";
    const check = (amount: bigint | undefined) =>
      checkSlippage({
        label: "inactive",
        limits: limit,
        observed: { ...limit.quote, [field]: amount },
        debtShares: true,
        derivedFields: limit.derivedFields,
        exactFields: limit.exactFields,
        inactiveFields: limit.inactiveFields,
      });
    expect(check(0n).quote[field]).toBe(0n);
    expect(() =>
      check(type === "blueRepayWithdrawCollateral" ? 1n : -1n),
    ).toThrow(ConsumerLimitViolationError);
    expect(() => check(undefined)).toThrow(SlippageCheckUnavailableError);
  },
);

describe("input-derived quotes", () => {
  test.each([undefined, 100n])(
    "repay-only collateral rejects loss even with quote %s",
    (collateralWithdrawn) => {
      const limit = deriveQuote(
        parse({
          type: "blueRepayWithdrawCollateral",
          marketId,
          inputs: { repay: "full" },
          quote: {
            collateralWithdrawn,
            ...(collateralWithdrawn === undefined
              ? {}
              : { assetsReceived: 100n }),
          },
        }),
        state,
      );
      expect(limit.inactiveFields).toContain("collateralWithdrawn");
      const check = (amount: bigint | undefined) =>
        checkSlippage({
          label: "repay-only",
          limits: limit,
          observed: { ...limit.quote, collateralWithdrawn: amount },
          derivedFields: limit.derivedFields,
          exactFields: limit.exactFields,
          inactiveFields: limit.inactiveFields,
          debtShares: true,
        });
      expect(() => check(0n)).not.toThrow();
      expect(() => check(1n)).toThrow(ConsumerLimitViolationError);
      expect(() => check(undefined)).toThrow(SlippageCheckUnavailableError);
    },
  );
  test.each(["blueWithdrawCollateral", "blueRepayWithdrawCollateral"] as const)(
    "%s explicit collateral quote retains declared-market movement guard",
    (type) => {
      const operation: InputOperationLimit =
        type === "blueWithdrawCollateral"
          ? { type, marketId, inputs: { assets: 100n } }
          : { type, marketId, inputs: { collateralAssets: 100n } };
      const limit = deriveQuote(
        parse({ ...operation, quote: { collateralWithdrawn: 100n } }),
        state,
      );
      const check = (collateralWithdrawn: bigint) =>
        checkSlippage({
          label: "wrong market",
          limits: limit,
          observed: { ...limit.quote, collateralWithdrawn },
          derivedFields: limit.derivedFields,
          exactFields: limit.exactFields,
          inactiveFields: limit.inactiveFields,
          debtShares: true,
        });
      expect(() => check(100n)).not.toThrow();
      expect(() => check(0n)).toThrow(ConsumerLimitViolationError);
    },
  );
  test.each<InputOperationLimit>([
    { type: "vaultV1Withdraw", vault, inputs: { assets: 100n } },
    { type: "vaultV2Withdraw", vault, inputs: { assets: 100n } },
    { type: "blueWithdraw", marketId, inputs: { assets: 100n } },
    { type: "blueBorrow", marketId, inputs: { assets: 100n } },
    {
      type: "blueSupplyCollateralBorrow",
      marketId,
      inputs: { collateralAssets: 100n, borrowAssets: 100n },
    },
    {
      type: "vaultV1MigrateToV2",
      sourceVault: vault,
      targetVault: owner,
      inputs: { assets: 100n },
    },
  ])(
    "derived subject shares reject positive split movements %#",
    (operation) => {
      const limit = deriveQuote(parse(operation), state);
      const debtShares =
        operation.type === "blueBorrow" ||
        operation.type === "blueSupplyCollateralBorrow";
      const field = debtShares ? "sharesMinted" : "sharesBurned";
      const expected = limit.quote[field]!;
      for (const amount of [
        1n,
        expected - 2n,
        expected - 1n,
        expected,
        expected + 1n,
      ]) {
        const check = () =>
          checkSlippage({
            label: "split subject",
            limits: limit,
            observed: { ...limit.quote, [field]: amount },
            derivedFields: limit.derivedFields,
            exactFields: limit.exactFields,
            debtShares,
            subjectShareRoundingAllowance:
              operation.type === "blueWithdraw" ? 1n : undefined,
          });
        if (
          amount === expected ||
          (operation.type === "blueWithdraw" && amount === expected - 1n)
        )
          expect(check).not.toThrow();
        else expect(check).toThrow(ConsumerLimitViolationError);
      }
    },
  );
  test.each<InputOperationLimit>([
    { type: "vaultV1Withdraw", vault, inputs: { assets: 100n } },
    { type: "vaultV2Withdraw", vault, inputs: { assets: 100n } },
    { type: "blueWithdraw", marketId, inputs: { assets: 100n } },
    { type: "blueBorrow", marketId, inputs: { assets: 100n } },
  ])(
    "quoted payout does not disable subject movement checks %#",
    (operation) => {
      for (const quoteShares of [false, true]) {
        const shareField =
          operation.type === "blueBorrow" ? "sharesMinted" : "sharesBurned";
        const limit = deriveQuote(
          parse({
            ...operation,
            quote: {
              assetsReceived: 100n,
              ...(quoteShares ? { [shareField]: 100_000_000n } : {}),
            },
          }),
          state,
        );
        expect(() =>
          checkSlippage({
            label: "payout",
            limits: limit,
            observed: { assetsReceived: 100n, [shareField]: 0n },
            derivedFields: limit.derivedFields,
            exactFields: limit.exactFields,
            debtShares: operation.type === "blueBorrow",
          }),
        ).toThrow(ConsumerLimitViolationError);
        expect(() =>
          checkSlippage({
            label: "payout",
            limits: limit,
            observed: limit.quote,
            derivedFields: limit.derivedFields,
            exactFields: limit.exactFields,
            debtShares: operation.type === "blueBorrow",
          }),
        ).not.toThrow();
      }
    },
  );
  test("missing derived sides identify the operation index", () => {
    const request = parseRequest({
      chainId: 1,
      transactions: [{ from: owner, to: vault, data: "0x12345678" }],
      limits: {
        operations: [
          { type: "vaultV2Deposit", vault, inputs: { assets: 100n } },
          {
            type: "blueSupplyCollateralBorrow",
            marketId,
            inputs: { collateralAssets: 100n },
            quote: { sharesMinted: 100n },
          },
        ],
      },
    });
    if (request.limits === "none") throw new TypeError("Missing limits");
    const limit = request.limits.operations[1]!;
    expect(() =>
      deriveQuote(limit, {
        ...state,
        operationIndex: 1,
      }),
    ).toThrowError(
      expect.objectContaining({
        fieldErrors: expect.arrayContaining([
          expect.stringContaining(
            "limits.operations[1].quote.assetsReceived: required",
          ),
        ]),
      }),
    );
  });
  test("assets-mode migration requires movement from the declared source vault", () => {
    const limit = deriveQuote(
      parse({
        type: "vaultV1MigrateToV2",
        sourceVault: vault,
        targetVault: owner,
        inputs: { assets: 100n },
      }),
      state,
    );
    for (const sharesBurned of [0n, 99n, 101n])
      expect(() =>
        checkSlippage({
          label: "migration",
          limits: limit,
          observed: { ...limit.quote, sharesBurned },
          derivedFields: limit.derivedFields,
          exactFields: limit.exactFields,
        }),
      ).toThrow(ConsumerLimitViolationError);
    for (const sharesBurned of [100n])
      expect(() =>
        checkSlippage({
          label: "migration",
          limits: limit,
          observed: { ...limit.quote, sharesBurned },
          derivedFields: limit.derivedFields,
          exactFields: limit.exactFields,
        }),
      ).not.toThrow();
  });
  test.each<{
    operation: InputOperationLimit;
    missing: "assetsReceived" | "collateralSupplied" | "sharesBurned";
  }>([
    {
      operation: {
        type: "blueSupplyCollateralBorrow",
        marketId,
        inputs: { collateralAssets: 100n },
        quote: { sharesMinted: 100n },
      },
      missing: "assetsReceived",
    },
    {
      operation: {
        type: "blueSupplyCollateralBorrow",
        marketId,
        inputs: { borrowAssets: 100n },
        quote: { assetsPaid: 100n },
      },
      missing: "collateralSupplied",
    },
    {
      operation: {
        type: "blueRepayWithdrawCollateral",
        marketId,
        inputs: { repay: { assets: 100n } },
        quote: { collateralWithdrawn: 100n },
      },
      missing: "assetsReceived",
    },
    {
      operation: {
        type: "blueRepayWithdrawCollateral",
        marketId,
        inputs: { collateralAssets: 100n },
        quote: { assetsPaid: 100n },
      },
      missing: "sharesBurned",
    },
  ])(
    "revalidates partial overrides after derivation %#",
    ({ operation, missing }) => {
      const parsed = parse(operation);
      expect(() => deriveQuote(parsed, state)).toThrow(
        SimulationValidationError,
      );
      try {
        deriveQuote(parsed, state);
      } catch (error) {
        expect(error).toMatchObject({
          fieldErrors: expect.arrayContaining([
            expect.stringContaining(`quote.${missing}: required`),
          ]),
        });
      }
      const complete = deriveQuote(
        parse({ ...operation, quote: { ...operation.quote, [missing]: 100n } }),
        state,
      );
      expect(complete.quote[missing]).toBe(100n);
    },
  );
  test("reports exact, derived and quoted scalar checks separately", () => {
    for (const quote of [undefined, { sharesMinted: 90n }]) {
      const limit = deriveQuote(
        parse({
          type: "vaultV2Deposit",
          vault,
          inputs: { assets: 100n },
          quote,
        }),
        state,
      );
      const checked = checkSlippage({
        label: "deposit",
        limits: limit,
        observed: limit.quote,
        derivedFields: limit.derivedFields,
        exactFields: limit.exactFields,
      });
      expect(checked.fieldChecks).toEqual({
        assetsPaid: "exact",
        sharesMinted: quote === undefined ? "minimum" : "quoted",
      });
      expect(checked).not.toHaveProperty("derivedFields");
      expect(checked).not.toHaveProperty("exactFields");
    }
    const limit = deriveQuote(
      parse({ type: "blueBorrow", marketId, inputs: { assets: 100n } }),
      state,
    );
    expect(
      checkSlippage({
        label: "borrow",
        limits: limit,
        observed: limit.quote,
        derivedFields: limit.derivedFields,
        exactFields: limit.exactFields,
        debtShares: true,
      }).fieldChecks,
    ).toEqual({ assetsReceived: "exact", sharesMinted: "exact" });
  });
  test.each(cases)("derives %#", (operation, quote) => {
    const limit = deriveQuote(parse(operation), state);
    expect(limit.quote).toEqual(quote);
    expect(() =>
      checkSlippage({
        label: "operation",
        limits: limit,
        observed: quote,
        derivedFields: limit.derivedFields,
        exactFields: limit.exactFields,
        debtShares:
          operation.type === "blueBorrow" ||
          operation.type === "blueRepay" ||
          operation.type === "blueSupplyCollateralBorrow" ||
          operation.type === "blueRepayWithdrawCollateral",
      }),
    ).not.toThrow();
  });
  test.each(cases)("does not depend on calldata: %#", (operation) => {
    expect(deriveQuote(parse(operation, "0x11111111"), state)).toEqual(
      deriveQuote(parse(operation, "0x22222222"), state),
    );
  });
  test("explicit sides override derived sides and retain tolerance", () => {
    const limit = deriveQuote(
      parse({
        type: "vaultV2Deposit",
        vault,
        inputs: { assets: 100n },
        quote: { sharesMinted: 90n },
        slippageTolerance: 10n ** 17n,
      }),
      state,
    );
    expect(limit.quote).toEqual({ assetsPaid: 100n, sharesMinted: 90n });
    expect(limit.derivedFields).toEqual(["assetsPaid"]);
    expect(() =>
      checkSlippage({
        label: "operation",
        limits: limit,
        observed: { assetsPaid: 100n, sharesMinted: 81n },
        derivedFields: limit.derivedFields,
        exactFields: limit.exactFields,
      }),
    ).not.toThrow();
  });
  test("an undeclared 1 bp fee and 1 wei amount mismatch both fail", () => {
    const limit = deriveQuote(
      parse({
        type: "blueBorrow",
        marketId,
        inputs: { assets: 1_000_000n },
        slippageTolerance: 10n ** 17n,
      }),
      state,
    );
    for (const received of [999_900n, 999_999n, 1_000_001n])
      expect(() =>
        checkSlippage({
          label: "operation",
          limits: limit,
          observed: {
            assetsReceived: received,
            sharesMinted: limit.quote.sharesMinted,
          },
          derivedFields: limit.derivedFields,
          exactFields: limit.exactFields,
          debtShares: true,
        }),
      ).toThrow(ConsumerLimitViolationError);
  });
  test("converted sides have no tolerance, but favorable movement passes", () => {
    const limit = deriveQuote(
      parse({ type: "vaultV2Deposit", vault, inputs: { assets: 100n } }),
      state,
    );
    expect(() =>
      checkSlippage({
        label: "operation",
        limits: limit,
        observed: { assetsPaid: 100n, sharesMinted: 99n },
        derivedFields: limit.derivedFields,
        exactFields: limit.exactFields,
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(() =>
      checkSlippage({
        label: "operation",
        limits: limit,
        observed: { assetsPaid: 100n, sharesMinted: 101n },
        derivedFields: limit.derivedFields,
        exactFields: limit.exactFields,
      }),
    ).not.toThrow();
  });
  test("fees use gross deductions, but repay fees use the net-to-gross ratio", () => {
    const referralFee = 10n ** 16n;
    expect(
      deriveQuote(
        parse({
          type: "blueSupply",
          marketId,
          inputs: { assets: 100n },
          referralFee,
        }),
        state,
      ).quote,
    ).toEqual({ assetsPaid: 100n, sharesMinted: 99_000_000n });
    expect(
      deriveQuote(
        parse({
          type: "blueRepay",
          marketId,
          inputs: { assets: 990n },
          referralFee,
        }),
        state,
      ).quote,
    ).toEqual({ assetsPaid: 1000n, sharesBurned: 990_000_000n });
    expect(
      deriveQuote(
        parse({
          type: "vaultV1MigrateToV2",
          sourceVault: vault,
          targetVault: owner,
          inputs: { shares: 100n },
          referralFee,
        }),
        state,
      ).quote,
    ).toEqual({ sharesBurned: 100n, sharesMinted: 99_000_000n });
  });
  test.each([
    { type: "blueBorrow", marketId, inputs: { assets: 100n } },
    { type: "blueWithdraw", marketId, inputs: { assets: 100n } },
    { type: "blueWithdraw", marketId, inputs: { shares: 100_000_000n } },
    {
      type: "blueSupplyCollateralBorrow",
      marketId,
      inputs: { borrowAssets: 100n },
    },
  ] satisfies InputOperationLimit[])(
    "reallocation penalties precede referral fees %#",
    (operation) => {
      const referralFee = 10n ** 17n;
      const limit = deriveQuote(
        parse({ ...operation, referralFee, reallocationPenalty: 7n }),
        state,
      );
      expect(limit.quote.assetsReceived).toBe(84n);
      const withoutPenalty = deriveQuote(
        parse({ ...operation, referralFee }),
        state,
      );
      expect(limit.quote).toEqual({
        ...withoutPenalty.quote,
        assetsReceived: 84n,
      });
      expect(
        deriveQuote(parse({ ...operation, reallocationPenalty: 7n }), state)
          .quote.assetsReceived,
      ).toBe(93n);
      const observed = { ...limit.quote, assetsReceived: 84n };
      expect(() =>
        checkSlippage({
          label: operation.type,
          limits: limit,
          observed,
          derivedFields: limit.derivedFields,
          exactFields: limit.exactFields,
          debtShares: operation.type !== "blueWithdraw",
        }),
      ).not.toThrow();
      expect(() =>
        checkSlippage({
          label: operation.type,
          limits: withoutPenalty,
          observed,
          derivedFields: withoutPenalty.derivedFields,
          exactFields: withoutPenalty.exactFields,
          debtShares: operation.type !== "blueWithdraw",
        }),
      ).toThrow(ConsumerLimitViolationError);
      expect(
        deriveQuote(
          parse({ ...operation, referralFee, reallocationPenalty: 0n }),
          state,
        ).quote,
      ).toEqual(withoutPenalty.quote);
      for (const reallocationPenalty of [100n, 101n])
        expect(() =>
          deriveQuote(parse({ ...operation, reallocationPenalty }), {
            ...state,
            operationIndex: 2,
          }),
        ).toThrow(SimulationValidationError);
    },
  );
  test("inactive wallet and share caps retain 1n while collateral loss is forbidden", () => {
    expect(
      deriveQuote(
        parse({
          type: "blueSupplyCollateralBorrow",
          marketId,
          inputs: { borrowAssets: 100n },
        }),
        state,
      ).quote.assetsPaid,
    ).toBe(1n);
    expect(
      deriveQuote(
        parse({
          type: "blueSupplyCollateralBorrow",
          marketId,
          inputs: { collateralAssets: 100n },
        }),
        state,
      ).quote.sharesMinted,
    ).toBe(1n);
    expect(
      deriveQuote(
        parse({
          type: "blueRepayWithdrawCollateral",
          marketId,
          inputs: { repay: "full" },
        }),
        state,
      ).quote.collateralWithdrawn,
    ).toBe(0n);
    expect(
      deriveQuote(
        parse({
          type: "blueRepayWithdrawCollateral",
          marketId,
          inputs: { collateralAssets: 100n },
        }),
        state,
      ).quote.assetsPaid,
    ).toBe(1n);
  });
  test("missing derivation evidence fails closed", () => {
    expect(() =>
      deriveQuote(
        parse({ type: "vaultV2Deposit", vault, inputs: { assets: 100n } }),
        {},
      ),
    ).toThrow(SlippageCheckUnavailableError);
    expect(() =>
      deriveQuote(parse({ type: "blueRepay", marketId, inputs: "full" }), {
        market,
      }),
    ).toThrow(SlippageCheckUnavailableError);
    const missingBlueSupplyMarket = () =>
      deriveQuote(
        parse({ type: "blueSupply", marketId, inputs: { assets: 100n } }),
        {},
      );
    expect(missingBlueSupplyMarket).toThrow(SlippageCheckUnavailableError);
    expect(missingBlueSupplyMarket).toThrow(
      'Missing accrued market state for "blueSupply".',
    );
    const missingMigrationTarget = () =>
      deriveQuote(
        parse({
          type: "vaultV1MigrateToV2",
          sourceVault: vault,
          targetVault: owner,
          inputs: { assets: 100n },
        }),
        { preview: 100n },
      );
    expect(missingMigrationTarget).toThrow(SlippageCheckUnavailableError);
    expect(missingMigrationTarget).toThrow(
      "Missing target vault conversion state for migration.",
    );
  });
  test("a zero active conversion fails closed instead of disabling the required floor", () => {
    expect(() =>
      deriveQuote(
        parse({ type: "vaultV2Deposit", vault, inputs: { assets: 1n } }),
        { preview: 0n },
      ),
    ).toThrow(SlippageCheckUnavailableError);
  });
  test("parsing does not freeze the consumer's nested inputs", () => {
    const inputs = { repay: { assets: 100n } };
    parse({ type: "blueRepayWithdrawCollateral", marketId, inputs });
    expect(Object.isFrozen(inputs)).toBe(false);
    expect(Object.isFrozen(inputs.repay)).toBe(false);
  });
  test("shared wallet proceeds are not evidence of debt on a different market", () => {
    const limit = deriveQuote(
      parse({ type: "blueBorrow", marketId, inputs: { assets: 100n } }),
      state,
    );
    expect(() =>
      checkSlippage({
        label: "borrow",
        limits: limit,
        observed: { assetsReceived: 100n, sharesMinted: 0n },
        derivedFields: limit.derivedFields,
        exactFields: limit.exactFields,
        debtShares: true,
      }),
    ).toThrow(ConsumerLimitViolationError);
  });
  test.each([
    {},
    { assets: 0n },
    { assets: -1n },
    { assets: 1n, extra: 1n },
    { assets: 1n, shares: 1n },
  ])("rejects malformed inputs %#", (inputs) => {
    expect(() =>
      parse({ type: "blueWithdraw", marketId, inputs } as InputOperationLimit),
    ).toThrow(SimulationValidationError);
  });
  test.each([
    { referralFee: -1n },
    { referralFee: 10n ** 18n },
    { referralFee: "1" },
    { type: "blueSupplyCollateral", referralFee: 0n },
    { type: "blueWithdrawCollateral", referralFee: 0n },
    { type: "blueWithdraw", inputs: "full" },
    { type: "blueSupply", inputs: "full" },
    { type: "blueRepayWithdrawCollateral", inputs: { repay: null } },
    { type: "blueRepayWithdrawCollateral", inputs: { repay: [] } },
    { type: "blueRepayWithdrawCollateral", inputs: { repay: {} } },
    {
      type: "blueRepayWithdrawCollateral",
      inputs: { repay: { assets: 1n, shares: 1n } },
    },
    { type: "blueRepayWithdrawCollateral", inputs: { repay: { assets: 0n } } },
    {
      inputs: undefined,
      quote: { assetsReceived: 100n, sharesMinted: 100n },
      referralFee: 0n,
    },
    { quote: null },
    { quote: [] },
    { quote: "invalid" },
    { reallocationPenalty: -1n },
    { reallocationPenalty: 2n ** 256n },
    { reallocationPenalty: 1 },
    { type: "blueSupply", reallocationPenalty: 0n },
    {
      type: "blueSupplyCollateralBorrow",
      inputs: { collateralAssets: 100n },
      reallocationPenalty: 1n,
    },
    {
      inputs: undefined,
      quote: { assetsReceived: 100n, sharesMinted: 100n },
      reallocationPenalty: 0n,
    },
  ])(
    "rejects malformed input declarations through parseRequest %#",
    (overrides) => {
      expect(() =>
        parseRequest({
          chainId: 1,
          transactions: [{ from: owner, to: vault, data: "0x12345678" }],
          limits: {
            operations: [
              {
                type: "blueBorrow",
                marketId,
                inputs: { assets: 100n },
                ...overrides,
              } as InputOperationLimit,
            ],
          },
        }),
      ).toThrow(SimulationValidationError);
    },
  );
  test.each([
    "blueRefinance",
    "vaultV2ForceWithdraw",
    "vaultV2ForceRedeem",
    "vaultV1InKindRedeem",
    "vaultV2InKindRedeem",
  ])("does not derive %s", (type) => {
    expect(() =>
      parse({
        type,
        marketId,
        vault,
        inputs: { assets: 1n },
      } as InputOperationLimit),
    ).toThrow(SimulationValidationError);
  });
});
