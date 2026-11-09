import { MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  parseUnits,
  toHex,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  midnightBlueBuyCallbackAbi,
  midnightBlueBuyCallbackFactoryAbi,
} from "../../../src/abis.js";
import { morphoViemExtension } from "../../../src/client/index.js";
import {
  BlueBuyCallbackOwnerMismatchError,
  BlueBuyCallbackUnauthorizedError,
  EmptyBlueSupplyPositionError,
  NotBlueBuyCallbackError,
} from "../../../src/types/index.js";
import { CbbtcUsdcBlue } from "../../fixtures/blue.js";
import { blueBundlesV1Test as test } from "../../helpers/blueBundlesV1.js";

const marketParams = new MarketParams(CbbtcUsdcBlue);
const blue = getChainAddress(mainnet.id, "blue");
const factory = getChainAddress(mainnet.id, "midnightBlueBuyCallbackFactory");
const salt = keccak256(toHex("withdraw-buy-callback"));
const parkedAssets = parseUnits("1000", 6);
const stranger: Address = "0x00000000000000000000000000000000000000A2";

const createCallback = async (client: AnvilTestClient): Promise<Address> => {
  const { result: callback, request } = await client.simulateContract({
    address: factory,
    abi: midnightBlueBuyCallbackFactoryAbi,
    functionName: "createBlueBuyCallback",
    args: [client.account.address, salt],
  });
  await client.writeContract(request);
  return callback;
};

const supplyOnBehalf = async (client: AnvilTestClient, onBehalf: Address) => {
  await client.deal({ erc20: marketParams.loanToken, amount: parkedAssets });
  await client.approve({
    address: marketParams.loanToken,
    args: [blue, MathLib.MAX_UINT_256],
  });
  await client.sendTransaction({
    to: blue,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "supply",
      args: [marketParams, parkedAssets, 0n, onBehalf, "0x"],
    }),
  });
};

describe("MorphoBlue.withdrawBuyCallback", () => {
  test("owner withdraws the callback's whole Blue position to their wallet", async ({
    client,
  }) => {
    const callback = await createCallback(client);
    await supplyOnBehalf(client, callback);
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);
    const balanceBefore = await client.balanceOf({
      erc20: marketParams.loanToken,
    });

    const action = market.withdrawBuyCallback({
      userAddress: client.account.address,
      callbackAddress: callback,
      positionData: await market.getPositionData(callback),
    });
    await expect(action.getRequirements()).resolves.toEqual([]);
    await client.sendTransaction(action.buildTx());

    const [supplyShares] = await client.readContract({
      address: blue,
      abi: blueAbi,
      functionName: "position",
      args: [marketParams.id, callback],
    });
    expect(supplyShares).toBe(0n);
    const received =
      (await client.balanceOf({ erc20: marketParams.loanToken })) -
      balanceBefore;
    expect(received).toBeGreaterThanOrEqual(parkedAssets - 1n);
    expect(received).toBeLessThanOrEqual(parkedAssets + parseUnits("1", 6));
    await expect(
      client.readContract({
        address: marketParams.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [callback],
      }),
    ).resolves.toBe(0n);
  });

  test("rejects an empty callback position", async ({ client }) => {
    const callback = await createCallback(client);
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);

    const positionData = await market.getPositionData(callback);

    expect(() =>
      market.withdrawBuyCallback({
        userAddress: client.account.address,
        callbackAddress: callback,
        positionData,
      }),
    ).toThrow(EmptyBlueSupplyPositionError);
  });

  test("rejects a Blue supplier that is not a factory callback", async ({
    client,
  }) => {
    await supplyOnBehalf(client, stranger);
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);

    await expect(
      market
        .withdrawBuyCallback({
          userAddress: client.account.address,
          callbackAddress: stranger,
          positionData: await market.getPositionData(stranger),
        })
        .getRequirements(),
    ).rejects.toThrow(NotBlueBuyCallbackError);
  });

  test("rejects a sender that does not own the callback", async ({
    client,
  }) => {
    const callback = await createCallback(client);
    await supplyOnBehalf(client, callback);
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);

    await expect(
      market
        .withdrawBuyCallback({
          userAddress: stranger,
          callbackAddress: callback,
          positionData: await market.getPositionData(callback),
        })
        .getRequirements(),
    ).rejects.toThrow(BlueBuyCallbackOwnerMismatchError);
  });

  test("rejects an owner who revoked their own Blue authorization", async ({
    client,
  }) => {
    const callback = await createCallback(client);
    await supplyOnBehalf(client, callback);
    await client.writeContract({
      address: callback,
      abi: midnightBlueBuyCallbackAbi,
      functionName: "setAuthorization",
      args: [client.account.address, false],
    });
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);

    await expect(
      market
        .withdrawBuyCallback({
          userAddress: client.account.address,
          callbackAddress: callback,
          positionData: await market.getPositionData(callback),
        })
        .getRequirements(),
    ).rejects.toThrow(BlueBuyCallbackUnauthorizedError);
  });
});
