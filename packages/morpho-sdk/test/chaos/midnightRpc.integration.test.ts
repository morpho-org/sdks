import { Offer, Tree } from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { fault } from "@morpho-org/test/chaos";
import { maxUint256, parseEther, zeroAddress } from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  expectMidnightFlowFailsClosed,
  midnightChaosTest,
  setUpMidnightChaosMarket,
  withMidnightFaultProxy,
} from "./midnightSetup.js";

describe("chaos: Midnight RPC", () => {
  midnightChaosTest(
    "fails closed when makeLend's first Midnight eth_call is refused",
    { tags: ["nightly"] },
    async ({ client }) => {
      const { params, lender } = await setUpMidnightChaosMarket(client);
      const loanAssets = parseEther("1");
      const offers = Tree.create({
        type: "priceV1",
        entries: [
          {
            offer: Offer.create({
              market: params,
              buy: true,
              maker: lender,
              expiry: params.maturity,
              tick: 5_000n,
              ratifier: getChainAddress(base.id, "priceRatifierV1"),
              receiverIfMakerIsSeller: zeroAddress,
              reduceOnly: false,
              maxUnits: 0n,
              maxAssets: loanAssets,
            }),
          },
        ],
      });
      const makeLendParams = {
        accountAddress: lender,
        offers,
        deadline: maxUint256,
        loanToken: params.loanToken,
        loanAssets,
        validation: false as const,
      };

      await withMidnightFaultProxy(
        { client },
        async ({ client: healthyClient, proxy }) => {
          const action = await healthyClient.morpho
            .midnight(base.id)
            .makeLend(makeLendParams);
          expect(action).toBeDefined();
          expect(proxy.log.some(({ method }) => method === "eth_call")).toBe(
            true,
          );
        },
      );

      await withMidnightFaultProxy(
        {
          client,
          faults: [{ method: "eth_call", nth: 0, fault: fault.refuse() }],
        },
        async ({ client: faultedClient, proxy }) => {
          await expectMidnightFlowFailsClosed(
            () =>
              faultedClient.morpho.midnight(base.id).makeLend(makeLendParams),
            "infra",
          );
          expect(proxy.log.find(({ method }) => method === "eth_call")).toEqual(
            { method: "eth_call", outcome: "refuse" },
          );
          expect(
            proxy.log.some(({ method }) => method === "eth_sendRawTransaction"),
          ).toBe(false);
        },
      );
    },
  );
});
