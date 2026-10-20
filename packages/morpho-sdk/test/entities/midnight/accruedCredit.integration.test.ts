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
  MidnightRedeemExceedsCreditError,
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
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");

const ORACLE_USDC = "0x0000000000000000000000000000000000080000" as Address;
const PRICE_USDC = 10n ** 36n;
const MAX_CONTINUOUS_FEE = 10n ** 16n / 31_536_000n; // 0.01e18 / 365 days

const offerMaker = "0x9000000000000000000000000000000000000000" as Address;
const offerMaker2 = privateKeyToAccount(generatePrivateKey()).address;
const lender2 = privateKeyToAccount(generatePrivateKey()).address;

interface MarketFixture {
  readonly params: MarketParams;
  readonly marketData: Market;
  readonly id: Hex;
  readonly loanToken: Address;
  readonly collateralToken: Address;
  readonly oracle: Address;
  readonly oraclePrice: bigint;
}

const makeMarket = (params: {
  readonly loanToken: Address;
  readonly collateralToken: Address;
  readonly oracle: Address;
  readonly oraclePrice: bigint;
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
        oracle: params.oracle,
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
    oracle: params.oracle,
    oraclePrice: params.oraclePrice,
  };
};

const M_FEE = () =>
  makeMarket({
    loanToken: usdc,
    collateralToken: wNative,
    oracle: ORACLE_USDC,
    oraclePrice: PRICE_USDC,
    maturity: 2_000_000_002n,
  });
const M_LOSS = () =>
  makeMarket({
    loanToken: usdc,
    collateralToken: wNative,
    oracle: ORACLE_USDC,
    oraclePrice: PRICE_USDC,
    maturity: 2_000_000_003n,
  });
const send = (
  client: AnvilTestClient<typeof base>,
  tx: Parameters<AnvilTestClient<typeof base>["sendTransaction"]>[0],
) => client.sendTransaction(tx);

const sendWrite = (
  client: AnvilTestClient<typeof base>,
  args: Parameters<AnvilTestClient<typeof base>["writeContract"]>[0],
) => client.writeContract(args);

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

const prepareTakeableOffer = async (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly market: MarketFixture;
  readonly buy: boolean;
  readonly units: bigint;
  readonly maker?: Address;
  readonly continuousFeeCap?: bigint;
  readonly expiry?: bigint;
}) => {
  const { client, market } = params;
  const maker = params.maker ?? offerMaker;
  await client.setBalance({ address: maker, value: parseEther("1") });
  await sendWrite(client, {
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [setterRatifier, true, maker],
    account: maker,
  });

  if (params.buy) {
    await client.deal({
      erc20: market.loanToken,
      account: maker,
      amount: parseUnits("1000", 6) + 10n ** 30n,
    });
    await sendWrite(client, {
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
    await sendWrite(client, {
      account: maker,
      address: market.collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    const supply = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .supplyCollateral({
        marketData: market.marketData,
        accountAddress: maker,
        collateralAssets,
        reservedCollateralAssets: 0n,
      });
    await send(client, { ...supply.buildTx(), account: maker });
  }

  const tree = Tree.create([
    Offer.create({
      market: market.params,
      buy: params.buy,
      maker,
      expiry: params.expiry ?? market.params.maturity,
      tick: 5_000n,
      ratifier: setterRatifier,
      maxUnits: params.units,
      continuousFeeCap: params.continuousFeeCap,
    }),
  ]);
  await sendWrite(client, {
    account: maker,
    address: setterRatifier,
    abi: setterRatifierAbi,
    functionName: "setIsRootRatified",
    args: [maker, tree.root, true],
  });

  const item = SetterRatifierUtils.ratify({ tree })[0];
  if (!item) throw new Error("expected a ratified offer");

  return {
    units: params.units,
    offer: OfferUtils.toStruct({ offer: item.offer }),
    ratifierData: item.ratifierData,
  };
};

const entity = (client: AnvilTestClient<typeof base>) =>
  client.extend(morphoViemExtension()).morpho.midnight(base.id);

const deadline = () => Time.timestamp() + 600n;

/** Lender = client.account takes a maker's SELL offer through entity takeLend. */
const lend = async (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly market: MarketFixture;
  readonly units: bigint;
  readonly lender?: Address;
  readonly maker?: Address;
  readonly continuousFeeCap?: bigint;
  readonly expiry?: bigint;
}) => {
  const { client, market, units } = params;
  const options = params;
  const lender = options.lender ?? client.account.address;
  await client.setBalance({ address: lender, value: parseEther("1") });
  await installTestOracle({
    client,
    address: market.oracle,
    price: market.oraclePrice,
  });
  await client.deal({
    erc20: market.loanToken,
    account: lender,
    amount: units,
  });
  const takeableOffer = await prepareTakeableOffer({
    client,
    market,
    buy: false,
    units: 2n * units,
    maker: options.maker,
    continuousFeeCap: options.continuousFeeCap ?? maxUint256,
    expiry: options.expiry,
  });
  const lendOut = entity(client).takeLend({
    marketData: market.marketData,
    accountAddress: lender,
    target: { type: "units", units, maxBuyerAssets: units },
    takeableOffers: [takeableOffer],
    maxContinuousFee: maxUint256,
    deadline: deadline(),
  });
  const requirements = await lendOut.getRequirements();
  for (const requirement of requirements) {
    if (!("to" in requirement)) {
      throw new Error("expected an onchain call requirement");
    }
    // Requirements belong to the lender (approvals/authorizations are
    // owner-scoped): impersonate them so onBehalf matches msg.sender.
    await send(client, {
      ...(requirement as Parameters<typeof client.sendTransaction>[0]),
      account: lender,
    });
  }
  await send(client, { ...lendOut.buildTx(), account: lender });
};

const repay = async (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly market: MarketFixture;
  readonly units: bigint;
  readonly payer?: Address;
}) => {
  const { client, market, units } = params;
  const payer = params.payer ?? offerMaker;
  await client.deal({ erc20: market.loanToken, account: payer, amount: units });
  await sendWrite(client, {
    account: payer,
    address: market.loanToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, units],
  });
  await sendWrite(client, {
    account: payer,
    address: midnight,
    abi: midnightAbi,
    functionName: "repay",
    args: [
      MarketUtils.toStruct(market.params),
      units,
      payer,
      zeroAddress,
      "0x",
    ],
  });
};

const read = (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly market: MarketFixture;
  readonly functionName: "credit" | "debt" | "pendingFee";
  readonly user: Address;
}) =>
  params.client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: params.functionName,
    args: [params.market.id, params.user],
  });

const readWithdrawable = (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly market: MarketFixture;
}) =>
  params.client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "withdrawable",
    args: [params.market.id],
  });

const travelTo = async (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly timestamp: bigint;
}) => {
  await params.client.setNextBlockTimestamp({ timestamp: params.timestamp });
  await params.client.mine({ blocks: 1 });
};

const setMaxContinuousFee = async (client: AnvilTestClient<typeof base>) => {
  const feeSetter = await client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "feeSetter",
  });
  await client.setBalance({ address: feeSetter, value: parseEther("1") });
  await sendWrite(client, {
    account: feeSetter,
    address: midnight,
    abi: midnightAbi,
    functionName: "setDefaultContinuousFee",
    args: [usdc, MAX_CONTINUOUS_FEE],
  });
};

/** Lends 1 USDC that is repaid, then 10 USDC to a borrower whose bad debt is realized. */
const realizeBadDebt = async (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly market: MarketFixture;
}) => {
  const { client, market } = params;
  const amount = parseUnits("1", 6);
  await lend({ client, market, units: amount, maker: offerMaker });
  await repay({ client, market, units: amount });
  await lend({
    client,
    market,
    units: parseUnits("10", 6),
    lender: lender2,
    maker: offerMaker2,
  });
  await installTestOracle({ client, address: market.oracle, price: 1n });
  await sendWrite(client, {
    account: client.account.address,
    address: midnight,
    abi: midnightAbi,
    functionName: "liquidate",
    args: [
      MarketUtils.toStruct(market.params),
      0n,
      0n,
      0n,
      offerMaker2,
      false,
      client.account.address,
      zeroAddress,
      "0x",
    ],
  });
  const lossFactor = await client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "lossFactor",
    args: [market.id],
  });
  expect(lossFactor).toBeGreaterThan(0n);
};

describe("Midnight credit checks on accrued position state (Base fork)", () => {
  test("[INV-07] redeem rejects stored credit after continuous fees accrue, and the default face value lands", async ({
    client,
  }) => {
    const market = M_FEE();
    const amount = parseUnits("100", 6);
    const accountAddress = client.account.address;
    await setMaxContinuousFee(client);
    await lend({ client, market, units: amount });
    await repay({ client, market, units: amount });
    const positionData = await entity(client).getPositionData({
      marketId: market.id,
      accountAddress,
    });
    expect(positionData.pendingFee).toBeGreaterThan(0n);
    const { timestamp } = await client.getBlock();
    await travelTo({ client, timestamp: timestamp + 86_400n });

    // Stored credit includes fees Midnight charges before the withdrawal: Panic(0x11) on main.
    expect(() =>
      entity(client).redeem({
        accountAddress,
        positionData,
        units: positionData.credit,
      }),
    ).toThrow(MidnightRedeemExceedsCreditError);

    await send(
      client,
      entity(client).redeem({ accountAddress, positionData }).buildTx(),
    );
    const creditAfter = await read({
      client,
      market,
      functionName: "credit",
      user: accountAddress,
    });
    expect(creditAfter).toBeLessThan(
      positionData.credit - positionData.faceValue,
    );
  }, 300_000);

  test("[INV-07] redeem rejects stored credit after bad debt is realized, and the default face value lands", async ({
    client,
  }) => {
    const market = M_LOSS();
    const accountAddress = client.account.address;
    await realizeBadDebt({ client, market });
    const positionData = await entity(client).getPositionData({
      marketId: market.id,
      accountAddress,
    });
    const withdrawable = await readWithdrawable({ client, market });
    expect(withdrawable).toBeGreaterThanOrEqual(positionData.credit);

    // Stored credit predates the loss factor slash: Panic(0x11) on main.
    expect(() =>
      entity(client).redeem({
        accountAddress,
        positionData,
        units: positionData.credit,
      }),
    ).toThrow(MidnightRedeemExceedsCreditError);

    await send(
      client,
      entity(client).redeem({ accountAddress, positionData }).buildTx(),
    );
    const creditAfter = await read({
      client,
      market,
      functionName: "credit",
      user: accountAddress,
    });
    expect(creditAfter).toBe(0n);
  }, 300_000);
});
