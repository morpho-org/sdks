import { parseUnits } from "viem";
import { describe, expect } from "vitest";
import {
  KeyrockUsdcVaultV2,
  KpkWETHVaultV2,
} from "../../../test/fixtures/vaultV2.js";
import { test } from "../../../test/setup.js";
import { NonPositiveSharesAmountError } from "../../types/index.js";
import { vaultV2Redeem } from "./redeem.js";

describe("redeemVaultV2 unit tests", () => {
  test("should create redeem transaction with USDC vault", async ({
    client,
  }) => {
    const shares = parseUnits("1000", 18); // 1000 shares

    const tx = vaultV2Redeem({
      vault: {
        address: KeyrockUsdcVaultV2.address,
      },
      args: {
        shares,
        recipient: client.account.address,
        onBehalf: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV2Redeem");
    expect(tx.action.args.vault).toBe(KeyrockUsdcVaultV2.address);
    expect(tx.action.args.shares).toBe(shares);
    expect(tx.action.args.recipient).toBe(client.account.address);
    expect(tx.to).toBe(KeyrockUsdcVaultV2.address);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should create redeem transaction with WETH vault", async ({
    client,
  }) => {
    const shares = parseUnits("5", 18); // 5 shares

    const tx = vaultV2Redeem({
      vault: {
        address: KpkWETHVaultV2.address,
      },
      args: {
        shares,
        recipient: client.account.address,
        onBehalf: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV2Redeem");
    expect(tx.action.args.vault).toBe(KpkWETHVaultV2.address);
    expect(tx.action.args.shares).toBe(shares);
    expect(tx.action.args.recipient).toBe(client.account.address);
    expect(tx.to).toBe(KpkWETHVaultV2.address);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should allow different recipient and onBehalf addresses", async ({
    client,
  }) => {
    const shares = parseUnits("100", 18);
    const differentRecipient =
      "0x1234567890123456789012345678901234567890" as const;

    const tx = vaultV2Redeem({
      vault: {
        address: KeyrockUsdcVaultV2.address,
      },
      args: {
        shares,
        recipient: differentRecipient,
        onBehalf: client.account.address,
      },
    });

    expect(tx.action.args.recipient).toBe(differentRecipient);
    expect(tx.to).toBe(KeyrockUsdcVaultV2.address);
  });

  test("should throw NonPositiveSharesAmountError when shares is zero", async () => {
    expect(() =>
      vaultV2Redeem({
        vault: {
          address: KeyrockUsdcVaultV2.address,
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
      vaultV2Redeem({
        vault: {
          address: KeyrockUsdcVaultV2.address,
        },
        args: {
          shares: -1n,
          recipient: "0x1234567890123456789012345678901234567890",
          onBehalf: "0x1234567890123456789012345678901234567890",
        },
      }),
    ).toThrow(NonPositiveSharesAmountError);
  });
});
