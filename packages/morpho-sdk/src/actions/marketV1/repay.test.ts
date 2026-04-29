import { getChainAddresses } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, vi } from "vitest";
import { WethUsdsMarketV1 } from "../../../test/fixtures/marketV1.js";
import { test } from "../../../test/setup.js";
import {
  MutuallyExclusiveRepayAmountsError,
  NonPositiveRepayAmountError,
  NonPositiveRepayMaxSharePriceError,
  NonPositiveTransferAmountError,
  TransferAmountNotEqualToAssetsError,
} from "../../types/index.js";
import * as getRequirementsActionModule from "../requirements/getRequirementsAction.js";
import { marketV1Repay } from "./repay.js";

describe("marketV1Repay unit tests", () => {
  const {
    bundler3: { bundler3 },
  } = getChainAddresses(mainnet.id);

  test("should create repay-by-assets transaction", async ({ client }) => {
    const assets = parseUnits("1000", 6);

    const tx = marketV1Repay({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        assets,
        shares: 0n,
        transferAmount: assets,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("marketV1Repay");
    expect(tx.action.args.market).toBe(WethUsdsMarketV1.id);
    expect(tx.action.args.assets).toBe(assets);
    expect(tx.action.args.shares).toBe(0n);
    expect(tx.action.args.transferAmount).toBe(assets);
    expect(tx.action.args.onBehalf).toBe(client.account.address);
    expect(tx.action.args.receiver).toBe(client.account.address);
    expect(tx.to).toBe(bundler3);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should create repay-by-shares transaction", async ({ client }) => {
    const shares = parseUnits("500", 6);
    const transferAmount = parseUnits("600", 6);

    const tx = marketV1Repay({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        assets: 0n,
        shares,
        transferAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("marketV1Repay");
    expect(tx.action.args.assets).toBe(0n);
    expect(tx.action.args.shares).toBe(shares);
    expect(tx.action.args.transferAmount).toBe(transferAmount);
    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
  });

  test("should include erc20Transfer skim (maxUint256) in by-shares bundle but not in by-assets bundle", async ({
    client,
  }) => {
    const sharesTx = marketV1Repay({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        assets: 0n,
        shares: parseUnits("500", 6),
        transferAmount: parseUnits("600", 6),
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    const assetsTx = marketV1Repay({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        assets: parseUnits("500", 6),
        shares: 0n,
        transferAmount: parseUnits("500", 6),
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    const maxUint256Hex = "f".repeat(64);
    expect(sharesTx.data.toLowerCase()).toContain(maxUint256Hex);
    expect(assetsTx.data.toLowerCase()).not.toContain(maxUint256Hex);
  });

  test("should throw NonPositiveRepayMaxSharePriceError when maxSharePrice is zero", async ({
    client,
  }) => {
    expect(() =>
      marketV1Repay({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          assets: parseUnits("100", 6),
          shares: 0n,
          transferAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 0n,
        },
      }),
    ).toThrow(NonPositiveRepayMaxSharePriceError);
  });

  test("should throw NonPositiveRepayMaxSharePriceError when maxSharePrice is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1Repay({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          assets: parseUnits("100", 6),
          shares: 0n,
          transferAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: -1n,
        },
      }),
    ).toThrow(NonPositiveRepayMaxSharePriceError);
  });

  test("should throw MutuallyExclusiveRepayAmountsError when both assets and shares are non-zero", async ({
    client,
  }) => {
    expect(() =>
      marketV1Repay({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          assets: parseUnits("100", 6),
          shares: parseUnits("50", 6),
          transferAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(MutuallyExclusiveRepayAmountsError);
  });

  test("should throw NonPositiveRepayAmountError when both assets and shares are zero", async ({
    client,
  }) => {
    expect(() =>
      marketV1Repay({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          assets: 0n,
          shares: 0n,
          transferAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("should throw NonPositiveRepayAmountError when assets is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1Repay({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          assets: -1n,
          shares: 0n,
          transferAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("should throw NonPositiveRepayAmountError when shares is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1Repay({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          assets: 0n,
          shares: -1n,
          transferAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("should throw NonPositiveTransferAmountError when transferAmount is zero", async ({
    client,
  }) => {
    expect(() =>
      marketV1Repay({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          assets: 0n,
          shares: parseUnits("100", 6),
          transferAmount: 0n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveTransferAmountError);
  });

  test("should throw NonPositiveTransferAmountError when transferAmount is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1Repay({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          assets: 0n,
          shares: parseUnits("100", 6),
          transferAmount: -1n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveTransferAmountError);
  });

  test("should throw TransferAmountNotEqualToAssetsError when assets > 0 and transferAmount differs", async ({
    client,
  }) => {
    const assets = parseUnits("100", 6);
    const transferAmount = parseUnits("200", 6);

    expect(() =>
      marketV1Repay({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          assets,
          shares: 0n,
          transferAmount,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(TransferAmountNotEqualToAssetsError);
  });

  test("should not call getRequirementsAction when no requirementSignature", async ({
    client,
  }) => {
    const localSpy = vi.spyOn(
      getRequirementsActionModule,
      "getRequirementsAction",
    );

    marketV1Repay({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
        transferAmount: parseUnits("100", 6),
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(localSpy).not.toHaveBeenCalled();
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = marketV1Repay({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
        transferAmount: parseUnits("100", 6),
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });

  test("should append metadata to transaction data when provided", async ({
    client,
  }) => {
    const assets = parseUnits("100", 6);

    const txWith = marketV1Repay({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        assets,
        shares: 0n,
        transferAmount: assets,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.data.includes("a1b2c3d4")).toBe(true);
    expect(txWith.action.type).toBe("marketV1Repay");
  });
});
