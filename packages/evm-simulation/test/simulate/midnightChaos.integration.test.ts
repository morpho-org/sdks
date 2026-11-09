import {
  isRequirementSignature,
  midnightSupplyCollateral,
  midnightTakeLend,
  morphoViemExtension,
  type Transaction,
} from "@morpho-org/morpho-sdk";
import { midnightAbi } from "@morpho-org/morpho-sdk/abis";
import { setterRatifierAbi } from "@morpho-org/morpho-sdk/midnight/abis";
import {
  MarketParams,
  Offer,
  Tree,
} from "@morpho-org/morpho-sdk/midnight/entities";
import {
  OfferUtils,
  SetterRatifierUtils,
} from "@morpho-org/morpho-sdk/midnight/utils";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import {
  createFaultProxy,
  expectFailClosed,
  type FaultProxy,
  type FaultRule,
  fault,
} from "@morpho-org/test/chaos";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  erc20Abi,
  maxUint256,
  parseEther,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  InvalidSimulationResponseError,
  RpcTransportError,
  type SimulateParams,
  SlippageCheckUnavailableError,
  simulate,
  toSimulationLimits,
} from "../../src/index.js";

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

const midnight = getChainAddress(base.id, "midnight");
const setterRatifier = getChainAddress(base.id, "setterRatifier");
const rateRatifierV1 = getChainAddress(base.id, "rateRatifierV1");
const usdc = getChainAddress(base.id, "usdc");
const wNative = getChainAddress(base.id, "wNative");
const oracle: Address = "0x0000000000000000000000000000000000080000";
const maker: Address = "0x9000000000000000000000000000000000000000";
const revertingToken: Address = "0x00000000000000000000000000000000000c4A05";
const assets = parseEther("1");
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
const configFor = (url: string) => ({
  chains: new Map([[base.id, { simulateV1Url: url }]]),
  timeoutMs: 30_000,
});

async function buildMidnight(
  client: AnvilTestClient<typeof base>,
  kind: "takeLend" | "supplyCollateralMakeBorrow",
) {
  const owner = client.account.address;
  await client.setBalance({ address: owner, value: parseEther("10") });
  await client.setBalance({ address: maker, value: parseEther("1") });
  // Fixed 1:1 oracle, matching the existing Midnight limits fork fixtures.
  await client.setCode({
    address: oracle,
    bytecode:
      "0x7f0000000000000000000000000000000000c097ce7bc90715b34b9f100000000060005260206000f3",
  });
  await client.deal({ erc20: wNative, account: maker, amount: assets });
  await client.writeContract({
    account: maker,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });
  await client.sendTransaction({
    account: maker,
    ...midnightSupplyCollateral({
      chainId: base.id,
      market,
      assets,
      onBehalf: maker,
    }),
  });
  await client.deal({ erc20: wNative, amount: assets });
  await client.deal({ erc20: usdc, amount: 10_000_000n });

  let tx: Transaction;
  if (kind === "takeLend") {
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [setterRatifier, true, maker],
    });
    const tree = Tree.create([
      Offer.create({
        market,
        buy: false,
        maker,
        expiry: market.maturity,
        tick: 5_000n,
        ratifier: setterRatifier,
        maxUnits: 10_000_000n,
        continuousFeeCap: 0n,
      }),
    ]);
    await client.writeContract({
      account: maker,
      address: setterRatifier,
      abi: setterRatifierAbi,
      functionName: "setIsRootRatified",
      args: [maker, tree.root, true],
    });
    const item = SetterRatifierUtils.ratify({ tree })[0]!;
    tx = midnightTakeLend({
      chainId: base.id,
      market,
      target: { type: "assets", assets: 1_000_000n, minUnits: 1n },
      takeableOffers: [
        {
          units: 10_000_000n,
          offer: OfferUtils.toStruct({ offer: item.offer }),
          ratifierData: item.ratifierData,
        },
      ],
      maxContinuousFee: maxUint256,
      deadline: market.maturity,
    });
    await client.writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [tx.to, maxUint256],
    });
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [tx.to, true, owner],
    });
  } else {
    const offers = Tree.create({
      type: "rateV1",
      entries: [
        {
          offer: Offer.create({
            market,
            buy: false,
            maker: owner,
            expiry: market.maturity,
            tick: 5_000n,
            group: `0x${"aa".repeat(32)}`,
            ratifier: rateRatifierV1,
            continuousFeeCap: 0n,
            receiverIfMakerIsSeller: owner,
            reduceOnly: false,
            maxUnits: 0n,
            maxAssets: 1_000_000n,
            callback: zeroAddress,
            callbackData: "0x",
          }),
          rate: 1_000_000_000n,
        },
      ],
    });
    const output = await client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.midnight(base.id)
      .supplyCollateralMakeBorrow({
        accountAddress: owner,
        offers,
        collateral: { market, supplies: [{ collateralIndex: 0n, assets }] },
        deadline: maxUint256,
        validation: {
          apiUrl: "https://api.example/base/",
          fetch: async () =>
            new Response(JSON.stringify({ data: { issues: [] } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
        },
      });
    for (const requirement of await output.getRequirements()) {
      expect(isRequirementSignature(requirement)).toBe(false);
      if (!isRequirementSignature(requirement))
        await client.sendTransaction(requirement);
    }
    tx = output.buildTx();
  }
  const params = {
    chainId: base.id,
    transactions: [{ from: owner, to: tx.to, data: tx.data, value: tx.value }],
    limits: toSimulationLimits(tx.action, { owner }),
  } satisfies SimulateParams;
  return { tx, before: structuredClone(tx), params };
}

async function withProxy(
  {
    client,
    faults,
  }: { client: AnvilTestClient<typeof base>; faults: readonly FaultRule[] },
  run: (proxy: FaultProxy) => Promise<void>,
) {
  const proxy = await createFaultProxy({
    upstream: client.transport.url!,
    faults,
  });
  try {
    await run(proxy);
  } finally {
    await proxy.kill();
  }
}

for (const kind of ["takeLend", "supplyCollateralMakeBorrow"] as const) {
  describe.sequential(`Midnight chaos: ${kind}`, () => {
    test("healthy control verifies Midnight limits", {
      tags: ["nightly"],
    }, async ({ client }) => {
      const { params } = await buildMidnight(client, kind);
      await withProxy({ client, faults: [] }, async (proxy) => {
        const result = await simulate(configFor(proxy.url), params);
        expect(result.simulationTxs).toHaveLength(1);
        expect(result.verification.operations[0]?.operation).toBe(
          kind === "takeLend"
            ? "midnightTakeLend"
            : "midnightSupplyCollateralMakeBorrow",
        );
        expect(
          proxy.log
            .filter((entry) => entry.method === "eth_simulateV1")
            .map((entry) => entry.outcome),
        ).toEqual(["forwarded"]);
      });
    });

    test("RPC down before eth_simulateV1 fails closed", {
      tags: ["nightly"],
    }, async ({ client }) => {
      const { tx, before, params } = await buildMidnight(client, kind);
      await withProxy(
        {
          client,
          faults: [{ method: "eth_getBlockByNumber", fault: fault.refuse() }],
        },
        async (proxy) => {
          const error = await expectFailClosed(
            simulate(configFor(proxy.url), params),
            "infra",
          );
          expect(error).toBeInstanceOf(RpcTransportError);
          expect(
            proxy.log.filter((entry) => entry.method === "eth_simulateV1"),
          ).toEqual([]);
          expect(proxy.log[0]?.outcome).toBe("refuse");
        },
      );
      expect(Object.isFrozen(tx)).toBe(true);
      expect(tx).toEqual(before);
    });

    test.for([
      {
        rule: fault.refuse(),
        errorClass: RpcTransportError,
        category: "infra",
      },
      {
        rule: fault.status(503),
        errorClass: RpcTransportError,
        category: "infra",
      },
      {
        rule: fault.forwardThenDrop(),
        errorClass: RpcTransportError,
        category: "infra",
      },
      {
        rule: fault.rpcError(-32603, "Midnight simulation unavailable"),
        errorClass: RpcTransportError,
        category: "infra",
      },
      {
        rule: fault.rawBody('{"jsonrpc":"2.0","id":1,"result":null}'),
        errorClass: InvalidSimulationResponseError,
        category: "integrity",
      },
    ] as const)(
      "eth_simulateV1 $rule.kind fails closed",
      { tags: ["nightly"] },
      async ({ rule, errorClass, category }, { client }) => {
        const { tx, before, params } = await buildMidnight(client, kind);
        await withProxy(
          { client, faults: [{ method: "eth_simulateV1", fault: rule }] },
          async (proxy) => {
            const error = await expectFailClosed(
              simulate(configFor(proxy.url), params),
              category,
            );
            expect(error).toBeInstanceOf(errorClass);
            expect(
              proxy.log
                .filter((entry) => entry.method === "eth_getBlockByNumber")
                .map((entry) => entry.outcome),
            ).toEqual(["forwarded"]);
            expect(
              proxy.log
                .filter((entry) => entry.method === "eth_simulateV1")
                .map((entry) => entry.outcome),
            ).toEqual([rule.kind]);
          },
        );
        expect(Object.isFrozen(tx)).toBe(true);
        expect(tx).toEqual(before);
      },
    );

    if (kind === "supplyCollateralMakeBorrow")
      test("successful eth_simulateV1 with a failed planned read fails closed", {
        tags: ["nightly"],
      }, async ({ client }) => {
        const { tx, before, params } = await buildMidnight(client, kind);
        await client.setCode({
          address: revertingToken,
          bytecode: "0x60006000fd",
        });
        await withProxy({ client, faults: [] }, async (proxy) => {
          const error = await expectFailClosed(
            simulate(configFor(proxy.url), {
              ...params,
              limits: {
                ...params.limits,
                operations: params.limits.operations.map((operation) => {
                  if (
                    operation.type !== "midnightSupplyCollateral" &&
                    operation.type !== "midnightSupplyCollateralMakeBorrow"
                  )
                    throw new Error("Unexpected Midnight operation");
                  const { market: _market, ...limit } = operation;
                  return { ...limit, assetPaid: revertingToken };
                }),
              },
            }),
            "integrity",
          );
          expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
          expect(error.cause).toMatchObject({ code: 3 });
          expect(
            proxy.log
              .filter((entry) => entry.method === "eth_simulateV1")
              .map((entry) => entry.outcome),
          ).toEqual(["forwarded"]);
        });
        expect(Object.isFrozen(tx)).toBe(true);
        expect(tx).toEqual(before);
      });
  });
}
