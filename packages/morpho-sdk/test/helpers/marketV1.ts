import {
  type MarketParams,
  MathLib,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import type { AnvilTestClient } from "@morpho-org/test";
import { encodeFunctionData } from "viem";

export async function supplyCollateral(params: {
  client: AnvilTestClient;
  chainId: number;
  market: MarketParams;
  collateralAmount: bigint;
}) {
  const { client, chainId, market, collateralAmount } = params;
  const { morpho } = getChainAddresses(chainId);
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
  const { morpho } = getChainAddresses(chainId);
  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  // Authorize GA1 on Morpho
  await client.sendTransaction({
    to: morpho,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "setAuthorization",
      args: [generalAdapter1, true],
    }),
    value: 0n,
  });

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
