import {
  MarketUtils as BlueMarketUtils,
  type MarketId,
} from "@morpho-org/blue-sdk";
import {
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
  isRequirementSignature,
  morphoViemExtension,
} from "@morpho-org/morpho-sdk";
import {
  blueAbi,
  midnightBlueBuyCallbackFactoryAbi,
} from "@morpho-org/morpho-sdk/abis";
import {
  MarketParams,
  Offer,
  Tree,
} from "@morpho-org/morpho-sdk/midnight/entities";
import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  encodeFunctionData,
  erc20Abi,
  type Hex,
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
  ConsumerLimitViolationError,
  simulate,
  toSimulationLimits,
} from "../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  chainId: base.id,
  forkBlockNumber: 52_252_000n,
  stepsTracing: false,
}).extend<{ client: AnvilTestClient<typeof base> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const midnightBundlesV2 = getChainAddress(
  ChainId.BaseMainnet,
  "midnightBundlesV2",
);
const rateRatifierV1 = getChainAddress(ChainId.BaseMainnet, "rateRatifierV1");
const blue = getChainAddress(ChainId.BaseMainnet, "blue");
const callbackFactory = getChainAddress(
  ChainId.BaseMainnet,
  "midnightBlueBuyCallbackFactory",
);
const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const oracle: Address = "0x0000000000000000000000000000000000080000";
const callbackSalt = `0x${"cc".repeat(32)}` as Hex;
const groupA = `0x${"aa".repeat(32)}` as Hex;
const groupB = `0x${"bb".repeat(32)}` as Hex;

const validation = {
  apiUrl: "https://api.example/base/",
  fetch: async () =>
    new Response(JSON.stringify({ data: { issues: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
};

const blueMarketFor = (loanToken: Address) => ({
  loanToken,
  collateralToken: loanToken === usdc ? wNative : usdc,
  oracle,
  irm: getChainAddress(ChainId.BaseMainnet, "adaptiveCurveIrm"),
  lltv: 860000000000000000n,
});

const midnightMarketFor = (loanToken: Address) =>
  new MarketParams({
    chainId: base.id,
    midnight,
    loanToken,
    collateralParams: [
      {
        token: loanToken === usdc ? wNative : usdc,
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

const rateTree = (
  client: AnvilTestClient<typeof base>,
  params: {
    readonly market: MarketParams;
    readonly blueMarket: ReturnType<typeof blueMarketFor>;
    readonly group: Hex;
    readonly callback: Address;
  },
) =>
  Tree.create({
    type: "rateV1",
    entries: [
      {
        offer: Offer.create({
          market: params.market,
          buy: true,
          maker: client.account.address,
          expiry: params.market.maturity,
          tick: 5_000n,
          group: params.group,
          ratifier: rateRatifierV1,
          continuousFeeCap: 0n,
          receiverIfMakerIsSeller: zeroAddress,
          reduceOnly: false,
          maxUnits: 0n,
          maxAssets: parseUnits("1", 6),
          callback: params.callback,
          callbackData: getMidnightBlueBuyCallbackData(params.blueMarket),
        }),
        rate: 1_000_000_000n,
      },
    ],
  });

const entityFor = (client: AnvilTestClient<typeof base>) =>
  client.extend(morphoViemExtension()).morpho.midnight(base.id);

const installTestOracle = (client: AnvilTestClient<typeof base>) =>
  client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });

type ParkingOutput = Awaited<
  ReturnType<ReturnType<typeof entityFor>["supplyBlueMakeLend"]>
>;
type ParkingTransaction = ReturnType<ParkingOutput["buildTx"]> & {
  readonly callback: Address;
  readonly marketId: MarketId;
};

const fulfilRequirements = async (
  client: AnvilTestClient<typeof base>,
  output: ParkingOutput,
) => {
  for (const requirement of await output.getRequirements()) {
    if (isRequirementSignature(requirement)) {
      throw new Error("expected only onchain requirements");
    }
    await client.sendTransaction(requirement);
  }
  await expect(output.getRequirements()).resolves.toEqual([]);
  expect(output.buildTx().to).toBe(midnightBundlesV2);
};

const createBlueMarket = async (
  client: AnvilTestClient<typeof base>,
  params: {
    readonly market: ReturnType<typeof blueMarketFor>;
    readonly seedAssets: bigint;
  },
) => {
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "createMarket",
    args: [params.market],
  });
  await client.deal({
    erc20: params.market.loanToken,
    account: client.account.address,
    amount: params.seedAssets,
  });
  await client.writeContract({
    address: params.market.loanToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [blue, params.seedAssets],
  });
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "supply",
    args: [params.market, params.seedAssets, 0n, client.account.address, "0x"],
  });
};

const parkingTransaction = async (
  client: AnvilTestClient<typeof base>,
  params: {
    readonly market: ReturnType<typeof blueMarketFor>;
    readonly assetsToPark: bigint;
    readonly nativeAmount?: bigint;
    readonly group?: Hex;
    readonly salt?: Hex;
  },
): Promise<ParkingTransaction> => {
  const { market, assetsToPark, nativeAmount = 0n } = params;
  const user = client.account.address;
  await installTestOracle(client);
  if (assetsToPark > nativeAmount) {
    await client.deal({
      erc20: market.loanToken,
      account: user,
      amount: assetsToPark - nativeAmount,
    });
  }
  const { result: callback } = await client.simulateContract({
    address: callbackFactory,
    abi: midnightBlueBuyCallbackFactoryAbi,
    functionName: "createBlueBuyCallback",
    args: [user, params.salt ?? callbackSalt],
  });
  const blueMarket = market;
  const output = await entityFor(client).supplyBlueMakeLend({
    accountAddress: user,
    offers: rateTree(client, {
      market: midnightMarketFor(market.loanToken),
      blueMarket,
      group: params.group ?? groupA,
      callback,
    }),
    blueMarket,
    assetsToPark,
    callbackSalt: params.salt ?? callbackSalt,
    deadline: maxUint256,
    nativeAmount,
    validation,
  });
  await fulfilRequirements(client, output);
  return {
    ...output.buildTx(),
    callback,
    marketId: BlueMarketUtils.getMarketId(market),
  };
};

const asTransaction = (from: Address, tx: ParkingTransaction) => ({
  from,
  to: tx.to,
  data: tx.data,
  value: tx.value,
});

const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[base.id, { simulateV1Url: client.transport.url! }]]),
});

const measureSupplySharesDeltas = async (
  client: AnvilTestClient<typeof base>,
  params: {
    readonly marketId: MarketId;
    readonly accounts: readonly Address[];
    readonly transactions: readonly Pick<
      ParkingTransaction,
      "to" | "data" | "value"
    >[];
  },
) => {
  const snapshot = await client.snapshot();
  const readShares = async () =>
    Promise.all(
      params.accounts.map(async (account) => {
        const [shares] = await client.readContract({
          address: blue,
          abi: blueAbi,
          functionName: "position",
          args: [params.marketId, account],
        });
        return shares;
      }),
    );
  const before = await readShares();
  for (const tx of params.transactions)
    await client.sendTransaction({
      account: client.account,
      to: tx.to,
      data: tx.data,
      ...(tx.value === undefined ? {} : { value: tx.value }),
    });
  const after = await readShares();
  await client.revert({ id: snapshot });
  return before.map((shares, index) => (after[index] ?? 0n) - shares);
};

const verify = async (
  client: AnvilTestClient<typeof base>,
  params: {
    readonly tx: ParkingTransaction;
    readonly user: Address;
    readonly expected?: bigint;
    readonly expectedShares?: bigint;
  },
) => {
  const [actualShares = 0n] = await measureSupplySharesDeltas(client, {
    marketId: params.tx.marketId,
    accounts: [params.tx.callback],
    transactions: [params.tx],
  });
  return simulate(configFor(client), {
    chainId: base.id,
    transactions: [asTransaction(params.user, params.tx)],
    limits: toSimulationLimits(params.tx.action, {
      owner: params.user,
      expected: {
        sharesMinted: params.expectedShares ?? actualShares,
        ...(params.expected === undefined
          ? {}
          : { assetsPaid: params.expected }),
      },
    }),
  });
};

describe.sequential("midnightSupplyBlueMakeLend limits — Base fork", () => {
  test("measures a non-native loan-token debit", async ({ client }) => {
    const market = blueMarketFor(usdc);
    await createBlueMarket(client, {
      market,
      seedAssets: parseUnits("1", 6),
    });
    const assetsToPark = parseUnits("2", 6);
    const user = client.account.address;
    const tx = await parkingTransaction(client, { market, assetsToPark });
    const callback = getMidnightBlueBuyCallbackAddress({
      chainId: base.id,
      owner: user,
      salt: callbackSalt,
    });
    expect(tx.callback).toBe(callback);
    const [callbackShares = 0n] = await measureSupplySharesDeltas(client, {
      marketId: tx.marketId,
      accounts: [callback],
      transactions: [tx],
    });
    expect(callbackShares).toBeGreaterThan(0n);
    const result = await verify(client, {
      tx,
      user,
      expectedShares: callbackShares,
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightSupplyBlueMakeLend",
      loanToken: usdc,
      account: user,
      checkedLimits: {
        quote: { assetsPaid: assetsToPark, sharesMinted: callbackShares },
      },
    });
  });

  test("measures the full parked amount across partial native and wNative debits", async ({
    client,
  }) => {
    const market = blueMarketFor(wNative);
    await createBlueMarket(client, { market, seedAssets: parseEther("1") });
    const assetsToPark = parseEther("1");
    const nativeAmount = parseEther("0.4");
    const tx = await parkingTransaction(client, {
      market,
      assetsToPark,
      nativeAmount,
    });
    const result = await verify(client, {
      tx,
      user: client.account.address,
    });
    expect(tx.value).toBe(nativeAmount);
    expect(result.verification.operations[0]).toMatchObject({
      loanToken: wNative,
      checkedLimits: {
        quote: { assetsPaid: assetsToPark },
      },
    });
  });

  test("measures the full parked amount for fully native funding", async ({
    client,
  }) => {
    const market = blueMarketFor(wNative);
    await createBlueMarket(client, { market, seedAssets: parseEther("1") });
    const assetsToPark = parseEther("1");
    const user = client.account.address;
    const tx = await parkingTransaction(client, {
      market,
      assetsToPark,
      nativeAmount: assetsToPark,
    });
    const result = await verify(client, { tx, user });
    expect(tx.value).toBe(assetsToPark);
    expect(result.verification.operations[0]).toMatchObject({
      loanToken: wNative,
      checkedLimits: { quote: { assetsPaid: assetsToPark } },
    });
    await client.deal({
      erc20: wNative,
      account: user,
      amount: parseEther("0.1"),
    });
    const [callbackShares = 0n] = await measureSupplySharesDeltas(client, {
      marketId: tx.marketId,
      accounts: [tx.callback],
      transactions: [tx],
    });
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [
          asTransaction(user, tx),
          {
            from: user,
            to: wNative,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [blue, parseEther("0.1")],
            }),
            value: 0n,
          },
        ],
        limits: toSimulationLimits(tx.action, {
          owner: user,
          expected: { sharesMinted: callbackShares },
        }),
      }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  });

  test("rejects a mismatched loan-token subject after successful execution", async ({
    client,
  }) => {
    const market = blueMarketFor(usdc);
    await createBlueMarket(client, {
      market,
      seedAssets: parseUnits("1", 6),
    });
    const assetsToPark = parseUnits("1", 6);
    const user = client.account.address;
    const tx = await parkingTransaction(client, { market, assetsToPark });
    const [callbackShares = 0n] = await measureSupplySharesDeltas(client, {
      marketId: tx.marketId,
      accounts: [tx.callback],
      transactions: [tx],
    });
    const limits = toSimulationLimits(tx.action, {
      owner: user,
      expected: { assetsPaid: assetsToPark, sharesMinted: callbackShares },
    });
    const operation = limits.operations[0];
    if (operation?.type !== "midnightSupplyBlueMakeLend")
      throw new Error("expected a Midnight Blue parking limit");
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: {
        operations: [{ ...operation, loanToken: wNative }],
      },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("midnightSupplyBlueMakeLend");
    expect((error as Error).message).toContain("assetsPaid");
    expect((error as Error).message).toContain(wNative);
  });

  test("requires exact debit equality for under- and over-quotes", async ({
    client,
  }) => {
    const market = blueMarketFor(usdc);
    await createBlueMarket(client, {
      market,
      seedAssets: parseUnits("1", 6),
    });
    const assetsToPark = parseUnits("1", 6);
    const tx = await parkingTransaction(client, { market, assetsToPark });
    for (const offset of [-1n, 1n]) {
      await expect(
        verify(client, {
          tx,
          user: client.account.address,
          expected: assetsToPark + offset,
        }),
      ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
    }
  });

  test("rejects overquoted callback supply shares", async ({ client }) => {
    const market = blueMarketFor(usdc);
    await createBlueMarket(client, {
      market,
      seedAssets: parseUnits("1", 6),
    });
    const assetsToPark = parseUnits("1", 6);
    const user = client.account.address;
    const tx = await parkingTransaction(client, { market, assetsToPark });
    const [callbackShares] = await measureSupplySharesDeltas(client, {
      marketId: tx.marketId,
      accounts: [tx.callback],
      transactions: [tx],
    });
    expect(callbackShares).toBeDefined();
    const error = await verify(client, {
      tx,
      user,
      expectedShares: callbackShares! * 2n,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("sharesMinted");
    expect((error as Error).message).toContain(`got "${callbackShares}"`);
  });

  test("excludes a same-market wallet Blue supply from callback sharesMinted", async ({
    client,
  }) => {
    const market = blueMarketFor(usdc);
    await createBlueMarket(client, {
      market,
      seedAssets: parseUnits("1", 6),
    });
    const assetsToPark = parseUnits("1", 6);
    const extraSupply = parseUnits("2", 6);
    const user = client.account.address;
    const tx = await parkingTransaction(client, { market, assetsToPark });
    await client.deal({
      erc20: usdc,
      account: user,
      amount: assetsToPark + extraSupply,
    });
    await client.writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [blue, extraSupply],
    });
    const blueSupply = {
      from: user,
      to: blue,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "supply",
        args: [market, extraSupply, 0n, user, "0x"],
      }),
      value: 0n,
    };
    const [callbackDelta = 0n, userDelta = 0n] =
      await measureSupplySharesDeltas(client, {
        marketId: tx.marketId,
        accounts: [tx.callback, user],
        transactions: [tx, blueSupply],
      });
    expect(userDelta).toBeGreaterThan(callbackDelta);
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx), blueSupply],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        expected: {
          assetsPaid: assetsToPark + extraSupply,
          sharesMinted: userDelta,
        },
      }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("sharesMinted");
    expect((error as Error).message).toContain(`got "${callbackDelta}"`);
  });

  test("rejects a quote for one parking action when two execute", async ({
    client,
  }) => {
    const market = blueMarketFor(usdc);
    await createBlueMarket(client, {
      market,
      seedAssets: parseUnits("1", 6),
    });
    const assetsToPark = parseUnits("1", 6);
    const user = client.account.address;
    const first = await parkingTransaction(client, {
      market,
      assetsToPark,
      group: groupA,
      salt: callbackSalt,
    });
    const second = await parkingTransaction(client, {
      market,
      assetsToPark,
      group: groupB,
      salt: `0x${"dd".repeat(32)}` as Hex,
    });
    expect(first.callback).not.toBe(second.callback);
    await client.deal({
      erc20: usdc,
      account: user,
      amount: assetsToPark * 2n,
    });
    const [firstShares = 0n, secondShares = 0n] =
      await measureSupplySharesDeltas(client, {
        marketId: first.marketId,
        accounts: [first.callback, second.callback],
        transactions: [first, second],
      });
    expect(firstShares).toBeGreaterThan(0n);
    expect(secondShares).toBeGreaterThan(0n);
    await client.deal({
      erc20: usdc,
      account: user,
      amount: assetsToPark * 2n,
    });
    await client.writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnightBundlesV2, assetsToPark * 2n],
    });
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, first), asTransaction(user, second)],
        limits: toSimulationLimits(first.action, {
          owner: user,
          expected: { sharesMinted: firstShares },
        }),
      }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  });
});
