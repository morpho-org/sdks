import {
  addressesRegistry,
  ChainId,
  MathLib,
  NATIVE_ADDRESS,
} from "@morpho-org/blue-sdk";

import { maxUint256, zeroAddress } from "viem";
import { describe, expect } from "vitest";
import { Holding } from "../src/augment/Holding.js";
import {
  abi as getHoldingAbi,
  code as getHoldingCode,
} from "../src/queries/GetHolding.js";
import { test } from "./setup.js";

const {
  blue: morpho,
  permit2,
  wNative,
  wbC3M,
} = addressesRegistry[ChainId.EthMainnet];

describe("augment/Holding", () => {
  test("should fetch user WETH data with deployless", async ({ client }) => {
    const expectedData = new Holding({
      token: wNative,
      user: client.account.address,
      erc20Allowances: {
        blue: 1n,
        permit2: 3n,
      },
      balance: 10n * MathLib.WAD,
      canTransfer: true,
    });

    await client.deal({
      erc20: wNative,
      amount: expectedData.balance,
    });
    await client.approve({
      address: wNative,
      args: [morpho, expectedData.erc20Allowances.blue],
    });
    await client.approve({
      address: wNative,
      args: [permit2, expectedData.erc20Allowances.permit2],
    });

    const value = await Holding.fetch(client.account.address, wNative, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch user WETH data without deployless", async ({ client }) => {
    const expectedData = new Holding({
      token: wNative,
      user: client.account.address,
      erc20Allowances: {
        blue: 1n,
        permit2: 3n,
      },
      balance: 10n * MathLib.WAD,
      canTransfer: true,
    });

    await client.deal({
      erc20: wNative,
      amount: expectedData.balance,
    });
    await client.approve({
      address: wNative,
      args: [morpho, expectedData.erc20Allowances.blue],
    });
    await client.approve({
      address: wNative,
      args: [permit2, expectedData.erc20Allowances.permit2],
    });

    const value = await Holding.fetch(client.account.address, wNative, client, {
      deployless: false,
    });

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch native user holding", async ({ client }) => {
    const token = NATIVE_ADDRESS;

    const expectedData = new Holding({
      token,
      user: client.account.address,
      erc20Allowances: {
        blue: maxUint256,
        permit2: maxUint256,
      },
      balance: 10000000000000000000000n,
      canTransfer: undefined,
    });

    const value = await Holding.fetch(client.account.address, token, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch backed token user holding with deployless", async ({
    client,
  }) => {
    const expectedData = new Holding({
      token: wbC3M,
      user: client.account.address,
      erc20Allowances: {
        blue: 6n,
        permit2: 5n,
      },
      balance: 2853958n,
      erc2612Nonce: 0n,
      canTransfer: false,
    });

    await client.deal({
      erc20: wbC3M,
      amount: expectedData.balance,
    });
    await client.approve({
      address: wbC3M,
      args: [morpho, expectedData.erc20Allowances.blue],
    });
    await client.approve({
      address: wbC3M,
      args: [permit2, expectedData.erc20Allowances.permit2],
    });

    const value = await Holding.fetch(client.account.address, wbC3M, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch backed token user holding without deployless", async ({
    client,
  }) => {
    const expectedData = new Holding({
      token: wbC3M,
      user: client.account.address,
      erc20Allowances: {
        blue: 6n,
        permit2: 5n,
      },
      balance: 2853958n,
      erc2612Nonce: 0n,
      canTransfer: false,
    });

    await client.deal({
      erc20: wbC3M,
      amount: expectedData.balance,
    });
    await client.approve({
      address: wbC3M,
      args: [morpho, expectedData.erc20Allowances.blue],
    });
    await client.approve({
      address: wbC3M,
      args: [permit2, expectedData.erc20Allowances.permit2],
    });

    const value = await Holding.fetch(client.account.address, wbC3M, client, {
      deployless: false,
    });

    expect(value).toStrictEqual(expectedData);
  });

  test("deployless query does not revert when Permit2 is absent", async ({
    client,
  }) => {
    // Some chains have no Permit2 deployment; `fetchHolding` then passes `address(0)`.
    // The deployless query must skip the Permit2 allowance read instead of reverting on an
    // addressless contract, leaving its ERC20 allowance at zero so it matches the multicall
    // fallback (which returns 0 without any read). The Morpho allowance must still be
    // reported. Exercised here on mainnet by
    // passing `zeroAddress` directly as the Permit2 argument.
    await client.deal({ erc20: wNative, amount: 10n * MathLib.WAD });
    await client.approve({ address: wNative, args: [morpho, 6n] });

    const res = await client.readContract({
      abi: getHoldingAbi,
      code: getHoldingCode,
      functionName: "query",
      args: [
        wNative,
        client.account.address,
        morpho,
        zeroAddress,
        false,
        false,
      ],
    });

    expect(res.balance).toBe(10n * MathLib.WAD);
    expect(res.erc20Allowances).toEqual({
      blue: 6n,
      permit2: 0n,
    });
  });
});
