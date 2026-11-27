import { gunzipSync, gzipSync } from "node:zlib";
import { ChainId, getChainAddress, MathLib } from "@morpho-org/morpho-ts";
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
import { afterEach, describe, expect, test, vi } from "vitest";
import { addresses, createFixtures, group } from "../__test__/fixtures.js";
import { MAX_OFFER_CAP, MAX_TICK } from "../constants.js";
import { PayloadDecodeError } from "../errors.js";
import { type IOffer, type OfferStruct, OfferUtils } from "../offers/index.js";
import { Payload } from "./Payload.js";

const abiFailure = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    decodeAbiParameters: ((
      ...args: Parameters<typeof actual.decodeAbiParameters>
    ) => {
      if (abiFailure.value !== undefined) {
        throw abiFailure.value;
      }
      return actual.decodeAbiParameters(...args);
    }) as typeof actual.decodeAbiParameters,
  };
});

const { baseMarketParamsInput, baseOffer } = createFixtures({
  midnight: getChainAddress(ChainId.BaseMainnet, "midnight"),
  ecrecoverRatifier: getChainAddress(ChainId.BaseMainnet, "ecrecoverRatifier"),
});

const API_VALID_MATURITY = 1_767_279_600n;
const liquidationCursor = 250000000000000000n;

const offerStructAbiComponents = [
  {
    name: "market",
    type: "tuple",
    components: [
      { name: "chainId", type: "uint256" },
      { name: "midnight", type: "address" },
      { name: "loanToken", type: "address" },
      {
        name: "collateralParams",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "lltv", type: "uint256" },
          { name: "liquidationCursor", type: "uint256" },
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
  { name: "continuousFeeCap", type: "uint256" },
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
      controller.enqueue(new Uint8Array(itemBytes));
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

  test("error: PayloadDecodeError", async () => {
    await expect(Payload.encode([])).rejects.toBeInstanceOf(PayloadDecodeError);
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

  test("behavior: allows zero-duration offer ranges", async () => {
    const encoded = await Payload.encode([
      {
        offer: apiValidOffer({
          group,
          start: API_VALID_MATURITY - 60n,
          expiry: API_VALID_MATURITY - 60n,
        }),
        ratifierData: "0x1234" as Hex,
      },
    ]);

    const decoded = await Payload.decode(encoded);
    expect(decoded[0]!.offer.start).toBe(API_VALID_MATURITY - 60n);
    expect(decoded[0]!.offer.expiry).toBe(API_VALID_MATURITY - 60n);
  });

  test("error: API-invalid offer", async () => {
    await expect(
      Payload.encode([
        {
          offer: apiValidOffer({ expiry: API_VALID_MATURITY + 60n }),
          ratifierData: "0x1234" as Hex,
        },
      ]),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
  });

  test("error: invalid offer time range", async () => {
    await expect(
      Payload.encode([
        {
          offer: apiValidOffer({
            start: API_VALID_MATURITY - 59n,
            expiry: API_VALID_MATURITY - 60n,
          }),
          ratifierData: "0x1234" as Hex,
        },
      ]),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
  });

  test("error: non-zero maker-seller receiver on buy offer", async () => {
    await expect(
      Payload.encode([
        {
          offer: {
            ...OfferUtils.toStruct({ offer: apiValidOffer({ group }) }),
            receiverIfMakerIsSeller: addresses.receiver,
          },
          ratifierData: "0x1234" as Hex,
        },
      ]),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
  });

  test("error: zero offer caps", async () => {
    await expect(
      Payload.encode([
        {
          offer: apiValidOffer({ maxAssets: 0n }),
          ratifierData: "0x1234" as Hex,
        },
      ]),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
  });

  test("error: offer cap above uint128 max", async () => {
    await expect(
      Payload.encode([
        {
          offer: apiValidOffer({ group, maxAssets: MAX_OFFER_CAP + 1n }),
          ratifierData: "0x1234" as Hex,
        },
      ]),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
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

  test("error: PayloadDecodeError", async () => {
    await expect(Payload.decode("0x1234")).rejects.toBeInstanceOf(
      PayloadDecodeError,
    );
  });

  test("error: invalid version", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
    ]);
    const bytes = hexToBytes(encoded);
    bytes[0] = Payload.CURRENT_VERSION + 1;

    await expect(Payload.decode(bytesToHex(bytes))).rejects.toBeInstanceOf(
      PayloadDecodeError,
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
      PayloadDecodeError,
    );
  });

  test("error: attribution suffix cap", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
    ]);
    const suffix = bytesToHex(
      new Uint8Array(Payload.MAX_ATTRIBUTION_SUFFIX_BYTES + 1).fill(255),
    );

    await expect(
      Payload.decode(concat([encoded, suffix])),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
  });

  test("error: payload hex length cap", async () => {
    const payload = `0x${"zz".repeat(Payload.MAX_PAYLOAD_BYTES + 1)}` as Hex;

    await expect(Payload.decode(payload)).rejects.toBeInstanceOf(
      PayloadDecodeError,
    );
  });

  test("error: maxItems option", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
      { offer: apiValidOffer({ group }), ratifierData: "0x5678" as Hex },
    ]);

    await expect(
      Payload.decode(encoded, { maxItems: 1 }),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
  });

  test("error: invalid maxItems option", async () => {
    await expect(Payload.decode("0x" as Hex, { maxItems: 0 })).rejects.toThrow(
      PayloadDecodeError,
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
      PayloadDecodeError,
    );
  });

  test("error: invalid offer time range bytes", async () => {
    const encoded = await encodeUncheckedPayload(
      OfferUtils.toStruct({
        offer: apiValidOffer({
          group,
          start: API_VALID_MATURITY - 59n,
          expiry: API_VALID_MATURITY - 60n,
        }),
      }),
    );

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      PayloadDecodeError,
    );
  });

  test("error: non-zero maker-seller receiver on buy offer bytes", async () => {
    const encoded = await encodeUncheckedPayload({
      ...OfferUtils.toStruct({ offer: apiValidOffer({ group }) }),
      receiverIfMakerIsSeller: addresses.receiver,
    });

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      PayloadDecodeError,
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
      PayloadDecodeError,
    );
  });

  test("error: offer cap above uint128 max bytes", async () => {
    const encoded = await encodeUncheckedPayload({
      ...OfferUtils.toStruct({ offer: apiValidOffer({ group }) }),
      maxAssets: MAX_OFFER_CAP + 1n,
    });

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      PayloadDecodeError,
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
          liquidationCursor,
          oracle: addresses.oracle,
        })),
      },
    });

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      PayloadDecodeError,
    );
  });

  test("behavior: dynamic lltv values are not statically rejected", async () => {
    const lltv = 500000000000000000n;
    const offer = OfferUtils.toStruct({ offer: apiValidOffer({ group }) });
    const encoded = await encodeUncheckedPayload({
      ...offer,
      market: {
        ...offer.market,
        collateralParams: [
          {
            ...offer.market.collateralParams[0]!,
            lltv,
            liquidationCursor,
          },
        ],
      },
    });

    await expect(Payload.decode(encoded)).resolves.toHaveLength(1);
  });

  test("error: collateral lltv above WAD", async () => {
    const offer = OfferUtils.toStruct({ offer: apiValidOffer({ group }) });
    const encoded = await encodeUncheckedPayload({
      ...offer,
      market: {
        ...offer.market,
        collateralParams: [
          {
            ...offer.market.collateralParams[0]!,
            lltv: MathLib.WAD + 1n,
          },
        ],
      },
    });

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      PayloadDecodeError,
    );
  });

  test("error: computed collateral maxLif too high", async () => {
    const offer = OfferUtils.toStruct({ offer: apiValidOffer({ group }) });
    const encoded = await encodeUncheckedPayload({
      ...offer,
      market: {
        ...offer.market,
        collateralParams: [
          {
            ...offer.market.collateralParams[0]!,
            lltv: 0n,
            liquidationCursor: 999000000000000000n,
          },
        ],
      },
    });

    await expect(Payload.decode(encoded)).rejects.toBeInstanceOf(
      PayloadDecodeError,
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
      PayloadDecodeError,
    );
  });
});

describe("Payload.decodeSync", () => {
  const gunzip = (compressed: Uint8Array, maxBytes: number) =>
    gunzipSync(compressed, { maxOutputLength: maxBytes });

  test("default", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
      { offer: apiValidOffer({ group }), ratifierData: "0x5678" as Hex },
    ]);

    expect(Payload.decodeSync(encoded, { gunzip })).toEqual(
      await Payload.decode(encoded),
    );
  });

  test("behavior: passes the decompressed size cap to gunzip", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
    ]);
    const caps: number[] = [];

    Payload.decodeSync(encoded, {
      gunzip: (compressed, maxBytes) => {
        caps.push(maxBytes);
        return gunzip(compressed, maxBytes);
      },
    });

    expect(caps).toEqual([Payload.MAX_DECOMPRESSED_ITEMS_BYTES]);
  });

  test("error: PayloadDecodeError when gunzip throws", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
    ]);

    expect(() =>
      Payload.decodeSync(encoded, {
        gunzip: () => {
          throw new Error("corrupt");
        },
      }),
    ).toThrow(PayloadDecodeError);
  });

  test("error: PayloadDecodeError when gunzip exceeds the size cap", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
    ]);

    expect(() =>
      Payload.decodeSync(encoded, {
        gunzip: () => new Uint8Array(Payload.MAX_DECOMPRESSED_ITEMS_BYTES + 1),
      }),
    ).toThrow(PayloadDecodeError);
  });

  test("behavior: rethrows a PayloadDecodeError from gunzip unchanged", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
    ]);
    const error = new PayloadDecodeError("too large");

    expect(() =>
      Payload.decodeSync(encoded, {
        gunzip: () => {
          throw error;
        },
      }),
    ).toThrow(error);
  });

  test("behavior: keeps the gunzip error as the cause", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
    ]);
    const cause = new RangeError("corrupt");

    expect(() =>
      Payload.decodeSync(encoded, {
        gunzip: () => {
          throw cause;
        },
      }),
    ).toThrow(expect.objectContaining({ cause }));
  });

  test("error: PayloadDecodeError when gunzip throws a non-Error value", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
    ]);

    let error: unknown;
    try {
      Payload.decodeSync(encoded, {
        gunzip: () => {
          throw "corrupt";
        },
      });
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeInstanceOf(PayloadDecodeError);
    expect((error as Error).cause).toBeUndefined();
  });

  test.each([
    { mutation: "an empty gzip stream", length: 0 },
    {
      mutation: "a gzip stream above the compressed cap",
      length: Payload.MAX_COMPRESSED_ITEMS_BYTES + 1,
    },
  ])(
    "error: PayloadDecodeError on $mutation without calling gunzip",
    ({ length }) => {
      const bytes = new Uint8Array(5 + length);
      bytes[0] = Payload.CURRENT_VERSION;
      new DataView(bytes.buffer).setUint32(1, length);
      let called = false;

      expect(() =>
        Payload.decodeSync(bytesToHex(bytes), {
          gunzip: (compressed, maxBytes) => {
            called = true;
            return gunzip(compressed, maxBytes);
          },
        }),
      ).toThrow(PayloadDecodeError);
      expect(called).toBe(false);
    },
  );

  test("error: PayloadDecodeError on malformed wire bytes", () => {
    expect(() => Payload.decodeSync("0x1234", { gunzip })).toThrow(
      PayloadDecodeError,
    );
  });

  test("error: maxItems option", async () => {
    const encoded = await Payload.encode([
      { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
      { offer: apiValidOffer({ group }), ratifierData: "0x5678" as Hex },
    ]);

    expect(() => Payload.decodeSync(encoded, { gunzip, maxItems: 1 })).toThrow(
      PayloadDecodeError,
    );
  });
});

function frame(itemBytes: Uint8Array): Hex {
  const compressed = gzipSync(itemBytes);
  const encoded = new Uint8Array(5 + compressed.length);
  encoded[0] = Payload.CURRENT_VERSION;
  new DataView(encoded.buffer).setUint32(1, compressed.length);
  encoded.set(compressed, 5);
  return bytesToHex(encoded);
}

function word(value: bigint): Uint8Array {
  return hexToBytes(numberToHex(value, { size: 32 }));
}

function validStruct(): OfferStruct {
  return OfferUtils.toStruct({ offer: apiValidOffer({ group }) });
}

function withCollaterals(
  collateralParams: OfferStruct["market"]["collateralParams"],
): OfferStruct {
  const offer = validStruct();
  return { ...offer, market: { ...offer.market, collateralParams } };
}

function itemsBytes(offers: readonly OfferStruct[]): Uint8Array {
  return hexToBytes(
    encodeAbiParameters(itemsAbi, [
      offers.map((offer) => ({ offer, ratifierData: "0x1234" as Hex })),
    ]),
  );
}

function randomBytes(length: number): Hex {
  const bytes = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += 65_536) {
    crypto.getRandomValues(bytes.subarray(offset, offset + 65_536));
  }
  return bytesToHex(bytes);
}

describe.sequential("Payload offer validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test.each<{ mutation: string; offer: () => OfferStruct }>([
    {
      mutation: "a tick above the maximum",
      offer: () => ({ ...validStruct(), tick: MAX_TICK + 1n }),
    },
    {
      mutation: "maxUnits above the offer cap",
      offer: () => ({
        ...validStruct(),
        maxAssets: 0n,
        maxUnits: MAX_OFFER_CAP + 1n,
      }),
    },
    {
      mutation: "no collateral",
      offer: () => withCollaterals([]),
    },
    {
      mutation: "a liquidation cursor at WAD",
      offer: () => {
        const [collateral] = validStruct().market.collateralParams;
        return withCollaterals([
          { ...collateral!, liquidationCursor: MathLib.WAD },
        ]);
      },
    },
    {
      mutation: "a maxLif too high for its lltv",
      offer: () => {
        const [collateral] = validStruct().market.collateralParams;
        return withCollaterals([
          {
            ...collateral!,
            lltv: 990000000000000000n,
            liquidationCursor: 999000000000000000n,
          },
        ]);
      },
    },
    {
      mutation: "unsorted collaterals",
      offer: () => {
        const [collateral] = validStruct().market.collateralParams;
        return withCollaterals([
          {
            ...collateral!,
            token: "0x0000000000000000000000000000000000000002",
          },
          {
            ...collateral!,
            token: "0x0000000000000000000000000000000000000001",
          },
        ]);
      },
    },
    {
      mutation: "a start past the timestamp bound",
      offer: () => ({ ...validStruct(), start: 1_000_000_000_000n }),
    },
    {
      mutation: "a maturity off 15:00 UTC",
      offer: () => {
        const offer = validStruct();
        return {
          ...offer,
          market: { ...offer.market, maturity: API_VALID_MATURITY + 1n },
        };
      },
    },
    {
      mutation: "an empty offer struct",
      offer: () => {
        const offer = validStruct();
        return {
          ...offer,
          market: {
            ...offer.market,
            chainId: 0n,
            midnight: zeroAddress,
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
          group: `0x${"00".repeat(32)}`,
          callback: zeroAddress,
          callbackData: "0x",
          receiverIfMakerIsSeller: zeroAddress,
          ratifier: zeroAddress,
          reduceOnly: false,
          maxUnits: 0n,
          maxAssets: 0n,
          continuousFeeCap: 0n,
        };
      },
    },
  ])("error: PayloadDecodeError on $mutation", async ({ offer }) => {
    await expect(
      Payload.decode(frame(itemsBytes([offer()]))),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
  });

  test("error: PayloadDecodeError when encoding a negative continuous fee cap", async () => {
    await expect(
      Payload.encode([
        {
          offer: { ...apiValidOffer({ group }), group, continuousFeeCap: -1n },
          ratifierData: "0x",
        },
      ]),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
  });

  test("behavior: rethrows a non-Error thrown while validating an offer", async () => {
    const payload = frame(itemsBytes([validStruct()]));
    vi.spyOn(OfferUtils, "validateOfferTimeRange").mockImplementation(() => {
      throw "boom";
    });
    await expect(Payload.decode(payload)).rejects.toBe("boom");
  });

  test("behavior: keeps an unexpected time-range validation error as the cause", async () => {
    const payload = frame(itemsBytes([validStruct()]));
    const error = new TypeError("unexpected");
    vi.spyOn(OfferUtils, "validateOfferTimeRange").mockImplementation(() => {
      throw error;
    });
    const rejection = await Payload.decode(payload).catch((reason) => reason);
    expect(rejection).toBeInstanceOf(PayloadDecodeError);
    expect((rejection as PayloadDecodeError).cause).toBe(error);
  });
});

describe.sequential("Payload item bytes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each<{ mutation: string; bytes: () => Uint8Array; maxItems?: number }>([
    {
      mutation: "bytes shorter than the ABI array head",
      bytes: () => new Uint8Array(10),
    },
    {
      mutation: "an array that ends before its items",
      bytes: () => concat([word(32n), word(1n)]),
    },
    {
      mutation: "trailing non-canonical ABI bytes",
      bytes: () => concat([itemsBytes([validStruct()]), word(0n)]),
    },
    {
      mutation: "an item count above maxItems in the length's high bytes",
      bytes: () => concat([word(32n), word(1n << 64n)]),
      maxItems: 1,
    },
    {
      mutation: "an item count above maxItems behind a moved array offset",
      bytes: () =>
        concat([
          word(64n),
          word(0n),
          itemsBytes([validStruct(), validStruct()]).subarray(32),
        ]),
      maxItems: 1,
    },
  ])("error: PayloadDecodeError on $mutation", async ({ bytes, maxItems }) => {
    await expect(
      Payload.decode(frame(bytes()), { maxItems }),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
  });

  test("error: PayloadDecodeError when inflating past the decompressed cap", async () => {
    await expect(
      Payload.decode(
        frame(new Uint8Array(Payload.MAX_DECOMPRESSED_ITEMS_BYTES + 1)),
      ),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
  });

  test("default: accepts an item count equal to maxItems", async () => {
    await expect(
      Payload.decode(frame(itemsBytes([validStruct(), validStruct()])), {
        maxItems: 2,
      }),
    ).resolves.toHaveLength(2);
  });

  test("error: PayloadDecodeError when ABI decoding throws a non-Error value", async () => {
    abiFailure.value = "boom";
    try {
      await expect(
        Payload.decode(frame(itemsBytes([validStruct()]))),
      ).rejects.toBeInstanceOf(PayloadDecodeError);
    } finally {
      abiFailure.value = undefined;
    }
  });

  test("error: PayloadDecodeError when compression throws a non-Error value", async () => {
    vi.stubGlobal(
      "CompressionStream",
      class {
        constructor() {
          throw "unavailable";
        }
      },
    );
    await expect(
      Payload.encode([
        { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
      ]),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
  });

  test("error: PayloadDecodeError when decompression fails with a non-Error value", async () => {
    const payload = frame(itemsBytes([validStruct()]));
    vi.stubGlobal(
      "DecompressionStream",
      class extends TransformStream {
        constructor() {
          super({
            transform(_, controller) {
              controller.error("unavailable");
            },
          });
        }
      },
    );
    await expect(Payload.decode(payload)).rejects.toBeInstanceOf(
      PayloadDecodeError,
    );
  });

  test("error: PayloadDecodeError on a corrupt gzip stream", async () => {
    const corrupt = new Uint8Array(5 + 32).fill(0xff);
    corrupt[0] = Payload.CURRENT_VERSION;
    new DataView(corrupt.buffer).setUint32(1, 32);
    await expect(Payload.decode(bytesToHex(corrupt))).rejects.toBeInstanceOf(
      PayloadDecodeError,
    );
  });

  test.each<{ mutation: string; ratifierData: () => Hex }>([
    {
      mutation: "items above the decompressed cap",
      ratifierData: () =>
        `0x${"00".repeat(Payload.MAX_DECOMPRESSED_ITEMS_BYTES)}`,
    },
    {
      mutation: "incompressible items above the compressed cap",
      ratifierData: () => randomBytes(Payload.MAX_COMPRESSED_ITEMS_BYTES + 1),
    },
  ])(
    "error: PayloadDecodeError when encoding $mutation",
    async ({ ratifierData }) => {
      await expect(
        Payload.encode([
          { offer: apiValidOffer({ group }), ratifierData: ratifierData() },
        ]),
      ).rejects.toBeInstanceOf(PayloadDecodeError);
    },
  );

  test("error: PayloadDecodeError when compression fails", async () => {
    vi.stubGlobal(
      "CompressionStream",
      class {
        constructor() {
          throw new Error("unavailable");
        }
      },
    );
    await expect(
      Payload.encode([
        { offer: apiValidOffer({ group }), ratifierData: "0x1234" as Hex },
      ]),
    ).rejects.toBeInstanceOf(PayloadDecodeError);
  });
});

describe("Payload size limits", () => {
  test("default", () => {
    expect(Payload.MAX_PAYLOAD_BYTES).toBe(1_000_000);
    expect(Payload.MAX_COMPRESSED_ITEMS_BYTES).toBe(999_739);
    expect(Payload.MAX_DECOMPRESSED_ITEMS_BYTES).toBe(6_000_000);
    expect(
      5 +
        Payload.MAX_COMPRESSED_ITEMS_BYTES +
        Payload.MAX_ATTRIBUTION_SUFFIX_BYTES,
    ).toBe(Payload.MAX_PAYLOAD_BYTES);
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
