import { parseEther, parseUnits } from "viem";

import {
  ChainId,
  Market,
  MarketConfig,
  Position,
  Token,
  Vault,
} from "@morpho-org/blue-sdk";
import { createRandomAddress } from "@morpho-org/morpho-test";

import { SimulationState } from "../../src";

import {
  dataFixture,
  marketA1,
  marketA2,
  marketA3,
  marketB1,
  marketB2,
  timestamp,
  tokenA,
  vaultA,
  vaultC,
} from "./fixtures";

import { describe, expect, test } from "vitest";

describe("SimulationState", () => {
  describe("with 100% target utilization", () => {
    const targetUtilization = parseEther("1");

    test("should calculate reallocatable liquidity on market A1", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA1.id, // Included both in vault A & C.
        { defaultMaxWithdrawalUtilization: targetUtilization },
      );

      expect(withdrawals).toEqual([
        {
          vault: vaultC.address,
          id: marketA3.id,
          assets: 300_000000n,
        }, // Only vault on market A3.
        {
          vault: vaultC.address,
          id: marketA2.id,
          assets: 50_000000n,
        }, // Limited by liquidity on A2.
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(1100_000000n);
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10150_000000n);
      expect(data.getMarket(marketA3.id).liquidity).toEqual(0n);
    });

    test("should calculate reallocatable liquidity on market A2", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA2.id, // Included both in vault A & C.
        { defaultMaxWithdrawalUtilization: targetUtilization },
      );

      expect(withdrawals).toEqual([
        {
          vault: vaultC.address,
          id: marketA3.id,
          assets: 199_940000n,
        }, // Only vault on market A3.
        {
          vault: vaultA.address,
          id: marketA1.id,
          assets: 40_000000n,
        }, // Higher maxOut than vault C.
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(710_000000n);
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10439_940000n);
      expect(data.getMarket(marketA3.id).liquidity).toEqual(100_060000n);
    });

    test("should calculate reallocatable liquidity on market A3", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA3.id, // Only included in vault C.
        { defaultMaxWithdrawalUtilization: targetUtilization },
      );

      expect(withdrawals).toEqual([
        {
          vault: vaultC.address,
          id: marketA2.id,
          assets: 99_700000n,
        }, // Only vault on market A3.
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(
        dataFixture.getMarket(marketA1.id).liquidity,
      );
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10100_300000n);
      expect(data.getMarket(marketA3.id).liquidity).toEqual(399_700000n);
    });

    test("should calculate reallocatable liquidity on market B1", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketB1.id, // Not included in any reallocatable vault.
        { defaultMaxWithdrawalUtilization: targetUtilization },
      );

      expect(withdrawals).toEqual([]);

      expect(data.getMarket(marketB1.id).liquidity).toEqual(
        10000_000000000000000000n,
      );
    });

    test("should calculate reallocatable liquidity on market B2", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketB2.id, // Not included in any reallocatable vault.
        { defaultMaxWithdrawalUtilization: targetUtilization },
      );

      expect(withdrawals).toEqual([]);

      expect(data.getMarket(marketB2.id).liquidity).toEqual(
        10000_000000000000000000n,
      );
    });
  });

  describe("with custom target utilization", () => {
    const targetUtilization = parseEther("0.9");

    test("should calculate reallocatable liquidity on idle market with target 0%", () => {
      // We create a state with only a vault that has all the liquidity in the idle market.
      const idleMarketTokenA = new Market({
        config: MarketConfig.idle(tokenA),
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        totalSupplyAssets: parseUnits("100000", 6),
        totalSupplyShares: parseUnits("100000", 6 + 6),
        lastUpdate: timestamp,
        fee: 0n,
        price: parseUnits("3", 18),
      });

      const blueFixture = {
        global: {
          feeRecipient: createRandomAddress(),
        },
        users: {},
        markets: {
          [idleMarketTokenA.id]: idleMarketTokenA,
          [marketA1.id]: marketA1,
        },
        tokens: {
          [tokenA]: new Token({
            address: tokenA,
            decimals: 6,
            symbol: "TAB",
            name: "Token A loan",
          }),
        },
        positions: {
          [vaultA.address]: {
            [idleMarketTokenA.id]: new Position({
              user: vaultA.address,
              marketId: idleMarketTokenA.id,
              borrowShares: 0n,
              collateral: 0n,
              supplyShares: parseUnits("10000", 6 + 6),
            }),
            [marketA1.id]: new Position({
              user: vaultA.address,
              marketId: marketA1.id,
              borrowShares: 0n,
              collateral: 0n,
              supplyShares: 0n,
            }),
          },
        },
        holdings: {},
      };
      const metaMorphoFixture = {
        vaults: {
          [vaultA.address]: new Vault({
            config: vaultA,
            curator: createRandomAddress(),
            fee: 0n,
            feeRecipient: createRandomAddress(),
            owner: createRandomAddress(),
            guardian: createRandomAddress(),
            pendingGuardian: { validAt: 0n, value: createRandomAddress() },
            pendingOwner: createRandomAddress(),
            pendingTimelock: { validAt: 0n, value: 0n },
            skimRecipient: createRandomAddress(),
            supplyQueue: [idleMarketTokenA.id, marketA1.id],
            withdrawQueue: [idleMarketTokenA.id, marketA1.id],
            timelock: 0n,
            publicAllocatorConfig: {
              fee: 0n,
              accruedFee: 0n,
              admin: createRandomAddress(),
            },
            totalSupply: parseUnits("1400", 18),
            totalAssets: parseUnits("10000", 6),
            lastTotalAssets: parseUnits("10000", 6 + 6),
          }),
        },
        vaultMarketConfigs: {
          [vaultA.address]: {
            [idleMarketTokenA.id]: {
              vault: vaultA.address,
              marketId: idleMarketTokenA.id,
              cap: parseUnits("10000", 6),
              pendingCap: { validAt: 0n, value: 0n },
              removableAt: 0n,
              enabled: true,
              publicAllocatorConfig: {
                vault: vaultA.address,
                marketId: idleMarketTokenA.id,
                maxIn: parseUnits("10000", 6),
                maxOut: parseUnits("10000", 6),
              },
            },
            [marketA1.id]: {
              vault: vaultA.address,
              marketId: marketA1.id,
              cap: parseUnits("10000", 6),
              pendingCap: { validAt: 0n, value: 0n },
              removableAt: 0n,
              enabled: true,
              publicAllocatorConfig: {
                vault: vaultA.address,
                marketId: marketA1.id,
                maxIn: parseUnits("10000", 6),
                maxOut: parseUnits("10000", 6),
              },
            },
          },
        },
        vaultUsers: {},
      };

      const dataFixture = new SimulationState({
        chainId: ChainId.EthMainnet,
        block: { number: 1n, timestamp },
        ...blueFixture,
        ...metaMorphoFixture,
      });
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA1.id,
        {
          defaultMaxWithdrawalUtilization: 0n,
        },
      );

      expect(withdrawals).toEqual([
        {
          vault: vaultA.address,
          id: idleMarketTokenA.id,
          assets: parseUnits("10000", 6),
        },
      ]);

      expect(data.getMarket(idleMarketTokenA.id).liquidity).toEqual(
        blueFixture.markets[idleMarketTokenA.id]!.totalSupplyAssets -
          parseUnits("10000", 6),
      );
      expect(data.getMarket(marketA1.id).liquidity).toEqual(
        dataFixture.getMarket(marketA1.id).liquidity + parseUnits("10000", 6),
      );
    });

    test("should calculate reallocatable liquidity on market A1", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA1.id, // Included both in vault A & C.
        { defaultMaxWithdrawalUtilization: targetUtilization },
      );

      expect(withdrawals).toEqual([
        {
          vault: vaultC.address,
          id: marketA2.id,
          assets: 200_000000n,
        },
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(950_000000n);
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10000_000000n);
      expect(data.getMarket(marketA3.id).liquidity).toEqual(
        dataFixture.getMarket(marketA3.id).liquidity,
      );
    });

    test("should calculate reallocatable liquidity on market A1 with targetUtilization as limiter", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA1.id, // Included both in vault A & C.
        {
          defaultMaxWithdrawalUtilization: targetUtilization,
        },
      );

      expect(withdrawals).toEqual([
        {
          vault: vaultC.address,
          id: marketA2.id,
          assets: 200_000000n,
        },
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(950_000000n);
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10000_000000n);
      expect(data.getMarket(marketA3.id).liquidity).toEqual(
        dataFixture.getMarket(marketA3.id).liquidity,
      );
    });

    test("should calculate reallocatable liquidity on market A1 with a market limit", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA1.id, // Included both in vault A & C.
        {
          defaultMaxWithdrawalUtilization: targetUtilization,
          maxWithdrawalUtilization: { [marketA2.id]: 49_8000000000000000n },
        },
      );

      expect(withdrawals).toEqual([
        {
          vault: vaultC.address,
          id: marketA2.id,
          assets: 119_678714n,
        },
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(869_678714n);
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10080_321286n);
      expect(data.getMarket(marketA3.id).liquidity).toEqual(
        dataFixture.getMarket(marketA3.id).liquidity,
      );
    });

    test("should calculate reallocatable liquidity on market A1 with a market limit and a global limit", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA1.id, // Included both in vault A & C.
        {
          defaultMaxWithdrawalUtilization: targetUtilization,
          maxWithdrawalUtilization: { [marketA2.id]: 49_8000000000000000n },
        },
      );

      expect(withdrawals).toEqual([
        {
          vault: vaultC.address,
          id: marketA2.id,
          assets: 119_678714n,
        },
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(869_678714n);
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10080_321286n);
      expect(data.getMarket(marketA3.id).liquidity).toEqual(
        dataFixture.getMarket(marketA3.id).liquidity,
      );
    });

    test("should calculate reallocatable liquidity on market A2", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA2.id, // Included both in vault A & C.
        { defaultMaxWithdrawalUtilization: targetUtilization },
      );

      expect(withdrawals).toEqual([]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(
        dataFixture.getMarket(marketA1.id).liquidity,
      );
      expect(data.getMarket(marketA2.id).liquidity).toEqual(
        dataFixture.getMarket(marketA2.id).liquidity,
      );
      expect(data.getMarket(marketA3.id).liquidity).toEqual(
        dataFixture.getMarket(marketA3.id).liquidity,
      );
    });

    test("should calculate reallocatable liquidity on market A3", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA3.id, // Only included in vault C.
        { defaultMaxWithdrawalUtilization: targetUtilization },
      );

      expect(withdrawals).toEqual([
        {
          vault: vaultC.address,
          id: marketA2.id,
          assets: 99_700000n,
        }, // Only vault on market A3.
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(
        dataFixture.getMarket(marketA1.id).liquidity,
      );
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10100_300000n);
      expect(data.getMarket(marketA3.id).liquidity).toEqual(399_700000n);
    });
  });

  describe("with (close to) 0% target utilization", () => {
    const targetUtilization = 1n; // Cannot divide by 0.

    test("should calculate reallocatable liquidity on market A1", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA1.id, // Included both in vault A & C.
        { defaultMaxWithdrawalUtilization: targetUtilization },
      );

      expect(withdrawals).toEqual([]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(
        dataFixture.getMarket(marketA1.id).liquidity,
      );
      expect(data.getMarket(marketA2.id).liquidity).toEqual(
        dataFixture.getMarket(marketA2.id).liquidity,
      );
      expect(data.getMarket(marketA3.id).liquidity).toEqual(
        dataFixture.getMarket(marketA3.id).liquidity,
      );
    });

    test("should calculate reallocatable liquidity on market A2", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA2.id, // Included both in vault A & C.
        { defaultMaxWithdrawalUtilization: targetUtilization },
      );

      expect(withdrawals).toEqual([]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(
        dataFixture.getMarket(marketA1.id).liquidity,
      );
      expect(data.getMarket(marketA2.id).liquidity).toEqual(
        dataFixture.getMarket(marketA2.id).liquidity,
      );
      expect(data.getMarket(marketA3.id).liquidity).toEqual(
        dataFixture.getMarket(marketA3.id).liquidity,
      );
    });

    test("should calculate reallocatable liquidity on market A3", () => {
      const { withdrawals, data } = dataFixture.getMarketPublicReallocations(
        marketA3.id, // Only included in vault C.
        { defaultMaxWithdrawalUtilization: targetUtilization },
      );

      expect(withdrawals).toEqual([]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(
        dataFixture.getMarket(marketA1.id).liquidity,
      );
      expect(data.getMarket(marketA2.id).liquidity).toEqual(
        dataFixture.getMarket(marketA2.id).liquidity,
      );
      expect(data.getMarket(marketA3.id).liquidity).toEqual(
        dataFixture.getMarket(marketA3.id).liquidity,
      );
    });
  });
});
