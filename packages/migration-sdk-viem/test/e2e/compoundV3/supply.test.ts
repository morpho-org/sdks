import { ChainId, MathLib, addressesRegistry } from "@morpho-org/blue-sdk";
import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { vaults } from "@morpho-org/morpho-test";
import { entries } from "@morpho-org/morpho-ts";
import type { ViemTestContext } from "@morpho-org/test/vitest";
import { type Address, maxUint256, parseUnits } from "viem";
import { sendTransaction } from "viem/actions";
import { type TestAPI, describe, expect } from "vitest";
import { cometAbi } from "../../../src/abis/compoundV3.js";
import { migrationAddressesRegistry } from "../../../src/config.js";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
  fetchMigratablePositions,
} from "../../../src/index.js";
import { MigratableSupplyPosition_CompoundV3 } from "../../../src/positions/supply/compoundV3.supply.js";
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
        vault: Address;
        underlying: Address;
        underlyingDecimals: number;
        comet: Address;
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
        vault: vaults[ChainId.EthMainnet].steakEth.address,
        underlying: addressesRegistry[ChainId.EthMainnet].wNative,
        underlyingDecimals: 18,
        comet:
          migrationAddressesRegistry[ChainId.EthMainnet][
            MigratableProtocol.compoundV3
          ].weth.address,
      },
      usdc: {
        vault: vaults[ChainId.EthMainnet].steakUsdc.address,
        underlying: addressesRegistry[ChainId.EthMainnet].usdc,
        underlyingDecimals: 6,
        comet:
          migrationAddressesRegistry[ChainId.EthMainnet][
            MigratableProtocol.compoundV3
          ].usdc.address,
      },
    },
  },
  {
    chainId: ChainId.BaseMainnet,
    //@ts-expect-error
    testFn: test[ChainId.BaseMainnet],
    markets: {
      weth: {
        vault: "0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1",
        underlying: addressesRegistry[ChainId.BaseMainnet].wNative,
        underlyingDecimals: 18,
        comet:
          migrationAddressesRegistry[ChainId.BaseMainnet][
            MigratableProtocol.compoundV3
          ].weth.address,
      },
      usdc: {
        vault: "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca",
        underlying: addressesRegistry[ChainId.BaseMainnet].usdc,
        underlyingDecimals: 6,
        comet:
          migrationAddressesRegistry[ChainId.BaseMainnet][
            MigratableProtocol.compoundV3
          ].usdc.address,
      },
    },
  },
];

describe("Supply position on COMPOUND V3", () => {
  for (const { chainId, testFn, markets } of TEST_CONFIGS) {
    const {
      bundler3: { generalAdapter1, compoundV3MigrationAdapter },
    } = addressesRegistry[chainId];

    const writeSupply = async (
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

    describe(`on chain ${chainId}`, async () => {
      for (const [
        instanceName,
        { comet, vault, underlying, underlyingDecimals },
      ] of entries(markets)) {
        describe(`on ${instanceName} instance`, () => {
          testFn("should fetch user position", async ({ client }) => {
            const amount = parseUnits("10", underlyingDecimals);
            await writeSupply(client, comet, underlying, amount);

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
              compoundV3Positions[0]! as MigratableSupplyPosition_CompoundV3;
            expect(position).toBeInstanceOf(
              MigratableSupplyPosition_CompoundV3,
            );

            expect(position.protocol).toEqual(MigratableProtocol.compoundV3);
            expect(position.user).toEqual(client.account.address);
            expect(position.loanToken).toEqual(underlying);
            expect(position.nonce).toEqual(0n);
            expect(position.cometAddress).toEqual(comet);
            expect(position.supply).toBeGreaterThan(amount); //interests accrued
            expect(position.max.limiter).toEqual(
              SupplyMigrationLimiter.position,
            );
            expect(position.max.value).toEqual(position.supply);
            expect(position.supplyApy).not.toEqual(0);
            expect(position.supplyApy).not.toEqual(Number.POSITIVE_INFINITY);
          });

          testFn(
            "Should partially migrate user position",
            async ({ client }) => {
              const positionAmount = parseUnits("5", underlyingDecimals);
              const migratedAmount = parseUnits("3", underlyingDecimals);

              await writeSupply(client, comet, underlying, positionAmount);

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
                compoundV3Positions[0]! as MigratableSupplyPosition_CompoundV3;

              const migrationBundle = position.getMigrationTx(
                {
                  vault,
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
                  args: [comet, underlying, migratedAmount, generalAdapter1],
                  type: "compoundV3WithdrawFrom",
                },
                {
                  args: [
                    vault,
                    maxUint256,
                    2n * MathLib.RAY,
                    client.account.address,
                  ],
                  type: "erc4626Deposit",
                },
              ]);

              await migrationBundle.requirements.signatures[0]!.sign(client);

              await sendTransaction(client, migrationBundle.tx());

              const [bundlerBalance, userPosition, userMMShares] =
                await Promise.all([
                  client.balanceOf({
                    erc20: underlying,
                    owner: compoundV3MigrationAdapter,
                  }),
                  client.balanceOf({ erc20: comet }),
                  client.balanceOf({ erc20: vault }),
                ]);

              const userMMBalance = await client.readContract({
                address: vault,
                abi: metaMorphoAbi,
                functionName: "convertToAssets",
                args: [userMMShares],
              });

              expect(bundlerBalance).toEqual(0n);
              expect(userPosition).toBeGreaterThan(
                positionAmount - migratedAmount,
              ); //interest have been accumulated
              expect(userMMBalance).toBeGreaterThanOrEqual(migratedAmount - 2n);
            },
          );

          testFn("Should fully migrate user position", async ({ client }) => {
            const positionAmount = parseUnits("5", underlyingDecimals);

            await writeSupply(client, comet, underlying, positionAmount);

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
              compoundV3Positions[0]! as MigratableSupplyPosition_CompoundV3;

            const migrationBundle = position.getMigrationTx(
              {
                vault,
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
                args: [comet, underlying, maxUint256, generalAdapter1],
                type: "compoundV3WithdrawFrom",
              },
              {
                args: [
                  vault,
                  maxUint256,
                  2n * MathLib.RAY,
                  client.account.address,
                ],
                type: "erc4626Deposit",
              },
            ]);

            await migrationBundle.requirements.signatures[0]!.sign(client);

            await sendTransaction(client, migrationBundle.tx());

            const [bundlerBalance, userPosition, userMMShares] =
              await Promise.all([
                client.balanceOf({
                  erc20: underlying,
                  owner: compoundV3MigrationAdapter,
                }),
                client.balanceOf({ erc20: comet }),
                client.balanceOf({ erc20: vault }),
              ]);

            const userMMBalance = await client.readContract({
              address: vault,
              abi: metaMorphoAbi,
              functionName: "convertToAssets",
              args: [userMMShares],
            });

            expect(bundlerBalance).toEqual(0n);
            expect(userPosition).toEqual(0n);
            expect(userMMBalance).toBeGreaterThan(positionAmount);
          });

          testFn(
            "Should partially migrate user position without signature",
            async ({ client }) => {
              const positionAmount = parseUnits("5", underlyingDecimals);
              const migratedAmount = parseUnits("3", underlyingDecimals);

              await writeSupply(client, comet, underlying, positionAmount);

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
                compoundV3Positions[0]! as MigratableSupplyPosition_CompoundV3;

              const migrationBundle = position.getMigrationTx(
                {
                  vault,
                  amount: migratedAmount,
                  maxSharePrice: 2n * MathLib.RAY,
                },
                false,
              );

              expect(migrationBundle.requirements.txs).toHaveLength(1);
              expect(migrationBundle.requirements.signatures).toHaveLength(0);
              expect(migrationBundle.actions).toEqual([
                {
                  args: [comet, underlying, migratedAmount, generalAdapter1],
                  type: "compoundV3WithdrawFrom",
                },
                {
                  args: [
                    vault,
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

              const [bundlerBalance, userPosition, userMMShares] =
                await Promise.all([
                  client.balanceOf({
                    erc20: underlying,
                    owner: compoundV3MigrationAdapter,
                  }),
                  client.balanceOf({ erc20: comet }),
                  client.balanceOf({ erc20: vault }),
                ]);

              const userMMBalance = await client.readContract({
                address: vault,
                abi: metaMorphoAbi,
                functionName: "convertToAssets",
                args: [userMMShares],
              });

              expect(bundlerBalance).toEqual(0n);
              expect(userPosition).toBeGreaterThan(
                positionAmount - migratedAmount,
              ); //interest have been accumulated
              expect(userMMBalance).toBeGreaterThanOrEqual(migratedAmount - 2n);
            },
          );

          testFn(
            "Should fully migrate user position without signature",
            async ({ client }) => {
              const positionAmount = parseUnits("5", underlyingDecimals);

              await writeSupply(client, comet, underlying, positionAmount);

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
                compoundV3Positions[0]! as MigratableSupplyPosition_CompoundV3;

              const migrationBundle = position.getMigrationTx(
                {
                  vault,
                  amount: position.supply,
                  maxSharePrice: 2n * MathLib.RAY,
                },
                false,
              );

              expect(migrationBundle.requirements.txs).toHaveLength(1);
              expect(migrationBundle.requirements.signatures).toHaveLength(0);
              expect(migrationBundle.actions).toEqual([
                {
                  args: [comet, underlying, maxUint256, generalAdapter1],
                  type: "compoundV3WithdrawFrom",
                },
                {
                  args: [
                    vault,
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

              const [bundlerBalance, userPosition, userMMShares] =
                await Promise.all([
                  client.balanceOf({
                    erc20: underlying,
                    owner: compoundV3MigrationAdapter,
                  }),
                  client.balanceOf({ erc20: comet }),
                  client.balanceOf({ erc20: vault }),
                ]);

              const userMMBalance = await client.readContract({
                address: vault,
                abi: metaMorphoAbi,
                functionName: "convertToAssets",
                args: [userMMShares],
              });

              expect(bundlerBalance).toEqual(0n);
              expect(userPosition).toEqual(0n);
              expect(userMMBalance).toBeGreaterThan(positionAmount);
            },
          );
        });
      }
    });
  }
});
