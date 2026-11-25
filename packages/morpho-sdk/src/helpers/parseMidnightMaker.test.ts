import { Tree } from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightBaseOffer,
  midnightChainId,
} from "../../test/fixtures/midnight.js";
import { parseMidnightAccount } from "./parseMidnight.js";
import {
  parseMidnightMakerBinding,
  parseMidnightMakerFundingBinding,
  parseMidnightMakerIntent,
} from "./parseMidnightMaker.js";

const accountAddress = parseMidnightAccount(
  "accountAddress",
  midnightAddresses.maker,
);
describe("maker parsing", () => {
  test.each(["priceV1", "rateV1"] as const)(
    "%s binds the supplied root without freezing the tree",
    (type) => {
      const offer = midnightBaseOffer({
        buy: true,
        ratifier: getChainAddress(
          midnightChainId,
          type === "priceV1" ? "priceRatifierV1" : "rateRatifierV1",
        ),
      });
      const tree =
        type === "priceV1"
          ? Tree.create({ type, entries: [{ offer }] })
          : Tree.create({ type, entries: [{ offer, rate: 0n }] });
      const intent = parseMidnightMakerIntent({
        offers: tree,
        accountAddress,
        side: "lend",
        reduceOnly: false,
      });
      const binding = parseMidnightMakerBinding({
        tree: intent.tree,
        accountAddress,
        chainId: midnightChainId,
      });
      expect(binding.tree).toBe(tree);
      expect(binding.tree.root).toBe(tree.root);
      expect(binding.ratifierType).toBe(type);
      expect(Object.isFrozen(tree)).toBe(false);
      expect(
        parseMidnightMakerFundingBinding({
          tree,
          loanToken: midnightAddresses.loanToken,
        }).loanToken,
      ).toBe(midnightAddresses.loanToken);
      expect(() =>
        parseMidnightMakerBinding({
          tree,
          accountAddress: parseMidnightAccount(
            "accountAddress",
            midnightAddresses.taker,
          ),
          chainId: midnightChainId,
        }),
      ).toThrow(
        expect.objectContaining({ name: "MidnightOfferMakerMismatchError" }),
      );
      expect(() =>
        parseMidnightMakerFundingBinding({ tree, loanToken: zeroAddress }),
      ).toThrow(
        expect.objectContaining({
          name: "MidnightOfferMarketLoanTokenMismatchError",
        }),
      );
      expect(() =>
        parseMidnightMakerFundingBinding({
          tree,
          loanToken: midnightAddresses.loanToken,
          callback: { address: midnightAddresses.taker, data: "0x" },
        }),
      ).toThrow(
        expect.objectContaining({ name: "MidnightOfferCallbackMismatchError" }),
      );
      expect(() =>
        parseMidnightMakerFundingBinding({
          tree,
          loanToken: midnightAddresses.loanToken,
          callback: { address: zeroAddress, data: "0xdead" },
        }),
      ).toThrow(
        expect.objectContaining({
          name: "MidnightOfferCallbackDataMismatchError",
        }),
      );
    },
  );
  test.each([true, false])(
    "requires the selected reduce-only intent (%s)",
    (reduceOnly) => {
      const offer = midnightBaseOffer({
        buy: true,
        reduceOnly: !reduceOnly,
        ratifier: getChainAddress(midnightChainId, "priceRatifierV1"),
      });
      expect(() =>
        parseMidnightMakerIntent({
          offers: { type: "priceV1", entries: [{ offer }] },
          accountAddress,
          side: "lend",
          reduceOnly,
        }),
      ).toThrow(
        expect.objectContaining({
          name: reduceOnly
            ? "MidnightOfferNotReduceOnlyError"
            : "MidnightOfferReduceOnlyError",
        }),
      );
    },
  );
  test("rejects empty trees", () => {
    expect(() =>
      parseMidnightMakerIntent({
        offers: { type: "priceV1", entries: [] },
        accountAddress,
        side: "lend",
        reduceOnly: false,
      }),
    ).toThrow();
  });
});
