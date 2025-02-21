import {
  ChainId,
  MathLib,
  NATIVE_ADDRESS,
  addresses,
} from "@morpho-org/blue-sdk";
import { describe, expect } from "vitest";
import { test } from "./setup";

import { maxUint256 } from "viem";
import { Holding } from "../../src/augment/Holding";
import { permit2Abi } from "./abis";

const {
  morpho,
  bundler3: { bundler3, generalAdapter1 },
  permit2,
  wNative,
  wbC3M,
} = addresses[ChainId.EthMainnet];

describe("augment/Holding", async () => {
  test("should fetch user WETH data ", async ({ client, wallet }) => {
    const expectedData = new Holding({
      token: wNative,
      user: client.account.address,
      erc20Allowances: {
        morpho: 1n,
        permit2: 3n,
        "bundler3.generalAdapter1": 2n,
      },
      permit2BundlerAllowance: {
        amount: 7n,
        expiration: MathLib.MAX_UINT_48 - 2n,
        nonce: 0n,
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
      args: [morpho, expectedData.erc20Allowances.morpho],
    });
    await client.approve({
      address: wNative,
      args: [
        generalAdapter1,
        expectedData.erc20Allowances["bundler3.generalAdapter1"],
      ],
    });
    await client.approve({
      address: wNative,
      args: [permit2, expectedData.erc20Allowances.permit2],
    });
    await client.writeContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [
        wNative,
        bundler3,
        expectedData.permit2BundlerAllowance.amount,
        Number(expectedData.permit2BundlerAllowance.expiration),
      ],
    });

    const value = await Holding.fetch(client.account.address, wNative, wallet);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch native user holding", async ({ client, wallet }) => {
    const token = NATIVE_ADDRESS;

    const expectedData = new Holding({
      token,
      user: client.account.address,
      erc20Allowances: {
        morpho: maxUint256,
        permit2: maxUint256,
        "bundler3.generalAdapter1": maxUint256,
      },
      permit2BundlerAllowance: {
        amount: 0n,
        expiration: 0n,
        nonce: 0n,
      },
      balance: 10000000000000000000000n,
      canTransfer: undefined,
    });

    const value = await Holding.fetch(client.account.address, token, wallet);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch backed token user holding", async ({ client, wallet }) => {
    const expectedData = new Holding({
      token: wbC3M,
      user: client.account.address,
      erc20Allowances: {
        morpho: 6n,
        permit2: 5n,
        "bundler3.generalAdapter1": 4n,
      },
      permit2BundlerAllowance: {
        amount: 8n,
        expiration: MathLib.MAX_UINT_48 - 7n,
        nonce: 0n,
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
      args: [morpho, expectedData.erc20Allowances.morpho],
    });
    await client.approve({
      address: wbC3M,
      args: [
        generalAdapter1,
        expectedData.erc20Allowances["bundler3.generalAdapter1"],
      ],
    });
    await client.approve({
      address: wbC3M,
      args: [permit2, expectedData.erc20Allowances.permit2],
    });
    await client.writeContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [
        wbC3M,
        bundler3,
        expectedData.permit2BundlerAllowance.amount,
        Number(expectedData.permit2BundlerAllowance.expiration),
      ],
    });

    const value = await Holding.fetch(client.account.address, wbC3M, wallet);

    expect(value).toStrictEqual(expectedData);
  });
});
