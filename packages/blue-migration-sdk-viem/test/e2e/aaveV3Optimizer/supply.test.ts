import { type Address, erc20Abi, parseEther } from "viem";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
  fetchMigratablePositions,
} from "../../../src/index.js";

import { ChainId, MathLib, addresses } from "@morpho-org/blue-sdk";
import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { vaults } from "@morpho-org/morpho-test";
import type { AnvilTestClient } from "@morpho-org/test";
import { readContract, sendTransaction, writeContract } from "viem/actions";
import { describe, expect } from "vitest";
import { MIGRATION_ADDRESSES } from "../../../src/config.js";
import { MigratableSupplyPosition_AaveV3Optimizer } from "../../../src/positions/supply/aaveV3Optimizer.supply.js";
import { test } from "../setup.js";

const { morpho } = MIGRATION_ADDRESSES[ChainId.EthMainnet].aaveV3Optimizer;
const { aaveV3OptimizerBundler, wNative } = addresses[ChainId.EthMainnet];

const writeSupply = async (
  client: AnvilTestClient,
  market: Address,
  amount: bigint,
) => {
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
};

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
    expect(aaveV3OptimizerPositions).not.undefined;
    expect(aaveV3OptimizerPositions).to.have.length(1);

    const position =
      aaveV3OptimizerPositions[0]! as MigratableSupplyPosition_AaveV3Optimizer;
    expect(position).to.be.instanceOf(MigratableSupplyPosition_AaveV3Optimizer);

    expect(position.protocol).to.equal(MigratableProtocol.aaveV3Optimizer);
    expect(position.user).to.equal(client.account.address);
    expect(position.loanToken).to.equal(wNative);
    expect(position.nonce).to.equal(0n);
    expect(position.isBundlerManaging).to.equal(false);
    expect(position.supply).approximately(
      //TODO fix typescript
      amount,
      1n,
    );
    expect(position.max.limiter).to.equal(SupplyMigrationLimiter.position);
    expect(position.max.value).approximately(
      //TODO fix typescript
      amount,
      1n,
    );
  });

  test[ChainId.EthMainnet](
    "should fetch user position with bundler managing",
    async ({ client }) => {
      const amount = parseEther("1");
      await writeSupply(client, wNative, amount);
      await writeContract(client, {
        ...morpho,
        functionName: "approveManager",
        args: [aaveV3OptimizerBundler, true],
      });

      const allPositions = await fetchMigratablePositions(
        client.account.address,
        client,
        { protocols: [MigratableProtocol.aaveV3Optimizer] },
      );

      const aaveV3OptimizerPositions =
        allPositions[MigratableProtocol.aaveV3Optimizer]!;
      expect(aaveV3OptimizerPositions).not.undefined;
      expect(aaveV3OptimizerPositions).to.have.length(1);

      const position =
        aaveV3OptimizerPositions[0]! as MigratableSupplyPosition_AaveV3Optimizer;
      expect(position).to.be.instanceOf(
        MigratableSupplyPosition_AaveV3Optimizer,
      );

      expect(position.isBundlerManaging).to.be.true;
    },
  );

  test[ChainId.EthMainnet](
    "should fetch user position with withdraw paused",
    async ({ client }) => {
      const amount = parseEther("1");
      await writeSupply(client, wNative, amount);

      const owner = await readContract(client, {
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
      expect(aaveV3OptimizerPositions).not.undefined;
      expect(aaveV3OptimizerPositions).to.have.length(1);

      const position =
        aaveV3OptimizerPositions[0]! as MigratableSupplyPosition_AaveV3Optimizer;
      expect(position).to.be.instanceOf(
        MigratableSupplyPosition_AaveV3Optimizer,
      );

      expect(position.max).to.eql({
        limiter: SupplyMigrationLimiter.withdrawPaused,
        value: 0n,
      });
    },
  );

  test[ChainId.EthMainnet](
    "should fetch user position with limited liquidity",
    async ({ client }) => {
      const { aToken } = await readContract(client, {
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
      expect(aaveV3Positions).not.undefined;
      expect(aaveV3Positions).to.have.length(1);

      const position =
        aaveV3Positions[0]! as MigratableSupplyPosition_AaveV3Optimizer;
      expect(position).to.be.instanceOf(
        MigratableSupplyPosition_AaveV3Optimizer,
      );

      expect(position.max).to.eql({
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
      expect(aaveV3Positions).not.undefined;
      expect(aaveV3Positions).to.have.length(1);

      const migrationBundle = aaveV3Positions[0]!.getMigrationTx(
        {
          vault: mmWeth,
          amount: migratedAmount,
          minShares: 0n,
        },
        ChainId.EthMainnet,
        true,
      );

      expect(migrationBundle.requirements.txs).to.have.length(0);
      expect(migrationBundle.requirements.signatures).to.have.length(1);
      const deadline = migrationBundle.actions[0]?.args[2];
      expect(migrationBundle.actions).eql([
        {
          args: [true, 0n, deadline, null],
          type: "aaveV3OptimizerApproveManagerWithSig",
        },
        {
          args: [wNative, migratedAmount, 4n],
          type: "aaveV3OptimizerWithdraw",
        },
        {
          args: [mmWeth, MathLib.MAX_UINT_128, 0n, client.account.address],
          type: "erc4626Deposit",
        },
      ]);

      await migrationBundle.requirements.signatures[0]!.sign(client);

      await sendTransaction(client, migrationBundle.tx());

      const [wEthBundlerBalance, userPosition, userMMShares] =
        await Promise.all([
          readContract(client, {
            abi: erc20Abi,
            address: wNative,
            functionName: "balanceOf",
            args: [aaveV3OptimizerBundler],
          }),
          readContract(client, {
            ...morpho,
            functionName: "supplyBalance",
            args: [wNative, client.account.address],
          }),
          readContract(client, {
            abi: metaMorphoAbi,
            address: mmWeth,
            functionName: "balanceOf",
            args: [client.account.address],
          }),
        ]);

      const userMMBalance = await readContract(client, {
        abi: metaMorphoAbi,
        address: mmWeth,
        functionName: "convertToAssets",
        args: [userMMShares],
      });

      expect(wEthBundlerBalance).eql(0n);
      expect(userPosition).gt(positionAmount - migratedAmount); //interest have been accumulated
      expect(userMMBalance).approximately(
        //TODO fix typescript
        migratedAmount,
        1n,
      );
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
      expect(aaveV3Positions).not.undefined;
      expect(aaveV3Positions).to.have.length(1);

      const migrationBundle = aaveV3Positions[0]!.getMigrationTx(
        {
          vault: mmWeth,
          amount: positionAmount,
          minShares: 0n,
        },
        ChainId.EthMainnet,
        true,
      );

      expect(migrationBundle.requirements.txs).to.have.length(0);
      expect(migrationBundle.requirements.signatures).to.have.length(1);
      const deadline = migrationBundle.actions[0]?.args[2];
      expect(migrationBundle.actions).eql([
        {
          args: [true, 0n, deadline, null],
          type: "aaveV3OptimizerApproveManagerWithSig",
        },
        {
          args: [wNative, MathLib.MAX_UINT_160, 4n],
          type: "aaveV3OptimizerWithdraw",
        },
        {
          args: [mmWeth, MathLib.MAX_UINT_128, 0n, client.account.address],
          type: "erc4626Deposit",
        },
      ]);

      await migrationBundle.requirements.signatures[0]!.sign(client);

      await sendTransaction(client, migrationBundle.tx());

      const [wEthBundlerBalance, userPosition, userMMShares] =
        await Promise.all([
          readContract(client, {
            abi: erc20Abi,
            address: wNative,
            functionName: "balanceOf",
            args: [aaveV3OptimizerBundler],
          }),
          readContract(client, {
            ...morpho,
            functionName: "supplyBalance",
            args: [wNative, client.account.address],
          }),
          readContract(client, {
            abi: metaMorphoAbi,
            address: mmWeth,
            functionName: "balanceOf",
            args: [client.account.address],
          }),
        ]);

      const userMMBalance = await readContract(client, {
        abi: metaMorphoAbi,
        address: mmWeth,
        functionName: "convertToAssets",
        args: [userMMShares],
      });

      expect(wEthBundlerBalance).eql(0n);
      expect(userPosition).eql(0n);
      expect(userMMBalance).gt(positionAmount); //interest have been accumulated
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
      expect(aaveV3Positions).not.undefined;
      expect(aaveV3Positions).to.have.length(1);

      const migrationBundle = aaveV3Positions[0]!.getMigrationTx(
        {
          vault: mmWeth,
          amount: migratedAmount,
          minShares: 0n,
        },
        ChainId.EthMainnet,
        false,
      );

      expect(migrationBundle.requirements.txs).to.have.length(1);
      expect(migrationBundle.requirements.signatures).to.have.length(0);
      expect(migrationBundle.actions).eql([
        {
          args: [wNative, migratedAmount, 4n],
          type: "aaveV3OptimizerWithdraw",
        },
        {
          args: [mmWeth, MathLib.MAX_UINT_128, 0n, client.account.address],
          type: "erc4626Deposit",
        },
      ]);

      await sendTransaction(client, migrationBundle.requirements.txs[0]!.tx);
      await sendTransaction(client, migrationBundle.tx());

      const [wEthBundlerBalance, userPosition, userMMShares] =
        await Promise.all([
          readContract(client, {
            abi: erc20Abi,
            address: wNative,
            functionName: "balanceOf",
            args: [aaveV3OptimizerBundler],
          }),
          readContract(client, {
            ...morpho,
            functionName: "supplyBalance",
            args: [wNative, client.account.address],
          }),
          readContract(client, {
            abi: metaMorphoAbi,
            address: mmWeth,
            functionName: "balanceOf",
            args: [client.account.address],
          }),
        ]);

      const userMMBalance = await readContract(client, {
        abi: metaMorphoAbi,
        address: mmWeth,
        functionName: "convertToAssets",
        args: [userMMShares],
      });

      expect(wEthBundlerBalance).eql(0n);
      expect(userPosition).gt(positionAmount - migratedAmount); //interest have been accumulated
      expect(userMMBalance).approximately(
        //TODO fix typescript
        migratedAmount,
        1n,
      );
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
      expect(aaveV3Positions).not.undefined;
      expect(aaveV3Positions).to.have.length(1);

      const migrationBundle = aaveV3Positions[0]!.getMigrationTx(
        {
          vault: mmWeth,
          amount: positionAmount,
          minShares: 0n,
        },
        ChainId.EthMainnet,
        false,
      );

      expect(migrationBundle.requirements.txs).to.have.length(1);
      expect(migrationBundle.requirements.signatures).to.have.length(0);
      expect(migrationBundle.actions).eql([
        {
          args: [wNative, MathLib.MAX_UINT_160, 4n],
          type: "aaveV3OptimizerWithdraw",
        },
        {
          args: [mmWeth, MathLib.MAX_UINT_128, 0n, client.account.address],
          type: "erc4626Deposit",
        },
      ]);

      await sendTransaction(client, migrationBundle.requirements.txs[0]!.tx);
      await sendTransaction(client, migrationBundle.tx());

      const [wEthBundlerBalance, userPosition, userMMShares] =
        await Promise.all([
          readContract(client, {
            abi: erc20Abi,
            address: wNative,
            functionName: "balanceOf",
            args: [aaveV3OptimizerBundler],
          }),
          readContract(client, {
            ...morpho,
            functionName: "supplyBalance",
            args: [wNative, client.account.address],
          }),
          readContract(client, {
            abi: metaMorphoAbi,
            address: mmWeth,
            functionName: "balanceOf",
            args: [client.account.address],
          }),
        ]);

      const userMMBalance = await readContract(client, {
        abi: metaMorphoAbi,
        address: mmWeth,
        functionName: "convertToAssets",
        args: [userMMShares],
      });

      expect(wEthBundlerBalance).eql(0n);
      expect(userPosition).eql(0n);
      expect(userMMBalance).gt(positionAmount); //interest have been accumulated
    },
  );
});
