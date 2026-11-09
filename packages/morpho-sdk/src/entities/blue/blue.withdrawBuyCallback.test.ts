import {
  AccrualPosition,
  Market,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import type { Address } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  blueAbi,
  midnightBlueBuyCallbackAbi,
  midnightBlueBuyCallbackFactoryAbi,
} from "../../abis.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  AccrualPositionUserMismatchError,
  BlueBuyCallbackOwnerMismatchError,
  BlueBuyCallbackUnauthorizedError,
  ChainIdMismatchError,
  EmptyBlueSupplyPositionError,
  InsufficientBlueLiquidityError,
  MissingContractCodeError,
  NotBlueBuyCallbackError,
} from "../../types/index.js";

const userAddress: Address = "0x00000000000000000000000000000000000000A1";
const otherAddress: Address = "0x00000000000000000000000000000000000000A2";
const callbackAddress: Address = "0x00000000000000000000000000000000000000C1";
const marketParams = new MarketParams({
  loanToken: "0x0000000000000000000000000000000000000011",
  collateralToken: "0x0000000000000000000000000000000000000012",
  oracle: "0x0000000000000000000000000000000000000013",
  irm: "0x0000000000000000000000000000000000000014",
  lltv: 860000000000000000n,
});
const blue = getChainAddress(mainnet.id, "blue");
const factory = getChainAddress(mainnet.id, "midnightBlueBuyCallbackFactory");

const makePosition = (
  params: {
    supplyShares?: bigint;
    totalBorrowAssets?: bigint;
    user?: Address;
  } = {},
) =>
  new AccrualPosition(
    {
      user: params.user ?? callbackAddress,
      supplyShares: params.supplyShares ?? 10n ** 18n,
      borrowShares: 0n,
      collateral: 0n,
    },
    new Market({
      params: marketParams,
      totalSupplyAssets: 10n ** 24n,
      totalBorrowAssets: params.totalBorrowAssets ?? 10n ** 24n / 2n,
      totalSupplyShares: 10n ** 24n,
      totalBorrowShares: params.totalBorrowAssets ?? 10n ** 24n / 2n,
      lastUpdate: 1_700_000_000n,
      fee: 0n,
      price: ORACLE_PRICE_SCALE,
      rateAtTarget: 0n,
    }),
  );

const setup = (
  reads: {
    isBlueBuyCallback?: boolean;
    owner?: Address;
    isAuthorized?: boolean;
  } = {},
) => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: factory,
    abi: midnightBlueBuyCallbackFactoryAbi,
    functionName: "isBlueBuyCallback",
    result: reads.isBlueBuyCallback ?? true,
  });
  mockRead(handle, {
    address: callbackAddress,
    abi: midnightBlueBuyCallbackAbi,
    functionName: "OWNER",
    result: reads.owner ?? userAddress,
  });
  mockRead(handle, {
    address: blue,
    abi: blueAbi,
    functionName: "isAuthorized",
    result: reads.isAuthorized ?? true,
  });
  const market = handle.client
    .extend(morphoViemExtension())
    .morpho.blue(marketParams, mainnet.id);
  return { handle, market };
};

describe("MorphoBlue.withdrawBuyCallback", () => {
  test("default: withdraws every supply share of the callback to its owner", async () => {
    const { market } = setup();
    const positionData = makePosition();

    const action = market.withdrawBuyCallback({
      userAddress,
      callbackAddress,
      positionData,
    });

    await expect(action.getRequirements()).resolves.toEqual([]);
    const tx = action.buildTx();
    expect(tx.to).toBe(blue);
    expect(tx.action).toEqual({
      type: "blueWithdrawBuyCallback",
      args: {
        market: marketParams.id,
        shares: positionData.supplyShares,
        onBehalf: callbackAddress,
        receiver: userAddress,
      },
    });
  });

  test("error: rejects an address the factory did not create", async () => {
    const { market } = setup({ isBlueBuyCallback: false });

    await expect(
      market
        .withdrawBuyCallback({
          userAddress,
          callbackAddress,
          positionData: makePosition(),
        })
        .getRequirements(),
    ).rejects.toThrow(NotBlueBuyCallbackError);
  });

  test("error: rejects a sender that is not the callback owner", async () => {
    const { market } = setup({ owner: otherAddress });

    await expect(
      market
        .withdrawBuyCallback({
          userAddress,
          callbackAddress,
          positionData: makePosition(),
        })
        .getRequirements(),
    ).rejects.toThrow(BlueBuyCallbackOwnerMismatchError);
  });

  test("error: rejects an owner that Blue no longer authorizes for the callback", async () => {
    const { market } = setup({ isAuthorized: false });

    await expect(
      market
        .withdrawBuyCallback({
          userAddress,
          callbackAddress,
          positionData: makePosition(),
        })
        .getRequirements(),
    ).rejects.toThrow(BlueBuyCallbackUnauthorizedError);
  });

  test("error: rejects a factory without code", async () => {
    const { handle, market } = setup();
    const defaultHandler = handle.request.getMockImplementation()!;
    handle.request.mockImplementation(async (args) => {
      const [address] = (args.params ?? []) as [Address];
      if (
        args.method === "eth_getCode" &&
        address.toLowerCase() === factory.toLowerCase()
      ) {
        return "0x";
      }
      return defaultHandler(args);
    });

    await expect(
      market
        .withdrawBuyCallback({
          userAddress,
          callbackAddress,
          positionData: makePosition(),
        })
        .getRequirements(),
    ).rejects.toThrow(MissingContractCodeError);
  });

  test("error: rejects an empty callback position", () => {
    const { market } = setup();

    expect(() =>
      market.withdrawBuyCallback({
        userAddress,
        callbackAddress,
        positionData: makePosition({ supplyShares: 0n }),
      }),
    ).toThrow(EmptyBlueSupplyPositionError);
  });

  test("error: rejects a position larger than market liquidity", () => {
    const { market } = setup();

    expect(() =>
      market.withdrawBuyCallback({
        userAddress,
        callbackAddress,
        positionData: makePosition({ totalBorrowAssets: 10n ** 24n }),
      }),
    ).toThrow(InsufficientBlueLiquidityError);
  });

  test("error: rejects a snapshot of another account's position", () => {
    const { market } = setup();

    expect(() =>
      market.withdrawBuyCallback({
        userAddress,
        callbackAddress,
        positionData: makePosition({ user: userAddress }),
      }),
    ).toThrow(AccrualPositionUserMismatchError);
  });

  test("error: rejects an RPC that serves another chain before any ownership read", async () => {
    const { handle, market } = setup();
    const defaultHandler = handle.request.getMockImplementation()!;
    handle.request.mockImplementation(async (args) =>
      args.method === "eth_chainId" ? "0x2105" : defaultHandler(args),
    );

    await expect(
      market
        .withdrawBuyCallback({
          userAddress,
          callbackAddress,
          positionData: makePosition(),
        })
        .getRequirements(),
    ).rejects.toThrow(ChainIdMismatchError);
    expect(
      handle.request.mock.calls.filter(([args]) => args.method === "eth_call"),
    ).toHaveLength(0);
  });
});
