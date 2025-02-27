import {
  BorrowMigrationLimiter,
  MigratableProtocol,
  SupplyMigrationLimiter,
  fetchMigratablePositions,
} from "../../../src/index.js";

import { ChainId, addresses } from "@morpho-org/blue-sdk";

import type { ViemTestContext } from "@morpho-org/test/vitest";
import { type Address, parseEther, parseUnits } from "viem";
import { type TestAPI, describe, expect } from "vitest";
import { MIGRATION_ADDRESSES } from "../../../src/config.js";
import { MigratableBorrowPosition_AaveV3 } from "../../../src/positions/borrow/aaveV3.borrow.js";
import { MigratableSupplyPosition_AaveV3 } from "../../../src/positions/supply/aaveV3.supply.js";
import { test } from "../setup.js";

const TEST_CONFIGS = [
  {
    chainId: ChainId.EthMainnet,
    aUsdc: "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c",
    testFn: test[ChainId.EthMainnet] as TestAPI<ViemTestContext>,
    marketTo: "0x", //TODO
  },
  {
    chainId: ChainId.BaseMainnet,
    aUsdc: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
    testFn: test[ChainId.BaseMainnet] as TestAPI<ViemTestContext>,
    marketTo: "0x", //TODO
  },
] as const;

describe("Borrow position on AAVE V3", () => {
  for (const { chainId, aUsdc, testFn } of TEST_CONFIGS) {
    const { pool } = MIGRATION_ADDRESSES[chainId].aaveV3;
    const {
      // bundler3: { generalAdapter1, aaveV3CoreMigrationAdapter },
      wNative,
      usdc,
      wstEth,
    } = addresses[chainId];

    const writeSupply = async (
      client: ViemTestContext["client"],
      market: Address,
      amount: bigint,
      asCollateral = false,
    ) => {
      await client.deal({
        erc20: market,
        amount: amount,
      });
      await client.approve({
        address: market,
        args: [pool.address, amount],
      });
      await client.writeContract({
        ...pool,
        functionName: "deposit",
        args: [market, amount, client.account.address, 0],
      });
      await client.writeContract({
        ...pool,
        functionName: "setUserUseReserveAsCollateral",
        args: [market, asCollateral],
      });

      await client.mine({ blocks: 500 }); //accrue some interests
    };

    const writeBorrow = async (
      client: ViemTestContext["client"],
      market: Address,
      amount: bigint,
    ) => {
      await client.writeContract({
        ...pool,
        functionName: "borrow",
        args: [market, amount, 2n, 0, client.account.address],
      });
    };

    describe(`on chain ${chainId}`, () => {
      testFn(
        "should fetch user position",
        async ({ client }: ViemTestContext) => {
          const collateralAmount = parseUnits("1000000", 6);
          const borrowAmount = parseEther("1");

          await writeSupply(client, usdc, collateralAmount, true);
          await writeBorrow(client, wNative, borrowAmount);

          const allPositions = await fetchMigratablePositions(
            client.account.address,
            client,
            { protocols: [MigratableProtocol.aaveV3] },
          );

          const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
          expect(aaveV3Positions).toBeDefined();
          expect(aaveV3Positions).toHaveLength(1);

          const position =
            aaveV3Positions[0]! as MigratableBorrowPosition_AaveV3;
          expect(position).toBeInstanceOf(MigratableBorrowPosition_AaveV3);

          expect(position.protocol).toEqual(MigratableProtocol.aaveV3);
          expect(position.user).toEqual(client.account.address);
          expect(position.loanToken.address).toEqual(wNative);
          expect(position.nonce).toEqual(0n);
          expect(position.aToken.address).toEqual(aUsdc);
          expect(position.collateral).toBeGreaterThanOrEqual(collateralAmount); //interest accrued
          expect(position.borrow).toBeGreaterThanOrEqual(borrowAmount); //interest accrued
          expect(position.chainId).toEqual(chainId);
          expect(position.collateralToken.address).toEqual(usdc);
          expect(position.loanToken.address).toEqual(wNative);
          expect(position.maxRepay.limiter).toEqual(
            BorrowMigrationLimiter.position,
          );
          expect(position.maxRepay.value).toEqual(position.borrow);
          expect(position.maxWithdraw.limiter).toEqual(
            SupplyMigrationLimiter.position,
          );
          expect(position.maxWithdraw.value).toEqual(position.collateral);
        },
      );

      testFn(
        "shouldn't fetch user position if multiple collaterals",
        async ({ client }) => {
          const collateralAmount1 = parseUnits("100000", 6);
          const collateralAmount2 = parseUnits("1", 18);
          const borrowAmount = parseEther("1");

          await writeSupply(client, usdc, collateralAmount1, true);
          await writeSupply(client, wstEth, collateralAmount2, true);
          await writeBorrow(client, wNative, borrowAmount);

          const allPositions = await fetchMigratablePositions(
            client.account.address,
            client,
            { protocols: [MigratableProtocol.aaveV3] },
          );

          const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
          expect(aaveV3Positions).toBeDefined();
          expect(aaveV3Positions).toHaveLength(0);
        },
      );

      testFn(
        "should fetch multiple user positions if only one collateral",
        async ({ client }) => {
          const collateralAmount = parseUnits("100000", 6);
          const pureSupply = parseUnits("10", 18);
          const borrowAmount = parseEther("1");

          await writeSupply(client, usdc, collateralAmount, true);
          await writeSupply(client, wstEth, pureSupply, false);
          await writeBorrow(client, wNative, borrowAmount);

          const allPositions = await fetchMigratablePositions(
            client.account.address,
            client,
            { protocols: [MigratableProtocol.aaveV3] },
          );

          const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
          expect(aaveV3Positions).toBeDefined();
          expect(aaveV3Positions).toHaveLength(2);
          expect(aaveV3Positions[0]).toBeInstanceOf(
            MigratableSupplyPosition_AaveV3,
          );
          expect(aaveV3Positions[1]).toBeInstanceOf(
            MigratableBorrowPosition_AaveV3,
          );

          const position =
            aaveV3Positions[1] as MigratableBorrowPosition_AaveV3;

          expect(position.collateralToken.address).toBe(usdc);
        },
      );

      testFn(
        "shouldn't fetch user position if multiple loans",
        async ({ client }) => {
          const collateralAmount = parseUnits("100000", 6);
          const borrowAmount1 = parseUnits("1", 18);
          const borrowAmount2 = parseEther("1");

          await writeSupply(client, usdc, collateralAmount, true);
          await writeBorrow(client, wstEth, borrowAmount1);
          await writeBorrow(client, wNative, borrowAmount2);

          const allPositions = await fetchMigratablePositions(
            client.account.address,
            client,
            { protocols: [MigratableProtocol.aaveV3] },
          );

          const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
          expect(aaveV3Positions).toBeDefined();
          expect(aaveV3Positions).toHaveLength(0);
        },
      );

      testFn(
        "shouldn't fetch user collateral positions if no borrow",
        async ({ client }) => {
          const collateralAmount = parseUnits("100000", 6);

          await writeSupply(client, usdc, collateralAmount, true);

          const allPositions = await fetchMigratablePositions(
            client.account.address,
            client,
            { protocols: [MigratableProtocol.aaveV3] },
          );

          const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
          expect(aaveV3Positions).toBeDefined();
          expect(aaveV3Positions).toHaveLength(1);
          expect(aaveV3Positions[0]).toBeInstanceOf(
            MigratableSupplyPosition_AaveV3,
          );
        },
      );

      testFn(
        "should fetch user position with limited liquidity",
        async ({ client }) => {
          const collateralAmount = parseUnits("1000000", 6);
          const borrowAmount = parseEther("5");
          const liquidity = parseUnits("100000", 6);

          await writeSupply(client, usdc, collateralAmount, true);
          await writeBorrow(client, wNative, borrowAmount);
          await client.deal({
            erc20: usdc,
            account: aUsdc,
            amount: liquidity,
          });

          const allPositions = await fetchMigratablePositions(
            client.account.address,
            client,
            { protocols: [MigratableProtocol.aaveV3] },
          );

          const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
          expect(aaveV3Positions).toBeDefined();
          expect(aaveV3Positions).toHaveLength(1);

          const position =
            aaveV3Positions[0]! as MigratableBorrowPosition_AaveV3;
          expect(position).toBeInstanceOf(MigratableBorrowPosition_AaveV3);

          expect(position.maxWithdraw).toEqual({
            limiter: SupplyMigrationLimiter.liquidity,
            value: liquidity,
          });
        },
      );
    });
  }
});
