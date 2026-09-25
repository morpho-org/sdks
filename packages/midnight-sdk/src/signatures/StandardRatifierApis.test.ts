import { createWalletClient, custom, zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { describe, expect, expectTypeOf, test, vi } from "vitest";
import { createFixtures } from "../__test__/fixtures.js";
import { InvalidTreeError } from "../errors.js";
import {
  EcrecoverRatifier,
  type EcrecoverRatifierRatifyRequest,
  EcrecoverRatifierUtils,
  type RatifierTreeInput,
  SetterRatifier,
  type SetterRatifierRatifyRequest,
  SetterRatifierUtils,
  Tree,
  type TreeSnapshot,
} from "../index.js";

const { baseOffer } = createFixtures({
  midnight: "0x0000000000000000000000000000000000001000",
  ecrecoverRatifier: "0x0000000000000000000000000000000000004000",
});
const entries = [1n, 2n, 3n].map((tick) => baseOffer({ tick, maxAssets: 0n }));
const account = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000001",
);

describe("standard ratifier APIs", () => {
  test("behavior: tagged and deprecated APIs produce identical signatures and proof bytes", async () => {
    const legacy = Tree.create(entries);
    const ecrecover = Tree.create({ type: "ecrecover", entries });
    const setter = Tree.create({ type: "setter", entries });
    const request = vi.fn();
    const client = createWalletClient({
      chain: base,
      transport: custom({ request }),
    });
    const signature = await EcrecoverRatifier.sign({
      tree: ecrecover,
      client,
      account,
    });
    expect(signature).toBe(
      await EcrecoverRatifierUtils.sign({ tree: legacy, client, account }),
    );
    expect(request).not.toHaveBeenCalled();
    expect(
      EcrecoverRatifier.typedData({ tree: ecrecover, chainId: 8453 }),
    ).toEqual(
      EcrecoverRatifierUtils.typedData({ tree: legacy, chainId: 8453 }),
    );
    expect(EcrecoverRatifier.digest({ tree: ecrecover, chainId: 8453 })).toBe(
      EcrecoverRatifierUtils.digest({ tree: legacy, chainId: 8453 }),
    );
    expect(
      await EcrecoverRatifier.ratify({ tree: ecrecover, client, account }),
    ).toEqual(
      await EcrecoverRatifierUtils.ratify({ tree: legacy, signature, account }),
    );
    expect(
      EcrecoverRatifier.ratifierData({
        tree: ecrecover,
        leafIndex: 1n,
        signature,
      }),
    ).toBe(
      EcrecoverRatifierUtils.ratifierData({
        tree: legacy,
        leafIndex: 1n,
        signature,
      }),
    );
    expect(SetterRatifier.ratifierData({ tree: setter, leafIndex: 1n })).toBe(
      SetterRatifierUtils.ratifierData({ tree: legacy, leafIndex: 1n }),
    );
    expect(SetterRatifier.ratify({ tree: setter })).toEqual(
      SetterRatifierUtils.ratify({ tree: entries }),
    );
    expect(
      await EcrecoverRatifier.ratify({
        tree: structuredClone(ecrecover.toDescriptor()),
        signature,
        account,
      }),
    ).toEqual(
      await EcrecoverRatifierUtils.ratify({ tree: legacy, signature, account }),
    );
    expect(
      SetterRatifier.ratify({ tree: structuredClone(setter.toDescriptor()) }),
    ).toEqual(SetterRatifierUtils.ratify({ tree: legacy }));
  });

  test("behavior: new inputs require tags while old wrapper signatures remain valid", () => {
    const legacy = (tree: RatifierTreeInput) =>
      SetterRatifierUtils.ratify({ tree });
    expect(legacy(entries)).toHaveLength(3);
    expectTypeOf<Tree>().not.toExtend<SetterRatifierRatifyRequest["tree"]>();
    expectTypeOf<RatifierTreeInput>().not.toExtend<
      EcrecoverRatifierRatifyRequest["tree"]
    >();
    expectTypeOf<Tree<"setter">>().not.toExtend<
      EcrecoverRatifierRatifyRequest["tree"]
    >();
    expectTypeOf<Tree<"ecrecover">>().not.toExtend<
      SetterRatifierRatifyRequest["tree"]
    >();
    expectTypeOf<Tree<"ecrecover">>().toExtend<
      EcrecoverRatifierRatifyRequest["tree"]
    >();
    expectTypeOf<TreeSnapshot<"setter">>().toExtend<
      SetterRatifierRatifyRequest["tree"]
    >();
  });

  test("error: InvalidTreeError for untagged, wrong-route and tampered inputs", async () => {
    const legacy = Tree.create(entries);
    const setter = Tree.create({ type: "setter", entries });
    // Simulate callers that bypass TypeScript at the public boundary.
    expect(() =>
      SetterRatifier.ratify({ tree: legacy as unknown as Tree<"setter"> }),
    ).toThrow(InvalidTreeError);
    expect(() =>
      EcrecoverRatifier.typedData({
        tree: setter as unknown as Tree<"ecrecover">,
        chainId: 8453,
      }),
    ).toThrow(InvalidTreeError);
    expect(() =>
      SetterRatifier.ratify({
        tree: { ...setter.toDescriptor(), root: zeroHash },
      }),
    ).toThrow(InvalidTreeError);
    const request = vi.fn();
    const client = createWalletClient({
      chain: base,
      transport: custom({ request }),
    });
    await expect(
      EcrecoverRatifier.sign({
        tree: setter as unknown as Tree<"ecrecover">,
        client,
        account,
      }),
    ).rejects.toBeInstanceOf(InvalidTreeError);
    expect(request).not.toHaveBeenCalled();
  });
});
