import { parseEther, parseUnits } from "viem";

import {
  ChainId,
  Market,
  MarketParams,
  Position,
  Token,
  Vault,
} from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/test";

import { SimulationState } from "../src/index.js";

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
} from "./fixtures.js";

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
          assets: 199_999627n,
        }, // Only vault on market A3.
        {
          vault: vaultA.address,
          id: marketA1.id,
          assets: 40_000000n,
        }, // Higher maxOut than vault C.
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(710_000000n);
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10439_999627n);
      expect(data.getMarket(marketA3.id).liquidity).toEqual(100_000373n);
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
          assets: 99_990072n,
        },
        {
          vault: vaultC.address,
          id: marketA1.id,
          assets: 1654n,
        },
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(749_998346n);
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10100_009928n);
      expect(data.getMarket(marketA3.id).liquidity).toEqual(399_991726n);
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
      const idleMarketA = new Market({
        params: MarketParams.idle(tokenA),
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        totalSupplyAssets: parseUnits("100000", 6),
        totalSupplyShares: parseUnits("100000", 6 + 6),
        lastUpdate: timestamp,
        fee: 0n,
        price: parseUnits("3", 18),
      });

      const customFixture = new SimulationState({
        chainId: ChainId.EthMainnet,
        block: { number: 1n, timestamp },
        global: {
          feeRecipient: randomAddress(),
        },
        users: {},
        markets: {
          [idleMarketA.id]: idleMarketA,
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
            [idleMarketA.id]: new Position({
              user: vaultA.address,
              marketId: idleMarketA.id,
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
        holdings: {
          [vaultA.address]: {
            [tokenA]: dataFixture.getHolding(vaultA.address, tokenA),
          },
        },
        vaults: {
          [vaultA.address]: new Vault({
            ...vaultA,
            curator: randomAddress(),
            fee: 0n,
            feeRecipient: randomAddress(),
            owner: randomAddress(),
            guardian: randomAddress(),
            pendingGuardian: { validAt: 0n, value: randomAddress() },
            pendingOwner: randomAddress(),
            pendingTimelock: { validAt: 0n, value: 0n },
            skimRecipient: randomAddress(),
            supplyQueue: [idleMarketA.id, marketA1.id],
            withdrawQueue: [idleMarketA.id, marketA1.id],
            timelock: 0n,
            publicAllocatorConfig: {
              fee: 0n,
              accruedFee: 0n,
              admin: randomAddress(),
            },
            totalSupply: parseUnits("1400", 18),
            totalAssets: parseUnits("10000", 6),
            lastTotalAssets: parseUnits("10000", 6 + 6),
          }),
        },
        vaultMarketConfigs: {
          [vaultA.address]: {
            [idleMarketA.id]: {
              vault: vaultA.address,
              marketId: idleMarketA.id,
              cap: parseUnits("10000", 6),
              pendingCap: { validAt: 0n, value: 0n },
              removableAt: 0n,
              enabled: true,
              publicAllocatorConfig: {
                vault: vaultA.address,
                marketId: idleMarketA.id,
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
      });

      const { withdrawals, data } = customFixture.getMarketPublicReallocations(
        marketA1.id,
        {
          defaultMaxWithdrawalUtilization: 0n,
        },
      );

      expect(withdrawals).toEqual([
        {
          vault: vaultA.address,
          id: idleMarketA.id,
          assets: parseUnits("10000", 6),
        },
      ]);

      expect(data.getMarket(idleMarketA.id).liquidity).toEqual(
        customFixture.markets[idleMarketA.id]!.totalSupplyAssets -
          parseUnits("10000", 6),
      );
      expect(data.getMarket(marketA1.id).liquidity).toEqual(
        customFixture.getMarket(marketA1.id).liquidity + parseUnits("10000", 6),
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
          assets: 119_640644n,
        },
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(869_640644n);
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10080_359356n);
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
          assets: 119_640644n,
        },
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(869_640644n);
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10080_359356n);
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
          assets: 99_990072n,
        }, // Only vault on market A3.
      ]);

      expect(data.getMarket(marketA1.id).liquidity).toEqual(
        dataFixture.getMarket(marketA1.id).liquidity,
      );
      expect(data.getMarket(marketA2.id).liquidity).toEqual(10100_009928n);
      expect(data.getMarket(marketA3.id).liquidity).toEqual(399_990072n);
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
