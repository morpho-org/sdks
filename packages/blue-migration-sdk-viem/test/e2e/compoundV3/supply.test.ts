import { ChainId, MathLib, addresses } from "@morpho-org/blue-sdk";
import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { vaults } from "@morpho-org/morpho-test";
import { entries } from "@morpho-org/morpho-ts";
import type { ViemTestContext } from "@morpho-org/test/vitest";
import {} from "lodash";
import { type Address, maxUint256, parseUnits } from "viem";
import { sendTransaction } from "viem/actions";
import { type TestAPI, describe, expect } from "vitest";
import { cometAbi } from "../../../src/abis/compoundV3.abis.js";
import { MIGRATION_ADDRESSES } from "../../../src/config.js";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
  fetchMigratablePositions,
} from "../../../src/index.js";
import { MigratableSupplyPosition_CompoundV3 } from "../../../src/positions/supply/compoundV3.supply.js";
import { test } from "../setup.js";

interface ChainConfig<C extends ChainId> {
  chainId: C;
  testFn: TestAPI<ViemTestContext>;
  markets: {
    [Ch in ChainId]: {
      [K in Exclude<
        keyof (typeof MIGRATION_ADDRESSES)[Ch][MigratableProtocol.compoundV3],
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

const TEST_CONFIGS: { [C in ChainId]: ChainConfig<C> }[ChainId][] = [
  {
    chainId: ChainId.EthMainnet,
    testFn: test[ChainId.EthMainnet],
    markets: {
      weth: {
        vault: vaults[ChainId.EthMainnet].steakEth.address,
        underlying: addresses[ChainId.EthMainnet].wNative,
        underlyingDecimals: 18,
        comet:
          MIGRATION_ADDRESSES[ChainId.EthMainnet][MigratableProtocol.compoundV3]
            .weth.address,
      },
      usdc: {
        vault: vaults[ChainId.EthMainnet].steakUsdc.address,
        underlying: addresses[ChainId.EthMainnet].usdc,
        underlyingDecimals: 6,
        comet:
          MIGRATION_ADDRESSES[ChainId.EthMainnet][MigratableProtocol.compoundV3]
            .usdc.address,
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
        underlying: addresses[ChainId.BaseMainnet].wNative,
        underlyingDecimals: 18,
        comet:
          MIGRATION_ADDRESSES[ChainId.BaseMainnet][
            MigratableProtocol.compoundV3
          ].weth.address,
      },
      usdc: {
        vault: "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca",
        underlying: addresses[ChainId.BaseMainnet].usdc,
        underlyingDecimals: 6,
        comet:
          MIGRATION_ADDRESSES[ChainId.BaseMainnet][
            MigratableProtocol.compoundV3
          ].usdc.address,
      },
    },
  },
];

describe("Supply position on COMPOUND V3", () => {
  for (const { chainId, testFn, markets } of TEST_CONFIGS) {
    const { compoundV3Bundler } = addresses[chainId];

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
            expect(compoundV3Positions).not.undefined;

            expect(compoundV3Positions).to.have.length(1);

            const position =
              compoundV3Positions[0]! as MigratableSupplyPosition_CompoundV3;
            expect(position).to.be.instanceOf(
              MigratableSupplyPosition_CompoundV3,
            );

            expect(position.protocol).to.equal(MigratableProtocol.compoundV3);
            expect(position.user).to.equal(client.account.address);
            expect(position.loanToken).to.equal(underlying);
            expect(position.nonce).to.equal(0n);
            expect(position.cometAddress).to.equal(comet);
            expect(position.supply).gt(amount); //interests accrued
            expect(position.max.limiter).to.equal(
              SupplyMigrationLimiter.position,
            );
            expect(position.max.value).to.equal(position.supply);
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
              expect(compoundV3Positions).not.undefined;
              expect(compoundV3Positions).to.have.length(1);

              const migrationBundle = compoundV3Positions[0]!.getMigrationTx(
                {
                  vault,
                  amount: migratedAmount,
                  minShares: 0n,
                },
                chainId,
                true,
              );

              expect(migrationBundle.requirements.txs).to.have.length(0);
              expect(migrationBundle.requirements.signatures).to.have.length(1);
              const deadline = migrationBundle.actions[0]?.args[3];
              expect(migrationBundle.actions).eql([
                {
                  args: [comet, true, 0n, deadline, null],
                  type: "compoundV3AllowBySig",
                },
                {
                  args: [comet, underlying, migratedAmount],
                  type: "compoundV3WithdrawFrom",
                },
                {
                  args: [
                    vault,
                    MathLib.MAX_UINT_128,
                    0n,
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
                    owner: compoundV3Bundler,
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

              expect(bundlerBalance).eql(0n);
              expect(userPosition).gt(positionAmount - migratedAmount); //interest have been accumulated
              expect(userMMBalance).gte(migratedAmount - 2n);
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
            expect(compoundV3Positions).not.undefined;
            expect(compoundV3Positions).to.have.length(1);

            const position = compoundV3Positions[0]!;
            const migrationBundle = position.getMigrationTx(
              {
                vault,
                amount: position.supply,
                minShares: 0n,
              },
              chainId,
              true,
            );

            expect(migrationBundle.requirements.txs).to.have.length(0);
            expect(migrationBundle.requirements.signatures).to.have.length(1);
            const deadline = migrationBundle.actions[0]?.args[3];
            expect(migrationBundle.actions).eql([
              {
                args: [comet, true, 0n, deadline, null],
                type: "compoundV3AllowBySig",
              },
              {
                args: [comet, underlying, maxUint256],
                type: "compoundV3WithdrawFrom",
              },
              {
                args: [vault, MathLib.MAX_UINT_128, 0n, client.account.address],
                type: "erc4626Deposit",
              },
            ]);

            await migrationBundle.requirements.signatures[0]!.sign(client);

            await sendTransaction(client, migrationBundle.tx());

            const [bundlerBalance, userPosition, userMMShares] =
              await Promise.all([
                client.balanceOf({
                  erc20: underlying,
                  owner: compoundV3Bundler,
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

            expect(bundlerBalance).eql(0n);
            expect(userPosition).eql(0n);
            expect(userMMBalance).gt(positionAmount);
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
              expect(compoundV3Positions).not.undefined;
              expect(compoundV3Positions).to.have.length(1);

              const migrationBundle = compoundV3Positions[0]!.getMigrationTx(
                {
                  vault,
                  amount: migratedAmount,
                  minShares: 0n,
                },
                chainId,
                false,
              );

              expect(migrationBundle.requirements.txs).to.have.length(1);
              expect(migrationBundle.requirements.signatures).to.have.length(0);
              expect(migrationBundle.actions).eql([
                {
                  args: [comet, underlying, migratedAmount],
                  type: "compoundV3WithdrawFrom",
                },
                {
                  args: [
                    vault,
                    MathLib.MAX_UINT_128,
                    0n,
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
                    owner: compoundV3Bundler,
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

              expect(bundlerBalance).eql(0n);
              expect(userPosition).gt(positionAmount - migratedAmount); //interest have been accumulated
              expect(userMMBalance).gte(migratedAmount - 2n);
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
              expect(compoundV3Positions).not.undefined;
              expect(compoundV3Positions).to.have.length(1);

              const position = compoundV3Positions[0]!;
              const migrationBundle = position.getMigrationTx(
                {
                  vault,
                  amount: position.supply,
                  minShares: 0n,
                },
                chainId,
                false,
              );

              expect(migrationBundle.requirements.txs).to.have.length(1);
              expect(migrationBundle.requirements.signatures).to.have.length(0);
              expect(migrationBundle.actions).eql([
                {
                  args: [comet, underlying, maxUint256],
                  type: "compoundV3WithdrawFrom",
                },
                {
                  args: [
                    vault,
                    MathLib.MAX_UINT_128,
                    0n,
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
                    owner: compoundV3Bundler,
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

              expect(bundlerBalance).eql(0n);
              expect(userPosition).eql(0n);
              expect(userMMBalance).gt(positionAmount);
            },
          );
        });
      }
    });
  }
});
