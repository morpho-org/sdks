import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { baseOffer, baseOfferInput } from "../__test__/fixtures.js";
import { InvalidTreeError } from "../errors.js";
import { Offer, OfferUtils } from "../offers/index.js";
import { Group } from "./Group.js";
import { GroupUtils } from "./GroupUtils.js";
import { Tree } from "./Tree.js";
import { TreeUtils } from "./TreeUtils.js";

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
    const groupOffer = group.offers[0]!;
    const tree = Tree.create([group]);

    expect(tree.offers).toHaveLength(1);
    expect(tree.offers[0]).toBe(groupOffer);
    expect(tree.offers[0]!.group).toBe(group.id);
    expect(tree.root).toBe(TreeUtils.buildRoot([group]));
    expect(tree.proof(0n)).toEqual(
      TreeUtils.buildProof({ tree, leafIndex: 0n }),
    );
  });

  test("behavior: standalone offers keep their own group id", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const tree = Tree.create([offer]);

    expect(tree.offers).toHaveLength(1);
    expect(tree.offers[0]).toBe(offer);
    expect(tree.offers[0]!.group).toBe(offer.group);
  });

  test("behavior: wraps plain offer input", () => {
    const offer = baseOfferInput({ maxAssets: 0n });
    const tree = Tree.create([offer]);

    expect(tree.offers).toHaveLength(1);
    expect(tree.offers[0]).toBeInstanceOf(Offer);
    expect(tree.offers[0]).not.toBe(offer);
  });
});

describe("TreeUtils.buildDescriptor", () => {
  test("default", () => {
    const payload = TreeUtils.buildDescriptor([baseOffer({ maxAssets: 0n })]);

    expect(payload.height).toBe(0);
    expect(payload.root).toMatchInlineSnapshot(
      `"0x185d554dc1c706dd7c51a9c41ceef0ba926a51f3c440d260a2bae06c83bcd95e"`,
    );
  });

  test("behavior: proof for second leaf", () => {
    const offers = [
      baseOffer({ maxAssets: 0n, tick: 5_000n }),
      baseOffer({ maxAssets: 0n, tick: 5_004n }),
    ];
    const groups = offers.map((offer) => Group.create([offer]));
    const tree = Tree.create(groups);
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
    const tree = Tree.create(groups);
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
        offer: groups[2]!.offers[0]!,
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
      InvalidTreeError,
    );
  });

  test("behavior: does not enforce router offer-count policy", () => {
    const groups = Array.from({ length: 257 }, (_, index) =>
      Group.create([baseOffer({ maxAssets: 0n, tick: BigInt(5_000 + index) })]),
    );

    const descriptor = TreeUtils.buildDescriptor(groups);

    expect(descriptor.offers).toHaveLength(512);
    expect(descriptor.height).toBe(9);
  });
});

describe("TreeUtils.verifyProof", () => {
  test("default", () => {
    const offers = [
      baseOffer({ maxAssets: 0n, tick: 5_000n }),
      baseOffer({ maxAssets: 0n, tick: 5_004n }),
    ];
    const groups = offers.map((offer) => Group.create([offer]));
    const tree = Tree.create(groups);
    const proof = TreeUtils.buildProof({
      tree,
      leafIndex: 1n,
    });

    expect(
      TreeUtils.verifyProof({
        offer: groups[1]!.offers[0]!,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(true);
    expect(
      TreeUtils.verifyProof({
        offer: groups[1]!.offers[0]!,
        root: root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(false);
    expect(
      TreeUtils.verifyProof({
        offer: groups[1]!.offers[0]!,
        root: proof.root,
        leafIndex: 0n,
        proof: proof.proof,
      }),
    ).toBe(false);
    expect(
      TreeUtils.verifyProof({
        offer: groups[1]!.offers[0]!,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: [root],
      }),
    ).toBe(false);
  });

  test("behavior: rejects out-of-range leaf index", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create([offer]);
    const offerRoot = group.offers[0]!.hash;

    expect(
      TreeUtils.verifyProof({
        offer: group.offers[0]!,
        root: offerRoot,
        leafIndex: 1n,
        proof: [],
      }),
    ).toBe(false);
    expect(
      TreeUtils.verifyProof({
        offer: group.offers[0]!,
        root: offerRoot,
        leafIndex: -1n,
        proof: [],
      }),
    ).toBe(false);
  });

  test("behavior: verifies proofs for plain offer objects", () => {
    const offer = baseOfferInput({ maxAssets: 0n });
    const group = Group.create([offer]);
    const tree = Tree.create([group]);
    const proof = tree.proof(0n);

    expect(
      TreeUtils.verifyProof({
        offer: group.offers[0]!,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(true);
  });
});
