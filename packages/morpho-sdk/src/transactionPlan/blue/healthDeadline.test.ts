import {
  AccrualPosition,
  getChainAddresses,
  Market,
  MarketParams,
  MathLib,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { expect, test } from "vitest";
import { WethUsdsBlue } from "../../../test/fixtures/blue.js";
import { DEFAULT_LLTV_BUFFER } from "../../helpers/constant.js";
import {
  validatePositionHealth,
  validatePositionHealthAfterWithdraw,
} from "../../helpers/validate.js";
import {
  BorrowExceedsSafeLtvError,
  WithdrawMakesPositionUnhealthyError,
} from "../../types/index.js";
import { NonIntegerInputError } from "../error.js";
import { buildTransactions } from "../plan.js";
import { prepareBlueBorrow } from "./borrow.js";
import { prepareBlueRefinance } from "./refinance.js";
import { prepareBlueRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";
import { prepareBlueSupplyCollateralBorrow } from "./supplyCollateralBorrow.js";
import { prepareBlueWithdrawCollateral } from "./withdrawCollateral.js";

const methods = [
  "borrow",
  "supplyCollateralBorrow",
  "withdrawCollateral",
  "repayWithdrawCollateral",
  "refinance",
] as const;
type Method = (typeof methods)[number];
const now = 1_800_000_000n;
const account = privateKeyToAccount(toHex(1n, { size: 32 })).address;
const borrowAssets = 10n ** 17n;
const collateralAssets = 10n ** 17n;
const destinationParams = new MarketParams({
  ...WethUsdsBlue,
  lltv: 800_000000000000000n,
});

function fixture(method: Method, safeHorizon: bigint) {
  const isBorrow = method === "borrow" || method === "supplyCollateralBorrow";
  const isWithdraw =
    method === "withdrawCollateral" || method === "repayWithdrawCollateral";
  const makePosition = (params: MarketParams, suppliedCollateral: bigint) =>
    new AccrualPosition(
      {
        user: account,
        supplyShares: 0n,
        borrowShares: 10n ** 18n,
        collateral: suppliedCollateral,
      },
      new Market({
        params,
        totalSupplyAssets: 10n ** 24n,
        totalSupplyShares: 10n ** 24n,
        totalBorrowAssets: 10n ** 24n / 2n,
        totalBorrowShares: 10n ** 24n / 2n,
        lastUpdate: now,
        fee: 0n,
        price: ORACLE_PRICE_SCALE,
        rateAtTarget: 100_000_000_000_000n,
      }),
    );
  const destination = makePosition(destinationParams, 0n);
  const lltv =
    method === "refinance" ? destinationParams.lltv : WethUsdsBlue.lltv;
  const extraDebt =
    method === "refinance"
      ? destination.accrueInterest(now + safeHorizon).borrowAssets
      : isBorrow
        ? borrowAssets
        : 0n;
  const collateral =
    MathLib.wDivUp(
      makePosition(WethUsdsBlue, 0n).accrueInterest(now + safeHorizon)
        .borrowAssets + extraDebt,
      lltv - DEFAULT_LLTV_BUFFER,
    ) + (isWithdraw ? collateralAssets : 0n);
  const position = makePosition(WethUsdsBlue, collateral);
  const snapshot = (snapshotPosition: AccrualPosition) => ({
    marketId: snapshotPosition.marketId,
    marketData: { chainId: 1, market: snapshotPosition.market },
    positionData: { chainId: 1, position: snapshotPosition },
  });
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: getChainAddresses(mainnet.id).blue,
    abi: blueAbi,
    functionName: "isAuthorized",
    result: true,
  });
  for (const address of [
    WethUsdsBlue.loanToken,
    WethUsdsBlue.collateralToken,
  ]) {
    mockRead(handle, {
      address,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
  }
  const prepare = (expiresAt?: number) => {
    const common = {
      chainId: 1,
      account,
      now,
      expiresAt,
      ...snapshot(position),
    };
    switch (method) {
      case "borrow":
        return prepareBlueBorrow(handle.client, { ...common, borrowAssets });
      case "supplyCollateralBorrow":
        return prepareBlueSupplyCollateralBorrow(handle.client, {
          ...common,
          borrowAssets,
          collateralAssets: 1n,
        });
      case "withdrawCollateral":
        return prepareBlueWithdrawCollateral(handle.client, {
          ...common,
          collateralAssets,
        });
      case "repayWithdrawCollateral":
        return prepareBlueRepayWithdrawCollateral(handle.client, {
          ...common,
          repayAssets: 1n,
          collateralAssets,
        });
      case "refinance":
        return prepareBlueRefinance(handle.client, {
          chainId: 1,
          account,
          now,
          expiresAt,
          source: snapshot(position),
          destination: snapshot(destination),
        });
    }
  };
  const validateAt = (timestamp: bigint) => {
    const accrued = position.accrueInterest(timestamp);
    if (isWithdraw) {
      validatePositionHealthAfterWithdraw({
        positionData:
          method === "repayWithdrawCollateral"
            ? accrued.repay(1n, 0n).position
            : accrued,
        withdrawAmount: collateralAssets,
        lltv,
        marketId: position.marketId,
      });
    } else {
      validatePositionHealth({
        positionData:
          method === "refinance"
            ? destination.accrueInterest(timestamp)
            : accrued,
        additionalCollateral:
          method === "refinance"
            ? collateral
            : method === "supplyCollateralBorrow"
              ? 1n
              : 0n,
        borrowAmount:
          method === "refinance" ? accrued.borrowAssets : borrowAssets,
        lltv,
        marketId:
          method === "refinance" ? destination.marketId : position.marketId,
      });
    }
  };
  return {
    prepare,
    validateAt,
    maxLtv: lltv - DEFAULT_LLTV_BUFFER,
    error: isWithdraw
      ? WithdrawMakesPositionUnhealthyError
      : BorrowExceedsSafeLtvError,
  };
}

test.each(methods)(
  "%s plan accepts a 30-minute healthy deadline but rejects debt unhealthy before expiry",
  async (method) => {
    const { prepare, validateAt, error, maxLtv } = fixture(method, 3600n);
    expect(() => validateAt(now + 1800n)).not.toThrow();
    expect(() => validateAt(now + 7200n)).toThrow(error);
    const plan = await prepare(Number(now + 1800n));
    expect(plan.steps.at(-1)?.action.inputs).toMatchObject({
      deadline: now + 1800n,
      maxLtv,
    });
    expect(buildTransactions(plan).length).toBeGreaterThan(0);
    await expect(prepare(Number(now + 7200n))).rejects.toBeInstanceOf(error);
  },
);

test.each(methods)(
  "%s plan checks a one-day finite expiry but preserves the legacy sentinel horizon",
  async (method) => {
    const { prepare, validateAt, error } = fixture(method, 10_800n);
    expect(() => validateAt(now + 7200n)).not.toThrow();
    expect(() => validateAt(now + 86_400n)).toThrow(error);
    const legacy = await prepare(Number(now + 7200n));
    const sentinel = await prepare(Number((1n << 48n) - 1n));
    expect(buildTransactions(sentinel).length).toBe(
      buildTransactions(legacy).length,
    );
    await expect(prepare(Number(now + 86_400n))).rejects.toBeInstanceOf(error);
    await expect(prepare(Number(maxUint256))).rejects.toBeInstanceOf(
      NonIntegerInputError,
    );
  },
);

test.each(methods)(
  "%s plan keeps omitted expiry at the legacy two-hour horizon",
  async (method) => {
    const { prepare } = fixture(method, 10_800n);
    const plan = await prepare();
    expect(plan.expiresAt).toBe(Number(now + 7200n));
  },
);
