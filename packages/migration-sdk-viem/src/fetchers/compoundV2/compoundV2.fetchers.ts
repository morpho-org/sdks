import {
  type Address,
  ChainId,
  ExchangeRateWrappedToken,
  NATIVE_ADDRESS,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { type Time, isDefined, values } from "@morpho-org/morpho-ts";

import {
  migrationAddresses,
  migrationAddressesRegistry,
} from "../../config.js";
import type { MigratablePosition } from "../../positions/index.js";
import { MigratableSupplyPosition_CompoundV2 } from "../../positions/supply/compoundV2.supply.js";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";
import { rateToApy } from "../../utils/rates.js";

import type { FetchParameters } from "@morpho-org/blue-sdk-viem";
import type { Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { cErc20Abi, cEtherAbi, mErc20Abi } from "../../abis/compoundV2.js";
import { fetchAccruedExchangeRate } from "./compoundV2.helpers.js";

export const COMPOUNDING_PERIOD: Record<number, Time.PeriodLike> = {
  [ChainId.BaseMainnet]: "s",
  [ChainId.EthMainnet]: { unit: "s", duration: 12 }, // 1 block
};

async function fetchCompoundV2InstancePosition(
  user: Address,
  cTokenAddress: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const chainId = parameters.chainId;

  const { abi, calls } = (() => {
    if (chainId === ChainId.EthMainnet) {
      if (
        cTokenAddress ===
        migrationAddressesRegistry[ChainId.EthMainnet][
          MigratableProtocol.compoundV2
        ].cEth.address
      )
        return {
          calls: [
            NATIVE_ADDRESS,
            readContract(client, {
              ...parameters,
              abi: cEtherAbi,
              address: cTokenAddress,
              functionName: "supplyRatePerBlock",
              args: [],
            }),
          ],
          abi: cEtherAbi,
        } as const;

      return {
        calls: [
          readContract(client, {
            ...parameters,
            abi: cErc20Abi,
            address: cTokenAddress,
            functionName: "underlying",
            args: [],
          }),
          readContract(client, {
            ...parameters,
            abi: cErc20Abi,
            address: cTokenAddress,
            functionName: "supplyRatePerBlock",
            args: [],
          }),
        ],
        abi: cErc20Abi,
      } as const;
    }
    return {
      calls: [
        readContract(client, {
          ...parameters,
          abi: mErc20Abi,
          address: cTokenAddress,
          functionName: "underlying",
          args: [],
        }),
        readContract(client, {
          ...parameters,
          abi: mErc20Abi,
          address: cTokenAddress,
          functionName: "supplyRatePerTimestamp",
          args: [],
        }),
      ],
      abi: mErc20Abi,
    } as const;
  })();

  const {
    wNative,
    bundler3: { compoundV2MigrationAdapter },
  } = getChainAddresses(chainId);
  if (compoundV2MigrationAdapter == null)
    throw new Error("missing compoundV2MigrationAdapter address");

  const compoundingPeriod = COMPOUNDING_PERIOD[chainId];
  if (compoundingPeriod == null)
    throw new Error(`missing compounding period on chain ${chainId}`);

  const [
    cTokenBalance,
    bundlerAllowance,
    cash,
    name,
    decimals,
    symbol,
    exchangeRate,
    baseToken,
    supplyRatePerUnit,
  ] = await Promise.all([
    readContract(client, {
      ...parameters,
      abi,
      address: cTokenAddress,
      functionName: "balanceOf",
      args: [user],
    }),
    readContract(client, {
      ...parameters,
      abi,
      address: cTokenAddress,
      functionName: "allowance",
      args: [user, compoundV2MigrationAdapter],
    }),
    readContract(client, {
      ...parameters,
      abi,
      address: cTokenAddress,
      functionName: "getCash",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi,
      address: cTokenAddress,
      functionName: "name",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi,
      address: cTokenAddress,
      functionName: "decimals",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi,
      address: cTokenAddress,
      functionName: "symbol",
      args: [],
    }),
    fetchAccruedExchangeRate(cTokenAddress, client, parameters),
    ...calls,
  ]);

  const cToken = new ExchangeRateWrappedToken(
    {
      name,
      decimals: Number(decimals),
      symbol,
      address: cTokenAddress,
    },
    baseToken as Address,
    exchangeRate,
  );

  const supplyBalance = cToken.toUnwrappedExactAmountIn(cTokenBalance);

  /* MAX */
  const max = (() => {
    const maxWithdrawFromAvailableLiquidity = cash;
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
    cToken,
    cTokenBalance,
    loanToken: baseToken === NATIVE_ADDRESS ? wNative : baseToken,
    max,
    supplyApy: rateToApy(supplyRatePerUnit, compoundingPeriod),
    bundlerAllowance,
  };
}

export async function fetchCompoundV2Positions(
  user: Address,
  client: Client,
  parameters: FetchParameters = {},
): Promise<MigratablePosition[]> {
  parameters.chainId ??= await getChainId(client);

  const chainId = parameters.chainId;

  const migrationContracts =
    migrationAddresses[chainId]?.[MigratableProtocol.compoundV2];

  if (!migrationContracts) return [];

  const { comptroller: comptrollerAddress, ...markets } = migrationContracts;

  const enterredMarkets = new Set(
    await readContract(client, {
      ...parameters,
      abi: migrationContracts.comptroller.abi,
      address: migrationContracts.comptroller.address,
      functionName: "getAssetsIn",
      args: [user],
    }),
  );

  const positions = (
    await Promise.all(
      values(markets).map(({ address: cTokenAddress }) =>
        enterredMarkets.has(cTokenAddress)
          ? null
          : fetchCompoundV2InstancePosition(
              user,
              cTokenAddress,
              client,
              parameters,
            ).catch(() => null),
      ),
    )
  ).filter(isDefined);

  return positions
    .filter(isDefined)
    .flatMap(
      ({
        supplyBalance,
        cToken,
        loanToken,
        max,
        supplyApy,
        bundlerAllowance,
        cTokenBalance,
      }) => {
        if (supplyBalance === 0n) return [];
        return [
          new MigratableSupplyPosition_CompoundV2({
            user,
            chainId,
            loanToken: loanToken as Address,
            supply: supplyBalance,
            supplyApy,
            max,
            cToken,
            bundlerAllowance,
            cTokenBalance,
          }),
        ];
      },
    );
}
