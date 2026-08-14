import { getChainAddresses } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, vi } from "vitest";
import { blueRepay } from "../../../../src/actions/blue/repay.js";
import * as getTokenRequirementActionsModule from "../../../../src/actions/signatures/getTokenRequirementActions.js";
import {
  MutuallyExclusiveRepayAmountsError,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
  TransferAmountNotEqualToAssetsError,
} from "../../../../src/types/index.js";
import { WethUsdsBlue, WstethWethBlue } from "../../../fixtures/blue.js";
import { makePermit } from "../../../helpers/permit.js";
import { test } from "../../../setup.js";

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
        transferAmount: amount,
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
        transferAmount: amount + nativeAmount,
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
        transferAmount: nativeAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx.action.args.assets).toBe(nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
  });

  test("behavior: shares mode pulls exactly transferAmount ERC-20 (net of native)", async ({
    client,
  }) => {
    const shares = parseUnits("500", 18);
    const erc20Amount = parseUnits("0.4", 18); // transferAmount = ERC-20 net of native
    const nativeAmount = parseUnits("0.2", 18);

    const spy = vi.spyOn(
      getTokenRequirementActionsModule,
      "getTokenRequirementActions",
    );

    const tx = blueRepay({
      market: {
        chainId: mainnet.id,
        marketParams: WstethWethBlue,
      },
      args: {
        shares,
        transferAmount: erc20Amount,
        nativeAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
        requirementSignature: makePermit({
          owner: client.account.address,
          asset: WstethWethBlue.loanToken,
          amount: erc20Amount,
        }),
      },
    });

    expect(tx.action.args.shares).toBe(shares);
    // Output transferAmount = ERC-20 pulled + native wrapped (total routed to adapter).
    expect(tx.action.args.transferAmount).toBe(erc20Amount + nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
    // ERC-20 pulled = transferAmount (already net of native).
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: WstethWethBlue.loanToken,
        amount: erc20Amount,
      }),
    );
    // Shares mode still skims residual.
    expect(tx.data.toLowerCase()).toContain(MAX_UINT256_HEX);
  });

  test("behavior: shares mode fully funded by native pulls no ERC-20", async ({
    client,
  }) => {
    const shares = parseUnits("500", 18);
    const nativeAmount = parseUnits("0.6", 18);

    const spy = vi.spyOn(
      getTokenRequirementActionsModule,
      "getTokenRequirementActions",
    );

    const tx = blueRepay({
      market: {
        chainId: mainnet.id,
        marketParams: WstethWethBlue,
      },
      args: {
        shares,
        transferAmount: 0n, // fully funded by native
        nativeAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx.value).toBe(nativeAmount);
    expect(spy).not.toHaveBeenCalled();
    expect(tx.data.toLowerCase()).toContain(MAX_UINT256_HEX);
  });

  test("error: NonPositiveInputError when maxSharePrice is zero", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: parseUnits("100", 6),
          transferAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 0n,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NonPositiveInputError when maxSharePrice is negative", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: parseUnits("100", 6),
          transferAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: -1n,
        },
      }),
    ).toThrow(NonPositiveInputError);
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

  test("error: NonPositiveInputError when the resolved amount is zero", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: 0n,
          transferAmount: 0n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NegativeInputError when amount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: -1n,
          transferAmount: parseUnits("100", 6),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: NegativeInputError when shares is negative", async ({
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
    ).toThrow(NegativeInputError);
  });

  test("error: NegativeInputError when shares mode transferAmount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          shares: parseUnits("100", 6),
          transferAmount: -1n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: TransferAmountNotEqualToAssetsError when assets-mode transferAmount != amount + nativeAmount", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: parseUnits("100", 6),
          transferAmount: parseUnits("150", 6), // != amount + nativeAmount (100 + 0)
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(TransferAmountNotEqualToAssetsError);
  });

  test("error: NonPositiveInputError when shares mode has no funding", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          shares: parseUnits("100", 6),
          transferAmount: 0n, // no ERC-20 and no native → unfunded
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NegativeInputError when nativeAmount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueRepay({
        market: { chainId: mainnet.id, marketParams: WstethWethBlue },
        args: {
          amount: parseUnits("1", 18),
          nativeAmount: -1n,
          transferAmount: parseUnits("1", 18),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NegativeInputError);
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
          transferAmount: parseUnits("100", 6) + parseUnits("1", 18),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NativeAmountOnNonWNativeAssetError);
  });

  test("behavior: ERC-20 pull routes through getTokenRequirementActions with no signature", async ({
    client,
  }) => {
    const amount = parseUnits("100", 6);
    const spy = vi.spyOn(
      getTokenRequirementActionsModule,
      "getTokenRequirementActions",
    );

    blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount,
        transferAmount: amount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    // The funding helper is the single ERC-20 entry point. Without a signature it is still the
    // one that runs (invoked with `requirementSignature: undefined`), so it emits a plain
    // erc20TransferFrom — proven end-to-end by the fork round-trips — rather than permit machinery.
    expect(spy).toHaveBeenCalledTimes(1);
    const fundingArgs = spy.mock.calls[0]?.[0];
    expect(fundingArgs).toMatchObject({
      asset: WethUsdsBlue.loanToken,
      amount,
    });
    expect(fundingArgs?.requirementSignature).toBeUndefined();
  });

  test("behavior: requirementSignature drives getTokenRequirementActions on the ERC-20 amount", async ({
    client,
  }) => {
    const amount = parseUnits("100", 6);
    const spy = vi.spyOn(
      getTokenRequirementActionsModule,
      "getTokenRequirementActions",
    );

    const tx = blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount,
        transferAmount: amount,
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

  test("behavior: appends metadata to transaction data when provided", async ({
    client,
  }) => {
    const amount = parseUnits("100", 6);

    const txWith = blueRepay({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount,
        transferAmount: amount,
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
