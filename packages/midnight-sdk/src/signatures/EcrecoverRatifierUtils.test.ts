import {
  type Account,
  type Chain,
  createWalletClient,
  custom,
  type Hex,
  type Signature,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { describe, expect, test } from "vitest";
import { addresses, baseOffer, chainId } from "../__test__/fixtures.js";
import {
  EcrecoverRatifierAccountMismatchError,
  InvalidEcrecoverRatifierSignatureError,
  InvalidTreeError,
  InvalidTreeHeightError,
} from "../errors.js";
import { EcrecoverRatifierUtils } from "./EcrecoverRatifierUtils.js";
import { Tree } from "./Tree.js";
import { TreeUtils } from "./TreeUtils.js";

const root =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
const proofNode =
  "0x4444444444444444444444444444444444444444444444444444444444444444" as const;
const privateKey =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
const invalidSignature = `0x${"00".repeat(65)}` as Hex;

describe("EcrecoverRatifierUtils.ratify", () => {
  test("default", async () => {
    const offer = baseOffer({ maxAssets: 0n });
    const tree = Tree.create([offer]);
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
    expect(items[0]!.offer).toBe(tree.offers[0]);
    expect(decoded.signature).toEqual(signature);
    expect(
      TreeUtils.verifyProof({
        offer: items[0]!.offer,
        root: decoded.root,
        leafIndex: decoded.leafIndex,
        proof: decoded.proof,
      }),
    ).toBe(true);
  });

  test("behavior: signs with wallet client", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
    ]);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: custom({ request: async () => null }),
    });

    const items = await EcrecoverRatifierUtils.ratify({
      tree,
      walletClient,
    });
    const decoded = EcrecoverRatifierUtils.decodeRatifierData(
      items[0]!.ratifierData,
    );

    expect(items).toHaveLength(1);
    expect(items[0]!.offer).toBe(tree.offers[0]);
    expect([27, 28]).toContain(decoded.signature.v);
    expect(
      TreeUtils.verifyProof({
        offer: items[0]!.offer,
        root: decoded.root,
        leafIndex: decoded.leafIndex,
        proof: decoded.proof,
      }),
    ).toBe(true);
  });

  test("error: InvalidTreeError mixed ratifiers", async () => {
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

    await expect(
      EcrecoverRatifierUtils.ratify({
        tree,
        signature: {
          v: 27,
          r: "0x0000000000000000000000000000000000000000000000000000000000000000",
          s: "0x0000000000000000000000000000000000000000000000000000000000000000",
        },
      }),
    ).rejects.toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeError mixed makers", async () => {
    const tree = Tree.create([
      baseOffer({ maxAssets: 0n, maker: addresses.maker }),
      baseOffer({ maxAssets: 0n, maker: addresses.taker }),
    ]);

    await expect(
      EcrecoverRatifierUtils.ratify({
        tree,
        signature: {
          v: 27,
          r: "0x0000000000000000000000000000000000000000000000000000000000000000",
          s: "0x0000000000000000000000000000000000000000000000000000000000000000",
        },
      }),
    ).rejects.toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeError mixed makers before signing", async () => {
    const tree = Tree.create([
      baseOffer({ maxAssets: 0n, maker: addresses.maker }),
      baseOffer({ maxAssets: 0n, maker: addresses.taker }),
    ]);
    let signed = false;

    await expect(
      EcrecoverRatifierUtils.ratify({
        tree,
        walletClient: {
          account: addresses.maker,
          chain: { id: chainId },
          signTypedData: () => {
            signed = true;
            return invalidSignature;
          },
        } as unknown as WalletClient<Transport, Chain, Account>,
      }),
    ).rejects.toThrow(InvalidTreeError);
    expect(signed).toBe(false);
  });

  test("error: EcrecoverRatifierAccountMismatchError before signing", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([baseOffer({ maxAssets: 0n })]);
    let signed = false;

    await expect(
      EcrecoverRatifierUtils.ratify({
        tree,
        walletClient: {
          account,
          chain: { id: chainId },
          signTypedData: () => {
            signed = true;
            return invalidSignature;
          },
        } as unknown as WalletClient<Transport, Chain, Account>,
      }),
    ).rejects.toThrow(EcrecoverRatifierAccountMismatchError);
    expect(signed).toBe(false);
  });

  test("error: InvalidEcrecoverRatifierSignatureError", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
    ]);

    await expect(
      EcrecoverRatifierUtils.ratify({
        tree,
        walletClient: {
          account,
          chain: { id: chainId },
          signTypedData: () => invalidSignature,
        } as unknown as WalletClient<Transport, Chain, Account>,
      }),
    ).rejects.toThrow(InvalidEcrecoverRatifierSignatureError);
  });
});

describe("EcrecoverRatifierUtils.typedData", () => {
  test("default", () => {
    const tree = Tree.create([baseOffer({ maxAssets: 0n })]);
    const typedData = EcrecoverRatifierUtils.typedData({
      tree,
      chainId: 8453n,
    });

    expect(typedData.primaryType).toBe("OfferTree");
    expect(typedData.domain.verifyingContract).toBe(tree.offers[0]!.ratifier);
    expect(typedData.types.EIP712Domain).toEqual([
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ]);
    expect(typedData.types.OfferTree[0].type).toMatchInlineSnapshot(`"Offer"`);
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
      EcrecoverRatifierUtils.typedData({ tree, chainId: 8453n }),
    ).toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeError mixed makers", () => {
    const tree = Tree.create([
      baseOffer({ maxAssets: 0n, maker: addresses.maker }),
      baseOffer({ maxAssets: 0n, maker: addresses.taker }),
    ]);

    expect(() =>
      EcrecoverRatifierUtils.typedData({ tree, chainId: 8453n }),
    ).toThrow(InvalidTreeError);
  });
});

describe("EcrecoverRatifierUtils.digest", () => {
  test("default", () => {
    const digest = EcrecoverRatifierUtils.digest({
      tree: Tree.create([baseOffer({ maxAssets: 0n })]),
      chainId: 8453n,
    });

    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("EcrecoverRatifierUtils.sign", () => {
  test("default", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
    ]);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: custom({ request: async () => null }),
    });

    const signature = await EcrecoverRatifierUtils.sign({
      tree,
      walletClient,
    });

    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
  });
});

describe("EcrecoverRatifierUtils.treeTypeHash", () => {
  test("error: InvalidTreeHeightError", () => {
    expect(() => EcrecoverRatifierUtils.treeTypeHash(21)).toThrow(
      InvalidTreeHeightError,
    );
  });
});

describe("EcrecoverRatifierUtils.toSignature", () => {
  test("default", () => {
    const signature = {
      yParity: 1,
      r: "0x1111111111111111111111111111111111111111111111111111111111111111",
      s: "0x2222222222222222222222222222222222222222222222222222222222222222",
    } satisfies Signature;

    expect(EcrecoverRatifierUtils.toSignature(signature)).toEqual({
      v: 28,
      r: signature.r,
      s: signature.s,
    });
  });
});

describe("EcrecoverRatifierUtils.ratifierData", () => {
  test("error: InvalidTreeError mixed makers", () => {
    const tree = Tree.create([
      baseOffer({ maxAssets: 0n, maker: addresses.maker }),
      baseOffer({ maxAssets: 0n, maker: addresses.taker }),
    ]);

    expect(() =>
      EcrecoverRatifierUtils.ratifierData({
        tree,
        leafIndex: 0n,
        signature: {
          v: 27,
          r: "0x0000000000000000000000000000000000000000000000000000000000000000",
          s: "0x0000000000000000000000000000000000000000000000000000000000000000",
        },
      }),
    ).toThrow(InvalidTreeError);
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
