import { getChainAddresses } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, vi } from "vitest";
import { WethUsdsBlue } from "../../../test/fixtures/blue.js";
import { test } from "../../../test/setup.js";
import {
  MutuallyExclusiveRepayAmountsError,
  NonPositiveRepayAmountError,
  NonPositiveRepayMaxSharePriceError,
  NonPositiveTransferAmountError,
  NonPositiveWithdrawCollateralAmountError,
  type RequirementSignature,
  TransferAmountNotEqualToAssetsError,
} from "../../types/index.js";
import * as getRequirementsActionModule from "../requirements/getRequirementsAction.js";
import { blueRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";

describe("blueRepayWithdrawCollateral unit tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const {
    bundler3: { bundler3 },
  } = getChainAddresses(mainnet.id);

  test("should create repay-by-assets + withdraw collateral transaction", async ({
    client,
  }) => {
    const assets = parseUnits("1000", 6);
    const withdrawAmount = parseUnits("1", 18);

    const tx = blueRepayWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        assets,
        shares: 0n,
        transferAmount: assets,
        withdrawAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("blueRepayWithdrawCollateral");
    expect(tx.action.args.market).toBe(WethUsdsBlue.id);
    expect(tx.action.args.repayAssets).toBe(assets);
    expect(tx.action.args.repayShares).toBe(0n);
    expect(tx.action.args.transferAmount).toBe(assets);
    expect(tx.action.args.withdrawAmount).toBe(withdrawAmount);
    expect(tx.action.args.onBehalf).toBe(client.account.address);
    expect(tx.action.args.receiver).toBe(client.account.address);
    expect(tx.to).toBe(bundler3);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should create repay-by-shares + withdraw collateral transaction", async ({
    client,
  }) => {
    const shares = parseUnits("500", 6);
    const transferAmount = parseUnits("600", 6);
    const withdrawAmount = parseUnits("1", 18);

    const tx = blueRepayWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        assets: 0n,
        shares,
        transferAmount,
        withdrawAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("blueRepayWithdrawCollateral");
    expect(tx.action.args.repayAssets).toBe(0n);
    expect(tx.action.args.repayShares).toBe(shares);
    expect(tx.action.args.transferAmount).toBe(transferAmount);
    expect(tx.action.args.withdrawAmount).toBe(withdrawAmount);
    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
  });

  test("should include erc20Transfer skim (maxUint256) in by-shares bundle but not in by-assets bundle", async ({
    client,
  }) => {
    const withdrawAmount = parseUnits("1", 18);

    const sharesTx = blueRepayWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        assets: 0n,
        shares: parseUnits("500", 6),
        transferAmount: parseUnits("600", 6),
        withdrawAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    const assetsTx = blueRepayWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        assets: parseUnits("500", 6),
        shares: 0n,
        transferAmount: parseUnits("500", 6),
        withdrawAmount,
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
      blueRepayWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          assets: parseUnits("100", 6),
          shares: 0n,
          transferAmount: parseUnits("100", 6),
          withdrawAmount: parseUnits("1", 18),
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
      blueRepayWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          assets: parseUnits("100", 6),
          shares: 0n,
          transferAmount: parseUnits("100", 6),
          withdrawAmount: parseUnits("1", 18),
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
      blueRepayWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          assets: parseUnits("100", 6),
          shares: parseUnits("50", 6),
          transferAmount: parseUnits("100", 6),
          withdrawAmount: parseUnits("1", 18),
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
      blueRepayWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          assets: 0n,
          shares: 0n,
          transferAmount: parseUnits("100", 6),
          withdrawAmount: parseUnits("1", 18),
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
      blueRepayWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          assets: -1n,
          shares: 0n,
          transferAmount: parseUnits("100", 6),
          withdrawAmount: parseUnits("1", 18),
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
      blueRepayWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          assets: 0n,
          shares: -1n,
          transferAmount: parseUnits("100", 6),
          withdrawAmount: parseUnits("1", 18),
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("should throw NonPositiveWithdrawCollateralAmountError when withdrawAmount is zero", async ({
    client,
  }) => {
    expect(() =>
      blueRepayWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          assets: parseUnits("100", 6),
          shares: 0n,
          transferAmount: parseUnits("100", 6),
          withdrawAmount: 0n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveWithdrawCollateralAmountError);
  });

  test("should throw NonPositiveWithdrawCollateralAmountError when withdrawAmount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueRepayWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          assets: parseUnits("100", 6),
          shares: 0n,
          transferAmount: parseUnits("100", 6),
          withdrawAmount: -1n,
          onBehalf: client.account.address,
          receiver: client.account.address,
          maxSharePrice: 1n,
        },
      }),
    ).toThrow(NonPositiveWithdrawCollateralAmountError);
  });

  test("should throw NonPositiveTransferAmountError when transferAmount is zero", async ({
    client,
  }) => {
    expect(() =>
      blueRepayWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          assets: 0n,
          shares: parseUnits("100", 6),
          transferAmount: 0n,
          withdrawAmount: parseUnits("1", 18),
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
      blueRepayWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          assets: 0n,
          shares: parseUnits("100", 6),
          transferAmount: -1n,
          withdrawAmount: parseUnits("1", 18),
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
      blueRepayWithdrawCollateral({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          assets,
          shares: 0n,
          transferAmount,
          withdrawAmount: parseUnits("1", 18),
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

    blueRepayWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
        transferAmount: parseUnits("100", 6),
        withdrawAmount: parseUnits("1", 18),
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
      },
    });

    expect(localSpy).not.toHaveBeenCalled();
  });

  test("should include requirement actions when requirementSignature is provided", async ({
    client,
  }) => {
    const assets = parseUnits("100", 6);
    const withdrawAmount = parseUnits("1", 18);
    const signature = `0x${"11".repeat(64)}1b` as `0x${string}`;
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(mainnet.id);
    const requirementSignature = {
      args: {
        owner: client.account.address,
        signature,
        deadline: 1n,
        amount: assets,
        asset: WethUsdsBlue.loanToken,
        nonce: 0n,
      },
      action: {
        type: "permit",
        args: {
          spender: generalAdapter1,
          amount: assets,
          deadline: 1n,
        },
      },
    } satisfies RequirementSignature;
    const localSpy = vi.spyOn(
      getRequirementsActionModule,
      "getRequirementsAction",
    );

    const tx = blueRepayWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        assets,
        shares: 0n,
        transferAmount: assets,
        withdrawAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice: 1n,
        requirementSignature,
      },
    });

    expect(tx.action.type).toBe("blueRepayWithdrawCollateral");
    expect(localSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: WethUsdsBlue.loanToken,
        amount: assets,
      }),
    );
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = blueRepayWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
        transferAmount: parseUnits("100", 6),
        withdrawAmount: parseUnits("1", 18),
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

    const txWith = blueRepayWithdrawCollateral({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        assets,
        shares: 0n,
        transferAmount: assets,
        withdrawAmount: parseUnits("1", 18),
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
