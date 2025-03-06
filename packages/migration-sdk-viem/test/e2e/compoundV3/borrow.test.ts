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
  type MarketParams,
  MathLib,
  addressesRegistry,
} from "@morpho-org/blue-sdk";

import { markets } from "@morpho-org/morpho-test";
import { entries } from "@morpho-org/morpho-ts";
import type { ViemTestContext } from "@morpho-org/test/vitest";
import {
  type Address,
  erc20Abi,
  maxUint256,
  parseEther,
  parseUnits,
} from "viem";
import { type TestAPI, describe, expect } from "vitest";

import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { sendTransaction } from "viem/actions";
import { cometAbi, cometExtAbi } from "../../../src/abis/compoundV3.js";
import { MigratableBorrowPosition_CompoundV3 } from "../../../src/positions/borrow/compoundV3.borrow.js";
import { test } from "../setup.js";

interface ChainConfig<C extends ChainId.EthMainnet | ChainId.BaseMainnet> {
  chainId: C;
  testFn: TestAPI<ViemTestContext>;
  markets: {
    [Ch in C]: {
      [K in Exclude<
        keyof (typeof migrationAddressesRegistry)[Ch][MigratableProtocol.compoundV3],
        "comptroller"
      >]: {
        marketTo: MarketParams;
        comet: Address;
        collateralAmount: bigint;
        borrowAmount: bigint;
        extraCollateral: Address;
      };
    };
  }[C];
}

const TEST_CONFIGS: {
  [C in ChainId.EthMainnet | ChainId.BaseMainnet]: ChainConfig<C>;
}[ChainId.EthMainnet | ChainId.BaseMainnet][] = [
  {
    chainId: ChainId.EthMainnet,
    testFn: test[ChainId.EthMainnet],
    markets: {
      weth: {
        marketTo: markets[ChainId.EthMainnet].eth_wstEth_2,
        comet:
          migrationAddressesRegistry[ChainId.EthMainnet][
            MigratableProtocol.compoundV3
          ].weth.address,
        borrowAmount: parseEther("1"),
        collateralAmount: parseEther("10"),
        extraCollateral: "0xae78736Cd615f374D3085123A210448E74Fc6393", // rEth
      },
      usdc: {
        marketTo: markets[ChainId.EthMainnet].usdc_wbtc,
        comet:
          migrationAddressesRegistry[ChainId.EthMainnet][
            MigratableProtocol.compoundV3
          ].usdc.address,
        borrowAmount: parseUnits("1000", 6),
        collateralAmount: parseUnits("1", 8),
        extraCollateral: addressesRegistry[ChainId.EthMainnet].wNative,
      },
    },
  },
  {
    chainId: ChainId.BaseMainnet,
    //@ts-expect-error
    testFn: test[ChainId.BaseMainnet],
    markets: {
      weth: {
        marketTo: markets[ChainId.BaseMainnet].eth_wstEth,
        comet:
          migrationAddressesRegistry[ChainId.BaseMainnet][
            MigratableProtocol.compoundV3
          ].weth.address,
        borrowAmount: parseEther("1"),
        collateralAmount: parseEther("10"),
        extraCollateral: addressesRegistry[ChainId.BaseMainnet].usdc,
      },
      usdc: {
        marketTo: markets[ChainId.BaseMainnet].usdc_eth,
        comet:
          migrationAddressesRegistry[ChainId.BaseMainnet][
            MigratableProtocol.compoundV3
          ].usdc.address,
        borrowAmount: parseUnits("1000", 6),
        collateralAmount: parseEther("1"),
        extraCollateral: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452", //wstEth
      },
    },
  },
];

describe("Borrow position on COMPOUND V3", () => {
  for (const { chainId, testFn, markets } of TEST_CONFIGS) {
    const {
      bundler3: { generalAdapter1, compoundV3MigrationAdapter },
    } = addressesRegistry[chainId];

    const writeSupplyCollateral = async (
      client: ViemTestContext["client"],
      comet: Address,
      underlying: Address,
      amount: bigint,
    ) => {
      await client.deal({
        erc20: underlying,
        amount,
      });

      await client.approve({
        address: underlying,
        args: [comet, amount],
      });

      await client.writeContract({
        abi: cometAbi,
        address: comet,
        functionName: "supply",
        args: [underlying, amount],
      });

      await client.mine({ blocks: 500 }); //accrue some interests
    };

    const writeBorrow = async (
      client: ViemTestContext["client"],
      comet: Address,
      baseToken: Address,
      amount: bigint,
    ) => {
      await client.writeContract({
        abi: cometAbi,
        address: comet,
        functionName: "withdraw",
        args: [baseToken, amount],
      });
    };

    describe(`on chain ${chainId}`, async () => {
      for (const [
        instanceName,
        { comet, marketTo, collateralAmount, borrowAmount, extraCollateral },
      ] of entries(markets)) {
        const { collateralToken, loanToken } = marketTo;

        describe(`on ${instanceName} instance`, () => {
          testFn("should fetch user position", async ({ client }) => {
            await writeSupplyCollateral(
              client,
              comet,
              collateralToken,
              collateralAmount,
            );
            await writeBorrow(client, comet, loanToken, borrowAmount);

            const allPositions = await fetchMigratablePositions(
              client.account.address,
              client,
              { protocols: [MigratableProtocol.compoundV3] },
            );

            const compoundV3Positions =
              allPositions[MigratableProtocol.compoundV3]!;
            expect(compoundV3Positions).toBeDefined();

            expect(compoundV3Positions).toHaveLength(1);

            const position =
              compoundV3Positions[0]! as MigratableBorrowPosition_CompoundV3;
            expect(position).toBeInstanceOf(
              MigratableBorrowPosition_CompoundV3,
            );

            expect(position.protocol).toEqual(MigratableProtocol.compoundV3);
            expect(position.user).toEqual(client.account.address);
            expect(position.nonce).toEqual(0n);
            expect(position.cometAddress).toEqual(comet);
            expect(position.collateral).toBeGreaterThanOrEqual(
              collateralAmount,
            ); //interest accrued
            expect(position.borrow).toBeGreaterThanOrEqual(borrowAmount); //interest accrued
            expect(position.chainId).toEqual(chainId);
            expect(position.collateralToken.address).toEqual(collateralToken);
            expect(position.loanToken.address).toEqual(loanToken);
            expect(position.maxRepay.limiter).toEqual(
              BorrowMigrationLimiter.position,
            );
            expect(position.maxRepay.value).toEqual(position.borrow);
            expect(position.maxWithdraw.limiter).toEqual(
              SupplyMigrationLimiter.position,
            );
            expect(position.maxWithdraw.value).toEqual(position.collateral);
          });

          testFn(
            "shouldn't fetch user position if multiple collaterals",
            async ({ client }) => {
              const extraCollateralAmount = 1000n;

              await writeSupplyCollateral(
                client,
                comet,
                extraCollateral,
                extraCollateralAmount,
              );
              await writeSupplyCollateral(
                client,
                comet,
                collateralToken,
                collateralAmount,
              );
              await writeBorrow(client, comet, loanToken, borrowAmount);

              const allPositions = await fetchMigratablePositions(
                client.account.address,
                client,
                { protocols: [MigratableProtocol.compoundV3] },
              );

              const compoundV3Positions =
                allPositions[MigratableProtocol.compoundV3]!;
              expect(compoundV3Positions).toBeDefined();
              expect(compoundV3Positions).toHaveLength(0);
            },
          );

          testFn(
            "Should partially migrate user position",
            async ({ client }) => {
              const migratedBorrow = borrowAmount / 2n;
              const migratedCollateral = collateralAmount / 2n;

              await writeSupplyCollateral(
                client,
                comet,
                collateralToken,
                collateralAmount,
              );
              await writeBorrow(client, comet, loanToken, borrowAmount);

              const allPositions = await fetchMigratablePositions(
                client.account.address,
                client,
                { protocols: [MigratableProtocol.compoundV3] },
              );

              const compoundV3Positions =
                allPositions[MigratableProtocol.compoundV3]!;
              expect(compoundV3Positions).toBeDefined();

              expect(compoundV3Positions).toHaveLength(1);

              const position =
                compoundV3Positions[0]! as MigratableBorrowPosition_CompoundV3;
              expect(position).toBeInstanceOf(
                MigratableBorrowPosition_CompoundV3,
              );

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
                    comet,
                    client.account.address,
                    true,
                    0n,
                    expect.any(BigInt),
                    null,
                  ],
                  type: "compoundV3AllowBySig",
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
                          compoundV3MigrationAdapter,
                        ],
                      },
                      {
                        type: "compoundV3Repay",
                        args: [comet, maxUint256, client.account.address],
                      },
                      {
                        type: "compoundV3WithdrawFrom",
                        args: [
                          comet,
                          collateralToken,
                          migratedCollateral,
                          generalAdapter1,
                        ],
                      },
                    ],
                  ],
                  type: "morphoSupplyCollateral",
                },
              ]);

              await migrationBundle.requirements.signatures[0]!.sign(client);
              await migrationBundle.requirements.signatures[1]!.sign(client);

              await sendTransaction(client, migrationBundle.tx());

              const transferredAssets = [collateralToken, loanToken];
              const adapters = [generalAdapter1, compoundV3MigrationAdapter];

              const [
                finalPositionTo,
                finalCollateralFrom,
                finalDebtFrom,
                adaptersBalances,
              ] = await Promise.all([
                fetchAccrualPosition(
                  client.account.address,
                  marketTo.id,
                  client,
                ),
                client.readContract({
                  abi: cometExtAbi,
                  address: comet,
                  functionName: "collateralBalanceOf",
                  args: [client.account.address, collateralToken],
                }),
                client.readContract({
                  abi: cometAbi,
                  address: comet,
                  functionName: "borrowBalanceOf",
                  args: [client.account.address],
                }),
                Promise.all(
                  transferredAssets.flatMap((asset) =>
                    adapters.map(async (adapter) => ({
                      balance: await client.readContract({
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

              expect(finalCollateralFrom).toEqual(
                collateralAmount - migratedCollateral,
              );

              expect(finalDebtFrom).toBeGreaterThan(
                borrowAmount - migratedBorrow,
              );
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

          testFn("Should fully migrate user position", async ({ client }) => {
            await writeSupplyCollateral(
              client,
              comet,
              collateralToken,
              collateralAmount,
            );
            await writeBorrow(client, comet, loanToken, borrowAmount);

            const allPositions = await fetchMigratablePositions(
              client.account.address,
              client,
              { protocols: [MigratableProtocol.compoundV3] },
            );

            const compoundV3Positions =
              allPositions[MigratableProtocol.compoundV3]!;
            expect(compoundV3Positions).toBeDefined();

            expect(compoundV3Positions).toHaveLength(1);

            const position =
              compoundV3Positions[0]! as MigratableBorrowPosition_CompoundV3;
            expect(position).toBeInstanceOf(
              MigratableBorrowPosition_CompoundV3,
            );

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
                  comet,
                  client.account.address,
                  true,
                  0n,
                  expect.any(BigInt),
                  null,
                ],
                type: "compoundV3AllowBySig",
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
                          position.borrow,
                          MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE,
                        ),
                        0n,
                        minSharePrice,
                        compoundV3MigrationAdapter,
                      ],
                    },
                    {
                      type: "compoundV3Repay",
                      args: [comet, maxUint256, client.account.address],
                    },
                    {
                      type: "erc20Transfer",
                      args: [
                        loanToken,
                        generalAdapter1,
                        maxUint256,
                        compoundV3MigrationAdapter,
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
                      type: "compoundV3WithdrawFrom",
                      args: [
                        comet,
                        collateralToken,
                        position.collateral,
                        generalAdapter1,
                      ],
                    },
                  ],
                ],
                type: "morphoSupplyCollateral",
              },
            ]);

            await migrationBundle.requirements.signatures[0]!.sign(client);
            await migrationBundle.requirements.signatures[1]!.sign(client);

            await sendTransaction(client, migrationBundle.tx());

            const transferredAssets = [collateralToken, loanToken];
            const adapters = [generalAdapter1, compoundV3MigrationAdapter];

            const [
              finalPositionTo,
              finalCollateralFrom,
              finalDebtFrom,
              adaptersBalances,
            ] = await Promise.all([
              fetchAccrualPosition(client.account.address, marketTo.id, client),
              client.readContract({
                abi: cometExtAbi,
                address: comet,
                functionName: "collateralBalanceOf",
                args: [client.account.address, collateralToken],
              }),
              client.readContract({
                abi: cometAbi,
                address: comet,
                functionName: "borrowBalanceOf",
                args: [client.account.address],
              }),
              Promise.all(
                transferredAssets.flatMap((asset) =>
                  adapters.map(async (adapter) => ({
                    balance: await client.readContract({
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

            expect(finalPositionTo.collateral).toEqual(collateralAmount);
            expect(finalPositionTo.borrowAssets).toBeGreaterThan(borrowAmount);
            expect(finalPositionTo.borrowAssets).toBeLessThanOrEqual(
              borrowAmount + 10n ** 12n,
            ); // interest accrued (empirical)

            expect(finalCollateralFrom).toEqual(0n);

            expect(finalDebtFrom).toEqual(0n);

            for (const { balance, asset, adapter } of adaptersBalances) {
              expect(balance).to.equal(
                0n,
                `Adapter ${adapter} shouldn't hold ${asset}.`,
              );
            }
          });

          testFn(
            "Should partially migrate user position without signature",
            async ({ client }) => {
              const migratedBorrow = borrowAmount / 2n;
              const migratedCollateral = collateralAmount / 2n;

              await writeSupplyCollateral(
                client,
                comet,
                collateralToken,
                collateralAmount,
              );
              await writeBorrow(client, comet, loanToken, borrowAmount);

              const allPositions = await fetchMigratablePositions(
                client.account.address,
                client,
                { protocols: [MigratableProtocol.compoundV3] },
              );

              const compoundV3Positions =
                allPositions[MigratableProtocol.compoundV3]!;
              expect(compoundV3Positions).toBeDefined();

              expect(compoundV3Positions).toHaveLength(1);

              const position =
                compoundV3Positions[0]! as MigratableBorrowPosition_CompoundV3;
              expect(position).toBeInstanceOf(
                MigratableBorrowPosition_CompoundV3,
              );

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

              expect(migrationBundle.requirements.txs).toHaveLength(2);
              expect(migrationBundle.requirements.signatures).toHaveLength(0);
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
                          compoundV3MigrationAdapter,
                        ],
                      },
                      {
                        type: "compoundV3Repay",
                        args: [comet, maxUint256, client.account.address],
                      },
                      {
                        type: "compoundV3WithdrawFrom",
                        args: [
                          comet,
                          collateralToken,
                          migratedCollateral,
                          generalAdapter1,
                        ],
                      },
                    ],
                  ],
                  type: "morphoSupplyCollateral",
                },
              ]);

              for (const tx of migrationBundle.txs())
                await sendTransaction(client, tx);

              const transferredAssets = [collateralToken, loanToken];
              const adapters = [generalAdapter1, compoundV3MigrationAdapter];

              const [
                finalPositionTo,
                finalCollateralFrom,
                finalDebtFrom,
                adaptersBalances,
              ] = await Promise.all([
                fetchAccrualPosition(
                  client.account.address,
                  marketTo.id,
                  client,
                ),
                client.readContract({
                  abi: cometExtAbi,
                  address: comet,
                  functionName: "collateralBalanceOf",
                  args: [client.account.address, collateralToken],
                }),
                client.readContract({
                  abi: cometAbi,
                  address: comet,
                  functionName: "borrowBalanceOf",
                  args: [client.account.address],
                }),
                Promise.all(
                  transferredAssets.flatMap((asset) =>
                    adapters.map(async (adapter) => ({
                      balance: await client.readContract({
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

              expect(finalCollateralFrom).toEqual(
                collateralAmount - migratedCollateral,
              );

              expect(finalDebtFrom).toBeGreaterThan(
                borrowAmount - migratedBorrow,
              );
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
            "Should fully migrate user position without signature",
            async ({ client }) => {
              await writeSupplyCollateral(
                client,
                comet,
                collateralToken,
                collateralAmount,
              );
              await writeBorrow(client, comet, loanToken, borrowAmount);

              const allPositions = await fetchMigratablePositions(
                client.account.address,
                client,
                { protocols: [MigratableProtocol.compoundV3] },
              );

              const compoundV3Positions =
                allPositions[MigratableProtocol.compoundV3]!;
              expect(compoundV3Positions).toBeDefined();

              expect(compoundV3Positions).toHaveLength(1);

              const position =
                compoundV3Positions[0]! as MigratableBorrowPosition_CompoundV3;
              expect(position).toBeInstanceOf(
                MigratableBorrowPosition_CompoundV3,
              );

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

              expect(migrationBundle.requirements.txs).toHaveLength(2);
              expect(migrationBundle.requirements.signatures).toHaveLength(0);
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
                            position.borrow,
                            MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE,
                          ),
                          0n,
                          minSharePrice,
                          compoundV3MigrationAdapter,
                        ],
                      },
                      {
                        type: "compoundV3Repay",
                        args: [comet, maxUint256, client.account.address],
                      },
                      {
                        type: "erc20Transfer",
                        args: [
                          loanToken,
                          generalAdapter1,
                          maxUint256,
                          compoundV3MigrationAdapter,
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
                        type: "compoundV3WithdrawFrom",
                        args: [
                          comet,
                          collateralToken,
                          position.collateral,
                          generalAdapter1,
                        ],
                      },
                    ],
                  ],
                  type: "morphoSupplyCollateral",
                },
              ]);

              for (const tx of migrationBundle.txs())
                await sendTransaction(client, tx);

              const transferredAssets = [collateralToken, loanToken];
              const adapters = [generalAdapter1, compoundV3MigrationAdapter];

              const [
                finalPositionTo,
                finalCollateralFrom,
                finalDebtFrom,
                adaptersBalances,
              ] = await Promise.all([
                fetchAccrualPosition(
                  client.account.address,
                  marketTo.id,
                  client,
                ),
                client.readContract({
                  abi: cometExtAbi,
                  address: comet,
                  functionName: "collateralBalanceOf",
                  args: [client.account.address, collateralToken],
                }),
                client.readContract({
                  abi: cometAbi,
                  address: comet,
                  functionName: "borrowBalanceOf",
                  args: [client.account.address],
                }),
                Promise.all(
                  transferredAssets.flatMap((asset) =>
                    adapters.map(async (adapter) => ({
                      balance: await client.readContract({
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

              expect(finalPositionTo.collateral).toEqual(collateralAmount);
              expect(finalPositionTo.borrowAssets).toBeGreaterThan(
                borrowAmount,
              );
              expect(finalPositionTo.borrowAssets).toBeLessThanOrEqual(
                borrowAmount + 10n ** 12n,
              ); // interest accrued (empirical)

              expect(finalCollateralFrom).toEqual(0n);

              expect(finalDebtFrom).toEqual(0n);

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
  }
});
