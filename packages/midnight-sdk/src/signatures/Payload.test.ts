import {
  type Address,
  bytesToHex,
  concat,
  encodeAbiParameters,
  type Hex,
  hexToBytes,
  numberToHex,
  zeroAddress,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  addresses,
  baseMarketParamsInput,
  baseOffer,
  group,
} from "../__test__/fixtures.js";
import { type IOffer, type OfferStruct, OfferUtils } from "../offers/index.js";
import * as Payload from "./Payload.js";
import { MAX_ATTRIBUTION_SUFFIX_BYTES } from "./Payload.js";

const API_VALID_MATURITY = 1_767_279_600n;

const offerStructAbiComponents = [
  {
    name: "market",
    type: "tuple",
    components: [
      { name: "loanToken", type: "address" },
      {
        name: "collateralParams",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "lltv", type: "uint256" },
          { name: "maxLif", type: "uint256" },
          { name: "oracle", type: "address" },
        ],
      },
      { name: "maturity", type: "uint256" },
      { name: "rcfThreshold", type: "uint256" },
      { name: "enterGate", type: "address" },
      { name: "liquidatorGate", type: "address" },
    ],
  },
  { name: "buy", type: "bool" },
  { name: "maker", type: "address" },
  { name: "start", type: "uint256" },
  { name: "expiry", type: "uint256" },
  { name: "tick", type: "uint256" },
  { name: "group", type: "bytes32" },
  { name: "callback", type: "address" },
  { name: "callbackData", type: "bytes" },
  { name: "receiverIfMakerIsSeller", type: "address" },
  { name: "ratifier", type: "address" },
  { name: "reduceOnly", type: "bool" },
  { name: "maxUnits", type: "uint256" },
  { name: "maxAssets", type: "uint256" },
] as const;

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

async function encodeUncheckedPayload(offer: OfferStruct): Promise<Hex> {
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
    const offer = apiValidOffer({ group });
    const encoded = await Payload.encode([
      { offer, ratifierData: "0x1234" as Hex },
    ]);

    const decoded = await Payload.decode(encoded);

    expect(decoded).toHaveLength(1);
    expect(decoded[0]!.offer.group).toBe(group);
    expect(
      OfferUtils.toStruct({
        offer: decoded[0]!.offer,
      }),
    ).toEqual(
      OfferUtils.toStruct({
        offer,
      }),
    );
    expect(decoded[0]!.ratifierData).toBe("0x1234");
  });

  test("error: DecodeError", async () => {
    await expect(Payload.encode([])).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("behavior: does not enforce router item-count policy", async () => {
    const item = {
      offer: apiValidOffer({ group }),
      ratifierData: "0x1234" as Hex,
    };

    const encoded = await Payload.encode(
      Array.from({ length: 257 }, () => item),
    );

    await expect(Payload.decode(encoded)).resolves.toHaveLength(257);
  });

  test("error: API-invalid offer", async () => {
    await expect(
      Payload.encode([
        {
          offer: apiValidOffer({ expiry: API_VALID_MATURITY + 60n }),
          ratifierData: "0x1234" as Hex,
        },
      ]),
    ).rejects.toBeInstanceOf(Payload.DecodeError);
  });

  test("error: invalid offer time range", async () => {
    await expect(
      Payload.encode([
        {
          offer: apiValidOffer({
            start: API_VALID_MATURITY - 60n,
            expiry: API_VALID_MATURITY - 60n,
          }),
          ratifierData: "0x1234" as Hex,
        },
      ]),
    ).rejects.toBeInstanceOf(Payload.DecodeError);
  });

  test("error: zero offer caps", async () => {
    await expect(
      Payload.encode([
        {
          offer: apiValidOffer({ maxAssets: 0n }),
          ratifierData: "0x1234" as Hex,
        },
      ]),
    ).rejects.toBeInstanceOf(Payload.DecodeError);
  });
});

describe("Payload.decode", () => {
  test("behavior: ignores small attribution suffix", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
    ]);
    const tagged = concat([encoded, "0xff"]);

    const decoded = await Payload.decode(tagged);

    expect(decoded[0]!.ratifierData).toBe("0x1234");
  });

  test("error: DecodeError", async () => {
    await expect(Payload.decode("0x1234")).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: invalid version", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
    ]);
    const bytes = hexToBytes(encoded);
    bytes[0] = Payload.CURRENT_VERSION + 1;

    await expect(Payload.decode(bytesToHex(bytes))).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: truncated gzip stream", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
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
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
    ]);
    const suffix = bytesToHex(
      new Uint8Array(MAX_ATTRIBUTION_SUFFIX_BYTES + 1).fill(255),
    );

    await expect(
      Payload.decode(concat([encoded, suffix])),
    ).rejects.toBeInstanceOf(Payload.DecodeError);
  });

  test("error: payload hex length cap", async () => {
    const payload = `0x${"zz".repeat(Payload.MAX_PAYLOAD_BYTES + 1)}` as Hex;

    await expect(Payload.decode(payload)).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: maxItems option", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
      { offer: apiValidOffer({ group }), ratifierData: "0x5678" as Hex },
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
        offer: apiValidOffer({
          expiry: API_VALID_MATURITY + 60n,
          group,
        }),
      }),
    );

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: invalid offer time range bytes", async () => {
    const encoded = await encodeUncheckedPayload(
      OfferUtils.toStruct({
        offer: apiValidOffer({
          group,
          start: API_VALID_MATURITY - 60n,
          expiry: API_VALID_MATURITY - 60n,
        }),
      }),
    );

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: zero offer caps bytes", async () => {
    const encoded = await encodeUncheckedPayload(
      OfferUtils.toStruct({
        offer: apiValidOffer({
          group,
          maxAssets: 0n,
        }),
      }),
    );

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: too many collateral params", async () => {
    const offer = OfferUtils.toStruct({ offer: apiValidOffer({ group }) });
    const encoded = await encodeUncheckedPayload({
      ...offer,
      market: {
        ...offer.market,
        collateralParams: Array.from({ length: 129 }, (_, index) => ({
          token: numberToHex(index + 1, { size: 20 }) as Address,
          lltv: 770000000000000000n,
          maxLif: 1061007957559681697n,
          oracle: addresses.oracle,
        })),
      },
    });

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: invalid collateral maxLif", async () => {
    const offer = OfferUtils.toStruct({ offer: apiValidOffer({ group }) });
    const encoded = await encodeUncheckedPayload({
      ...offer,
      market: {
        ...offer.market,
        collateralParams: [
          {
            ...offer.market.collateralParams[0]!,
            maxLif: 1n,
          },
        ],
      },
    });

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      Payload.DecodeError,
    );
  });

  test("error: zero collateral token", async () => {
    const offer = OfferUtils.toStruct({ offer: apiValidOffer({ group }) });
    const encoded = await encodeUncheckedPayload({
      ...offer,
      market: {
        ...offer.market,
        collateralParams: [
          {
            ...offer.market.collateralParams[0]!,
            token: zeroAddress,
          },
        ],
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
