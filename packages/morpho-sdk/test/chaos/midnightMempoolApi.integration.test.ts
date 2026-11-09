import {
  InvalidMidnightApiResponseError,
  MidnightApiError,
  midnightAbi,
  Offer,
  OfferUtils,
  RateRatifierV1,
  Tree,
} from "@morpho-org/midnight-sdk";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { zeroAddress, zeroHash } from "viem";
import { base } from "viem/chains";
import { describe, expect, vi } from "vitest";
import {
  isRequirementSignature,
  morphoViemExtension,
} from "../../src/index.js";
import {
  expectMidnightFlowFailsClosed,
  midnightChaosTest,
  setUpMidnightChaosMarket,
  withMidnightFaultProxy,
} from "./midnightSetup.js";

const test = midnightChaosTest.extend<{
  market: Awaited<ReturnType<typeof setUpMidnightChaosMarket>> & {
    lendTree: Tree<"rateV1">;
    withdrawTree: Tree<"rateV1">;
  };
}>({
  market: async ({ client }, use) => {
    const market = await setUpMidnightChaosMarket(client);
    const { params, lender, borrower } = market;
    const lendTree = Tree.create({
      type: "rateV1",
      entries: [
        {
          offer: Offer.create({
            market: params,
            maker: lender,
            buy: true,
            tick: 5_000n,
            expiry: params.maturity,
            ratifier: getChainAddress(base.id, "rateRatifierV1"),
            maxAssets: 1_000_000n,
          }),
          rate: 0n,
        },
      ],
    });
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);
    const publication = await entity.makeLend({
      accountAddress: lender,
      offers: lendTree,
      loanToken: params.loanToken,
      loanAssets: 1_000_000n,
      deadline: Time.timestamp() + 600n,
      validation: false,
    });
    for (const requirement of await publication.getRequirements()) {
      if (isRequirementSignature(requirement)) {
        expect.unreachable("expected onchain publication requirements");
      }
      await client.sendTransaction({ ...requirement, account: lender });
    }
    await client.sendTransaction({ ...publication.buildTx(), account: lender });
    const [item] = RateRatifierV1.ratify({ tree: lendTree });
    await client.writeContract({
      account: borrower,
      address: params.midnight,
      abi: midnightAbi,
      functionName: "take",
      args: [
        OfferUtils.toStruct({ offer: item!.offer }),
        item!.ratifierData,
        500_000n,
        borrower,
        borrower,
        zeroAddress,
        "0x",
      ],
      gas: 8_000_000n,
    });
    await expect(
      client.readContract({
        address: params.midnight,
        abi: midnightAbi,
        functionName: "credit",
        args: [market.marketData.id, lender],
      }),
    ).resolves.toBeGreaterThan(0n);
    const withdrawTree = Tree.create({
      type: "rateV1",
      entries: [
        {
          offer: Offer.create({
            ...lendTree.offers[0]!,
            buy: false,
            reduceOnly: true,
            receiverIfMakerIsSeller: lender,
            group: zeroHash,
            maxAssets: 0n,
            maxUnits: 100_000n,
          }),
          rate: 1_000_000_000_000_000_000n,
        },
      ],
    });
    await use({ ...market, lendTree, withdrawTree });
  },
});

const timeoutError = new DOMException(
  "The operation timed out.",
  "TimeoutError",
);

const cases = [
  {
    name: "HTTP 503",
    fetch: async () => new Response("Service unavailable", { status: 503 }),
    error: MidnightApiError,
  },
  {
    name: "timeout rejection",
    fetch: async () => {
      throw timeoutError;
    },
    error: DOMException,
  },
  {
    name: "non-JSON HTTP 200",
    fetch: async () => new Response("<html>not JSON</html>", { status: 200 }),
    error: InvalidMidnightApiResponseError,
  },
  {
    name: "schema-invalid HTTP 200",
    fetch: async () => Response.json({ data: { issues: "not an array" } }),
    error: InvalidMidnightApiResponseError,
  },
] as const;

describe("Midnight maker mempool API faults with healthy RPC", () => {
  for (const flow of ["makeLend", "makeWithdraw"] as const) {
    for (const scenario of cases) {
      test(`${flow}: ${scenario.name} returns no Transaction`, {
        tags: ["nightly"],
      }, async ({ client, market }) => {
        const validationFetch = vi.fn(scenario.fetch);
        await withMidnightFaultProxy(
          { client },
          async ({ proxy, client: faultClient }) => {
            const entity = faultClient.morpho.midnight(base.id);
            const error = await expectMidnightFlowFailsClosed(
              () =>
                entity[flow]({
                  accountAddress: market.lender,
                  offers:
                    flow === "makeLend" ? market.lendTree : market.withdrawTree,
                  loanToken: market.params.loanToken,
                  loanAssets: 100_000n,
                  deadline: Time.timestamp() + 600n,
                  validation: {
                    apiUrl: "https://api.example/base/",
                    fetch: validationFetch,
                  },
                }),
              scenario.error,
            );
            expect(validationFetch).toHaveBeenCalledOnce();
            expect(proxy.log.length).toBeGreaterThan(0);
            expect(
              proxy.log.every((entry) => entry.outcome === "forwarded"),
            ).toBe(true);
            if (scenario.error === DOMException) {
              expect(error).toBe(timeoutError);
              expect(error.name).toBe("TimeoutError");
              expect(error).not.toBeInstanceOf(MidnightApiError);
            }
            if (error instanceof MidnightApiError)
              expect(error.status).toBe(503);
          },
        );
      });
    }
  }
});
