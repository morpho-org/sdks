import {
  createWalletClient,
  custom,
  type Hex,
  hashTypedData,
  keccak256,
  type Signature,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { describe, expect, test } from "vitest";
import { addresses, baseOffer } from "../__test__/fixtures.js";
import {
  COLLATERAL_PARAMS_TYPEHASH,
  EIP712_DOMAIN_TYPEHASH,
  MARKET_TYPEHASH,
  OFFER_TYPEHASH,
} from "../constants.js";
import {
  InvalidTreeError,
  InvalidTreeHeightError,
  InvalidTypedDataSignatureError,
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
const wrongPrivateKey =
  "0x0000000000000000000000000000000000000000000000000000000000000002" as const;
const invalidSignature = `0x${"00".repeat(65)}` as Hex;
const collateralParamsType =
  "CollateralParams(address token,uint256 lltv,uint256 liquidationCursor,address oracle)";
const marketType =
  "Market(uint256 chainId,address midnight,address loanToken,CollateralParams[] collateralParams,uint256 maturity,uint256 rcfThreshold,address enterGate,address liquidatorGate)";
const offerType =
  "Offer(Market market,bool buy,address maker,uint256 start,uint256 expiry,uint256 tick,bytes32 group,address callback,bytes callbackData,address receiverIfMakerIsSeller,address ratifier,bool reduceOnly,uint256 maxUnits,uint256 maxAssets,uint256 continuousFeeCap)";
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

  test("behavior: accepts mixed makers", () => {
    const tree = Tree.create([
      baseOffer({ maxAssets: 0n, maker: addresses.maker }),
      baseOffer({ maxAssets: 0n, maker: addresses.taker }),
    ]);

    expect(
      EcrecoverRatifierUtils.typedData({ tree, chainId: 8453n }).primaryType,
    ).toBe("OfferTree");
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
    // morpho-org/midnight@55db096af93a8f2bc85bb67f3ccc7b92e1bfab73.
    expect(digest).toBe(
      "0xfb891d1a5cb383a7235a7c7044dc2dad21a408420f2272fd9b13947895adce93",
    );
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
