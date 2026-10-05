import {
  MarketParams,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  Offer,
  priceRatifierV1Abi,
  rateRatifierV1Abi,
  Tree,
} from "@morpho-org/midnight-sdk";
import {
  ChainId,
  getChainAddress,
  registerCustomAddresses,
} from "@morpho-org/morpho-ts";
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
  parseUnits,
  toFunctionSelector,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import type { MidnightCancelAndMakeOutput } from "../../../src/entities/index.js";
import {
  isRequirementSignature,
  morphoViemExtension,
} from "../../../src/index.js";
import { midnightBundlesV2Bytecode } from "../../fixtures/midnightBundlesV2.js";

const test = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 51_800_000n,
  hardfork: "Karst",
  stepsTracing: false,
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const priceRatifierV1 = getChainAddress(ChainId.BaseMainnet, "priceRatifierV1");
const rateRatifierV1 = getChainAddress(ChainId.BaseMainnet, "rateRatifierV1");
const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
/** Fresh deployer so every fork test deploys MidnightBundlesV2 at the same address. */
const oracle = "0x0000000000000000000000000000000000080000" as Address;
const deployer = "0x00000000000000000000000000000000000b2d00" as Address;
const groupA = `0x${"aa".repeat(32)}` as Hex;
const groupB = `0x${"bb".repeat(32)}` as Hex;
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
/** Skips the Midnight mempool API; the fork test covers onchain publication only. */
const validation = {
  apiUrl: "https://api.example/base/",
  fetch: async () =>
    new Response(JSON.stringify({ data: { issues: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
};

const deployMidnightBundlesV2 = async (
  client: AnvilTestClient<typeof base>,
) => {
  await client.setBalance({ address: deployer, value: parseEther("1") });
  const hash = await client.deployContract({
    account: deployer,
    abi: midnightBundlesV2Abi,
    bytecode: midnightBundlesV2Bytecode,
    args: [
      midnight,
      getChainAddress(ChainId.BaseMainnet, "blue"),
      getChainAddress(ChainId.BaseMainnet, "midnightBlueBuyCallbackFactory"),
      getChainAddress(ChainId.BaseMainnet, "midnightMempool"),
    ],
  });
  const { contractAddress } = await client.waitForTransactionReceipt({ hash });
  if (!contractAddress) throw new Error("MidnightBundlesV2 deployment failed");
  registerCustomAddresses({
    addresses: { [base.id]: { midnightBundlesV2: contractAddress } },
  });
};

const rateTree = (
  client: AnvilTestClient<typeof base>,
  params: { readonly buy: boolean; readonly group: Hex },
) =>
  Tree.create({
    type: "rateV1",
    entries: [
      {
        offer: Offer.create({
          market,
          buy: params.buy,
          maker: client.account.address,
          expiry: market.maturity,
          tick: 5_000n,
          group: params.group,
          ratifier: rateRatifierV1,
          receiverIfMakerIsSeller: params.buy
            ? zeroAddress
            : client.account.address,
          maxUnits: 0n,
          maxAssets: parseUnits("1", 6),
        }),
        rate: 1_000_000_000n,
      },
    ],
  });

const priceTree = (
  client: AnvilTestClient<typeof base>,
  params: { readonly buy: boolean; readonly group: Hex },
) =>
  Tree.create({
    type: "priceV1",
    entries: [
      {
        offer: Offer.create({
          market,
          buy: params.buy,
          maker: client.account.address,
          expiry: market.maturity,
          tick: 5_000n,
          group: params.group,
          ratifier: priceRatifierV1,
          receiverIfMakerIsSeller: params.buy
            ? zeroAddress
            : client.account.address,
          maxUnits: 0n,
          maxAssets: parseUnits("1", 6),
        }),
      },
    ],
  });

const isRootRatified = (client: AnvilTestClient<typeof base>, root: Hex) =>
  client.readContract({
    address: rateRatifierV1,
    abi: rateRatifierV1Abi,
    functionName: "isRootRatified",
    args: [client.account.address, root],
  });

const isPriceRootRatified = (client: AnvilTestClient<typeof base>, root: Hex) =>
  client.readContract({
    address: priceRatifierV1,
    abi: priceRatifierV1Abi,
    functionName: "isRootRatified",
    args: [client.account.address, root],
  });

const consumed = (client: AnvilTestClient<typeof base>, group: Hex) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "consumed",
    args: [client.account.address, group],
  });

const fulfilRequirements = async (
  client: AnvilTestClient<typeof base>,
  output: MidnightCancelAndMakeOutput,
) => {
  for (const requirement of await output.getRequirements()) {
    if (isRequirementSignature(requirement)) {
      throw new Error("expected only onchain requirements");
    }
    await client.sendTransaction(requirement);
  }
  await expect(output.getRequirements()).resolves.toEqual([]);
};

describe("Midnight cancel-and-make on fork", () => {
  test("publishes lend offers, then atomically reposts them", async ({
    client,
  }) => {
    await deployMidnightBundlesV2(client);
    await client.deal({
      erc20: usdc,
      account: client.account.address,
      amount: parseUnits("10", 6),
    });
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);

    const first = await midnightEntity.cancelAndMakeLend({
      accountAddress: client.account.address,
      offers: rateTree(client, { buy: true, group: groupA }),
      deadline: maxUint256,
      validation,
      loanToken: usdc,
      loanAssets: parseUnits("1", 6),
    });
    await fulfilRequirements(client, first);
    await client.sendTransaction(first.buildTx());

    await expect(isRootRatified(client, first.root)).resolves.toBe(true);

    const repost = await midnightEntity.cancelAndMakeLend({
      accountAddress: client.account.address,
      offers: rateTree(client, { buy: true, group: groupB }),
      cancellations: [{ group: groupA, maxConsumed: 0n }],
      deadline: maxUint256,
      validation,
      loanToken: usdc,
      loanAssets: parseUnits("1", 6),
    });
    await fulfilRequirements(client, repost);
    await client.sendTransaction(repost.buildTx());

    await expect(consumed(client, groupA)).resolves.toBe(maxUint128);
    await expect(isRootRatified(client, repost.root)).resolves.toBe(true);
  });

  test("publishes lend offers through PriceRatifierV1", async ({ client }) => {
    await deployMidnightBundlesV2(client);
    await client.deal({
      erc20: usdc,
      account: client.account.address,
      amount: parseUnits("10", 6),
    });
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);

    const output = await midnightEntity.cancelAndMakeLend({
      accountAddress: client.account.address,
      offers: priceTree(client, { buy: true, group: groupA }),
      deadline: maxUint256,
      validation,
      loanToken: usdc,
      loanAssets: parseUnits("1", 6),
    });
    await fulfilRequirements(client, output);
    const hash = await client.sendTransaction(output.buildTx());
    const receipt = await client.waitForTransactionReceipt({ hash });

    expect(receipt.status).toBe("success");
    await expect(isPriceRootRatified(client, output.root)).resolves.toBe(true);
  });

  test("error: reverts the whole repost when a cancelled group is consumed above its ceiling", async ({
    client,
  }) => {
    await deployMidnightBundlesV2(client);
    await client.deal({
      erc20: usdc,
      account: client.account.address,
      amount: parseUnits("10", 6),
    });
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);

    const first = await midnightEntity.cancelAndMakeLend({
      accountAddress: client.account.address,
      offers: rateTree(client, { buy: true, group: groupA }),
      deadline: maxUint256,
      validation,
      loanToken: usdc,
      loanAssets: parseUnits("1", 6),
    });
    await fulfilRequirements(client, first);
    await client.sendTransaction(first.buildTx());

    // Simulates a partial fill of groupA after the repost was prepared.
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "setConsumed",
      args: [groupA, 1n, client.account.address],
    });

    const repost = await midnightEntity.cancelAndMakeLend({
      accountAddress: client.account.address,
      offers: rateTree(client, { buy: true, group: groupB }),
      cancellations: [{ group: groupA, maxConsumed: 0n }],
      deadline: maxUint256,
      validation,
      loanToken: usdc,
      loanAssets: parseUnits("1", 6),
    });
    await fulfilRequirements(client, repost);

    await expect(client.sendTransaction(repost.buildTx())).rejects.toThrow(
      toFunctionSelector("ConsumedAboveMax()"),
    );
    await expect(consumed(client, groupA)).resolves.toBe(1n);
    await expect(isRootRatified(client, repost.root)).resolves.toBe(false);
  });

  test("supplies collateral and publishes borrow offers in one transaction", async ({
    client,
  }) => {
    await deployMidnightBundlesV2(client);
    await client.setCode({
      address: oracle,
      bytecode: concatHex([
        "0x7f",
        padHex(toHex(10n ** 36n), { size: 32 }),
        "0x60005260206000f3",
      ]),
    });
    const collateralAssets = parseEther("2");
    await client.deal({
      erc20: wNative,
      account: client.account.address,
      amount: collateralAssets,
    });
    const output = await client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .supplyCollateralMakeBorrow({
        accountAddress: client.account.address,
        offers: rateTree(client, { buy: false, group: groupA }),
        collateral: {
          market,
          supplies: [{ collateralIndex: 0n, assets: collateralAssets }],
        },
        deadline: maxUint256,
        validation,
      });
    await fulfilRequirements(client, output);
    await client.sendTransaction(output.buildTx());

    await expect(isRootRatified(client, output.root)).resolves.toBe(true);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [MarketUtils.toId(market), client.account.address, 0n],
      }),
    ).resolves.toBe(collateralAssets);
  });
});
