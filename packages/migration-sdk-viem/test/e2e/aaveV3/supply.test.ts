import {
  MigratableProtocol,
  SupplyMigrationLimiter,
  fetchMigratablePositions,
} from "../../../src/index.js";

import { ChainId, MathLib, addresses } from "@morpho-org/blue-sdk";

import { type Address, maxUint256, parseEther, parseUnits } from "viem";

import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { vaults } from "@morpho-org/morpho-test";
import type { ViemTestContext } from "@morpho-org/test/vitest";
import { sendTransaction } from "viem/actions";
import { type TestAPI, describe, expect } from "vitest";
import { MIGRATION_ADDRESSES } from "../../../src/config.js";
import { MigratableSupplyPosition_AaveV3 } from "../../../src/positions/supply/aaveV3.supply.js";
import { test } from "../setup.js";

const TEST_CONFIGS: {
  chainId: ChainId;
  aWeth: Address;
  testFn: TestAPI<ViemTestContext>;
  mmWeth: Address;
}[] = [
  {
    chainId: ChainId.EthMainnet,
    aWeth: "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8",
    testFn: test[ChainId.EthMainnet],
    mmWeth: vaults[ChainId.EthMainnet].steakEth.address,
  },
  {
    chainId: ChainId.BaseMainnet,
    aWeth: "0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7",
    //@ts-expect-error
    testFn: test[ChainId.BaseMainnet],
    mmWeth: "0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1",
  },
] as const;

describe("Supply position on AAVE V3", () => {
  for (const { chainId, aWeth, testFn, mmWeth } of TEST_CONFIGS) {
    const { pool } = MIGRATION_ADDRESSES[chainId].aaveV3;
    const { aaveV3Bundler, wNative, usdc } = addresses[chainId];

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

    describe(`on chain ${chainId}`, () => {
      testFn(
        "should fetch user position",
        async ({ client }: ViemTestContext) => {
          const amount = parseEther("1");

          await writeSupply(client, wNative, amount);

          const allPositions = await fetchMigratablePositions(
            client.account.address,
            client,
            { protocols: [MigratableProtocol.aaveV3] },
          );

          const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
          expect(aaveV3Positions).toBeDefined();
          expect(aaveV3Positions).toHaveLength(1);

          const position =
            aaveV3Positions[0]! as MigratableSupplyPosition_AaveV3;
          expect(position).toBeInstanceOf(MigratableSupplyPosition_AaveV3);

          expect(position.protocol).toEqual(MigratableProtocol.aaveV3);
          expect(position.user).toEqual(client.account.address);
          expect(position.loanToken).toEqual(wNative);
          expect(position.nonce).toEqual(0n);
          expect(position.aToken.address).toEqual(aWeth);
          expect(position.supply).toBeGreaterThanOrEqual(amount); //interest accrued
          expect(position.max.limiter).toEqual(SupplyMigrationLimiter.position);
          expect(position.max.value).toEqual(position.supply);
          expect(position.supplyApy).not.toEqual(0);
          expect(position.supplyApy).not.toEqual(Number.POSITIVE_INFINITY);
        },
      );

      testFn("should fetch multiple user position", async ({ client }) => {
        const amountWeth = parseEther("1");
        const amountUsdc = parseUnits("1324", 6);

        await writeSupply(client, wNative, amountWeth);
        await writeSupply(client, usdc, amountUsdc);

        const allPositions = await fetchMigratablePositions(
          client.account.address,
          client,
          { protocols: [MigratableProtocol.aaveV3] },
        );

        const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
        expect(aaveV3Positions).toBeDefined();
        expect(aaveV3Positions).toHaveLength(2);
      });

      testFn(
        "should fetch user collateral positions if no borrow",
        async ({ client }) => {
          const amount = parseEther("1");

          await writeSupply(client, wNative, amount, true);

          const allPositions = await fetchMigratablePositions(
            client.account.address,
            client,
            { protocols: [MigratableProtocol.aaveV3] },
          );

          const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
          expect(aaveV3Positions).toBeDefined();
          expect(aaveV3Positions).toHaveLength(1);
        },
      );

      testFn(
        "shouldn't fetch user collateral positions if borrow",
        async ({ client }) => {
          const collateral = parseEther("1");
          const borrow = parseUnits("1", 6);

          await writeSupply(client, wNative, collateral, true);
          await client.writeContract({
            ...pool,
            functionName: "borrow",
            args: [usdc, borrow, 2n, 0, client.account.address],
          });

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
        "should fetch user position with limited liquidity",
        async ({ client }) => {
          const amount = parseEther("5");
          const liquidity = parseEther("3");

          await writeSupply(client, wNative, amount);
          await client.deal({
            erc20: wNative,
            account: aWeth,
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
            aaveV3Positions[0]! as MigratableSupplyPosition_AaveV3;
          expect(position).toBeInstanceOf(MigratableSupplyPosition_AaveV3);

          expect(position.max).toEqual({
            limiter: SupplyMigrationLimiter.liquidity,
            value: liquidity,
          });
        },
      );

      testFn("Should partially migrate user position", async ({ client }) => {
        const positionAmount = parseEther("5");
        const migratedAmount = parseEther("3");

        await writeSupply(client, wNative, positionAmount);

        const allPositions = await fetchMigratablePositions(
          client.account.address,
          client,
          { protocols: [MigratableProtocol.aaveV3] },
        );

        const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
        expect(aaveV3Positions).toBeDefined();
        expect(aaveV3Positions).toHaveLength(1);

        const migrationBundle = aaveV3Positions[0]!.getMigrationTx(
          {
            vault: mmWeth,
            amount: migratedAmount,
            minShares: 0n,
          },
          chainId,
          true,
        );

        expect(migrationBundle.requirements.txs).toHaveLength(0);
        expect(migrationBundle.requirements.signatures).toHaveLength(1);
        const deadline = migrationBundle.actions[0]?.args[2];
        expect(migrationBundle.actions).toEqual([
          {
            args: [aWeth, migratedAmount, deadline, null],
            type: "permit",
          },
          {
            args: [aWeth, migratedAmount],
            type: "erc20TransferFrom",
          },
          {
            args: [wNative, maxUint256],
            type: "aaveV3Withdraw",
          },
          {
            args: [mmWeth, MathLib.MAX_UINT_128, 0n, client.account.address],
            type: "erc4626Deposit",
          },
        ]);

        await migrationBundle.requirements.signatures[0]!.sign(client);

        await sendTransaction(client, migrationBundle.tx());

        const [
          bundlerPosition,
          wEthBundlerBalance,
          userPosition,
          userMMShares,
        ] = await Promise.all([
          client.balanceOf({ erc20: aWeth, owner: aaveV3Bundler }),
          client.balanceOf({ erc20: wNative, owner: aaveV3Bundler }),
          client.balanceOf({ erc20: aWeth }),
          client.balanceOf({ erc20: mmWeth }),
        ]);

        const userMMBalance = await client.readContract({
          address: mmWeth,
          abi: metaMorphoAbi,
          functionName: "convertToAssets",
          args: [userMMShares],
        });

        expect(bundlerPosition).toEqual(0n);
        expect(wEthBundlerBalance).toEqual(0n);
        expect(userPosition).toBeGreaterThan(positionAmount - migratedAmount); //interest have been accumulated
        expect(userMMBalance).toBeGreaterThanOrEqual(migratedAmount - 2n);
      });

      testFn("Should fully migrate user position", async ({ client }) => {
        const positionAmount = parseEther("5");

        await writeSupply(client, wNative, positionAmount);

        const allPositions = await fetchMigratablePositions(
          client.account.address,
          client,
          { protocols: [MigratableProtocol.aaveV3] },
        );

        const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
        expect(aaveV3Positions).toBeDefined();
        expect(aaveV3Positions).toHaveLength(1);

        const position = aaveV3Positions[0]!;

        const migrationBundle = aaveV3Positions[0]!.getMigrationTx(
          {
            vault: mmWeth,
            amount: position.supply,
            minShares: 0n,
          },
          chainId,
          true,
        );

        expect(migrationBundle.requirements.txs).toHaveLength(0);
        expect(migrationBundle.requirements.signatures).toHaveLength(1);
        const deadline = migrationBundle.actions[0]?.args[2];
        expect(migrationBundle.actions).toEqual([
          {
            args: [aWeth, maxUint256, deadline, null],
            type: "permit",
          },
          {
            args: [aWeth, maxUint256],
            type: "erc20TransferFrom",
          },
          {
            args: [wNative, maxUint256],
            type: "aaveV3Withdraw",
          },
          {
            args: [mmWeth, MathLib.MAX_UINT_128, 0n, client.account.address],
            type: "erc4626Deposit",
          },
        ]);

        await migrationBundle.requirements.signatures[0]!.sign(client);

        await sendTransaction(client, migrationBundle.tx());

        const [
          bundlerPosition,
          wEthBundlerBalance,
          userPosition,
          userMMShares,
        ] = await Promise.all([
          client.balanceOf({ erc20: aWeth, owner: aaveV3Bundler }),
          client.balanceOf({ erc20: wNative, owner: aaveV3Bundler }),
          client.balanceOf({ erc20: aWeth }),
          client.balanceOf({ erc20: mmWeth }),
        ]);

        const userMMBalance = await client.readContract({
          address: mmWeth,
          abi: metaMorphoAbi,
          functionName: "convertToAssets",
          args: [userMMShares],
        });

        expect(bundlerPosition).toEqual(0n);
        expect(wEthBundlerBalance).toEqual(0n);
        expect(userPosition).toEqual(0n);
        expect(userMMBalance).toBeGreaterThan(positionAmount); //interest have been accumulated
      });

      testFn(
        "Should partially migrate user position without signature",
        async ({ client }) => {
          const positionAmount = parseEther("5");
          const migratedAmount = parseEther("3");

          await writeSupply(client, wNative, positionAmount);

          const allPositions = await fetchMigratablePositions(
            client.account.address,
            client,
            { protocols: [MigratableProtocol.aaveV3] },
          );

          const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
          expect(aaveV3Positions).toBeDefined();
          expect(aaveV3Positions).toHaveLength(1);

          const migrationBundle = aaveV3Positions[0]!.getMigrationTx(
            {
              vault: mmWeth,
              amount: migratedAmount,
              minShares: 0n,
            },
            chainId,
            false,
          );

          expect(migrationBundle.requirements.txs).toHaveLength(1);
          expect(migrationBundle.requirements.signatures).toHaveLength(0);
          expect(migrationBundle.actions).toEqual([
            {
              args: [aWeth, migratedAmount],
              type: "erc20TransferFrom",
            },
            {
              args: [wNative, maxUint256],
              type: "aaveV3Withdraw",
            },
            {
              args: [mmWeth, MathLib.MAX_UINT_128, 0n, client.account.address],
              type: "erc4626Deposit",
            },
          ]);

          await sendTransaction(
            client,
            migrationBundle.requirements.txs[0]!.tx,
          );

          await sendTransaction(client, migrationBundle.tx());

          const [
            bundlerPosition,
            wEthBundlerBalance,
            userPosition,
            userMMShares,
          ] = await Promise.all([
            client.balanceOf({ erc20: aWeth, owner: aaveV3Bundler }),
            client.balanceOf({ erc20: wNative, owner: aaveV3Bundler }),
            client.balanceOf({ erc20: aWeth }),
            client.balanceOf({ erc20: mmWeth }),
          ]);

          const userMMBalance = await client.readContract({
            address: mmWeth,
            abi: metaMorphoAbi,
            functionName: "convertToAssets",
            args: [userMMShares],
          });

          expect(bundlerPosition).toEqual(0n);
          expect(wEthBundlerBalance).toEqual(0n);
          expect(userPosition).toBeGreaterThan(positionAmount - migratedAmount); //interest have been accumulated
          expect(userMMBalance).toBeGreaterThanOrEqual(migratedAmount - 2n);
        },
      );

      testFn(
        "Should fully migrate user position without signature",
        async ({ client }) => {
          const positionAmount = parseEther("5");

          await writeSupply(client, wNative, positionAmount);

          const allPositions = await fetchMigratablePositions(
            client.account.address,
            client,
            { protocols: [MigratableProtocol.aaveV3] },
          );

          const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
          expect(aaveV3Positions).toBeDefined();
          expect(aaveV3Positions).toHaveLength(1);

          const position = aaveV3Positions[0]!;

          const migrationBundle = aaveV3Positions[0]!.getMigrationTx(
            {
              vault: mmWeth,
              amount: position.supply,
              minShares: 0n,
            },
            chainId,
            false,
          );

          expect(migrationBundle.requirements.txs).toHaveLength(1);
          expect(migrationBundle.requirements.signatures).toHaveLength(0);
          expect(migrationBundle.actions).toEqual([
            {
              args: [aWeth, maxUint256],
              type: "erc20TransferFrom",
            },
            {
              args: [wNative, maxUint256],
              type: "aaveV3Withdraw",
            },
            {
              args: [mmWeth, MathLib.MAX_UINT_128, 0n, client.account.address],
              type: "erc4626Deposit",
            },
          ]);

          await sendTransaction(
            client,
            migrationBundle.requirements.txs[0]!.tx,
          );
          await sendTransaction(client, migrationBundle.tx());

          const [
            bundlerPosition,
            wEthBundlerBalance,
            userPosition,
            userMMShares,
          ] = await Promise.all([
            client.balanceOf({ erc20: aWeth, owner: aaveV3Bundler }),
            client.balanceOf({ erc20: wNative, owner: aaveV3Bundler }),
            client.balanceOf({ erc20: aWeth }),
            client.balanceOf({ erc20: mmWeth }),
          ]);

          const userMMBalance = await client.readContract({
            address: mmWeth,
            abi: metaMorphoAbi,
            functionName: "convertToAssets",
            args: [userMMShares],
          });

          expect(bundlerPosition).toEqual(0n);
          expect(wEthBundlerBalance).toEqual(0n);
          expect(userPosition).toEqual(0n);
          expect(userMMBalance).toBeGreaterThan(positionAmount); //interest have been accumulated
        },
      );
    });
  }
});
