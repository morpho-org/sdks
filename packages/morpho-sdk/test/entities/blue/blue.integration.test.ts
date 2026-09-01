import {
  AccrualPosition,
  Market,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { type Address, maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { morphoViemExtension } from "../../../src/client/index.js";
import { NativeFundingAmountMismatchError } from "../../../src/types/index.js";
import { CbbtcUsdcBlue, WstethWethBlue } from "../../fixtures/blue.js";
import { withChainTimestamp } from "../../helpers/time.js";
import { test } from "../../setup.js";

const MARKET_PARAMS = new MarketParams(CbbtcUsdcBlue);
const USER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function makePosition(
  overrides: {
    collateral?: bigint;
    borrowShares?: bigint;
    supplyShares?: bigint;
  } = {},
) {
  const market = new Market({
    params: MARKET_PARAMS,
    totalSupplyAssets: 10n ** 24n,
    totalBorrowAssets: 10n ** 24n / 2n,
    totalSupplyShares: 10n ** 24n,
    totalBorrowShares: 10n ** 24n / 2n,
    lastUpdate: 1_700_000_000n,
    fee: 0n,
    price: ORACLE_PRICE_SCALE,
  });

  return new AccrualPosition(
    {
      user: USER,
      supplyShares: overrides.supplyShares ?? 0n,
      borrowShares: overrides.borrowShares ?? 10n ** 18n,
      collateral: overrides.collateral ?? 10n ** 24n,
    },
    market,
  );
}

// Position on a market whose loan token is wNative (WETH), for native-wrap repays.
function makeWethPosition(
  overrides: { collateral?: bigint; borrowShares?: bigint } = {},
) {
  const market = new Market({
    params: new MarketParams(WstethWethBlue),
    totalSupplyAssets: 10n ** 24n,
    totalBorrowAssets: 10n ** 24n / 2n,
    totalSupplyShares: 10n ** 24n,
    totalBorrowShares: 10n ** 24n / 2n,
    lastUpdate: 1_700_000_000n,
    fee: 0n,
    price: ORACLE_PRICE_SCALE,
  });

  return new AccrualPosition(
    {
      user: USER,
      supplyShares: 0n,
      borrowShares: overrides.borrowShares ?? 10n ** 18n,
      collateral: overrides.collateral ?? 10n ** 24n,
    },
    market,
  );
}

describe("MorphoBlue validation", () => {
  test("withdraw getRequirements includes Blue authorization when missing", async ({
    client,
  }) => {
    const market = client
      .extend(
        morphoViemExtension({
          supportSignature: false,
        }),
      )
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    const requirements = await market
      .withdraw({
        assets: 1n,
        userAddress: USER,
        positionData: makePosition({ supplyShares: 10n ** 18n }),
        deadline: maxUint256,
      })
      .getRequirements();

    expect(requirements).toHaveLength(1);
  });

  test("repayWithdrawCollateral getRequirements includes Blue authorization when missing", async ({
    client,
  }) => {
    const market = client
      .extend(
        morphoViemExtension({
          supportSignature: false,
        }),
      )
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    const requirements = await market
      .repayWithdrawCollateral({
        repayAssets: 1n,
        collateralAssets: 1n,
        userAddress: USER,
        positionData: makePosition(),
        deadline: maxUint256,
      })
      .getRequirements();

    expect(requirements).toHaveLength(2);
  });

  test("repay native: shares mode uses exclusive native funding", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WstethWethBlue, mainnet.id);
    const positionData = makeWethPosition();
    const now = 1_800_000_000n;
    const deadline = now + 3_600n;
    const borrowAssets = positionData.market.toBorrowAssets(
      positionData.borrowShares,
      "Up",
    );

    const repay = withChainTimestamp(now, () =>
      market.repay({
        repayShares: positionData.borrowShares,
        nativeAmount: borrowAssets,
        userAddress: USER,
        positionData,
        deadline,
      }),
    );

    const tx = repay.buildTx();
    expect(tx.action.args.repayShares).toBe(positionData.borrowShares);
    expect(tx.action.args.maxRepayAssets).toBe(borrowAssets);
    expect(tx.action.args.nativeAmount).toBe(borrowAssets);
    expect(tx.value).toBe(borrowAssets);
    expect(
      await withChainTimestamp(now, () => repay.getRequirements()),
    ).toEqual([]);
  });

  test("repayWithdrawCollateral native: a fully native repay emits no ERC-20 requirement", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WstethWethBlue, mainnet.id);
    const nativeAmount = parseUnits("0.5", 18);

    const requirements = await market
      .repayWithdrawCollateral({
        repayAssets: nativeAmount,
        nativeAmount,
        collateralAssets: parseUnits("1", 18),
        userAddress: USER,
        positionData: makeWethPosition(),
        deadline: maxUint256,
      })
      .getRequirements();

    // Fully-native repay pulls no ERC-20 → only the Morpho authorization remains.
    expect(requirements).toHaveLength(1);
  });

  test("repayWithdrawCollateral native: shares mode funded entirely by native emits no ERC-20 requirement", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WstethWethBlue, mainnet.id);
    const positionData = makeWethPosition();
    const now = 1_800_000_000n;
    const deadline = now + 3_600n;

    const borrowAssets = positionData.market.toBorrowAssets(
      positionData.borrowShares,
      "Up",
    );

    const action = withChainTimestamp(now, () =>
      market.repayWithdrawCollateral({
        repayShares: positionData.borrowShares,
        nativeAmount: borrowAssets,
        collateralAssets: positionData.collateral,
        userAddress: USER,
        positionData,
        deadline,
      }),
    );

    const tx = action.buildTx();
    expect(tx.action.args.repayShares).toBe(positionData.borrowShares);
    expect(tx.action.args.maxRepayAssets).toBe(borrowAssets);
    expect(tx.action.args.nativeAmount).toBe(borrowAssets);
    expect(tx.value).toBe(borrowAssets);

    expect(
      await withChainTimestamp(now, () => action.getRequirements()),
    ).toHaveLength(1);
  });

  test("repayWithdrawCollateral native: rejects partial native funding", ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WstethWethBlue, mainnet.id);
    const positionData = makeWethPosition();
    const now = 1_800_000_000n;
    const deadline = now + 3_600n;
    const nativeAmount = parseUnits("0.1", 18);

    expect(() =>
      withChainTimestamp(now, () =>
        market.repayWithdrawCollateral({
          repayShares: positionData.borrowShares,
          nativeAmount,
          collateralAssets: positionData.collateral,
          userAddress: USER,
          positionData,
          deadline,
        }),
      ),
    ).toThrow(NativeFundingAmountMismatchError);
  });
});
