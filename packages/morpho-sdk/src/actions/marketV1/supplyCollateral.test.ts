import { addressesRegistry, getChainAddresses } from "@morpho-org/blue-sdk";
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
  ZeroCollateralAmountError,
  isRequirementApproval,
  isRequirementSignature,
} from "../../types/index.js";
import * as getRequirementsActionModule from "../requirements/getRequirementsAction.js";
import { getRequirements } from "../requirements/index.js";
import { marketV1SupplyCollateral } from "./supplyCollateral.js";

describe("marketV1SupplyCollateral unit tests", () => {
  const { wNative } = addressesRegistry[mainnet.id];
  const {
    bundler3: { bundler3 },
  } = getChainAddresses(mainnet.id);

  /** Market params with wNative as collateral — enables native wrapping tests. */
  const wNativeCollateralMarketParams = {
    ...WethUsdsMarketV1,
    collateralToken: wNative,
  };

  test("should create direct supply collateral transaction (no native)", async ({
    client,
  }) => {
    const amount = parseUnits("1", 18);

    const tx = marketV1SupplyCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        amount,
        onBehalf: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("marketV1SupplyCollateral");
    expect(tx.action.args.market).toBe(WethUsdsMarketV1.id);
    expect(tx.action.args.amount).toBe(amount);
    expect(tx.action.args.onBehalf).toBe(client.account.address);
    expect(tx.action.args.nativeAmount).toBeUndefined();
    expect(tx.to).toBe(bundler3);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should create bundler supply collateral with native wrapping", async ({
    client,
  }) => {
    const nativeAmount = parseUnits("1", 18);

    const tx = marketV1SupplyCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: wNativeCollateralMarketParams,
      },
      args: {
        nativeAmount,
        onBehalf: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("marketV1SupplyCollateral");
    expect(tx.action.args.amount).toBe(nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
    expect(tx.to).toBe(bundler3);
  });

  test("should create bundler tx with both ERC20 amount and native amount", async ({
    client,
  }) => {
    const amount = parseUnits("0.5", 18);
    const nativeAmount = parseUnits("0.5", 18);
    const totalCollateral = amount + nativeAmount;

    const tx = marketV1SupplyCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: wNativeCollateralMarketParams,
      },
      args: {
        amount,
        nativeAmount,
        onBehalf: client.account.address,
      },
    });

    expect(tx.action.args.amount).toBe(totalCollateral);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
  });

  test("should create bundler tx with permit2 signature and native wrapping", async ({
    client,
  }) => {
    const amount = parseUnits("0.5", 18);
    const nativeAmount = parseUnits("0.5", 18);

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

    const tx = marketV1SupplyCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: wNativeCollateralMarketParams,
      },
      args: {
        amount,
        nativeAmount,
        onBehalf: client.account.address,
        requirementSignature,
      },
    });

    expect(localSpy).toHaveBeenCalled();
    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("marketV1SupplyCollateral");
    expect(tx.value).toBe(nativeAmount);
  });

  test("should not call getRequirementsAction when no requirementSignature", async ({
    client,
  }) => {
    const localSpy = vi.spyOn(
      getRequirementsActionModule,
      "getRequirementsAction",
    );

    marketV1SupplyCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        amount: parseUnits("1", 18),
        onBehalf: client.account.address,
      },
    });

    expect(localSpy).not.toHaveBeenCalled();
  });

  test("should throw NonPositiveAssetAmountError when amount is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1SupplyCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          amount: -1n,
          onBehalf: client.account.address,
        },
      }),
    ).toThrow(NonPositiveAssetAmountError);
  });

  test("should throw ZeroCollateralAmountError when total collateral is zero", async ({
    client,
  }) => {
    expect(() =>
      marketV1SupplyCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsMarketV1,
        },
        args: {
          amount: 0n,
          onBehalf: client.account.address,
        },
      }),
    ).toThrow(ZeroCollateralAmountError);
  });

  test("should throw NegativeNativeAmountError when nativeAmount is negative", async ({
    client,
  }) => {
    expect(() =>
      marketV1SupplyCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: wNativeCollateralMarketParams,
        },
        args: {
          nativeAmount: -1n,
          onBehalf: client.account.address,
        },
      }),
    ).toThrow(NegativeNativeAmountError);
  });

  test("should throw NativeAmountOnNonWNativeCollateralError for non-wNative collateral", async ({
    client,
  }) => {
    expect(() =>
      marketV1SupplyCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: UsdcEurcvMarketV1,
        },
        args: {
          nativeAmount: parseUnits("1", 18),
          onBehalf: client.account.address,
        },
      }),
    ).toThrow(NativeAmountOnNonWNativeCollateralError);
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = marketV1SupplyCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        amount: parseUnits("1", 18),
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
    const amount = parseUnits("1", 18);

    const txWith = marketV1SupplyCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsMarketV1,
      },
      args: {
        amount,
        onBehalf: client.account.address,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.action.type).toBe("marketV1SupplyCollateral");
    expect(txWith.data.includes("a1b2c3d4")).toBe(true);
  });
});
