import {
  DEAD_ADDRESS,
  getChainAddresses,
  type MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import type { AnvilTestClient } from "@morpho-org/test";
import { encodeFunctionData } from "viem";
import { MIN_DEAD_SHARES } from "../../src/index.js";

export async function supplyCollateral(params: {
  client: AnvilTestClient;
  chainId: number;
  market: MarketParams;
  collateralAmount: bigint;
}) {
  const { client, chainId, market, collateralAmount } = params;
  const { blue: morpho } = getChainAddresses(chainId);
  await client.deal({
    erc20: market.collateralToken,
    amount: collateralAmount,
  });
  await client.approve({
    address: market.collateralToken,
    args: [morpho, MathLib.MAX_UINT_256],
  });
  await client.sendTransaction({
    to: morpho,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "supplyCollateral",
      args: [market, collateralAmount, client.account.address, "0x"],
    }),
    value: 0n,
  });
}

/**
 * Deposits loan-asset assets into a Morpho Blue market directly (bypasses the bundler).
 * Used by withdraw fork tests to pre-fund a supplier position before exercising the SDK.
 */
export async function supplyLoan(params: {
  client: AnvilTestClient;
  chainId: number;
  market: MarketParams;
  supplyAmount: bigint;
}) {
  const { client, chainId, market, supplyAmount } = params;
  const { blue: morpho } = getChainAddresses(chainId);
  await client.deal({
    erc20: market.loanToken,
    amount: supplyAmount,
  });
  await client.approve({
    address: market.loanToken,
    args: [morpho, MathLib.MAX_UINT_256],
  });
  await client.sendTransaction({
    to: morpho,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "supply",
      args: [market, supplyAmount, 0n, client.account.address, "0x"],
    }),
    value: 0n,
  });
}

/**
 * Mints `MIN_DEAD_SHARES` supply shares to `DEAD_ADDRESS` so the market passes the SDK's dead-deposit
 * check. Restores the caller's loan-token balance afterwards.
 */
export async function seedDeadSupply(params: {
  client: AnvilTestClient;
  chainId: number;
  market: MarketParams;
}) {
  const { client, chainId, market } = params;
  const { blue: morpho } = getChainAddresses(chainId);
  const balance = await client.balanceOf({ erc20: market.loanToken });
  await client.deal({ erc20: market.loanToken, amount: MathLib.WAD });
  await client.approve({
    address: market.loanToken,
    args: [morpho, MathLib.MAX_UINT_256],
  });
  await client.sendTransaction({
    to: morpho,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "supply",
      args: [market, 0n, MIN_DEAD_SHARES, DEAD_ADDRESS, "0x"],
    }),
    value: 0n,
  });
  await client.deal({ erc20: market.loanToken, amount: balance });
}

/**
 * Sets up a borrow position by supplying collateral and borrowing.
 * The user must already have collateral supplied to the market.
 */
export async function borrow(params: {
  client: AnvilTestClient;
  chainId: number;
  market: MarketParams;
  borrowAmount: bigint;
}) {
  const { client, chainId, market, borrowAmount } = params;
  const { blue: morpho } = getChainAddresses(chainId);

  // Borrow directly from Morpho
  await client.sendTransaction({
    to: morpho,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "borrow",
      args: [
        market,
        borrowAmount,
        0n,
        client.account.address,
        client.account.address,
      ],
    }),
    value: 0n,
  });
}
