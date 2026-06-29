import { getChainAddresses } from "@morpho-org/blue-sdk";
import { parseUnits, toFunctionSelector } from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, vi } from "vitest";
import { WethUsdsBlue, WstethWethBlue } from "../../../test/fixtures/blue.js";
import { test } from "../../../test/setup.js";
import {
  NativeAmountOnNonWNativeAssetError,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  NonPositiveRepayAmountError,
  NonPositiveRepayMaxSharePriceError,
  NonPositiveTransferAmountError,
  type RequirementSignature,
} from "../../types/index.js";
import * as getRequirementsActionModule from "../requirements/getRequirementsAction.js";
import { blueRepay } from "./repay.js";

describe("blueRepay unit tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const {
    bundler3: { bundler3 },
  } = getChainAddresses(mainnet.id);

  // WstethWethBlue's loan token is WETH (the mainnet wNative), so repays on it
  // can be funded by wrapping native ETH. WethUsdsBlue's loan token is USDS,
  // used to exercise the non-wNative rejection.

  // GeneralAdapter1 call selectors, used to assert which funding path the
  // bundle actually encodes (without decoding the whole bundler3 multicall).
  const wrapNativeSelector = toFunctionSelector(
    "wrapNative(uint256,address)",
  ).slice(2);
  const erc20TransferFromSelector = toFunctionSelector(
    "erc20TransferFrom(address,address,uint256)",
  ).slice(2);
  const maxUint256Hex = "f".repeat(64);

  test("default: repay by assets (ERC-20 only)", async ({ client }) => {
    const amount = parseUnits("1000", 6);

    const tx = blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx.action.type).toBe("blueRepay");
    expect(tx.action.args.market).toBe(WethUsdsBlue.id);
    expect(tx.action.args.assets).toBe(amount);
    expect(tx.action.args.shares).toBe(0n);
    expect(tx.action.args.transferAmount).toBe(amount);
    expect(tx.action.args.nativeAmount).toBeUndefined();
    expect(tx.action.args.onBehalf).toBe(client.account.address);
    expect(tx.action.args.receiver).toBe(client.account.address);
    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
  });

  test("behavior: repay by shares uses amount as the upper-bound transfer", async ({
    client,
  }) => {
    const shares = parseUnits("500", 6);
    const amount = parseUnits("600", 6);

    const tx = blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount,
        shares,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx.action.args.assets).toBe(0n);
    expect(tx.action.args.shares).toBe(shares);
    expect(tx.action.args.transferAmount).toBe(amount);
    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
  });

  test("behavior: shares mode skims residual (maxUint256), assets mode does not", async ({
    client,
  }) => {
    const sharesTx = blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount: parseUnits("600", 6),
        shares: parseUnits("500", 6),
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    const assetsTx = blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount: parseUnits("500", 6),
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(sharesTx.data.toLowerCase()).toContain(maxUint256Hex);
    expect(assetsTx.data.toLowerCase()).not.toContain(maxUint256Hex);
  });

  test("error: NonPositiveRepayMaxSharePriceError when maxSharePrice is zero", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 0n,
        },
      }),
    ).toThrow(NonPositiveRepayMaxSharePriceError);
  });

  test("error: NonPositiveRepayMaxSharePriceError when maxSharePrice is negative", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: -1n,
        },
      }),
    ).toThrow(NonPositiveRepayMaxSharePriceError);
  });

  test("error: NonPositiveAssetAmountError when amount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: -1n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveAssetAmountError);
  });

  test("error: NonPositiveRepayAmountError when shares is negative", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: parseUnits("100", 6),
          shares: -1n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("error: NonPositiveTransferAmountError when no funding is provided", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: 0n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveTransferAmountError);
  });

  test("error: NonPositiveTransferAmountError in shares mode without funding", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: 0n,
          shares: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveTransferAmountError);
  });

  test("behavior: no requirement actions without a requirementSignature", async ({
    client,
  }) => {
    const localSpy = vi.spyOn(
      getRequirementsActionModule,
      "getRequirementsAction",
    );

    blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount: parseUnits("100", 6),
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(localSpy).not.toHaveBeenCalled();
  });

  test("behavior: requirement actions cover the ERC-20 amount when signed", async ({
    client,
  }) => {
    const amount = parseUnits("100", 6);
    const signature = `0x${"11".repeat(64)}1b` as `0x${string}`;
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(mainnet.id);
    const requirementSignature = {
      args: {
        owner: client.account.address,
        signature,
        deadline: 1n,
        amount,
        asset: WethUsdsBlue.loanToken,
        nonce: 0n,
      },
      action: {
        type: "permit",
        args: { spender: generalAdapter1, amount, deadline: 1n },
      },
    } satisfies RequirementSignature;
    const localSpy = vi.spyOn(
      getRequirementsActionModule,
      "getRequirementsAction",
    );

    const tx = blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
        requirementSignature,
      },
    });

    expect(tx.action.type).toBe("blueRepay");
    expect(localSpy).toHaveBeenCalledWith(
      expect.objectContaining({ asset: WethUsdsBlue.loanToken, amount }),
    );
  });

  test("behavior: returns a deep-frozen transaction object", async ({
    client,
  }) => {
    const tx = blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount: parseUnits("100", 6),
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
    const tx = blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount: parseUnits("100", 6),
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.data.includes("a1b2c3d4")).toBe(true);
    expect(tx.action.type).toBe("blueRepay");
  });

  test("behavior: fully native funding wraps and pulls no ERC-20", async ({
    client,
  }) => {
    const nativeAmount = parseUnits("1", 18);

    const localSpy = vi.spyOn(
      getRequirementsActionModule,
      "getRequirementsAction",
    );

    const tx = blueRepay({
      market: { chainId: mainnet.id, marketParams: WstethWethBlue },
      args: {
        nativeAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx.action.args.assets).toBe(nativeAmount);
    expect(tx.action.args.transferAmount).toBe(nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    // tx.value is derived from the nativeTransfer call by encodeBundle.
    expect(tx.value).toBe(nativeAmount);
    expect(tx.to).toBe(bundler3);
    // The bundle wraps native and pulls NO ERC-20.
    const data = tx.data.toLowerCase();
    expect(data).toContain(wrapNativeSelector);
    expect(data).not.toContain(erc20TransferFromSelector);
    expect(localSpy).not.toHaveBeenCalled();
  });

  test("behavior: mixed funding wraps native and pulls the ERC-20 amount", async ({
    client,
  }) => {
    const amount = parseUnits("0.6", 18);
    const nativeAmount = parseUnits("0.4", 18);

    const tx = blueRepay({
      market: { chainId: mainnet.id, marketParams: WstethWethBlue },
      args: {
        amount,
        nativeAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    // transferAmount = amount + nativeAmount.
    expect(tx.action.args.transferAmount).toBe(amount + nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    // Only the native portion carries value; the rest is pulled via ERC-20.
    expect(tx.value).toBe(nativeAmount);
    const data = tx.data.toLowerCase();
    expect(data).toContain(wrapNativeSelector);
    expect(data).toContain(erc20TransferFromSelector);
  });

  test("behavior: shares mode keeps the skim when funded by native", async ({
    client,
  }) => {
    const shares = parseUnits("500", 6);
    const nativeAmount = parseUnits("0.6", 18);

    const tx = blueRepay({
      market: { chainId: mainnet.id, marketParams: WstethWethBlue },
      args: {
        nativeAmount,
        shares,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx.value).toBe(nativeAmount);
    expect(tx.data.toLowerCase()).toContain(maxUint256Hex);
  });

  test("error: NegativeNativeAmountError when nativeAmount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WstethWethBlue },
        args: {
          amount: parseUnits("1", 18),
          nativeAmount: -1n,
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
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          nativeAmount: parseUnits("1000", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NativeAmountOnNonWNativeAssetError);
  });
});
