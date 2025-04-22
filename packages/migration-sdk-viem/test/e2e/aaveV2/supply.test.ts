import { type Address, maxUint256, parseEther, parseUnits } from "viem";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
  fetchMigratablePositions,
} from "../../../src/index.js";
import { MigratableSupplyPosition_AaveV2 } from "../../../src/positions/supply/aaveV2.supply.js";

import { ChainId, MathLib, addressesRegistry } from "@morpho-org/blue-sdk";
import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { vaults } from "@morpho-org/morpho-test";
import type { AnvilTestClient } from "@morpho-org/test";
import { sendTransaction } from "viem/actions";
import { describe, expect } from "vitest";
import { migrationAddressesRegistry } from "../../../src/config.js";
import { MigratableBorrowPosition_AaveV2 } from "../../../src/positions/borrow/aaveV2.borrow.js";
import { test } from "../setup.js";

const aWeth = "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e";
const { lendingPool } = migrationAddressesRegistry[ChainId.EthMainnet].aaveV2;
const {
  bundler3: { generalAdapter1, aaveV2MigrationAdapter },
  wNative,
  usdc,
} = addressesRegistry[ChainId.EthMainnet];

const writeSupply = async (
  client: AnvilTestClient,
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

describe("Supply position on AAVE V2", () => {
  test[ChainId.EthMainnet]("should fetch user position", async ({ client }) => {
    const amount = parseEther("1");

    await writeSupply(client, wNative, amount);

    const allPositions = await fetchMigratablePositions(
      client.account.address,
      client,
      { protocols: [MigratableProtocol.aaveV2] },
    );

    const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
    expect(aaveV2Positions).toBeDefined();
    expect(aaveV2Positions).toHaveLength(1);

    const position = aaveV2Positions[0]! as MigratableSupplyPosition_AaveV2;
    expect(position).toBeInstanceOf(MigratableSupplyPosition_AaveV2);

    expect(position.protocol).toEqual(MigratableProtocol.aaveV2);
    expect(position.user).toEqual(client.account.address);
    expect(position.loanToken).toEqual(wNative);
    expect(position.nonce).toEqual(0n);
    expect(position.aToken.address).toEqual(aWeth);
    expect(position.supply).toBeGreaterThanOrEqual(amount); //interests accrued
    expect(position.max.limiter).toEqual(SupplyMigrationLimiter.position);
    expect(position.max.value).toEqual(position.supply);
    expect(position.supplyApy).not.toEqual(0);
    expect(position.supplyApy).not.toEqual(Number.POSITIVE_INFINITY);
  });

  test[ChainId.EthMainnet](
    "should fetch multiple user position",
    async ({ client }) => {
      const amountWeth = parseEther("1");
      const amountUsdc = parseUnits("1324", 6);

      await writeSupply(client, wNative, amountWeth);
      await writeSupply(client, usdc, amountUsdc);

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(2);
    },
  );

  test[ChainId.EthMainnet](
    "should fetch user collateral positions if no borrow",
    async ({ client }) => {
      const amount = parseEther("1");

      await writeSupply(client, wNative, amount, true);

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(1);
    },
  );

  test[ChainId.EthMainnet](
    "shouldn't fetch user collateral positions if borrow",
    async ({ client }) => {
      const collateral = parseEther("1");
      const borrow = parseUnits("1", 6);

      await writeSupply(client, wNative, collateral, true);
      await client.writeContract({
        ...lendingPool,
        functionName: "borrow",
        args: [usdc, borrow, 2n, 0, client.account.address],
      });

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(1);
      expect(aaveV2Positions[0]).toBeInstanceOf(
        MigratableBorrowPosition_AaveV2,
      );
    },
  );

  test[ChainId.EthMainnet](
    "should fetch user position with limited liquidity",
    async ({ client }) => {
      const amount = parseEther("5");
      const liquidity = parseEther("3");

      await writeSupply(client, wNative, amount);
      await client.deal({ erc20: wNative, account: aWeth, amount: liquidity });

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(1);

      const position = aaveV2Positions[0]! as MigratableSupplyPosition_AaveV2;
      expect(position).toBeInstanceOf(MigratableSupplyPosition_AaveV2);

      expect(position.max).toEqual({
        limiter: SupplyMigrationLimiter.liquidity,
        value: liquidity,
      });
    },
  );

  test[ChainId.EthMainnet](
    "Should partially migrate user position",
    async ({ client }) => {
      const positionAmount = parseEther("5");
      const migratedAmount = parseEther("3");
      const mmWeth = vaults[ChainId.EthMainnet].steakEth.address;

      await writeSupply(client, wNative, positionAmount);

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(1);

      const position = aaveV2Positions[0]! as MigratableSupplyPosition_AaveV2;

      const migrationBundle = position.getMigrationTx(
        {
          vault: mmWeth,
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
            aWeth,
            migratedAmount,
            expect.any(BigInt),
            null,
          ],
          type: "permit",
        },
        {
          args: [aWeth, migratedAmount, aaveV2MigrationAdapter],
          type: "erc20TransferFrom",
        },
        {
          args: [wNative, maxUint256, generalAdapter1],
          type: "aaveV2Withdraw",
        },
        {
          args: [mmWeth, maxUint256, 2n * MathLib.RAY, client.account.address],
          type: "erc4626Deposit",
        },
      ]);

      await migrationBundle.requirements.signatures[0]!.sign(client);

      await sendTransaction(client, migrationBundle.tx());

      const [bundlerPosition, wEthBundlerBalance, userPosition, userMMShares] =
        await Promise.all([
          client.balanceOf({ erc20: aWeth, owner: aaveV2MigrationAdapter }),
          client.balanceOf({ erc20: wNative, owner: aaveV2MigrationAdapter }),
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

  test[ChainId.EthMainnet](
    "Should fully migrate user position",
    async ({ client }) => {
      const positionAmount = parseEther("5");

      const mmWeth = vaults[ChainId.EthMainnet].steakEth.address;

      await writeSupply(client, wNative, positionAmount);

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(1);

      const position = aaveV2Positions[0]! as MigratableSupplyPosition_AaveV2;

      const migrationBundle = position.getMigrationTx(
        {
          vault: mmWeth,
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
            aWeth,
            maxUint256,
            expect.any(BigInt),
            null,
          ],
          type: "permit",
        },
        {
          args: [aWeth, maxUint256, aaveV2MigrationAdapter],
          type: "erc20TransferFrom",
        },
        {
          args: [wNative, maxUint256, generalAdapter1],
          type: "aaveV2Withdraw",
        },
        {
          args: [mmWeth, maxUint256, 2n * MathLib.RAY, client.account.address],
          type: "erc4626Deposit",
        },
      ]);

      await migrationBundle.requirements.signatures[0]!.sign(client);

      await sendTransaction(client, migrationBundle.tx());

      const [bundlerPosition, wEthBundlerBalance, userPosition, userMMShares] =
        await Promise.all([
          client.balanceOf({ erc20: aWeth, owner: aaveV2MigrationAdapter }),
          client.balanceOf({ erc20: wNative, owner: aaveV2MigrationAdapter }),
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

  test[ChainId.EthMainnet](
    "Should partially migrate user position without signature",
    async ({ client }) => {
      const positionAmount = parseEther("5");
      const migratedAmount = parseEther("3");
      const mmWeth = vaults[ChainId.EthMainnet].steakEth.address;

      await writeSupply(client, wNative, positionAmount);

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(1);

      const position = aaveV2Positions[0]! as MigratableSupplyPosition_AaveV2;

      const migrationBundle = position.getMigrationTx(
        {
          vault: mmWeth,
          amount: migratedAmount,
          maxSharePrice: 2n * MathLib.RAY,
        },
        false,
      );

      expect(migrationBundle.requirements.txs).toHaveLength(1);
      expect(migrationBundle.requirements.signatures).toHaveLength(0);
      expect(migrationBundle.actions).toEqual([
        {
          args: [aWeth, migratedAmount, aaveV2MigrationAdapter],
          type: "erc20TransferFrom",
        },
        {
          args: [wNative, maxUint256, generalAdapter1],
          type: "aaveV2Withdraw",
        },
        {
          args: [mmWeth, maxUint256, 2n * MathLib.RAY, client.account.address],
          type: "erc4626Deposit",
        },
      ]);

      await sendTransaction(client, migrationBundle.requirements.txs[0]!.tx);

      await sendTransaction(client, migrationBundle.tx());

      const [bundlerPosition, wEthBundlerBalance, userPosition, userMMShares] =
        await Promise.all([
          client.balanceOf({ erc20: aWeth, owner: aaveV2MigrationAdapter }),
          client.balanceOf({ erc20: wNative, owner: aaveV2MigrationAdapter }),
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

  test[ChainId.EthMainnet](
    "Should fully migrate user position without signature",
    async ({ client }) => {
      const positionAmount = parseEther("5");

      const mmWeth = vaults[ChainId.EthMainnet].steakEth.address;

      await writeSupply(client, wNative, positionAmount);

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV2] },
      );

      const aaveV2Positions = allPositions[MigratableProtocol.aaveV2]!;
      expect(aaveV2Positions).toBeDefined();
      expect(aaveV2Positions).toHaveLength(1);

      const position = aaveV2Positions[0]! as MigratableSupplyPosition_AaveV2;

      const migrationBundle = position.getMigrationTx(
        {
          vault: mmWeth,
          amount: position.supply,
          maxSharePrice: 2n * MathLib.RAY,
        },
        false,
      );

      expect(migrationBundle.requirements.txs).toHaveLength(1);
      expect(migrationBundle.requirements.signatures).toHaveLength(0);
      expect(migrationBundle.actions).toEqual([
        {
          args: [aWeth, maxUint256, aaveV2MigrationAdapter],
          type: "erc20TransferFrom",
        },
        {
          args: [wNative, maxUint256, generalAdapter1],
          type: "aaveV2Withdraw",
        },
        {
          args: [mmWeth, maxUint256, 2n * MathLib.RAY, client.account.address],
          type: "erc4626Deposit",
        },
      ]);

      await sendTransaction(client, migrationBundle.requirements.txs[0]!.tx);
      await sendTransaction(client, migrationBundle.tx());

      const [bundlerPosition, wEthBundlerBalance, userPosition, userMMShares] =
        await Promise.all([
          client.balanceOf({ erc20: aWeth, owner: aaveV2MigrationAdapter }),
          client.balanceOf({ erc20: wNative, owner: aaveV2MigrationAdapter }),
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
