import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import {
  createWalletClient,
  custom,
  type Hex,
  hashTypedData,
  isAddressEqual,
  keccak256,
  type Signature,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import { addresses, createFixtures } from "../__test__/fixtures.js";
import {
  COLLATERAL_PARAMS_TYPEHASH,
  EIP712_DOMAIN_TYPEHASH,
  MARKET_TYPEHASH,
  OFFER_TYPEHASH,
} from "../constants.js";
import {
  ChainIdMismatchError,
  InvalidEcrecoverSignatureVError,
  InvalidTreeError,
  InvalidTreeHeightError,
  InvalidTypedDataSignatureError,
} from "../errors.js";
import { EcrecoverRatifierUtils } from "./EcrecoverRatifierUtils.js";
import { GroupUtils } from "./GroupUtils.js";
import { Tree } from "./Tree.js";
import { TreeUtils } from "./TreeUtils.js";

const root =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
const proofNode =
  "0x4444444444444444444444444444444444444444444444444444444444444444" as const;
const privateKey =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
const wrongPrivateKey =
  "0x0000000000000000000000000000000000000000000000000000000000000002" as const;
const ecrecoverRatifier = getChainAddress(
  ChainId.BaseMainnet,
  "ecrecoverRatifier",
);
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const { baseMarketParamsInput, baseOffer } = createFixtures({
  midnight: getChainAddress(ChainId.BaseMainnet, "midnight"),
  ecrecoverRatifier,
});
const invalidSignature = `0x${"00".repeat(65)}` as Hex;
const collateralParamsType =
  "CollateralParams(address token,uint256 lltv,uint256 liquidationCursor,address oracle)";
const marketType =
  "Market(uint256 chainId,address midnight,address loanToken,CollateralParams[] collateralParams,uint256 maturity,uint256 rcfThreshold,address enterGate,address liquidatorGate)";
const offerType =
  "Offer(Market market,bool buy,address maker,uint256 start,uint256 expiry,uint256 tick,bytes32 group,address callback,bytes callbackData,address receiverIfMakerIsSeller,address ratifier,bool reduceOnly,uint128 maxUnits,uint128 maxAssets,uint256 continuousFeeCap)";
const eip712DomainType =
  "EIP712Domain(uint256 chainId,address verifyingContract)";

const typeHash = (type: string) => keccak256(stringToHex(type));
const offerTreeType = (height: number) =>
  `OfferTree(Offer${"[2]".repeat(height)} offerTree)${collateralParamsType}${marketType}${offerType}`;

const ecrecoverTree = (offerCount: number) =>
  Tree.create(
    Array.from({ length: offerCount }, (_, index) =>
      baseOffer({ maxAssets: 0n, maxUnits: BigInt(index + 1) }),
    ),
  );

const signTree = async (
  tree: Tree,
  account = privateKeyToAccount(privateKey),
) =>
  account.signTypedData(
    EcrecoverRatifierUtils.typedData({ tree, chainId: BigInt(base.id) }),
  );

describe("EcrecoverRatifierUtils.ratify", () => {
  test("default", async () => {
    const account = privateKeyToAccount(privateKey);
    const offer = baseOffer({ maker: account.address, maxAssets: 0n });
    const tree = Tree.create([offer]);
    const signature = await signTree(tree, account);

    const items = await EcrecoverRatifierUtils.ratify({
      tree,
      account,
      signature,
    });
    const decoded = EcrecoverRatifierUtils.decodeRatifierData(
      items[0]!.ratifierData,
    );

    expect(items).toHaveLength(1);
    expect(items[0]!.offer).toBe(tree.offers[0]);
    expect(decoded.signature).toEqual(
      EcrecoverRatifierUtils.toSignature(signature),
    );
    expect(
      TreeUtils.verifyProof({
        offer: items[0]!.offer,
        root: decoded.root,
        leafIndex: decoded.leafIndex,
        proof: decoded.proof,
      }),
    ).toBe(true);
  });

  test("behavior: accepts plain tree input", async () => {
    const account = privateKeyToAccount(privateKey);
    const offer = baseOffer({ maker: account.address, maxAssets: 0n });
    const tree = Tree.create([offer]);
    const signature = await signTree(tree, account);

    const items = await EcrecoverRatifierUtils.ratify({
      tree: [offer],
      account,
      signature,
    });
    const decoded = EcrecoverRatifierUtils.decodeRatifierData(
      items[0]!.ratifierData,
    );

    expect(items).toHaveLength(1);
    expect(items[0]!.offer).not.toBe(offer);
    expect(items[0]!.offer.group).toBe(GroupUtils.hash([offer]));
    expect(decoded.signature).toEqual(
      EcrecoverRatifierUtils.toSignature(signature),
    );
    expect(
      TreeUtils.verifyProof({
        offer: items[0]!.offer,
        root: decoded.root,
        leafIndex: decoded.leafIndex,
        proof: decoded.proof,
      }),
    ).toBe(true);
  });

  test("behavior: signs with client and account", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
    ]);
    const client = createWalletClient({
      chain: base,
      transport: custom({ request: async () => null }),
    });

    const items = await EcrecoverRatifierUtils.ratify({
      tree,
      client,
      account,
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

  test("behavior: signs mixed-maker tree with delegate account", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({ maxAssets: 0n, maker: addresses.maker }),
      baseOffer({ maxAssets: 0n, maker: addresses.taker }),
    ]);
    const client = createWalletClient({
      chain: base,
      transport: custom({ request: async () => null }),
    });

    const items = await EcrecoverRatifierUtils.ratify({
      tree,
      client,
      account,
    });

    expect(items).toHaveLength(2);
    expect(items[0]!.offer.maker).toBe(addresses.maker);
    expect(items[1]!.offer.maker).toBe(addresses.taker);
  });

  test("error: InvalidTreeError mixed ratifiers", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({
        maker: account.address,
        maxAssets: 0n,
        ratifier: ecrecoverRatifier,
      }),
      baseOffer({
        maker: account.address,
        maxAssets: 0n,
        ratifier: setterRatifier,
      }),
    ]);

    await expect(
      EcrecoverRatifierUtils.ratify({
        tree,
        account,
        signature: {
          v: 27,
          r: "0x0000000000000000000000000000000000000000000000000000000000000000",
          s: "0x0000000000000000000000000000000000000000000000000000000000000000",
        },
      }),
    ).rejects.toThrow(InvalidTreeError);
  });

  test("error: InvalidTypedDataSignatureError when precomputed signature does not recover to account", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
    ]);

    await expect(
      EcrecoverRatifierUtils.ratify({
        tree,
        account,
        signature: {
          v: 27,
          r: "0x0000000000000000000000000000000000000000000000000000000000000000",
          s: "0x0000000000000000000000000000000000000000000000000000000000000000",
        },
      }),
    ).rejects.toBeInstanceOf(InvalidTypedDataSignatureError);
  });

  test("error: propagates viem signature verification errors", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
    ]);
    const client = createWalletClient({
      chain: base,
      transport: custom({ request: async () => invalidSignature }),
    });

    await expect(
      EcrecoverRatifierUtils.ratify({
        tree,
        client,
        account: account.address,
      }),
    ).rejects.toThrow();
  });

  test("error: InvalidTypedDataSignatureError when client signs with another account", async () => {
    const account = privateKeyToAccount(privateKey);
    const wrongAccount = privateKeyToAccount(wrongPrivateKey);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
    ]);
    const typedData = EcrecoverRatifierUtils.typedData({
      tree,
      chainId: BigInt(base.id),
    });
    const client = createWalletClient({
      chain: base,
      transport: custom({
        request: async () => wrongAccount.signTypedData(typedData),
      }),
    });

    await expect(
      EcrecoverRatifierUtils.ratify({
        tree,
        client,
        account: account.address,
      }),
    ).rejects.toBeInstanceOf(InvalidTypedDataSignatureError);
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
        ratifier: ecrecoverRatifier,
      }),
      baseOffer({
        maxAssets: 0n,
        ratifier: setterRatifier,
      }),
    ]);

    expect(() =>
      EcrecoverRatifierUtils.typedData({ tree, chainId: 8453n }),
    ).toThrow(InvalidTreeError);
  });

  test("behavior: accepts mixed makers", () => {
    const tree = Tree.create([
      baseOffer({ maxAssets: 0n, maker: addresses.maker }),
      baseOffer({ maxAssets: 0n, maker: addresses.taker }),
    ]);

    expect(
      EcrecoverRatifierUtils.typedData({ tree, chainId: 8453n }).primaryType,
    ).toBe("OfferTree");
  });

  test("behavior: accepts tree-like data without a Tree instance", () => {
    const tree = Tree.create([
      baseOffer({ maxAssets: 0n, maker: addresses.maker }),
      baseOffer({ maxAssets: 0n, maker: addresses.taker }),
    ]);
    const treeLike = {
      offers: tree.offers,
      paddedOffers: tree.paddedOffers,
      leaves: tree.leaves,
      root: tree.root,
      height: tree.height,
    } as const;

    expect(
      EcrecoverRatifierUtils.digest({ tree: treeLike, chainId: 8453n }),
    ).toBe(EcrecoverRatifierUtils.digest({ tree, chainId: 8453n }));
  });
});

describe("EcrecoverRatifierUtils.digest", () => {
  test.each([
    { name: "height 0", offerCount: 1, height: 0 },
    { name: "height 1", offerCount: 2, height: 1 },
    { name: "height 2", offerCount: 4, height: 2 },
  ])("behavior: matches hashTypedData for $name", ({ offerCount, height }) => {
    const tree = ecrecoverTree(offerCount);
    const params = {
      tree,
      chainId: 8453n,
    };

    expect(tree.height).toBe(height);
    expect(EcrecoverRatifierUtils.digest(params)).toBe(
      hashTypedData(EcrecoverRatifierUtils.typedData(params)),
    );
  });

  test("behavior: pinned EcrecoverRatifier digest fixture", () => {
    const tree = ecrecoverTree(4);
    const digest = EcrecoverRatifierUtils.digest({ tree, chainId: 8453n });

    // Captured from the Solidity EcrecoverRatifier digest formula at
    // morpho-org/midnight@336b924a2bb378d810ef6d35b6dd3486759af8bd.
    expect(digest).toBe(
      "0x30fa6f2d2a3c44224e9c3132d392652b0d597ebf6ff76b9283d4718d95c68d9f",
    );
  });
});

describe("EcrecoverRatifierUtils.digestRatifierData", () => {
  test("behavior: matches tree digest for decoded ratifier data", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
      baseOffer({ maker: account.address, maxAssets: 0n, maxUnits: 2n }),
    ]);
    const signature = await signTree(tree, account);
    const ratifierData = EcrecoverRatifierUtils.ratifierData({
      tree,
      leafIndex: 1n,
      signature,
    });

    expect(
      EcrecoverRatifierUtils.digestRatifierData({
        chainId: base.id,
        offer: tree.offers[1]!,
        ratifierData,
      }),
    ).toBe(EcrecoverRatifierUtils.digest({ tree, chainId: BigInt(base.id) }));
  });
});

describe("EcrecoverRatifierUtils.verifyRatifierData", () => {
  test("behavior: verifies proof and returns recovered signer", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({ maker: addresses.maker, maxAssets: 0n }),
      baseOffer({ maker: addresses.taker, maxAssets: 0n, maxUnits: 2n }),
    ]);
    const signature = await signTree(tree, account);
    const ratifierData = EcrecoverRatifierUtils.ratifierData({
      tree,
      leafIndex: 1n,
      signature,
    });

    const verified = await EcrecoverRatifierUtils.verifyRatifierData({
      chainId: base.id,
      offer: tree.offers[1]!,
      ratifierData,
    });

    expect(verified.root).toBe(tree.root);
    expect(verified.leafIndex).toBe(1n);
    expect(isAddressEqual(verified.signer, account.address)).toBe(true);
  });

  test("error: InvalidTreeError when ratifier data proof does not match offer", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
      baseOffer({ maker: account.address, maxAssets: 0n, maxUnits: 2n }),
    ]);
    const signature = await signTree(tree, account);
    const ratifierData = EcrecoverRatifierUtils.ratifierData({
      tree,
      leafIndex: 0n,
      signature,
    });

    await expect(
      EcrecoverRatifierUtils.verifyRatifierData({
        chainId: base.id,
        offer: tree.offers[1]!,
        ratifierData,
      }),
    ).rejects.toBeInstanceOf(InvalidTreeError);
  });

  test("error: ChainIdMismatchError when observed chain differs from offer chain", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
    ]);
    const signature = await signTree(tree, account);
    const ratifierData = EcrecoverRatifierUtils.ratifierData({
      tree,
      leafIndex: 0n,
      signature,
    });

    await expect(
      EcrecoverRatifierUtils.verifyRatifierData({
        chainId: mainnet.id,
        offer: tree.offers[0]!,
        ratifierData,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });

  test("error: InvalidEcrecoverSignatureVError when ratifier data uses non-canonical v", async () => {
    const tree = Tree.create([baseOffer({ maxAssets: 0n })]);
    const proof = tree.proof(0n);
    const ratifierData = EcrecoverRatifierUtils.encodeRatifierData({
      signature: {
        v: 29,
        r: "0x1111111111111111111111111111111111111111111111111111111111111111",
        s: "0x2222222222222222222222222222222222222222222222222222222222222222",
      },
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
    });

    await expect(
      EcrecoverRatifierUtils.verifyRatifierData({
        chainId: base.id,
        offer: tree.offers[0]!,
        ratifierData,
      }),
    ).rejects.toBeInstanceOf(InvalidEcrecoverSignatureVError);
  });
});

describe("EcrecoverRatifierUtils.sign", () => {
  test("default", async () => {
    const account = privateKeyToAccount(privateKey);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
    ]);
    const client = createWalletClient({
      chain: base,
      transport: custom({ request: async () => null }),
    });

    const signature = await EcrecoverRatifierUtils.sign({
      tree,
      client,
      account,
    });

    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
  });

  test("error: InvalidTreeError when offers span multiple chain ids", async () => {
    const account = privateKeyToAccount(privateKey);
    const request = vi.fn(async () => null);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
      baseOffer({
        maker: account.address,
        market: { ...baseMarketParamsInput(), chainId: mainnet.id },
        maxAssets: 0n,
      }),
    ]);
    const client = createWalletClient({
      chain: base,
      transport: custom({ request }),
    });

    await expect(
      EcrecoverRatifierUtils.sign({
        tree,
        client,
        account,
      }),
    ).rejects.toBeInstanceOf(InvalidTreeError);
    expect(request).not.toHaveBeenCalled();
  });

  test("error: ChainIdMismatchError when client chain differs from offer chain", async () => {
    const account = privateKeyToAccount(privateKey);
    const request = vi.fn(async () => null);
    const tree = Tree.create([
      baseOffer({ maker: account.address, maxAssets: 0n }),
    ]);
    const client = createWalletClient({
      chain: mainnet,
      transport: custom({ request }),
    });

    await expect(
      EcrecoverRatifierUtils.sign({
        tree,
        client,
        account,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("EcrecoverRatifierUtils.treeTypeHash", () => {
  test("default", () => {
    for (let height = 0; height <= 20; height++) {
      expect(EcrecoverRatifierUtils.treeTypeHash(height)).toBe(
        typeHash(offerTreeType(height)),
      );
    }
  });

  test("error: InvalidTreeHeightError", () => {
    expect(() => EcrecoverRatifierUtils.treeTypeHash(21)).toThrow(
      InvalidTreeHeightError,
    );
  });
});

describe("EcrecoverRatifierUtils typehash constants", () => {
  test("default", () => {
    expect(COLLATERAL_PARAMS_TYPEHASH).toBe(typeHash(collateralParamsType));
    expect(MARKET_TYPEHASH).toBe(
      typeHash(`${marketType}${collateralParamsType}`),
    );
    expect(OFFER_TYPEHASH).toBe(
      typeHash(`${offerType}${collateralParamsType}${marketType}`),
    );
    expect(EIP712_DOMAIN_TYPEHASH).toBe(typeHash(eip712DomainType));
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
  test("behavior: accepts mixed makers", () => {
    const tree = Tree.create([
      baseOffer({ maxAssets: 0n, maker: addresses.maker }),
      baseOffer({ maxAssets: 0n, maker: addresses.taker }),
    ]);

    expect(
      EcrecoverRatifierUtils.ratifierData({
        tree,
        leafIndex: 0n,
        signature: {
          v: 27,
          r: "0x0000000000000000000000000000000000000000000000000000000000000000",
          s: "0x0000000000000000000000000000000000000000000000000000000000000000",
        },
      }).startsWith("0x"),
    ).toBe(true);
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
