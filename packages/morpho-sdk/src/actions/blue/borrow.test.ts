import { getChainAddresses } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { WethUsdsBlue } from "../../../test/fixtures/blue.js";
import { test } from "../../../test/unit.js";
import {
  NegativeInputError,
  NonPositiveInputError,
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

  test("should throw NonPositiveInputError when amount is zero", async ({
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
    ).toThrow(NonPositiveInputError);
  });

  test("should throw NonPositiveInputError when amount is negative", async ({
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
    ).toThrow(NonPositiveInputError);
  });

  test("should throw NegativeInputError when minSharePrice is negative", async ({
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
    ).toThrow(NegativeInputError);
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
