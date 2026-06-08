import {
  AccrualPosition,
  getChainAddresses,
  Market,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { type Address, createPublicClient, http, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { CbbtcUsdcMarketV1 } from "../../../test/fixtures/marketV1.js";
import { test } from "../../../test/setup.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  MutuallyExclusiveRepayAmountsError,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  NonPositiveBorrowAmountError,
  NonPositiveRepayAmountError,
  WithdrawExceedsCollateralError,
  ZeroCollateralAmountError,
} from "../../types/index.js";
import { ReallocationData } from "../reallocationData.js";

const MARKET_PARAMS = new MarketParams(CbbtcUsdcMarketV1);
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

// Regression: the SDK no longer enforces builder = signer on MorphoMarketV1
// transaction builders. A divergent userAddress and a client with no connected
// account must still produce a valid tx.
describe("MorphoMarketV1 builder = signer freedom", () => {
  const OTHER_USER: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  test("supplyCollateral: builds tx with userAddress different from client.account", async ({
    client,
  }) => {
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    const supplyCollateral = market.supplyCollateral({
      userAddress: OTHER_USER,
      amount: parseUnits("1", 18),
    });

    const tx = supplyCollateral.buildTx();
    expect(tx.action.args.onBehalf).toBe(OTHER_USER);
  });

  test("supplyCollateral: builds tx with public client (no account)", async ({
    client,
  }) => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http(client.transport.url),
    });
    const morphoClient = publicClient.extend(morphoViemExtension()).morpho;
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    const supplyCollateral = market.supplyCollateral({
      userAddress: OTHER_USER,
      amount: parseUnits("1", 18),
    });

    const tx = supplyCollateral.buildTx();
    expect(tx.action.args.onBehalf).toBe(OTHER_USER);
  });
});

describe("MorphoMarketV1 validation", () => {
  test("supplyCollateral rejects invalid amounts", async ({ client }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    expect(() =>
      market.supplyCollateral({ userAddress: USER, amount: -1n }),
    ).toThrow(NonPositiveAssetAmountError);
    expect(() =>
      market.supplyCollateral({
        userAddress: USER,
        amount: 0n,
        nativeAmount: -1n,
      }),
    ).toThrow(NegativeNativeAmountError);
    expect(() =>
      market.supplyCollateral({ userAddress: USER, amount: 0n }),
    ).toThrow(ZeroCollateralAmountError);
  });

  test("borrow rejects non-positive amounts", async ({ client }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    expect(() =>
      market.borrow({
        amount: 0n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveBorrowAmountError);
  });

  test("withdraw getRequirements includes Morpho authorization when missing", async ({
    client,
  }) => {
    const market = client
      .extend(
        morphoViemExtension({
          supportSignature: false,
        }),
      )
      .morpho.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    const requirements = await market
      .withdraw({
        assets: 1n,
        userAddress: USER,
        positionData: makePosition({ supplyShares: 10n ** 18n }),
      })
      .getRequirements();

    expect(requirements).toHaveLength(1);
  });

  test("withdraw getRequirements returns no authorization when already authorized", async () => {
    const handle = createMockClient(mainnet);
    const { morpho } = getChainAddresses(mainnet.id);
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: true,
    });
    const market = handle.client
      .extend(
        morphoViemExtension({
          supportSignature: false,
        }),
      )
      .morpho.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    const requirements = await market
      .withdraw({
        assets: 1n,
        userAddress: USER,
        positionData: makePosition({ supplyShares: 10n ** 18n }),
      })
      .getRequirements();

    expect(requirements).toEqual([]);
  });

  test("repay rejects conflicting and non-positive share amounts", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    expect(() =>
      market.repay({
        assets: 1n,
        shares: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(MutuallyExclusiveRepayAmountsError);
    expect(() =>
      market.repay({
        shares: 0n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("repayWithdrawCollateral rejects conflicting repay modes and excessive collateral withdrawal", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    expect(() =>
      market.repayWithdrawCollateral({
        assets: 1n,
        shares: 1n,
        withdrawAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(MutuallyExclusiveRepayAmountsError);
    expect(() =>
      market.repayWithdrawCollateral({
        shares: 0n,
        withdrawAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveRepayAmountError);
    expect(() =>
      market.repayWithdrawCollateral({
        assets: 1n,
        withdrawAmount: 2n,
        userAddress: USER,
        positionData: makePosition({ collateral: 1n }),
      }),
    ).toThrow(WithdrawExceedsCollateralError);
  });

  test("repayWithdrawCollateral getRequirements includes Morpho authorization when missing", async ({
    client,
  }) => {
    const market = client
      .extend(
        morphoViemExtension({
          supportSignature: false,
        }),
      )
      .morpho.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    const requirements = await market
      .repayWithdrawCollateral({
        assets: 1n,
        withdrawAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      })
      .getRequirements();

    expect(requirements).toHaveLength(2);
  });

  test("supplyCollateralBorrow rejects invalid collateral and borrow amounts", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    expect(() =>
      market.supplyCollateralBorrow({
        amount: -1n,
        borrowAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveAssetAmountError);
    expect(() =>
      market.supplyCollateralBorrow({
        amount: 0n,
        nativeAmount: -1n,
        borrowAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NegativeNativeAmountError);
    expect(() =>
      market.supplyCollateralBorrow({
        amount: 1n,
        borrowAmount: 0n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveBorrowAmountError);
    expect(() =>
      market.supplyCollateralBorrow({
        amount: 0n,
        borrowAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(ZeroCollateralAmountError);
  });

  test("getReallocations accepts the operation/amount parameter shape", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    expect(
      market.getReallocations({
        reallocationData: new ReallocationData({ chainId: mainnet.id }),
        operation: "borrow",
        amount: 1n,
        options: { enabled: false },
      }),
    ).toEqual([]);
  });
});
