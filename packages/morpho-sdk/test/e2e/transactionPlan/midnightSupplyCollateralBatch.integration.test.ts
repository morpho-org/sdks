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
  decodeFunctionData,
  erc20Abi,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import {
  buildTransactions,
  parseTransactionPlan,
  prepareMidnightSupplyCollateralBatch,
  serializeTransactionPlan,
} from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl:
    process.env.BASE_RPC_URL ??
    getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  stepsTracing: false,
});

test("executes a restored Midnight collateral supply batch", async ({
  client,
}) => {
  const chainId = base.id;
  const account = client.account.address;
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
  const [token0, token1] = [0n, 1n].map(
    (index) => MarketUtils.getCollateralByIndex(market, index).token,
  );
  assert(token0 && token1);
  const balance = (token: Address) =>
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
  await client.deal({ erc20: token0, account, amount: 300n });
  await client.deal({ erc20: token1, account, amount: 700n });
  const { timestamp: now } = await client.getBlock();

  const plan = await prepareMidnightSupplyCollateralBatch(client, {
    chainId,
    account,
    market,
    collateralSupplies: [
      { collateralIndex: 1n, assets: 700n },
      { collateralIndex: 0n, assets: 300n },
    ],
    now,
  });
  const restored = parseTransactionPlan(serializeTransactionPlan(plan));
  expect(restored.steps.map(({ action }) => action.type)).toEqual([
    "erc20Approval",
    "erc20Approval",
    "midnightSupplyCollateralBatch",
  ]);
  expect(restored.signatureRequests).toEqual([]);
  const transactions = buildTransactions(restored);
  expect(transactions).toEqual(buildTransactions(plan));
  const supply = transactions.at(-1);
  assert(supply);
  expect(supply).toMatchObject({ to: midnight, value: 0n });
  expect(
    decodeFunctionData({ abi: midnightAbi, data: supply.data }).functionName,
  ).toBe("multicall");

  for (const tx of transactions) {
    const hash = await client.sendTransaction({
      account: restored.account,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
  }
  const position = await fetchAccrualPosition(client, {
    marketId: MarketUtils.toId(market),
    user: account,
  });
  expect(position.collateral.slice(0, 2)).toEqual([300n, 700n]);
  await expect(balance(token0)).resolves.toBe(0n);
  await expect(balance(token1)).resolves.toBe(0n);

  const again = await prepareMidnightSupplyCollateralBatch(client, {
    chainId,
    account,
    market,
    collateralSupplies: [{ collateralIndex: 0n, assets: 1n }],
    now: (await client.getBlock()).timestamp,
  });
  expect(again.steps.map(({ action }) => action.type)).toEqual([
    "midnightSupplyCollateralBatch",
  ]);
});
