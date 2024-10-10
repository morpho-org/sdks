import {
  ChainId,
  MathLib,
  NATIVE_ADDRESS,
  addresses,
} from "@morpho-org/blue-sdk";

import { erc20Abi, maxUint256 } from "viem";
import { describe, expect } from "vitest";
import { Holding } from "../src/augment/Holding.js";
import { permit2Abi } from "../src/index.js";
import { test } from "./setup.js";

const { morpho, bundler, permit2, wNative, wbC3M } =
  addresses[ChainId.EthMainnet];

describe("augment/Holding", () => {
  test("should fetch user WETH data with deployless", async ({ client }) => {
    const expectedData = new Holding({
      token: wNative,
      user: client.account.address,
      erc20Allowances: {
        morpho: 1n,
        permit2: 3n,
        bundler: 2n,
      },
      permit2Allowances: {
        morpho: {
          amount: 4n,
          expiration: MathLib.MAX_UINT_48 - 1n,
          nonce: 0n,
        },
        bundler: {
          amount: 7n,
          expiration: MathLib.MAX_UINT_48 - 2n,
          nonce: 0n,
        },
      },
      balance: 10n * MathLib.WAD,
      canTransfer: true,
    });

    await client.deal({
      erc20: wNative,
      recipient: client.account.address,
      amount: expectedData.balance,
    });
    await client.writeContract({
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [morpho, expectedData.erc20Allowances.morpho],
    });
    await client.writeContract({
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [bundler, expectedData.erc20Allowances.bundler],
    });
    await client.writeContract({
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [permit2, expectedData.erc20Allowances.permit2],
    });
    await client.writeContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [
        wNative,
        morpho,
        expectedData.permit2Allowances.morpho.amount,
        Number(expectedData.permit2Allowances.morpho.expiration),
      ],
    });
    await client.writeContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [
        wNative,
        bundler,
        expectedData.permit2Allowances.bundler.amount,
        Number(expectedData.permit2Allowances.bundler.expiration),
      ],
    });

    const value = await Holding.fetch(client.account.address, wNative, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch user WETH data without deployless", async ({ client }) => {
    const expectedData = new Holding({
      token: wNative,
      user: client.account.address,
      erc20Allowances: {
        morpho: 1n,
        permit2: 3n,
        bundler: 2n,
      },
      permit2Allowances: {
        morpho: {
          amount: 4n,
          expiration: MathLib.MAX_UINT_48 - 1n,
          nonce: 0n,
        },
        bundler: {
          amount: 7n,
          expiration: MathLib.MAX_UINT_48 - 2n,
          nonce: 0n,
        },
      },
      balance: 10n * MathLib.WAD,
      canTransfer: true,
    });

    await client.deal({
      erc20: wNative,
      recipient: client.account.address,
      amount: expectedData.balance,
    });
    await client.writeContract({
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [morpho, expectedData.erc20Allowances.morpho],
    });
    await client.writeContract({
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [bundler, expectedData.erc20Allowances.bundler],
    });
    await client.writeContract({
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [permit2, expectedData.erc20Allowances.permit2],
    });
    await client.writeContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [
        wNative,
        morpho,
        expectedData.permit2Allowances.morpho.amount,
        Number(expectedData.permit2Allowances.morpho.expiration),
      ],
    });
    await client.writeContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [
        wNative,
        bundler,
        expectedData.permit2Allowances.bundler.amount,
        Number(expectedData.permit2Allowances.bundler.expiration),
      ],
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
        morpho: maxUint256,
        permit2: maxUint256,
        bundler: maxUint256,
      },
      permit2Allowances: {
        morpho: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        bundler: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
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
        morpho: 6n,
        permit2: 5n,
        bundler: 4n,
      },
      permit2Allowances: {
        morpho: {
          amount: 9n,
          expiration: MathLib.MAX_UINT_48 - 2n,
          nonce: 0n,
        },
        bundler: {
          amount: 8n,
          expiration: MathLib.MAX_UINT_48 - 7n,
          nonce: 0n,
        },
      },
      balance: 2853958n,
      erc2612Nonce: 0n,
      canTransfer: false,
    });

    await client.deal({
      erc20: wbC3M,
      recipient: client.account.address,
      amount: expectedData.balance,
    });
    await client.writeContract({
      address: wbC3M,
      abi: erc20Abi,
      functionName: "approve",
      args: [morpho, expectedData.erc20Allowances.morpho],
    });
    await client.writeContract({
      address: wbC3M,
      abi: erc20Abi,
      functionName: "approve",
      args: [bundler, expectedData.erc20Allowances.bundler],
    });
    await client.writeContract({
      address: wbC3M,
      abi: erc20Abi,
      functionName: "approve",
      args: [permit2, expectedData.erc20Allowances.permit2],
    });
    await client.writeContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [
        wbC3M,
        morpho,
        expectedData.permit2Allowances.morpho.amount,
        Number(expectedData.permit2Allowances.morpho.expiration),
      ],
    });
    await client.writeContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [
        wbC3M,
        bundler,
        expectedData.permit2Allowances.bundler.amount,
        Number(expectedData.permit2Allowances.bundler.expiration),
      ],
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
        morpho: 6n,
        permit2: 5n,
        bundler: 4n,
      },
      permit2Allowances: {
        morpho: {
          amount: 9n,
          expiration: MathLib.MAX_UINT_48 - 2n,
          nonce: 0n,
        },
        bundler: {
          amount: 8n,
          expiration: MathLib.MAX_UINT_48 - 7n,
          nonce: 0n,
        },
      },
      balance: 2853958n,
      erc2612Nonce: 0n,
      canTransfer: false,
    });

    await client.deal({
      erc20: wbC3M,
      recipient: client.account.address,
      amount: expectedData.balance,
    });
    await client.writeContract({
      address: wbC3M,
      abi: erc20Abi,
      functionName: "approve",
      args: [morpho, expectedData.erc20Allowances.morpho],
    });
    await client.writeContract({
      address: wbC3M,
      abi: erc20Abi,
      functionName: "approve",
      args: [bundler, expectedData.erc20Allowances.bundler],
    });
    await client.writeContract({
      address: wbC3M,
      abi: erc20Abi,
      functionName: "approve",
      args: [permit2, expectedData.erc20Allowances.permit2],
    });
    await client.writeContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [
        wbC3M,
        morpho,
        expectedData.permit2Allowances.morpho.amount,
        Number(expectedData.permit2Allowances.morpho.expiration),
      ],
    });
    await client.writeContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [
        wbC3M,
        bundler,
        expectedData.permit2Allowances.bundler.amount,
        Number(expectedData.permit2Allowances.bundler.expiration),
      ],
    });

    const value = await Holding.fetch(client.account.address, wbC3M, client, {
      deployless: false,
    });

    expect(value).toStrictEqual(expectedData);
  });
});
