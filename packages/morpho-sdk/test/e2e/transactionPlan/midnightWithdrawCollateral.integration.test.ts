import { ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import {
  fetchAccrualPosition,
  MAX_TICK,
  MarketUtils,
  midnightAbi,
  Offer,
  Tree,
} from "@morpho-org/midnight-sdk";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
  postE2eSetterTree,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  type AnvilTestClient,
  BASE_FORK_BLOCK,
  getErpcForkUrl,
} from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  type Chain,
  decodeFunctionData,
  erc20Abi,
  maxUint256,
  parseEther,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import {
  buildTransactions,
  parseTransactionPlan,
  prepareMidnightWithdrawCollateral,
  serializeTransactionPlan,
} from "../../../src/index.js";

const chain: Chain = base;
const chainId = base.id;
const test = createViemTest(chain, {
  forkUrl:
    process.env.BASE_RPC_URL ??
    getErpcForkUrl(chainId, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  stepsTracing: false,
});
const { A: borrower, B: lender, D: recipient } = E2E_MIDNIGHT_WALLETS;
const midnight = getChainAddress(chainId, "midnight");
const debt = parseEther("0.1");
const collateralAssets = parseEther("10");

async function openPosition(
  client: AnvilTestClient<Chain>,
  { borrow }: { borrow: boolean },
) {
  const { params } = await createE2eMidnightMarket(client, chainId);
  const market = MarketUtils.toStruct(params);
  await fundE2eMidnightWallets(client, {
    market: params,
    wallets: {
      A: { collateralAssets },
      B: { loanAssets: debt },
      D: {},
    },
    approve: midnight,
  });
  await client.writeContract({
    account: borrower,
    address: midnight,
    abi: midnightAbi,
    functionName: "supplyCollateral",
    args: [market, 0n, collateralAssets, borrower],
  });
  if (borrow) {
    const { timestamp } = await client.getBlock();
    const tree = Tree.create([
      Offer.create({
        market: params,
        buy: true,
        maker: lender,
        start: timestamp,
        expiry: timestamp + 7_200n,
        tick: MAX_TICK,
        ratifier: getChainAddress(chainId, "setterRatifier"),
        maxUnits: debt,
        continuousFeeCap: maxUint256,
      }),
    ]);
    await postE2eSetterTree(client, { chainId, maker: lender, tree });
    const [seed] = getE2eTakeableOffers({ tree, units: debt });
    assert(seed);
    await client.writeContract({
      account: borrower,
      address: midnight,
      abi: midnightAbi,
      functionName: "take",
      args: [
        seed.offer,
        seed.ratifierData,
        seed.units,
        borrower,
        borrower,
        zeroAddress,
        "0x",
      ],
    });
  }
  const collateral = params.collateralParams[0];
  assert(collateral);
  return {
    marketId: MarketUtils.toId(params),
    collateralToken: collateral.token,
  };
}

test.for([
  { mode: "the whole balance without debt", borrow: false, assets: maxUint256 },
  {
    mode: "part of the collateral with debt",
    borrow: true,
    assets: parseEther("1"),
  },
] as const)(
  "executes a restored Midnight collateral withdrawal: $mode",
  { timeout: 120_000 },
  async ({ borrow, assets }, { client }) => {
    const { marketId, collateralToken } = await openPosition(client, {
      borrow,
    });
    const block = await client.getBlock();
    const position = (blockNumber?: bigint) =>
      fetchAccrualPosition(client, { marketId, user: borrower, blockNumber });
    const positionData = await position(block.number);
    expect(positionData.debt).toBe(borrow ? debt : 0n);
    expect(positionData.collateral[0]).toBe(collateralAssets);
    const withdrawn = assets === maxUint256 ? collateralAssets : assets;

    const plan = await prepareMidnightWithdrawCollateral(client, {
      chainId,
      account: borrower,
      marketData: positionData.market,
      positionData,
      collateralPrices: [ORACLE_PRICE_SCALE],
      assets,
      receiver: recipient,
      now: block.timestamp,
    });
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored.steps.map(({ action }) => action.type)).toEqual([
      "midnightWithdrawCollateral",
    ]);
    expect(restored.signatureRequests).toEqual([]);
    const transactions = buildTransactions(restored);
    expect(transactions).toEqual(buildTransactions(plan));
    const [tx] = transactions;
    assert(tx);
    expect(tx).toMatchObject({ to: midnight, value: 0n });
    expect(decodeFunctionData({ abi: midnightAbi, data: tx.data })).toEqual({
      functionName: "withdrawCollateral",
      args: [
        MarketUtils.toStruct(positionData.market.params),
        0n,
        withdrawn,
        borrower,
        recipient,
      ],
    });

    const balance = (owner: Address) =>
      client.readContract({
        address: collateralToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      });
    const recipientBefore = await balance(recipient);
    const hash = await client.sendTransaction({
      account: restored.account,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    const remaining = await position();
    expect(remaining.collateral[0]).toBe(collateralAssets - withdrawn);
    expect(remaining.debt).toBe(borrow ? debt : 0n);
    await expect(balance(recipient)).resolves.toBe(recipientBefore + withdrawn);
  },
);
