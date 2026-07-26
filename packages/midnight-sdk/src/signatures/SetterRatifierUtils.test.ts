import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { describe, expect, test } from "vitest";
import { createFixtures } from "../__test__/fixtures.js";
import { InvalidTreeError } from "../errors.js";
import { GroupUtils } from "./GroupUtils.js";
import { SetterRatifierUtils } from "./SetterRatifierUtils.js";
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

describe("SetterRatifierUtils.ratify", () => {
  test("default", () => {
    const offer = baseOffer({
      maxAssets: 0n,
      ratifier: setterRatifier,
    });
    const tree = Tree.create([offer]);

    const items = SetterRatifierUtils.ratify({ tree });
    const decoded = SetterRatifierUtils.decodeRatifierData(
      items[0]!.ratifierData,
    );

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

  test("behavior: accepts plain tree input", () => {
    const offer = baseOffer({
      maxAssets: 0n,
      ratifier: setterRatifier,
    });

    const items = SetterRatifierUtils.ratify({ tree: offer });
    const decoded = SetterRatifierUtils.decodeRatifierData(
      items[0]!.ratifierData,
    );

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

    expect(() => SetterRatifierUtils.ratify({ tree })).toThrow(
      InvalidTreeError,
    );
  });
});

describe("SetterRatifierUtils.ratifierData", () => {
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

    expect(() =>
      SetterRatifierUtils.ratifierData({ tree, leafIndex: 0n }),
    ).toThrow(InvalidTreeError);
  });
});

describe("SetterRatifierUtils.verifyRatifierData", () => {
  test("behavior: verifies proof and returns decoded ratifier data", () => {
    const offer = baseOffer({
      maxAssets: 0n,
      ratifier: setterRatifier,
    });
    const tree = Tree.create([offer]);
    const data = SetterRatifierUtils.ratifierData({ tree, leafIndex: 0n });

    const decoded = SetterRatifierUtils.verifyRatifierData({
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
    const data = SetterRatifierUtils.ratifierData({ tree, leafIndex: 0n });

    expect(() =>
      SetterRatifierUtils.verifyRatifierData({
        offer: tree.offers[1]!,
        ratifierData: data,
      }),
    ).toThrow(InvalidTreeError);
  });
});

describe("SetterRatifierUtils.encodeRatifierData", () => {
  test("behavior: decode round trip", () => {
    const data = SetterRatifierUtils.encodeRatifierData({
      root,
      leafIndex: 3n,
      proof: [proofNode],
    });

    expect(SetterRatifierUtils.decodeRatifierData(data)).toEqual({
      root,
      leafIndex: 3n,
      proof: [proofNode],
    });
  });
});
