import { addressesRegistry, getChainAddresses } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, vi } from "vitest";
import { CbbtcUsdcBlue, WethUsdsBlue } from "../../../test/fixtures/blue.js";
import { test } from "../../../test/unit.js";
import {
  isRequirementApproval,
  isRequirementSignature,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";
import { getGeneralAdapterRequirements } from "../requirements/index.js";
import * as getTokenRequirementActionsModule from "../signatures/getTokenRequirementActions.js";
import { blueSupply } from "./supply.js";

describe("blueSupply unit tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const { wNative } = addressesRegistry[mainnet.id];
  const {
    bundler3: { bundler3 },
  } = getChainAddresses(mainnet.id);

  // Market params with wNative as loan asset — enables native wrapping tests.
  const wNativeLoanMarketParams = {
    ...WethUsdsBlue,
    loanToken: wNative,
  };

  /** RAY-scaled max share price ≈ 1.01x — generous slippage bound for unit tests. */
  const MAX_SHARE_PRICE = 1_010_000_000_000_000_000_000_000_000n;

  test("should create direct supply transaction (no native)", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6); // USDC

    const tx = blueSupply({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        amount,
        onBehalf: client.account.address,
        maxSharePrice: MAX_SHARE_PRICE,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("blueSupply");
    expect(tx.action.args.market).toBe(CbbtcUsdcBlue.id);
    expect(tx.action.args.amount).toBe(amount);
    expect(tx.action.args.onBehalf).toBe(client.account.address);
    expect(tx.action.args.maxSharePrice).toBe(MAX_SHARE_PRICE);
    expect(tx.action.args.nativeAmount).toBeUndefined();
    expect(tx.to).toBe(bundler3);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should create supply transaction with native wrapping", async ({
    client,
  }) => {
    const nativeAmount = parseUnits("1", 18);

    const tx = blueSupply({
      market: { chainId: mainnet.id, marketParams: wNativeLoanMarketParams },
      args: {
        nativeAmount,
        onBehalf: client.account.address,
        maxSharePrice: MAX_SHARE_PRICE,
      },
    });

    expect(tx.action.type).toBe("blueSupply");
    expect(tx.action.args.amount).toBe(nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
    expect(tx.to).toBe(bundler3);
  });

  test("should create tx with both ERC20 amount and native amount", async ({
    client,
  }) => {
    const amount = parseUnits("0.5", 18);
    const nativeAmount = parseUnits("0.5", 18);
    const totalAssets = amount + nativeAmount;

    const tx = blueSupply({
      market: { chainId: mainnet.id, marketParams: wNativeLoanMarketParams },
      args: {
        amount,
        nativeAmount,
        onBehalf: client.account.address,
        maxSharePrice: MAX_SHARE_PRICE,
      },
    });

    expect(tx.action.args.amount).toBe(totalAssets);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
  });

  test("should create tx with permit2 signature", async ({ client }) => {
    const amount = parseUnits("1000", 6);

    const requirements = await getGeneralAdapterRequirements(client, {
      address: CbbtcUsdcBlue.loanToken,
      chainId: mainnet.id,
      supportSignature: true,
      args: { amount, from: client.account.address },
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
      getTokenRequirementActionsModule,
      "getTokenRequirementActions",
    );

    const tx = blueSupply({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        amount,
        onBehalf: client.account.address,
        maxSharePrice: MAX_SHARE_PRICE,
        requirementSignature,
      },
    });

    expect(localSpy).toHaveBeenCalled();
    expect(tx.action.type).toBe("blueSupply");
  });

  test("should call getTokenRequirementActions without requirementSignature", async ({
    client,
  }) => {
    const localSpy = vi.spyOn(
      getTokenRequirementActionsModule,
      "getTokenRequirementActions",
    );

    blueSupply({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        amount: parseUnits("1000", 6),
        onBehalf: client.account.address,
        maxSharePrice: MAX_SHARE_PRICE,
      },
    });

    expect(localSpy).toHaveBeenCalled();
  });

  test("should throw NegativeInputError when amount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueSupply({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
        args: {
          amount: -1n,
          onBehalf: client.account.address,
          maxSharePrice: MAX_SHARE_PRICE,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("should throw NonPositiveInputError when total amount is zero", async ({
    client,
  }) => {
    expect(() =>
      blueSupply({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
        args: {
          amount: 0n,
          onBehalf: client.account.address,
          maxSharePrice: MAX_SHARE_PRICE,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("should throw NegativeInputError when nativeAmount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueSupply({
        market: { chainId: mainnet.id, marketParams: wNativeLoanMarketParams },
        args: {
          nativeAmount: -1n,
          onBehalf: client.account.address,
          maxSharePrice: MAX_SHARE_PRICE,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("should throw NegativeInputError when maxSharePrice is negative", async ({
    client,
  }) => {
    expect(() =>
      blueSupply({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
        args: {
          amount: parseUnits("1000", 6),
          onBehalf: client.account.address,
          maxSharePrice: -1n,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("should throw NativeAmountOnNonWNativeAssetError for non-wNative loan token", async ({
    client,
  }) => {
    expect(() =>
      blueSupply({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
        args: {
          nativeAmount: parseUnits("1", 18),
          onBehalf: client.account.address,
          maxSharePrice: MAX_SHARE_PRICE,
        },
      }),
    ).toThrow(NativeAmountOnNonWNativeAssetError);
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = blueSupply({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        amount: parseUnits("1000", 6),
        onBehalf: client.account.address,
        maxSharePrice: MAX_SHARE_PRICE,
      },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });

  test("should append metadata to transaction data when provided", async ({
    client,
  }) => {
    const tx = blueSupply({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        amount: parseUnits("1000", 6),
        onBehalf: client.account.address,
        maxSharePrice: MAX_SHARE_PRICE,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.action.type).toBe("blueSupply");
    expect(tx.data.includes("a1b2c3d4")).toBe(true);
  });
});
