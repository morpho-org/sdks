import { type Address, ChainUtils, MathLib, Token } from "@morpho-org/blue-sdk";
import { isDefined } from "@morpho-org/morpho-ts";

import type { FetchParameters } from "@morpho-org/blue-sdk-viem";

import { type Client, erc20Abi } from "viem";
import { getChainId, readContract } from "viem/actions";
import { aTokenV3Abi } from "../../abis/aaveV3.abis.js";
import { MIGRATION_ADDRESSES } from "../../config.js";
import type { MigratablePosition } from "../../positions/index.js";
import { MigratableSupplyPosition_AaveV3 } from "../../positions/supply/aaveV3.supply.js";

import { MigratableProtocol } from "../../types/index.js";
import { SupplyMigrationLimiter } from "../../types/positions.js";
import { rateToAPY } from "../aaveV2/aaveV2.helpers.js";

export async function fetchAaveV3Positions(
  user: Address,
  client: Client,
  parameters: FetchParameters = {},
): Promise<MigratablePosition[]> {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  const chainId = parameters.chainId;

  const migrationContracts =
    MIGRATION_ADDRESSES[chainId][MigratableProtocol.aaveV3];

  if (!migrationContracts) return [];

  const [allATokens, userConfig, reservesList] = await Promise.all([
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

  const isBorrowing = Object.values(userConfigByToken).some(
    ({ isBorrowed }) => isBorrowed,
  );

  const positions = await Promise.all(
    allATokens.map(async ({ tokenAddress, symbol }) => {
      const [
        underlyingAddress,
        totalSupply,
        nonce,
        aTokenDecimals,
        aTokenName,
      ] = await Promise.all([
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
        readContract(client, {
          ...parameters,
          abi: aTokenV3Abi,
          address: tokenAddress,
          functionName: "decimals",
          args: [],
        }),
        readContract(client, {
          ...parameters,
          abi: aTokenV3Abi,
          address: tokenAddress,
          functionName: "name",
          args: [],
        }),
      ]);

      const aTokenData = new Token({
        address: tokenAddress as Address,
        symbol,
        decimals: aTokenDecimals,
        name: aTokenName,
      });

      if (totalSupply === 0n) return null;

      const userReserveConfig = userConfigByToken[underlyingAddress];

      if (!userReserveConfig) return null;

      const [
        poolLiquidity,
        [, , , , , usageAsCollateralEnabled, , , isActive],
        { currentLiquidityRate },
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
      ]);

      // TODO we only focus on pure suppliers now
      // We need to check both `usageAsCollateralEnabled` and `userReserveConfig.isUsedAsCollateral``
      // Because `userReserveConfig.isUsedAsCollateral` is true by default for everyone when `usageAsCollateralEnabled` is false
      if (
        userReserveConfig.isUsedAsCollateral &&
        usageAsCollateralEnabled &&
        isBorrowing
      )
        return null;

      /* MAX */
      const max = (() => {
        if (!isActive)
          return { value: 0n, limiter: SupplyMigrationLimiter.withdrawPaused };

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

      return {
        underlyingAddress,
        supply: totalSupply,
        supplyApy: rateToAPY(currentLiquidityRate),
        max,
        nonce,
        aToken: aTokenData,
      };
    }),
  );

  return positions
    .filter(isDefined)
    .flatMap(({ underlyingAddress, supply, supplyApy, max, nonce, aToken }) => {
      if (supply > 0n)
        return [
          new MigratableSupplyPosition_AaveV3({
            user,
            loanToken: underlyingAddress as Address,
            supply,
            supplyApy,
            max,
            nonce,
            aToken,
            chainId,
          }),
        ];

      return [];
    });
}
