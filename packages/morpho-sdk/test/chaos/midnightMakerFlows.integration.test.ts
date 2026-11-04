import { blueAbi } from "@morpho-org/blue-sdk-viem";
import {
  type MarketParams,
  MarketUtils,
  midnightAbi,
  Offer,
  Tree,
} from "@morpho-org/midnight-sdk";
import { wrapE2eNative } from "@morpho-org/morpho-test";
import {
  E2E_MIDNIGHT_WALLETS,
  type E2eMidnightMarket,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
  postE2eSetterTree,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type FaultOutcome,
  type FaultRule,
  fault,
} from "@morpho-org/test/chaos";
import {
  BaseError,
  type Client,
  getAbiItem,
  type Hex,
  maxUint256,
  parseEther,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect, vi } from "vitest";
import {
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
  type MorphoClientType,
  morphoViemExtension,
} from "../../src/index.js";
import { createE2eMarket } from "../e2e/setup.js";
import { seedDeadSupply } from "../helpers/blue.js";
import {
  expectMidnightFlowFailsClosed,
  midnightChaosTest,
  setUpMidnightChaosMarket,
  withMidnightFaultProxy,
} from "./midnightSetup.js";

type MidnightFlowClient = Client & { readonly morpho: MorphoClientType };
type MidnightFlow = (client: MidnightFlowClient) => Promise<{
  getRequirements: () => Promise<unknown>;
  buildTx: () => unknown;
}>;

const units = parseEther("1");
const multicall3 = base.contracts.multicall3.address;
const marketStateSelector = toFunctionSelector(
  getAbiItem({ abi: midnightAbi, name: "marketState" })!,
);
const consumedSelector = toFunctionSelector(
  getAbiItem({ abi: midnightAbi, name: "consumed" })!,
);
const debtSelector = toFunctionSelector(
  getAbiItem({ abi: midnightAbi, name: "debt" })!,
);

const priceTree = ({
  params,
  maker,
  buy,
  reduceOnly = false,
  maxUnits = 0n,
  maxAssets = 0n,
  tick = 5_000n,
  callback = zeroAddress,
  callbackData = "0x",
}: {
  readonly params: MarketParams;
  readonly maker: `0x${string}`;
  readonly buy: boolean;
  readonly reduceOnly?: boolean;
  readonly maxUnits?: bigint;
  readonly maxAssets?: bigint;
  readonly tick?: bigint;
  readonly callback?: `0x${string}`;
  readonly callbackData?: Hex;
}) =>
  Tree.create({
    type: "priceV1",
    entries: [
      {
        offer: Offer.create({
          market: params,
          buy,
          maker,
          expiry: params.maturity,
          tick,
          ratifier: getChainAddress(base.id, "priceRatifierV1"),
          receiverIfMakerIsSeller: buy ? zeroAddress : maker,
          reduceOnly,
          maxUnits,
          maxAssets,
          callback,
          callbackData,
        }),
      },
    ],
  });

const matchesMulticallSelector =
  (selector: Hex) =>
  ({ params }: { readonly params: unknown }) => {
    const request = JSON.stringify(params).toLowerCase();
    return (
      request.includes(multicall3.toLowerCase()) &&
      request.includes(selector.slice(2).toLowerCase())
    );
  };

const expectFaultedFlow = async ({
  client,
  flow,
  faultRule,
  outcome,
  category = "infra",
}: {
  readonly client: AnvilTestClient<typeof base>;
  readonly flow: MidnightFlow;
  readonly faultRule: FaultRule;
  readonly outcome: FaultOutcome;
  readonly category?: "infra" | "integrity";
}) => {
  await withMidnightFaultProxy(
    { client },
    async ({ client: healthy, proxy }) => {
      const action = await flow(healthy);
      await action.getRequirements();
      expect(action.buildTx()).toBeDefined();
      expect(proxy.log.some(({ method }) => method === faultRule.method)).toBe(
        true,
      );
      expect(
        proxy.log.some(({ method }) => method === "eth_sendRawTransaction"),
      ).toBe(false);
    },
  );

  await withMidnightFaultProxy(
    { client, faults: [faultRule] },
    async ({ client: faulted, proxy }) => {
      const error = await expectMidnightFlowFailsClosed(
        () => flow(faulted),
        category,
      );
      expect(error).toBeInstanceOf(BaseError);
      expect(proxy.log).toContainEqual({
        method: faultRule.method,
        outcome,
      });
      expect(
        proxy.log.some(({ method }) => method === "eth_sendRawTransaction"),
      ).toBe(false);
    },
  );
};

const setUpCreditAndDebt = async (
  client: AnvilTestClient<typeof base>,
  {
    params,
    marketData,
  }: {
    readonly params: MarketParams;
    readonly marketData: E2eMidnightMarket["marketData"];
  },
) => {
  const sharedClient = client as unknown as AnvilTestClient;
  const midnight = getChainAddress(base.id, "midnight");
  const maker = E2E_MIDNIGHT_WALLETS.A;
  const lender = E2E_MIDNIGHT_WALLETS.B;
  const collateralAssets = parseEther("10");
  await fundE2eMidnightWallets(sharedClient, {
    market: params,
    wallets: {
      A: { collateralAssets },
      B: { loanAssets: units },
    },
    approve: midnight,
  });
  await client.writeContract({
    account: maker,
    address: midnight,
    abi: midnightAbi,
    functionName: "supplyCollateral",
    args: [MarketUtils.toStruct(params), 0n, collateralAssets, maker],
  });
  const setterTree = Tree.create([
    Offer.create({
      market: params,
      buy: false,
      maker,
      expiry: params.maturity,
      tick: 5_000n,
      ratifier: getChainAddress(base.id, "setterRatifier"),
      maxUnits: units,
    }),
  ]);
  await postE2eSetterTree(sharedClient, {
    chainId: base.id,
    maker,
    tree: setterTree,
  });
  const { timestamp } = await client.getBlock();
  const take = (() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Number(timestamp * 1_000n)));
    try {
      return client
        .extend(morphoViemExtension())
        .morpho.midnight(base.id)
        .takeLend({
          marketData,
          accountAddress: lender,
          target: { type: "units", units, maxBuyerAssets: units },
          takeableOffers: getE2eTakeableOffers({ tree: setterTree, units }),
          maxContinuousFee: maxUint256,
          deadline: timestamp + 1_800n,
        });
    } finally {
      vi.useRealTimers();
    }
  })();
  for (const requirement of await take.getRequirements()) {
    await client.sendTransaction({ ...requirement, account: lender });
  }
  await client.sendTransaction({ ...take.buildTx(), account: lender });
  return { maker, lender };
};

describe.sequential("chaos: Midnight maker RPC", () => {
  midnightChaosTest(
    "makeLend fails closed when eth_blockNumber returns 503",
    { tags: ["nightly"] },
    async ({ client }) => {
      const { params, lender } = await setUpMidnightChaosMarket(client);
      const offers = priceTree({
        params,
        maker: lender,
        buy: true,
        maxAssets: units,
      });
      const flow: MidnightFlow = (proxied) =>
        proxied.morpho.midnight(base.id).makeLend({
          accountAddress: lender,
          offers,
          deadline: maxUint256,
          loanToken: params.loanToken,
          loanAssets: units,
          validation: false,
        });

      await expectFaultedFlow({
        client,
        flow,
        faultRule: {
          method: "eth_blockNumber",
          nth: 0,
          fault: fault.status(503),
        },
        outcome: "status",
      });
    },
  );

  midnightChaosTest(
    "supplyBlueMakeLend fails closed when marketState multicall returns an RPC error",
    { tags: ["nightly"] },
    async ({ client }) => {
      const { params } = await setUpMidnightChaosMarket(client);
      const maker = client.account.address;
      const sharedClient = client as unknown as AnvilTestClient;
      const blueMarket = await createE2eMarket(sharedClient, base.id);
      const blue = getChainAddress(base.id, "blue");
      const seedAssets = units;
      await wrapE2eNative(sharedClient, {
        wNative: params.loanToken,
        amount: seedAssets + units,
      });
      await client.approve({
        address: params.loanToken,
        args: [blue, seedAssets],
      });
      await client.writeContract({
        account: client.account,
        address: blue,
        abi: blueAbi,
        functionName: "supply",
        args: [blueMarket, seedAssets, 0n, maker, "0x"],
      });
      await seedDeadSupply({
        client: sharedClient,
        chainId: base.id,
        market: blueMarket,
      });
      const callbackSalt = `0x${"22".repeat(32)}` as Hex;
      const callback = getMidnightBlueBuyCallbackAddress({
        chainId: base.id,
        owner: maker,
        salt: callbackSalt,
      });
      const offers = priceTree({
        params,
        maker,
        buy: true,
        maxAssets: units,
        callback,
        callbackData: getMidnightBlueBuyCallbackData(blueMarket),
      });
      const flow: MidnightFlow = (proxied) =>
        proxied.morpho.midnight(base.id).supplyBlueMakeLend({
          accountAddress: maker,
          offers,
          blueMarket,
          assetsToPark: units,
          callbackSalt,
          deadline: maxUint256,
          validation: false,
        });

      await expectFaultedFlow({
        client,
        flow,
        faultRule: {
          method: "eth_call",
          match: matchesMulticallSelector(marketStateSelector),
          fault: fault.rpcError(-32005, "limit exceeded"),
        },
        outcome: "rpcError",
      });
    },
  );

  midnightChaosTest(
    "supplyCollateralMakeBorrow fails closed when oracle eth_getCode has a malformed response",
    { tags: ["nightly"] },
    async ({ client }) => {
      const { params, marketData } = await setUpMidnightChaosMarket(client);
      await setUpCreditAndDebt(client, { params, marketData });
      const maker = E2E_MIDNIGHT_WALLETS.B;
      const collateralAssets = units;
      await fundE2eMidnightWallets(client as unknown as AnvilTestClient, {
        market: params,
        wallets: { B: { collateralAssets } },
        approve: getChainAddress(base.id, "midnight"),
      });
      const offers = priceTree({
        params,
        maker,
        buy: false,
        maxUnits: units,
      });
      const flow: MidnightFlow = (proxied) =>
        proxied.morpho.midnight(base.id).supplyCollateralMakeBorrow({
          accountAddress: maker,
          offers,
          collateral: {
            market: params,
            supplies: [{ collateralIndex: 0n, assets: collateralAssets }],
          },
          deadline: maxUint256,
          validation: false,
        });

      await expectFaultedFlow({
        client,
        flow,
        faultRule: {
          method: "eth_getCode",
          match: ({ params: rpcParams }) => {
            const [address] = Array.isArray(rpcParams) ? rpcParams : [];
            return (
              typeof address === "string" &&
              address.toLowerCase() ===
                params.collateralParams[0]!.oracle.toLowerCase()
            );
          },
          fault: fault.rawBody("not json"),
        },
        outcome: "rawBody",
        category: "integrity",
      });
    },
  );

  midnightChaosTest(
    "makeWithdraw fails closed when eth_getBlockByNumber drops its response",
    { tags: ["nightly"] },
    async ({ client }) => {
      const { params, marketData } = await setUpMidnightChaosMarket(client);
      const { lender } = await setUpCreditAndDebt(client, {
        params,
        marketData,
      });
      const offers = priceTree({
        params,
        maker: lender,
        buy: false,
        reduceOnly: true,
        maxUnits: units,
      });
      const flow: MidnightFlow = (proxied) =>
        proxied.morpho.midnight(base.id).makeWithdraw({
          accountAddress: lender,
          offers,
          deadline: maxUint256,
          validation: false,
        });

      await expectFaultedFlow({
        client,
        flow,
        faultRule: {
          method: "eth_getBlockByNumber",
          nth: 0,
          fault: fault.forwardThenDrop(),
        },
        outcome: "forwardThenDrop",
      });
    },
  );

  midnightChaosTest(
    "makeRepay fails closed when debt multicall is refused",
    { tags: ["nightly"] },
    async ({ client }) => {
      const { params, marketData } = await setUpMidnightChaosMarket(client);
      const { maker } = await setUpCreditAndDebt(client, {
        params,
        marketData,
      });
      const offers = priceTree({
        params,
        maker,
        buy: true,
        reduceOnly: true,
        maxUnits: units,
      });
      const flow: MidnightFlow = (proxied) =>
        proxied.morpho.midnight(base.id).makeRepay({
          accountAddress: maker,
          offers,
          loanToken: params.loanToken,
          loanAssets: units,
          deadline: maxUint256,
          validation: false,
        });

      await expectFaultedFlow({
        client,
        flow,
        faultRule: {
          method: "eth_call",
          match: matchesMulticallSelector(debtSelector),
          fault: fault.refuse(),
        },
        outcome: "refuse",
      });
    },
  );

  midnightChaosTest(
    "cancelAndMake fails closed when consumed multicall is rate limited",
    { tags: ["nightly"] },
    async ({ client }) => {
      const { params, lender } = await setUpMidnightChaosMarket(client);
      const firstOffers = priceTree({
        params,
        maker: lender,
        buy: true,
        maxAssets: units,
      });
      const first = await client
        .extend(morphoViemExtension())
        .morpho.midnight(base.id)
        .makeLend({
          accountAddress: lender,
          offers: firstOffers,
          deadline: maxUint256,
          loanToken: params.loanToken,
          loanAssets: units,
          validation: false,
        });
      for (const requirement of await first.getRequirements()) {
        await client.sendTransaction({ ...requirement, account: lender });
      }
      await client.sendTransaction({ ...first.buildTx(), account: lender });
      const firstGroup = firstOffers.offers[0]!.group;
      const offers = priceTree({
        params,
        maker: lender,
        buy: true,
        tick: 4_000n,
        maxAssets: units,
      });
      const flow: MidnightFlow = (proxied) =>
        proxied.morpho.midnight(base.id).makeLend({
          accountAddress: lender,
          offers,
          cancellations: [{ group: firstGroup, maxConsumed: 0n }],
          deadline: maxUint256,
          loanToken: params.loanToken,
          loanAssets: units,
          validation: false,
        });

      await expectFaultedFlow({
        client,
        flow,
        faultRule: {
          method: "eth_call",
          match: matchesMulticallSelector(consumedSelector),
          fault: fault.status(429),
        },
        outcome: "status",
      });
    },
  );
});
