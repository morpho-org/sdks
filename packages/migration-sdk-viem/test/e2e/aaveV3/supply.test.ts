import {
  MigratableProtocol,
  SupplyMigrationLimiter,
  fetchMigratablePositions,
  migrationAddressesRegistry,
} from "../../../src/index.js";

import { ChainId, MathLib, addressesRegistry } from "@morpho-org/blue-sdk";

import { type Address, maxUint256, parseEther, parseUnits } from "viem";

import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { vaults } from "@morpho-org/morpho-test";
import type { ViemTestContext } from "@morpho-org/test/vitest";
import { sendTransaction } from "viem/actions";
import { type TestAPI, describe, expect } from "vitest";
import { MigratableBorrowPosition_AaveV3 } from "../../../src/positions/borrow/aaveV3.borrow.js";
import { MigratableSupplyPosition_AaveV3 } from "../../../src/positions/supply/aaveV3.supply.js";
import { test } from "../setup.js";

const TEST_CONFIGS = [
  {
    chainId: ChainId.EthMainnet,
    aWNative: "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8",
    testFn: test[ChainId.EthMainnet] as TestAPI<ViemTestContext>,
    mmWNative: vaults[ChainId.EthMainnet].steakEth.address,
    wNativeMinPrice: 2000,
  },
  {
    chainId: ChainId.BaseMainnet,
    aWNative: "0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7",
    testFn: test[ChainId.BaseMainnet] as TestAPI<ViemTestContext>,
    mmWNative: "0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1",
    wNativeMinPrice: 2000,
  },
  // {
  //   chainId: ChainId.ArbitrumMainnet,
  //   aWNative: "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8",
  //   testFn: test[ChainId.ArbitrumMainnet] as TestAPI<ViemTestContext>,
  //   mmWNative: "0x4dB0B0a83de352817d0C30a88a36667b75D48b6E",
  //   wNativeMinPrice: 2000,
  // },
  {
    chainId: ChainId.PolygonMainnet,
    aWNative: "0x6d80113e533a2C0fe82EaBD35f1875DcEA89Ea97",
    testFn: test[ChainId.PolygonMainnet] as TestAPI<ViemTestContext>,
    mmWNative: "0x3F33F9f7e2D7cfBCBDf8ea8b870a6E3d449664c2",
    wNativeMinPrice: 0.2,
  },
] as const;

describe("Supply position on AAVE V3", () => {
  for (const {
    chainId,
    aWNative,
    testFn,
    mmWNative,
    wNativeMinPrice,
  } of TEST_CONFIGS) {
    const { pool } = migrationAddressesRegistry[chainId].aaveV3;
    const {
      bundler3: { generalAdapter1, aaveV3CoreMigrationAdapter },
      wNative,
      usdc,
    } = addressesRegistry[chainId];

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
          expect(position.aToken.address).toEqual(aWNative);
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
          const collateralStr = "1";
          const collateral = parseEther(collateralStr);
          const borrow = parseUnits(
            ((Number(collateralStr) * wNativeMinPrice) / 100).toString(),
            6,
          );

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
          expect(aaveV3Positions).toHaveLength(1);
          expect(aaveV3Positions[0]).toBeInstanceOf(
            MigratableBorrowPosition_AaveV3,
          );
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
            account: aWNative,
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
        expect(aaveV3Positions[0]).toBeInstanceOf(
          MigratableSupplyPosition_AaveV3,
        );

        const position = aaveV3Positions[0] as MigratableSupplyPosition_AaveV3;

        const migrationBundle = position.getMigrationTx(
          {
            vault: mmWNative,
            amount: migratedAmount,
            maxSharePrice: 2n * MathLib.RAY,
          },
          true,
        );

        expect(migrationBundle.requirements.txs).toHaveLength(0);
        expect(migrationBundle.requirements.signatures).toHaveLength(1);
        expect(migrationBundle.actions).toEqual([
          {
            args: [
              client.account.address,
              aWNative,
              migratedAmount,
              expect.any(BigInt),
              null,
            ],
            type: "permit",
          },
          {
            args: [aWNative, migratedAmount, aaveV3CoreMigrationAdapter],
            type: "erc20TransferFrom",
          },
          {
            args: [wNative, maxUint256, generalAdapter1],
            type: "aaveV3Withdraw",
          },
          {
            args: [
              mmWNative,
              maxUint256,
              2n * MathLib.RAY,
              client.account.address,
            ],
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
          client.balanceOf({
            erc20: aWNative,
            owner: aaveV3CoreMigrationAdapter,
          }),
          client.balanceOf({
            erc20: wNative,
            owner: aaveV3CoreMigrationAdapter,
          }),
          client.balanceOf({ erc20: aWNative }),
          client.balanceOf({ erc20: mmWNative }),
        ]);

        const userMMBalance = await client.readContract({
          address: mmWNative,
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
        expect(aaveV3Positions[0]).toBeInstanceOf(
          MigratableSupplyPosition_AaveV3,
        );

        const position = aaveV3Positions[0] as MigratableSupplyPosition_AaveV3;

        const migrationBundle = position.getMigrationTx(
          {
            vault: mmWNative,
            amount: position.supply,
            maxSharePrice: 2n * MathLib.RAY,
          },
          true,
        );

        expect(migrationBundle.requirements.txs).toHaveLength(0);
        expect(migrationBundle.requirements.signatures).toHaveLength(1);
        expect(migrationBundle.actions).toEqual([
          {
            args: [
              client.account.address,
              aWNative,
              maxUint256,
              expect.any(BigInt),
              null,
            ],
            type: "permit",
          },
          {
            args: [aWNative, maxUint256, aaveV3CoreMigrationAdapter],
            type: "erc20TransferFrom",
          },
          {
            args: [wNative, maxUint256, generalAdapter1],
            type: "aaveV3Withdraw",
          },
          {
            args: [
              mmWNative,
              maxUint256,
              2n * MathLib.RAY,
              client.account.address,
            ],
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
          client.balanceOf({
            erc20: aWNative,
            owner: aaveV3CoreMigrationAdapter,
          }),
          client.balanceOf({
            erc20: wNative,
            owner: aaveV3CoreMigrationAdapter,
          }),
          client.balanceOf({ erc20: aWNative }),
          client.balanceOf({ erc20: mmWNative }),
        ]);

        const userMMBalance = await client.readContract({
          address: mmWNative,
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
          expect(aaveV3Positions[0]).toBeInstanceOf(
            MigratableSupplyPosition_AaveV3,
          );

          const position =
            aaveV3Positions[0] as MigratableSupplyPosition_AaveV3;

          const migrationBundle = position.getMigrationTx(
            {
              vault: mmWNative,
              amount: migratedAmount,
              maxSharePrice: 2n * MathLib.RAY,
            },
            false,
          );

          expect(migrationBundle.requirements.txs).toHaveLength(1);
          expect(migrationBundle.requirements.signatures).toHaveLength(0);
          expect(migrationBundle.actions).toEqual([
            {
              args: [aWNative, migratedAmount, aaveV3CoreMigrationAdapter],
              type: "erc20TransferFrom",
            },
            {
              args: [wNative, maxUint256, generalAdapter1],
              type: "aaveV3Withdraw",
            },
            {
              args: [
                mmWNative,
                maxUint256,
                2n * MathLib.RAY,
                client.account.address,
              ],
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
            client.balanceOf({
              erc20: aWNative,
              owner: aaveV3CoreMigrationAdapter,
            }),
            client.balanceOf({
              erc20: wNative,
              owner: aaveV3CoreMigrationAdapter,
            }),
            client.balanceOf({ erc20: aWNative }),
            client.balanceOf({ erc20: mmWNative }),
          ]);

          const userMMBalance = await client.readContract({
            address: mmWNative,
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
          expect(aaveV3Positions[0]).toBeInstanceOf(
            MigratableSupplyPosition_AaveV3,
          );

          const position =
            aaveV3Positions[0] as MigratableSupplyPosition_AaveV3;

          const migrationBundle = position.getMigrationTx(
            {
              vault: mmWNative,
              amount: position.supply,
              maxSharePrice: 2n * MathLib.RAY,
            },
            false,
          );

          expect(migrationBundle.requirements.txs).toHaveLength(1);
          expect(migrationBundle.requirements.signatures).toHaveLength(0);
          expect(migrationBundle.actions).toEqual([
            {
              args: [aWNative, maxUint256, aaveV3CoreMigrationAdapter],
              type: "erc20TransferFrom",
            },
            {
              args: [wNative, maxUint256, generalAdapter1],
              type: "aaveV3Withdraw",
            },
            {
              args: [
                mmWNative,
                maxUint256,
                2n * MathLib.RAY,
                client.account.address,
              ],
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
            client.balanceOf({
              erc20: aWNative,
              owner: aaveV3CoreMigrationAdapter,
            }),
            client.balanceOf({
              erc20: wNative,
              owner: aaveV3CoreMigrationAdapter,
            }),
            client.balanceOf({ erc20: aWNative }),
            client.balanceOf({ erc20: mmWNative }),
          ]);

          const userMMBalance = await client.readContract({
            address: mmWNative,
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
