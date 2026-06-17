import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { baseOffer, baseOfferInput } from "../__test__/fixtures.js";
import { InvalidOfferGroupError, InvalidTreeError } from "../errors.js";
import { Offer, OfferUtils } from "../offers/index.js";
import { Group } from "./Group.js";
import { GroupUtils } from "./GroupUtils.js";
import { Tree } from "./Tree.js";
import { MAX_OFFERS_PER_TREE, TreeUtils } from "./TreeUtils.js";

const root =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
const zeroBytes32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

const emptyOffer = () =>
  new Offer({
    market: {
      loanToken: zeroAddress,
      collateralParams: [],
      maturity: 0n,
      rcfThreshold: 0n,
      enterGate: zeroAddress,
      liquidatorGate: zeroAddress,
    },
    buy: false,
    maker: zeroAddress,
    start: 0n,
    expiry: 0n,
    tick: 0n,
    callback: zeroAddress,
    callbackData: "0x",
    receiverIfMakerIsSeller: zeroAddress,
    ratifier: zeroAddress,
    reduceOnly: false,
    maxUnits: 0n,
    maxAssets: 0n,
  });

describe("Tree.create", () => {
  test("default", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create([offer]);
    const tree = Tree.create(group);

    expect(tree.offers).toEqual([offer]);
    expect(tree.root).toBe(TreeUtils.buildRoot([group]));
    expect(tree.proof(0n)).toEqual(
      TreeUtils.buildProof({ tree, leafIndex: 0n }),
    );
  });

  test("behavior: standalone offers become single-offer groups", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const tree = Tree.create(offer);

    expect(tree.groups).toHaveLength(1);
    expect(tree.groups[0]!.id).toBe(GroupUtils.hash([offer]));
    expect(tree.offers).toEqual([offer]);
  });
});

describe("TreeUtils.buildDescriptor", () => {
  test("default", () => {
    const payload = TreeUtils.buildDescriptor([baseOffer({ maxAssets: 0n })]);

    expect(payload.height).toBe(0);
    expect(payload.root).toMatchInlineSnapshot(
      `"0xc70811875043cb46f8059a075df39de9e70175f06c1ca613263d56a3d61a2838"`,
    );
  });

  test("behavior: proof for second leaf", () => {
    const offers = [
      baseOffer({ maxAssets: 0n, tick: 5_000n }),
      baseOffer({ maxAssets: 0n, tick: 5_004n }),
    ];
    const groups = offers.map((offer) => Group.create([offer]));
    const tree = Tree.create(...groups);
    const proof = TreeUtils.buildProof({
      tree,
      leafIndex: 1n,
    });

    expect(proof.proof).toHaveLength(1);
    expect(proof.root).toBe(TreeUtils.buildRoot(groups));
  });

  test("behavior: pads non-power-of-two batches", () => {
    const offers = [
      baseOffer({ maxAssets: 0n, tick: 5_000n }),
      baseOffer({ maxAssets: 0n, tick: 5_004n }),
      baseOffer({ maxAssets: 0n, tick: 5_008n }),
    ];
    const groups = offers.map((offer) => Group.create([offer]));
    const tree = Tree.create(...groups);
    const payload = TreeUtils.buildDescriptor(groups);
    const proof = TreeUtils.buildProof({
      tree,
      leafIndex: 2n,
    });

    expect(payload.offers).toHaveLength(4);
    expect(payload.height).toBe(2);
    expect(payload.offers.slice(0, 3)).toEqual(
      groups.flatMap(GroupUtils.toStructs),
    );
    expect(payload.offers[3]).toEqual({
      ...OfferUtils.toStruct({ offer: emptyOffer(), group: zeroBytes32 }),
      market: {
        loanToken: zeroAddress,
        collateralParams: [],
        maturity: 0n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      },
    });
    expect(proof.proof).toHaveLength(2);
    expect(
      TreeUtils.verifyProof({
        offer: offers[2]!,
        group: groups[2]!.id,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(true);
  });

  test("error: duplicate offer hash", () => {
    const offer = baseOffer({ maxAssets: 0n });

    expect(() => TreeUtils.buildDescriptor([offer, offer])).toThrow(
      InvalidTreeError,
    );
  });

  test("error: invalid empty offer", () => {
    expect(() => TreeUtils.buildDescriptor([emptyOffer()])).toThrow(
      InvalidOfferGroupError,
    );
  });

  test("error: offer count cap", () => {
    const offer = baseOffer({ maxAssets: 0n });

    expect(() =>
      TreeUtils.buildDescriptor(
        Array.from({ length: MAX_OFFERS_PER_TREE + 1 }, () => offer),
      ),
    ).toThrow(InvalidTreeError);
  });
});

describe("TreeUtils.verifyProof", () => {
  test("default", () => {
    const offers = [
      baseOffer({ maxAssets: 0n, tick: 5_000n }),
      baseOffer({ maxAssets: 0n, tick: 5_004n }),
    ];
    const groups = offers.map((offer) => Group.create([offer]));
    const tree = Tree.create(...groups);
    const proof = TreeUtils.buildProof({
      tree,
      leafIndex: 1n,
    });

    expect(
      TreeUtils.verifyProof({
        offer: offers[1]!,
        group: groups[1]!.id,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(true);
    expect(
      TreeUtils.verifyProof({
        offer: offers[1]!,
        group: groups[1]!.id,
        root: root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(false);
    expect(
      TreeUtils.verifyProof({
        offer: offers[1]!,
        group: groups[1]!.id,
        root: proof.root,
        leafIndex: 0n,
        proof: proof.proof,
      }),
    ).toBe(false);
    expect(
      TreeUtils.verifyProof({
        offer: offers[1]!,
        group: groups[1]!.id,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: [root],
      }),
    ).toBe(false);
  });

  test("behavior: rejects out-of-range leaf index", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create([offer]);
    const offerRoot = offer.hash(group.id);

    expect(
      TreeUtils.verifyProof({
        offer,
        group: group.id,
        root: offerRoot,
        leafIndex: 1n,
        proof: [],
      }),
    ).toBe(false);
    expect(
      TreeUtils.verifyProof({
        offer,
        group: group.id,
        root: offerRoot,
        leafIndex: -1n,
        proof: [],
      }),
    ).toBe(false);
  });

  test("behavior: verifies proofs for plain offer objects", () => {
    const offer = baseOfferInput({ maxAssets: 0n });
    const group = Group.create([offer]);
    const tree = Tree.create(group);
    const proof = tree.proof(0n);

    expect(
      TreeUtils.verifyProof({
        offer,
        group: group.id,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(true);
  });
});
