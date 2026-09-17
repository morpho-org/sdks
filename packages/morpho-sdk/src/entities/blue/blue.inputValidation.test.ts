import {
  AccrualPosition,
  Market,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { createMockClient } from "@morpho-org/test/mock";
import { type Address, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { morphoViemExtension } from "../../client/index.js";
import {
  MutuallyExclusiveRepayAmountsError,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationsRequireBorrowError,
  type VaultV2BlueReallocation,
} from "../../types/index.js";

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
