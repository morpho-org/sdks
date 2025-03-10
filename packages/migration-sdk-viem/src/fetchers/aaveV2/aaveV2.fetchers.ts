import { type Address, MathLib, getChainAddresses } from "@morpho-org/blue-sdk";
import { isDefined, values } from "@morpho-org/morpho-ts";

import { migrationAddresses } from "../../config.js";
import type { MigratablePosition } from "../../positions/index.js";
import { MigratableSupplyPosition_AaveV2 } from "../../positions/supply/aaveV2.supply.js";
import {
  BorrowMigrationLimiter,
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";

import {
  type FetchParameters,
  blueAbi,
  fetchToken,
} from "@morpho-org/blue-sdk-viem";

import { type Client, erc20Abi, parseUnits } from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  aTokenV2Abi,
  aaveV2OracleAbi,
  variableDebtTokenV2Abi,
} from "../../abis/aaveV2.js";
import { MigratableBorrowPosition_AaveV2 } from "../../positions/borrow/aaveV2.borrow.js";
import { rateToApy } from "../../utils/rates.js";

export async function fetchAaveV2Positions(
  user: Address,
  client: Client,
  parameters: FetchParameters = {},
): Promise<MigratablePosition[]> {
  parameters.chainId ??= await getChainId(client);

  const chainId = parameters.chainId;
  const {
    morpho,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const migrationContracts =
    migrationAddresses[chainId]?.[MigratableProtocol.aaveV2];

  if (!migrationContracts) return [];

  const [allATokens, userConfig, reservesList, oracleAddress] =
    await Promise.all([
      readContract(client, {
        ...parameters,
        abi: migrationContracts.protocolDataProvider.abi,
        address: migrationContracts.protocolDataProvider.address,
        functionName: "getAllATokens",
        args: [],
      }),
      readContract(client, {
        ...parameters,
        abi: migrationContracts.lendingPool.abi,
        address: migrationContracts.lendingPool.address,
        functionName: "getUserConfiguration",
        args: [user],
      }),
      readContract(client, {
        ...parameters,
        abi: migrationContracts.lendingPool.abi,
        address: migrationContracts.lendingPool.address,
        functionName: "getReservesList",
        args: [],
      }),
      readContract(client, {
        ...parameters,
        abi: migrationContracts.addressesProvider.abi,
        address: migrationContracts.addressesProvider.address,
        functionName: "getPriceOracle",
        args: [],
      }),
    ]);

  /* cf https://docs.aave.com/developers/v/2.0/the-core-protocol/lendingpool#getuserconfiguration */
  const orderedUserConfig = userConfig.data
    .toString(2)
    .split("")
    .reduceRight((acc, v) => {
      const lastPair = acc[acc.length - 1];

      if (!lastPair || lastPair.length === 2) {
        return acc.concat(v);
      }
      return [...acc.slice(0, -1), lastPair + v];
    }, [] as string[]);

  const userConfigByToken = Object.fromEntries(
    reservesList.map((reserveToken, index) => {
      const config = orderedUserConfig[index] ?? "00";

      return [
        reserveToken,
        {
          isUsedAsCollateral: config[1] === "1",
          isBorrowed: config[0] === "1",
        },
      ];
    }),
  );

  const positionsData = (
    await Promise.all(
      allATokens.map(async ({ tokenAddress }) => {
        const [underlyingAddress, totalSupply, nonce, aTokenData] =
          await Promise.all([
            readContract(client, {
              ...parameters,
              abi: aTokenV2Abi,
              address: tokenAddress,
              functionName: "UNDERLYING_ASSET_ADDRESS",
              args: [],
            }),
            readContract(client, {
              ...parameters,
              abi: aTokenV2Abi,
              address: tokenAddress,
              functionName: "balanceOf",
              args: [user],
            }),
            readContract(client, {
              ...parameters,
              abi: aTokenV2Abi,
              address: tokenAddress,
              functionName: "_nonces",
              args: [user],
            }),
            fetchToken(tokenAddress, client, parameters),
          ]);

        const userReserveConfig = userConfigByToken[underlyingAddress];

        if (!userReserveConfig) return;

        const [
          poolLiquidity,
          [
            ,
            ,
            liquidationThreshold,
            ,
            ,
            usageAsCollateralEnabled,
            ,
            ,
            isActive,
          ],
          {
            currentLiquidityRate,
            variableDebtTokenAddress,
            currentVariableBorrowRate,
          },
          underlying,
        ] = await Promise.all([
          readContract(client, {
            ...parameters,
            abi: erc20Abi,
            address: underlyingAddress,
            functionName: "balanceOf",
            args: [tokenAddress],
          }),
          readContract(client, {
            ...parameters,
            abi: migrationContracts.protocolDataProvider.abi,
            address: migrationContracts.protocolDataProvider.address,
            functionName: "getReserveConfigurationData",
            args: [underlyingAddress],
          }),
          readContract(client, {
            ...parameters,
            abi: migrationContracts.lendingPool.abi,
            address: migrationContracts.lendingPool.address,
            functionName: "getReserveData",
            args: [underlyingAddress],
          }),
          fetchToken(underlyingAddress, client, parameters),
        ]);

        const [totalBorrow, morphoNonce, isBundlerManaging] = await Promise.all(
          [
            readContract(client, {
              ...parameters,
              abi: variableDebtTokenV2Abi,
              address: variableDebtTokenAddress,
              functionName: "balanceOf",
              args: [user],
            }),
            readContract(client, {
              ...parameters,
              abi: blueAbi,
              address: morpho,
              functionName: "nonce",
              args: [user],
            }),
            readContract(client, {
              ...parameters,
              abi: blueAbi,
              address: morpho,
              functionName: "isAuthorized",
              args: [user, generalAdapter1],
            }),
          ],
        );

        const ethPrice = await readContract(client, {
          ...parameters,
          abi: aaveV2OracleAbi,
          address: oracleAddress,
          functionName: "getAssetPrice",
          args: [underlyingAddress],
        });

        // We need to check both `usageAsCollateralEnabled` and `userReserveConfig.isUsedAsCollateral``
        // Because `userReserveConfig.isUsedAsCollateral` is true by default for everyone when `usageAsCollateralEnabled` is false
        const isCollateral =
          userReserveConfig.isUsedAsCollateral && usageAsCollateralEnabled;

        return {
          underlying,
          supply: {
            isCollateral,
            poolLiquidity,
            totalSupply,
            isActive,
            currentLiquidityRate,
            aTokenData,
            nonce,
            ethPrice,
          },
          borrow: {
            liquidationThreshold,
            currentVariableBorrowRate,
            totalBorrow,
            isActive,
            ethPrice,
            morphoNonce,
            isBundlerManaging,
          },
        };
      }),
    )
  ).filter(isDefined);

  const isBorrowing = values(userConfigByToken).some(
    ({ isBorrowed }) => isBorrowed,
  );

  const positions: MigratablePosition[] = positionsData
    .map(
      ({
        underlying,
        supply: {
          isCollateral,
          isActive,
          poolLiquidity,
          totalSupply,
          currentLiquidityRate,
          nonce,
          aTokenData,
        },
      }) => {
        if (isBorrowing && isCollateral) return;

        /* MAX */
        const max = (() => {
          if (!isActive)
            return {
              value: 0n,
              limiter: SupplyMigrationLimiter.withdrawPaused,
            };

          const maxWithdrawFromAvailableLiquidity = poolLiquidity;
          const maxWithdrawFromSupplyBalance = totalSupply;

          const maxWithdraw = MathLib.min(
            maxWithdrawFromAvailableLiquidity,
            maxWithdrawFromSupplyBalance,
          );

          if (maxWithdraw === maxWithdrawFromAvailableLiquidity)
            return {
              value: maxWithdrawFromAvailableLiquidity,
              limiter: SupplyMigrationLimiter.liquidity,
            };

          if (maxWithdraw === maxWithdrawFromSupplyBalance)
            return {
              value: maxWithdrawFromSupplyBalance,
              limiter: SupplyMigrationLimiter.position,
            };
        })()!;

        if (totalSupply > 0n)
          return new MigratableSupplyPosition_AaveV2({
            user,
            loanToken: underlying.address,
            supply: totalSupply,
            supplyApy: rateToApy(currentLiquidityRate, "s", 27),
            max,
            nonce,
            aToken: aTokenData,
            chainId,
          });
      },
    )
    .filter(isDefined);

  const collateralPositionsData = positionsData.filter(
    ({ supply: { isCollateral, totalSupply } }) =>
      isCollateral && totalSupply > 0n,
  );
  const borrowPositionsData = positionsData.filter(
    ({ borrow: { totalBorrow } }) => totalBorrow > 0n,
  );

  // We only handle 1-Borrow 1-Collateral positions
  if (
    collateralPositionsData.length === 1 &&
    borrowPositionsData.length === 1
  ) {
    const { underlying: collateralToken, supply: collateralData } =
      collateralPositionsData[0]!;
    const { underlying: loanToken, borrow: loanData } = borrowPositionsData[0]!;

    /* MAX */
    const maxCollateral = (() => {
      if (!collateralData.isActive)
        return {
          value: 0n,
          limiter: SupplyMigrationLimiter.withdrawPaused,
        };

      const maxWithdrawFromAvailableLiquidity = collateralData.poolLiquidity;
      const maxWithdrawFromSupplyBalance = collateralData.totalSupply;

      const maxWithdraw = MathLib.min(
        maxWithdrawFromAvailableLiquidity,
        maxWithdrawFromSupplyBalance,
      );

      if (maxWithdraw === maxWithdrawFromAvailableLiquidity)
        return {
          value: maxWithdrawFromAvailableLiquidity,
          limiter: SupplyMigrationLimiter.liquidity,
        };

      if (maxWithdraw === maxWithdrawFromSupplyBalance)
        return {
          value: maxWithdrawFromSupplyBalance,
          limiter: SupplyMigrationLimiter.position,
        };
    })()!;
    const maxBorrow = (() => {
      if (!loanData.isActive)
        return {
          value: 0n,
          limiter: BorrowMigrationLimiter.repayPaused,
        };

      return {
        value: loanData.totalBorrow,
        limiter: BorrowMigrationLimiter.position,
      };
    })()!;

    positions.push(
      new MigratableBorrowPosition_AaveV2({
        loanToken,
        collateralToken,
        collateral: collateralData.totalSupply,
        borrow: loanData.totalBorrow,
        collateralApy: rateToApy(collateralData.currentLiquidityRate, "s", 27),
        borrowApy: rateToApy(loanData.currentVariableBorrowRate, "s", 27),
        lltv: loanData.liquidationThreshold * parseUnits("1", 14), // lltv has 4 decimals on aave V2
        aToken: collateralData.aTokenData,
        nonce: collateralData.nonce,
        chainId,
        user,
        maxRepay: maxBorrow,
        maxWithdraw: maxCollateral,
        collateralPriceEth: collateralData.ethPrice,
        loanPriceEth: loanData.ethPrice,
        morphoNonce: loanData.morphoNonce,
        isBundlerManaging: loanData.isBundlerManaging,
      }),
    );
  }

  return positions;
}
