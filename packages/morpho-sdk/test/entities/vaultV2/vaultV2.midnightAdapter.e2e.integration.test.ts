import {
  AccrualVaultV2MidnightAdapter,
  ChainId,
  getChainAddress,
  MathLib,
  ORACLE_PRICE_SCALE,
  VaultV2MidnightAdapter,
} from "@morpho-org/blue-sdk";
import {
  fetchAccrualVaultV2,
  fetchAccrualVaultV2Adapter,
  midnightAdapterAbi,
  vaultV2Abi,
} from "@morpho-org/blue-sdk-viem";
import {
  DEFAULT_TICK_SPACING,
  MAX_TICK,
  MarketUtils,
  MarketParams as MidnightMarketParams,
  midnightAbi,
  Offer,
  OfferUtils,
  SetterRatifierUtils,
  setterRatifierAbi,
  TickLib,
  Tree,
} from "@morpho-org/midnight-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import {
  advanceVaultV2MidnightFixtureTime,
  BASE_MIDNIGHT_FORK_BLOCK_NUMBER,
  createVaultV2MidnightAdapterFixture,
  takeVaultV2MidnightAdapterOffer,
  testAccount,
} from "@morpho-org/test/fixtures";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  type Hash,
  type Hex,
  type LocalAccount,
  maxUint64,
  padHex,
  parseEther,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import { submitAndAcceptVaultV2Call } from "../../helpers/vaultV2.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_MIDNIGHT_FORK_BLOCK_NUMBER,
  redactForkUrl: true,
});

type TestClient = AnvilTestClient<typeof base>;

const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const oracle = "0x0000000000000000000000000000000000080000";
const offerTuple = midnightAbi.find(
  (item) => item.type === "function" && item.name === "take",
)?.inputs[0];
const COLLATERAL = parseEther("10");
const UNITS = parseUnits("1", 6);
const TICK = 5_000n;

const midnightMarket = (maturity: bigint) =>
  new MidnightMarketParams({
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
    maturity,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  });

const setOraclePrice = async (client: TestClient, price: bigint) => {
  await client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(price), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
};

const takeOffer = async (params: {
  client: TestClient;
  adapter: Address;
  maker: LocalAccount;
  offer: Offer;
  units: bigint;
}) => {
  const { client, adapter, maker, offer, units } = params;
  const tree = Tree.create([offer]);
  await client.writeContract({
    account: maker,
    address: setterRatifier,
    abi: setterRatifierAbi,
    functionName: "setIsRootRatified",
    args: [maker.address, tree.root, true],
  });
  const item = SetterRatifierUtils.ratify({ tree })[0];
  if (item === undefined) throw new Error("Expected a ratified offer");
  await takeVaultV2MidnightAdapterOffer({
    client,
    adapter,
    args: [
      OfferUtils.toStruct({ offer: item.offer }),
      item.ratifierData,
      units,
      "0x",
    ],
  });
};

/** Collateralizes `maker` on `market` and authorizes the setter ratifier. */
const collateralize = async (params: {
  client: TestClient;
  maker: LocalAccount;
  market: MidnightMarketParams;
}) => {
  const { client, maker, market } = params;
  await client.setBalance({
    address: maker.address,
    value: parseEther("1"),
  });
  await client.deal({
    erc20: wNative,
    account: maker.address,
    amount: COLLATERAL,
  });
  await client.writeContract({
    account: maker,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, COLLATERAL],
  });
  await client.writeContract({
    account: maker,
    address: midnight,
    abi: midnightAbi,
    functionName: "supplyCollateral",
    args: [MarketUtils.toStruct(market), 0n, COLLATERAL, maker.address],
  });
  await client.writeContract({
    account: maker,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [setterRatifier, true, maker.address],
  });
};

/** Funds `lender` with enough `usdc` to buy `units` of credit at par. */
const fundLender = async (params: {
  client: TestClient;
  lender: LocalAccount;
  units: bigint;
}) => {
  const { client, lender, units } = params;
  await client.setBalance({
    address: lender.address,
    value: parseEther("1"),
  });
  await client.deal({ erc20: usdc, account: lender.address, amount: units });
  await client.writeContract({
    account: lender,
    address: usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, units],
  });
  await client.writeContract({
    account: lender,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [setterRatifier, true, lender.address],
  });
};

const sellOffer = (params: {
  maker: LocalAccount;
  market: MidnightMarketParams;
  units: bigint;
  tick?: bigint;
}) =>
  Offer.create({
    market: params.market,
    buy: false,
    maker: params.maker.address,
    expiry: params.market.maturity,
    tick: params.tick ?? TICK,
    ratifier: setterRatifier,
    maxUnits: params.units,
  });

const buyOffer = (params: {
  lender: LocalAccount;
  market: MidnightMarketParams;
  units: bigint;
  tick: bigint;
}) =>
  Offer.create({
    market: params.market,
    buy: true,
    maker: params.lender.address,
    expiry: params.market.maturity,
    tick: params.tick,
    ratifier: setterRatifier,
    maxUnits: params.units,
    receiverIfMakerIsSeller: zeroAddress,
  });

/** Curator submits then accepts an adapter call (all timelocks are zero here). */
const submitAndAcceptAdapterCall = async (params: {
  client: TestClient;
  adapter: Address;
  data: Hex;
}) => {
  const { client, adapter, data } = params;
  await client.writeContract({
    address: adapter,
    abi: midnightAdapterAbi,
    functionName: "submit",
    args: [data],
  });
  const hash = await client.sendTransaction({ to: adapter, data });
  await client.waitForTransactionReceipt({ hash });
};

const readMarketData = async (params: {
  client: TestClient;
  adapter: Address;
  marketId: Hash;
}) => {
  const [netCredit, rate, maturity, index, forceSellable] =
    await params.client.readContract({
      address: params.adapter,
      abi: midnightAdapterAbi,
      functionName: "marketData",
      args: [params.marketId],
    });
  return { netCredit, rate, maturity, index, forceSellable };
};

const fetchMidnightAdapter = async (client: TestClient, adapter: Address) => {
  const sdkAdapter = await fetchAccrualVaultV2Adapter(adapter, client);
  if (!(sdkAdapter instanceof AccrualVaultV2MidnightAdapter))
    throw new Error("Expected a Midnight accrual adapter");
  return sdkAdapter;
};

const depositToVault = async (params: {
  client: TestClient;
  vault: Address;
  assets: bigint;
}) => {
  const { client, vault, assets } = params;
  await client.deal({ erc20: usdc, amount: assets });
  await client.approve({ address: usdc, args: [vault, assets] });
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "deposit",
    args: [assets, client.account.address],
  });
};

/**
 * Asserts the SDK snapshot equals the on-chain adapter and vault state at the
 * current block: realAssets, market ids and stored market data, duration
 * allocations, config fields, per-cap-id vault allocations, and the accrued
 * vault totalAssets / previewRedeem after an on-chain `accrueInterest`.
 */
const expectAdapterMatchesChain = async (params: {
  client: TestClient;
  vault: Address;
  adapter: Address;
  markets: readonly MidnightMarketParams[];
}) => {
  const { client, vault, adapter, markets } = params;
  const timestamp = await client.timestamp();
  const [sdkDeployless, sdkMulticall] = await Promise.all([
    fetchAccrualVaultV2Adapter(adapter, client, { deployless: "force" }),
    fetchAccrualVaultV2Adapter(adapter, client, { deployless: false }),
  ]);
  const snapshots: AccrualVaultV2MidnightAdapter[] = [];
  for (const snapshot of [sdkDeployless, sdkMulticall]) {
    if (!(snapshot instanceof AccrualVaultV2MidnightAdapter))
      throw new Error("Expected a Midnight accrual adapter");
    snapshots.push(snapshot);
  }

  const onchainRealAssets = await client.readContract({
    address: adapter,
    abi: midnightAdapterAbi,
    functionName: "realAssets",
  });
  const marketIdsLength = await client.readContract({
    address: adapter,
    abi: midnightAdapterAbi,
    functionName: "marketIdsLength",
  });
  const onchainMarketIds: Hash[] = [];
  const onchainMarketData = new Map<
    Hash,
    Awaited<ReturnType<typeof readMarketData>>
  >();
  for (let i = 0; i < Number(marketIdsLength); i++) {
    const marketId = await client.readContract({
      address: adapter,
      abi: midnightAdapterAbi,
      functionName: "marketIds",
      args: [BigInt(i)],
    });
    onchainMarketIds.push(marketId);
    onchainMarketData.set(
      marketId,
      await readMarketData({ client, adapter, marketId }),
    );
  }
  const onchainDurationsLength = await client.readContract({
    address: adapter,
    abi: midnightAdapterAbi,
    functionName: "durationsLength",
  });
  const onchainDurations = await client.readContract({
    address: adapter,
    abi: midnightAdapterAbi,
    functionName: "durations",
  });
  expect(BigInt(onchainDurations.length)).toBe(onchainDurationsLength);
  const onchainDurationAllocations = await client.readContract({
    address: adapter,
    abi: midnightAdapterAbi,
    functionName: "durationAllocations",
    args: [onchainDurationsLength],
  });
  const onchainMinRate = await client.readContract({
    address: adapter,
    abi: midnightAdapterAbi,
    functionName: "minRate",
  });
  const onchainMaxTtm = await client.readContract({
    address: adapter,
    abi: midnightAdapterAbi,
    functionName: "maxTtm",
  });
  const onchainNoSalesWithShortfall = await client.readContract({
    address: adapter,
    abi: midnightAdapterAbi,
    functionName: "noSalesWithShortfall",
  });
  const onchainNoSalesBelowFaceValue = await client.readContract({
    address: adapter,
    abi: midnightAdapterAbi,
    functionName: "noSalesBelowFaceValue",
  });
  const onchainSkimRecipient = await client.readContract({
    address: adapter,
    abi: midnightAdapterAbi,
    functionName: "skimRecipient",
  });

  for (const sdkAdapter of snapshots) {
    expect(sdkAdapter.realAssets(timestamp)).toBe(onchainRealAssets);
    expect(BigInt(sdkAdapter.marketIds.length)).toBe(marketIdsLength);
    expect(sdkAdapter.marketIds).toEqual(onchainMarketIds);
    for (const marketId of onchainMarketIds) {
      const onchain = onchainMarketData.get(marketId)!;
      const stored = sdkAdapter.marketData[marketId];
      if (stored === undefined)
        throw new Error(`Missing SDK marketData for ${marketId}`);
      expect(stored.netCredit).toBe(onchain.netCredit);
      expect(stored.rate).toBe(onchain.rate);
      expect(stored.maturity).toBe(BigInt(onchain.maturity));
      expect(stored.index).toBe(BigInt(onchain.index));
      expect(stored.forceSellable).toBe(onchain.forceSellable);
    }
    expect([...sdkAdapter.durations]).toEqual([...onchainDurations]);
    expect([...sdkAdapter.durationAllocations]).toEqual([
      ...onchainDurationAllocations,
    ]);
    expect(sdkAdapter.minRate).toBe(BigInt(onchainMinRate));
    expect(sdkAdapter.maxTtm).toBe(BigInt(onchainMaxTtm));
    expect(sdkAdapter.noSalesWithShortfall).toBe(onchainNoSalesWithShortfall);
    expect(sdkAdapter.noSalesBelowFaceValue).toBe(onchainNoSalesBelowFaceValue);
    expect(sdkAdapter.skimRecipient).toBe(onchainSkimRecipient);

    // Each cap id reported by `ids(market)` accumulates the net credit deltas
    // of every market that references it; duration ids are enforced by the
    // adapter itself and never reach `vault.allocation`.
    const expectedAllocations = new Map<Hash, bigint>();
    for (const market of markets) {
      const onchainIds = await client.readContract({
        address: adapter,
        abi: midnightAdapterAbi,
        functionName: "ids",
        args: [MarketUtils.toStruct(market)],
      });
      expect([...sdkAdapter.ids(market)]).toEqual([...onchainIds]);
      const netCredit =
        sdkAdapter.marketData[MarketUtils.toId(market)]?.netCredit ?? 0n;
      for (const id of onchainIds) {
        expectedAllocations.set(
          id,
          (expectedAllocations.get(id) ?? 0n) + netCredit,
        );
      }
    }
    for (const [id, expected] of expectedAllocations) {
      const allocation = await client.readContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "allocation",
        args: [id],
      });
      expect(allocation).toBe(expected);
    }
  }
  expect(snapshots[1]).toStrictEqual(snapshots[0]);

  const [sdkVault, sdkVaultFallback] = await Promise.all([
    fetchAccrualVaultV2(vault, client, { deployless: "force" }),
    fetchAccrualVaultV2(vault, client, { deployless: false }),
  ]);
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "accrueInterest",
  });
  const { timestamp: accrualTimestamp } = await client.getBlock();
  const accruedDeployless = sdkVault.accrueInterest(accrualTimestamp).vault;
  const accruedDirect = sdkVaultFallback.accrueInterest(accrualTimestamp).vault;
  const onchainTotalAssets = await client.readContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "totalAssets",
  });
  const probeShares = accruedDeployless.totalSupply / 2n;
  expect(probeShares).toBeGreaterThan(0n);
  const onchainPreviewRedeem = await client.readContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "previewRedeem",
    args: [probeShares],
  });
  for (const accrued of [accruedDeployless, accruedDirect]) {
    expect(accrued._totalAssets).toBe(onchainTotalAssets);
    expect(accrued.toAssets(probeShares)).toBe(onchainPreviewRedeem);
  }
  expect(accruedDirect).toStrictEqual(accruedDeployless);
  const accruedVault = accruedDeployless;

  return { sdkAdapter: snapshots[0]!, accruedVault };
};

describe("Vault V2 Midnight adapter on-chain parity on Base", () => {
  test("buys credit on three markets with different maturities", async ({
    client,
  }) => {
    const timestamp = await client.timestamp();
    const markets = [
      midnightMarket(timestamp + Time.s.from.d(2n)),
      midnightMarket(timestamp + Time.s.from.d(10n)),
      midnightMarket(timestamp + Time.s.from.d(40n)),
    ];
    const { vault, adapters } = await createVaultV2MidnightAdapterFixture({
      client,
      asset: usdc,
      salts: [padHex(toHex(11n), { size: 32 })],
      markets,
    });
    const adapter = adapters[0]!.address;
    await setOraclePrice(client, ORACLE_PRICE_SCALE);
    await depositToVault({ client, vault, assets: parseUnits("10", 6) });

    const borrowers = [testAccount(1), testAccount(2), testAccount(3)];
    for (const [i, market] of markets.entries()) {
      const borrower = borrowers[i]!;
      await collateralize({ client, maker: borrower, market });
      await takeOffer({
        client,
        adapter,
        maker: borrower,
        offer: sellOffer({ maker: borrower, market, units: UNITS }),
        units: UNITS,
      });
      const { sdkAdapter } = await expectAdapterMatchesChain({
        client,
        vault,
        adapter,
        markets,
      });
      expect(sdkAdapter.marketIds).toHaveLength(i + 1);
      expect(sdkAdapter.marketData[MarketUtils.toId(market)]!.index).toBe(
        BigInt(i),
      );
    }

    // Cumulative duration totals: a market counts toward every duration
    // threshold at or below its remaining time to maturity.
    const sdkAdapter = await fetchMidnightAdapter(client, adapter);
    const now = await client.timestamp();
    for (const [i, duration] of sdkAdapter.durations.entries()) {
      const expected = markets
        .filter((market) => market.maturity - now >= duration)
        .reduce(
          (total, market) =>
            total + sdkAdapter.marketData[MarketUtils.toId(market)]!.netCredit,
          0n,
        );
      expect(sdkAdapter.durationAllocations[i]).toBe(expected);
    }
  });

  test("stays consistent before, mid-life and past maturity", async ({
    client,
  }) => {
    const timestamp = await client.timestamp();
    const market = midnightMarket(timestamp + Time.s.from.d(10n));
    const { vault, adapters } = await createVaultV2MidnightAdapterFixture({
      client,
      asset: usdc,
      salts: [padHex(toHex(21n), { size: 32 })],
      markets: [market],
    });
    const adapter = adapters[0]!.address;
    await setOraclePrice(client, ORACLE_PRICE_SCALE);
    await depositToVault({ client, vault, assets: parseUnits("10", 6) });
    const borrower = testAccount(4);
    await collateralize({ client, maker: borrower, market });
    await takeOffer({
      client,
      adapter,
      maker: borrower,
      offer: sellOffer({ maker: borrower, market, units: UNITS }),
      units: UNITS,
    });

    await expectAdapterMatchesChain({
      client,
      vault,
      adapter,
      markets: [market],
    });
    await advanceVaultV2MidnightFixtureTime({
      client,
      seconds: Time.s.from.d(5n),
    });
    await expectAdapterMatchesChain({
      client,
      vault,
      adapter,
      markets: [market],
    });
    await advanceVaultV2MidnightFixtureTime({
      client,
      seconds: Time.s.from.d(6n),
    });
    await expectAdapterMatchesChain({
      client,
      vault,
      adapter,
      markets: [market],
    });
  });

  test("sells credit partially then fully on the middle market", async ({
    client,
  }) => {
    const timestamp = await client.timestamp();
    const markets = [
      midnightMarket(timestamp + Time.s.from.d(2n)),
      midnightMarket(timestamp + Time.s.from.d(10n)),
      midnightMarket(timestamp + Time.s.from.d(40n)),
    ];
    const { vault, adapters } = await createVaultV2MidnightAdapterFixture({
      client,
      asset: usdc,
      salts: [padHex(toHex(31n), { size: 32 })],
      markets,
    });
    const adapter = adapters[0]!.address;
    await setOraclePrice(client, ORACLE_PRICE_SCALE);
    await depositToVault({ client, vault, assets: parseUnits("10", 6) });

    const borrowers = [testAccount(1), testAccount(2), testAccount(3)];
    for (const [i, market] of markets.entries()) {
      const borrower = borrowers[i]!;
      await collateralize({ client, maker: borrower, market });
      await takeOffer({
        client,
        adapter,
        maker: borrower,
        offer: sellOffer({ maker: borrower, market, units: UNITS }),
        units: UNITS,
      });
    }
    await expectAdapterMatchesChain({ client, vault, adapter, markets });

    const middleId = MarketUtils.toId(markets[1]!);
    const middleData = await readMarketData({
      client,
      adapter,
      marketId: middleId,
    });
    const lender = testAccount(10);
    await fundLender({ client, lender, units: middleData.netCredit });

    // Partial sale at par: the market stays listed with a reduced net credit.
    const partialUnits = middleData.netCredit / 2n;
    await takeOffer({
      client,
      adapter,
      maker: lender,
      offer: buyOffer({
        lender,
        market: markets[1]!,
        units: middleData.netCredit,
        tick: MAX_TICK,
      }),
      units: partialUnits,
    });
    const { sdkAdapter } = await expectAdapterMatchesChain({
      client,
      vault,
      adapter,
      markets,
    });
    expect(sdkAdapter.marketIds).toContain(middleId);
    const afterPartial = await readMarketData({
      client,
      adapter,
      marketId: middleId,
    });
    // The sale decreases net credit by `soldCredit - sellPendingFeeDecrease`.
    // The pending fee stays zero while the market's continuous fee is zero, so
    // the decrease is exactly the sold units.
    const continuousFee = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "continuousFee",
      args: [middleId],
    });
    expect(continuousFee).toBe(0);
    expect(afterPartial.netCredit).toBe(middleData.netCredit - partialUnits);

    // Full sale of the remaining credit: the middle market is removed and the
    // last market's index backpointer is swapped into the freed slot.
    const remaining = afterPartial.netCredit;
    await takeOffer({
      client,
      adapter,
      maker: lender,
      offer: buyOffer({
        lender,
        market: markets[1]!,
        units: remaining,
        tick: MAX_TICK,
      }),
      units: remaining,
    });
    const { sdkAdapter: sdkAfter } = await expectAdapterMatchesChain({
      client,
      vault,
      adapter,
      markets,
    });
    expect(sdkAfter.marketIds).not.toContain(middleId);
    expect(sdkAfter.marketIds).toHaveLength(2);
    const movedId = MarketUtils.toId(markets[2]!);
    const movedData = await readMarketData({
      client,
      adapter,
      marketId: movedId,
    });
    expect(movedData.index).toBe(1);
    expect(sdkAfter.marketData[movedId]?.index).toBe(1n);
    expect(sdkAfter.marketIds[1]).toBe(movedId);
  });

  test("a loss sale below the amortized value lowers the stored rate", async ({
    client,
  }) => {
    const timestamp = await client.timestamp();
    const market = midnightMarket(timestamp + Time.s.from.d(30n));
    const { vault, adapters } = await createVaultV2MidnightAdapterFixture({
      client,
      asset: usdc,
      salts: [padHex(toHex(41n), { size: 32 })],
      markets: [market],
    });
    const adapter = adapters[0]!.address;
    await setOraclePrice(client, ORACLE_PRICE_SCALE);
    await depositToVault({ client, vault, assets: parseUnits("10", 6) });
    const borrower = testAccount(5);
    await collateralize({ client, maker: borrower, market });
    // Buy at a modest discount so the stored rate is positive yet a 0.9 sale
    // still leaves an absorbable shortfall.
    await takeOffer({
      client,
      adapter,
      maker: borrower,
      offer: sellOffer({
        maker: borrower,
        market,
        units: UNITS,
        tick: TickLib.priceToTick(920_000_000_000_000_000n),
      }),
      units: UNITS,
    });
    const marketId = MarketUtils.toId(market);
    const before = await readMarketData({ client, adapter, marketId });
    expect(before.rate).toBeGreaterThan(0n);

    const lender = testAccount(11);
    await fundLender({ client, lender, units: before.netCredit });
    const discountedTick = TickLib.priceToTick(
      900_000_000_000_000_000n,
      DEFAULT_TICK_SPACING,
    );
    await takeOffer({
      client,
      adapter,
      maker: lender,
      offer: buyOffer({
        lender,
        market,
        units: before.netCredit,
        tick: discountedTick,
      }),
      units: before.netCredit / 4n,
    });

    const after = await readMarketData({ client, adapter, marketId });
    expect(after.rate).toBeLessThan(before.rate);
    const { sdkAdapter } = await expectAdapterMatchesChain({
      client,
      vault,
      adapter,
      markets: [market],
    });
    expect(sdkAdapter.marketData[marketId]?.rate).toBe(after.rate);
  });

  test("repays the borrower then withdrawToVault returns credit to idle", async ({
    client,
  }) => {
    const timestamp = await client.timestamp();
    const market = midnightMarket(timestamp + Time.s.from.d(30n));
    const { vault, adapters } = await createVaultV2MidnightAdapterFixture({
      client,
      asset: usdc,
      salts: [padHex(toHex(51n), { size: 32 })],
      markets: [market],
    });
    const adapter = adapters[0]!.address;
    await setOraclePrice(client, ORACLE_PRICE_SCALE);
    await depositToVault({ client, vault, assets: parseUnits("10", 6) });
    const borrower = testAccount(6);
    await collateralize({ client, maker: borrower, market });
    await takeOffer({
      client,
      adapter,
      maker: borrower,
      offer: sellOffer({ maker: borrower, market, units: UNITS }),
      units: UNITS,
    });
    const marketId = MarketUtils.toId(market);

    // The borrower repays its full debt, making the credit withdrawable.
    const debt = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "debt",
      args: [marketId, borrower.address],
    });
    await client.setBalance({
      address: borrower.address,
      value: parseEther("1"),
    });
    await client.deal({ erc20: usdc, account: borrower.address, amount: debt });
    await client.writeContract({
      account: borrower,
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, debt],
    });
    await client.writeContract({
      account: borrower,
      address: midnight,
      abi: midnightAbi,
      functionName: "repay",
      args: [
        MarketUtils.toStruct(market),
        debt,
        borrower.address,
        zeroAddress,
        "0x",
      ],
    });
    await expectAdapterMatchesChain({
      client,
      vault,
      adapter,
      markets: [market],
    });

    const idleBefore = await client.readContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [vault],
    });
    const stored = await readMarketData({ client, adapter, marketId });
    await client.writeContract({
      address: adapter,
      abi: midnightAdapterAbi,
      functionName: "withdrawToVault",
      args: [MarketUtils.toStruct(market), stored.netCredit],
    });
    const { sdkAdapter } = await expectAdapterMatchesChain({
      client,
      vault,
      adapter,
      markets: [market],
    });
    expect(sdkAdapter.marketIds).toHaveLength(0);
    const idleAfter = await client.readContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [vault],
    });
    expect(idleAfter).toBeGreaterThan(idleBefore);
    expect(idleAfter - idleBefore).toBe(stored.netCredit);
  });

  test("forceDeallocate through a buy offer pays face assets plus penalty shares", async ({
    client,
  }) => {
    const timestamp = await client.timestamp();
    const market = midnightMarket(timestamp + Time.s.from.d(30n));
    const { vault, adapters } = await createVaultV2MidnightAdapterFixture({
      client,
      asset: usdc,
      salts: [padHex(toHex(61n), { size: 32 })],
      markets: [market],
    });
    const adapter = adapters[0]!.address;
    await setOraclePrice(client, ORACLE_PRICE_SCALE);
    await depositToVault({ client, vault, assets: parseUnits("10", 6) });
    const borrower = testAccount(7);
    await collateralize({ client, maker: borrower, market });
    await takeOffer({
      client,
      adapter,
      maker: borrower,
      offer: sellOffer({ maker: borrower, market, units: UNITS }),
      units: UNITS,
    });
    const marketId = MarketUtils.toId(market);

    await submitAndAcceptVaultV2Call(client as AnvilTestClient, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "setForceDeallocatePenalty",
        args: [adapter, MathLib.WAD / 50n],
      }),
    });

    const stored = await readMarketData({ client, adapter, marketId });
    const assets = stored.netCredit / 2n;
    const lender = testAccount(12);
    await fundLender({ client, lender, units: stored.netCredit });
    const offer = buyOffer({
      lender,
      market,
      units: stored.netCredit,
      tick: TickLib.priceToTick(990_000_000_000_000_000n),
    });
    const tree = Tree.create([offer]);
    await client.writeContract({
      account: lender,
      address: setterRatifier,
      abi: setterRatifierAbi,
      functionName: "setIsRootRatified",
      args: [lender.address, tree.root, true],
    });
    const item = SetterRatifierUtils.ratify({ tree })[0];
    if (item === undefined) throw new Error("Expected a ratified offer");

    // The caller pays `assets` face to the adapter and burns penalty shares.
    const forceDeallocateCaller = testAccount(16);
    await client.setBalance({
      address: forceDeallocateCaller.address,
      value: parseEther("1"),
    });
    const sharesToTransfer = await client.balanceOf({ erc20: vault });
    expect(sharesToTransfer).toBeGreaterThan(0n);
    await client.writeContract({
      account: client.account,
      address: vault,
      abi: erc20Abi,
      functionName: "transfer",
      args: [forceDeallocateCaller.address, sharesToTransfer],
    });
    await client.deal({
      erc20: usdc,
      account: forceDeallocateCaller.address,
      amount: assets,
    });
    await client.approve({
      account: forceDeallocateCaller,
      address: usdc,
      args: [adapter, assets],
    });
    const [owner, curator, isAllocator] = await Promise.all([
      client.readContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "owner",
      }),
      client.readContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "curator",
      }),
      client.readContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "isAllocator",
        args: [forceDeallocateCaller.address],
      }),
    ]);
    expect(owner).not.toBe(forceDeallocateCaller.address);
    expect(curator).not.toBe(forceDeallocateCaller.address);
    expect(isAllocator).toBe(false);
    const sharesBefore = await client.balanceOf({
      erc20: vault,
      owner: forceDeallocateCaller.address,
    });
    const usdcBefore = await client.balanceOf({
      erc20: usdc,
      owner: forceDeallocateCaller.address,
    });
    if (offerTuple === undefined)
      throw new Error("Expected a take offer tuple");
    const forceDeallocateArgs = [
      adapter,
      encodeAbiParameters(
        [offerTuple, { type: "bytes" }],
        [OfferUtils.toStruct({ offer: item.offer }), item.ratifierData],
      ),
      assets,
      forceDeallocateCaller.address,
    ] as const;
    // The caller receives `sellerAssets` from the take and pays face `assets`.
    const blockTimestamp = (await client.getBlock()).timestamp + 1n;
    await client.setNextBlockTimestamp({ timestamp: blockTimestamp });
    const settlementFee = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "settlementFee",
      args: [marketId, market.maturity - blockTimestamp],
    });
    const proceeds = MathLib.mulDivDown(
      assets,
      TickLib.tickToPrice(offer.tick) - settlementFee,
      MathLib.WAD,
    );
    // forceDeallocate withdraws `penaltyAssets = assets * penalty / WAD` (up)
    // from the caller; the conversion uses the vault accrued at the same
    // timestamp before the sale, which the SDK reproduces from the pre-tx
    // snapshot.
    const penalty = await client.readContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "forceDeallocatePenalty",
      args: [adapter],
    });
    expect(penalty).toBe(MathLib.WAD / 50n);
    const penaltyAssets = MathLib.mulDivUp(assets, penalty, MathLib.WAD);
    const sdkVault = await fetchAccrualVaultV2(vault, client, {
      deployless: "force",
    });
    const expectedPenaltyShares = sdkVault
      .accrueInterest(blockTimestamp)
      .vault.toShares(penaltyAssets, "Up");
    await client.writeContract({
      account: forceDeallocateCaller,
      address: vault,
      abi: vaultV2Abi,
      functionName: "forceDeallocate",
      args: forceDeallocateArgs,
    });

    const { sdkAdapter } = await expectAdapterMatchesChain({
      client,
      vault,
      adapter,
      markets: [market],
    });
    expect(sdkAdapter.marketData[marketId]?.netCredit).toBe(
      stored.netCredit - assets,
    );
    // Penalty shares were burned from the caller; the vault keeps the assets.
    const penaltyShares =
      sharesBefore -
      (await client.balanceOf({
        erc20: vault,
        owner: forceDeallocateCaller.address,
      }));
    expect(penaltyShares).toBe(expectedPenaltyShares);
    // The caller paid face `assets` and received the `proceeds` of the take.
    const spent =
      usdcBefore -
      (await client.balanceOf({
        erc20: usdc,
        owner: forceDeallocateCaller.address,
      }));
    expect(spent).toBe(assets - proceeds);
  });

  test("config setters are reflected and their guards revert", async ({
    client,
  }) => {
    const timestamp = await client.timestamp();
    const market = midnightMarket(timestamp + Time.s.from.d(30n));
    const marketShort = midnightMarket(timestamp + Time.s.from.d(2n));
    const { vault, adapters } = await createVaultV2MidnightAdapterFixture({
      client,
      asset: usdc,
      salts: [padHex(toHex(71n), { size: 32 })],
      markets: [market, marketShort],
    });
    const adapter = adapters[0]!.address;
    await setOraclePrice(client, ORACLE_PRICE_SCALE);
    await depositToVault({ client, vault, assets: parseUnits("10", 6) });
    const borrower = testAccount(8);
    await collateralize({ client, maker: borrower, market });
    await collateralize({ client, maker: borrower, market: marketShort });
    await takeOffer({
      client,
      adapter,
      maker: borrower,
      offer: sellOffer({ maker: borrower, market, units: UNITS }),
      units: UNITS,
    });
    const marketId = MarketUtils.toId(market);
    const markets = [market, marketShort];

    await submitAndAcceptAdapterCall({
      client,
      adapter,
      data: encodeFunctionData({
        abi: midnightAdapterAbi,
        functionName: "setMinRate",
        args: [1_000n],
      }),
    });
    expect((await fetchMidnightAdapter(client, adapter)).minRate).toBe(1_000n);
    await submitAndAcceptAdapterCall({
      client,
      adapter,
      data: encodeFunctionData({
        abi: midnightAdapterAbi,
        functionName: "setNoSalesWithShortfall",
        args: [true],
      }),
    });
    expect(
      (await fetchMidnightAdapter(client, adapter)).noSalesWithShortfall,
    ).toBe(true);
    await submitAndAcceptAdapterCall({
      client,
      adapter,
      data: encodeFunctionData({
        abi: midnightAdapterAbi,
        functionName: "setNoSalesBelowFaceValue",
        args: [true],
      }),
    });
    expect(
      (await fetchMidnightAdapter(client, adapter)).noSalesBelowFaceValue,
    ).toBe(true);
    await submitAndAcceptAdapterCall({
      client,
      adapter,
      data: encodeFunctionData({
        abi: midnightAdapterAbi,
        functionName: "setSkimRecipient",
        args: [testAccount(20).address],
      }),
    });
    expect((await fetchMidnightAdapter(client, adapter)).skimRecipient).toBe(
      testAccount(20).address,
    );
    await expectAdapterMatchesChain({ client, vault, adapter, markets });

    // Sales below face value are rejected while `noSalesBelowFaceValue` holds.
    const lender = testAccount(13);
    await fundLender({ client, lender, units: UNITS });
    const belowFaceOffer = buyOffer({
      lender,
      market,
      units: UNITS,
      tick: TickLib.priceToTick(500_000_000_000_000_000n, DEFAULT_TICK_SPACING),
    });
    await expect(
      takeOffer({
        client,
        adapter,
        maker: lender,
        offer: belowFaceOffer,
        units: UNITS / 10n,
      }),
    ).rejects.toThrow("SaleBelowFaceValue");

    // With `noSalesBelowFaceValue` cleared, the same below-amortized sale hits
    // the `noSalesWithShortfall` guard instead.
    await client.writeContract({
      address: adapter,
      abi: midnightAdapterAbi,
      functionName: "setNoSalesBelowFaceValue",
      args: [false],
    });
    await expect(
      takeOffer({
        client,
        adapter,
        maker: lender,
        offer: belowFaceOffer,
        units: UNITS / 10n,
      }),
    ).rejects.toThrow("ShortfallTooHigh");
    await client.writeContract({
      address: adapter,
      abi: midnightAdapterAbi,
      functionName: "setNoSalesBelowFaceValue",
      args: [true],
    });

    await submitAndAcceptAdapterCall({
      client,
      adapter,
      data: encodeFunctionData({
        abi: midnightAdapterAbi,
        functionName: "setForceSellable",
        args: [marketId],
      }),
    });
    expect(
      (await fetchMidnightAdapter(client, adapter)).marketData[marketId]
        ?.forceSellable,
    ).toBe(true);

    // Buying on a forceSellable market is rejected. `maxUnits` differs from
    // the consumed offer so this is a fresh, ratified offer.
    await expect(
      takeOffer({
        client,
        adapter,
        maker: borrower,
        offer: sellOffer({ maker: borrower, market, units: UNITS + 1n }),
        units: UNITS,
      }),
    ).rejects.toThrow("UnauthorizedBuy");

    // A buy whose implied rate is below `minRate` is rejected.
    await client.writeContract({
      address: adapter,
      abi: midnightAdapterAbi,
      functionName: "setMinRate",
      args: [maxUint64],
    });
    await expect(
      takeOffer({
        client,
        adapter,
        maker: borrower,
        offer: sellOffer({
          maker: borrower,
          market: marketShort,
          units: UNITS,
        }),
        units: UNITS,
      }),
    ).rejects.toThrow("BuyRateTooLow");
    await client.writeContract({
      address: adapter,
      abi: midnightAdapterAbi,
      functionName: "setMinRate",
      args: [0n],
    });

    // maxTtm is checked before the other guards, so it is lowered last.
    await submitAndAcceptAdapterCall({
      client,
      adapter,
      data: encodeFunctionData({
        abi: midnightAdapterAbi,
        functionName: "setMaxTtm",
        args: [Time.s.from.d(20n)],
      }),
    });
    expect((await fetchMidnightAdapter(client, adapter)).maxTtm).toBe(
      Time.s.from.d(20n),
    );

    // A fresh buy on the 30-day market now exceeds the 20-day maxTtm.
    await expect(
      takeOffer({
        client,
        adapter,
        maker: borrower,
        offer: sellOffer({ maker: borrower, market, units: UNITS + 2n }),
        units: UNITS,
      }),
    ).rejects.toThrow("BuyTtmTooHigh");
    await expectAdapterMatchesChain({ client, vault, adapter, markets });
  });

  test("a duration absolute cap reverts oversized buys but not shorter ones", async ({
    client,
  }) => {
    const timestamp = await client.timestamp();
    const marketLong = midnightMarket(timestamp + Time.s.from.d(10n));
    const marketLong2 = midnightMarket(timestamp + Time.s.from.d(11n));
    const marketShort = midnightMarket(timestamp + Time.s.from.h(1n));
    const markets = [marketLong, marketLong2, marketShort];
    const { vault, adapters, durations } =
      await createVaultV2MidnightAdapterFixture({
        client,
        asset: usdc,
        salts: [padHex(toHex(81n), { size: 32 })],
        markets,
      });
    const adapter = adapters[0]!.address;
    await setOraclePrice(client, ORACLE_PRICE_SCALE);
    await depositToVault({ client, vault, assets: parseUnits("10", 6) });
    const borrower = testAccount(9);
    for (const market of markets) {
      await collateralize({ client, maker: borrower, market });
    }
    await takeOffer({
      client,
      adapter,
      maker: borrower,
      offer: sellOffer({ maker: borrower, market: marketLong, units: UNITS }),
      units: UNITS,
    });
    await expectAdapterMatchesChain({ client, vault, adapter, markets });

    // Cap the shortest duration bucket at the current allocation so that any
    // further buy with time to maturity above it breaches the cap.
    const sdkBefore = await fetchMidnightAdapter(client, adapter);
    const durationIdData = encodeAbiParameters(
      [{ type: "string" }, { type: "address" }, { type: "uint256" }],
      ["duration", adapter, durations[0]!],
    );
    await client.writeContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "decreaseAbsoluteCap",
      args: [durationIdData, sdkBefore.durationAllocations[0]!],
    });

    const absoluteCap = await client.readContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "absoluteCap",
      args: [VaultV2MidnightAdapter.durationCapId(adapter, durations[0]!)],
    });
    expect(absoluteCap).toBe(sdkBefore.durationAllocations[0]);
    const now = await client.timestamp();
    expect(durations[0]!).toBeGreaterThan(marketShort.maturity - now);
    await expect(
      takeOffer({
        client,
        adapter,
        maker: borrower,
        offer: sellOffer({
          maker: borrower,
          market: marketLong2,
          units: UNITS,
        }),
        units: UNITS,
      }),
    ).rejects.toThrow("DurationAbsoluteCapExceeded");

    // A buy maturing before the first duration bucket is unaffected.
    await takeOffer({
      client,
      adapter,
      maker: borrower,
      offer: sellOffer({ maker: borrower, market: marketShort, units: UNITS }),
      units: UNITS,
    });
    const { sdkAdapter } = await expectAdapterMatchesChain({
      client,
      vault,
      adapter,
      markets,
    });
    expect(
      sdkAdapter.marketData[MarketUtils.toId(marketShort)]?.netCredit,
    ).toBeGreaterThan(0n);
  });

  test("a Midnight liquidation loss flows through realAssets and totalAssets", async ({
    client,
  }) => {
    const timestamp = await client.timestamp();
    const market = midnightMarket(timestamp + Time.s.from.d(30n));
    const { vault, adapters } = await createVaultV2MidnightAdapterFixture({
      client,
      asset: usdc,
      salts: [padHex(toHex(91n), { size: 32 })],
      markets: [market],
    });
    const adapter = adapters[0]!.address;
    await setOraclePrice(client, ORACLE_PRICE_SCALE);
    await depositToVault({ client, vault, assets: parseUnits("10", 6) });
    const borrower = testAccount(14);
    await collateralize({ client, maker: borrower, market });
    await takeOffer({
      client,
      adapter,
      maker: borrower,
      offer: sellOffer({ maker: borrower, market, units: UNITS }),
      units: UNITS,
    });
    const marketId = MarketUtils.toId(market);
    const realAssetsBefore = await client.readContract({
      address: adapter,
      abi: midnightAdapterAbi,
      functionName: "realAssets",
    });
    const { accruedVault: accruedBefore } = await expectAdapterMatchesChain({
      client,
      vault,
      adapter,
      markets: [market],
    });

    // Crash the collateral price: the borrower's 10 wNative collateral becomes
    // worth far less than its ~1 USDC debt, so liquidation writes off bad debt.
    await setOraclePrice(client, ORACLE_PRICE_SCALE / 10n ** 16n);
    const liquidator = testAccount(15);
    await client.setBalance({
      address: liquidator.address,
      value: parseEther("1"),
    });
    await client.deal({
      erc20: usdc,
      account: liquidator.address,
      amount: parseUnits("1", 6),
    });
    await client.writeContract({
      account: liquidator,
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, parseUnits("1", 6)],
    });
    await client.writeContract({
      account: liquidator,
      address: midnight,
      abi: midnightAbi,
      functionName: "liquidate",
      args: [
        MarketUtils.toStruct(market),
        0n,
        COLLATERAL,
        0n,
        borrower.address,
        false,
        liquidator.address,
        zeroAddress,
        "0x",
      ],
    });

    const lossFactor = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "lossFactor",
      args: [marketId],
    });
    expect(lossFactor).toBeGreaterThan(0n);
    const realAssetsAfter = await client.readContract({
      address: adapter,
      abi: midnightAdapterAbi,
      functionName: "realAssets",
    });
    expect(realAssetsAfter).toBeLessThan(realAssetsBefore);
    const { accruedVault: accruedAfter } = await expectAdapterMatchesChain({
      client,
      vault,
      adapter,
      markets: [market],
    });
    expect(accruedAfter._totalAssets).toBeLessThan(accruedBefore._totalAssets);
  });
});
