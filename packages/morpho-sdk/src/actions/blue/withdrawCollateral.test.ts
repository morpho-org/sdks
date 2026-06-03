import { getChainAddresses } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { WethUsdsBlue } from "../../../test/fixtures/blue.js";
import { test } from "../../../test/setup.js";
import { NonPositiveWithdrawCollateralAmountError } from "../../types/index.js";
import { blueWithdrawCollateral } from "./withdrawCollateral.js";

describe("blueWithdrawCollateral unit tests", () => {
  const { morpho } = getChainAddresses(mainnet.id);

  test("should create direct morpho withdraw collateral transaction", async ({
    client,
  }) => {
    const amount = parseUnits("1", 18);

    const tx = blueWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount,
        onBehalf: client.account.address,
        receiver: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("blueWithdrawCollateral");
    expect(tx.action.args.market).toBe(WethUsdsBlue.id);
    expect(tx.action.args.amount).toBe(amount);
    expect(tx.action.args.onBehalf).toBe(client.account.address);
    expect(tx.action.args.receiver).toBe(client.account.address);
    expect(tx.to).toBe(morpho);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should throw NonPositiveWithdrawCollateralAmountError when amount is zero", async ({
    client,
  }) => {
    expect(() =>
      blueWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          amount: 0n,
          onBehalf: client.account.address,
          receiver: client.account.address,
        },
      }),
    ).toThrow(NonPositiveWithdrawCollateralAmountError);
  });

  test("should throw NonPositiveWithdrawCollateralAmountError when amount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          amount: -1n,
          onBehalf: client.account.address,
          receiver: client.account.address,
        },
      }),
    ).toThrow(NonPositiveWithdrawCollateralAmountError);
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = blueWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount: parseUnits("1", 18),
        onBehalf: client.account.address,
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
    const amount = parseUnits("1", 18);

    const txWith = blueWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount,
        onBehalf: client.account.address,
        receiver: client.account.address,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.data.includes("a1b2c3d4")).toBe(true);
    expect(txWith.action.type).toBe("blueWithdrawCollateral");
  });
});
