import { zeroAddress, zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, expectTypeOf, test, vi } from "vitest";
import { createFixtures } from "../__test__/fixtures.js";
import { InvalidTreeError, InvalidTreeHeightError } from "../errors.js";
import { Offer, type OfferStruct } from "../offers/index.js";
import {
  EcrecoverRatifier,
  EcrecoverRatifierUtils,
} from "./EcrecoverRatifier.js";
import { Group } from "./Group.js";
import { Payload } from "./Payload.js";
import { PriceRatifierV1 } from "./PriceRatifierV1.js";
import { RateRatifierV1 } from "./RateRatifierV1.js";
import { SetterRatifier, SetterRatifierUtils } from "./SetterRatifier.js";
import { Tree } from "./Tree.js";
import {
  type RatifierTreeInput,
  type TreeCreateParams,
  type TreeInput,
  type TreeLike,
  TreeUtils,
} from "./TreeUtils.js";
import type {
  AnyTree,
  AnyTreeSnapshot,
  EcrecoverTreeCreateRequest,
  SetterTreeCreateRequest,
  TreeCreateRequest,
  TypedRatifierTreeInput,
  TypedTreeMempoolValidateParams,
} from "./treeTypes.js";

const { baseOffer, baseMarketParamsInput } = createFixtures({
  midnight: "0x0000000000000000000000000000000000001000",
  ecrecoverRatifier: "0x0000000000000000000000000000000000004000",
});
const offers = [1n, 2n, 3n].map((tick) =>
  baseOffer({
    tick,
    maxAssets: 0n,
    market: { ...baseMarketParamsInput(), maturity: 1_767_279_600n },
  }),
);
const priceLeaves = offers.map((offer) => ({
  offer,
  allowedTaker: zeroAddress,
}));
const rateLeaves = offers.map((offer, index) => ({
  offer,
  rate: 100n + BigInt(index),
}));

const trees = () =>
  [
    Tree.create({ type: "ecrecover", entries: offers }),
    Tree.create({ type: "setter", entries: offers }),
    Tree.create({ type: "priceV1", entries: priceLeaves }),
    Tree.create({ type: "rateV1", entries: rateLeaves }),
  ] as const;

describe("Tree.create", () => {
  test("default", () => {
    const [ecrecover, setter, price, rate] = trees();
    expectTypeOf(ecrecover).toEqualTypeOf<Tree<"ecrecover">>();
    expectTypeOf(setter).toEqualTypeOf<Tree<"setter">>();
    expectTypeOf(price).toEqualTypeOf<Tree<"priceV1">>();
    expectTypeOf(rate).toEqualTypeOf<Tree<"rateV1">>();
    expectTypeOf(rate.entries[0]!.rate).toEqualTypeOf<bigint>();
    expectTypeOf(setter.entries[0]!).toEqualTypeOf<OfferStruct>();
    expectTypeOf<typeof rate>().not.toExtend<
      TypedRatifierTreeInput<"setter">
    >();
    expectTypeOf<typeof setter>().not.toExtend<
      TypedRatifierTreeInput<"ecrecover">
    >();
    expectTypeOf<typeof price>().not.toExtend<
      Parameters<typeof RateRatifierV1.ratify>[0]["tree"]
    >();
    expectTypeOf<typeof rate>().not.toExtend<
      Parameters<typeof PriceRatifierV1.ratify>[0]["tree"]
    >();
    expectTypeOf<{
      type: "rateV1";
      entries: typeof priceLeaves;
    }>().not.toExtend<TreeCreateRequest>();
    expectTypeOf<{
      type: "rateV1" | "priceV1";
      entries: typeof priceLeaves;
    }>().not.toExtend<TreeCreateRequest>();
    expectTypeOf<{
      chainId: number;
      ratification: { type: "setter" };
    }>().not.toExtend<TypedTreeMempoolValidateParams<"rateV1">>();
    expectTypeOf(Tree.create(offers)).toEqualTypeOf<Tree>();
  });

  test("behavior: preserves legacy roots, padding, proofs and payload data", async () => {
    const [ecrecover, setter, price, rate] = trees();
    const legacy = Tree.create(offers);
    expect(ecrecover.root).toBe(legacy.root);
    expect(setter.root).toBe(legacy.root);
    expect(setter.entries).toEqual(legacy.paddedOffers);
    expect(setter.proof(2n)).toEqual(legacy.proof(2n));
    expect(SetterRatifier.ratify({ tree: setter })).toEqual(
      SetterRatifierUtils.ratify({ tree: legacy }),
    );
    expect(
      EcrecoverRatifier.typedData({ tree: ecrecover, chainId: 8453 }),
    ).toEqual(
      EcrecoverRatifierUtils.typedData({ tree: legacy, chainId: 8453 }),
    );
    const account = privateKeyToAccount(
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
    const signature = await account.sign({
      hash: EcrecoverRatifier.digest({ tree: ecrecover, chainId: 8453 }),
    });
    expect(
      await EcrecoverRatifier.ratify({
        tree: ecrecover,
        account,
        signature,
      }),
    ).toEqual(
      await EcrecoverRatifierUtils.ratify({ tree: legacy, account, signature }),
    );
    const oldPrice = PriceRatifierV1.buildDescriptor(priceLeaves);
    const oldRate = RateRatifierV1.buildDescriptor(rateLeaves);
    expect(price.root).toBe(oldPrice.root);
    expect(rate.root).toBe(oldRate.root);
    expect(
      TreeUtils.buildDescriptor({ type: "rateV1", entries: rateLeaves }),
    ).toEqual(rate.toDescriptor());
    expect(price.entries).toEqual(oldPrice.entries);
    expect(rate.entries).toEqual(oldRate.entries);
    expect(price.proof(2n)).toEqual(
      PriceRatifierV1.buildProof({ tree: oldPrice, leafIndex: 2n }),
    );
    expect(rate.proof(2n)).toEqual(
      RateRatifierV1.buildProof({ tree: oldRate, leafIndex: 2n }),
    );
    expect(PriceRatifierV1.ratify({ tree: price })).toEqual(
      PriceRatifierV1.ratify({ tree: oldPrice }),
    );
    expect(RateRatifierV1.ratify({ tree: rate })).toEqual(
      RateRatifierV1.ratify({ tree: oldRate }),
    );
  });

  test("behavior: preserves standard groups and explicit V1 group commitments", () => {
    const group = Group.create(offers);
    expect(Tree.create({ type: "setter", entries: [group] }).root).toBe(
      Tree.create([group]).root,
    );
    const price = Tree.create({
      type: "priceV1",
      entries: [{ offer: { ...offers[0]!, group: zeroHash } }],
    });
    const rate = Tree.create({
      type: "rateV1",
      entries: [{ offer: { ...offers[0]!, group: zeroHash }, rate: "100" }],
    });
    expect(price.entries[0]!.offer.group).toBe(zeroHash);
    expect(rate.entries[0]!.offer.group).toBe(zeroHash);
    expect(rate.entries[0]!.rate).toBe(100n);
  });

  test("behavior: union input retains narrowing", () => {
    for (const tree of trees()) {
      const request: TreeCreateRequest =
        tree.type === "rateV1"
          ? { type: "rateV1", entries: rateLeaves }
          : { type: "priceV1", entries: priceLeaves };
      const result = Tree.create(request);
      if (result.type === "rateV1")
        expectTypeOf(result).toEqualTypeOf<Tree<"rateV1">>();
      expectTypeOf(result).toExtend<AnyTree>();
    }
  });

  test("error: InvalidTreeError on empty, duplicate and mixed-ratifier inputs", () => {
    for (const type of ["ecrecover", "setter"] as const) {
      expect(() => Tree.create({ type, entries: [] })).toThrow(
        InvalidTreeError,
      );
      expect(() =>
        Tree.create({ type, entries: [offers[0]!, offers[0]!] }),
      ).toThrow(InvalidTreeError);
      expect(() =>
        Tree.create({
          type,
          entries: [offers[0]!, { ...offers[1]!, ratifier: zeroAddress }],
        }),
      ).toThrow(InvalidTreeError);
    }
  });
});

describe("Tree.proof", () => {
  test("error: InvalidTreeError outside the padded tree", () => {
    for (const tree of trees()) {
      expect(() => tree.proof(-1n)).toThrow(InvalidTreeError);
      expect(() => tree.proof(BigInt(tree.entries.length))).toThrow(
        InvalidTreeError,
      );
    }
  });
});

describe("Tree.from", () => {
  test("default", () => {
    const rate = Tree.from({ type: "rateV1", entries: rateLeaves });
    expectTypeOf(rate).toEqualTypeOf<Tree<"rateV1">>();
    expect(Tree.from(rate)).toBe(rate);
    expect(Tree.from(offers).root).toBe(Tree.create(offers).root);
  });
});

describe("Tree.fromDescriptor", () => {
  test("default", () => {
    for (const tree of trees()) {
      const descriptor = tree.toDescriptor();
      expectTypeOf(descriptor).toExtend<AnyTreeSnapshot>();
      const resumed = Tree.fromDescriptor(structuredClone(descriptor));
      expect(resumed.type).toBe(tree.type);
      expect(resumed.toDescriptor()).toEqual(descriptor);
      expect(resumed.proof(2n)).toEqual(tree.proof(2n));
      expect(Object.isFrozen(resumed.entries[0])).toBe(true);
      expect(Object.isFrozen(resumed.offers[0])).toBe(false);
    }
    expectTypeOf(Tree.fromDescriptor(trees()[3].toDescriptor())).toEqualTypeOf<
      Tree<"rateV1">
    >();
    const legacy = Tree.create(offers);
    expect(Tree.fromDescriptor(legacy.toDescriptor()).root).toBe(legacy.root);
  });

  test("behavior: canonicalizes structurally compatible class entries", () => {
    const snapshot = trees()[1].toDescriptor();
    const entries = snapshot.entries.map((offer, index) =>
      index < snapshot.offers.length
        ? Object.assign(new Offer(offer), { market: offer.market })
        : offer,
    );
    const resumed = Tree.fromDescriptor({ ...snapshot, entries });
    expect(resumed.toDescriptor()).toEqual(snapshot);
    expect(Object.isFrozen(entries[0])).toBe(false);
    expect(SetterRatifier.ratify({ tree: resumed })).toEqual(
      SetterRatifier.ratify({ tree: trees()[1] }),
    );
  });

  test("behavior: input descriptor is neither frozen nor retained by reference", () => {
    const descriptor = structuredClone(trees()[3].toDescriptor());
    const resumed = Tree.fromDescriptor(descriptor);
    expect(Object.isFrozen(descriptor.entries[0])).toBe(false);
    expect(resumed.entries[0]).not.toBe(descriptor.entries[0]);
  });

  test("error: InvalidTreeError for tampered hashes, visible offers and padding", () => {
    for (const tree of trees()) {
      const descriptor = tree.toDescriptor();
      expect(() =>
        Tree.fromDescriptor({ ...descriptor, root: zeroHash }),
      ).toThrow(InvalidTreeError);
      expect(() =>
        Tree.fromDescriptor({
          ...descriptor,
          leaves: descriptor.leaves.map(() => zeroHash),
        }),
      ).toThrow(InvalidTreeError);
      expect(() => Tree.fromDescriptor({ ...descriptor, offers: [] })).toThrow(
        InvalidTreeError,
      );
      expect(() =>
        Tree.fromDescriptor({
          ...descriptor,
          offers: descriptor.offers.slice(0, 1),
        }),
      ).toThrow(InvalidTreeError);
      expect(() => Tree.fromDescriptor({ ...descriptor, height: 100 })).toThrow(
        InvalidTreeHeightError,
      );
    }
  });

  test("error: InvalidTreeError on runtime cross-route use", () => {
    const [ecrecover, , , rate] = trees();
    // Test adapters model callers bypassing TypeScript (JavaScript or untrusted transport).
    expect(() =>
      SetterRatifier.ratify({
        tree: ecrecover as unknown as Tree<"setter">,
      }),
    ).toThrow(InvalidTreeError);
    expect(() =>
      PriceRatifierV1.ratify({ tree: rate as unknown as Tree<"priceV1"> }),
    ).toThrow(InvalidTreeError);
  });
});

describe("Tree.mempoolValidate", () => {
  test("behavior: validates final V1 payloads through the API boundary", async () => {
    for (const tree of [trees()[2], trees()[3]]) {
      const fetch = vi.fn(
        async (_url: string | URL | Request, _init?: RequestInit) =>
          new Response(JSON.stringify({ data: { valid: true, issues: [] } }), {
            status: 200,
          }),
      );
      const result =
        tree.type === "rateV1"
          ? await tree.mempoolValidate({
              chainId: 8453,
              fetch,
              ratification: { type: "rateV1" },
            })
          : await tree.mempoolValidate({
              chainId: 8453,
              fetch,
              ratification: { type: "priceV1" },
            });
      expect(result.valid).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
      const expected =
        tree.type === "rateV1"
          ? RateRatifierV1.ratify({ tree })
          : PriceRatifierV1.ratify({ tree });
      expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).toEqual({
        chain_id: 8453,
        payload: await Payload.encode(expected),
      });
    }
  });

  test("error: InvalidTreeError on mismatched authorization", async () => {
    const fetch = vi.fn();
    const rate = trees()[3];
    const params = {
      chainId: 8453,
      fetch,
      ratification: { type: "setter" },
    } as unknown as TypedTreeMempoolValidateParams<"rateV1">;
    await expect(rate.mempoolValidate(params)).rejects.toBeInstanceOf(
      InvalidTreeError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("legacy tree type compatibility", () => {
  test("behavior: deprecated arrays and named requests coexist for both standard ratifiers", () => {
    const legacy: TreeCreateParams = offers;
    const ecrecoverRequest: EcrecoverTreeCreateRequest = {
      type: "ecrecover",
      entries: offers,
    };
    const setterRequest: SetterTreeCreateRequest = {
      type: "setter",
      entries: offers,
    };
    const ecrecover = Tree.create(ecrecoverRequest);
    const setter = Tree.create(setterRequest);
    const oldTree = Tree.create(legacy);
    expectTypeOf(ecrecover).toEqualTypeOf<Tree<"ecrecover">>();
    expectTypeOf(setter).toEqualTypeOf<Tree<"setter">>();
    expectTypeOf(oldTree).toEqualTypeOf<Tree>();
    expectTypeOf<EcrecoverTreeCreateRequest>().not.toExtend<SetterTreeCreateRequest>();
    expect(ecrecover.root).toBe(oldTree.root);
    expect(setter.root).toBe(oldTree.root);
    expect(Tree.from(ecrecoverRequest).root).toBe(Tree.from(legacy).root);
    expect(TreeUtils.buildDescriptor(setterRequest).root).toBe(
      TreeUtils.buildDescriptor(legacy).root,
    );
  });

  test("behavior: existing wrappers accept untagged public types", () => {
    const ratify = (input: RatifierTreeInput) =>
      SetterRatifierUtils.ratify({ tree: input });
    const typedData = (input: TreeLike) =>
      EcrecoverRatifierUtils.typedData({ tree: input, chainId: 8453 });
    const legacyInput = (input: TreeInput) =>
      SetterRatifierUtils.ratify({ tree: input });
    const tree = Tree.create(offers);
    expect(ratify(tree)).toEqual(legacyInput(offers));
    expect(typedData(tree)).toEqual(
      EcrecoverRatifierUtils.typedData({ tree, chainId: 8453 }),
    );
    expectTypeOf<"type">().not.toExtend<keyof TreeLike>();
    expectTypeOf<RatifierTreeInput>().toExtend<
      TypedRatifierTreeInput<"setter">
    >();
    expectTypeOf<RatifierTreeInput>().toExtend<
      TypedRatifierTreeInput<"ecrecover">
    >();
    expectTypeOf<TreeLike>().toExtend<TypedRatifierTreeInput<"setter">>();
    expectTypeOf<TreeInput>().toExtend<TypedRatifierTreeInput<"ecrecover">>();
  });

  test("error: InvalidTreeError when a legacy annotation erases a conflicting route", () => {
    const erased: RatifierTreeInput = trees()[0];
    expect(() => SetterRatifierUtils.ratify({ tree: erased })).toThrow(
      InvalidTreeError,
    );
  });
});
