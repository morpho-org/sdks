import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { describe, expect, test, vi } from "vitest";
import { createFixtures } from "../__test__/fixtures.js";
import { InvalidTreeError } from "../errors.js";
import { GroupUtils } from "./GroupUtils.js";
import { Ratifier } from "./Ratifier.js";
import { SetterRatifier } from "./SetterRatifier.js";
import { Tree } from "./Tree.js";
import { TreeUtils } from "./TreeUtils.js";

const root =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
const proofNode =
  "0x4444444444444444444444444444444444444444444444444444444444444444" as const;
const ecrecoverRatifier = getChainAddress(
  ChainId.BaseMainnet,
  "ecrecoverRatifier",
);
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const { baseOffer } = createFixtures({
  midnight: getChainAddress(ChainId.BaseMainnet, "midnight"),
  ecrecoverRatifier,
});

describe("SetterRatifier.ratify", () => {
  test("default", () => {
    const offer = baseOffer({
      maxAssets: 0n,
      ratifier: setterRatifier,
    });
    const tree = Tree.create([offer]);

    const items = SetterRatifier.ratify({ tree });
    const decoded = SetterRatifier.decodeRatifierData(items[0]!.ratifierData);

    expect(items).toHaveLength(1);
    expect(items[0]!.offer).toBe(tree.offers[0]);
    expect(
      TreeUtils.verifyProof({
        offer: items[0]!.offer,
        root: decoded.root,
        leafIndex: decoded.leafIndex,
        proof: decoded.proof,
      }),
    ).toBe(true);
  });

  test("behavior: ratifies a padded multi-offer tree", () => {
    const tree = Tree.create(
      [1n, 2n, 3n].map((maxUnits) =>
        baseOffer({ maxAssets: 0n, ratifier: setterRatifier, maxUnits }),
      ),
    );

    const items = SetterRatifier.ratify({ tree });

    expect(items).toHaveLength(3);
    for (const [index, item] of items.entries()) {
      const decoded = SetterRatifier.decodeRatifierData(item.ratifierData);
      expect(decoded.leafIndex).toBe(BigInt(index));
      expect(
        TreeUtils.verifyProof({
          offer: item.offer,
          root: decoded.root,
          leafIndex: decoded.leafIndex,
          proof: decoded.proof,
        }),
      ).toBe(true);
    }
  });

  test("behavior: accepts plain tree input", () => {
    const offer = baseOffer({
      maxAssets: 0n,
      ratifier: setterRatifier,
    });

    const items = SetterRatifier.ratify({ tree: offer });
    const decoded = SetterRatifier.decodeRatifierData(items[0]!.ratifierData);

    expect(items).toHaveLength(1);
    expect(items[0]!.offer).not.toBe(offer);
    expect(items[0]!.offer.group).toBe(GroupUtils.hash([offer]));
    expect(
      TreeUtils.verifyProof({
        offer: items[0]!.offer,
        root: decoded.root,
        leafIndex: decoded.leafIndex,
        proof: decoded.proof,
      }),
    ).toBe(true);
  });

  test("behavior: does not revalidate per offer", () => {
    const tree = Tree.create([
      baseOffer({ maxAssets: 0n, maxUnits: 1n, ratifier: setterRatifier }),
      baseOffer({ maxAssets: 0n, maxUnits: 2n, ratifier: setterRatifier }),
    ]);
    const normalize = vi.spyOn(Ratifier, "normalizeRatifierTree");

    try {
      SetterRatifier.ratify({ tree });

      expect(
        normalize.mock.calls.filter(([params]) => params.tree === tree),
      ).toHaveLength(1);
    } finally {
      normalize.mockRestore();
    }
  });

  test("error: InvalidTreeError mixed ratifiers", () => {
    const tree = Tree.create([
      baseOffer({
        maxAssets: 0n,
        ratifier: setterRatifier,
      }),
      baseOffer({
        maxAssets: 0n,
        ratifier: ecrecoverRatifier,
      }),
    ]);

    expect(() => SetterRatifier.ratify({ tree })).toThrow(InvalidTreeError);
  });
});

describe("SetterRatifier.ratifierData", () => {
  test("error: InvalidTreeError mixed ratifiers", () => {
    const tree = Tree.create([
      baseOffer({
        maxAssets: 0n,
        ratifier: setterRatifier,
      }),
      baseOffer({
        maxAssets: 0n,
        ratifier: ecrecoverRatifier,
      }),
    ]);

    expect(() => SetterRatifier.ratifierData({ tree, leafIndex: 0n })).toThrow(
      InvalidTreeError,
    );
  });
});

describe("SetterRatifier.verifyRatifierData", () => {
  test("behavior: verifies proof and returns decoded ratifier data", () => {
    const offer = baseOffer({
      maxAssets: 0n,
      ratifier: setterRatifier,
    });
    const tree = Tree.create([offer]);
    const data = SetterRatifier.ratifierData({ tree, leafIndex: 0n });

    const decoded = SetterRatifier.verifyRatifierData({
      offer: tree.offers[0]!,
      ratifierData: data,
    });

    expect(decoded.root).toBe(tree.root);
    expect(decoded.leafIndex).toBe(0n);
  });

  test("error: InvalidTreeError when ratifier data proof does not match offer", () => {
    const tree = Tree.create([
      baseOffer({
        maxAssets: 0n,
        ratifier: setterRatifier,
      }),
      baseOffer({
        maxAssets: 0n,
        maxUnits: 2n,
        ratifier: setterRatifier,
      }),
    ]);
    const data = SetterRatifier.ratifierData({ tree, leafIndex: 0n });

    expect(() =>
      SetterRatifier.verifyRatifierData({
        offer: tree.offers[1]!,
        ratifierData: data,
      }),
    ).toThrow(InvalidTreeError);
  });
});

describe("SetterRatifier.encodeRatifierData", () => {
  test("behavior: decode round trip", () => {
    const data = SetterRatifier.encodeRatifierData({
      root,
      leafIndex: 3n,
      proof: [proofNode],
    });

    expect(SetterRatifier.decodeRatifierData(data)).toEqual({
      root,
      leafIndex: 3n,
      proof: [proofNode],
    });
  });
});
