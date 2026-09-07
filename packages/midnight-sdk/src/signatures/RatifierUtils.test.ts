import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { describe, expect, test } from "vitest";
import { createFixtures, group as staleGroup } from "../__test__/fixtures.js";
import { InvalidTreeError, InvalidTreeHeightError } from "../errors.js";
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

  test("error: hidden padded offer", () => {
    const visible = Group.create([baseOffer({ maxAssets: 0n })]).offers[0]!;
    const hidden = Group.create([baseOffer({ maxAssets: 0n, tick: 6_000n })])
      .offers[0]!;
    const paddedOffers = [
      OfferUtils.toStruct({ offer: visible }),
      OfferUtils.toStruct({ offer: hidden }),
    ];
    const leaves = paddedOffers.map(OfferUtils.hashStruct);

    expect(() =>
      RatifierUtils.normalizeRatifierTree({
        tree: {
          offers: [visible],
          paddedOffers,
          leaves,
          root: TreeUtils.hashNode(leaves[0]!, leaves[1]!),
          height: 1,
        },
        label: "Ecrecover",
      }),
    ).toThrow(InvalidTreeError);
  });

  test.each(["offer", "leaf", "root", "height"] as const)(
    "error: altered %s",
    (field) => {
      const tree = Tree.create([
        baseOffer({ maxAssets: 0n, tick: 4_000n }),
        baseOffer({ maxAssets: 0n, tick: 5_000n }),
      ]);
      const altered = {
        offers: field === "offer" ? tree.offers.slice().reverse() : tree.offers,
        paddedOffers: tree.paddedOffers,
        leaves:
          field === "leaf" ? [tree.leaves[1]!, tree.leaves[0]!] : tree.leaves,
        root: field === "root" ? tree.leaves[0]! : tree.root,
        height: field === "height" ? 0 : tree.height,
      };

      expect(() =>
        RatifierUtils.normalizeRatifierTree({
          tree: altered,
          label: "Ecrecover",
        }),
      ).toThrow(InvalidTreeError);
    },
  );

  test("error: InvalidTreeHeightError", () => {
    const tree = Tree.create([baseOffer({ maxAssets: 0n })]);

    expect(() =>
      RatifierUtils.normalizeRatifierTree({
        tree: { ...tree, height: 21 },
        label: "Ecrecover",
      }),
    ).toThrow(InvalidTreeHeightError);
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
