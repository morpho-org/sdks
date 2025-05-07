import { type Address, MathLib, getChainAddresses } from "@morpho-org/blue-sdk";
import { isDefined, values } from "@morpho-org/morpho-ts";

import {
  type FetchParameters,
  blueAbi,
  fetchToken,
} from "@morpho-org/blue-sdk-viem";

import { type Client, erc20Abi, parseUnits, zeroAddress } from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  aTokenV3Abi,
  aaveV3OracleAbi,
  variableDebtTokenV3Abi,
} from "../../abis/aaveV3.js";
import { migrationAddresses } from "../../config.js";
import type { MigratablePosition } from "../../positions/index.js";
import { MigratableSupplyPosition_AaveV3 } from "../../positions/supply/aaveV3.supply.js";

import { MigratableBorrowPosition_AaveV3 } from "../../positions/borrow/index.js";
import { MigratableProtocol } from "../../types/index.js";
import {
  BorrowMigrationLimiter,
  SupplyMigrationLimiter,
} from "../../types/positions.js";
import { rateToApy } from "../../utils/rates.js";

export async function fetchAaveV3Positions(
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
    migrationAddresses[chainId]?.[MigratableProtocol.aaveV3];

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
        abi: migrationContracts.pool.abi,
        address: migrationContracts.pool.address,
        functionName: "getUserConfiguration",
        args: [user],
      }),
      readContract(client, {
        ...parameters,
        abi: migrationContracts.pool.abi,
        address: migrationContracts.pool.address,
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
              abi: aTokenV3Abi,
              address: tokenAddress,
              functionName: "UNDERLYING_ASSET_ADDRESS",
              args: [],
            }),
            readContract(client, {
              ...parameters,
              abi: aTokenV3Abi,
              address: tokenAddress,
              functionName: "balanceOf",
              args: [user],
            }),
            readContract(client, {
              ...parameters,
              abi: aTokenV3Abi,
              address: tokenAddress,
              functionName: "nonces",
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
          eModeId,
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
            abi: migrationContracts.pool.abi,
            address: migrationContracts.pool.address,
            functionName: "getReserveData",
            args: [underlyingAddress],
          }),
          readContract(client, {
            ...parameters,
            ...migrationContracts.protocolDataProvider,
            functionName: "getReserveEModeCategory",
            args: [underlyingAddress],
          }),
          fetchToken(underlyingAddress, client, parameters),
        ]);

        const [totalBorrow, eModeCategoryData, morphoNonce, isBundlerManaging] =
          await Promise.all([
            readContract(client, {
              ...parameters,
              abi: variableDebtTokenV3Abi,
              address: variableDebtTokenAddress,
              functionName: "balanceOf",
              args: [user],
            }),
            readContract(client, {
              ...parameters,
              ...migrationContracts.pool,
              functionName: "getEModeCategoryData",
              args: [Number(eModeId)],
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
          ]);

        const usdPrice = await readContract(client, {
          ...parameters,
          abi: aaveV3OracleAbi,
          address: oracleAddress,
          functionName: "getAssetPrice",
          args: [
            eModeId === 0n || eModeCategoryData.priceSource === zeroAddress
              ? underlyingAddress
              : eModeCategoryData.priceSource,
          ],
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
            usdPrice,
          },
          borrow: {
            liquidationThreshold:
              eModeId === 0n
                ? liquidationThreshold
                : BigInt(eModeCategoryData.liquidationThreshold),
            currentVariableBorrowRate,
            totalBorrow,
            isActive,
            usdPrice,
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
          return new MigratableSupplyPosition_AaveV3({
            user,
            loanToken: underlying.address,
            supply: totalSupply,
            supplyApy: rateToApy(currentLiquidityRate, "s", 27, true),
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
      new MigratableBorrowPosition_AaveV3({
        loanToken,
        collateralToken,
        collateral: collateralData.totalSupply,
        borrow: loanData.totalBorrow,
        collateralApy: rateToApy(
          collateralData.currentLiquidityRate,
          "s",
          27,
          true,
        ),
        borrowApy: rateToApy(loanData.currentVariableBorrowRate, "s", 27, true),
        lltv: loanData.liquidationThreshold * parseUnits("1", 14), // lltv has 4 decimals on aave V3
        aToken: collateralData.aTokenData,
        nonce: collateralData.nonce,
        chainId,
        user,
        maxRepay: maxBorrow,
        maxWithdraw: maxCollateral,
        collateralPrice: collateralData.usdPrice,
        loanPrice: loanData.usdPrice,
        morphoNonce: loanData.morphoNonce,
        isBundlerManaging: loanData.isBundlerManaging,
      }),
    );
  }

  return positions;
}
