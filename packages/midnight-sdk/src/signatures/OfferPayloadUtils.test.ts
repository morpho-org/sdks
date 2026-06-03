import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import { addresses, baseOffer } from "../__test__/fixtures.js";
import { setterRatifierAbi } from "../abis.js";
import { OfferPayloadUtils } from "./OfferPayloadUtils.js";
import { RatifierUtils } from "./RatifierUtils.js";

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
