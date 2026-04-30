import { MarketParams, addressesRegistry } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, vi } from "vitest";
import {
  UsdcEurcvMarketV1,
  WethUsdsMarketV1,
} from "../../../test/fixtures/marketV1.js";
import { test } from "../../../test/setup.js";
import {
  NativeAmountOnNonWNativeCollateralError,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  NonPositiveBorrowAmountError,
  NonPositiveMinBorrowSharePriceError,
  ZeroCollateralAmountError,
  isRequirementApproval,
  isRequirementSignature,
} from "../../types/index.js";
import * as getRequirementsActionModule from "../requirements/getRequirementsAction.js";
import { getRequirements } from "../requirements/index.js";
import { marketV1SupplyCollateralBorrow } from "./supplyCollateralBorrow.js";

describe("marketV1SupplyCollateralBorrow unit tests", () => {
  const { wNative } = addressesRegistry[mainnet.id];
  const marketParams = new MarketParams(WethUsdsMarketV1);
  const marketId = marketParams.id;

  test("should create bundler supply collateral + borrow transaction (ERC20 only)", async ({
    client,
  }) => {
    const amount = parseUnits("1", 18);
    const borrowAmount = parseUnits("1000", 6);

    const tx = marketV1SupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        amount,
        borrowAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("marketV1SupplyCollateralBorrow");
    expect(tx.action.args.market).toBe(marketId);
    expect(tx.action.args.collateralAmount).toBe(amount);
    expect(tx.action.args.borrowAmount).toBe(borrowAmount);
    expect(tx.action.args.onBehalf).toBe(client.account.address);
    expect(tx.action.args.receiver).toBe(client.account.address);
    expect(tx.action.args.nativeAmount).toBeUndefined();
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should create bundler tx with native wrapping", async ({ client }) => {
    const nativeAmount = parseUnits("1", 18);
    const borrowAmount = parseUnits("1000", 6);

    const tx = marketV1SupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        nativeAmount,
        borrowAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
    });

    expect(tx.action.args.collateralAmount).toBe(nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
  });

  test("should create bundler tx with both ERC20 + native amount", async ({
    client,
  }) => {
    const amount = parseUnits("0.5", 18);
    const nativeAmount = parseUnits("0.5", 18);
    const borrowAmount = parseUnits("1000", 6);
    const totalCollateral = amount + nativeAmount;

    const tx = marketV1SupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        amount,
        nativeAmount,
        borrowAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
    });

    expect(tx.action.args.collateralAmount).toBe(totalCollateral);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
  });

  test("should create bundler tx with permit2 signature", async ({
    client,
  }) => {
    const amount = parseUnits("1", 18);
    const borrowAmount = parseUnits("1000", 6);

    const requirements = await getRequirements(client, {
      address: wNative,
      chainId: mainnet.id,
      supportSignature: true,
      args: {
        amount,
        from: client.account.address,
      },
    });

    const approvalPermit2 = requirements[0];
    if (!isRequirementApproval(approvalPermit2)) {
      throw new Error("Approval requirement not found");
    }

    const permit2Requirement = requirements[1];
    if (!isRequirementSignature(permit2Requirement)) {
      throw new Error("Permit2 requirement not found");
    }

    const requirementSignature = await permit2Requirement.sign(
      client,
      client.account.address,
    );

    const localSpy = vi.spyOn(
      getRequirementsActionModule,
      "getRequirementsAction",
    );

    const tx = marketV1SupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        amount,
        borrowAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        requirementSignature,
        minSharePrice: 0n,
      },
    });

    expect(localSpy).toHaveBeenCalled();
    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("marketV1SupplyCollateralBorrow");
  });

  test("should throw NonPositiveAssetAmountError when amount is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1SupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          amount: -1n,
          borrowAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(NonPositiveAssetAmountError);
  });

  test("should throw NonPositiveBorrowAmountError when borrowAmount is zero", async ({
    client,
  }) => {
    expect(() =>
      marketV1SupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          amount: parseUnits("1", 18),
          borrowAmount: 0n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(NonPositiveBorrowAmountError);
  });

  test("should throw NonPositiveBorrowAmountError when borrowAmount is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1SupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          amount: parseUnits("1", 18),
          borrowAmount: -1n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(NonPositiveBorrowAmountError);
  });

  test("should throw NonPositiveMinBorrowSharePriceError when minSharePrice is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1SupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          amount: parseUnits("1", 18),
          borrowAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          minSharePrice: -1n,
        },
      }),
    ).toThrow(NonPositiveMinBorrowSharePriceError);
  });

  test("should throw ZeroCollateralAmountError when total collateral is zero", async ({
    client,
  }) => {
    expect(() =>
      marketV1SupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          amount: 0n,
          borrowAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(ZeroCollateralAmountError);
  });

  test("should throw NegativeNativeAmountError when nativeAmount is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1SupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          nativeAmount: -1n,
          borrowAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(NegativeNativeAmountError);
  });

  test("should throw NativeAmountOnNonWNativeCollateralError for non-wNative collateral", async ({
    client,
  }) => {
    expect(() =>
      marketV1SupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: UsdcEurcvMarketV1,
        },
        args: {
          nativeAmount: parseUnits("1", 18),
          borrowAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(NativeAmountOnNonWNativeCollateralError);
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = marketV1SupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        amount: parseUnits("1", 18),
        borrowAmount: parseUnits("100", 6),
        onBehalf: client.account.address,
        receiver: client.account.address,
        minSharePrice: 0n,
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
    const borrowAmount = parseUnits("100", 6);

    const txWithout = marketV1SupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        amount,
        borrowAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
    });

    const txWith = marketV1SupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        amount,
        borrowAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.data.length).toBeGreaterThan(txWithout.data.length);
    expect(txWith.data.includes("a1b2c3d4")).toBe(true);
    expect(txWith.action.type).toBe("marketV1SupplyCollateralBorrow");
  });
});
