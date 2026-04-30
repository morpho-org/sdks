import { getChainAddresses } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { WethUsdsMarketV1 } from "../../../test/fixtures/marketV1.js";

import { test } from "../../../test/setup.js";
import {
  NonPositiveBorrowAmountError,
  NonPositiveMinBorrowSharePriceError,
} from "../../types/index.js";
import { marketV1Borrow } from "./borrow.js";

describe("marketV1Borrow unit tests", () => {
  const {
    bundler3: { bundler3 },
  } = getChainAddresses(mainnet.id);
  test("should create direct borrow transaction", async ({ client }) => {
    const amount = parseUnits("1000", 6);

    const tx = marketV1Borrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        amount,
        minSharePrice: 0n,
        receiver: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("marketV1Borrow");
    expect(tx.action.args.market).toBe(WethUsdsMarketV1.id);
    expect(tx.action.args.amount).toBe(amount);
    expect(tx.action.args.receiver).toBe(client.account.address);
    expect(tx.to).toBe(bundler3);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should throw NonPositiveBorrowAmountError when amount is zero", async ({
    client,
  }) => {
    expect(() =>
      marketV1Borrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
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
      marketV1Borrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
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
      marketV1Borrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
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
    const tx = marketV1Borrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
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

    const txWith = marketV1Borrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        amount,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.data.includes("a1b2c3d4")).toBe(true);
    expect(txWith.action.type).toBe("marketV1Borrow");
  });
});
