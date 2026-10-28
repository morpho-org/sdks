import { midnightRedeem, morphoViemExtension } from "@morpho-org/morpho-sdk";
import { midnightAbi } from "@morpho-org/morpho-sdk/abis";
import { setterRatifierAbi } from "@morpho-org/morpho-sdk/midnight/abis";
import {
  Market,
  MarketParams,
  Offer,
  Tree,
} from "@morpho-org/morpho-sdk/midnight/entities";
import {
  MarketUtils,
  OfferUtils,
  SetterRatifierUtils,
} from "@morpho-org/morpho-sdk/midnight/utils";
import { ChainId, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  hexToBigInt,
  keccak256,
  maxUint128,
  maxUint256,
  padHex,
  parseEther,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  ConsumerLimitViolationError,
  type OperationLimit,
  simulate,
  toSimulationLimits,
} from "../../src/index.js";

/** Pinned after the Base Midnight deployment, matching morpho-sdk's Midnight fork tests. */
const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  chainId: base.id,
  forkBlockNumber: 52_252_000n,
}).extend<{ client: AnvilTestClient<typeof base> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const oracle: Address = "0x0000000000000000000000000000000000080000";
const offerMaker: Address = "0x9000000000000000000000000000000000000000";
const RECEIVER: Address = "0x00000000000000000000000000000000000c0E57";
const OTHER: Address = "0x00000000000000000000000000000000000d0e57";

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
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  }),
  totalUnits: 0n,
  lossFactor: 0n,
  withdrawable: 0n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
  continuousFee: 0,
  tickSpacing: 1,
});
const market = marketData.params;
const marketId = MarketUtils.toId(market);
/** Non-round credit, so an off-by-one payout or credit change is visible. */
const LENT = 1_234_567n;

const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[base.id, { simulateV1Url: client.transport.url! }]]),
});
const redeem = (
  units: bigint,
  accounts: { readonly onBehalf: Address; readonly receiver?: Address },
) => midnightRedeem({ chainId: base.id, market, units, ...accounts });
const asTransaction = (
  from: Address,
  tx: ReturnType<typeof midnightRedeem>,
) => ({
  from,
  to: tx.to,
  data: tx.data,
  value: tx.value,
});
const readCredit = (client: AnvilTestClient<typeof base>, user: Address) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "credit",
    args: [marketId, user],
  });

/**
 * Give the test account `LENT` credit units by taking a borrower's ratified
 * offer, then let the borrower repay so the market can pay the credit out.
 */
const setUp = async (
  client: AnvilTestClient<typeof base>,
  continuousFee = 0n,
) => {
  const user = client.account.address;
  // Returns a constant 1e36 price.
  await client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
  await client.setBalance({ address: offerMaker, value: parseEther("1") });
  await client.writeContract({
    account: offerMaker,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [setterRatifier, true, offerMaker],
  });
  await client.deal({
    erc20: wNative,
    account: offerMaker,
    amount: parseEther("10"),
  });
  await client.writeContract({
    account: offerMaker,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });
  const entity = client.extend(morphoViemExtension()).morpho.midnight(base.id);
  await client.sendTransaction({
    ...entity
      .supplyCollateral({
        marketData,
        accountAddress: offerMaker,
        collateralAssets: parseEther("10"),
        reservedCollateralAssets: 0n,
      })
      .buildTx(),
    account: offerMaker,
  });
  if (continuousFee > 0n) {
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "touchMarket",
      args: [MarketUtils.toStruct(market)],
    });
    const feeSetter = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "feeSetter",
    });
    await client.setBalance({ address: feeSetter, value: parseEther("1") });
    await client.writeContract({
      account: feeSetter,
      address: midnight,
      abi: midnightAbi,
      functionName: "setMarketContinuousFee",
      args: [marketId, continuousFee],
    });
  }
  const tree = Tree.create([
    Offer.create({
      market,
      buy: false,
      maker: offerMaker,
      expiry: market.maturity,
      tick: 5_000n,
      ratifier: setterRatifier,
      maxUnits: 2n * LENT,
      continuousFeeCap: continuousFee,
    }),
  ]);
  await client.writeContract({
    account: offerMaker,
    address: setterRatifier,
    abi: setterRatifierAbi,
    functionName: "setIsRootRatified",
    args: [offerMaker, tree.root, true],
  });
  const item = SetterRatifierUtils.ratify({ tree })[0]!;

  await client.deal({ erc20: usdc, amount: LENT });
  const lend = entity.takeLend({
    marketData,
    accountAddress: user,
    target: { type: "units", units: LENT, maxBuyerAssets: LENT },
    takeableOffers: [
      {
        units: 2n * LENT,
        offer: OfferUtils.toStruct({ offer: item.offer }),
        ratifierData: item.ratifierData,
      },
    ],
    maxContinuousFee: maxUint256,
    deadline: Time.timestamp() + 600n,
  });
  for (const requirement of await lend.getRequirements()) {
    if (!("to" in requirement)) throw new Error("expected an onchain call");
    await client.sendTransaction(
      requirement as Parameters<typeof client.sendTransaction>[0],
    );
  }
  await client.sendTransaction(lend.buildTx());

  await client.deal({ erc20: usdc, account: offerMaker, amount: LENT });
  await client.writeContract({
    account: offerMaker,
    address: usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, LENT],
  });
  await client.writeContract({
    account: offerMaker,
    address: midnight,
    abi: midnightAbi,
    functionName: "repay",
    args: [MarketUtils.toStruct(market), LENT, offerMaker, zeroAddress, "0x"],
  });
  await expect(readCredit(client, user)).resolves.toBe(LENT);
  return user;
};

describe.sequential("midnightRedeem limits — Base fork", () => {
  test("a redeem to an explicit receiver verifies owner credit and receiver payout", async ({
    client,
  }) => {
    const user = await setUp(client);
    const tx = redeem(LENT - 1n, { onBehalf: user, receiver: RECEIVER });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        receiver: RECEIVER,
      }),
    });
    expect(result.verification.operations).toEqual([
      {
        operation: "midnightRedeem",
        marketId,
        account: user,
        receiver: RECEIVER,
        checkedLimits: {
          quote: { assetsReceived: LENT - 1n, creditRedeemed: LENT - 1n },
          slippageTolerance: 300000000000000n,
        },
      },
    ]);
  });

  test("a redeem of the fee-accrued credit verifies against updatePositionView, not stored credit", async ({
    client,
  }) => {
    // Midnight's maximum continuous fee: 1% a year.
    const user = await setUp(client, 317_097_919n);
    await client.setNextBlockTimestamp({
      timestamp: (await client.timestamp()) + 365n * 24n * 60n * 60n,
    });
    await client.mine({ blocks: 1 });
    const [accrued] = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "updatePositionView",
      args: [MarketUtils.toStruct(market), marketId, user],
    });
    // A stored-credit reading would see the accrued fee as redeemed credit.
    expect(LENT - accrued).toBeGreaterThan(LENT / 1_000n);

    const tx = redeem(accrued, { onBehalf: user });
    const [limit] = toSimulationLimits(tx.action, { owner: user })
      .operations as readonly Extract<
      OperationLimit,
      { type: "midnightRedeem" }
    >[];
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: {
        operations: [
          { ...limit!, slippageTolerance: 0n, position: { maxCredit: 0n } },
        ],
      },
    });
    expect(result.verification.operations[0]?.checkedLimits).toEqual({
      quote: { assetsReceived: accrued, creditRedeemed: accrued },
      slippageTolerance: 0n,
      position: { maxCredit: 0n },
    });
  });

  test("a redeem after a realized loss verifies against the loss-normalized credit, not stored credit", async ({
    client,
  }) => {
    const user = await setUp(client);
    // `marketState` is Midnight's second mapping (slot 1); its first word packs
    // `totalUnits` (low 128 bits) and `lossFactor` (high 128 bits).
    const slot = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }],
        [marketId, 1n],
      ),
    );
    const word = hexToBigInt(
      (await client.getStorageAt({ address: midnight, slot })) ?? "0x0",
    );
    expect(word & maxUint128).toBeGreaterThan(0n);
    const lossFactor = maxUint128 / 2n;
    await client.setStorageAt({
      address: midnight,
      index: slot,
      value: toHex((lossFactor << 128n) | (word & maxUint128), { size: 32 }),
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "lossFactor",
        args: [marketId],
      }),
    ).resolves.toBe(lossFactor);
    const [normalized] = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "updatePositionView",
      args: [MarketUtils.toStruct(market), marketId, user],
    });
    expect(normalized).toBe((LENT * (maxUint128 - lossFactor)) / maxUint128);
    await expect(readCredit(client, user)).resolves.toBe(LENT);

    const tx = redeem(normalized, { onBehalf: user });
    const [limit] = toSimulationLimits(tx.action, { owner: user })
      .operations as readonly Extract<
      OperationLimit,
      { type: "midnightRedeem" }
    >[];
    const exact = { ...limit!, slippageTolerance: 0n };
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: { operations: [{ ...exact, position: { maxCredit: 0n } }] },
    });
    expect(result.verification.operations[0]?.checkedLimits).toEqual({
      quote: { assetsReceived: normalized, creditRedeemed: normalized },
      slippageTolerance: 0n,
      position: { maxCredit: 0n },
    });

    // A stored-credit reading would measure a `LENT` drop and fail the exact
    // quote above; one unit below the normalized credit must fail.
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: {
        operations: [
          {
            ...exact,
            quote: {
              assetsReceived: normalized - 1n,
              creditRedeemed: normalized - 1n,
            },
          } as OperationLimit,
        ],
      },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("creditRedeemed");
  });

  test("an authorized sender redeems onBehalf another owner to a third receiver", async ({
    client,
  }) => {
    const user = await setUp(client);
    await client.setBalance({ address: OTHER, value: parseEther("1") });
    await client.sendTransaction({
      to: midnight,
      data: encodeFunctionData({
        abi: midnightAbi,
        functionName: "setIsAuthorized",
        args: [OTHER, true, user],
      }),
    });
    const tx = redeem(LENT, { onBehalf: user, receiver: RECEIVER });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(OTHER, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: OTHER,
        onBehalf: user,
        receiver: RECEIVER,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      account: user,
      receiver: RECEIVER,
    });
  });

  test("two redeems in one bundle verify one aggregate credit change and the final-zero bound", async ({
    client,
  }) => {
    const user = await setUp(client);
    const first = redeem(1_000_001n, { onBehalf: user });
    const second = redeem(LENT - 1_000_001n, { onBehalf: user });
    const transactions = [
      asTransaction(user, first),
      asTransaction(user, second),
    ];
    const [aggregate] = toSimulationLimits(first.action, {
      owner: user,
      expected: { assetsReceived: LENT, creditRedeemed: LENT },
    }).operations as readonly Extract<
      OperationLimit,
      { type: "midnightRedeem" }
    >[];
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions,
      limits: { operations: [{ ...aggregate!, position: { maxCredit: 0n } }] },
    });
    expect(result.verification.operations[0]?.checkedLimits).toMatchObject({
      quote: { assetsReceived: LENT, creditRedeemed: LENT },
      position: { maxCredit: 0n },
    });

    // Only the first redeem is quoted: the bundle removes more credit than it.
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions,
        limits: toSimulationLimits(first.action, { owner: user }),
      }),
    ).rejects.toThrow(/slippage for "creditRedeemed"/);
  });

  test("a partial redeem against a final-zero bound is rejected", async ({
    client,
  }) => {
    const user = await setUp(client);
    const tx = redeem(LENT - 1n, { onBehalf: user });
    const [limit] = toSimulationLimits(tx.action, { owner: user })
      .operations as readonly Extract<
      OperationLimit,
      { type: "midnightRedeem" }
    >[];
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: { operations: [{ ...limit!, position: { maxCredit: 0n } }] },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain(
      'Limit operation 0 (midnightRedeem): post-bundle position.maxCredit "1" is above the maximum "0"',
    );
  });

  test("a successful redeem paid to the wrong receiver is rejected by the intended receiver's limit", async ({
    client,
  }) => {
    const user = await setUp(client);
    const intended = redeem(LENT, { onBehalf: user, receiver: RECEIVER });
    const misdirected = redeem(LENT, { onBehalf: user, receiver: OTHER });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, misdirected)],
      limits: toSimulationLimits(intended.action, {
        owner: user,
        receiver: RECEIVER,
      }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain(
      'Limit operation 0 (midnightRedeem): slippage for "assetsReceived"',
    );
  });
});
