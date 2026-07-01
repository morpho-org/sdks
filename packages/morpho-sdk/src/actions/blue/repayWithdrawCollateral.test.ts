import { getChainAddresses } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, vi } from "vitest";
import { WethUsdsBlue, WstethWethBlue } from "../../../test/fixtures/blue.js";
import { makePermit } from "../../../test/helpers/permit.js";
import { test } from "../../../test/setup.js";
import {
  MutuallyExclusiveRepayAmountsError,
  NativeAmountExceedsTransferAmountError,
  NativeAmountOnNonWNativeAssetError,
  NegativeNativeAmountError,
  NonPositiveRepayAmountError,
  NonPositiveRepayMaxSharePriceError,
  NonPositiveTransferAmountError,
  NonPositiveWithdrawCollateralAmountError,
} from "../../types/index.js";
import * as getRequirementsActionModule from "../requirements/getRequirementsAction.js";
import { blueRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";

const MAX_UINT256_HEX = "f".repeat(64);
const WITHDRAW_AMOUNT = parseUnits("1", 18);

describe("blueRepayWithdrawCollateral unit tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const {
    bundler3: { bundler3 },
  } = getChainAddresses(mainnet.id);

  test("default", async ({ client }) => {
    const amount = parseUnits("1000", 6);

    const tx = blueRepayWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount,
        withdrawAmount: WITHDRAW_AMOUNT,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("blueRepayWithdrawCollateral");
    expect(tx.action.args.market).toBe(WethUsdsBlue.id);
    expect(tx.action.args.repayAssets).toBe(amount);
    expect(tx.action.args.repayShares).toBe(0n);
    expect(tx.action.args.transferAmount).toBe(amount);
    expect(tx.action.args.withdrawAmount).toBe(WITHDRAW_AMOUNT);
    expect(tx.action.args.nativeAmount).toBeUndefined();
    expect(tx.action.args.onBehalf).toBe(client.account.address);
    expect(tx.action.args.receiver).toBe(client.account.address);
    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
    expect(tx.data.toLowerCase()).not.toContain(MAX_UINT256_HEX);
  });

  test("behavior: repay by shares + withdraw collateral", async ({
    client,
  }) => {
    const shares = parseUnits("500", 6);
    const transferAmount = parseUnits("600", 6);

    const tx = blueRepayWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        shares,
        transferAmount,
        withdrawAmount: WITHDRAW_AMOUNT,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx.action.args.repayAssets).toBe(0n);
    expect(tx.action.args.repayShares).toBe(shares);
    expect(tx.action.args.transferAmount).toBe(transferAmount);
    expect(tx.action.args.withdrawAmount).toBe(WITHDRAW_AMOUNT);
    expect(tx.value).toBe(0n);
    expect(tx.data.toLowerCase()).toContain(MAX_UINT256_HEX);
  });

  test("behavior: assets mode adds nativeAmount to the repaid total (additive)", async ({
    client,
  }) => {
    const amount = parseUnits("0.3", 18);
    const nativeAmount = parseUnits("0.2", 18);

    const tx = blueRepayWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WstethWethBlue, // loanToken === wNative
      },
      args: {
        amount,
        nativeAmount,
        withdrawAmount: WITHDRAW_AMOUNT,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx.action.args.repayAssets).toBe(amount + nativeAmount);
    expect(tx.action.args.transferAmount).toBe(amount + nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.action.args.withdrawAmount).toBe(WITHDRAW_AMOUNT);
    expect(tx.value).toBe(nativeAmount);
    expect(tx.data.toLowerCase()).not.toContain(MAX_UINT256_HEX);
  });

  test("behavior: shares mode subtracts nativeAmount from transferAmount", async ({
    client,
  }) => {
    const shares = parseUnits("500", 18);
    const transferAmount = parseUnits("0.6", 18);
    const nativeAmount = parseUnits("0.2", 18);

    const spy = vi.spyOn(getRequirementsActionModule, "getRequirementsAction");

    const tx = blueRepayWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WstethWethBlue,
      },
      args: {
        shares,
        transferAmount,
        nativeAmount,
        withdrawAmount: WITHDRAW_AMOUNT,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
        requirementSignature: makePermit({
          owner: client.account.address,
          asset: WstethWethBlue.loanToken,
          amount: transferAmount - nativeAmount,
        }),
      },
    });

    expect(tx.action.args.repayShares).toBe(shares);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: WstethWethBlue.loanToken,
        amount: transferAmount - nativeAmount,
      }),
    );
    expect(tx.data.toLowerCase()).toContain(MAX_UINT256_HEX);
  });

  test("error: NonPositiveRepayMaxSharePriceError when maxSharePrice is zero", async ({
    client,
  }) => {
    expect(() =>
      blueRepayWithdrawCollateral({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: parseUnits("100", 6),
          withdrawAmount: WITHDRAW_AMOUNT,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 0n,
        },
      }),
    ).toThrow(NonPositiveRepayMaxSharePriceError);
  });

  test("error: MutuallyExclusiveRepayAmountsError when both amount and shares are provided", async ({
    client,
  }) => {
    expect(() =>
      blueRepayWithdrawCollateral({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: parseUnits("100", 6),
          shares: parseUnits("50", 6),
          transferAmount: parseUnits("100", 6),
          withdrawAmount: WITHDRAW_AMOUNT,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(MutuallyExclusiveRepayAmountsError);
  });

  test("error: NonPositiveRepayAmountError when the resolved amount is zero", async ({
    client,
  }) => {
    expect(() =>
      blueRepayWithdrawCollateral({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: 0n,
          withdrawAmount: WITHDRAW_AMOUNT,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("error: NonPositiveRepayAmountError when shares is negative", async ({
    client,
  }) => {
    expect(() =>
      blueRepayWithdrawCollateral({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          shares: -1n,
          transferAmount: parseUnits("100", 6),
          withdrawAmount: WITHDRAW_AMOUNT,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("error: NonPositiveWithdrawCollateralAmountError when withdrawAmount is zero", async ({
    client,
  }) => {
    expect(() =>
      blueRepayWithdrawCollateral({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: parseUnits("100", 6),
          withdrawAmount: 0n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveWithdrawCollateralAmountError);
  });

  test("error: NonPositiveTransferAmountError when transferAmount is zero", async ({
    client,
  }) => {
    expect(() =>
      blueRepayWithdrawCollateral({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          shares: parseUnits("100", 6),
          transferAmount: 0n,
          withdrawAmount: WITHDRAW_AMOUNT,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveTransferAmountError);
  });

  test("error: NativeAmountExceedsTransferAmountError when nativeAmount > transferAmount", async ({
    client,
  }) => {
    const transferAmount = parseUnits("0.6", 18);

    expect(() =>
      blueRepayWithdrawCollateral({
        market: { chainId: mainnet.id, marketParams: WstethWethBlue },
        args: {
          shares: parseUnits("500", 18),
          transferAmount,
          nativeAmount: transferAmount + 1n,
          withdrawAmount: WITHDRAW_AMOUNT,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NativeAmountExceedsTransferAmountError);
  });

  test("error: NegativeNativeAmountError when nativeAmount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueRepayWithdrawCollateral({
        market: { chainId: mainnet.id, marketParams: WstethWethBlue },
        args: {
          amount: parseUnits("1", 18),
          nativeAmount: -1n,
          withdrawAmount: WITHDRAW_AMOUNT,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NegativeNativeAmountError);
  });

  test("error: NativeAmountOnNonWNativeAssetError when loan token is not wNative", async ({
    client,
  }) => {
    expect(() =>
      blueRepayWithdrawCollateral({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: parseUnits("100", 6),
          nativeAmount: parseUnits("1", 18),
          withdrawAmount: WITHDRAW_AMOUNT,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NativeAmountOnNonWNativeAssetError);
  });

  test("behavior: no getRequirementsAction without a requirementSignature", async ({
    client,
  }) => {
    const spy = vi.spyOn(getRequirementsActionModule, "getRequirementsAction");

    blueRepayWithdrawCollateral({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount: parseUnits("100", 6),
        withdrawAmount: WITHDRAW_AMOUNT,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(spy).not.toHaveBeenCalled();
  });

  test("behavior: requirementSignature drives getRequirementsAction on the ERC-20 amount", async ({
    client,
  }) => {
    const amount = parseUnits("100", 6);
    const spy = vi.spyOn(getRequirementsActionModule, "getRequirementsAction");

    const tx = blueRepayWithdrawCollateral({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount,
        withdrawAmount: WITHDRAW_AMOUNT,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
        requirementSignature: makePermit({
          owner: client.account.address,
          asset: WethUsdsBlue.loanToken,
          amount,
        }),
      },
    });

    expect(tx.action.type).toBe("blueRepayWithdrawCollateral");
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: WethUsdsBlue.loanToken,
        amount,
      }),
    );
  });

  test("behavior: returns a deep-frozen transaction object", async ({
    client,
  }) => {
    const tx = blueRepayWithdrawCollateral({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount: parseUnits("100", 6),
        withdrawAmount: WITHDRAW_AMOUNT,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });

  test("behavior: appends metadata to transaction data when provided", async ({
    client,
  }) => {
    const txWith = blueRepayWithdrawCollateral({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount: parseUnits("100", 6),
        withdrawAmount: WITHDRAW_AMOUNT,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.data.includes("a1b2c3d4")).toBe(true);
    expect(txWith.action.type).toBe("blueRepayWithdrawCollateral");
  });
});
