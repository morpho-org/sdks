import { AccrualVaultV2, MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  IN_KIND_ADAPTER,
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindMarketParams,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { withMidnightAdapter } from "../../../test/fixtures/vaultV2Midnight.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  previewVaultV2ForceWithdraw,
  previewVaultV2InKindRedeem,
} from "../../helpers/index.js";
import {
  InputExceedsMaxError,
  VaultV2SingleAdapterRequiredError,
  VaultV2UnsupportedExitAdapterError,
} from "../../types/index.js";

const vaultFor = () =>
  createMockClient(mainnet)
    .client.extend(morphoViemExtension())
    .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);

describe("MorphoVaultV2 with a Midnight adapter", () => {
  test("default: deposit builds when the Midnight adapter is not the liquidity adapter", () => {
    const tx = vaultFor()
      .deposit({
        amount: 100n,
        userAddress: IN_KIND_USER,
        vaultData: withMidnightAdapter(inKindVaultV2Data()),
      })
      .buildTx();

    expect(tx.to).toBe(getChainAddress(mainnet.id, "bundles.vaultBundlesV1"));
  });

  test("error: InputExceedsMaxError for a deposit through a Midnight liquidity adapter", () => {
    expect(() =>
      vaultFor().deposit({
        amount: 100n,
        userAddress: IN_KIND_USER,
        vaultData: withMidnightAdapter(inKindVaultV2Data(), {
          liquidity: true,
        }),
      }),
    ).toThrow(
      expect.objectContaining({
        constructor: InputExceedsMaxError,
        field: "amount",
        value: 100n,
        max: 0n,
      }),
    );
  });

  test("error: InputExceedsMaxError tags nativeAmount for a native deposit through a Midnight liquidity adapter", () => {
    const midnightVault = withMidnightAdapter(inKindVaultV2Data(), {
      liquidity: true,
    });
    const vaultData = new AccrualVaultV2(
      { ...midnightVault, asset: getChainAddress(mainnet.id, "wNative") },
      midnightVault.accrualLiquidityAdapter,
      midnightVault.accrualAdapters,
      midnightVault.assetBalance,
      midnightVault.forceDeallocatePenalties,
    );

    expect(() =>
      vaultFor().deposit({
        nativeAmount: 100n,
        userAddress: IN_KIND_USER,
        vaultData,
      }),
    ).toThrow(
      expect.objectContaining({
        constructor: InputExceedsMaxError,
        field: "nativeAmount",
        value: 100n,
        max: 0n,
      }),
    );
  });

  test("behavior: withdraw within idle assets builds through a Midnight liquidity adapter", () => {
    const tx = vaultFor()
      .withdraw({
        amount: 50n,
        userAddress: IN_KIND_USER,
        vaultData: withMidnightAdapter(
          inKindVaultV2Data({ assetBalance: 50n }),
          {
            liquidity: true,
          },
        ),
      })
      .buildTx();

    expect(tx.to).toBe(getChainAddress(mainnet.id, "bundles.vaultBundlesV1"));
  });

  test("behavior: withdraw beyond idle assets builds when Blue is the liquidity adapter", () => {
    const vaultData = withMidnightAdapter(
      inKindVaultV2Data({
        assetBalance: 50n,
        liquidityAdapter: "sole",
      }),
    );
    expect(vaultData.liquidityAdapter).toBe(IN_KIND_ADAPTER);

    const tx = vaultFor()
      .withdraw({
        amount: 51n,
        userAddress: IN_KIND_USER,
        vaultData,
      })
      .buildTx();

    expect(tx.to).toBe(getChainAddress(mainnet.id, "bundles.vaultBundlesV1"));
  });

  test("error: InputExceedsMaxError for a withdraw beyond idle assets through a Midnight liquidity adapter", () => {
    expect(() =>
      vaultFor().withdraw({
        amount: 51n,
        userAddress: IN_KIND_USER,
        vaultData: withMidnightAdapter(
          inKindVaultV2Data({ assetBalance: 50n }),
          {
            liquidity: true,
          },
        ),
      }),
    ).toThrow(
      expect.objectContaining({
        constructor: InputExceedsMaxError,
        field: "amount",
        value: 51n,
        max: 50n,
      }),
    );
  });

  test("error: InputExceedsMaxError from redeem requirements beyond idle assets through a Midnight liquidity adapter", async () => {
    const vault = vaultFor();
    const vaultData = withMidnightAdapter(
      inKindVaultV2Data({ assetBalance: 50n }),
      { liquidity: true },
    );
    vi.spyOn(vault, "getData").mockResolvedValue(vaultData);
    const shares = vaultData.toShares(51n, "Up");

    await expect(
      vault.redeem({ shares, userAddress: IN_KIND_USER }).getRequirements(),
    ).rejects.toMatchObject({
      constructor: InputExceedsMaxError,
      field: "shares",
      value: shares,
      max: vaultData.toShares(50n),
    });
  });

  test("behavior: redeem requirements allow shares worth more than idle assets when Blue is the liquidity adapter", async () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const vaultData = withMidnightAdapter(
      inKindVaultV2Data({
        assetBalance: 50n,
        liquidityAdapter: "sole",
      }),
    );
    const shares = vaultData.toShares(51n, "Up");
    expect(vaultData.liquidityAdapter).toBe(IN_KIND_ADAPTER);
    expect(vaultData.toAssets(shares)).toBeGreaterThan(vaultData.assetBalance);
    vi.spyOn(vault, "getData").mockResolvedValue(vaultData);
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: shares,
    });

    await expect(
      vault.redeem({ shares, userAddress: IN_KIND_USER }).getRequirements(),
    ).resolves.toEqual([]);
  });

  test("behavior: redeem requirements accept shares worth exactly the idle assets and reject 1 wei more through a Midnight liquidity adapter", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // The clock is frozen at the snapshot's `lastUpdate`, so accrual leaves the share price unchanged.
      const shares = 49n;
      const exactIdle = inKindVaultV2Data().toAssets(shares);
      const handle = createMockClient(mainnet);
      const vault = handle.client
        .extend(morphoViemExtension())
        .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
        result: shares,
      });
      const redeemWithIdle = (assetBalance: bigint) => {
        const vaultData = withMidnightAdapter(
          inKindVaultV2Data({ assetBalance }),
          { liquidity: true },
        );
        vi.spyOn(vault, "getData").mockResolvedValue(vaultData);
        return vault
          .redeem({ shares, userAddress: IN_KIND_USER })
          .getRequirements();
      };

      await expect(redeemWithIdle(exactIdle)).resolves.toEqual([]);
      await expect(redeemWithIdle(exactIdle - 1n)).rejects.toMatchObject({
        constructor: InputExceedsMaxError,
        field: "shares",
        value: shares,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("error: redeem requirements compare idle assets after accruing interest through a Midnight liquidity adapter", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const base = inKindVaultV2Data({ assetBalance: 50n });
      const stale = new AccrualVaultV2(
        {
          ...base,
          _totalAssets: base._totalAssets / 2n,
          lastUpdate: base.lastUpdate - Time.s.from.y(2n),
          maxRate: MathLib.WAD / Time.s.from.y(1n),
        },
        base.accrualLiquidityAdapter,
        base.accrualAdapters,
        base.assetBalance,
        base.forceDeallocatePenalties,
      );
      const vaultData = withMidnightAdapter(stale, { liquidity: true });
      const { vault: accrued } = vaultData.accrueInterest(Time.timestamp());
      const vault = vaultFor();
      vi.spyOn(vault, "getData").mockResolvedValue(vaultData);
      const shares = vaultData.toShares(50n);

      expect(vaultData.toAssets(shares)).toBeLessThanOrEqual(50n);
      expect(accrued.toAssets(shares)).toBeGreaterThan(50n);
      await expect(
        vault.redeem({ shares, userAddress: IN_KIND_USER }).getRequirements(),
      ).rejects.toMatchObject({
        constructor: InputExceedsMaxError,
        field: "shares",
        value: shares,
        max: accrued.toShares(accrued.assetBalance),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test.each([
    {
      label: "a vault mixing Blue and Midnight adapters",
      sole: false,
      error: VaultV2SingleAdapterRequiredError,
    },
    {
      label: "a sole Midnight adapter",
      sole: true,
      error: VaultV2UnsupportedExitAdapterError,
    },
  ])("error: $error.name from exits on $label", ({ sole, error }) => {
    const vaultData = withMidnightAdapter(
      inKindVaultV2Data({ assetBalance: 50n }),
      { sole },
    );
    const vault = vaultFor();

    expect(() =>
      vault.inKindRedeem({
        amount: 100n,
        marketParamsList: [inKindMarketParams],
        vaultData,
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(error);
    expect(() =>
      vault.forceWithdraw({
        exitAssets: 100n,
        vaultData,
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(error);
    expect(
      previewVaultV2InKindRedeem(vaultData, {
        requestedExitAssets: 100n,
        timestamp: vaultData.lastUpdate,
      }),
    ).toEqual([]);
    expect(
      previewVaultV2ForceWithdraw(vaultData, {
        requestedExitAssets: 100n,
        timestamp: vaultData.lastUpdate,
      }),
    ).toBeUndefined();
  });
});
