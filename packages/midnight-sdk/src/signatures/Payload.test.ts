import type { Hex } from "viem";
import { describe, expect, test } from "vitest";
import { baseOffer } from "../__test__/fixtures.js";
import { MAX_OFFERS_PER_TREE } from "../constants.js";
import { Offer } from "../offers/index.js";
import * as Payload from "./Payload.js";
import { MAX_ATTRIBUTION_SUFFIX_BYTES } from "./Payload.js";

describe("Payload.encode", () => {
  test("default", async () => {
    const offer = baseOffer();
    const encoded = await Payload.encode([
      { offer, ratifierData: "0x1234" as Hex },
    ]);

    const decoded = await Payload.decode(encoded);

    expect(decoded).toHaveLength(1);
    expect(Offer.from(decoded[0]!.offer).toStruct()).toEqual(offer.toStruct());
    expect(decoded[0]!.ratifierData).toBe("0x1234");
  });

  test("error: DecodeError", async () => {
    await expect(Payload.encode([])).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: item cap", async () => {
    await expect(
      Payload.encode(
        Array.from({ length: MAX_OFFERS_PER_TREE + 1 }, () => ({
          offer: baseOffer(),
          ratifierData: "0x" as Hex,
        })),
      ),
    ).rejects.toBeInstanceOf(Payload.DecodeError);
  });
});

describe("Payload.decode", () => {
  test("behavior: ignores small attribution suffix", async () => {
    const encoded = await Payload.encode([
      { offer: baseOffer(), ratifierData: "0x1234" as Hex },
    ]);
    const tagged = `${encoded}ff` as Hex;

    const decoded = await Payload.decode(tagged);

    expect(decoded[0]!.ratifierData).toBe("0x1234");
  });

  test("error: DecodeError", async () => {
    await expect(Payload.decode("0x1234")).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: attribution suffix cap", async () => {
    const encoded = await Payload.encode([
      { offer: baseOffer(), ratifierData: "0x1234" as Hex },
    ]);
    const suffix = "ff".repeat(MAX_ATTRIBUTION_SUFFIX_BYTES + 1);

    await expect(
      Payload.decode(`${encoded}${suffix}` as Hex),
    ).rejects.toBeInstanceOf(Payload.DecodeError);
  });
});
