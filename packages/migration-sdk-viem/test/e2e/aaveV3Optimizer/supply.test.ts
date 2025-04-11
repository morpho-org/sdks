import { type Address, erc20Abi, maxUint256, parseEther } from "viem";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
  fetchMigratablePositions,
} from "../../../src/index.js";

import { ChainId, MathLib, addressesRegistry } from "@morpho-org/blue-sdk";
import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { vaults } from "@morpho-org/morpho-test";
import type { AnvilTestClient } from "@morpho-org/test";
import { sendTransaction, writeContract } from "viem/actions";
import { describe, expect } from "vitest";
import { migrationAddressesRegistry } from "../../../src/config.js";
import { MigratableSupplyPosition_AaveV3Optimizer } from "../../../src/positions/supply/aaveV3Optimizer.supply.js";
import { test } from "../setup.js";

const { morpho } =
  migrationAddressesRegistry[ChainId.EthMainnet].aaveV3Optimizer;
const {
  bundler3: { generalAdapter1, aaveV3OptimizerMigrationAdapter },
  wNative,
} = addressesRegistry[ChainId.EthMainnet];

const writeSupply = async (
  client: AnvilTestClient,
  market: Address,
  amount: bigint,
) => {
  const owner = await client.readContract({
    ...morpho,
    functionName: "owner",
  });

  await client.deal({ account: owner, amount: parseEther("1") });
  await client.writeContract({
    ...morpho,
    functionName: "setIsSupplyPaused",
    args: [market, false],
    account: owner,
  });

  await client.deal({
    erc20: market,
    amount: amount,
  });
  await client.approve({
    address: market,
    args: [morpho.address, amount],
  });
  await client.writeContract({
    ...morpho,
    functionName: "supply",
    args: [market, amount, client.account.address, 4n],
  });

  await client.mine({ blocks: 500 }); //accrue some interests
};

// AaveV3Optimizer is deprecated (supply is paused).
describe("Supply position on Morpho AAVE V3", () => {
  test[ChainId.EthMainnet]("should fetch user position", async ({ client }) => {
    const amount = parseEther("1");

    await writeSupply(client, wNative, amount);

    const allPositions = await fetchMigratablePositions(
      client.account.address,
      client,
      { protocols: [MigratableProtocol.aaveV3Optimizer] },
    );

    const aaveV3OptimizerPositions =
      allPositions[MigratableProtocol.aaveV3Optimizer]!;
    expect(aaveV3OptimizerPositions).toBeDefined();
    expect(aaveV3OptimizerPositions).toHaveLength(1);

    const position =
      aaveV3OptimizerPositions[0]! as MigratableSupplyPosition_AaveV3Optimizer;
    expect(position).toBeInstanceOf(MigratableSupplyPosition_AaveV3Optimizer);

    expect(position.protocol).toEqual(MigratableProtocol.aaveV3Optimizer);
    expect(position.user).toEqual(client.account.address);
    expect(position.loanToken).toEqual(wNative);
    expect(position.nonce).toEqual(0n);
    expect(position.isBundlerManaging).toEqual(false);
    expect(position.supply).toBeGreaterThan(amount); //interest accrued
    expect(position.max.limiter).toEqual(SupplyMigrationLimiter.position);
    expect(position.max.value).toEqual(position.supply);
    expect(position.supplyApy).not.toEqual(0);
    expect(position.supplyApy).not.toEqual(Number.POSITIVE_INFINITY);
  });

  test[ChainId.EthMainnet](
    "should fetch user position with bundler managing",
    async ({ client }) => {
      const amount = parseEther("1");
      await writeSupply(client, wNative, amount);
      await writeContract(client, {
        ...morpho,
        functionName: "approveManager",
        args: [aaveV3OptimizerMigrationAdapter, true],
      });

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV3Optimizer] },
      );

      const aaveV3OptimizerPositions =
        allPositions[MigratableProtocol.aaveV3Optimizer]!;
      expect(aaveV3OptimizerPositions).toBeDefined();
      expect(aaveV3OptimizerPositions).toHaveLength(1);

      const position =
        aaveV3OptimizerPositions[0]! as MigratableSupplyPosition_AaveV3Optimizer;
      expect(position).toBeInstanceOf(MigratableSupplyPosition_AaveV3Optimizer);

      expect(position.isBundlerManaging).toBeTruthy();
    },
  );

  test[ChainId.EthMainnet](
    "should fetch user position with withdraw paused",
    async ({ client }) => {
      const amount = parseEther("1");
      await writeSupply(client, wNative, amount);

      const owner = await client.readContract({
        ...morpho,
        functionName: "owner",
        args: [],
      });
      await client.deal({ account: owner, amount: parseEther("10") }); // for gas
      await writeContract(client, {
        ...morpho,
        functionName: "setIsWithdrawPaused",
        args: [wNative, true],
        account: owner,
      });

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV3Optimizer] },
      );

      const aaveV3OptimizerPositions =
        allPositions[MigratableProtocol.aaveV3Optimizer]!;
      expect(aaveV3OptimizerPositions).toBeDefined();
      expect(aaveV3OptimizerPositions).toHaveLength(1);

      const position =
        aaveV3OptimizerPositions[0]! as MigratableSupplyPosition_AaveV3Optimizer;
      expect(position).toBeInstanceOf(MigratableSupplyPosition_AaveV3Optimizer);

      expect(position.max).toEqual({
        limiter: SupplyMigrationLimiter.withdrawPaused,
        value: 0n,
      });
    },
  );

  test[ChainId.EthMainnet](
    "should fetch user position with limited liquidity",
    async ({ client }) => {
      const { aToken } = await client.readContract({
        ...morpho,
        functionName: "market",
        args: [wNative],
      });
      const amount = parseEther("5");
      const liquidity = parseEther("3");

      await writeSupply(client, wNative, amount);
      await client.deal({
        erc20: wNative,
        account: aToken,
        amount: liquidity,
      });

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV3Optimizer] },
      );

      const aaveV3Positions = allPositions[MigratableProtocol.aaveV3Optimizer]!;
      expect(aaveV3Positions).toBeDefined();
      expect(aaveV3Positions).toHaveLength(1);

      const position =
        aaveV3Positions[0]! as MigratableSupplyPosition_AaveV3Optimizer;
      expect(position).toBeInstanceOf(MigratableSupplyPosition_AaveV3Optimizer);

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
        { protocols: [MigratableProtocol.aaveV3Optimizer] },
      );

      const aaveV3Positions = allPositions[MigratableProtocol.aaveV3Optimizer]!;
      expect(aaveV3Positions).toBeDefined();
      expect(aaveV3Positions).toHaveLength(1);

      const position =
        aaveV3Positions[0]! as MigratableSupplyPosition_AaveV3Optimizer;

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
            migrationAddressesRegistry[ChainId.EthMainnet][
              MigratableProtocol.aaveV3Optimizer
            ].morpho.address,
            client.account.address,
            true,
            0n,
            expect.any(BigInt),
            null,
          ],
          type: "aaveV3OptimizerApproveManagerWithSig",
        },
        {
          args: [wNative, migratedAmount, 4n, generalAdapter1],
          type: "aaveV3OptimizerWithdraw",
        },
        {
          args: [mmWeth, maxUint256, 2n * MathLib.RAY, client.account.address],
          type: "erc4626Deposit",
        },
      ]);

      await migrationBundle.requirements.signatures[0]!.sign(client);

      await sendTransaction(client, migrationBundle.tx());

      const [wEthBundlerBalance, userPosition, userMMShares] =
        await Promise.all([
          client.readContract({
            abi: erc20Abi,
            address: wNative,
            functionName: "balanceOf",
            args: [aaveV3OptimizerMigrationAdapter],
          }),
          client.readContract({
            ...morpho,
            functionName: "supplyBalance",
            args: [wNative, client.account.address],
          }),
          client.readContract({
            abi: metaMorphoAbi,
            address: mmWeth,
            functionName: "balanceOf",
            args: [client.account.address],
          }),
        ]);

      const userMMBalance = await client.readContract({
        abi: metaMorphoAbi,
        address: mmWeth,
        functionName: "convertToAssets",
        args: [userMMShares],
      });

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
        { protocols: [MigratableProtocol.aaveV3Optimizer] },
      );

      const aaveV3Positions = allPositions[MigratableProtocol.aaveV3Optimizer]!;
      expect(aaveV3Positions).toBeDefined();
      expect(aaveV3Positions).toHaveLength(1);

      const position =
        aaveV3Positions[0]! as MigratableSupplyPosition_AaveV3Optimizer;
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
            migrationAddressesRegistry[ChainId.EthMainnet][
              MigratableProtocol.aaveV3Optimizer
            ].morpho.address,
            client.account.address,
            true,
            0n,
            expect.any(BigInt),
            null,
          ],
          type: "aaveV3OptimizerApproveManagerWithSig",
        },
        {
          args: [wNative, maxUint256, 4n, generalAdapter1],
          type: "aaveV3OptimizerWithdraw",
        },
        {
          args: [mmWeth, maxUint256, 2n * MathLib.RAY, client.account.address],
          type: "erc4626Deposit",
        },
      ]);

      await migrationBundle.requirements.signatures[0]!.sign(client);

      await sendTransaction(client, migrationBundle.tx());

      const [wEthBundlerBalance, userPosition, userMMShares] =
        await Promise.all([
          client.readContract({
            abi: erc20Abi,
            address: wNative,
            functionName: "balanceOf",
            args: [aaveV3OptimizerMigrationAdapter],
          }),
          client.readContract({
            ...morpho,
            functionName: "supplyBalance",
            args: [wNative, client.account.address],
          }),
          client.readContract({
            abi: metaMorphoAbi,
            address: mmWeth,
            functionName: "balanceOf",
            args: [client.account.address],
          }),
        ]);

      const userMMBalance = await client.readContract({
        abi: metaMorphoAbi,
        address: mmWeth,
        functionName: "convertToAssets",
        args: [userMMShares],
      });

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
        { protocols: [MigratableProtocol.aaveV3Optimizer] },
      );

      const aaveV3Positions = allPositions[MigratableProtocol.aaveV3Optimizer]!;
      expect(aaveV3Positions).toBeDefined();
      expect(aaveV3Positions).toHaveLength(1);

      const position =
        aaveV3Positions[0]! as MigratableSupplyPosition_AaveV3Optimizer;

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
          args: [wNative, migratedAmount, 4n, generalAdapter1],
          type: "aaveV3OptimizerWithdraw",
        },
        {
          args: [mmWeth, maxUint256, 2n * MathLib.RAY, client.account.address],
          type: "erc4626Deposit",
        },
      ]);

      await sendTransaction(client, migrationBundle.requirements.txs[0]!.tx);
      await sendTransaction(client, migrationBundle.tx());

      const [wEthBundlerBalance, userPosition, userMMShares] =
        await Promise.all([
          client.readContract({
            abi: erc20Abi,
            address: wNative,
            functionName: "balanceOf",
            args: [aaveV3OptimizerMigrationAdapter],
          }),
          client.readContract({
            ...morpho,
            functionName: "supplyBalance",
            args: [wNative, client.account.address],
          }),
          client.readContract({
            abi: metaMorphoAbi,
            address: mmWeth,
            functionName: "balanceOf",
            args: [client.account.address],
          }),
        ]);

      const userMMBalance = await client.readContract({
        abi: metaMorphoAbi,
        address: mmWeth,
        functionName: "convertToAssets",
        args: [userMMShares],
      });

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
        { protocols: [MigratableProtocol.aaveV3Optimizer] },
      );

      const aaveV3Positions = allPositions[MigratableProtocol.aaveV3Optimizer]!;
      expect(aaveV3Positions).toBeDefined();
      expect(aaveV3Positions).toHaveLength(1);

      const position =
        aaveV3Positions[0]! as MigratableSupplyPosition_AaveV3Optimizer;

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
          args: [wNative, maxUint256, 4n, generalAdapter1],
          type: "aaveV3OptimizerWithdraw",
        },
        {
          args: [mmWeth, maxUint256, 2n * MathLib.RAY, client.account.address],
          type: "erc4626Deposit",
        },
      ]);

      await sendTransaction(client, migrationBundle.requirements.txs[0]!.tx);
      await sendTransaction(client, migrationBundle.tx());

      const [wEthBundlerBalance, userPosition, userMMShares] =
        await Promise.all([
          client.readContract({
            abi: erc20Abi,
            address: wNative,
            functionName: "balanceOf",
            args: [aaveV3OptimizerMigrationAdapter],
          }),
          client.readContract({
            ...morpho,
            functionName: "supplyBalance",
            args: [wNative, client.account.address],
          }),
          client.readContract({
            abi: metaMorphoAbi,
            address: mmWeth,
            functionName: "balanceOf",
            args: [client.account.address],
          }),
        ]);

      const userMMBalance = await client.readContract({
        abi: metaMorphoAbi,
        address: mmWeth,
        functionName: "convertToAssets",
        args: [userMMShares],
      });

      expect(wEthBundlerBalance).toEqual(0n);
      expect(userPosition).toEqual(0n);
      expect(userMMBalance).toBeGreaterThan(positionAmount); //interest have been accumulated
    },
  );
});
