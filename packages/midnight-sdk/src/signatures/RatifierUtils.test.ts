import { describe, expect, test } from "vitest";
import { addresses, baseOffer } from "../__test__/fixtures.js";
import { InvalidTreeError } from "../errors.js";
import { RatifierUtils as RootRatifierUtils } from "../index.js";
import { RatifierUtils } from "./RatifierUtils.js";
import { Tree } from "./Tree.js";

describe("RatifierUtils.getRatifierInfo", () => {
  test("default", () => {
    expect(
      RatifierUtils.getRatifierInfo({
        bytecode: "0x",
        ecrecoverRatifier: addresses.ecrecoverRatifier,
        setterRatifier: addresses.setterRatifier,
      }),
    ).toEqual({ type: "ecrecover", ratifier: addresses.ecrecoverRatifier });

    expect(
      RatifierUtils.getRatifierInfo({
        bytecode: "0x6000",
        ecrecoverRatifier: addresses.ecrecoverRatifier,
        setterRatifier: addresses.setterRatifier,
      }).type,
    ).toBe("setter");
  });
});

describe("RatifierUtils.normalizeRatifierTree", () => {
  test("behavior: exported from package root", () => {
    expect(RootRatifierUtils.normalizeRatifierTree).toBe(
      RatifierUtils.normalizeRatifierTree,
    );
  });

  test("default", () => {
    const offer = baseOffer({
      maxAssets: 0n,
      ratifier: addresses.ecrecoverRatifier,
    });
    const tree = Tree.create([offer]);

    expect(
      RatifierUtils.normalizeRatifierTree({
        tree,
        label: "Ecrecover",
      }),
    ).toEqual({
      tree,
      ratifier: addresses.ecrecoverRatifier,
    });
  });

  test("behavior: accepts plain tree input", () => {
    const offer = baseOffer({
      maxAssets: 0n,
      ratifier: addresses.setterRatifier,
    });

    const { tree, ratifier } = RatifierUtils.normalizeRatifierTree({
      tree: [offer],
      label: "Setter",
    });

    expect(tree.offers).toEqual([offer]);
    expect(ratifier).toBe(addresses.setterRatifier);
  });

  test("error: InvalidTreeError mixed ratifiers", () => {
    const tree = Tree.create([
      baseOffer({
        maxAssets: 0n,
        ratifier: addresses.ecrecoverRatifier,
      }),
      baseOffer({
        maxAssets: 0n,
        ratifier: addresses.setterRatifier,
      }),
    ]);

    expect(() =>
      RatifierUtils.normalizeRatifierTree({
        tree,
        label: "Ecrecover",
      }),
    ).toThrow(InvalidTreeError);
  });
});
