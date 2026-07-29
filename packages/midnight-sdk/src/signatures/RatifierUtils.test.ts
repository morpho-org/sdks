import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { describe, expect, test } from "vitest";
import { createFixtures, group as staleGroup } from "../__test__/fixtures.js";
import { InvalidTreeError } from "../errors.js";
import { RatifierUtils as RootRatifierUtils } from "../index.js";
import { OfferUtils } from "../offers/index.js";
import { Group } from "./Group.js";
import { GroupUtils } from "./GroupUtils.js";
import { EMPTY_OFFER_STRUCT } from "./offerStructInternal.js";
import { RatifierUtils } from "./RatifierUtils.js";
import { Tree } from "./Tree.js";
import { TreeUtils } from "./TreeUtils.js";

const ecrecoverRatifier = getChainAddress(
  ChainId.BaseMainnet,
  "ecrecoverRatifier",
);
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const { baseOffer } = createFixtures({
  midnight: getChainAddress(ChainId.BaseMainnet, "midnight"),
  ecrecoverRatifier,
});

describe("RatifierUtils.getRatifierInfo", () => {
  test("default", () => {
    expect(
      RatifierUtils.getRatifierInfo({
        bytecode: "0x",
        ecrecoverRatifier,
        setterRatifier,
      }),
    ).toEqual({ type: "ecrecover", ratifier: ecrecoverRatifier });

    expect(
      RatifierUtils.getRatifierInfo({
        bytecode: "0x6000",
        ecrecoverRatifier,
        setterRatifier,
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
      ratifier: ecrecoverRatifier,
    });
    const tree = Tree.create([offer]);

    expect(
      RatifierUtils.normalizeRatifierTree({
        tree,
        label: "Ecrecover",
      }),
    ).toEqual({
      tree,
      ratifier: ecrecoverRatifier,
    });
  });

  test("behavior: accepts plain tree input", () => {
    const offer = baseOffer({
      maxAssets: 0n,
      ratifier: setterRatifier,
    });

    const { tree, ratifier } = RatifierUtils.normalizeRatifierTree({
      tree: [offer],
      label: "Setter",
    });

    expect(tree.offers).toHaveLength(1);
    expect(tree.offers[0]).not.toBe(offer);
    expect(tree.offers[0]!.group).toBe(GroupUtils.hash([offer]));
    expect(ratifier).toBe(setterRatifier);
  });

  test("behavior: preserves grouped TreeLike descriptors", () => {
    const first = baseOffer({ maxAssets: 0n, tick: 4_000n });
    const second = baseOffer({ maxAssets: 0n, tick: 5_000n });
    const groupedTree = Tree.create([Group.create([first, second])]);

    const { tree } = RatifierUtils.normalizeRatifierTree({
      tree: groupedTree,
      label: "Ecrecover",
    });

    expect(tree.root).toBe(groupedTree.root);
    expect(tree.paddedOffers[0]!.group).toBe(
      groupedTree.paddedOffers[0]!.group,
    );
  });

  test("behavior: preserves caller-provided TreeLike root and padding", () => {
    const group = Group.create([
      baseOffer({
        maxAssets: 0n,
        ratifier: ecrecoverRatifier,
      }),
    ]);
    const offer = group.offers[0]!;
    const paddedOffers = [
      OfferUtils.toStruct({ offer }),
      EMPTY_OFFER_STRUCT,
    ] as const;
    const leaves = paddedOffers.map(OfferUtils.hashStruct);
    const root = TreeUtils.hashNode(leaves[0]!, leaves[1]!);
    const treeLike = {
      offers: [offer],
      paddedOffers,
      leaves,
      root,
      height: 1,
    } as const;

    const { tree, ratifier } = RatifierUtils.normalizeRatifierTree({
      tree: treeLike,
      label: "Ecrecover",
    });

    expect(tree.paddedOffers).toBe(paddedOffers);
    expect(tree.leaves).toBe(leaves);
    expect(tree.root).toBe(root);
    expect(tree.height).toBe(1);
    expect(ratifier).toBe(ecrecoverRatifier);
  });

  test("behavior: normalizes stale standalone groups in raw inputs", () => {
    const offer = baseOffer({ group: staleGroup, maxAssets: 0n });
    const expectedGroup = GroupUtils.hash([offer]);

    const { tree } = RatifierUtils.normalizeRatifierTree({
      tree: [offer],
      label: "Ecrecover",
    });

    expect(tree.offers[0]!.group).toBe(expectedGroup);
    expect(tree.offers[0]!.group).not.toBe(staleGroup);
    expect(tree.paddedOffers[0]!.group).toBe(expectedGroup);
  });

  test("error: InvalidTreeError mixed ratifiers", () => {
    const tree = Tree.create([
      baseOffer({
        maxAssets: 0n,
        ratifier: ecrecoverRatifier,
      }),
      baseOffer({
        maxAssets: 0n,
        ratifier: setterRatifier,
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
