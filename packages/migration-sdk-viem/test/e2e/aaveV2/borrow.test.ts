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

import { blueAbi, fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { markets } from "@morpho-org/morpho-test";
import { testAccount } from "@morpho-org/test";
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
  aTokenV2Abi,
  variableDebtTokenV2Abi,
} from "../../../src/abis/aaveV2.js";
import { MigratableBorrowPosition_AaveV2 } from "../../../src/positions/borrow/aaveV2.borrow.js";
import { MigratableSupplyPosition_AaveV2 } from "../../../src/positions/supply/aaveV2.supply.js";
import { test } from "../setup.js";

const chainId = ChainId.EthMainnet;
const aWEth: Address = "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e";
const variableDebtToken: Address = "0x531842cEbbdD378f8ee36D171d6cC9C4fcf475Ec";
const testFn = test[chainId] as TestAPI<ViemTestContext>;
const marketTo = markets[chainId].usdt_weth_86;

const { lendingPool } = migrationAddressesRegistry[chainId].aaveV2!;
const {
  bundler3: { generalAdapter1, aaveV2MigrationAdapter },
  usdt,
  usdc,
  morpho,
  wNative,
} = addressesRegistry[chainId];

const lp = testAccount(1);

const addBlueLiquidity = async (
  client: ViemTestContext["client"],
  market: MarketParams,
  amount: bigint,
) => {
  await client.deal({
    account: lp,
    amount,
    erc20: market.loanToken,
  });
  await client.approve({
    account: lp,
    address: market.loanToken,
    args: [morpho, amount],
  });
  await client.writeContract({
    account: lp,
    abi: blueAbi,
    address: morpho,
    functionName: "supply",
    args: [market, amount, 0n, lp.address, "0x"],
  });
};

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
    args: [lendingPool.address, amount],
  });
  await client.writeContract({
    ...lendingPool,
    functionName: "deposit",
    args: [market, amount, client.account.address, 0],
  });
  await client.writeContract({
    ...lendingPool,
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
    ...lendingPool,
    functionName: "borrow",
    args: [market, amount, 2n, 0, client.account.address],
  });
};

describe("Borrow position on AAVE V2", () => {
  testFn("should fetch user position", async ({ client }: ViemTestContext) => {
    const collateralAmount = parseEther("10");
    const borrowAmount = parseUnits("1000", 6);

    await writeSupply(client, wNative, collateralAmount, true);
    await writeBorrow(client, usdt, borrowAmount);

    const allPositions = await fetchMigratablePositions(
      client.account.address,
      client,
      { protocols: [MigratableProtocol.aaveV2] },
    );

    const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
    expect(aaveV2Positions).toBeDefined();
    expect(aaveV2Positions).toHaveLength(1);

    const position = aaveV2Positions[0]! as MigratableBorrowPosition_AaveV2;
    expect(position).toBeInstanceOf(MigratableBorrowPosition_AaveV2);

    expect(position.protocol).toEqual(MigratableProtocol.aaveV2);
    expect(position.user).toEqual(client.account.address);
    expect(position.loanToken.address).toEqual(usdt);
    expect(position.nonce).toEqual(0n);
    expect(position.aToken.address).toEqual(aWEth);
    expect(position.collateral).toBeGreaterThanOrEqual(collateralAmount); //interest accrued
    expect(position.borrow).toBeGreaterThanOrEqual(borrowAmount); //interest accrued
    expect(position.chainId).toEqual(chainId);
    expect(position.collateralToken.address).toEqual(wNative);
    expect(position.loanToken.address).toEqual(usdt);
    expect(position.maxRepay.limiter).toEqual(BorrowMigrationLimiter.position);
    expect(position.maxRepay.value).toEqual(position.borrow);
    expect(position.maxWithdraw.limiter).toEqual(
      SupplyMigrationLimiter.position,
    );
    expect(position.maxWithdraw.value).toEqual(position.collateral);
  });

  testFn(
    "shouldn't fetch user position if multiple collaterals",
    async ({ client }) => {
      const collateralAmount1 = parseUnits("1000", 6);
      const collateralAmount2 = parseEther("10");
      const borrowAmount = parseUnits("1000", 6);

      await writeSupply(client, usdc, collateralAmount1, true);
      await writeSupply(client, wNative, collateralAmount2, true);
      await writeBorrow(client, usdt, borrowAmount);

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(0);
    },
  );

  testFn(
    "should fetch multiple user positions if only one collateral",
    async ({ client }) => {
      const collateralAmount = parseEther("10");
      const pureSupply = parseUnits("10000", 6);
      const borrowAmount = parseUnits("1000", 6);

      await writeSupply(client, wNative, collateralAmount, true);
      await writeSupply(client, usdc, pureSupply, false);
      await writeBorrow(client, usdt, borrowAmount);

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(2);
      expect(aaveV2Positions[0]).toBeInstanceOf(
        MigratableSupplyPosition_AaveV2,
      );
      expect(aaveV2Positions[1]).toBeInstanceOf(
        MigratableBorrowPosition_AaveV2,
      );

      const position = aaveV2Positions[1] as MigratableBorrowPosition_AaveV2;

      expect(position.collateralToken.address).toBe(wNative);
    },
  );

  testFn(
    "shouldn't fetch user position if multiple loans",
    async ({ client }) => {
      const collateralAmount = parseEther("10");
      const borrowAmount1 = parseUnits("1000", 6);
      const borrowAmount2 = parseUnits("1000", 6);

      await writeSupply(client, wNative, collateralAmount, true);
      await writeBorrow(client, usdc, borrowAmount1);
      await writeBorrow(client, usdt, borrowAmount2);

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(0);
    },
  );

  testFn(
    "shouldn't fetch user collateral positions if no borrow",
    async ({ client }) => {
      const collateralAmount = parseEther("10");

      await writeSupply(client, wNative, collateralAmount, true);

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(1);
      expect(aaveV2Positions[0]).toBeInstanceOf(
        MigratableSupplyPosition_AaveV2,
      );
    },
  );

  testFn(
    "should fetch user position with limited liquidity",
    async ({ client }) => {
      const collateralAmount = parseEther("10");
      const borrowAmount = parseUnits("5000", 6);
      const liquidity = parseEther("6");

      await writeSupply(client, wNative, collateralAmount, true);
      await writeBorrow(client, usdt, borrowAmount);
      await client.deal({
        erc20: wNative,
        account: aWEth,
        amount: liquidity,
      });

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(1);

      const position = aaveV2Positions[0]! as MigratableBorrowPosition_AaveV2;
      expect(position).toBeInstanceOf(MigratableBorrowPosition_AaveV2);

      expect(position.maxWithdraw).toEqual({
        limiter: SupplyMigrationLimiter.liquidity,
        value: liquidity,
      });
    },
  );

  testFn("should partially migrate user position", async ({ client }) => {
    const collateralAmount = parseEther("10");
    const borrowAmount = parseUnits("3000", 6);

    const migratedBorrow = borrowAmount / 2n;
    const migratedCollateral = collateralAmount / 2n;

    await writeSupply(client, wNative, collateralAmount, true);
    await writeBorrow(client, usdt, borrowAmount);
    await addBlueLiquidity(client, marketTo, migratedBorrow);

    const allPositions = await fetchMigratablePositions(
      client.account.address,
      client,
      { protocols: [MigratableProtocol.aaveV2] },
    );

    const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
    expect(aaveV2Positions).toBeDefined();
    expect(aaveV2Positions).toHaveLength(1);

    const position = aaveV2Positions[0]! as MigratableBorrowPosition_AaveV2;
    expect(position).toBeInstanceOf(MigratableBorrowPosition_AaveV2);

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
          aWEth,
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
                aaveV2MigrationAdapter,
              ],
            },
            {
              type: "aaveV2Repay",
              args: [usdt, maxUint256, client.account.address, 2n],
            },
            {
              type: "erc20TransferFrom",
              args: [aWEth, migratedCollateral, aaveV2MigrationAdapter],
            },
            {
              type: "aaveV2Withdraw",
              args: [wNative, migratedCollateral, generalAdapter1],
            },
          ],
        ],
        type: "morphoSupplyCollateral",
      },
      {
        type: "erc20Transfer",
        args: [aWEth, client.account.address, maxUint256],
      },
    ]);

    await migrationBundle.requirements.signatures[0]!.sign(client);
    await migrationBundle.requirements.signatures[1]!.sign(client);

    await sendTransaction(client, migrationBundle.tx());

    const transferredAssets = [usdt, wNative, aWEth];
    const adapters = [generalAdapter1, aaveV2MigrationAdapter];

    const [
      finalPositionTo,
      finalCollateralFrom,
      finalDebtFrom,
      adaptersBalances,
    ] = await Promise.all([
      fetchAccrualPosition(client.account.address, marketTo.id, client),
      readContract(client, {
        abi: aTokenV2Abi,
        address: aWEth,
        functionName: "balanceOf",
        args: [client.account.address],
      }),
      readContract(client, {
        abi: variableDebtTokenV2Abi,
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
    const borrowAmount = parseUnits("3000", 6);

    await writeSupply(client, wNative, collateralAmount, true);
    await writeBorrow(client, usdt, borrowAmount);
    await addBlueLiquidity(
      client,
      marketTo,
      MathLib.wMulUp(borrowAmount, MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE),
    );

    const allPositions = await fetchMigratablePositions(
      client.account.address,
      client,
      { protocols: [MigratableProtocol.aaveV2] },
    );

    const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
    expect(aaveV2Positions).toBeDefined();
    expect(aaveV2Positions).toHaveLength(1);

    const position = aaveV2Positions[0]! as MigratableBorrowPosition_AaveV2;
    expect(position).toBeInstanceOf(MigratableBorrowPosition_AaveV2);

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
          aWEth,
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
                  position.borrow,
                  MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE,
                ),
                0n,
                minSharePrice,
                aaveV2MigrationAdapter,
              ],
            },
            {
              type: "aaveV2Repay",
              args: [usdt, maxUint256, client.account.address, 2n],
            },
            {
              type: "erc20Transfer",
              args: [
                marketTo.loanToken,
                generalAdapter1,
                maxUint256,
                aaveV2MigrationAdapter,
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
              args: [aWEth, maxUint256, aaveV2MigrationAdapter],
            },
            {
              type: "aaveV2Withdraw",
              args: [wNative, maxUint256, generalAdapter1],
            },
          ],
        ],
        type: "morphoSupplyCollateral",
      },
      {
        type: "erc20Transfer",
        args: [wNative, client.account.address, maxUint256],
      },
    ]);

    await migrationBundle.requirements.signatures[0]!.sign(client);
    await migrationBundle.requirements.signatures[1]!.sign(client);

    await sendTransaction(client, migrationBundle.tx());

    const transferredAssets = [usdt, wNative, aWEth];
    const adapters = [generalAdapter1, aaveV2MigrationAdapter];

    const [
      finalPositionTo,
      finalCollateralFrom,
      finalDebtFrom,
      adaptersBalances,
    ] = await Promise.all([
      fetchAccrualPosition(client.account.address, marketTo.id, client),
      readContract(client, {
        abi: aTokenV2Abi,
        address: aWEth,
        functionName: "balanceOf",
        args: [client.account.address],
      }),
      readContract(client, {
        abi: variableDebtTokenV2Abi,
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
      const borrowAmount = parseUnits("3000", 6);

      const migratedBorrow = borrowAmount / 2n;
      const migratedCollateral = collateralAmount / 2n;

      await writeSupply(client, wNative, collateralAmount, true);
      await writeBorrow(client, usdt, borrowAmount);
      await addBlueLiquidity(client, marketTo, migratedBorrow);

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(1);

      const position = aaveV2Positions[0]! as MigratableBorrowPosition_AaveV2;
      expect(position).toBeInstanceOf(MigratableBorrowPosition_AaveV2);

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
        args: [aWEth, generalAdapter1, migratedCollateral],
        tx: {
          to: aWEth,
          data: encodeFunctionData({
            abi: aTokenV2Abi,
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
                  aaveV2MigrationAdapter,
                ],
              },
              {
                type: "aaveV2Repay",
                args: [usdt, maxUint256, client.account.address, 2n],
              },
              {
                type: "erc20TransferFrom",
                args: [aWEth, migratedCollateral, aaveV2MigrationAdapter],
              },
              {
                type: "aaveV2Withdraw",
                args: [wNative, migratedCollateral, generalAdapter1],
              },
            ],
          ],
          type: "morphoSupplyCollateral",
        },
        {
          type: "erc20Transfer",
          args: [aWEth, client.account.address, maxUint256],
        },
      ]);

      await sendTransaction(client, migrationBundle.requirements.txs[0]!.tx);
      await sendTransaction(client, migrationBundle.requirements.txs[1]!.tx);

      await sendTransaction(client, migrationBundle.tx());

      const transferredAssets = [usdt, wNative, aWEth];
      const adapters = [generalAdapter1, aaveV2MigrationAdapter];

      const [
        finalPositionTo,
        finalCollateralFrom,
        finalDebtFrom,
        adaptersBalances,
      ] = await Promise.all([
        fetchAccrualPosition(client.account.address, marketTo.id, client),
        readContract(client, {
          abi: aTokenV2Abi,
          address: aWEth,
          functionName: "balanceOf",
          args: [client.account.address],
        }),
        readContract(client, {
          abi: variableDebtTokenV2Abi,
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
    },
  );

  testFn(
    "should fully migrate user position without signature",
    async ({ client }) => {
      const collateralAmount = parseEther("10");
      const borrowAmount = parseUnits("3000", 6);

      await writeSupply(client, wNative, collateralAmount, true);
      await writeBorrow(client, usdt, borrowAmount);
      await addBlueLiquidity(
        client,
        marketTo,
        MathLib.wMulUp(borrowAmount, MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE),
      );

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(1);

      const position = aaveV2Positions[0]! as MigratableBorrowPosition_AaveV2;
      expect(position).toBeInstanceOf(MigratableBorrowPosition_AaveV2);

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
        args: [aWEth, generalAdapter1, maxUint256],
        tx: {
          to: aWEth,
          data: encodeFunctionData({
            abi: aTokenV2Abi,
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
                    position.borrow,
                    MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE,
                  ),
                  0n,
                  minSharePrice,
                  aaveV2MigrationAdapter,
                ],
              },
              {
                type: "aaveV2Repay",
                args: [usdt, maxUint256, client.account.address, 2n],
              },
              {
                type: "erc20Transfer",
                args: [
                  marketTo.loanToken,
                  generalAdapter1,
                  maxUint256,
                  aaveV2MigrationAdapter,
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
                args: [aWEth, maxUint256, aaveV2MigrationAdapter],
              },
              {
                type: "aaveV2Withdraw",
                args: [wNative, maxUint256, generalAdapter1],
              },
            ],
          ],
          type: "morphoSupplyCollateral",
        },
        {
          type: "erc20Transfer",
          args: [wNative, client.account.address, maxUint256],
        },
      ]);

      await sendTransaction(client, migrationBundle.requirements.txs[0]!.tx);
      await sendTransaction(client, migrationBundle.requirements.txs[1]!.tx);

      await sendTransaction(client, migrationBundle.tx());

      const transferredAssets = [usdt, wNative, aWEth];
      const adapters = [generalAdapter1, aaveV2MigrationAdapter];

      const [
        finalPositionTo,
        finalCollateralFrom,
        finalDebtFrom,
        adaptersBalances,
      ] = await Promise.all([
        fetchAccrualPosition(client.account.address, marketTo.id, client),
        readContract(client, {
          abi: aTokenV2Abi,
          address: aWEth,
          functionName: "balanceOf",
          args: [client.account.address],
        }),
        readContract(client, {
          abi: variableDebtTokenV2Abi,
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
      const borrowAmount = parseUnits("3000", 6);

      const liquidity = parseEther("4");

      const migratedBorrow = parseUnits("1500", 6);

      await writeSupply(client, wNative, collateralAmount, true);
      await writeBorrow(client, usdt, borrowAmount);
      await client.deal({
        erc20: wNative,
        account: aWEth,
        amount: liquidity,
      });
      await addBlueLiquidity(client, marketTo, migratedBorrow);

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(1);

      const position = aaveV2Positions[0]! as MigratableBorrowPosition_AaveV2;
      expect(position).toBeInstanceOf(MigratableBorrowPosition_AaveV2);
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
            aWEth,
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
                  aaveV2MigrationAdapter,
                ],
              },
              {
                type: "aaveV2Repay",
                args: [usdt, maxUint256, client.account.address, 2n],
              },
              {
                type: "erc20TransferFrom",
                args: [aWEth, liquidity, aaveV2MigrationAdapter],
              },
              {
                type: "aaveV2Withdraw",
                args: [wNative, liquidity, generalAdapter1],
              },
            ],
          ],
          type: "morphoSupplyCollateral",
        },
        {
          type: "erc20Transfer",
          args: [aWEth, client.account.address, maxUint256],
        },
      ]);

      await migrationBundle.requirements.signatures[0]!.sign(client);
      await migrationBundle.requirements.signatures[1]!.sign(client);

      await sendTransaction(client, migrationBundle.tx());

      const transferredAssets = [usdt, wNative, aWEth];
      const adapters = [generalAdapter1, aaveV2MigrationAdapter];

      const [
        finalPositionTo,
        finalCollateralFrom,
        finalDebtFrom,
        adaptersBalances,
      ] = await Promise.all([
        fetchAccrualPosition(client.account.address, marketTo.id, client),
        readContract(client, {
          abi: aTokenV2Abi,
          address: aWEth,
          functionName: "balanceOf",
          args: [client.account.address],
        }),
        readContract(client, {
          abi: variableDebtTokenV2Abi,
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
      expect(finalPositionTo.borrowAssets).approximately(migratedBorrow, 2n);

      expect(finalCollateralFrom).toBeGreaterThan(collateralAmount - liquidity);
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
