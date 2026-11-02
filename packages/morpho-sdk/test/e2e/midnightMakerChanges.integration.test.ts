import { MathLib, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import {
  type MarketParams,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  Offer,
  TickLib,
  Tree,
} from "@morpho-org/midnight-sdk";
import type { E2eScenario } from "@morpho-org/morpho-test";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
  postE2eSetterTree,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  BaseError,
  type Chain,
  decodeErrorResult,
  erc20Abi,
  type Hex,
  maxUint128,
  maxUint256,
  parseEther,
  zeroAddress,
} from "viem";
import { expect } from "vitest";
import {
  type ActionOutput,
  isRequirementSignature,
  type MidnightTakeableOffer,
  morphoViemExtension,
  type TransactionAction,
} from "../../src/index.js";
import { describeE2e } from "./setup.js";

const scenario: E2eScenario = {
  name: "midnight-maker-changes",
  requires: ["midnight", "midnightBundlesV2", "setterRatifier"],
};

const UNITS = parseEther("1");

const REVERT_ABI = [...midnightBundlesV2Abi, ...midnightAbi, ...erc20Abi];

type SendableTx = Parameters<AnvilTestClient<Chain>["sendTransaction"]>[0];

type E2eTake = Pick<
  ActionOutput<TransactionAction, undefined, Record<string, never>>,
  "getRequirements" | "buildTx"
>;

/** Sends an action's onchain requirements from `account`. */
const sendE2eRequirements = async (
  client: AnvilTestClient<Chain>,
  params: { readonly account: Address; readonly take: E2eTake },
) => {
  for (const requirement of await params.take.getRequirements()) {
    if (isRequirementSignature(requirement))
      throw new Error("expected an onchain call requirement");
    await client.sendTransaction({
      ...requirement,
      account: params.account,
    } as SendableTx);
  }
};

/** Sends an action's onchain requirements, then its bundle transaction, from `account`. */
const sendE2eTake = async (
  client: AnvilTestClient<Chain>,
  params: { readonly account: Address; readonly take: E2eTake },
) => {
  await sendE2eRequirements(client, params);

  return client.sendTransaction({
    ...params.take.buildTx(),
    account: params.account,
  } as SendableTx);
};

/** Asserts `promise` reverts with the MidnightBundlesV2, Midnight or ERC-20 error `errorName`. */
const expectRevert = async (promise: Promise<unknown>, errorName: string) => {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof BaseError)) throw new Error("expected a revert");
  const revert = error.walk(
    (cause) => typeof (cause as { data?: unknown }).data === "string",
  ) as { data: Hex } | null;
  if (revert == null)
    throw new Error(`expected revert data, got: ${error.shortMessage}`);
  expect(
    decodeErrorResult({ abi: REVERT_ABI, data: revert.data }).errorName,
  ).toBe(errorName);
};

/** Asserts sending `tx` fails onchain with a revert, not an RPC or account error. */
const expectSendRevert = async (
  client: AnvilTestClient<Chain>,
  tx: SendableTx,
) => {
  const error = await client.sendTransaction(tx).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof BaseError)) throw new Error("expected a revert");
  expect(
    error.walk((cause) => (cause as Error).name === "ExecutionRevertedError"),
  ).not.toBeNull();
};

const balanceOf = (
  client: AnvilTestClient<Chain>,
  params: { readonly token: Address; readonly account: Address },
) =>
  client.readContract({
    address: params.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.account],
  });

const creditOf = (
  client: AnvilTestClient<Chain>,
  params: {
    readonly chainId: number;
    readonly market: MarketParams;
    readonly account: Address;
  },
) =>
  client.readContract({
    address: getChainAddress(params.chainId, "midnight"),
    abi: midnightAbi,
    functionName: "credit",
    args: [MarketUtils.toId(params.market), params.account],
  });

/** Loan assets a lender pays for `units` at `tick`, with every market fee at zero. */
const buyerAssetsAt = (units: bigint, tick: bigint) =>
  MathLib.wMulUp(units, TickLib.tickToPrice(tick));

describeE2e(scenario, (test, { chainId }) => {
  const midnight = getChainAddress(chainId, "midnight");
  const setterRatifier = getChainAddress(chainId, "setterRatifier");
  const maker = E2E_MIDNIGHT_WALLETS.A;

  /** A supplies collateral and posts a borrow offer of `2 * UNITS` that B and C can lend into. */
  const postBorrowOffer = async (
    client: AnvilTestClient<Chain>,
    options: { readonly tick?: bigint } = {},
  ) => {
    const collateralAssets = parseEther("10");
    const market = await createE2eMidnightMarket(client, chainId);
    await fundE2eMidnightWallets(client, {
      market: market.params,
      wallets: { A: { collateralAssets } },
      approve: midnight,
    });
    await fundE2eMidnightWallets(client, {
      market: market.params,
      wallets: {
        B: { loanAssets: 2n * UNITS },
        C: { loanAssets: 2n * UNITS },
      },
    });
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(market.params), 0n, collateralAssets, maker],
    });
    const tick = options.tick ?? 5_000n;
    const tree = Tree.create([
      Offer.create({
        market: market.params,
        buy: false,
        maker,
        expiry: market.params.maturity,
        tick,
        ratifier: setterRatifier,
        maxUnits: 2n * UNITS,
      }),
    ]);
    await postE2eSetterTree(client, { chainId, maker, tree });

    return { ...market, tree, tick };
  };

  const takeLend = (
    client: AnvilTestClient<Chain>,
    params: {
      readonly marketData: Awaited<
        ReturnType<typeof postBorrowOffer>
      >["marketData"];
      readonly taker: Address;
      readonly units: bigint;
      readonly maxBuyerAssets: bigint;
      readonly takeableOffers: readonly MidnightTakeableOffer[];
    },
  ) =>
    client
      .extend(morphoViemExtension())
      .morpho.midnight(chainId)
      .takeLend({
        marketData: params.marketData,
        accountAddress: params.taker,
        target: {
          type: "units",
          units: params.units,
          maxBuyerAssets: params.maxBuyerAssets,
        },
        takeableOffers: params.takeableOffers,
        maxContinuousFee: maxUint256,
        deadline: Time.timestamp() + 600n,
      });

  test("L2-6 a take after the maker cancels mid-fill reverts and leaves the taker's funds", async ({
    client,
  }) => {
    const { params, marketData, tree, tick } = await postBorrowOffer(client);
    const takeableOffers = getE2eTakeableOffers({ tree, units: UNITS });
    const maxBuyerAssets = buyerAssetsAt(UNITS, tick);

    await sendE2eTake(client, {
      account: E2E_MIDNIGHT_WALLETS.B,
      take: takeLend(client, {
        marketData,
        taker: E2E_MIDNIGHT_WALLETS.B,
        units: UNITS,
        maxBuyerAssets,
        takeableOffers,
      }),
    });
    await expect(
      creditOf(client, {
        chainId,
        market: params,
        account: E2E_MIDNIGHT_WALLETS.B,
      }),
    ).resolves.toBe(UNITS);

    const group = takeableOffers[0]!.offer.group;
    // `maxConsumed` guards the cancellation: it must cover what takers already filled.
    const maxConsumed = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "consumed",
      args: [maker, group],
    });
    await sendE2eTake(client, {
      account: maker,
      take: client
        .extend(morphoViemExtension())
        .morpho.midnight(chainId)
        .cancelOffers({
          accountAddress: maker,
          cancellations: [{ group, maxConsumed }],
          deadline: Time.timestamp() + 600n,
        }),
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [maker, group],
      }),
    ).resolves.toBe(maxUint128);

    const taker = E2E_MIDNIGHT_WALLETS.C;
    const loanBefore = await balanceOf(client, {
      token: params.loanToken,
      account: taker,
    });
    const take = takeLend(client, {
      marketData,
      taker,
      units: UNITS,
      maxBuyerAssets,
      takeableOffers,
    });
    await sendE2eRequirements(client, { account: taker, take });
    // Anvil drops revert data from failed transactions, so read the reason from a call first.
    await expectRevert(
      client.call({
        ...take.buildTx(),
        account: taker,
      } as Parameters<typeof client.call>[0]),
      "OutOfOffers",
    );
    await expectSendRevert(client, {
      ...take.buildTx(),
      account: taker,
    } as SendableTx);
    await expect(
      balanceOf(client, { token: params.loanToken, account: taker }),
    ).resolves.toBe(loanBefore);
    await expect(
      creditOf(client, { chainId, market: params, account: taker }),
    ).resolves.toBe(0n);
  });

  test("L2-7 a take after the maker replaces the offer mid-fill fills at the new price", async ({
    client,
  }) => {
    const { params, marketData, tree, tick } = await postBorrowOffer(client);
    const oldOffers = getE2eTakeableOffers({ tree, units: UNITS });
    await sendE2eTake(client, {
      account: E2E_MIDNIGHT_WALLETS.B,
      take: takeLend(client, {
        marketData,
        taker: E2E_MIDNIGHT_WALLETS.B,
        units: UNITS,
        maxBuyerAssets: buyerAssetsAt(UNITS, tick),
        takeableOffers: oldOffers,
      }),
    });

    const newTick = tick - 1_000n;
    const replacement = Tree.create([
      Offer.create({
        market: params,
        buy: false,
        maker,
        expiry: params.maturity,
        tick: newTick,
        ratifier: setterRatifier,
        maxUnits: 2n * UNITS,
      }),
    ]);
    const group = oldOffers[0]!.offer.group;
    // `maxConsumed` guards the cancellation: it must cover what takers already filled.
    const maxConsumed = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "consumed",
      args: [maker, group],
    });
    await sendE2eTake(client, {
      account: maker,
      take: client
        .extend(morphoViemExtension())
        .morpho.midnight(chainId)
        .cancelOffers({
          accountAddress: maker,
          cancellations: [{ group, maxConsumed }],
          deadline: Time.timestamp() + 600n,
        }),
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [maker, group],
      }),
    ).resolves.toBe(maxUint128);
    await postE2eSetterTree(client, { chainId, maker, tree: replacement });

    const taker = E2E_MIDNIGHT_WALLETS.C;
    const newAssets = buyerAssetsAt(UNITS, newTick);
    expect(newAssets).not.toBe(buyerAssetsAt(UNITS, tick));
    const loanBefore = await balanceOf(client, {
      token: params.loanToken,
      account: taker,
    });
    await sendE2eTake(client, {
      account: taker,
      take: takeLend(client, {
        marketData,
        taker,
        units: UNITS,
        maxBuyerAssets: newAssets,
        takeableOffers: getE2eTakeableOffers({
          tree: replacement,
          units: UNITS,
        }),
      }),
    });
    await expect(
      creditOf(client, { chainId, market: params, account: taker }),
    ).resolves.toBe(UNITS);
    await expect(
      balanceOf(client, { token: params.loanToken, account: taker }),
    ).resolves.toBe(loanBefore - newAssets);
  });

  test("L2-8 a stale quote on liquidity another taker landed first reverts within its bounds and leaves the taker's funds", async ({
    client,
  }) => {
    const { params, marketData, tree, tick } = await postBorrowOffer(client);
    const quotedUnits = (3n * UNITS) / 2n;
    const quote = getE2eTakeableOffers({ tree, units: quotedUnits });
    const maxBuyerAssets = buyerAssetsAt(quotedUnits, tick);
    const staleTake = takeLend(client, {
      marketData,
      taker: E2E_MIDNIGHT_WALLETS.C,
      units: quotedUnits,
      maxBuyerAssets,
      takeableOffers: quote,
    });

    await sendE2eTake(client, {
      account: E2E_MIDNIGHT_WALLETS.B,
      take: takeLend(client, {
        marketData,
        taker: E2E_MIDNIGHT_WALLETS.B,
        units: quotedUnits,
        maxBuyerAssets,
        takeableOffers: quote,
      }),
    });

    const taker = E2E_MIDNIGHT_WALLETS.C;
    const loanBefore = await balanceOf(client, {
      token: params.loanToken,
      account: taker,
    });
    await sendE2eRequirements(client, { account: taker, take: staleTake });
    const staleTx = { ...staleTake.buildTx(), account: taker } as SendableTx;
    await expectRevert(
      client.call(staleTx as Parameters<typeof client.call>[0]),
      "OutOfOffers",
    );
    await expectSendRevert(client, staleTx);
    await expect(
      balanceOf(client, { token: params.loanToken, account: taker }),
    ).resolves.toBe(loanBefore);
    await expect(
      creditOf(client, { chainId, market: params, account: taker }),
    ).resolves.toBe(0n);
    await expect(
      creditOf(client, {
        chainId,
        market: params,
        account: E2E_MIDNIGHT_WALLETS.B,
      }),
    ).resolves.toBe(quotedUnits);
  });

  test.for([
    { change: "revokes its approval" },
    { change: "spends its loan tokens" },
  ] as const)(
    "L2-9 a take of a wallet-funded lend offer reverts once the maker $change",
    async ({ change }, { client }) => {
      const { params, marketData } = await createE2eMidnightMarket(
        client,
        chainId,
      );
      const taker = E2E_MIDNIGHT_WALLETS.B;
      const collateralAssets = parseEther("10");
      await fundE2eMidnightWallets(client, {
        market: params,
        wallets: { A: { loanAssets: UNITS }, B: { collateralAssets } },
        approve: midnight,
      });
      await client.writeContract({
        account: taker,
        address: midnight,
        abi: midnightAbi,
        functionName: "supplyCollateral",
        args: [MarketUtils.toStruct(params), 0n, collateralAssets, taker],
      });
      const tick = 5_000n;
      const tree = Tree.create([
        Offer.create({
          market: params,
          buy: true,
          maker,
          expiry: params.maturity,
          tick,
          ratifier: setterRatifier,
          receiverIfMakerIsSeller: zeroAddress,
          maxUnits: UNITS,
        }),
      ]);
      await postE2eSetterTree(client, { chainId, maker, tree });

      const entity = client
        .extend(morphoViemExtension())
        .morpho.midnight(chainId);
      const take = entity.takeBorrow({
        accountAddress: taker,
        marketData,
        positionData: await entity.getPositionData({
          marketId: MarketUtils.toId(params),
          accountAddress: taker,
        }),
        collateralPrices: [ORACLE_PRICE_SCALE],
        target: { type: "units", units: UNITS, minSellerAssets: 1n },
        takeableOffers: getE2eTakeableOffers({ tree, units: UNITS }),
        deadline: Time.timestamp() + 600n,
      });
      await sendE2eRequirements(client, { account: taker, take });
      const tx = { ...take.buildTx(), account: taker } as SendableTx;
      // The take settles from A's wallet while A still holds and approves the loan tokens.
      await expect(
        client.call(tx as Parameters<typeof client.call>[0]),
      ).resolves.toBeDefined();

      if (change === "revokes its approval")
        await client.writeContract({
          account: maker,
          address: params.loanToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [midnight, 0n],
        });
      else
        await client.writeContract({
          account: maker,
          address: params.loanToken,
          abi: erc20Abi,
          functionName: "transfer",
          args: [
            E2E_MIDNIGHT_WALLETS.D,
            await balanceOf(client, {
              token: params.loanToken,
              account: maker,
            }),
          ],
        });

      const loanBefore = await balanceOf(client, {
        token: params.loanToken,
        account: taker,
      });
      // The bundle skips an offer whose maker can't pay, leaving no offer to fill.
      await expectRevert(
        client.call(tx as Parameters<typeof client.call>[0]),
        "OutOfOffers",
      );
      await expectSendRevert(client, tx);
      await expect(
        balanceOf(client, { token: params.loanToken, account: taker }),
      ).resolves.toBe(loanBefore);
      await expect(
        client.readContract({
          address: midnight,
          abi: midnightAbi,
          functionName: "debt",
          args: [MarketUtils.toId(params), taker],
        }),
      ).resolves.toBe(0n);
    },
  );
});
