import { getChainAddresses } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  CbbtcUsdcMarketV1,
  WbtcUsdcSourceMarket,
} from "../../../test/fixtures/marketV1.js";
import { SteakhouseUsdcVaultV1 } from "../../../test/fixtures/vaultV1.js";
import { test } from "../../../test/setup.js";
import {
  MutuallyExclusiveWithdrawAmountsError,
  NegativeWithdrawMinSharePriceError,
  NonPositiveWithdrawAmountError,
  type VaultReallocation,
} from "../../types/index.js";
import { marketV1Withdraw } from "./withdraw.js";

describe("marketV1Withdraw unit tests", () => {
  const {
    bundler3: { bundler3 },
  } = getChainAddresses(mainnet.id);

  test("should create direct withdraw transaction by assets", async ({
    client,
  }) => {
    const assets = parseUnits("1000", 6);

    const tx = marketV1Withdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
      args: {
        assets,
        shares: 0n,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("marketV1Withdraw");
    expect(tx.action.args.market).toBe(CbbtcUsdcMarketV1.id);
    expect(tx.action.args.assets).toBe(assets);
    expect(tx.action.args.shares).toBe(0n);
    expect(tx.action.args.receiver).toBe(client.account.address);
    expect(tx.action.args.minSharePrice).toBe(0n);
    expect(tx.action.args.reallocationFee).toBe(0n);
    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
  });

  test("should create direct withdraw transaction by shares", async ({
    client,
  }) => {
    const shares = parseUnits("1000", 24); // share-side decimals are virtual

    const tx = marketV1Withdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
      args: {
        assets: 0n,
        shares,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
    });

    expect(tx.action.type).toBe("marketV1Withdraw");
    expect(tx.action.args.assets).toBe(0n);
    expect(tx.action.args.shares).toBe(shares);
    expect(tx.value).toBe(0n);
  });

  test("should support a receiver different from the signer", async () => {
    const receiver = "0x000000000000000000000000000000000000dEaD" as const;

    const tx = marketV1Withdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
        receiver,
        minSharePrice: 0n,
      },
    });

    expect(tx.action.args.receiver).toBe(receiver);
  });

  test("should throw NonPositiveWithdrawAmountError when both assets and shares are zero", async ({
    client,
  }) => {
    expect(() =>
      marketV1Withdraw({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
        args: {
          assets: 0n,
          shares: 0n,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(NonPositiveWithdrawAmountError);
  });

  test("should throw NonPositiveWithdrawAmountError when assets is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1Withdraw({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
        args: {
          assets: -1n,
          shares: 0n,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(NonPositiveWithdrawAmountError);
  });

  test("should throw NonPositiveWithdrawAmountError when shares is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1Withdraw({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
        args: {
          assets: 0n,
          shares: -1n,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(NonPositiveWithdrawAmountError);
  });

  test("should throw MutuallyExclusiveWithdrawAmountsError when both assets and shares are non-zero", async ({
    client,
  }) => {
    expect(() =>
      marketV1Withdraw({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
        args: {
          assets: parseUnits("100", 6),
          shares: parseUnits("100", 24),
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(MutuallyExclusiveWithdrawAmountsError);
  });

  test("should throw MutuallyExclusiveWithdrawAmountsError on mixed-sign inputs (positive assets, negative shares)", async ({
    client,
  }) => {
    // A mixed-sign pair still expresses "both modes specified" — surface that
    // as the mode-conflict error rather than masking it as a positivity error.
    expect(() =>
      marketV1Withdraw({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
        args: {
          assets: parseUnits("100", 6),
          shares: -1n,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(MutuallyExclusiveWithdrawAmountsError);
  });

  test("should throw NegativeWithdrawMinSharePriceError when minSharePrice is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1Withdraw({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
        args: {
          assets: parseUnits("100", 6),
          shares: 0n,
          receiver: client.account.address,
          minSharePrice: -1n,
        },
      }),
    ).toThrow(NegativeWithdrawMinSharePriceError);
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = marketV1Withdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });

  test("should set tx.value to the summed reallocation fee", async ({
    client,
  }) => {
    const reallocationFee = parseUnits("0.01", 18);
    const reallocations: readonly VaultReallocation[] = [
      {
        vault: SteakhouseUsdcVaultV1.address,
        fee: reallocationFee,
        withdrawals: [
          {
            marketParams: WbtcUsdcSourceMarket,
            amount: parseUnits("500", 6),
          },
        ],
      },
    ];

    const tx = marketV1Withdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
        receiver: client.account.address,
        minSharePrice: 0n,
        reallocations,
      },
    });

    expect(tx.value).toBe(reallocationFee);
    expect(tx.action.args.reallocationFee).toBe(reallocationFee);
  });

  test("should append metadata to transaction data when provided", async ({
    client,
  }) => {
    const tx = marketV1Withdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.action.type).toBe("marketV1Withdraw");
    expect(tx.data.includes("a1b2c3d4")).toBe(true);
  });
});
