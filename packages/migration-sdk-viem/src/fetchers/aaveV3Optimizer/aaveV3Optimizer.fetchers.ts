import {
  type Address,
  ChainId,
  ChainUtils,
  MathLib,
  addresses,
} from "@morpho-org/blue-sdk";
import { isDefined } from "@morpho-org/morpho-ts";

import { MIGRATION_ADDRESSES } from "../../config.js";
import type { MigratablePosition } from "../../positions/index.js";
import { MigratableSupplyPosition_AaveV3Optimizer } from "../../positions/supply/aaveV3Optimizer.supply.js";
import { MigratableProtocol } from "../../types/index.js";
import { SupplyMigrationLimiter } from "../../types/positions.js";

import { MorphoAaveMath } from "./AaveV3.maths.js";
import {
  P2PInterestRates,
  PoolInterestRates,
} from "./aaveV3Optimizer.helpers.js";
import type { DeploylessFetchParameters } from "@morpho-org/blue-sdk-viem";
import {
  type Client,
  parseUnits,
  formatEther,
  erc20Abi,
  maxUint256,
} from "viem";
import { getBlock, getChainId, readContract } from "viem/actions";
import { variableDebtTokenV3Abi } from "../../abis/aaveV3.abis.js";

export async function fetchAaveV3OptimizerPositions(
  user: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
): Promise<MigratablePosition[]> {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  const chainId = parameters.chainId;

  const migrationContracts =
    MIGRATION_ADDRESSES[chainId][MigratableProtocol.aaveV3Optimizer];

  if (!migrationContracts) return [];

  if (deployless) {
    //TODO
  }

  const [allMarkets, isBundlerManaging, nonce] = await Promise.all([
    [addresses[ChainId.EthMainnet].wNative], // TODO we only focus on pure suppliers now
    readContract(client, {
      ...parameters,
      abi: migrationContracts.morpho.abi,
      address: migrationContracts.morpho.address,
      functionName: "isManagedBy",
      args: [user, addresses[ChainId.EthMainnet].bundler],
    }),
    readContract(client, {
      ...parameters,
      abi: migrationContracts.morpho.abi,
      address: migrationContracts.morpho.address,
      functionName: "userNonce",
      args: [user],
    }),
  ]);

  const positions = await Promise.all(
    allMarkets.map(async (underlyingAddress) => {
      const [
        scaledSupplyInP2P,
        scaledSupplyOnPool,
        [
          ,
          ,
          ,
          ,
          ,
          liquidityRate,
          variableBorrowRate,
          ,
          ,
          liquidityIndex,
          variableBorrowIndex,
          lastUpdateTimestamp,
        ],

        {
          reserveFactor: p2pReserveFactor,
          p2pIndexCursor,
          deltas,
          indexes: {
            supply: { p2pIndex: p2pSupplyIndex, poolIndex: poolSupplyIndex },
            borrow: { p2pIndex: p2pBorrowIndex, poolIndex: poolBorrowIndex },
          },
          idleSupply,
          pauseStatuses: { isWithdrawPaused },
          variableDebtToken: variableDebtTokenAddress,
          stableDebtToken: stableDebtTokenAddress,
          aToken: aTokenAddress,
        },
        [borrowCap],
        latestBlock,
      ] = await Promise.all([
        readContract(client, {
          ...parameters,
          abi: migrationContracts.morpho.abi,
          address: migrationContracts.morpho.address,
          functionName: "scaledP2PSupplyBalance",
          args: [underlyingAddress, user],
        }),
        readContract(client, {
          ...parameters,
          abi: migrationContracts.morpho.abi,
          address: migrationContracts.morpho.address,
          functionName: "scaledPoolSupplyBalance",
          args: [underlyingAddress, user],
        }),
        readContract(client, {
          ...parameters,
          abi: migrationContracts.poolDataProvider.abi,
          address: migrationContracts.poolDataProvider.address,
          functionName: "getReserveData",
          args: [underlyingAddress],
        }),
        readContract(client, {
          ...parameters,
          abi: migrationContracts.morpho.abi,
          address: migrationContracts.morpho.address,
          functionName: "market",
          args: [underlyingAddress],
        }),
        readContract(client, {
          ...parameters,
          abi: migrationContracts.poolDataProvider.abi,
          address: migrationContracts.poolDataProvider.address,
          functionName: "getReserveCaps",
          args: [underlyingAddress],
        }),
        getBlock(client, { blockTag: "latest", includeTransactions: false }),
      ]);

      if (scaledSupplyInP2P === 0n && scaledSupplyOnPool === 0n) return null;

      const [
        scaledPoolBorrow,
        poolStableBorrow,
        poolLiquidity,
        underlyingDecimals,
      ] = await Promise.all([
        readContract(client, {
          ...parameters,
          abi: variableDebtTokenV3Abi,
          address: variableDebtTokenAddress,
          functionName: "scaledTotalSupply",
          args: [],
        }),
        readContract(client, {
          ...parameters,
          abi: erc20Abi,
          address: stableDebtTokenAddress,
          functionName: "totalSupply",
          args: [],
        }),
        readContract(client, {
          ...parameters,
          abi: erc20Abi,
          address: variableDebtTokenAddress,
          functionName: "balanceOf",
          args: [aTokenAddress],
        }),
        readContract(client, {
          ...parameters,
          abi: erc20Abi,
          address: variableDebtTokenAddress,
          functionName: "decimals",
          args: [],
        }),
      ]);

      const { newPoolSupplyIndex, newPoolBorrowIndex } =
        PoolInterestRates.computePoolIndexes({
          liquidityRate,
          variableBorrowRate,
          lastUpdateTimestamp,
          liquidityIndex,
          variableBorrowIndex,
          currentTimestamp: BigInt(latestBlock!.timestamp),
        });

      const proportionIdle =
        idleSupply === 0n
          ? 0n
          : MathLib.min(
              // To avoid proportionIdle > 1 with rounding errors
              MorphoAaveMath.INDEX_ONE,
              MorphoAaveMath.indexDiv(
                idleSupply,
                MorphoAaveMath.indexMul(
                  deltas.supply.scaledP2PTotal,
                  p2pSupplyIndex,
                ),
              ),
            );

      const supplyProportionDelta =
        idleSupply === 0n
          ? 0n
          : MathLib.min(
              // To avoid proportionIdle + supplyProportionDelta > 1 with rounding errors
              MorphoAaveMath.INDEX_ONE - proportionIdle,
              MorphoAaveMath.indexDiv(
                MorphoAaveMath.indexMul(
                  deltas.supply.scaledDelta,
                  newPoolSupplyIndex,
                ),
                MorphoAaveMath.indexMul(
                  deltas.supply.scaledP2PTotal,
                  p2pSupplyIndex,
                ),
              ),
            );

      const borrowProportionDelta =
        idleSupply === 0n
          ? 0n
          : MathLib.min(
              // To avoid borrowProportionDelta > 1 with rounding errors
              MorphoAaveMath.INDEX_ONE,
              MorphoAaveMath.indexDiv(
                MorphoAaveMath.indexMul(
                  deltas.borrow.scaledDelta,
                  newPoolBorrowIndex,
                ),
                MorphoAaveMath.indexMul(
                  deltas.borrow.scaledP2PTotal,
                  p2pBorrowIndex,
                ),
              ),
            );

      const { newP2PSupplyIndex } = P2PInterestRates.computeP2PIndexes({
        p2pIndexCursor,
        lastBorrowIndexes: {
          p2pIndex: p2pBorrowIndex,
          poolIndex: poolBorrowIndex,
        },
        lastSupplyIndexes: {
          p2pIndex: p2pSupplyIndex,
          poolIndex: poolSupplyIndex,
        },
        poolSupplyIndex: newPoolSupplyIndex,
        poolBorrowIndex: newPoolBorrowIndex,
        deltas,
        reserveFactor: p2pReserveFactor,
        proportionIdle,
      });

      const apys = MorphoAaveMath.computeApysFromRates(
        liquidityRate,
        variableBorrowRate,
        p2pIndexCursor,
        supplyProportionDelta,
        borrowProportionDelta,
        proportionIdle,
        p2pReserveFactor,
      );

      const supplyInP2P = MorphoAaveMath.indexMul(
        scaledSupplyInP2P,
        newP2PSupplyIndex,
      );
      const supplyOnPool = MorphoAaveMath.indexMul(
        scaledSupplyOnPool,
        newPoolSupplyIndex,
      );

      const totalSupply = supplyInP2P + supplyOnPool;

      /* MAX */
      const max = (() => {
        const poolBorrow = MorphoAaveMath.indexMul(
          scaledPoolBorrow,
          newPoolBorrowIndex,
        );

        if (isWithdrawPaused)
          return { value: 0n, limiter: SupplyMigrationLimiter.withdrawPaused };

        const maxWithdrawFromAvailableLiquidity = poolLiquidity;
        const maxWithdrawFromSupplyBalance = totalSupply;
        const maxWithdrawFromBorrowCap =
          borrowCap === 0n
            ? maxUint256
            : supplyOnPool +
              MathLib.max(
                borrowCap * parseUnits("1", underlyingDecimals) -
                  (poolBorrow + poolStableBorrow),
                0n,
              );

        const maxWithdraw = MathLib.min(
          maxWithdrawFromAvailableLiquidity,
          maxWithdrawFromBorrowCap,
          maxWithdrawFromSupplyBalance,
        );

        if (maxWithdraw === maxWithdrawFromAvailableLiquidity)
          return {
            value: maxWithdrawFromAvailableLiquidity,
            limiter: SupplyMigrationLimiter.liquidity,
          };

        if (maxWithdraw === maxWithdrawFromBorrowCap)
          return {
            value: maxWithdrawFromBorrowCap,
            limiter: SupplyMigrationLimiter.protocolCap,
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
        supplyApy:
          totalSupply === 0n
            ? 0
            : Number(
                formatEther(
                  MathLib.wDivDown(
                    apys.p2pSupplyAPY * supplyInP2P +
                      apys.poolSupplyAPY * supplyOnPool,
                    totalSupply,
                  ),
                ),
              ),
        max,
      };
    }),
  );

  return positions
    .filter(isDefined)
    .flatMap(({ underlyingAddress, supply, supplyApy, max }) => {
      if (supply > 0n)
        return [
          new MigratableSupplyPosition_AaveV3Optimizer({
            user,
            loanToken: underlyingAddress,
            supply,
            supplyApy,
            max,
            isBundlerManaging,
            nonce,
            chainId,
          }),
        ];

      return [];
    });
}
