import {
  MarketParams,
  MarketUtils,
  midnightAbi,
  priceRatifierV1Abi,
  Tree,
} from "@morpho-org/midnight-sdk";
import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  type Hex,
  maxUint128,
  maxUint256,
  padHex,
  parseEther,
  toFunctionSelector,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  isRequirementSignature,
  morphoViemExtension,
} from "../../../src/index.js";
import { midnightBaseOffer } from "../../fixtures/midnight.js";
import { deployMidnightBundlesV2 } from "../../fixtures/midnightBundlesV2.js";

const test = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 51_800_000n,
  hardfork: "Karst",
  stepsTracing: false,
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const priceRatifierV1 = getChainAddress(ChainId.BaseMainnet, "priceRatifierV1");
const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const oracle = "0x0000000000000000000000000000000000080000" as Address;
const market = new MarketParams({
  chainId: base.id,
  midnight,
  loanToken: usdc,
  collateralParams: [
    {
      token: wNative,
      lltv: 770000000000000000n,
      liquidationCursor: 300000000000000000n,
      oracle,
    },
  ],
  maturity: 2_000_041_200n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});
const marketId = MarketUtils.toId(market);
const priorGroup = `0x${"bb".repeat(32)}` as Hex;
const collateralAssets = parseEther("1");
const validation = {
  fetch: async () =>
    new Response(JSON.stringify({ data: { issues: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
};

const prepare = async (client: AnvilTestClient<typeof base>) => {
  await deployMidnightBundlesV2(client);
  await client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
  await client.deal({
    erc20: wNative,
    account: client.account.address,
    amount: collateralAssets,
  });
  const tree = Tree.create({
    type: "priceV1",
    entries: [
      {
        offer: midnightBaseOffer({
          market,
          buy: false,
          maker: client.account.address,
          receiverIfMakerIsSeller: client.account.address,
          expiry: 1_999_999_000n,
          maxAssets: 1_000_000n,
          maxUnits: 0n,
          ratifier: priceRatifierV1,
          group: `0x${"aa".repeat(32)}`,
        }),
      },
    ],
  });
  const output = await client
    .extend(morphoViemExtension())
    .morpho.midnight(base.id)
    .supplyCollateralMakeBorrow({
      accountAddress: client.account.address,
      market,
      offers: tree,
      collateralSupplies: [{ collateralIndex: 0n, assets: collateralAssets }],
      cancellations: [{ group: priorGroup, maxConsumed: 10n }],
      deadline: maxUint256,
      validation,
    });
  const requirements = await output.getRequirements();
  expect(requirements.map(({ action }) => action.type)).toEqual([
    "erc20Approval",
    "midnightAuthorization",
  ]);
  for (const requirement of requirements) {
    if (isRequirementSignature(requirement)) {
      throw new Error("expected transaction requirements only");
    }
    await client.sendTransaction(requirement);
  }
  await expect(output.getRequirements()).resolves.toEqual([]);

  return { tree, tx: output.buildTx() };
};

const collateral = (client: AnvilTestClient<typeof base>) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "collateral",
    args: [marketId, client.account.address, 0n],
  });

const isRootRatified = (client: AnvilTestClient<typeof base>, root: Hex) =>
  client.readContract({
    address: priceRatifierV1,
    abi: priceRatifierV1Abi,
    functionName: "isRootRatified",
    args: [client.account.address, root],
  });

const consumed = (client: AnvilTestClient<typeof base>) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "consumed",
    args: [client.account.address, priorGroup],
  });

describe("Midnight atomic supply-collateral-and-make-borrow on fork", () => {
  test("cancels, supplies collateral, ratifies, and publishes in one transaction", async ({
    client,
  }) => {
    const { tree, tx } = await prepare(client);

    const hash = await client.sendTransaction(tx);
    const receipt = await client.waitForTransactionReceipt({ hash });

    expect(receipt.status).toBe("success");
    await expect(collateral(client)).resolves.toBe(collateralAssets);
    await expect(isRootRatified(client, tree.root)).resolves.toBe(true);
    await expect(consumed(client)).resolves.toBe(maxUint128);
    expect(
      receipt.logs.some(
        ({ address }) =>
          address.toLowerCase() ===
          getChainAddress(ChainId.BaseMainnet, "midnightMempool").toLowerCase(),
      ),
    ).toBe(true);
  });

  test("reverts everything when a prior group was filled above its ceiling", async ({
    client,
  }) => {
    const { tree, tx } = await prepare(client);
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "setConsumed",
      args: [priorGroup, 11n, client.account.address],
    });

    await expect(client.sendTransaction(tx)).rejects.toThrow(
      toFunctionSelector("ConsumedAboveMax()"),
    );

    await expect(collateral(client)).resolves.toBe(0n);
    await expect(isRootRatified(client, tree.root)).resolves.toBe(false);
    await expect(consumed(client)).resolves.toBe(11n);
  });
});
