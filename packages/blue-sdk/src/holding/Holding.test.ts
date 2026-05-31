import { describe, expect, test } from "vitest";
import { RECIPIENT, USER } from "../__test__/fixtures.js";
import { Holding } from "./Holding.js";

describe("Holding", () => {
  test("constructor normalizes allowances and optional fields", () => {
    const holding = new Holding({
      user: USER,
      token: RECIPIENT,
      erc20Allowances: {
        morpho: 1n,
        permit2: 2n,
        "bundler3.generalAdapter1": 3n,
      },
      permit2BundlerAllowance: {
        amount: "4",
        expiration: 5,
        nonce: true,
      },
      erc2612Nonce: 6n,
      canTransfer: false,
      balance: 7n,
    });

    expect(holding.user).toBe(USER);
    expect(holding.token).toBe(RECIPIENT);
    expect(holding.erc20Allowances).toStrictEqual({
      morpho: 1n,
      permit2: 2n,
      "bundler3.generalAdapter1": 3n,
    });
    expect(holding.permit2BundlerAllowance).toStrictEqual({
      amount: 4n,
      expiration: 5n,
      nonce: 1n,
    });
    expect(holding.erc2612Nonce).toBe(6n);
    expect(holding.canTransfer).toBe(false);
    expect(holding.balance).toBe(7n);
  });

  test("balance setter updates the stored balance", () => {
    const holding = new Holding({
      user: USER,
      token: RECIPIENT,
      erc20Allowances: {
        morpho: 0n,
        permit2: 0n,
        "bundler3.generalAdapter1": 0n,
      },
      permit2BundlerAllowance: {
        amount: 0n,
        expiration: 0n,
        nonce: 0n,
      },
      balance: 0n,
    });

    expect(holding.erc2612Nonce).toBeUndefined();
    holding.balance = 42n;
    expect(holding.balance).toBe(42n);
  });
});
