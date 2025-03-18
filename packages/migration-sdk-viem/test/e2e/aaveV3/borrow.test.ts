import {
  BorrowMigrationLimiter,
  MigratableProtocol,
  SupplyMigrationLimiter,
  fetchMigratablePositions,
  migrationAddressesRegistry,
} from "../../../src/index.js";

import {
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
  addressesRegistry,
} from "@morpho-org/blue-sdk";

import { blueAbi, fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { markets } from "@morpho-org/morpho-test";
import type { ViemTestContext } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  parseEther,
  parseUnits,
} from "viem";
import { readContract, sendTransaction } from "viem/actions";
import { type TestAPI, describe, expect } from "vitest";
import {
  aTokenV3Abi,
  variableDebtTokenV3Abi,
} from "../../../src/abis/aaveV3.js";
import { MigratableBorrowPosition_AaveV3 } from "../../../src/positions/borrow/aaveV3.borrow.js";
import { MigratableSupplyPosition_AaveV3 } from "../../../src/positions/supply/aaveV3.supply.js";
import { test } from "../setup.js";

const TEST_CONFIGS = [
  {
    chainId: ChainId.EthMainnet,
    aWstEth: "0x0B925eD163218f6662a35e0f0371Ac234f9E9371",
    variableDebtToken: "0xeA51d7853EEFb32b6ee06b1C12E6dcCA88Be0fFE",
    testFn: test[ChainId.EthMainnet] as TestAPI<ViemTestContext>,
    marketTo: markets[ChainId.EthMainnet].eth_wstEth_2,
  },
  {
    chainId: ChainId.BaseMainnet,
    aWstEth: "0x99CBC45ea5bb7eF3a5BC08FB1B7E56bB2442Ef0D",
    variableDebtToken: "0x24e6e0795b3c7c71D965fCc4f371803d1c1DcA1E",
    testFn: test[ChainId.BaseMainnet] as TestAPI<ViemTestContext>,
    marketTo: markets[ChainId.BaseMainnet].eth_wstEth,
  },
] as const;

describe("Borrow position on AAVE V3", () => {
  for (const {
    chainId,
    aWstEth,
    testFn,
    marketTo,
    variableDebtToken,
  } of TEST_CONFIGS) {
    const wstEth = marketTo.collateralToken;

    const { pool } = migrationAddressesRegistry[chainId].aaveV3;
    const {
      bundler3: { generalAdapter1, aaveV3CoreMigrationAdapter },
      wNative,
      usdc,
      morpho,
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
          const collateralAmount = parseEther("10");
          const borrowAmount = parseEther("1");

          await writeSupply(client, wstEth, collateralAmount, true);
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
          expect(position.aToken.address).toEqual(aWstEth);
          expect(position.collateral).toBeGreaterThanOrEqual(collateralAmount); //interest accrued
          expect(position.borrow).toBeGreaterThanOrEqual(borrowAmount); //interest accrued
          expect(position.chainId).toEqual(chainId);
          expect(position.collateralToken.address).toEqual(wstEth);
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
          const collateralAmount1 = parseUnits("1000", 6);
          const collateralAmount2 = parseEther("10");
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
          const collateralAmount = parseEther("10");
          const pureSupply = parseUnits("10000", 6);
          const borrowAmount = parseEther("1");

          await writeSupply(client, wstEth, collateralAmount, true);
          await writeSupply(client, usdc, pureSupply, false);
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

          expect(position.collateralToken.address).toBe(wstEth);
        },
      );

      testFn(
        "shouldn't fetch user position if multiple loans",
        async ({ client }) => {
          const collateralAmount = parseEther("10");
          const borrowAmount1 = parseUnits("1000", 6);
          const borrowAmount2 = parseEther("1");

          await writeSupply(client, wstEth, collateralAmount, true);
          await writeBorrow(client, usdc, borrowAmount1);
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
        "should fetch user position with limited liquidity",
        async ({ client }) => {
          const collateralAmount = parseEther("10");
          const borrowAmount = parseEther("5");
          const liquidity = parseEther("6");

          await writeSupply(client, wstEth, collateralAmount, true);
          await writeBorrow(client, wNative, borrowAmount);
          await client.deal({
            erc20: wstEth,
            account: aWstEth,
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

      testFn("should partially migrate user position", async ({ client }) => {
        const collateralAmount = parseEther("10");
        const borrowAmount = parseEther("3");

        const migratedBorrow = borrowAmount / 2n;
        const migratedCollateral = collateralAmount / 2n;

        await writeSupply(client, wstEth, collateralAmount, true);
        await writeBorrow(client, wNative, borrowAmount);

        const allPositions = await fetchMigratablePositions(
          client.account.address,
          client,
          { protocols: [MigratableProtocol.aaveV3] },
        );

        const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
        expect(aaveV3Positions).toBeDefined();
        expect(aaveV3Positions).toHaveLength(1);

        const position = aaveV3Positions[0]! as MigratableBorrowPosition_AaveV3;
        expect(position).toBeInstanceOf(MigratableBorrowPosition_AaveV3);

        // initial share price is 10^-6 because of virtual shares
        const minSharePrice = parseUnits("1", 21);

        const migrationBundle = position.getMigrationTx(
          {
            marketTo,
            borrowAmount: migratedBorrow,
            collateralAmount: migratedCollateral,
            minSharePrice,
          },
          true,
        );

        expect(migrationBundle.requirements.txs).toHaveLength(0);
        expect(migrationBundle.requirements.signatures).toHaveLength(2);
        expect(migrationBundle.actions).toEqual([
          {
            args: [
              {
                authorizer: client.account.address,
                authorized: generalAdapter1,
                isAuthorized: true,
                deadline: expect.any(BigInt),
                nonce: 0n,
              },
              null,
            ],
            type: "morphoSetAuthorizationWithSig",
          },
          {
            args: [
              client.account.address,
              aWstEth,
              migratedCollateral,
              expect.any(BigInt),
              null,
            ],
            type: "permit",
          },
          {
            args: [
              marketTo,
              migratedCollateral,
              client.account.address,
              [
                {
                  type: "morphoBorrow",
                  args: [
                    marketTo,
                    migratedBorrow,
                    0n,
                    minSharePrice,
                    aaveV3CoreMigrationAdapter,
                  ],
                },
                {
                  type: "aaveV3Repay",
                  args: [wNative, maxUint256, client.account.address, 2n],
                },
                {
                  type: "erc20TransferFrom",
                  args: [
                    aWstEth,
                    migratedCollateral,
                    aaveV3CoreMigrationAdapter,
                  ],
                },
                {
                  type: "aaveV3Withdraw",
                  args: [wstEth, migratedCollateral, generalAdapter1],
                },
              ],
            ],
            type: "morphoSupplyCollateral",
          },
          {
            type: "erc20Transfer",
            args: [aWstEth, client.account.address, maxUint256],
          },
        ]);

        await migrationBundle.requirements.signatures[0]!.sign(client);
        await migrationBundle.requirements.signatures[1]!.sign(client);

        await sendTransaction(client, migrationBundle.tx());

        const transferredAssets = [wNative, wstEth, aWstEth];
        const adapters = [generalAdapter1, aaveV3CoreMigrationAdapter];

        const [
          finalPositionTo,
          finalCollateralFrom,
          finalDebtFrom,
          adaptersBalances,
        ] = await Promise.all([
          fetchAccrualPosition(client.account.address, marketTo.id, client),
          readContract(client, {
            abi: aTokenV3Abi,
            address: aWstEth,
            functionName: "balanceOf",
            args: [client.account.address],
          }),
          readContract(client, {
            abi: variableDebtTokenV3Abi,
            address: variableDebtToken,
            functionName: "balanceOf",
            args: [client.account.address],
          }),
          Promise.all(
            transferredAssets.flatMap((asset) =>
              adapters.map(async (adapter) => ({
                balance: await readContract(client, {
                  abi: erc20Abi,
                  address: asset,
                  functionName: "balanceOf",
                  args: [adapter],
                }),
                asset,
                adapter,
              })),
            ),
          ),
        ]);

        expect(finalPositionTo.collateral).toEqual(migratedCollateral);
        expect(finalPositionTo.borrowAssets).approximately(migratedBorrow, 2n);

        expect(finalCollateralFrom).toBeGreaterThan(
          collateralAmount - migratedCollateral,
        );
        expect(finalCollateralFrom).toBeLessThan(
          collateralAmount - migratedCollateral + 10n ** 12n,
        ); // interest accrued (empirical)

        expect(finalDebtFrom).toBeGreaterThan(borrowAmount - migratedBorrow);
        expect(finalDebtFrom).toBeLessThan(
          borrowAmount - migratedBorrow + 10n ** 12n,
        ); // interest accrued (empirical)

        for (const { balance, asset, adapter } of adaptersBalances) {
          expect(balance).to.equal(
            0n,
            `Adapter ${adapter} shouldn't hold ${asset}.`,
          );
        }
      });

      testFn("should fully migrate user position", async ({ client }) => {
        const collateralAmount = parseEther("10");
        const borrowAmount = parseEther("3");

        await writeSupply(client, wstEth, collateralAmount, true);
        await writeBorrow(client, wNative, borrowAmount);

        const allPositions = await fetchMigratablePositions(
          client.account.address,
          client,
          { protocols: [MigratableProtocol.aaveV3] },
        );

        const aaveV3Positions = allPositions[MigratableProtocol.aaveV3]!;
        expect(aaveV3Positions).toBeDefined();
        expect(aaveV3Positions).toHaveLength(1);

        const position = aaveV3Positions[0]! as MigratableBorrowPosition_AaveV3;
        expect(position).toBeInstanceOf(MigratableBorrowPosition_AaveV3);

        // initial share price is 10^-6 because of virtual shares
        const minSharePrice = parseUnits("1", 21);

        const migrationBundle = position.getMigrationTx(
          {
            marketTo,
            borrowAmount: position.borrow,
            collateralAmount: position.collateral,
            minSharePrice,
          },
          true,
        );

        expect(migrationBundle.requirements.txs).toHaveLength(0);
        expect(migrationBundle.requirements.signatures).toHaveLength(2);
        expect(migrationBundle.actions).toEqual([
          {
            args: [
              {
                authorizer: client.account.address,
                authorized: generalAdapter1,
                isAuthorized: true,
                deadline: expect.any(BigInt),
                nonce: 0n,
              },
              null,
            ],
            type: "morphoSetAuthorizationWithSig",
          },
          {
            args: [
              client.account.address,
              aWstEth,
              maxUint256,
              expect.any(BigInt),
              null,
            ],
            type: "permit",
          },
          {
            args: [
              marketTo,
              position.collateral,
              client.account.address,
              [
                {
                  type: "morphoBorrow",
                  args: [
                    marketTo,
                    MathLib.wMulUp(
                      borrowAmount,
                      MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE,
                    ),
                    0n,
                    minSharePrice,
                    aaveV3CoreMigrationAdapter,
                  ],
                },
                {
                  type: "aaveV3Repay",
                  args: [wNative, maxUint256, client.account.address, 2n],
                },
                {
                  type: "erc20Transfer",
                  args: [
                    marketTo.loanToken,
                    generalAdapter1,
                    maxUint256,
                    aaveV3CoreMigrationAdapter,
                  ],
                },
                {
                  type: "morphoRepay",
                  args: [
                    marketTo,
                    maxUint256,
                    0n,
                    maxUint256,
                    client.account.address,
                    [],
                  ],
                },
                {
                  type: "erc20TransferFrom",
                  args: [aWstEth, maxUint256, aaveV3CoreMigrationAdapter],
                },
                {
                  type: "aaveV3Withdraw",
                  args: [wstEth, maxUint256, generalAdapter1],
                },
              ],
            ],
            type: "morphoSupplyCollateral",
          },
          {
            type: "erc20Transfer",
            args: [wstEth, client.account.address, maxUint256],
          },
        ]);

        await migrationBundle.requirements.signatures[0]!.sign(client);
        await migrationBundle.requirements.signatures[1]!.sign(client);

        await sendTransaction(client, migrationBundle.tx());

        const transferredAssets = [wNative, wstEth, aWstEth];
        const adapters = [generalAdapter1, aaveV3CoreMigrationAdapter];

        const [
          finalPositionTo,
          finalCollateralFrom,
          finalDebtFrom,
          adaptersBalances,
        ] = await Promise.all([
          fetchAccrualPosition(client.account.address, marketTo.id, client),
          readContract(client, {
            abi: aTokenV3Abi,
            address: aWstEth,
            functionName: "balanceOf",
            args: [client.account.address],
          }),
          readContract(client, {
            abi: variableDebtTokenV3Abi,
            address: variableDebtToken,
            functionName: "balanceOf",
            args: [client.account.address],
          }),
          Promise.all(
            transferredAssets.flatMap((asset) =>
              adapters.map(async (adapter) => ({
                balance: await readContract(client, {
                  abi: erc20Abi,
                  address: asset,
                  functionName: "balanceOf",
                  args: [adapter],
                }),
                asset,
                adapter,
              })),
            ),
          ),
        ]);

        expect(finalPositionTo.collateral).toBeGreaterThan(collateralAmount);
        expect(finalPositionTo.collateral).toBeLessThanOrEqual(
          collateralAmount + 10n ** 12n,
        ); // interest accrued (empirical)
        expect(finalPositionTo.borrowAssets).toBeGreaterThan(borrowAmount);
        expect(finalPositionTo.borrowAssets).toBeLessThanOrEqual(
          borrowAmount + 10n ** 12n,
        ); // interest accrued (empirical)

        expect(finalCollateralFrom).toBe(0n);
        expect(finalDebtFrom).toBe(0n);

        for (const { balance, asset, adapter } of adaptersBalances) {
          expect(balance).to.equal(
            0n,
            `Adapter ${adapter} shouldn't hold ${asset}.`,
          );
        }
      });

      testFn(
        "should partially migrate user position without signature",
        async ({ client }) => {
          const collateralAmount = parseEther("10");
          const borrowAmount = parseEther("3");

          const migratedBorrow = borrowAmount / 2n;
          const migratedCollateral = collateralAmount / 2n;

          await writeSupply(client, wstEth, collateralAmount, true);
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

          // initial share price is 10^-6 because of virtual shares
          const minSharePrice = parseUnits("1", 21);

          const migrationBundle = position.getMigrationTx(
            {
              marketTo,
              borrowAmount: migratedBorrow,
              collateralAmount: migratedCollateral,
              minSharePrice,
            },
            false,
          );

          expect(migrationBundle.requirements.signatures).toHaveLength(0);
          expect(migrationBundle.requirements.txs).toHaveLength(2);
          expect(migrationBundle.requirements.txs[0]).toEqual({
            type: "morphoSetAuthorization",
            args: [generalAdapter1, true],
            tx: {
              to: morpho,
              data: encodeFunctionData({
                abi: blueAbi,
                functionName: "setAuthorization",
                args: [generalAdapter1, true],
              }),
            },
          });
          expect(migrationBundle.requirements.txs[1]).toEqual({
            type: "erc20Approve",
            args: [aWstEth, generalAdapter1, migratedCollateral],
            tx: {
              to: aWstEth,
              data: encodeFunctionData({
                abi: aTokenV3Abi,
                functionName: "approve",
                args: [generalAdapter1, migratedCollateral],
              }),
            },
          });

          expect(migrationBundle.actions).toEqual([
            {
              args: [
                marketTo,
                migratedCollateral,
                client.account.address,
                [
                  {
                    type: "morphoBorrow",
                    args: [
                      marketTo,
                      migratedBorrow,
                      0n,
                      minSharePrice,
                      aaveV3CoreMigrationAdapter,
                    ],
                  },
                  {
                    type: "aaveV3Repay",
                    args: [wNative, maxUint256, client.account.address, 2n],
                  },
                  {
                    type: "erc20TransferFrom",
                    args: [
                      aWstEth,
                      migratedCollateral,
                      aaveV3CoreMigrationAdapter,
                    ],
                  },
                  {
                    type: "aaveV3Withdraw",
                    args: [wstEth, migratedCollateral, generalAdapter1],
                  },
                ],
              ],
              type: "morphoSupplyCollateral",
            },
            {
              type: "erc20Transfer",
              args: [aWstEth, client.account.address, maxUint256],
            },
          ]);

          await sendTransaction(
            client,
            migrationBundle.requirements.txs[0]!.tx,
          );
          await sendTransaction(
            client,
            migrationBundle.requirements.txs[1]!.tx,
          );

          await sendTransaction(client, migrationBundle.tx());

          const transferredAssets = [wNative, wstEth, aWstEth];
          const adapters = [generalAdapter1, aaveV3CoreMigrationAdapter];

          const [
            finalPositionTo,
            finalCollateralFrom,
            finalDebtFrom,
            adaptersBalances,
          ] = await Promise.all([
            fetchAccrualPosition(client.account.address, marketTo.id, client),
            readContract(client, {
              abi: aTokenV3Abi,
              address: aWstEth,
              functionName: "balanceOf",
              args: [client.account.address],
            }),
            readContract(client, {
              abi: variableDebtTokenV3Abi,
              address: variableDebtToken,
              functionName: "balanceOf",
              args: [client.account.address],
            }),
            Promise.all(
              transferredAssets.flatMap((asset) =>
                adapters.map(async (adapter) => ({
                  balance: await readContract(client, {
                    abi: erc20Abi,
                    address: asset,
                    functionName: "balanceOf",
                    args: [adapter],
                  }),
                  asset,
                  adapter,
                })),
              ),
            ),
          ]);

          expect(finalPositionTo.collateral).toEqual(migratedCollateral);
          expect(finalPositionTo.borrowAssets).approximately(
            migratedBorrow,
            2n,
          );

          expect(finalCollateralFrom).toBeGreaterThan(
            collateralAmount - migratedCollateral,
          );
          expect(finalCollateralFrom).toBeLessThan(
            collateralAmount - migratedCollateral + 10n ** 12n,
          ); // interest accrued (empirical)

          expect(finalDebtFrom).toBeGreaterThan(borrowAmount - migratedBorrow);
          expect(finalDebtFrom).toBeLessThan(
            borrowAmount - migratedBorrow + 10n ** 12n,
          ); // interest accrued (empirical)

          for (const { balance, asset, adapter } of adaptersBalances) {
            expect(balance).to.equal(
              0n,
              `Adapter ${adapter} shouldn't hold ${asset}.`,
            );
          }
        },
      );

      testFn(
        "should fully migrate user position without signature",
        async ({ client }) => {
          const collateralAmount = parseEther("10");
          const borrowAmount = parseEther("3");

          await writeSupply(client, wstEth, collateralAmount, true);
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

          // initial share price is 10^-6 because of virtual shares
          const minSharePrice = parseUnits("1", 21);

          const migrationBundle = position.getMigrationTx(
            {
              marketTo,
              borrowAmount: position.borrow,
              collateralAmount: position.collateral,
              minSharePrice,
            },
            false,
          );

          expect(migrationBundle.requirements.signatures).toHaveLength(0);
          expect(migrationBundle.requirements.txs).toHaveLength(2);
          expect(migrationBundle.requirements.txs[0]).toEqual({
            type: "morphoSetAuthorization",
            args: [generalAdapter1, true],
            tx: {
              to: morpho,
              data: encodeFunctionData({
                abi: blueAbi,
                functionName: "setAuthorization",
                args: [generalAdapter1, true],
              }),
            },
          });
          expect(migrationBundle.requirements.txs[1]).toEqual({
            type: "erc20Approve",
            args: [aWstEth, generalAdapter1, maxUint256],
            tx: {
              to: aWstEth,
              data: encodeFunctionData({
                abi: aTokenV3Abi,
                functionName: "approve",
                args: [generalAdapter1, maxUint256],
              }),
            },
          });

          expect(migrationBundle.actions).toEqual([
            {
              args: [
                marketTo,
                position.collateral,
                client.account.address,
                [
                  {
                    type: "morphoBorrow",
                    args: [
                      marketTo,
                      MathLib.wMulUp(
                        borrowAmount,
                        MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE,
                      ),
                      0n,
                      minSharePrice,
                      aaveV3CoreMigrationAdapter,
                    ],
                  },
                  {
                    type: "aaveV3Repay",
                    args: [wNative, maxUint256, client.account.address, 2n],
                  },
                  {
                    type: "erc20Transfer",
                    args: [
                      marketTo.loanToken,
                      generalAdapter1,
                      maxUint256,
                      aaveV3CoreMigrationAdapter,
                    ],
                  },
                  {
                    type: "morphoRepay",
                    args: [
                      marketTo,
                      maxUint256,
                      0n,
                      maxUint256,
                      client.account.address,
                      [],
                    ],
                  },
                  {
                    type: "erc20TransferFrom",
                    args: [aWstEth, maxUint256, aaveV3CoreMigrationAdapter],
                  },
                  {
                    type: "aaveV3Withdraw",
                    args: [wstEth, maxUint256, generalAdapter1],
                  },
                ],
              ],
              type: "morphoSupplyCollateral",
            },
            {
              type: "erc20Transfer",
              args: [wstEth, client.account.address, maxUint256],
            },
          ]);

          await sendTransaction(
            client,
            migrationBundle.requirements.txs[0]!.tx,
          );
          await sendTransaction(
            client,
            migrationBundle.requirements.txs[1]!.tx,
          );

          await sendTransaction(client, migrationBundle.tx());

          const transferredAssets = [wNative, wstEth, aWstEth];
          const adapters = [generalAdapter1, aaveV3CoreMigrationAdapter];

          const [
            finalPositionTo,
            finalCollateralFrom,
            finalDebtFrom,
            adaptersBalances,
          ] = await Promise.all([
            fetchAccrualPosition(client.account.address, marketTo.id, client),
            readContract(client, {
              abi: aTokenV3Abi,
              address: aWstEth,
              functionName: "balanceOf",
              args: [client.account.address],
            }),
            readContract(client, {
              abi: variableDebtTokenV3Abi,
              address: variableDebtToken,
              functionName: "balanceOf",
              args: [client.account.address],
            }),
            Promise.all(
              transferredAssets.flatMap((asset) =>
                adapters.map(async (adapter) => ({
                  balance: await readContract(client, {
                    abi: erc20Abi,
                    address: asset,
                    functionName: "balanceOf",
                    args: [adapter],
                  }),
                  asset,
                  adapter,
                })),
              ),
            ),
          ]);

          expect(finalPositionTo.collateral).toBeGreaterThan(collateralAmount);
          expect(finalPositionTo.collateral).toBeLessThanOrEqual(
            collateralAmount + 10n ** 12n,
          ); // interest accrued (empirical)
          expect(finalPositionTo.borrowAssets).toBeGreaterThan(borrowAmount);
          expect(finalPositionTo.borrowAssets).toBeLessThanOrEqual(
            borrowAmount + 10n ** 12n,
          ); // interest accrued (empirical)

          expect(finalCollateralFrom).toBe(0n);
          expect(finalDebtFrom).toBe(0n);

          for (const { balance, asset, adapter } of adaptersBalances) {
            expect(balance).to.equal(
              0n,
              `Adapter ${adapter} shouldn't hold ${asset}.`,
            );
          }
        },
      );

      testFn(
        "should partially migrate user position limited by aave v3 liquidity",
        async ({ client }) => {
          const collateralAmount = parseEther("10");
          const borrowAmount = parseEther("3");

          const liquidity = parseEther("4");

          const migratedBorrow = parseEther("1.5");

          await writeSupply(client, wstEth, collateralAmount, true);
          await writeBorrow(client, wNative, borrowAmount);
          await client.deal({
            erc20: wstEth,
            account: aWstEth,
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
          expect(position.maxWithdraw.limiter).toEqual(
            SupplyMigrationLimiter.liquidity,
          );

          // initial share price is 10^-6 because of virtual shares
          const minSharePrice = parseUnits("1", 21);

          const migrationBundle = position.getMigrationTx(
            {
              marketTo,
              borrowAmount: migratedBorrow,
              collateralAmount: position.maxWithdraw.value,
              minSharePrice,
            },
            true,
          );

          expect(migrationBundle.requirements.txs).toHaveLength(0);
          expect(migrationBundle.requirements.signatures).toHaveLength(2);
          expect(migrationBundle.actions).toEqual([
            {
              args: [
                {
                  authorizer: client.account.address,
                  authorized: generalAdapter1,
                  isAuthorized: true,
                  deadline: expect.any(BigInt),
                  nonce: 0n,
                },
                null,
              ],
              type: "morphoSetAuthorizationWithSig",
            },
            {
              args: [
                client.account.address,
                aWstEth,
                liquidity,
                expect.any(BigInt),
                null,
              ],
              type: "permit",
            },
            {
              args: [
                marketTo,
                liquidity,
                client.account.address,
                [
                  {
                    type: "morphoBorrow",
                    args: [
                      marketTo,
                      migratedBorrow,
                      0n,
                      minSharePrice,
                      aaveV3CoreMigrationAdapter,
                    ],
                  },
                  {
                    type: "aaveV3Repay",
                    args: [wNative, maxUint256, client.account.address, 2n],
                  },
                  {
                    type: "erc20TransferFrom",
                    args: [aWstEth, liquidity, aaveV3CoreMigrationAdapter],
                  },
                  {
                    type: "aaveV3Withdraw",
                    args: [wstEth, liquidity, generalAdapter1],
                  },
                ],
              ],
              type: "morphoSupplyCollateral",
            },
            {
              type: "erc20Transfer",
              args: [aWstEth, client.account.address, maxUint256],
            },
          ]);

          await migrationBundle.requirements.signatures[0]!.sign(client);
          await migrationBundle.requirements.signatures[1]!.sign(client);

          await sendTransaction(client, migrationBundle.tx());

          const transferredAssets = [wNative, wstEth, aWstEth];
          const adapters = [generalAdapter1, aaveV3CoreMigrationAdapter];

          const [
            finalPositionTo,
            finalCollateralFrom,
            finalDebtFrom,
            adaptersBalances,
          ] = await Promise.all([
            fetchAccrualPosition(client.account.address, marketTo.id, client),
            readContract(client, {
              abi: aTokenV3Abi,
              address: aWstEth,
              functionName: "balanceOf",
              args: [client.account.address],
            }),
            readContract(client, {
              abi: variableDebtTokenV3Abi,
              address: variableDebtToken,
              functionName: "balanceOf",
              args: [client.account.address],
            }),
            Promise.all(
              transferredAssets.flatMap((asset) =>
                adapters.map(async (adapter) => ({
                  balance: await readContract(client, {
                    abi: erc20Abi,
                    address: asset,
                    functionName: "balanceOf",
                    args: [adapter],
                  }),
                  asset,
                  adapter,
                })),
              ),
            ),
          ]);

          expect(finalPositionTo.collateral).toEqual(liquidity);
          expect(finalPositionTo.borrowAssets).approximately(
            migratedBorrow,
            2n,
          );

          expect(finalCollateralFrom).toBeGreaterThan(
            collateralAmount - liquidity,
          );
          expect(finalCollateralFrom).toBeLessThan(
            collateralAmount - liquidity + 10n ** 12n,
          ); // interest accrued (empirical)

          expect(finalDebtFrom).toBeGreaterThan(borrowAmount - migratedBorrow);
          expect(finalDebtFrom).toBeLessThan(
            borrowAmount - migratedBorrow + 10n ** 12n,
          ); // interest accrued (empirical)

          for (const { balance, asset, adapter } of adaptersBalances) {
            expect(balance).to.equal(
              0n,
              `Adapter ${adapter} shouldn't hold ${asset}.`,
            );
          }
        },
      );
    });
  }
});
