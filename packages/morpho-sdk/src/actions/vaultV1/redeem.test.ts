import { parseUnits } from "viem";
import { describe, expect } from "vitest";
import {
  GauntletWethVaultV1,
  SteakhouseUsdcVaultV1,
} from "../../../test/fixtures/vaultV1.js";
import { test } from "../../../test/setup.js";
import { NonPositiveSharesAmountError } from "../../types/index.js";
import { vaultV1Redeem } from "./redeem.js";

describe("redeemVaultV1 unit tests", () => {
  test("should create redeem transaction with USDC vault", async ({
    client,
  }) => {
    const shares = parseUnits("1000", 18);

    const tx = vaultV1Redeem({
      vault: {
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        shares,
        recipient: client.account.address,
        onBehalf: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV1Redeem");
    expect(tx.action.args.vault).toBe(SteakhouseUsdcVaultV1.address);
    expect(tx.action.args.shares).toBe(shares);
    expect(tx.action.args.recipient).toBe(client.account.address);
    expect(tx.to).toBe(SteakhouseUsdcVaultV1.address);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should create redeem transaction with WETH vault", async ({
    client,
  }) => {
    const shares = parseUnits("5", 18);

    const tx = vaultV1Redeem({
      vault: {
        address: GauntletWethVaultV1.address,
      },
      args: {
        shares,
        recipient: client.account.address,
        onBehalf: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV1Redeem");
    expect(tx.action.args.vault).toBe(GauntletWethVaultV1.address);
    expect(tx.action.args.shares).toBe(shares);
    expect(tx.action.args.recipient).toBe(client.account.address);
    expect(tx.to).toBe(GauntletWethVaultV1.address);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should allow different recipient and onBehalf addresses", async ({
    client,
  }) => {
    const shares = parseUnits("100", 18);
    const differentRecipient =
      "0x1234567890123456789012345678901234567890" as const;

    const tx = vaultV1Redeem({
      vault: {
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        shares,
        recipient: differentRecipient,
        onBehalf: client.account.address,
      },
    });

    expect(tx.action.args.recipient).toBe(differentRecipient);
    expect(tx.to).toBe(SteakhouseUsdcVaultV1.address);
  });

  test("should throw NonPositiveSharesAmountError when shares is zero", async () => {
    expect(() =>
      vaultV1Redeem({
        vault: {
          address: SteakhouseUsdcVaultV1.address,
        },
        args: {
          shares: 0n,
          recipient: "0x1234567890123456789012345678901234567890",
          onBehalf: "0x1234567890123456789012345678901234567890",
        },
      }),
    ).toThrow(NonPositiveSharesAmountError);
  });

  test("should throw NonPositiveSharesAmountError when shares is negative", async () => {
    expect(() =>
      vaultV1Redeem({
        vault: {
          address: SteakhouseUsdcVaultV1.address,
        },
        args: {
          shares: -1n,
          recipient: "0x1234567890123456789012345678901234567890",
          onBehalf: "0x1234567890123456789012345678901234567890",
        },
      }),
    ).toThrow(NonPositiveSharesAmountError);
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = vaultV1Redeem({
      vault: {
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        shares: parseUnits("100", 18),
        recipient: client.account.address,
        onBehalf: client.account.address,
      },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });

  test("should append metadata to transaction data when provided", async ({
    client,
  }) => {
    const shares = parseUnits("100", 18);

    const txWithout = vaultV1Redeem({
      vault: {
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        shares,
        recipient: client.account.address,
        onBehalf: client.account.address,
      },
    });

    const txWith = vaultV1Redeem({
      vault: {
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        shares,
        recipient: client.account.address,
        onBehalf: client.account.address,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.data.length).toBeGreaterThan(txWithout.data.length);
    expect(txWith.action.type).toBe("vaultV1Redeem");
  });

  test("should encode calldata targeting the vault address directly", async ({
    client,
  }) => {
    const tx = vaultV1Redeem({
      vault: {
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        shares: parseUnits("1000", 18),
        recipient: client.account.address,
        onBehalf: client.account.address,
      },
    });

    expect(tx.to).toBe(SteakhouseUsdcVaultV1.address);
  });
});
