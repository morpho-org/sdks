import { type Address, getChainAddresses } from "@morpho-org/blue-sdk";
import { isDefined, values } from "@morpho-org/morpho-ts";

import {
  type FetchParameters,
  blueAbi,
  fetchToken,
} from "@morpho-org/blue-sdk-viem";
import type { Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { cometAbi, cometExtAbi } from "../../abis/compoundV3.js";
import { migrationAddresses } from "../../config.js";
import { MigratableBorrowPosition_CompoundV3 } from "../../positions/borrow/compoundV3.borrow.js";
import type { MigratablePosition } from "../../positions/index.js";
import { MigratableSupplyPosition_CompoundV3 } from "../../positions/supply/compoundV3.supply.js";
import {
  BorrowMigrationLimiter,
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";
import { rateToApy } from "../../utils/rates.js";

async function fetchCompoundV3InstancePosition(
  user: Address,
  cometAddress: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const chainId = parameters.chainId;
  const {
    morpho,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const [
    supplyBalance,
    borrowBalance,
    nonce,
    baseToken,
    totalSupply,
    totalBorrow,
    utilization,
    cometName,
    baseBorrowMin,
    [, , , assetsIn],
  ] = await Promise.all([
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "balanceOf",
      args: [user],
    }),
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "borrowBalanceOf",
      args: [user],
    }),
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "userNonce",
      args: [user],
    }),
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "baseToken",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "totalSupply",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "totalBorrow",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "getUtilization",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi: cometExtAbi,
      address: cometAddress,
      functionName: "name",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "baseBorrowMin",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "userBasic",
      args: [user],
    }),
  ]);

  if (supplyBalance === 0n && borrowBalance === 0n) return;

  //TODO we don't handle multi-collateral positions.
  //This returns true if more than one bit is set to 1
  if ((assetsIn & (assetsIn - 1)) !== 0) return;

  // const assetsInIndices = entries(assetsIn.toString(2).split('').reverse()).filter(([,bit]) => +bit).map(([i]) => i)
  const assetInIndex = assetsIn.toString(2).split("").reverse().indexOf("1");

  const [
    supplyRate,
    borrowRate,
    assetInInfo,
    baseTokenPriceFeed,
    isWithdrawPaused,
  ] = await Promise.all([
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "getSupplyRate",
      args: [utilization],
    }),
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "getBorrowRate",
      args: [utilization],
    }),
    assetInIndex > -1
      ? readContract(client, {
          ...parameters,
          abi: cometAbi,
          address: cometAddress,
          functionName: "getAssetInfo",
          args: [assetInIndex],
        })
      : null,
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "baseTokenPriceFeed",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi: cometAbi,
      address: cometAddress,
      functionName: "isWithdrawPaused",
      args: [],
    }),
  ]);

  if (assetInInfo) {
    const [
      collateralBalance,
      collateralPriceUsd,
      loanPriceUsd,
      morphoNonce,
      isBundlerManaging,
      isRepayPaused, // supply and repay are the same thing
      loanToken,
      collateralToken,
    ] = await Promise.all([
      readContract(client, {
        ...parameters,
        abi: cometExtAbi,
        address: cometAddress,
        functionName: "collateralBalanceOf",
        args: [user, assetInInfo.asset],
      }),
      readContract(client, {
        ...parameters,
        abi: cometAbi,
        address: cometAddress,
        functionName: "getPrice",
        args: [assetInInfo.priceFeed],
      }),
      readContract(client, {
        ...parameters,
        abi: cometAbi,
        address: cometAddress,
        functionName: "getPrice",
        args: [baseTokenPriceFeed],
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
      readContract(client, {
        ...parameters,
        abi: cometAbi,
        address: cometAddress,
        functionName: "isSupplyPaused",
        args: [],
      }),
      fetchToken(baseToken, client, parameters),
      fetchToken(assetInInfo.asset, client, parameters),
    ]);

    /* MAX */
    const maxWithdraw = (() => {
      if (!isWithdrawPaused)
        return {
          value: 0n,
          limiter: SupplyMigrationLimiter.withdrawPaused,
        };
      return {
        value: collateralBalance,
        limiter: SupplyMigrationLimiter.position,
      };
    })();
    const maxRepay = (() => {
      if (!isRepayPaused)
        return {
          value: 0n,
          limiter: BorrowMigrationLimiter.repayPaused,
        };
      return {
        value: collateralBalance,
        limiter: BorrowMigrationLimiter.position,
      };
    })();

    return new MigratableBorrowPosition_CompoundV3({
      chainId,
      collateral: collateralBalance,
      borrow: borrowBalance,
      collateralApy: 0,
      borrowApy: rateToApy(borrowRate, "s"),
      collateralPriceUsd,
      loanPriceUsd,
      loanToken,
      nonce,
      morphoNonce,
      isBundlerManaging,
      baseBorrowMin,
      cometAddress,
      cometName,
      user,
      collateralToken,
      lltv: assetInInfo.liquidationFactor,
      maxWithdraw,
      maxRepay,
    });
  }

  /* MAX */
  const max = (() => {
    if (!isWithdrawPaused)
      return {
        value: 0n,
        limiter: SupplyMigrationLimiter.withdrawPaused,
      };

    const maxWithdrawFromAvailableLiquidity = totalSupply - totalBorrow;
    const maxWithdrawFromSupplyBalance = supplyBalance;

    if (maxWithdrawFromAvailableLiquidity < maxWithdrawFromSupplyBalance)
      return {
        value: maxWithdrawFromAvailableLiquidity,
        limiter: SupplyMigrationLimiter.liquidity,
      };

    return {
      value: maxWithdrawFromSupplyBalance,
      limiter: SupplyMigrationLimiter.position,
    };
  })();

  return new MigratableSupplyPosition_CompoundV3({
    user,
    chainId,
    nonce,
    loanToken: baseToken,
    supply: supplyBalance,
    supplyApy: rateToApy(supplyRate, "s"),
    max,
    cometAddress,
    cometName,
  });
}

export async function fetchCompoundV3Positions(
  user: Address,
  client: Client,
  parameters: FetchParameters = {},
): Promise<MigratablePosition[]> {
  parameters.chainId ??= await getChainId(client);

  const chainId = parameters.chainId;

  const migrationContracts =
    migrationAddresses[chainId]?.[MigratableProtocol.compoundV3];

  if (!migrationContracts) return [];

  return (
    await Promise.all(
      values(migrationContracts).map(({ address: cometAddress }) =>
        fetchCompoundV3InstancePosition(
          user,
          cometAddress,
          client,
          parameters,
        ).catch(() => null),
      ),
    )
  ).filter(isDefined);
}
