import { describe, expect, test } from "vitest";
import { baseOffer } from "../__test__/fixtures.js";
import { SetterRatifierUtils } from "./SetterRatifierUtils.js";
import { Tree } from "./Tree.js";
import { TreeUtils } from "./TreeUtils.js";

const root =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
const proofNode =
  "0x4444444444444444444444444444444444444444444444444444444444444444" as const;

describe("SetterRatifierUtils.ratify", () => {
  test("default", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const tree = Tree.create(offer);

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
