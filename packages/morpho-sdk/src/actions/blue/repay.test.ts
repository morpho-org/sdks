import { getChainAddresses } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, vi } from "vitest";
import { WethUsdsBlue, WstethWethBlue } from "../../../test/fixtures/blue.js";
import { test } from "../../../test/setup.js";
import {
  MutuallyExclusiveRepayAmountsError,
  NativeAmountExceedsTransferAmountError,
  NativeAmountOnNonWNativeAssetError,
  NegativeNativeAmountError,
  NonPositiveRepayAmountError,
  NonPositiveRepayMaxSharePriceError,
  NonPositiveTransferAmountError,
  type RequirementSignature,
} from "../../types/index.js";
import * as getRequirementsActionModule from "../requirements/getRequirementsAction.js";
import { blueRepay } from "./repay.js";

const MAX_UINT256_HEX = "f".repeat(64);

describe("blueRepay unit tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const {
    bundler3: { bundler3 },
  } = getChainAddresses(mainnet.id);

  test("default", async ({ client }) => {
    const amount = parseUnits("1000", 6);

    const tx = blueRepay({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("blueRepay");
    expect(tx.action.args.market).toBe(WethUsdsBlue.id);
    expect(tx.action.args.assets).toBe(amount);
    expect(tx.action.args.shares).toBe(0n);
    expect(tx.action.args.transferAmount).toBe(amount);
    expect(tx.action.args.nativeAmount).toBeUndefined();
    expect(tx.action.args.onBehalf).toBe(client.account.address);
    expect(tx.action.args.receiver).toBe(client.account.address);
    expect(tx.to).toBe(bundler3);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
    // Assets mode is exact: no residual skim.
    expect(tx.data.toLowerCase()).not.toContain(MAX_UINT256_HEX);
  });

  test("behavior: repay by shares", async ({ client }) => {
    const shares = parseUnits("500", 6);
    const transferAmount = parseUnits("600", 6);

    const tx = blueRepay({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        shares,
        transferAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx.action.type).toBe("blueRepay");
    expect(tx.action.args.assets).toBe(0n);
    expect(tx.action.args.shares).toBe(shares);
    expect(tx.action.args.transferAmount).toBe(transferAmount);
    expect(tx.action.args.nativeAmount).toBeUndefined();
    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
    // Shares mode skims residual back to the receiver.
    expect(tx.data.toLowerCase()).toContain(MAX_UINT256_HEX);
  });

  test("behavior: assets mode adds nativeAmount to the repaid total (additive)", async ({
    client,
  }) => {
    const amount = parseUnits("0.3", 18);
    const nativeAmount = parseUnits("0.2", 18);

    const tx = blueRepay({
      market: {
        chainId: mainnet.id,
        marketParams: WstethWethBlue, // loanToken === wNative (WETH)
      },
      args: {
        amount,
        nativeAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    // Repaid assets = amount + nativeAmount; ERC-20 pulled = amount.
    expect(tx.action.args.assets).toBe(amount + nativeAmount);
    expect(tx.action.args.shares).toBe(0n);
    expect(tx.action.args.transferAmount).toBe(amount + nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
    // Assets mode never skims.
    expect(tx.data.toLowerCase()).not.toContain(MAX_UINT256_HEX);
  });

  test("behavior: fully native repay pulls no ERC-20", async ({ client }) => {
    const nativeAmount = parseUnits("1", 18);

    const tx = blueRepay({
      market: {
        chainId: mainnet.id,
        marketParams: WstethWethBlue,
      },
      args: {
        nativeAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx.action.args.assets).toBe(nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
  });

  test("behavior: shares mode subtracts nativeAmount from transferAmount", async ({
    client,
  }) => {
    const shares = parseUnits("500", 18);
    const transferAmount = parseUnits("0.6", 18);
    const nativeAmount = parseUnits("0.2", 18);

    const spy = vi.spyOn(getRequirementsActionModule, "getRequirementsAction");

    const tx = blueRepay({
      market: {
        chainId: mainnet.id,
        marketParams: WstethWethBlue,
      },
      args: {
        shares,
        transferAmount,
        nativeAmount,
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

    expect(tx.action.args.shares).toBe(shares);
    expect(tx.action.args.transferAmount).toBe(transferAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
    // ERC-20 pulled = transferAmount − nativeAmount.
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: WstethWethBlue.loanToken,
        amount: transferAmount - nativeAmount,
      }),
    );
    // Shares mode still skims residual.
    expect(tx.data.toLowerCase()).toContain(MAX_UINT256_HEX);
  });

  test("behavior: shares mode fully funded by native pulls no ERC-20", async ({
    client,
  }) => {
    const shares = parseUnits("500", 18);
    const transferAmount = parseUnits("0.6", 18);

    const spy = vi.spyOn(getRequirementsActionModule, "getRequirementsAction");

    const tx = blueRepay({
      market: {
        chainId: mainnet.id,
        marketParams: WstethWethBlue,
      },
      args: {
        shares,
        transferAmount,
        nativeAmount: transferAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx.value).toBe(transferAmount);
    expect(spy).not.toHaveBeenCalled();
    expect(tx.data.toLowerCase()).toContain(MAX_UINT256_HEX);
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

  test("error: MutuallyExclusiveRepayAmountsError when both amount and shares are provided", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: parseUnits("100", 6),
          shares: parseUnits("50", 6),
          transferAmount: parseUnits("100", 6),
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
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: 0n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("error: NonPositiveRepayAmountError when amount is negative", async ({
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
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("error: NonPositiveRepayAmountError when shares is negative", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          shares: -1n,
          transferAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("error: NonPositiveTransferAmountError when transferAmount is zero", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          shares: parseUnits("100", 6),
          transferAmount: 0n,
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
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WstethWethBlue },
        args: {
          shares: parseUnits("500", 18),
          transferAmount,
          nativeAmount: transferAmount + 1n,
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
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue }, // loanToken = USDS
        args: {
          amount: parseUnits("100", 6),
          nativeAmount: parseUnits("1", 18),
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

    blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount: parseUnits("100", 6),
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

    const tx = blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount,
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

    expect(tx.action.type).toBe("blueRepay");
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
    const amount = parseUnits("100", 6);

    const txWith = blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.data.includes("a1b2c3d4")).toBe(true);
    expect(txWith.action.type).toBe("blueRepay");
  });
});

function makePermit({
  owner,
  asset,
  amount,
}: {
  owner: `0x${string}`;
  asset: `0x${string}`;
  amount: bigint;
}): RequirementSignature {
  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(mainnet.id);
  const signature = `0x${"11".repeat(64)}1b` as `0x${string}`;
  return {
    args: {
      owner,
      signature,
      deadline: 1n,
      amount,
      asset,
      nonce: 0n,
    },
    action: {
      type: "permit",
      args: {
        spender: generalAdapter1,
        amount,
        deadline: 1n,
      },
    },
  } satisfies RequirementSignature;
}
