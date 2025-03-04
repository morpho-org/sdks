import {
  type Address,
  ChainId,
  ExchangeRateWrappedToken,
  MathLib,
  NATIVE_ADDRESS,
  addressesRegistry,
} from "@morpho-org/blue-sdk";
import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { vaults } from "@morpho-org/morpho-test";
import { isDefined } from "@morpho-org/morpho-ts";
import type { ViemTestContext } from "@morpho-org/test/vitest";
import { entries } from "lodash";
import { maxUint256, parseUnits } from "viem";
import { sendTransaction, writeContract } from "viem/actions";
import { type TestAPI, describe, expect } from "vitest";
import { cErc20Abi } from "../../../src/abis/compoundV2.js";
import { migrationAddressesRegistry } from "../../../src/config.js";
import { fetchAccruedExchangeRate } from "../../../src/fetchers/compoundV2/compoundV2.helpers.js";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
  fetchMigratablePositions,
} from "../../../src/index.js";
import { MigratableSupplyPosition_CompoundV2 } from "../../../src/positions/supply/compoundV2.supply.js";
import { test } from "../setup.js";

interface ChainConfig<C extends ChainId.EthMainnet> {
  chainId: C;
  testFn: TestAPI<ViemTestContext>;
  markets: {
    [Ch in C]: {
      [K in Exclude<
        keyof (typeof migrationAddressesRegistry)[Ch][MigratableProtocol.compoundV2],
        "comptroller"
      >]: {
        vault: Address;
        underlying: Address;
        underlyingDecimals: number;
        cToken: Address;
      };
    };
  }[C];
}

const TEST_CONFIGS: {
  [C in ChainId.EthMainnet]: ChainConfig<C>;
}[ChainId.EthMainnet][] = [
  {
    chainId: ChainId.EthMainnet,
    testFn: test[ChainId.EthMainnet],
    markets: {
      cEth: {
        vault: vaults[ChainId.EthMainnet].steakEth.address,
        underlying: NATIVE_ADDRESS as Address,
        underlyingDecimals: 18,
        cToken:
          migrationAddressesRegistry[ChainId.EthMainnet][
            MigratableProtocol.compoundV2
          ].cEth.address,
      },
      cUsdc: {
        vault: vaults[ChainId.EthMainnet].steakUsdc.address,
        underlying: addressesRegistry[ChainId.EthMainnet].usdc,
        underlyingDecimals: 6,
        cToken:
          migrationAddressesRegistry[ChainId.EthMainnet][
            MigratableProtocol.compoundV2
          ].cUsdc.address,
      },
    },
  },
  // {
  //   chainId: ChainId.BaseMainnet,
  //   //@ts-expect-error
  //   testFn: test[ChainId.BaseMainnet],
  //   markets: {
  //     mWeth: {
  //       vault: "0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1" as Address,
  //       underlying: addressesRegistry[ChainId.BaseMainnet].wNative,
  //       underlyingDecimals: 18,
  //       cToken:
  //         migrationAddressesRegistry[ChainId.BaseMainnet][
  //           MigratableProtocol.compoundV2
  //         ].mWeth.address,
  //     },
  //     mUsdc: {
  //       vault: "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca" as Address,
  //       underlying: addressesRegistry[ChainId.BaseMainnet].usdc,
  //       underlyingDecimals: 6,
  //       cToken:
  //         migrationAddressesRegistry[ChainId.BaseMainnet][
  //           MigratableProtocol.compoundV2
  //         ].mUsdc.address,
  //     },
  //   },
  // },
];

describe("Supply position on COMPOUND V2", () => {
  for (const { chainId, testFn, markets } of TEST_CONFIGS) {
    const { comptroller } =
      migrationAddressesRegistry[chainId][MigratableProtocol.compoundV2];
    const {
      wNative,
      bundler3: { generalAdapter1, compoundV2MigrationAdapter },
    } = addressesRegistry[chainId];

    const writeSupply = async (
      client: ViemTestContext["client"],
      cErc20: Address,
      underlying: Address,
      amount: bigint,
      enterMarket = false,
    ) => {
      if (underlying === NATIVE_ADDRESS) {
        await sendTransaction(client, { to: cErc20, value: amount });
      } else {
        await client.deal({
          erc20: underlying,
          amount: amount,
        });
        await client.approve({
          address: underlying,
          args: [cErc20, amount],
        });
        await client.writeContract({
          abi: cErc20Abi,
          address: cErc20,
          functionName: "mint",
          args: [amount],
        });
      }

      if (enterMarket) {
        await client.writeContract({
          ...comptroller,
          functionName: "enterMarkets",
          args: [[cErc20]],
        });
      }

      await client.mine({ blocks: 500 }); //accrue some interests
    };

    describe(`on chain ${chainId}`, async () => {
      for (const [
        cTokenName,
        { cToken, vault, underlying, underlyingDecimals },
      ] of entries(markets)) {
        describe(`on ${cTokenName} market`, () => {
          testFn(
            "shouldn't fetch user position if market is entered",
            async ({ client }) => {
              const amount = parseUnits("10", underlyingDecimals);
              await writeSupply(client, cToken, underlying, amount, true);

              const allPositions = await fetchMigratablePositions(
                client.account.address,
                client,
                { protocols: [MigratableProtocol.compoundV2] },
              );
              const compoundV2Positions =
                allPositions[MigratableProtocol.compoundV2]!;
              expect(compoundV2Positions).toBeDefined();
              expect(compoundV2Positions).toHaveLength(0);
            },
          );

          testFn("Should properly accrue interests", async ({ client }) => {
            const initialExchangeRate = await client.readContract({
              abi: cErc20Abi,
              address: cToken,
              functionName: "exchangeRateStored",
              args: [],
            });

            await client.mine({ blocks: 1_000 });

            // if (chainId === ChainId.BaseMainnet)
            //   await client.setBlockTimestampInterval({ interval: 2 });

            const projectedExchangeRate = await fetchAccruedExchangeRate(
              cToken,
              client,
            );

            await writeContract(client, {
              abi: cErc20Abi,
              address: cToken,
              functionName: "accrueInterest",
              args: [],
            });

            const actualExchangeRate = await client.readContract({
              abi: cErc20Abi,
              address: cToken,
              functionName: "exchangeRateStored",
              args: [],
            });

            expect(actualExchangeRate).toBeGreaterThan(initialExchangeRate);
            expect(projectedExchangeRate).toEqual(actualExchangeRate);
          });

          testFn("should fetch user position", async ({ client }) => {
            const amount = parseUnits("10", underlyingDecimals);
            await writeSupply(client, cToken, underlying, amount);

            const allPositions = await fetchMigratablePositions(
              client.account.address,
              client,
              { protocols: [MigratableProtocol.compoundV2] },
            );

            const compoundV2Positions =
              allPositions[MigratableProtocol.compoundV2]!;
            expect(compoundV2Positions).toBeDefined();

            expect(compoundV2Positions).toHaveLength(1);

            const position =
              compoundV2Positions[0]! as MigratableSupplyPosition_CompoundV2;
            expect(position).toBeInstanceOf(
              MigratableSupplyPosition_CompoundV2,
            );

            expect(position.protocol).toEqual(MigratableProtocol.compoundV2);
            expect(position.user).toEqual(client.account.address);
            expect(position.loanToken).toEqual(
              underlying === NATIVE_ADDRESS ? wNative : underlying,
            );
            expect(position.bundlerAllowance).toEqual(0n);
            expect(position.cToken.address).toEqual(cToken);
            expect(position.supply).toBeGreaterThan(amount); // interests accrued
            expect(position.max.limiter).toEqual(
              SupplyMigrationLimiter.position,
            );
            expect(position.max.value).toEqual(position.supply);
          });

          testFn(
            "Should partially migrate user position without signature",
            async ({ client }) => {
              const positionAmount = parseUnits("5", underlyingDecimals);
              const migratedAmount = parseUnits("3", underlyingDecimals);

              await writeSupply(client, cToken, underlying, positionAmount);

              const allPositions = await fetchMigratablePositions(
                client.account.address,
                client,
                { protocols: [MigratableProtocol.compoundV2] },
              );

              const compoundV2Positions =
                allPositions[MigratableProtocol.compoundV2]!;
              expect(compoundV2Positions).toBeDefined();
              expect(compoundV2Positions).toHaveLength(1);
              const position =
                compoundV2Positions[0]! as MigratableSupplyPosition_CompoundV2;
              const migrationBundle = position.getMigrationTx(
                {
                  vault,
                  amount: migratedAmount,
                  maxSharePrice: 2n * MathLib.RAY,
                },
                chainId,
              );

              expect(migrationBundle.requirements.txs).toHaveLength(1);
              expect(migrationBundle.requirements.signatures).toHaveLength(0);

              const transferredAmount =
                position.cToken.toUnwrappedExactAmountOut(migratedAmount);

              expect(migrationBundle.actions).toEqual(
                [
                  {
                    args: [
                      cToken,
                      transferredAmount,
                      compoundV2MigrationAdapter,
                    ],
                    type: "erc20TransferFrom",
                  },
                  {
                    args: [
                      cToken,
                      maxUint256,
                      underlying === NATIVE_ADDRESS,
                      generalAdapter1,
                    ],
                    type: "compoundV2Redeem",
                  },
                  [NATIVE_ADDRESS, wNative].includes(underlying)
                    ? {
                        type: "wrapNative",
                        args: [maxUint256],
                      }
                    : null,
                  {
                    args: [
                      vault,
                      maxUint256,
                      2n * MathLib.RAY,
                      client.account.address,
                    ],
                    type: "erc4626Deposit",
                  },
                ].filter(isDefined),
              );

              await sendTransaction(
                client,
                migrationBundle.requirements.txs[0]!.tx,
              );

              await sendTransaction(client, migrationBundle.tx());

              const [
                bundlerBalance,
                bundlerCTokenBalance,
                userPosition,
                userMMShares,
                exchangeRate,
              ] = await Promise.all([
                client.balanceOf({
                  erc20: underlying === NATIVE_ADDRESS ? undefined : underlying,
                  owner: compoundV2MigrationAdapter,
                }),
                client.balanceOf({
                  erc20: cToken,
                  owner: compoundV2MigrationAdapter,
                }),
                client.balanceOf({ erc20: cToken }),
                client.balanceOf({ erc20: vault }),
                client.readContract({
                  address: cToken,
                  abi: cErc20Abi,
                  functionName: "exchangeRateStored",
                  args: [],
                }),
              ]);

              const cErc20Token = new ExchangeRateWrappedToken(
                position.cToken,
                underlying,
                exchangeRate,
              );

              const userMMBalance = await client.readContract({
                address: vault,
                abi: metaMorphoAbi,
                functionName: "convertToAssets",
                args: [userMMShares],
              });

              expect(bundlerBalance).toEqual(0n);
              expect(bundlerCTokenBalance).toEqual(0n);
              expect(
                cErc20Token.toUnwrappedExactAmountIn(userPosition),
              ).toBeGreaterThan(positionAmount - migratedAmount); //interest have been accumulated
              expect(userMMBalance).toBeGreaterThanOrEqual(migratedAmount - 2n);
            },
          );

          testFn(
            "Should fully migrate user position without signature",
            async ({ client }) => {
              const positionAmount = parseUnits("5", underlyingDecimals);

              await writeSupply(client, cToken, underlying, positionAmount);

              const cTokenBalance = await client.balanceOf({ erc20: cToken });

              const allPositions = await fetchMigratablePositions(
                client.account.address,
                client,
                { protocols: [MigratableProtocol.compoundV2] },
              );

              const compoundV2Positions =
                allPositions[MigratableProtocol.compoundV2]!;
              expect(compoundV2Positions).toBeDefined();
              expect(compoundV2Positions).toHaveLength(1);

              const position =
                compoundV2Positions[0]! as MigratableSupplyPosition_CompoundV2;

              const migrationBundle = position.getMigrationTx(
                {
                  vault,
                  amount: position.supply,
                  maxSharePrice: 2n * MathLib.RAY,
                },
                chainId,
              );

              expect(migrationBundle.requirements.txs).toHaveLength(1);
              expect(migrationBundle.requirements.signatures).toHaveLength(0);

              expect(migrationBundle.actions).toEqual(
                [
                  {
                    args: [cToken, cTokenBalance, compoundV2MigrationAdapter],
                    type: "erc20TransferFrom",
                  },
                  {
                    args: [
                      cToken,
                      maxUint256,
                      underlying === NATIVE_ADDRESS,
                      generalAdapter1,
                    ],
                    type: "compoundV2Redeem",
                  },
                  [NATIVE_ADDRESS, wNative].includes(underlying)
                    ? {
                        type: "wrapNative",
                        args: [maxUint256],
                      }
                    : null,
                  {
                    args: [
                      vault,
                      maxUint256,
                      2n * MathLib.RAY,
                      client.account.address,
                    ],
                    type: "erc4626Deposit",
                  },
                ].filter(isDefined),
              );

              await sendTransaction(
                client,
                migrationBundle.requirements.txs[0]!.tx,
              );
              await sendTransaction(client, migrationBundle.tx());

              const [
                bundlerBalance,
                bundlerCTokenBalance,
                userPosition,
                userMMShares,
              ] = await Promise.all([
                client.balanceOf({
                  erc20: underlying === NATIVE_ADDRESS ? undefined : underlying,
                  owner: compoundV2MigrationAdapter,
                }),
                client.balanceOf({
                  erc20: cToken,
                  owner: compoundV2MigrationAdapter,
                }),
                client.balanceOf({ erc20: cToken }),
                client.balanceOf({ erc20: vault }),
              ]);

              const userMMBalance = await client.readContract({
                address: vault,
                abi: metaMorphoAbi,
                functionName: "convertToAssets",
                args: [userMMShares],
              });

              expect(bundlerBalance).toEqual(0n);
              expect(bundlerCTokenBalance).toEqual(0n);
              expect(userPosition).toEqual(0n);
              expect(userMMBalance).toBeGreaterThanOrEqual(positionAmount);
            },
          );
        });
      }
    });
  }
});
