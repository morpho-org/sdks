import {
  AccrualPosition,
  Market,
  type MarketId,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { createMockClient } from "@morpho-org/test/mock";
import { type Address, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, expectTypeOf, test } from "vitest";
import { morphoViemExtension } from "../../client/index.js";
import {
  DepositOwnerMismatchError,
  MarketIdMismatchError,
  MutuallyExclusiveRepayAmountsError,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationsRequireBorrowError,
  type RequirementSignature,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import { MorphoBlue } from "./blue.js";

const userAddress: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const marketParams = new MarketParams({
  loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  oracle: "0x1111111111111111111111111111111111111111",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});
const positionData = new AccrualPosition(
  {
    user: userAddress,
    supplyShares: 10n,
    borrowShares: 10n,
    collateral: 10n ** 24n,
  },
  new Market({
    params: marketParams,
    totalSupplyAssets: 10n ** 24n,
    totalBorrowAssets: 10n ** 23n,
    totalSupplyShares: 10n ** 24n,
    totalBorrowShares: 10n ** 23n,
    lastUpdate: 1_700_000_000n,
    rateAtTarget: 0n,
    fee: 0n,
    price: ORACLE_PRICE_SCALE,
  }),
);
const reallocation = {
  vault: userAddress,
  from: { type: "idle" },
  to: { adapter: marketParams.oracle },
  assets: 1n,
  penalty: 0n,
} satisfies VaultV2BlueReallocation;

const makeEntity = () =>
  createMockClient(mainnet)
    .client.extend(morphoViemExtension())
    .morpho.blue(marketParams, mainnet.id);

describe("MorphoBlue write input validation", () => {
  test.each(["getter", "iterator"] as const)(
    "rejects zero legs before reading a throwing reallocation %s",
    (kind) => {
      let reads = 0;
      const params = {
        userAddress,
        collateralAssets: 0n,
        borrowAssets: 0n,
        now: 1_700_000_000n,
        deadline: 1_900_000_000n,
        get reallocations(): Iterable<never> {
          if (kind === "getter") {
            reads++;
            throw new Error("unexpected reallocation read");
          }
          return {
            [Symbol.iterator](): Iterator<never> {
              reads++;
              throw new Error("unexpected reallocation iteration");
            },
          };
        },
      };
      expect(() => makeEntity().supplyCollateralBorrow(params)).toThrow(
        NonPositiveInputError,
      );
      expect(reads).toBe(0);
    },
  );

  test("raw entity params cannot reach any prepared implementation", () => {
    expectTypeOf<Parameters<MorphoBlue["supply"]>[0]>().not.toExtend<
      Parameters<MorphoBlue["supplyPrepared"]>[0]
    >();
    expectTypeOf<Parameters<MorphoBlue["withdraw"]>[0]>().not.toExtend<
      Parameters<MorphoBlue["withdrawPrepared"]>[0]
    >();
    expectTypeOf<Parameters<MorphoBlue["supplyCollateral"]>[0]>().not.toExtend<
      Parameters<MorphoBlue["supplyCollateralPrepared"]>[0]
    >();
    expectTypeOf<Parameters<MorphoBlue["borrow"]>[0]>().not.toExtend<
      Parameters<MorphoBlue["borrowPrepared"]>[0]
    >();
    expectTypeOf<Parameters<MorphoBlue["repay"]>[0]>().not.toExtend<
      Parameters<MorphoBlue["repayPrepared"]>[0]
    >();
    expectTypeOf<
      Parameters<MorphoBlue["withdrawCollateral"]>[0]
    >().not.toExtend<Parameters<MorphoBlue["withdrawCollateralPrepared"]>[0]>();
    expectTypeOf<
      Parameters<MorphoBlue["repayWithdrawCollateral"]>[0]
    >().not.toExtend<
      Parameters<MorphoBlue["repayWithdrawCollateralPrepared"]>[0]
    >();
    expectTypeOf<
      Parameters<MorphoBlue["supplyCollateralBorrow"]>[0]
    >().not.toExtend<
      Parameters<MorphoBlue["supplyCollateralBorrowPrepared"]>[0]
    >();
    expectTypeOf<Parameters<MorphoBlue["refinance"]>[0]>().not.toExtend<
      Parameters<MorphoBlue["refinancePrepared"]>[0]
    >();
    expectTypeOf<
      Parameters<MorphoBlue["withdrawBuyCallback"]>[0]
    >().not.toExtend<
      Parameters<MorphoBlue["withdrawBuyCallbackPrepared"]>[0]
    >();
  });

  test("fixed-intent prepared consumers reject combined and sibling operation inputs", () => {
    type CombinedSupply = Parameters<
      MorphoBlue["supplyCollateralBorrowPrepared"]
    >[0];
    type CombinedRepay = Parameters<
      MorphoBlue["repayWithdrawCollateralPrepared"]
    >[0];
    type SupplyCollateral = Parameters<
      MorphoBlue["supplyCollateralPrepared"]
    >[0];
    type Borrow = Parameters<MorphoBlue["borrowPrepared"]>[0];
    type Repay = Parameters<MorphoBlue["repayPrepared"]>[0];
    type WithdrawCollateral = Parameters<
      MorphoBlue["withdrawCollateralPrepared"]
    >[0];

    expectTypeOf<CombinedSupply>().not.toExtend<SupplyCollateral>();
    expectTypeOf<Borrow>().not.toExtend<SupplyCollateral>();
    expectTypeOf<CombinedSupply>().not.toExtend<Borrow>();
    expectTypeOf<SupplyCollateral>().not.toExtend<Borrow>();
    expectTypeOf<CombinedRepay>().not.toExtend<Repay>();
    expectTypeOf<WithdrawCollateral>().not.toExtend<Repay>();
    expectTypeOf<CombinedRepay>().not.toExtend<WithdrawCollateral>();
    expectTypeOf<Repay>().not.toExtend<WithdrawCollateral>();
    expectTypeOf<
      ReturnType<MorphoBlue["parseSupplyCollateralParams"]>
    >().toEqualTypeOf<SupplyCollateral>();
    expectTypeOf<
      ReturnType<MorphoBlue["parseBorrowParams"]>
    >().toEqualTypeOf<Borrow>();
    expectTypeOf<
      ReturnType<MorphoBlue["parseRepayParams"]>
    >().toEqualTypeOf<Repay>();
    expectTypeOf<
      ReturnType<MorphoBlue["parseWithdrawCollateralParams"]>
    >().toEqualTypeOf<WithdrawCollateral>();
  });

  test("fixed-intent handles preserve inactive legs, calldata and frozen metadata", () => {
    const entity = makeEntity();
    const common = { userAddress, positionData, deadline: maxUint256 };
    const supplyRaw = { ...common, collateralAssets: 2n };
    const borrowRaw = { ...common, borrowAssets: 2n };
    const repayRaw = { ...common, repayAssets: 2n };
    const withdrawRaw = { ...common, collateralAssets: 2n };
    const cases = [
      [
        entity.supplyCollateral(supplyRaw).buildTx(),
        entity
          .supplyCollateralBorrow({ ...supplyRaw, borrowAssets: 0n })
          .buildTx(),
        "blueSupplyCollateral",
      ],
      [
        entity.borrow(borrowRaw).buildTx(),
        entity
          .supplyCollateralBorrow({ ...borrowRaw, collateralAssets: 0n })
          .buildTx(),
        "blueBorrow",
      ],
      [
        entity.repay(repayRaw).buildTx(),
        entity
          .repayWithdrawCollateral({ ...repayRaw, collateralAssets: 0n })
          .buildTx(),
        "blueRepay",
      ],
      [
        entity.withdrawCollateral(withdrawRaw).buildTx(),
        entity
          .repayWithdrawCollateral({ ...withdrawRaw, repayAssets: 0n })
          .buildTx(),
        "blueWithdrawCollateral",
      ],
    ] as const;
    for (const [tx, combined, type] of cases) {
      expect(tx).toEqual({ ...combined, action: { ...combined.action, type } });
      expect(Object.isFrozen(tx)).toBe(true);
      expect(Object.isFrozen(tx.action.args)).toBe(true);
    }
    for (const raw of [supplyRaw, borrowRaw, repayRaw, withdrawRaw]) {
      expect(Object.isFrozen(raw)).toBe(false);
    }
  });

  test("prepared static amounts and defaults are independent of later raw mutations", () => {
    const raw = { userAddress, assets: 2n, deadline: maxUint256 };
    const handle = makeEntity().supply(raw);
    const expected = handle.buildTx();
    Object.assign(raw, { assets: -1n, deadline: 0n });
    expect(handle.buildTx()).toEqual(expected);
    expect(expected.action.args).toMatchObject({
      assets: 2n,
      referralFeePct: 0n,
    });
    expect(Object.isFrozen(raw)).toBe(false);
    expect(Object.isFrozen(expected.action.args)).toBe(true);
  });

  test.each(["borrow", "withdraw", "supplyCollateralBorrow"] as const)(
    "%s owns its one-shot reallocation iterable while checking every fresh signature",
    (method) => {
      let iterations = 0;
      const raw = {
        userAddress,
        positionData,
        borrowAssets: 2n,
        collateralAssets: 1n,
        assets: 1n,
        deadline: maxUint256,
        reallocations: {
          *[Symbol.iterator]() {
            iterations += 1;
            if (iterations > 1) throw new Error("plan consumed twice");
            yield reallocation;
          },
        },
      };
      const entity = makeEntity();
      const handle =
        method === "borrow"
          ? entity.borrow(raw)
          : method === "withdraw"
            ? entity.withdraw(raw)
            : entity.supplyCollateralBorrow(raw);
      expect(iterations).toBe(1);
      const expected = handle.buildTx();
      Object.assign(raw, {
        deadline: 0n,
        borrowAssets: -1n,
        collateralAssets: -1n,
        assets: -1n,
      });
      const invalidSignature = {
        action: { type: "authorization" },
        args: { owner: marketParams.oracle },
      } as unknown as RequirementSignature;
      for (let i = 0; i < 2; i += 1) {
        expect(() => handle.buildTx([invalidSignature])).toThrow(
          DepositOwnerMismatchError,
        );
        expect(handle.buildTx()).toEqual(expected);
      }
      expect(iterations).toBe(1);
      expect(Object.isFrozen(raw)).toBe(false);
      expect(Object.isFrozen(reallocation)).toBe(false);
    },
  );

  test("error: simple wrappers reject non-positive active legs", () => {
    const entity = makeEntity();

    expect(() =>
      entity.supplyCollateral({
        userAddress,
        collateralAssets: 0n,
        deadline: maxUint256,
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      entity.borrow({
        userAddress,
        positionData,
        borrowAssets: 0n,
        deadline: maxUint256,
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      entity.repay({
        userAddress,
        positionData,
        repayAssets: 0n,
        deadline: maxUint256,
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      entity.withdrawCollateral({
        userAddress,
        positionData,
        collateralAssets: 0n,
        deadline: maxUint256,
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NegativeInputError propagates through simple wrappers", () => {
    const entity = makeEntity();

    expect(() =>
      entity.supplyCollateral({
        userAddress,
        collateralAssets: -1n,
        deadline: maxUint256,
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      entity.borrow({
        userAddress,
        positionData,
        borrowAssets: -1n,
        deadline: maxUint256,
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      entity.repay({
        userAddress,
        positionData,
        repayAssets: -1n,
        deadline: maxUint256,
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      entity.withdrawCollateral({
        userAddress,
        positionData,
        collateralAssets: -1n,
        deadline: maxUint256,
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: MutuallyExclusiveRepayAmountsError on the combined route", () => {
    expect(() =>
      makeEntity().repayWithdrawCollateral({
        userAddress,
        positionData,
        repayAssets: 1n,
        repayShares: 1n,
        collateralAssets: 0n,
        deadline: maxUint256,
      } as never),
    ).toThrow(MutuallyExclusiveRepayAmountsError);
  });

  test("error: ReallocationsRequireBorrowError before reallocation mapping", () => {
    expect(() =>
      makeEntity().supplyCollateralBorrow({
        userAddress,
        collateralAssets: 1n,
        borrowAssets: 0n,
        reallocations: [reallocation],
        deadline: maxUint256,
      }),
    ).toThrow(ReallocationsRequireBorrowError);
  });
});

describe("MorphoBlue market identity", () => {
  const withStaleId = (tuple: MarketParams, id: MarketId): MarketParams =>
    Object.assign(Object.create(MarketParams.prototype), tuple, { id });

  test("error: constructor rejects market params whose id does not hash from the tuple", () => {
    const { morpho } = createMockClient(mainnet).client.extend(
      morphoViemExtension(),
    );
    const otherMarketParams = new MarketParams({
      ...marketParams,
      oracle: "0x2222222222222222222222222222222222222222",
    });

    expect(
      () =>
        new MorphoBlue(
          morpho,
          withStaleId(otherMarketParams, marketParams.id),
          mainnet.id,
        ),
    ).toThrow(MarketIdMismatchError);
  });
});
