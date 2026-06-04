import { decodeFunctionData, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { addresses, baseOffer } from "../__test__/fixtures.js";
import { ecrecoverRatifierAbi, setterRatifierAbi } from "../abis.js";
import { InvalidOfferPayloadError } from "../errors.js";
import { Offer } from "../offers/index.js";
import { OfferPayloadUtils } from "./OfferPayloadUtils.js";
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
    group: zeroBytes32,
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

describe("OfferPayloadUtils.buildOfferPayload", () => {
  test("default", () => {
    const payload = OfferPayloadUtils.buildOfferPayload([baseOffer()]);

    expect(payload.height).toBe(0);
    expect(payload.root).toMatchInlineSnapshot(
      `"0x5724782130140d1f138aa3d5830e65bdc4014a0c4fbc8b4ae2b6f8b54d4723f4"`,
    );
  });

  test("behavior: proof for second leaf", () => {
    const offers = [
      baseOffer({
        group:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
      }),
      baseOffer({
        group:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
      }),
    ];
    const proof = OfferPayloadUtils.buildOfferProof({ offers, leafIndex: 1n });

    expect(proof.proof).toHaveLength(1);
    expect(proof.root).toBe(OfferPayloadUtils.buildOfferTreeRoot(offers));
  });

  test("behavior: pads non-power-of-two batches", () => {
    const offers = [
      baseOffer({
        group:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
      }),
      baseOffer({
        group:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
      }),
      baseOffer({
        group:
          "0x3333333333333333333333333333333333333333333333333333333333333333",
      }),
    ];
    const payload = OfferPayloadUtils.buildOfferPayload(offers);
    const proof = OfferPayloadUtils.buildOfferProof({ offers, leafIndex: 2n });

    expect(payload.offers).toHaveLength(4);
    expect(payload.height).toBe(2);
    expect(payload.offers.slice(0, 3)).toEqual(
      offers.map((offer) => offer.toStruct()),
    );
    expect(payload.offers[3]).toEqual(emptyOffer().toStruct());
    expect(proof.proof).toHaveLength(2);
    expect(
      OfferPayloadUtils.verifyOfferProof({
        offer: offers[2]!,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(true);
  });

  test("error: duplicate offer hash", () => {
    const offer = baseOffer();

    expect(() => OfferPayloadUtils.buildOfferPayload([offer, offer])).toThrow(
      InvalidOfferPayloadError,
    );
  });

  test("error: all padding", () => {
    expect(() => OfferPayloadUtils.buildOfferPayload([emptyOffer()])).toThrow(
      InvalidOfferPayloadError,
    );
  });
});

describe("OfferPayloadUtils.buildEcrecoverRatificationTypedData", () => {
  test("default", () => {
    const typedData = OfferPayloadUtils.buildEcrecoverRatificationTypedData({
      offers: [baseOffer()],
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

describe("OfferPayloadUtils.encodeEcrecoverRatifierData", () => {
  test("default", () => {
    const data = OfferPayloadUtils.encodeEcrecoverRatifierData({
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
    const data = OfferPayloadUtils.encodeEcrecoverRatifierData({
      signature,
      root,
      leafIndex: 2n,
      proof: [proofNode],
    });

    expect(OfferPayloadUtils.decodeEcrecoverRatifierData(data)).toEqual({
      signature,
      root,
      leafIndex: 2n,
      proof: [proofNode],
    });
  });
});

describe("OfferPayloadUtils.encodeSetterRatifierData", () => {
  test("behavior: decode round trip", () => {
    const data = OfferPayloadUtils.encodeSetterRatifierData({
      root,
      leafIndex: 3n,
      proof: [proofNode],
    });

    expect(OfferPayloadUtils.decodeSetterRatifierData(data)).toEqual({
      root,
      leafIndex: 3n,
      proof: [proofNode],
    });
  });
});

describe("OfferPayloadUtils.verifyOfferProof", () => {
  test("default", () => {
    const offers = [
      baseOffer({
        group:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
      }),
      baseOffer({
        group:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
      }),
    ];
    const proof = OfferPayloadUtils.buildOfferProof({ offers, leafIndex: 1n });

    expect(
      OfferPayloadUtils.verifyOfferProof({
        offer: offers[1]!,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(true);
    expect(
      OfferPayloadUtils.verifyOfferProof({
        offer: offers[1]!,
        root: root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(false);
    expect(
      OfferPayloadUtils.verifyOfferProof({
        offer: offers[1]!,
        root: proof.root,
        leafIndex: 0n,
        proof: proof.proof,
      }),
    ).toBe(false);
    expect(
      OfferPayloadUtils.verifyOfferProof({
        offer: offers[1]!,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: [root],
      }),
    ).toBe(false);
  });
});

describe("OfferPayloadUtils.buildSetterRootApprovalCall", () => {
  test("default", () => {
    const call = OfferPayloadUtils.buildSetterRootApprovalCall({
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
      OfferPayloadUtils.buildSetterRootApprovalCall({
        setterRatifier: addresses.setterRatifier,
        maker: addresses.maker,
        root: "0x1234",
      }),
    ).toThrow();
  });
});

describe("OfferPayloadUtils.buildEcrecoverRootCancellationCall", () => {
  test("default", () => {
    const call = OfferPayloadUtils.buildEcrecoverRootCancellationCall({
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
