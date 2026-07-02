import { addressesRegistry, MarketParams } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, vi } from "vitest";
import {
  UsdcEurcvBlue,
  WbtcUsdcSourceMarket,
  WethUsdsBlue,
} from "../../../test/fixtures/blue.js";
import { SteakhouseUsdcVaultV1 } from "../../../test/fixtures/vaultV1.js";
import { test } from "../../../test/setup.js";
import {
  isRequirementApproval,
  isRequirementSignature,
  NativeAmountOnNonWNativeAssetError,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  NonPositiveBorrowAmountError,
  NonPositiveMinBorrowSharePriceError,
  type VaultReallocation,
  ZeroCollateralAmountError,
} from "../../types/index.js";
import * as getRequirementsActionModule from "../requirements/getRequirementsAction.js";
import { getGeneralAdapterRequirements } from "../requirements/index.js";
import { blueSupplyCollateralBorrow } from "./supplyCollateralBorrow.js";

describe("blueSupplyCollateralBorrow unit tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const { wNative } = addressesRegistry[mainnet.id];
  const marketParams = new MarketParams(WethUsdsBlue);
  const marketId = marketParams.id;

  test("should create bundler supply collateral + borrow transaction (ERC20 only)", async ({
    client,
  }) => {
    const amount = parseUnits("1", 18);
    const borrowAmount = parseUnits("1000", 6);

    const tx = blueSupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
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
    expect(tx.action.type).toBe("blueSupplyCollateralBorrow");
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

    const tx = blueSupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
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

  test("should create bundler tx with native wrapping and reallocations", async ({
    client,
  }) => {
    const nativeAmount = parseUnits("0.5", 18);
    const borrowAmount = parseUnits("1000", 6);
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

    const tx = blueSupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        nativeAmount,
        borrowAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        minSharePrice: 0n,
        reallocations,
      },
    });

    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.action.args.reallocationFee).toBe(reallocationFee);
    expect(tx.value).toBe(nativeAmount + reallocationFee);
  });

  test("should create bundler tx with both ERC20 + native amount", async ({
    client,
  }) => {
    const amount = parseUnits("0.5", 18);
    const nativeAmount = parseUnits("0.5", 18);
    const borrowAmount = parseUnits("1000", 6);
    const totalCollateral = amount + nativeAmount;

    const tx = blueSupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
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

    const requirements = await getGeneralAdapterRequirements(client, {
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

    const tx = blueSupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
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
    expect(tx.action.type).toBe("blueSupplyCollateralBorrow");
  });

  test("should throw NonPositiveAssetAmountError when amount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueSupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
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
      blueSupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
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
      blueSupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
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
      blueSupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
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
      blueSupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
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
      blueSupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
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

  test("should throw NativeAmountOnNonWNativeAssetError for non-wNative collateral", async ({
    client,
  }) => {
    expect(() =>
      blueSupplyCollateralBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: UsdcEurcvBlue,
        },
        args: {
          nativeAmount: parseUnits("1", 18),
          borrowAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(NativeAmountOnNonWNativeAssetError);
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = blueSupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
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

    const txWithout = blueSupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount,
        borrowAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
    });

    const txWith = blueSupplyCollateralBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
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
    expect(txWith.action.type).toBe("blueSupplyCollateralBorrow");
  });
});
