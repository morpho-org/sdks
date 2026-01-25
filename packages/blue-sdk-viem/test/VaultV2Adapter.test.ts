import {
  AccrualVaultV2,
  CapacityLimitReason,
  MarketParams,
  MathLib,
  VaultV2MorphoMarketV1Adapter,
  VaultV2MorphoMarketV1AdapterV2,
  VaultV2MorphoVaultV1Adapter,
  addressesRegistry,
} from "@morpho-org/blue-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  encodeAbiParameters,
  encodeFunctionData,
  parseEther,
  parseUnits,
  zeroAddress,
} from "viem";
import { readContract } from "viem/actions";
import { describe, expect } from "vitest";
import { fetchAccrualVaultV2, fetchVaultV2Adapter, vaultV2Abi } from "../src";
import { vaultV2Test } from "./setup";
import { deployMorphoMarketV1Adapter, deployVaultV2 } from "./utils";

// VaultV2 with liquidity adapter vaultV1
const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
const vaultV2AdapterVaultV1Address =
  "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F";
const allocator = "0xc0267A5Fa9aaaf1694283c013CBFA925BCdb5dE8";
const curator = "0xc0267A5Fa9aaaf1694283c013CBFA925BCdb5dE8";

// VaultV2 with liquidity adapter marketV1
const vaultV2ClearstarEurc = "0x4C7b69b4a82e9E5D8ec60E96516f7A0E17CBC55C";

const expectedDataVaultV1Adapter = new VaultV2MorphoVaultV1Adapter({
  morphoVaultV1: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
  address: vaultV2AdapterVaultV1Address,
  parentVault: vaultV2Address,
  skimRecipient: zeroAddress,
});

const marketParams = new MarketParams({
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860000000000000000n,
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  oracle: "0x663BECd10daE6C4A3Dcd89F1d76c1174199639B9",
});

describe("VaultV2Adapter", () => {
  describe("should fetch vaultV1 adapter", () => {
    vaultV2Test("with deployless reads", async ({ client }) => {
      const value = await fetchVaultV2Adapter(
        vaultV2AdapterVaultV1Address,
        client,
        {
          deployless: true,
        },
      );

      expect(value).toStrictEqual(expectedDataVaultV1Adapter);
    });

    vaultV2Test("with multicall", async ({ client }) => {
      const value = await fetchVaultV2Adapter(
        vaultV2AdapterVaultV1Address,
        client,
        {
          deployless: false,
        },
      );

      expect(value).toStrictEqual(expectedDataVaultV1Adapter);
    });
  });

  describe("should fetch marketV1 adapter", () => {
    vaultV2Test("with deployless reads", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];

      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);
      const { address: adapterAddress } = await deployMorphoMarketV1Adapter(
        client as AnvilTestClient,
        vaultAddress,
        "1",
        {
          marketParams,
          deposit: parseUnits("1000", 6),
        },
      );

      const value = await fetchVaultV2Adapter(adapterAddress, client, {
        deployless: "force",
      });
      expect(value).toStrictEqual(
        new VaultV2MorphoMarketV1Adapter({
          address: adapterAddress,
          parentVault: vaultAddress,
          skimRecipient: zeroAddress,
          marketParamsList: [marketParams],
        }),
      );
    });

    vaultV2Test("with multicall", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];

      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);
      const { address: adapterAddress } = await deployMorphoMarketV1Adapter(
        client as AnvilTestClient,
        vaultAddress,
        "1",
        {
          marketParams,
          deposit: parseUnits("1000", 6),
        },
      );

      const value = await fetchVaultV2Adapter(adapterAddress, client, {
        deployless: "force",
      });
      expect(value).toStrictEqual(
        new VaultV2MorphoMarketV1Adapter({
          address: adapterAddress,
          parentVault: vaultAddress,
          skimRecipient: zeroAddress,
          marketParamsList: [marketParams],
        }),
      );
    });
  });

  describe("should fetch marketV1 adapter V2", () => {
    vaultV2Test("with deployless reads", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];

      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);
      const { address: adapterAddress, supplyShares } =
        await deployMorphoMarketV1Adapter(
          client as AnvilTestClient,
          vaultAddress,
          "2",
          {
            marketParams,
            deposit: parseUnits("1000", 6),
          },
        );

      const value = await fetchVaultV2Adapter(adapterAddress, client, {
        deployless: "force",
      });
      expect(value).toStrictEqual(
        new VaultV2MorphoMarketV1AdapterV2({
          address: adapterAddress,
          parentVault: vaultAddress,
          skimRecipient: zeroAddress,
          marketIds: [marketParams.id],
          adaptiveCurveIrm: marketParams.irm,
          supplyShares: {
            [marketParams.id]: supplyShares,
          },
        }),
      );
    });

    vaultV2Test("with multicall", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];

      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);
      const { address: adapterAddress, supplyShares } =
        await deployMorphoMarketV1Adapter(
          client as AnvilTestClient,
          vaultAddress,
          "2",
          {
            marketParams,
            deposit: parseUnits("1000", 6),
          },
        );

      const value = await fetchVaultV2Adapter(adapterAddress, client, {
        deployless: false,
      });
      expect(value).toStrictEqual(
        new VaultV2MorphoMarketV1AdapterV2({
          address: adapterAddress,
          parentVault: vaultAddress,
          skimRecipient: zeroAddress,
          marketIds: [marketParams.id],
          adaptiveCurveIrm: marketParams.irm,
          supplyShares: {
            [marketParams.id]: supplyShares,
          },
        }),
      );
    });
  });
});

describe("LiquidityAdapter vaultV1", () => {
  describe("maxDeposit function", () => {
    vaultV2Test("should be limited by absolute cap", async ({ client }) => {
      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const [absoluteCap, allocation] = await Promise.all([
        readContract(client, {
          address: vaultV2Address,
          abi: vaultV2Abi,
          functionName: "absoluteCap",
          args: [
            VaultV2MorphoVaultV1Adapter.adapterId(vaultV2AdapterVaultV1Address),
          ],
        }),
        readContract(client, {
          address: vaultV2Address,
          abi: vaultV2Abi,
          functionName: "allocation",
          args: [
            VaultV2MorphoVaultV1Adapter.adapterId(vaultV2AdapterVaultV1Address),
          ],
        }),
      ]);

      const depositAmount = parseUnits("2000000", 6); // 1M
      const result = accrualVaultV2.maxDeposit(depositAmount);

      expect(result).toStrictEqual({
        value: absoluteCap - allocation,
        limiter: CapacityLimitReason.vaultV2_absoluteCap,
      });
    });

    vaultV2Test("should be limited by relative cap", async ({ client }) => {
      await client.deal({
        account: curator,
        amount: parseEther("1"),
      });
      const idData = encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", vaultV2AdapterVaultV1Address],
      );
      const data = encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "decreaseRelativeCap",
        args: [idData, parseEther("200000")],
      });
      await client.writeContract({
        account: curator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "submit",
        args: [data],
      });
      await client.writeContract({
        account: curator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "decreaseRelativeCap",
        args: [idData, 1n],
      });

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const depositAmount = parseUnits("100000", 6); // 100K
      const result = accrualVaultV2.maxDeposit(depositAmount);

      expect(result).toStrictEqual({
        value: 0n,
        limiter: CapacityLimitReason.vaultV2_relativeCap,
      });
    });

    vaultV2Test("should be limited by metamorpho", async ({ client }) => {
      await client.deal({
        account: curator,
        amount: parseEther("1"),
      });
      const idData = encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", vaultV2AdapterVaultV1Address],
      );
      const data = encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseAbsoluteCap",
        args: [idData, parseEther("200000")],
      });
      await client.writeContract({
        account: curator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "submit",
        args: [data],
      });

      await client.writeContract({
        account: curator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "increaseAbsoluteCap",
        args: [idData, parseEther("200000")],
      });

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const result = accrualVaultV2.maxDeposit(MathLib.MAX_UINT_256);
      expect(result).toStrictEqual({
        value: 1000725557277232788n,
        limiter: CapacityLimitReason.cap,
      });
    });
  });

  describe("maxWithdraw function", () => {
    vaultV2Test(
      "should be limited by liquidity when assets > liquidity",
      async ({ client }) => {
        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2Address,
          client,
        );

        const shares = parseUnits("1000000", 18); // 1M shares
        const result = accrualVaultV2.maxWithdraw(shares);

        expect(result).toStrictEqual({
          value: 16667544n,
          limiter: CapacityLimitReason.liquidity,
        });
      },
    );

    vaultV2Test(
      "should be limited by balance when assets <= liquidity",
      async ({ client }) => {
        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2Address,
          client,
        );

        const shares = parseUnits("10", 18); // 10 shares
        const result = accrualVaultV2.maxWithdraw(shares);

        expect(result).toStrictEqual({
          value: accrualVaultV2.toAssets(shares),
          limiter: CapacityLimitReason.balance,
        });
      },
    );
  });
});

describe("LiquidityAdapter marketV1", () => {
  describe("maxDeposit function", () => {
    vaultV2Test("should be limited by balance", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];
      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultAddress, client);

      const assets = parseUnits("100000", 6); // 100K assets
      const result = accrualVaultV2.maxDeposit(assets);
      expect(result).toStrictEqual({
        value: assets,
        limiter: CapacityLimitReason.balance,
      });
    });
  });

  describe("maxWithdraw function", () => {
    vaultV2Test("should be limited by balance", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];
      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultAddress, client);

      const shares = parseUnits("100000", 6); // 100K shares
      const result = accrualVaultV2.maxWithdraw(shares);
      expect(result).toStrictEqual({
        value: 0n,
        limiter: CapacityLimitReason.balance,
      });
    });
  });
});

describe("LiquidityAdapter marketV1 V2", () => {
  describe("maxDeposit function", () => {
    vaultV2Test(
      "should be limited by absolute cap on marketV1",
      async ({ client }) => {
        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2ClearstarEurc,
          client,
        );

        const assets = parseUnits("30000000", 6); // 30M assets

        const result = accrualVaultV2.maxDeposit(assets);
        expect(result.value).toBeLessThanOrEqual(parseUnits("20000000", 6)); // Should be inferior or equal to 20M
        expect(result.limiter).toBe(CapacityLimitReason.vaultV2_absoluteCap);
      },
    );
  });
});

describe("LiquidityAdapter zero address", () => {
  vaultV2Test(
    "should deposit full amount when liquidityAdapter is zero address",
    async ({ client }) => {
      // Set liquidity adapter to zero address
      await client.writeContract({
        account: allocator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "setLiquidityAdapterAndData",
        args: [zeroAddress, "0x"],
      });

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const result = accrualVaultV2.maxDeposit(MathLib.MAX_UINT_256);
      expect(result).toStrictEqual({
        value: MathLib.MAX_UINT_256,
        limiter: CapacityLimitReason.balance,
      });
    },
  );

  vaultV2Test(
    "should withdraw full amount when liquidityAdapter is zero address",
    async ({ client }) => {
      // Set liquidity adapter to zero address
      await client.writeContract({
        account: allocator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "setLiquidityAdapterAndData",
        args: [zeroAddress, "0x"],
      });

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const shares = parseUnits("100", 18);
      const result = accrualVaultV2.maxWithdraw(shares);

      expect(result).toStrictEqual({
        value: accrualVaultV2.toAssets(shares),
        limiter: CapacityLimitReason.balance,
      });
    },
  );
});

describe("LiquidityAdapter undefined", () => {
  vaultV2Test(
    "should throw error for undefined liquidity adapter",
    async ({ client }) => {
      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const modified1AccrualVaultV2 = new AccrualVaultV2(
        accrualVaultV2,
        undefined,
        accrualVaultV2.accrualAdapters,
        accrualVaultV2.assetBalance,
      );

      const depositAmount = parseUnits("1000", 6);
      expect(() => modified1AccrualVaultV2.maxDeposit(depositAmount)).toThrow(
        "unsupported liquidity adapter",
      );
    },
  );

  vaultV2Test(
    "should throw error for undefined liquidity allocations",
    async ({ client }) => {
      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const modified1AccrualVaultV2 = new AccrualVaultV2(
        {
          ...accrualVaultV2,
          liquidityAllocations: undefined,
        },
        accrualVaultV2.accrualLiquidityAdapter,
        accrualVaultV2.accrualAdapters,
        accrualVaultV2.assetBalance,
      );

      const depositAmount = parseUnits("1000", 6);
      expect(() => modified1AccrualVaultV2.maxDeposit(depositAmount)).toThrow(
        "unsupported liquidity adapter",
      );
    },
  );
});
