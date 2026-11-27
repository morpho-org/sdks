import {
  fetchAccrualPosition,
  MarketParams,
  MarketUtils,
  midnightAbi,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { BASE_FORK_BLOCK, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  erc20Abi,
  maxUint256,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import {
  buildTransactions,
  parseTransactionPlan,
  prepareMidnightWithdrawCollateralBatch,
  serializeTransactionPlan,
} from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl:
    process.env.BASE_RPC_URL ??
    getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  stepsTracing: false,
});

test("executes a restored Midnight collateral withdrawal batch", async ({
  client,
}) => {
  const chainId = base.id;
  const account = client.account.address;
  const receiver: Address = "0x00000000000000000000000000000000000d0001";
  const midnight = getChainAddress(chainId, "midnight");
  const usdc = getChainAddress(chainId, "usdc");
  const wNative = getChainAddress(chainId, "wNative");
  const oracle = "0x0000000000000000000000000000000000080001";
  const block = await client.getBlock();
  await client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      toHex(10n ** 36n, { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
  const market = new MarketParams({
    chainId,
    midnight,
    loanToken: usdc,
    collateralParams: [usdc, wNative].map((token) => ({
      token,
      lltv: 770_000_000_000_000_000n,
      liquidationCursor: 300_000_000_000_000_000n,
      oracle,
    })),
    maturity: block.timestamp + 86_400n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  });
  const supplied = [300n, 700n];
  for (const [index, assets] of supplied.entries()) {
    const { token } = MarketUtils.getCollateralByIndex(market, BigInt(index));
    await client.deal({ erc20: token, account, amount: assets });
    await client.approve({ address: token, args: [midnight, assets] });
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(market), BigInt(index), assets, account],
    });
  }
  const marketId = MarketUtils.toId(market);
  const { timestamp: now, number } = await client.getBlock();
  const positionData = await fetchAccrualPosition(client, {
    marketId,
    user: account,
    blockNumber: number,
  });
  expect(positionData.collateral.slice(0, 2)).toEqual(supplied);

  const plan = await prepareMidnightWithdrawCollateralBatch(client, {
    chainId,
    account,
    marketData: positionData.market,
    positionData,
    collateralPrices: [],
    collateralWithdrawals: [
      { collateralIndex: 1n, assets: 200n },
      { collateralIndex: 0n, assets: maxUint256 },
    ],
    receiver,
    now,
  });
  const restored = parseTransactionPlan(serializeTransactionPlan(plan));
  expect(restored.steps.map(({ action }) => action.type)).toEqual([
    "midnightWithdrawCollateralBatch",
  ]);
  expect(restored.signatureRequests).toEqual([]);
  const transactions = buildTransactions(restored);
  expect(transactions).toEqual(buildTransactions(plan));
  const [tx] = transactions;
  assert(tx);
  expect(tx).toMatchObject({ to: midnight, value: 0n });

  const balance = (token: Address) =>
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [receiver],
    });
  const [token0, token1] = [0n, 1n].map(
    (index) => MarketUtils.getCollateralByIndex(market, index).token,
  );
  assert(token0 && token1);
  const [before0, before1] = await Promise.all([
    balance(token0),
    balance(token1),
  ]);
  const hash = await client.sendTransaction({
    account: client.account,
    to: tx.to,
    data: tx.data,
    value: tx.value,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  const remaining = await fetchAccrualPosition(client, {
    marketId,
    user: account,
  });
  expect(remaining.collateral.slice(0, 2)).toEqual([0n, 500n]);
  await expect(balance(token0)).resolves.toBe(before0 + 300n);
  await expect(balance(token1)).resolves.toBe(before1 + 200n);
});
