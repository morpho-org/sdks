import { getChainAddresses } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  WbtcUsdcSourceMarket,
  WethUsdsBlue,
} from "../../../test/fixtures/blue.js";
import { SteakhouseUsdcVaultV1 } from "../../../test/fixtures/vaultV1.js";

import { test } from "../../../test/setup.js";
import {
  NonPositiveBorrowAmountError,
  NonPositiveMinBorrowSharePriceError,
  type VaultReallocation,
} from "../../types/index.js";
import { blueBorrow } from "./borrow.js";

describe("blueBorrow unit tests", () => {
  const {
    bundler3: { bundler3 },
  } = getChainAddresses(mainnet.id);
  test("should create direct borrow transaction", async ({ client }) => {
    const amount = parseUnits("1000", 6);

    const tx = blueBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount,
        minSharePrice: 0n,
        receiver: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("blueBorrow");
    expect(tx.action.args.market).toBe(WethUsdsBlue.id);
    expect(tx.action.args.amount).toBe(amount);
    expect(tx.action.args.receiver).toBe(client.account.address);
    expect(tx.to).toBe(bundler3);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should include reallocation fees in transaction value", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    const reallocationFee = parseUnits("0.01", 18);
    const reallocations: readonly VaultReallocation[] = [
      {
        vault: SteakhouseUsdcVaultV1.address,
        fee: reallocationFee,
        withdrawals: [
          {
            marketParams: WbtcUsdcSourceMarket,
            amount: parseUnits("2000", 6),
          },
        ],
      },
    ];

    const tx = blueBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount,
        minSharePrice: 0n,
        receiver: client.account.address,
        reallocations,
      },
    });

    expect(tx.value).toBe(reallocationFee);
    expect(tx.action.args.reallocationFee).toBe(reallocationFee);
  });

  test("should throw NonPositiveBorrowAmountError when amount is zero", async ({
    client,
  }) => {
    expect(() =>
      blueBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          amount: 0n,
          minSharePrice: 0n,
          receiver: client.account.address,
        },
      }),
    ).toThrow(NonPositiveBorrowAmountError);
  });

  test("should throw NonPositiveBorrowAmountError when amount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          amount: -1n,
          minSharePrice: 0n,
          receiver: client.account.address,
        },
      }),
    ).toThrow(NonPositiveBorrowAmountError);
  });

  test("should throw NonPositiveMinBorrowSharePriceError when minSharePrice is negative", async ({
    client,
  }) => {
    expect(() =>
      blueBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          amount: parseUnits("100", 6),
          minSharePrice: -1n,
          receiver: client.account.address,
        },
      }),
    ).toThrow(NonPositiveMinBorrowSharePriceError);
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = blueBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount: parseUnits("100", 6),
        minSharePrice: 0n,
        receiver: client.account.address,
      },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });

  test("should append metadata to transaction data when provided", async ({
    client,
  }) => {
    const amount = parseUnits("100", 6);

    const txWith = blueBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.data.includes("a1b2c3d4")).toBe(true);
    expect(txWith.action.type).toBe("blueBorrow");
  });
});
