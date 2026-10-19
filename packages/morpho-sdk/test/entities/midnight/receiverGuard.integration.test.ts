import {
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  Offer,
  OfferUtils,
  SetterRatifierUtils,
  setterRatifierAbi,
  Tree,
} from "@morpho-org/midnight-sdk";
import { ChainId, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  erc20Abi,
  type Hex,
  maxUint256,
  padHex,
  parseEther,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  MidnightContractReceiverError,
  morphoViemExtension,
} from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 52_252_000n,
  stepsTracing: false,
});

const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const midnightBundlesV2 = getChainAddress(
  ChainId.BaseMainnet,
  "midnightBundlesV2",
);
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");

const ORACLE = "0x0000000000000000000000000000000000080000" as Address;
const ORACLE_PRICE = 10n ** 36n;

const offerMaker = privateKeyToAccount(generatePrivateKey()).address;

interface MarketFixture {
  readonly params: MarketParams;
  readonly marketData: Market;
  readonly id: Hex;
  readonly loanToken: Address;
  readonly collateralToken: Address;
  readonly oracle: Address;
}

const makeMarket = (params: {
  readonly loanToken: Address;
  readonly collateralToken: Address;
  readonly maturity: bigint;
}): MarketFixture => {
  const marketParams = new MarketParams({
    chainId: base.id,
    midnight,
    loanToken: params.loanToken,
    collateralParams: [
      {
        token: params.collateralToken,
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle: ORACLE,
      },
    ],
    maturity: params.maturity,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  });
  const marketData = new Market({
    params: marketParams,
    totalUnits: 1_000_000n,
    lossFactor: 0n,
    withdrawable: 1_000_000n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee: 0,
    tickSpacing: 1,
  });
  return {
    params: marketParams,
    marketData,
    id: MarketUtils.toId(marketParams),
    loanToken: params.loanToken,
    collateralToken: params.collateralToken,
    oracle: ORACLE,
  };
};

const M_USDC = () =>
  makeMarket({
    loanToken: usdc,
    collateralToken: wNative,
    maturity: 2_000_000_000n,
  });
const M_WETH = () =>
  makeMarket({
    loanToken: wNative,
    collateralToken: usdc,
    maturity: 2_000_000_001n,
  });

const entity = (client: AnvilTestClient<typeof base>) =>
  client.extend(morphoViemExtension()).morpho.midnight(base.id);

const deadline = () => Time.timestamp() + 600n;

const installTestOracle = (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly address: Address;
  readonly price: bigint;
}) =>
  params.client.setCode({
    address: params.address,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(params.price), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });

const sendRequirements = async (
  client: AnvilTestClient<typeof base>,
  output: { getRequirements: () => Promise<readonly object[]> },
) => {
  for (const requirement of await output.getRequirements()) {
    if (!("to" in requirement)) {
      throw new Error("expected an onchain call requirement");
    }
    await client.sendTransaction(
      requirement as Parameters<typeof client.sendTransaction>[0],
    );
  }
};

/** Prepares a ratified offer from `offerMaker`, funding its side of the trade. */
const prepareTakeableOffer = async (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly market: MarketFixture;
  readonly buy: boolean;
  readonly units: bigint;
}) => {
  const { client, market, buy, units } = params;
  const maker = offerMaker;
  await client.setBalance({ address: maker, value: parseEther("1") });
  await client.writeContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [setterRatifier, true, maker],
    account: maker,
  });
  if (buy) {
    await client.deal({
      erc20: market.loanToken,
      account: maker,
      amount: units * 4n,
    });
    await client.writeContract({
      account: maker,
      address: market.loanToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, maxUint256],
    });
  } else {
    const collateralAssets =
      market.collateralToken === wNative
        ? parseEther("10")
        : parseUnits("1000", 6);
    await client.deal({
      erc20: market.collateralToken,
      account: maker,
      amount: collateralAssets,
    });
    await client.writeContract({
      account: maker,
      address: market.collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    const supply = entity(client).supplyCollateral({
      marketData: market.marketData,
      accountAddress: maker,
      collateralAssets,
      reservedCollateralAssets: 0n,
    });
    await client.sendTransaction({ ...supply.buildTx(), account: maker });
  }

  const tree = Tree.create([
    Offer.create({
      market: market.params,
      buy,
      maker,
      expiry: market.params.maturity,
      tick: 5_000n,
      ratifier: setterRatifier,
      maxUnits: units,
    }),
  ]);
  await client.writeContract({
    account: maker,
    address: setterRatifier,
    abi: setterRatifierAbi,
    functionName: "setIsRootRatified",
    args: [maker, tree.root, true],
  });
  const item = SetterRatifierUtils.ratify({ tree })[0];
  if (!item) throw new Error("expected a ratified offer");

  return {
    units,
    offer: OfferUtils.toStruct({ offer: item.offer }),
    ratifierData: item.ratifierData,
  };
};

/** Seeds `client.account` with `units` of credit on `market` via a takeLend fill. */
const lendCredit = async (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly market: MarketFixture;
  readonly units: bigint;
}) => {
  const { client, market, units } = params;
  const account = client.account.address;
  await installTestOracle({
    client,
    address: market.oracle,
    price: ORACLE_PRICE,
  });
  await client.deal({
    erc20: market.loanToken,
    account,
    amount: units * 4n,
  });
  const takeableOffer = await prepareTakeableOffer({
    client,
    market,
    buy: false,
    units: units * 2n,
  });
  const output = entity(client).takeLend({
    marketData: market.marketData,
    accountAddress: account,
    target: { type: "units", units, maxBuyerAssets: units * 2n },
    takeableOffers: [takeableOffer],
    maxContinuousFee: maxUint256,
    deadline: deadline(),
  });
  await sendRequirements(client, output);
  await client.sendTransaction(output.buildTx());
};

/** Repays `units` of the offer maker's debt, growing withdrawable liquidity. */
const repayDebt = async (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly market: MarketFixture;
  readonly units: bigint;
}) => {
  const { client, market, units } = params;
  await client.deal({
    erc20: market.loanToken,
    account: offerMaker,
    amount: units,
  });
  await client.writeContract({
    account: offerMaker,
    address: market.loanToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, units],
  });
  await client.writeContract({
    account: offerMaker,
    address: midnight,
    abi: midnightAbi,
    functionName: "repay",
    args: [
      MarketUtils.toStruct(market.params),
      units,
      offerMaker,
      zeroAddress,
      "0x",
    ],
  });
};

const positionHealthParams = async (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly market: MarketFixture;
  readonly account: Address;
}) => ({
  positionData: await entity(params.client).getPositionData({
    marketId: params.market.id,
    accountAddress: params.account,
  }),
  collateralPrices: [ORACLE_PRICE],
});

/** Seeds `client.account` with collateral and debt on `market`. */
const borrowPosition = async (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly market: MarketFixture;
  readonly units: bigint;
}) => {
  const { client, market, units } = params;
  const account = client.account.address;
  await installTestOracle({
    client,
    address: market.oracle,
    price: ORACLE_PRICE,
  });
  const collateralAssets =
    market.collateralToken === wNative
      ? parseEther("10")
      : parseUnits("1000", 6);
  await client.deal({
    erc20: market.collateralToken,
    account,
    amount: collateralAssets,
  });
  await client.writeContract({
    account,
    address: market.collateralToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, collateralAssets],
  });
  const supply = entity(client).supplyCollateral({
    marketData: market.marketData,
    accountAddress: account,
    collateralAssets,
    reservedCollateralAssets: 0n,
  });
  await client.sendTransaction(supply.buildTx());

  const takeableOffer = await prepareTakeableOffer({
    client,
    market,
    buy: true,
    units: units * 4n,
  });
  const output = entity(client).takeBorrow({
    marketData: market.marketData,
    accountAddress: account,
    ...(await positionHealthParams({ client, market, account })),
    target: { type: "units", units, minSellerAssets: 1n },
    takeableOffers: [takeableOffer],
    deadline: deadline(),
  });
  await sendRequirements(client, output);
  await client.sendTransaction(output.buildTx());
};

describe("Midnight receiver guard", () => {
  test("error: MorphoMidnight.redeem rejects a zero receiver on a WETH market", async ({
    client,
  }) => {
    const market = M_WETH();
    await lendCredit({ client, market, units: 1_000_000n });
    await repayDebt({ client, market, units: 1_000_000n });
    const positionData = await entity(client).getPositionData({
      marketId: market.id,
      accountAddress: client.account.address,
    });

    expect(() =>
      entity(client).redeem({
        accountAddress: client.account.address,
        positionData,
        receiver: zeroAddress,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightZeroReceiverError",
        field: "receiver",
      }),
    );
  });

  test("behavior: MorphoMidnight.redeem to the lender pays out the loan token", async ({
    client,
  }) => {
    const market = M_WETH();
    await lendCredit({ client, market, units: 1_000_000n });
    await repayDebt({ client, market, units: 1_000_000n });
    const account = client.account.address;
    const positionData = await entity(client).getPositionData({
      marketId: market.id,
      accountAddress: account,
    });
    const balanceBefore = await client.readContract({
      address: market.loanToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });

    const output = entity(client).redeem({
      accountAddress: account,
      positionData,
      receiver: account,
    });
    const hash = await client.sendTransaction(output.buildTx());
    const receipt = await client.waitForTransactionReceipt({ hash });

    expect(receipt.status).toBe("success");
    await expect(
      client.readContract({
        address: market.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      }),
    ).resolves.toBeGreaterThan(balanceBefore);
  });

  test("error: MorphoMidnight.redeem rejects midnightBundlesV2 as receiver", async ({
    client,
  }) => {
    const market = M_WETH();
    await lendCredit({ client, market, units: 1_000_000n });
    await repayDebt({ client, market, units: 1_000_000n });
    const positionData = await entity(client).getPositionData({
      marketId: market.id,
      accountAddress: client.account.address,
    });

    expect(() =>
      entity(client).redeem({
        accountAddress: client.account.address,
        positionData,
        receiver: midnightBundlesV2,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightContractReceiverError",
        field: "receiver",
        contract: "midnightBundlesV2",
      }),
    );
  });

  test("error: MorphoMidnight.takeBorrow rejects midnightBundlesV2 as receiver", async ({
    client,
  }) => {
    const market = M_USDC();
    await borrowPosition({ client, market, units: 1_000_000n });
    const account = client.account.address;
    const takeableOffer = await prepareTakeableOffer({
      client,
      market,
      buy: true,
      units: 4_000_000n,
    });
    const health = await positionHealthParams({ client, market, account });

    expect(() =>
      entity(client).takeBorrow({
        marketData: market.marketData,
        accountAddress: account,
        ...health,
        target: { type: "units", units: 500_000n, minSellerAssets: 1n },
        receiver: midnightBundlesV2,
        takeableOffers: [takeableOffer],
        deadline: deadline(),
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightContractReceiverError",
        field: "receiver",
        contract: "midnightBundlesV2",
      }),
    );
  });

  test("error: MorphoMidnight.takeWithdraw rejects midnight as receiver", async ({
    client,
  }) => {
    const market = M_USDC();
    await lendCredit({ client, market, units: 1_000_000n });
    const takeableOffer = await prepareTakeableOffer({
      client,
      market,
      buy: true,
      units: 4_000_000n,
    });

    expect(() =>
      entity(client).takeWithdraw({
        marketData: market.marketData,
        accountAddress: client.account.address,
        target: { type: "units", units: 500_000n, minSellerAssets: 1n },
        receiver: midnight,
        takeableOffers: [takeableOffer],
        deadline: deadline(),
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightContractReceiverError",
        field: "receiver",
        contract: "midnight",
      }),
    );
  });

  test("error: MorphoMidnight.supplyCollateralTakeBorrow rejects midnightBundlesV2 as receiver", async ({
    client,
  }) => {
    const market = M_USDC();
    await installTestOracle({
      client,
      address: market.oracle,
      price: ORACLE_PRICE,
    });
    const account = client.account.address;
    const collateralAssets = parseEther("10");
    await client.deal({
      erc20: market.collateralToken,
      account,
      amount: collateralAssets,
    });
    const takeableOffer = await prepareTakeableOffer({
      client,
      market,
      buy: true,
      units: 4_000_000n,
    });
    await client.writeContract({
      account,
      address: market.collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    const seed = entity(client).supplyCollateral({
      marketData: market.marketData,
      accountAddress: account,
      collateralAssets: 1_000_000n,
      reservedCollateralAssets: 0n,
    });
    await client.sendTransaction(seed.buildTx());
    const health = await positionHealthParams({ client, market, account });

    expect(() =>
      entity(client).supplyCollateralTakeBorrow({
        marketData: market.marketData,
        accountAddress: account,
        ...health,
        collateralSupplies: [{ collateralIndex: 0n, assets: collateralAssets }],
        target: { type: "units", units: 500_000n, minSellerAssets: 1n },
        receiver: midnightBundlesV2,
        takeableOffers: [takeableOffer],
        deadline: deadline(),
      }),
    ).toThrow(MidnightContractReceiverError);
  });

  test("error: MorphoMidnight.takeRepayWithdrawCollateral rejects midnightBundlesV2 as collateralReceiver", async ({
    client,
  }) => {
    const market = M_USDC();
    await borrowPosition({ client, market, units: 1_000_000n });
    const account = client.account.address;
    const takeableOffer = await prepareTakeableOffer({
      client,
      market,
      buy: false,
      units: 4_000_000n,
    });
    const health = await positionHealthParams({ client, market, account });

    expect(() =>
      entity(client).takeRepayWithdrawCollateral({
        marketData: market.marketData,
        accountAddress: account,
        ...health,
        target: { type: "units", units: 100_000n, maxBuyerAssets: 200_000n },
        takeableOffers: [takeableOffer],
        repayEnabled: true,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
        collateralReceiver: midnightBundlesV2,
        maxContinuousFee: maxUint256,
        deadline: deadline(),
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightContractReceiverError",
        field: "collateralReceiver",
        contract: "midnightBundlesV2",
      }),
    );
  });

  test("error: MorphoMidnight.repayWithdrawCollateral rejects midnight as collateralReceiver", async ({
    client,
  }) => {
    const market = M_USDC();
    await borrowPosition({ client, market, units: 1_000_000n });
    const account = client.account.address;
    const health = await positionHealthParams({ client, market, account });

    expect(() =>
      entity(client).repayWithdrawCollateral({
        marketData: market.marketData,
        accountAddress: account,
        ...health,
        repay: { type: "assets", assets: 0n },
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
        collateralReceiver: midnight,
        deadline: maxUint256,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightContractReceiverError",
        field: "collateralReceiver",
        contract: "midnight",
      }),
    );
  });

  test("behavior: MorphoMidnight.repayWithdrawCollateral to the account mines", async ({
    client,
  }) => {
    const market = M_USDC();
    await borrowPosition({ client, market, units: 1_000_000n });
    const account = client.account.address;
    const withdrawAssets = parseEther("0.5");
    const balanceBefore = await client.readContract({
      address: market.collateralToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });

    const output = entity(client).repayWithdrawCollateral({
      marketData: market.marketData,
      accountAddress: account,
      ...(await positionHealthParams({ client, market, account })),
      repay: { type: "assets", assets: 0n },
      collateralWithdrawals: [{ collateralIndex: 0n, assets: withdrawAssets }],
      collateralReceiver: account,
      deadline: maxUint256,
    });
    await sendRequirements(client, output);
    const hash = await client.sendTransaction(output.buildTx());
    const receipt = await client.waitForTransactionReceipt({ hash });

    expect(receipt.status).toBe("success");
    await expect(
      client.readContract({
        address: market.collateralToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      }),
    ).resolves.toBe(balanceBefore + withdrawAssets);
  });

  test("error: MorphoMidnight.takeLend rejects midnightBundlesV2 as referralFeeRecipient", async ({
    client,
  }) => {
    const market = M_USDC();
    await installTestOracle({
      client,
      address: market.oracle,
      price: ORACLE_PRICE,
    });
    const takeableOffer = await prepareTakeableOffer({
      client,
      market,
      buy: false,
      units: 4_000_000n,
    });

    expect(() =>
      entity(client).takeLend({
        marketData: market.marketData,
        accountAddress: client.account.address,
        target: {
          type: "units",
          units: 1_000_000n,
          maxBuyerAssets: 2_000_000n,
        },
        takeableOffers: [takeableOffer],
        maxContinuousFee: maxUint256,
        deadline: deadline(),
        referralFeePct: 10n ** 17n,
        referralFeeRecipient: midnightBundlesV2,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightContractReceiverError",
        field: "referralFeeRecipient",
        contract: "midnightBundlesV2",
      }),
    );
  });
});
