import { decodeFunctionData, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { addresses, baseOffer } from "../__test__/fixtures.js";
import { ecrecoverRatifierAbi, setterRatifierAbi } from "../abis.js";
import { InvalidOfferGroupError, InvalidOfferTreeError } from "../errors.js";
import { Offer, OfferUtils } from "../offers/index.js";
import {
  EcrecoverRatifier,
  Group,
  GroupUtils,
  MAX_OFFERS_PER_TREE,
  OfferTreeUtils,
  SetterRatifier,
  Tree,
} from "./OfferTreeUtils.js";
import { RatifierUtils } from "./RatifierUtils.js";

const root =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
const proofNode =
  "0x4444444444444444444444444444444444444444444444444444444444444444" as const;
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

describe("RatifierUtils.getRatifierInfo", () => {
  test("default", () => {
    expect(
      RatifierUtils.getRatifierInfo({
        bytecode: "0x",
        ecrecoverRatifier: addresses.ecrecoverRatifier,
        setterRatifier: addresses.setterRatifier,
      }),
    ).toEqual({ type: "ecrecover", ratifier: addresses.ecrecoverRatifier });

    expect(
      RatifierUtils.getRatifierInfo({
        bytecode: "0x6000",
        ecrecoverRatifier: addresses.ecrecoverRatifier,
        setterRatifier: addresses.setterRatifier,
      }).type,
    ).toBe("setter");
  });
});

describe("Group.create", () => {
  test("default", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create([offer]);

    expect(group.offers).toHaveLength(1);
    expect(group.offers[0]).toBe(offer);
    expect(group.id).toBe(GroupUtils.hash([offer]));
  });

  test("behavior: group id is independent of offer order", () => {
    const first = baseOffer({ maxAssets: 0n, tick: 5_000n });
    const second = baseOffer({ maxAssets: 0n, tick: 5_004n });

    expect(GroupUtils.hash([first, second])).toBe(
      GroupUtils.hash([second, first]),
    );
    expect(Group.create([first, second]).offers).toEqual([first, second]);
  });
});

describe("Tree.create", () => {
  test("default", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create([offer]);
    const tree = Tree.create([group]);

    expect(tree.offers).toEqual([offer]);
    expect(tree.root).toBe(OfferTreeUtils.buildOfferTreeRoot([group]));
    expect(tree.proof(0n)).toEqual(
      OfferTreeUtils.buildOfferTreeProof({ entries: [group], leafIndex: 0n }),
    );
  });

  test("behavior: standalone offers become single-offer groups", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const tree = Tree.create([offer]);

    expect(tree.groups).toHaveLength(1);
    expect(tree.groups[0]!.id).toBe(GroupUtils.hash([offer]));
    expect(tree.offers).toEqual([offer]);
  });
});

describe("EcrecoverRatifier.ratify", () => {
  test("default", async () => {
    const offer = baseOffer({ maxAssets: 0n });
    const tree = Tree.create([offer]);
    const signature = {
      v: 27,
      r: "0x0000000000000000000000000000000000000000000000000000000000000000",
      s: "0x0000000000000000000000000000000000000000000000000000000000000000",
    } as const;

    const items = await EcrecoverRatifier.ratify({ tree, signature });
    const decoded = EcrecoverRatifier.decodeRatifierData(
      items[0]!.ratifierData,
    );

    expect(items).toHaveLength(1);
    expect(items[0]!.offer).toBe(offer);
    expect(decoded.signature).toEqual(signature);
    expect(
      OfferTreeUtils.verifyOfferTreeProof({
        offer,
        group: items[0]!.group,
        root: decoded.root,
        leafIndex: decoded.leafIndex,
        proof: decoded.proof,
      }),
    ).toBe(true);
  });
});

describe("SetterRatifier.ratify", () => {
  test("default", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const tree = Tree.create([offer]);

    const items = SetterRatifier.ratify({ tree });
    const decoded = SetterRatifier.decodeRatifierData(items[0]!.ratifierData);

    expect(items).toHaveLength(1);
    expect(items[0]!.offer).toBe(offer);
    expect(
      OfferTreeUtils.verifyOfferTreeProof({
        offer,
        group: items[0]!.group,
        root: decoded.root,
        leafIndex: decoded.leafIndex,
        proof: decoded.proof,
      }),
    ).toBe(true);
  });
});

describe("OfferTreeUtils.buildOfferTreeDescriptor", () => {
  test("default", () => {
    const payload = OfferTreeUtils.buildOfferTreeDescriptor([
      baseOffer({ maxAssets: 0n }),
    ]);

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
    const proof = OfferTreeUtils.buildOfferTreeProof({
      entries: groups,
      leafIndex: 1n,
    });

    expect(proof.proof).toHaveLength(1);
    expect(proof.root).toBe(OfferTreeUtils.buildOfferTreeRoot(groups));
  });

  test("behavior: pads non-power-of-two batches", () => {
    const offers = [
      baseOffer({ maxAssets: 0n, tick: 5_000n }),
      baseOffer({ maxAssets: 0n, tick: 5_004n }),
      baseOffer({ maxAssets: 0n, tick: 5_008n }),
    ];
    const groups = offers.map((offer) => Group.create([offer]));
    const payload = OfferTreeUtils.buildOfferTreeDescriptor(groups);
    const proof = OfferTreeUtils.buildOfferTreeProof({
      entries: groups,
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
      OfferTreeUtils.verifyOfferTreeProof({
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

    expect(() =>
      OfferTreeUtils.buildOfferTreeDescriptor([offer, offer]),
    ).toThrow(InvalidOfferTreeError);
  });

  test("error: invalid empty offer", () => {
    expect(() =>
      OfferTreeUtils.buildOfferTreeDescriptor([emptyOffer()]),
    ).toThrow(InvalidOfferGroupError);
  });

  test("error: offer count cap", () => {
    const offer = baseOffer({ maxAssets: 0n });

    expect(() =>
      OfferTreeUtils.buildOfferTreeDescriptor(
        Array.from({ length: MAX_OFFERS_PER_TREE + 1 }, () => offer),
      ),
    ).toThrow(InvalidOfferTreeError);
  });
});

describe("OfferTreeUtils.buildEcrecoverRatificationTypedData", () => {
  test("default", () => {
    const typedData = OfferTreeUtils.buildEcrecoverRatificationTypedData({
      entries: [baseOffer({ maxAssets: 0n })],
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

describe("OfferTreeUtils.encodeEcrecoverRatifierData", () => {
  test("default", () => {
    const data = OfferTreeUtils.encodeEcrecoverRatifierData({
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
    const data = OfferTreeUtils.encodeEcrecoverRatifierData({
      signature,
      root,
      leafIndex: 2n,
      proof: [proofNode],
    });

    expect(OfferTreeUtils.decodeEcrecoverRatifierData(data)).toEqual({
      signature,
      root,
      leafIndex: 2n,
      proof: [proofNode],
    });
  });
});

describe("OfferTreeUtils.encodeSetterRatifierData", () => {
  test("behavior: decode round trip", () => {
    const data = OfferTreeUtils.encodeSetterRatifierData({
      root,
      leafIndex: 3n,
      proof: [proofNode],
    });

    expect(OfferTreeUtils.decodeSetterRatifierData(data)).toEqual({
      root,
      leafIndex: 3n,
      proof: [proofNode],
    });
  });
});

describe("OfferTreeUtils.verifyOfferTreeProof", () => {
  test("default", () => {
    const offers = [
      baseOffer({ maxAssets: 0n, tick: 5_000n }),
      baseOffer({ maxAssets: 0n, tick: 5_004n }),
    ];
    const groups = offers.map((offer) => Group.create([offer]));
    const proof = OfferTreeUtils.buildOfferTreeProof({
      entries: groups,
      leafIndex: 1n,
    });

    expect(
      OfferTreeUtils.verifyOfferTreeProof({
        offer: offers[1]!,
        group: groups[1]!.id,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(true);
    expect(
      OfferTreeUtils.verifyOfferTreeProof({
        offer: offers[1]!,
        group: groups[1]!.id,
        root: root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(false);
    expect(
      OfferTreeUtils.verifyOfferTreeProof({
        offer: offers[1]!,
        group: groups[1]!.id,
        root: proof.root,
        leafIndex: 0n,
        proof: proof.proof,
      }),
    ).toBe(false);
    expect(
      OfferTreeUtils.verifyOfferTreeProof({
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
      OfferTreeUtils.verifyOfferTreeProof({
        offer,
        group: group.id,
        root: offerRoot,
        leafIndex: 1n,
        proof: [],
      }),
    ).toBe(false);
    expect(
      OfferTreeUtils.verifyOfferTreeProof({
        offer,
        group: group.id,
        root: offerRoot,
        leafIndex: -1n,
        proof: [],
      }),
    ).toBe(false);
  });
});

describe("OfferTreeUtils.buildSetterRootApprovalCall", () => {
  test("default", () => {
    const call = OfferTreeUtils.buildSetterRootApprovalCall({
      setterRatifier: addresses.setterRatifier,
      maker: addresses.maker,
      root: "0x0000000000000000000000000000000000000000000000000000000000000000",
    });
    const decoded = decodeFunctionData({
      abi: setterRatifierAbi,
      data: call.data,
    });

    expect(decoded.functionName).toBe("setIsRootRatified");
    expect(decoded.args[2]).toBe(true);
  });

  test("error: invalid bytes32 root", () => {
    expect(() =>
      OfferTreeUtils.buildSetterRootApprovalCall({
        setterRatifier: addresses.setterRatifier,
        maker: addresses.maker,
        root: "0x1234",
      }),
    ).toThrow();
  });
});

describe("OfferTreeUtils.buildEcrecoverRootCancellationCall", () => {
  test("default", () => {
    const call = OfferTreeUtils.buildEcrecoverRootCancellationCall({
      ecrecoverRatifier: addresses.ecrecoverRatifier,
      maker: addresses.maker,
      root,
    });
    const decoded = decodeFunctionData({
      abi: ecrecoverRatifierAbi,
      data: call.data,
    });

    expect(call.to).toBe(addresses.ecrecoverRatifier);
    expect(decoded.functionName).toBe("cancelRoot");
    expect(decoded.args[0]).toBe(addresses.maker);
    expect(decoded.args[1]).toBe(root);
  });
});
