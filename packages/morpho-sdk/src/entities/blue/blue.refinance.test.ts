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
  NonPositiveInputError,
  RefinanceSameMarketError,
  RefinanceTokenMismatchError,
} from "../../types/index.js";

const userAddress: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const loanToken: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const collateralToken: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const irm: Address = "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC";
const sourceMarketParams = new MarketParams({
  loanToken,
  collateralToken,
  oracle: "0x1111111111111111111111111111111111111111",
  irm,
  lltv: 860_000_000_000_000_000n,
});
const destinationMarketParams = new MarketParams({
  loanToken,
  collateralToken,
  oracle: "0x2222222222222222222222222222222222222222",
  irm,
  lltv: 915_000_000_000_000_000n,
});

const makePosition = (
  marketParams: MarketParams,
  { borrowShares = 0n, collateral = 0n } = {},
) =>
  new AccrualPosition(
    { user: userAddress, supplyShares: 0n, borrowShares, collateral },
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

const makeEntity = () =>
  createMockClient(mainnet)
    .client.extend(morphoViemExtension())
    .morpho.blue(sourceMarketParams, mainnet.id);

describe("MorphoBlue.refinance", () => {
  test("default: builds a full-position BlueBundlesV1 refinance", () => {
    const source = makePosition(sourceMarketParams, {
      borrowShares: 10n ** 18n,
      collateral: 10n ** 24n,
    });
    const destination = makePosition(destinationMarketParams);

    const transaction = makeEntity()
      .refinance({
        userAddress,
        positionData: source,
        destination: {
          marketParams: destinationMarketParams,
          positionData: destination,
        },
        deadline: maxUint256,
      })
      .buildTx();

    expect(transaction.action).toMatchObject({
      type: "blueRefinance",
      args: {
        sourceMarket: sourceMarketParams.id,
        destinationMarket: destinationMarketParams.id,
        onBehalf: userAddress,
      },
    });
  });

  test("error: NonPositiveInputError when the source has no debt", () => {
    expect(() =>
      makeEntity().refinance({
        userAddress,
        positionData: makePosition(sourceMarketParams, {
          collateral: 10n ** 18n,
        }),
        destination: {
          marketParams: destinationMarketParams,
          positionData: makePosition(destinationMarketParams),
        },
        deadline: maxUint256,
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: RefinanceSameMarketError", () => {
    const source = makePosition(sourceMarketParams, {
      borrowShares: 1n,
      collateral: 10n ** 18n,
    });
    expect(() =>
      makeEntity().refinance({
        userAddress,
        positionData: source,
        destination: {
          marketParams: sourceMarketParams,
          positionData: source,
        },
        deadline: maxUint256,
      }),
    ).toThrow(RefinanceSameMarketError);
  });

  test("error: RefinanceTokenMismatchError", () => {
    const mismatchedMarketParams = new MarketParams({
      loanToken: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      collateralToken: destinationMarketParams.collateralToken,
      oracle: destinationMarketParams.oracle,
      irm: destinationMarketParams.irm,
      lltv: destinationMarketParams.lltv,
    });
    expect(() =>
      makeEntity().refinance({
        userAddress,
        positionData: makePosition(sourceMarketParams, {
          borrowShares: 1n,
          collateral: 10n ** 18n,
        }),
        destination: {
          marketParams: mismatchedMarketParams,
          positionData: makePosition(mismatchedMarketParams),
        },
        deadline: maxUint256,
      }),
    ).toThrow(RefinanceTokenMismatchError);
  });
});
