import type { Signature } from "viem";
import { describe, expect, test } from "vitest";
import { addresses, baseOffer } from "../__test__/fixtures.js";
import { InvalidTreeHeightError } from "../errors.js";
import { EcrecoverRatifierUtils } from "./EcrecoverRatifierUtils.js";
import { Tree } from "./Tree.js";
import { TreeUtils } from "./TreeUtils.js";

const root =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
const proofNode =
  "0x4444444444444444444444444444444444444444444444444444444444444444" as const;

describe("EcrecoverRatifierUtils.ratify", () => {
  test("default", async () => {
    const offer = baseOffer({ maxAssets: 0n });
    const tree = Tree.create(offer);
    const signature = {
      v: 27,
      r: "0x0000000000000000000000000000000000000000000000000000000000000000",
      s: "0x0000000000000000000000000000000000000000000000000000000000000000",
    } as const;

    const items = await EcrecoverRatifierUtils.ratify({ tree, signature });
    const decoded = EcrecoverRatifierUtils.decodeRatifierData(
      items[0]!.ratifierData,
    );

    expect(items).toHaveLength(1);
    expect(items[0]!.offer).toBe(offer);
    expect(decoded.signature).toEqual(signature);
    expect(
      TreeUtils.verifyProof({
        offer,
        group: items[0]!.group,
        root: decoded.root,
        leafIndex: decoded.leafIndex,
        proof: decoded.proof,
      }),
    ).toBe(true);
  });
});

describe("EcrecoverRatifierUtils.typedData", () => {
  test("default", () => {
    const typedData = EcrecoverRatifierUtils.typedData({
      tree: Tree.create(baseOffer({ maxAssets: 0n })),
      chainId: 8453n,
      verifyingContract: addresses.ecrecoverRatifier,
    });

    expect(typedData.primaryType).toBe("OfferTree");
    expect(typedData.types.EIP712Domain).toEqual([
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ]);
    expect(typedData.types.OfferTree[0].type).toMatchInlineSnapshot(`"Offer"`);
  });
});

describe("EcrecoverRatifierUtils.treeTypeHash", () => {
  test("error: InvalidTreeHeightError", () => {
    expect(() => EcrecoverRatifierUtils.treeTypeHash(21)).toThrow(
      InvalidTreeHeightError,
    );
  });
});

describe("EcrecoverRatifierUtils.encodeRatifierData", () => {
  test("default", () => {
    const data = EcrecoverRatifierUtils.encodeRatifierData({
      signature: {
        v: 27,
        r: "0x0000000000000000000000000000000000000000000000000000000000000000",
        s: "0x0000000000000000000000000000000000000000000000000000000000000000",
      },
      root: "0x0000000000000000000000000000000000000000000000000000000000000000",
      leafIndex: 0n,
      proof: [],
    });

    expect(data.startsWith("0x")).toBe(true);
  });

  test("behavior: decode round trip", () => {
    const signature = {
      v: 28,
      r: "0x1111111111111111111111111111111111111111111111111111111111111111",
      s: "0x2222222222222222222222222222222222222222222222222222222222222222",
    } as const;
    const data = EcrecoverRatifierUtils.encodeRatifierData({
      signature,
      root,
      leafIndex: 2n,
      proof: [proofNode],
    });

    expect(EcrecoverRatifierUtils.decodeRatifierData(data)).toEqual({
      signature,
      root,
      leafIndex: 2n,
      proof: [proofNode],
    });
  });

  test("behavior: accepts viem yParity signature", () => {
    const signature = {
      yParity: 1,
      r: "0x1111111111111111111111111111111111111111111111111111111111111111",
      s: "0x2222222222222222222222222222222222222222222222222222222222222222",
    } satisfies Signature;
    const data = EcrecoverRatifierUtils.encodeRatifierData({
      signature,
      root,
      leafIndex: 2n,
      proof: [proofNode],
    });

    expect(EcrecoverRatifierUtils.decodeRatifierData(data).signature).toEqual({
      v: 28,
      r: signature.r,
      s: signature.s,
    });
  });
});
