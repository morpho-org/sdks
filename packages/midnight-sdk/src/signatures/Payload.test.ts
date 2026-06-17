import {
  type Address,
  bytesToHex,
  concat,
  encodeAbiParameters,
  type Hex,
  hexToBytes,
  numberToHex,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  addresses,
  baseMarketParamsInput,
  baseOffer,
  group,
} from "../__test__/fixtures.js";
import { type IOffer, type OfferStruct, OfferUtils } from "../offers/index.js";
import { offerStructAbiComponents } from "../offers/Offer.js";
import * as Payload from "./Payload.js";
import { MAX_ATTRIBUTION_SUFFIX_BYTES } from "./Payload.js";
import { MAX_OFFERS_PER_TREE } from "./TreeUtils.js";

const API_VALID_MATURITY = 1_767_279_600n;

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

function apiValidOffer(overrides: Partial<IOffer> = {}) {
  return baseOffer({
    market: {
      ...baseMarketParamsInput(),
      maturity: API_VALID_MATURITY,
    },
    expiry: API_VALID_MATURITY - 60n,
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
    const offer = apiValidOffer();
    const encoded = await Payload.encode([
      { offer, group, ratifierData: "0x1234" as Hex },
    ]);

    const decoded = await Payload.decode(encoded);

    expect(decoded).toHaveLength(1);
    expect(decoded[0]!.group).toBe(group);
    expect(
      OfferUtils.toStruct({
        offer: decoded[0]!.offer,
        group: decoded[0]!.group,
      }),
    ).toEqual(
      OfferUtils.toStruct({
        offer,
        group,
      }),
    );
    expect(decoded[0]!.ratifierData).toBe("0x1234");
  });

  test("error: DecodeError", async () => {
    await expect(Payload.encode([])).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: item count cap", async () => {
    const item = {
      offer: apiValidOffer(),
      group,
      ratifierData: "0x1234" as Hex,
    };

    await expect(
      Payload.encode(
        Array.from({ length: MAX_OFFERS_PER_TREE + 1 }, () => item),
      ),
    ).rejects.toBeInstanceOf(Payload.DecodeError);
  });

  test("error: API-invalid offer", async () => {
    await expect(
      Payload.encode([
        {
          offer: apiValidOffer({ expiry: API_VALID_MATURITY + 60n }),
          group,
          ratifierData: "0x1234" as Hex,
        },
      ]),
    ).rejects.toBeInstanceOf(Payload.DecodeError);
  });
});

describe("Payload.decode", () => {
  test("behavior: ignores small attribution suffix", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer(), group, ratifierData: "0x1234" as Hex },
    ]);
    const tagged = concat([encoded, "0xff"]);

    const decoded = await Payload.decode(tagged);

    expect(decoded[0]!.ratifierData).toBe("0x1234");
  });

  test("behavior: records decode timings", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer(), group, ratifierData: "0x1234" as Hex },
    ]);
    const timings: Payload.DecodeTimings = {
      hexToBytesMs: 0,
      decompressMs: 0,
      abiItemCountMs: 0,
      itemsDecodeMs: 0,
      canonicalEncodeMs: 0,
    };

    await Payload.decode(encoded, { timings });

    expect(timings.hexToBytesMs).toBeGreaterThanOrEqual(0);
    expect(timings.decompressMs).toBeGreaterThanOrEqual(0);
    expect(timings.abiItemCountMs).toBeGreaterThanOrEqual(0);
    expect(timings.itemsDecodeMs).toBeGreaterThanOrEqual(0);
    expect(timings.canonicalEncodeMs).toBeGreaterThanOrEqual(0);
  });

  test("error: DecodeError", async () => {
    await expect(Payload.decode("0x1234")).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: invalid version", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer(), group, ratifierData: "0x1234" as Hex },
    ]);
    const bytes = hexToBytes(encoded);
    bytes[0] = Payload.CURRENT_VERSION + 1;

    await expect(Payload.decode(bytesToHex(bytes))).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: truncated gzip stream", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer(), group, ratifierData: "0x1234" as Hex },
    ]);
    const bytes = hexToBytes(encoded);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const compressedLength = view.getUint32(1);
    view.setUint32(1, compressedLength + 1);

    await expect(Payload.decode(bytesToHex(bytes))).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: attribution suffix cap", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer(), group, ratifierData: "0x1234" as Hex },
    ]);
    const suffix = bytesToHex(
      new Uint8Array(MAX_ATTRIBUTION_SUFFIX_BYTES + 1).fill(255),
    );

    await expect(
      Payload.decode(concat([encoded, suffix])),
    ).rejects.toBeInstanceOf(Payload.DecodeError);
  });

  test("error: maxItems option", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer(), group, ratifierData: "0x1234" as Hex },
      { offer: apiValidOffer(), group, ratifierData: "0x5678" as Hex },
    ]);

    await expect(
      Payload.decode(encoded, { maxItems: 1 }),
    ).rejects.toBeInstanceOf(Payload.DecodeError);
  });

  test("error: invalid maxItems option", async () => {
    await expect(Payload.decode("0x" as Hex, { maxItems: 0 })).rejects.toThrow(
      Payload.DecodeError,
    );
  });

  test("error: API-invalid offer bytes", async () => {
    const encoded = await encodeUncheckedPayload(
      OfferUtils.toStruct({
        offer: apiValidOffer({ expiry: API_VALID_MATURITY + 60n }),
        group,
      }),
    );

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: too many collateral params", async () => {
    const offer = OfferUtils.toStruct({ offer: apiValidOffer(), group });
    const encoded = await encodeUncheckedPayload({
      ...offer,
      market: {
        ...offer.market,
        collateralParams: Array.from({ length: 129 }, (_, index) => ({
          token: numberToHex(index + 1, { size: 20 }) as Address,
          lltv: 770000000000000000n,
          maxLif: 1298701298701298701n,
          oracle: addresses.oracle,
        })),
      },
    });

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });
});

describe("Payload size limits", () => {
  test("default", () => {
    expect(Payload.MAX_COMPRESSED_ITEMS_BYTES).toBe(1_000_000);
    expect(Payload.MAX_DECOMPRESSED_ITEMS_BYTES).toBe(6_000_000);
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
