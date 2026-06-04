import { bytesToHex, encodeAbiParameters, type Hex, hexToBytes } from "viem";
import { describe, expect, test } from "vitest";
import {
  addresses,
  baseMarketParamsInput,
  baseOffer,
} from "../__test__/fixtures.js";
import type { IOffer, OfferStruct } from "../offers/index.js";
import { offerStructAbiComponents, offerToStruct } from "../offers/Offer.js";
import * as Payload from "./Payload.js";
import { MAX_ATTRIBUTION_SUFFIX_BYTES } from "./Payload.js";

const ROUTER_VALID_MATURITY = 1_767_279_600n;

const itemsAbi = [
  {
    name: "items",
    type: "tuple[]",
    components: [
      { name: "offer", type: "tuple", components: offerStructAbiComponents },
      { name: "ratifierData", type: "bytes" },
    ],
  },
] as const;

function routerValidOffer(overrides: Partial<IOffer> = {}) {
  return baseOffer({
    market: {
      ...baseMarketParamsInput(),
      maturity: ROUTER_VALID_MATURITY,
    },
    expiry: ROUTER_VALID_MATURITY - 60n,
    maxUnits: 0n,
    maxAssets: 1_000n,
    ...overrides,
  });
}

async function encodeUncheckedPayload(
  offer: OfferStruct,
): Promise<Payload.Payload> {
  const itemBytes = hexToBytes(
    encodeAbiParameters(itemsAbi, [[{ offer, ratifierData: "0x1234" as Hex }]]),
  );
  const stream = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(itemBytes);
      controller.close();
    },
  }).pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const encoded = new Uint8Array(5 + compressed.length);
  encoded[0] = Payload.CURRENT_VERSION;
  new DataView(encoded.buffer).setUint32(1, compressed.length);
  encoded.set(compressed, 5);
  return bytesToHex(encoded);
}

describe("Payload.encode", () => {
  test("default", async () => {
    const offer = routerValidOffer();
    const encoded = await Payload.encode([
      { offer, ratifierData: "0x1234" as Hex },
    ]);

    const decoded = await Payload.decode(encoded);

    expect(decoded).toHaveLength(1);
    expect(offerToStruct(decoded[0]!.offer)).toEqual(offerToStruct(offer));
    expect(decoded[0]!.ratifierData).toBe("0x1234");
  });

  test("error: DecodeError", async () => {
    await expect(Payload.encode([])).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: router-invalid offer", async () => {
    await expect(
      Payload.encode([
        {
          offer: routerValidOffer({ expiry: ROUTER_VALID_MATURITY + 60n }),
          ratifierData: "0x1234" as Hex,
        },
      ]),
    ).rejects.toBeInstanceOf(Payload.DecodeError);
  });
});

describe("Payload.buildSubmissionCall", () => {
  test("default", () => {
    const payload = "0x1234" as Payload.Payload;
    const call = Payload.buildSubmissionCall({
      midnightMempool: addresses.midnightMempool,
      payload,
    });

    expect(call).toEqual({
      to: addresses.midnightMempool,
      data: payload,
    });
  });
});

describe("Payload.decode", () => {
  test("behavior: ignores small attribution suffix", async () => {
    const encoded = await Payload.encode([
      { offer: routerValidOffer(), ratifierData: "0x1234" as Hex },
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
      { offer: routerValidOffer(), ratifierData: "0x1234" as Hex },
    ]);
    const suffix = "ff".repeat(MAX_ATTRIBUTION_SUFFIX_BYTES + 1);

    await expect(
      Payload.decode(`${encoded}${suffix}` as Hex),
    ).rejects.toBeInstanceOf(Payload.DecodeError);
  });

  test("error: router-invalid offer bytes", async () => {
    const encoded = await encodeUncheckedPayload(
      offerToStruct(routerValidOffer({ expiry: ROUTER_VALID_MATURITY + 60n })),
    );

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });
});

describe("Payload size limits", () => {
  test("default", () => {
    expect(Payload.MAX_PAYLOAD_BYTES).toBe(
      5 +
        Payload.MAX_COMPRESSED_ITEMS_BYTES +
        Payload.MAX_ATTRIBUTION_SUFFIX_BYTES,
    );
    expect(Payload.MAX_PAYLOAD_HEX_LENGTH).toBe(
      "0x".length + Payload.MAX_PAYLOAD_BYTES * 2,
    );
    expect(Payload.MAX_REQUEST_BODY_BYTES).toBe(
      Payload.MAX_PAYLOAD_HEX_LENGTH + 1_024,
    );
    expect(bytesToHex(new Uint8Array(Payload.MAX_PAYLOAD_BYTES)).length).toBe(
      Payload.MAX_PAYLOAD_HEX_LENGTH,
    );
  });
});
