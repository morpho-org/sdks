import {
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  Offer,
  OfferUtils,
  SetterRatifierUtils,
  Tree,
} from "@morpho-org/midnight-sdk";
import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  erc20Abi,
  maxUint256,
  padHex,
  parseEther,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  type ActionRequirement,
  getMidnightAuthorizationRequirement,
  getSetterRatifierRatifyRootRequirement,
  morphoViemExtension,
} from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 48_287_000n,
  hardfork: "Karst",
  stepsTracing: false,
});

const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const cbBtc = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address;
const oracle = "0x0000000000000000000000000000000000080000" as Address;
const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const midnightBundles = getChainAddress(ChainId.BaseMainnet, "midnightBundles");
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const offerMaker = "0x9000000000000000000000000000000000000000" as Address;

const marketData = new Market({
  params: new MarketParams({
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
      {
        token: cbBtc,
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle,
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  }),
  totalUnits: 1_000_000n,
  lossFactor: 0n,
  withdrawable: 1_000_000n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
  continuousFee: 0,
  tickSpacing: 1,
});
const marketId = MarketUtils.toId(marketData.params);

const wNativeAssets = parseEther("1");
const cbBtcAssets = parseUnits("0.01", 8);
const loanAssets = parseUnits("1", 6);

const installTestOracle = (client: AnvilTestClient<typeof base>) =>
  client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });

const prepareLendOffer = async (client: AnvilTestClient<typeof base>) => {
  await client.setBalance({ address: offerMaker, value: parseEther("1") });
  const authorization = await getMidnightAuthorizationRequirement({
    viemClient: client,
    chainId: base.id,
    owner: offerMaker,
    authorized: setterRatifier,
  });
  if (authorization) {
    await client.sendTransaction({ ...authorization, account: offerMaker });
  }
  await client.deal({
    erc20: usdc,
    account: offerMaker,
    amount: parseUnits("10", 6),
  });
  await client.writeContract({
    account: offerMaker,
    address: usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });

  const tree = Tree.create([
    Offer.create({
      market: marketData.params,
      buy: true,
      maker: offerMaker,
      expiry: marketData.params.maturity,
      tick: 5_000n,
      ratifier: setterRatifier,
      maxUnits: 2n * loanAssets,
    }),
  ]);
  const ratifyRoot = await getSetterRatifierRatifyRootRequirement({
    viemClient: client,
    chainId: base.id,
    maker: offerMaker,
    root: tree.root,
  });
  if (ratifyRoot) {
    await client.sendTransaction({ ...ratifyRoot, account: offerMaker });
  }
  const item = SetterRatifierUtils.ratify({ tree })[0];
  if (!item) throw new Error("expected a ratified offer");

  return {
    units: 2n * loanAssets,
    offer: OfferUtils.toStruct({ offer: item.offer }),
    ratifierData: item.ratifierData,
  };
};

const sendRequirements = async (
  client: AnvilTestClient<typeof base>,
  requirements: readonly ActionRequirement[],
) => {
  for (const requirement of requirements) {
    if (!("to" in requirement)) {
      throw new Error("expected an onchain call requirement");
    }
    await client.sendTransaction(requirement);
  }
};

const readCollateral = (
  client: AnvilTestClient<typeof base>,
  collateralIndex: bigint,
) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "collateral",
    args: [marketId, client.account.address, collateralIndex],
  });

describe("Midnight multi-collateral bundles on fork", () => {
  test("supplies two collateral tokens, borrows, then repays and withdraws both", async ({
    client,
  }) => {
    await installTestOracle(client);
    await client.deal({ erc20: wNative, amount: wNativeAssets });
    await client.deal({ erc20: cbBtc, amount: cbBtcAssets });
    const takeableOffer = await prepareLendOffer(client);
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);

    const borrow = midnightEntity.supplyCollateralTakeBorrow({
      marketData,
      accountAddress: client.account.address,
      collateralSupplies: [
        { collateralIndex: 0n, assets: wNativeAssets },
        { collateralIndex: 1n, assets: cbBtcAssets },
      ],
      loanAssets,
      maxUnits: 2n * loanAssets,
      takeableOffers: [takeableOffer],
      deadline: maxUint256,
    });
    const borrowRequirements = await borrow.getRequirements();
    expect(
      borrowRequirements.map((requirement) => [
        requirement.action.type,
        "to" in requirement ? requirement.to : null,
      ]),
    ).toEqual([
      ["erc20Approval", wNative],
      ["erc20Approval", cbBtc],
      ["midnightAuthorization", midnight],
    ]);
    await sendRequirements(client, borrowRequirements);
    await expect(borrow.getRequirements()).resolves.toEqual([]);
    await client.sendTransaction(borrow.buildTx());

    await expect(readCollateral(client, 0n)).resolves.toBe(wNativeAssets);
    await expect(readCollateral(client, 1n)).resolves.toBe(cbBtcAssets);
    await expect(client.balanceOf({ erc20: wNative })).resolves.toBe(0n);
    await expect(client.balanceOf({ erc20: cbBtc })).resolves.toBe(0n);
    await expect(client.balanceOf({ erc20: usdc })).resolves.toBe(loanAssets);
    const debtBeforeRepay = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "debt",
      args: [marketId, client.account.address],
    });
    expect(debtBeforeRepay).toBeGreaterThan(0n);

    const repay = midnightEntity.repayWithdrawCollateral({
      marketData,
      accountAddress: client.account.address,
      repayAssets: loanAssets / 2n,
      collateralWithdrawals: [
        { collateralIndex: 1n, assets: cbBtcAssets / 2n },
        { collateralIndex: 0n, assets: wNativeAssets / 4n },
      ],
      deadline: maxUint256,
    });
    await sendRequirements(client, await repay.getRequirements());
    await client.sendTransaction(repay.buildTx());

    await expect(readCollateral(client, 0n)).resolves.toBe(
      wNativeAssets - wNativeAssets / 4n,
    );
    await expect(readCollateral(client, 1n)).resolves.toBe(
      cbBtcAssets - cbBtcAssets / 2n,
    );
    await expect(client.balanceOf({ erc20: wNative })).resolves.toBe(
      wNativeAssets / 4n,
    );
    await expect(client.balanceOf({ erc20: cbBtc })).resolves.toBe(
      cbBtcAssets / 2n,
    );
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [marketId, client.account.address],
      }),
    ).resolves.toBeLessThan(debtBeforeRepay);
  });

  test("reverts every collateral supply when one token transfer fails", async ({
    client,
  }) => {
    await installTestOracle(client);
    await client.deal({ erc20: wNative, amount: wNativeAssets });
    await client.deal({ erc20: cbBtc, amount: cbBtcAssets });
    const takeableOffer = await prepareLendOffer(client);
    const borrow = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .supplyCollateralTakeBorrow({
        marketData,
        accountAddress: client.account.address,
        collateralSupplies: [
          { collateralIndex: 0n, assets: wNativeAssets },
          { collateralIndex: 1n, assets: cbBtcAssets },
        ],
        loanAssets,
        maxUnits: 2n * loanAssets,
        takeableOffers: [takeableOffer],
        deadline: maxUint256,
      });
    const requirements = await borrow.getRequirements();
    // Skip the second token's approval so its transfer fails mid-bundle.
    await sendRequirements(
      client,
      requirements.filter(
        (requirement) => !("to" in requirement) || requirement.to !== cbBtc,
      ),
    );
    await expect(
      client.readContract({
        address: cbBtc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [client.account.address, midnightBundles],
      }),
    ).resolves.toBe(0n);

    await expect(client.sendTransaction(borrow.buildTx())).rejects.toThrow();

    await expect(readCollateral(client, 0n)).resolves.toBe(0n);
    await expect(readCollateral(client, 1n)).resolves.toBe(0n);
    await expect(client.balanceOf({ erc20: wNative })).resolves.toBe(
      wNativeAssets,
    );
    await expect(client.balanceOf({ erc20: usdc })).resolves.toBe(0n);

    // The same bundle succeeds once the skipped approval is sent.
    await sendRequirements(
      client,
      requirements.filter(
        (requirement) => "to" in requirement && requirement.to === cbBtc,
      ),
    );
    await client.sendTransaction(borrow.buildTx());
    await expect(readCollateral(client, 1n)).resolves.toBe(cbBtcAssets);
  });
});
