import { type Address, ChainUtils } from "@morpho-org/blue-sdk";
import { isDefined, values } from "@morpho-org/morpho-ts";

import type { DeploylessFetchParameters } from "@morpho-org/blue-sdk-viem";
import type { Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { cometAbi, cometExtAbi } from "../../abis/compoundV3.abis.js";
import MIGRATION_ADDRESSES from "../../config.js";
import type { MigratablePosition } from "../../positions/index.js";
import { MigratableSupplyPosition_CompoundV3 } from "../../positions/supply/compoundV3.supply.js";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";
import { rateToApy } from "../../utils/rates.js";

async function fetchCompoundV3InstancePosition(
  user: Address,
  cometAddress: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  const chainId = parameters.chainId;

  const migrationContracts =
    MIGRATION_ADDRESSES[chainId][MigratableProtocol.aaveV2];

  if (!migrationContracts) return null;

  if (deployless) {
    //TODO
  }

  const [
    supplyBalance,
    nonce,
    baseToken,
    totalSupply,
    totalBorrow,
    utilization,
    cometName,
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
  ]);

  const supplyRate = await readContract(client, {
    ...parameters,
    abi: cometAbi,
    address: cometAddress,
    functionName: "getSupplyRate",
    args: [utilization],
  });

  /* MAX */
  const max = (() => {
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

  return {
    supplyBalance,
    nonce,
    cometAddress,
    loanToken: baseToken,
    max,
    supplyApy: rateToApy(supplyRate, "s"),
    cometName,
  };
}

export async function fetchCompoundV3Positions(
  user: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
): Promise<MigratablePosition[]> {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  const chainId = parameters.chainId;

  const migrationContracts =
    MIGRATION_ADDRESSES[chainId][MigratableProtocol.aaveV2];

  if (!migrationContracts) return [];

  if (parameters.deployless !== false) {
    //TODO
  }

  const positions = (
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

  return positions.flatMap(
    ({
      nonce,
      supplyBalance,
      cometAddress,
      loanToken,
      max,
      supplyApy,
      cometName,
    }) => {
      if (supplyBalance === 0n) return [];
      return [
        new MigratableSupplyPosition_CompoundV3({
          user,
          chainId,
          nonce,
          loanToken: loanToken as Address,
          supply: supplyBalance,
          supplyApy,
          max,
          cometAddress,
          cometName,
        }),
      ];
    },
  );
}
