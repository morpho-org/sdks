import { ChainId, MathLib } from "@morpho-org/blue-sdk";
import type { FetchParameters } from "@morpho-org/blue-sdk-viem";
import type { Address, Client } from "viem";
import { getBlock, getChainId, readContract } from "viem/actions";
import { cErc20Abi, mErc20Abi } from "../../abis/compoundV2.js";

export interface CompoundV2MarketState {
  lastExchangeRate: bigint;
  lastUpdateUnit: bigint;
  cash: bigint;
  totalBorrows: bigint;
  totalSupply: bigint;
  totalReserves: bigint;
  reserveFactorMantissa: bigint;
  borrowRatePerUnit: bigint;
}

export const getAccruedExchangeRate = (
  {
    lastExchangeRate,
    lastUpdateUnit,
    cash,
    totalBorrows,
    totalSupply,
    totalReserves,
    reserveFactorMantissa,
    borrowRatePerUnit,
  }: CompoundV2MarketState,
  newBlockUnit: bigint,
) => {
  const blockDelta = newBlockUnit - lastUpdateUnit;

  if (blockDelta < 0n)
    throw new Error(
      `New block unit (${newBlockUnit}) must be bigger than last block unit (${lastUpdateUnit})`,
    );

  if (blockDelta === 0n) return lastExchangeRate;

  const simpleInterestFactor = borrowRatePerUnit * blockDelta;
  const interestAccumulated = MathLib.wMulDown(
    simpleInterestFactor,
    totalBorrows,
  );
  const totalBorrow = interestAccumulated + totalBorrows;
  const newTotalReserves =
    MathLib.wMulDown(reserveFactorMantissa, interestAccumulated) +
    totalReserves;

  const exchangeRate =
    totalSupply === 0n
      ? lastExchangeRate
      : MathLib.wDivDown(cash + totalBorrow - newTotalReserves, totalSupply);

  return exchangeRate;
};

export const fetchAccruedExchangeRate = async (
  cTokenAddress: Address,
  client: Client,
  parameters: FetchParameters = {},
) => {
  parameters.chainId ??= await getChainId(client);

  const chainId = parameters.chainId;

  const { abi, calls } = (() => {
    if (chainId === ChainId.EthMainnet) {
      return {
        calls: [
          readContract(client, {
            ...parameters,
            abi: cErc20Abi,
            address: cTokenAddress,
            functionName: "accrualBlockNumber",
            args: [],
          }),
          readContract(client, {
            ...parameters,
            abi: cErc20Abi,
            address: cTokenAddress,
            functionName: "borrowRatePerBlock",
            args: [],
          }),
          getBlock(client, {
            blockTag: "latest",
            includeTransactions: false,
          }).then((block) => block.number),
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
          functionName: "accrualBlockTimestamp",
          args: [],
        }),
        readContract(client, {
          ...parameters,
          abi: mErc20Abi,
          address: cTokenAddress,
          functionName: "borrowRatePerTimestamp",
          args: [],
        }),
        getBlock(client, {
          blockTag: "latest",
          includeTransactions: false,
        }).then((block) => block.timestamp),
      ],
      abi: mErc20Abi,
    } as const;
  })();

  const [
    lastExchangeRate,
    totalBorrows,
    totalSupply,
    totalReserves,
    reserveFactorMantissa,
    cash,
    lastUpdateUnit,
    borrowRatePerUnit,
    blockUnit, // number on mainnet, timestamp on base
  ] = await Promise.all([
    readContract(client, {
      ...parameters,
      abi,
      address: cTokenAddress,
      functionName: "exchangeRateStored",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi,
      address: cTokenAddress,
      functionName: "totalBorrows",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi,
      address: cTokenAddress,
      functionName: "totalSupply",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi,
      address: cTokenAddress,
      functionName: "totalReserves",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi,
      address: cTokenAddress,
      functionName: "reserveFactorMantissa",
      args: [],
    }),
    readContract(client, {
      ...parameters,
      abi,
      address: cTokenAddress,
      functionName: "getCash",
      args: [],
    }),
    ...calls,
  ]);

  return getAccruedExchangeRate(
    {
      lastExchangeRate,
      lastUpdateUnit,
      cash,
      totalBorrows,
      totalSupply,
      totalReserves,
      reserveFactorMantissa,
      borrowRatePerUnit,
    },
    // return the rate you would experience if you interract at next block
    chainId === ChainId.BaseMainnet
      ? BigInt(blockUnit) + 2n
      : BigInt(blockUnit) + 1n,
  );
};
