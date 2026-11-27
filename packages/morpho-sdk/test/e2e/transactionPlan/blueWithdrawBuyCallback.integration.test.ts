import { MarketParams, MathLib } from "@morpho-org/blue-sdk";
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
import { assert, describe, expect } from "vitest";
import {
  midnightBlueBuyCallbackAbi,
  midnightBlueBuyCallbackFactoryAbi,
} from "../../../src/abis.js";
import { blueAbi } from "../../../src/blue/abis.js";
import { fetchAccrualPosition } from "../../../src/blue/fetch.js";
import { morphoViemExtension } from "../../../src/client/index.js";
import {
  BlueBuyCallbackOwnerMismatchError,
  BlueBuyCallbackUnauthorizedError,
  buildTransactions,
  NotBlueBuyCallbackError,
  parseTransactionPlan,
  prepareBlueWithdrawBuyCallback,
  serializeTransactionPlan,
} from "../../../src/index.js";
import { CbbtcUsdcBlue } from "../../fixtures/blue.js";
import { blueBundlesV1Test as test } from "../../helpers/blueBundlesV1.js";

const marketParams = new MarketParams(CbbtcUsdcBlue);
const blue = getChainAddress(mainnet.id, "blue");
const factory = getChainAddress(mainnet.id, "midnightBlueBuyCallbackFactory");
const salt = keccak256(toHex("withdraw-buy-callback-plan"));
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

const prepare = async (
  client: AnvilTestClient,
  {
    account,
    callbackAddress,
  }: { readonly account: Address; readonly callbackAddress: Address },
) => {
  const position = await fetchAccrualPosition(
    callbackAddress,
    marketParams.id,
    client,
  );
  return prepareBlueWithdrawBuyCallback(client, {
    chainId: mainnet.id,
    account,
    callbackAddress,
    now: (await client.getBlock()).timestamp,
    marketId: marketParams.id,
    marketData: { chainId: mainnet.id, market: position.market },
    positionData: { chainId: mainnet.id, position },
  });
};

describe("Blue BuyCallback withdrawal TransactionPlan on a mainnet fork", () => {
  test("fetch → prepare → serialize → restore → build → execute withdraws the whole callback position to its owner", async ({
    client,
  }) => {
    const callback = await createCallback(client);
    await supplyOnBehalf(client, callback);
    const balanceBefore = await client.balanceOf({
      erc20: marketParams.loanToken,
    });

    const plan = await prepare(client, {
      account: client.account.address,
      callbackAddress: callback,
    });
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "blueWithdrawBuyCallback",
    ]);
    expect(plan.signatureRequests).toEqual([]);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    const [transaction, ...rest] = buildTransactions(restored);
    expect(rest).toEqual([]);
    assert(transaction);
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);
    const entityTransaction = market
      .withdrawBuyCallback({
        userAddress: client.account.address,
        callbackAddress: callback,
        positionData: await market.getPositionData(callback),
      })
      .buildTx();
    expect(transaction).toMatchObject({
      to: entityTransaction.to,
      data: entityTransaction.data,
      value: entityTransaction.value,
    });
    await client.sendTransaction(transaction);

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

  test("rejects a Blue supplier that is not a factory callback", async ({
    client,
  }) => {
    await supplyOnBehalf(client, stranger);

    await expect(
      prepare(client, {
        account: client.account.address,
        callbackAddress: stranger,
      }),
    ).rejects.toThrow(NotBlueBuyCallbackError);
  });

  test("rejects an account that does not own the callback", async ({
    client,
  }) => {
    const callback = await createCallback(client);
    await supplyOnBehalf(client, callback);

    await expect(
      prepare(client, { account: stranger, callbackAddress: callback }),
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

    await expect(
      prepare(client, {
        account: client.account.address,
        callbackAddress: callback,
      }),
    ).rejects.toThrow(BlueBuyCallbackUnauthorizedError);
  });
});
