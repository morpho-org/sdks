import {
  bytesToHex,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
  hexToBytes,
} from "viem";

import { MAX_OFFERS_PER_TREE } from "../constants.js";
import {
  type IOffer,
  Offer,
  type OfferStruct,
  offerStructAbiComponents,
} from "../offers/Offer.js";

/**
 * Raw onchain mempool payload bytes.
 *
 * @example
 * ```ts
 * import type { Payload } from "@morpho-org/midnight-sdk";
 *
 * const payload: Payload = "0x";
 * console.log(payload);
 * ```
 */
export type Payload = Hex;

/**
 * One mempool payload item: a maker-side `Offer` together with the opaque
 * `ratifierData` blob a taker hands to `Midnight.take(..., ratifierData)`.
 *
 * `ratifierData` is owned by the ratifier scheme the maker used (e.g.
 * `EcrecoverRatifier.encodeRatifierData`). The payload codec treats it as
 * opaque bytes — simulators that only need to forward `ratifierData` can
 * stay completely ratifier-agnostic.
 */
export type Item = {
  /** Maker-side offer carried by the payload. */
  readonly offer: IOffer | Offer;
  /** Opaque ratifier data passed to `Midnight.take`. */
  readonly ratifierData: Hex;
};

/**
 * Current Midnight mempool payload wire version.
 *
 * @example
 * ```ts
 * import { Payload } from "@morpho-org/midnight-sdk";
 *
 * console.log(Payload.CURRENT_VERSION);
 * ```
 */
export const CURRENT_VERSION = 1;

/**
 * Maximum gzip-compressed item bytes accepted by the payload codec.
 *
 * @example
 * ```ts
 * import { Payload } from "@morpho-org/midnight-sdk";
 *
 * console.log(Payload.MAX_COMPRESSED_ITEMS_BYTES);
 * ```
 */
export const MAX_COMPRESSED_ITEMS_BYTES = 1_000_000;

/**
 * Maximum ABI-decoded item bytes accepted by the payload codec.
 *
 * @example
 * ```ts
 * import { Payload } from "@morpho-org/midnight-sdk";
 *
 * console.log(Payload.MAX_DECOMPRESSED_ITEMS_BYTES);
 * ```
 */
export const MAX_DECOMPRESSED_ITEMS_BYTES = 4_000_000;

/**
 * Upper bound on opaque bytes appended after the gzip stream (e.g. an app
 * attribution tag). The suffix is meant to be small, so `decode` rejects a
 * larger one: this keeps the `MAX_COMPRESSED_ITEMS_BYTES` ceiling meaningful for
 * the whole input. Without it a tiny declared `gzipLen` could smuggle an
 * arbitrarily large suffix past validation and into the indexer while still
 * forcing the router to receive and hex-decode the whole blob.
 *
 * @example
 * ```ts
 * import { Payload } from "@morpho-org/midnight-sdk";
 *
 * console.log(Payload.MAX_ATTRIBUTION_SUFFIX_BYTES);
 * ```
 */
export const MAX_ATTRIBUTION_SUFFIX_BYTES = 256;

const VERSION_PREFIX_BYTES = 1;
const LENGTH_PREFIX_BYTES = 4;
const HEADER_BYTES = VERSION_PREFIX_BYTES + LENGTH_PREFIX_BYTES;
const ABI_ARRAY_HEAD_BYTES = 64;
const ABI_LENGTH_LOW_OFFSET = 60;

/**
 * Largest fully framed wire payload, in bytes: the version byte, the 4-byte
 * gzip length prefix, the largest accepted gzip stream, and the largest
 * accepted attribution suffix.
 *
 * @example
 * ```ts
 * import { Payload } from "@morpho-org/midnight-sdk";
 *
 * console.log(Payload.MAX_PAYLOAD_BYTES);
 * ```
 */
export const MAX_PAYLOAD_BYTES =
  HEADER_BYTES + MAX_COMPRESSED_ITEMS_BYTES + MAX_ATTRIBUTION_SUFFIX_BYTES;

/**
 * Largest `0x`-prefixed hex string that can encode a wire payload.
 *
 * @example
 * ```ts
 * import { Payload } from "@morpho-org/midnight-sdk";
 *
 * console.log(Payload.MAX_PAYLOAD_HEX_LENGTH);
 * ```
 */
export const MAX_PAYLOAD_HEX_LENGTH = "0x".length + MAX_PAYLOAD_BYTES * 2;

/**
 * Largest inbound HTTP request body, in bytes, accepted by the router and
 * gatekeeper APIs.
 *
 * @example
 * ```ts
 * import { Payload } from "@morpho-org/midnight-sdk";
 *
 * console.log(Payload.MAX_REQUEST_BODY_BYTES);
 * ```
 */
export const MAX_REQUEST_BODY_BYTES = MAX_PAYLOAD_HEX_LENGTH + 1_024;

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

/**
 * ABI-encode `items` as `(Offer, bytes ratifierData)[]` and gzip the result,
 * then emit the wire payload `version || uint32(gzipLen) || gzip(...)`. The
 * single-byte version prefix lets future formats coexist on the wire; the
 * 4-byte big-endian length delimits the gzip stream so `decode` finds its end
 * without scanning. That delimiter is what lets a publisher append a small
 * opaque suffix (e.g. an attribution tag) after the gzip stream — `decode`
 * ignores up to `MAX_ATTRIBUTION_SUFFIX_BYTES` bytes past `gzipLen` and rejects
 * a larger suffix. Item order is preserved verbatim and is the order a consumer
 * sees on decode.
 *
 * @param items - Per-leaf items in the order the maker committed to. Must
 *   contain at least one item and at most `MAX_OFFERS_PER_TREE`.
 * @returns The encoded payload as a hex string.
 * @throws DecodeError when the item count or encoded size exceeds protocol limits.
 * @example
 * ```ts
 * import { Payload } from "@morpho-org/midnight-sdk";
 *
 * const encoded = await Payload.encode([{ offer: {} as never, ratifierData: "0x" }]);
 * console.log(encoded);
 * ```
 */
export async function encode(items: readonly Item[]): Promise<Payload> {
  if (CURRENT_VERSION > 0xff) {
    throw new DecodeError(`version overflow: ${CURRENT_VERSION} exceeds 255`);
  }
  assertItemCountWithinLimit(items.length);
  const itemBytes = hexToBytes(
    encodeAbiParameters(itemsAbi, [
      items.map((item) => ({
        offer: Offer.from(item.offer).toStruct(),
        ratifierData: item.ratifierData,
      })),
    ]),
  );
  const compressed = await compressItemsPayload(itemBytes);
  const encoded = new Uint8Array(HEADER_BYTES + compressed.length);
  encoded[0] = CURRENT_VERSION;
  new DataView(
    encoded.buffer,
    encoded.byteOffset,
    encoded.byteLength,
  ).setUint32(VERSION_PREFIX_BYTES, compressed.length);
  encoded.set(compressed, HEADER_BYTES);
  return bytesToHex(encoded);
}

/**
 * Parse a wire payload back into its `(offer, ratifierData)` items. The version
 * byte is validated against `CURRENT_VERSION` and not surfaced — any payload
 * that decodes successfully is on the current wire format. The 4-byte length
 * prefix bounds the gzip stream; up to `MAX_ATTRIBUTION_SUFFIX_BYTES` bytes
 * after it (e.g. an attribution suffix appended by the publishing app) are
 * ignored, so a tagged payload decodes identically to an untagged one. A larger
 * trailing suffix is rejected so an oversized blob cannot ride a small payload
 * past validation and into the indexer.
 *
 * @param payload - Payload bytes to decode.
 * @returns The decoded items in encoded order.
 * @throws DecodeError when the payload is malformed or exceeds protocol limits.
 * @example
 * ```ts
 * import { Payload } from "@morpho-org/midnight-sdk";
 *
 * const items = await Payload.decode("0x" as never);
 * console.log(items.length);
 * ```
 */
export async function decode(payload: Payload): Promise<Item[]> {
  const bytes = hexToBytes(payload);
  if (bytes.length < HEADER_BYTES) {
    throw new DecodeError("payload too short for header");
  }
  const version = bytes[0]!;
  if (version !== (CURRENT_VERSION & 0xff)) {
    throw new DecodeError(
      `invalid version: expected ${CURRENT_VERSION}, got ${version}`,
    );
  }
  const compressedLength = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(VERSION_PREFIX_BYTES);
  const compressedEnd = HEADER_BYTES + compressedLength;
  if (compressedEnd > bytes.length) {
    throw new DecodeError("payload truncated before declared gzip length");
  }
  const suffixLength = bytes.length - compressedEnd;
  if (suffixLength > MAX_ATTRIBUTION_SUFFIX_BYTES) {
    throw new DecodeError(
      `trailing suffix exceeds ${MAX_ATTRIBUTION_SUFFIX_BYTES} bytes: got ${suffixLength}`,
    );
  }
  const compressed = bytes.subarray(HEADER_BYTES, compressedEnd);
  const decoded = await decompressItemsPayload(compressed);
  assertAbiItemCountWithinLimit(decoded);
  const items = decodeItemsBytes(decoded);
  assertItemCountWithinLimit(items.length);
  assertCanonicalItemsBytes(items, decoded);
  return items;
}

function decodeItemsBytes(decoded: Uint8Array): Item[] {
  let raw: ReadonlyArray<{ offer: OfferStruct; ratifierData: Hex }>;
  try {
    [raw] = decodeAbiParameters(itemsAbi, bytesToHex(decoded));
  } catch (error) {
    throw new DecodeError(
      "items abi decode failed",
      error instanceof Error ? error : undefined,
    );
  }
  try {
    return raw.map((entry) => ({
      offer: new Offer({
        market: entry.offer.market,
        buy: entry.offer.buy,
        maker: entry.offer.maker,
        start: entry.offer.start,
        expiry: entry.offer.expiry,
        tick: entry.offer.tick,
        group: entry.offer.group,
        callback: entry.offer.callback,
        callbackData: entry.offer.callbackData,
        receiverIfMakerIsSeller: entry.offer.receiverIfMakerIsSeller,
        ratifier: entry.offer.ratifier,
        reduceOnly: entry.offer.reduceOnly,
        maxUnits: entry.offer.maxUnits,
        maxAssets: entry.offer.maxAssets,
      }),
      ratifierData: entry.ratifierData,
    }));
  } catch (error) {
    if (error instanceof Error) {
      throw new DecodeError(`invalid offer bytes: ${error.message}`, error);
    }
    throw error;
  }
}

function assertCanonicalItemsBytes(
  items: readonly Item[],
  decoded: Uint8Array,
): void {
  const canonical = encodeAbiParameters(itemsAbi, [
    items.map((item) => ({
      offer: Offer.from(item.offer).toStruct(),
      ratifierData: item.ratifierData,
    })),
  ]);
  if (canonical !== bytesToHex(decoded)) {
    throw new DecodeError("items payload has non-canonical ABI bytes");
  }
}

function assertItemCountWithinLimit(count: number): void {
  if (count === 0) throw new DecodeError("items payload is empty");
  if (count > MAX_OFFERS_PER_TREE) {
    throw new DecodeError(`items payload exceeds ${MAX_OFFERS_PER_TREE} items`);
  }
}

async function compressItemsPayload(payload: Uint8Array): Promise<Uint8Array> {
  if (payload.length > MAX_DECOMPRESSED_ITEMS_BYTES) {
    throw new DecodeError(
      `decompressed items exceed ${MAX_DECOMPRESSED_ITEMS_BYTES} bytes`,
    );
  }
  let compressed: Uint8Array;
  try {
    const stream = singleChunkStream(payload).pipeThrough(
      new CompressionStream("gzip"),
    );
    compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new DecodeError("compression failed");
  }
  if (compressed.length > MAX_COMPRESSED_ITEMS_BYTES) {
    throw new DecodeError(
      `compressed items exceed ${MAX_COMPRESSED_ITEMS_BYTES} bytes`,
    );
  }
  return compressed;
}

async function decompressItemsPayload(
  compressed: Uint8Array,
): Promise<Uint8Array> {
  if (compressed.length === 0) throw new DecodeError("decompression failed");
  if (compressed.length > MAX_COMPRESSED_ITEMS_BYTES) {
    throw new DecodeError(
      `compressed items exceed ${MAX_COMPRESSED_ITEMS_BYTES} bytes`,
    );
  }

  const reader = singleChunkStream(compressed)
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalLength += value.length;
      if (totalLength > MAX_DECOMPRESSED_ITEMS_BYTES) {
        await reader.cancel();
        throw new DecodeError(
          `decompressed items exceed ${MAX_DECOMPRESSED_ITEMS_BYTES} bytes`,
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DecodeError) throw error;
    throw new DecodeError("decompression failed");
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function singleChunkStream(bytes: Uint8Array): ReadableStream<BufferSource> {
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}

/**
 * Reads the items array length from the ABI head and rejects payloads
 * declaring more than `MAX_OFFERS_PER_TREE` entries before invoking the full
 * decoder. The head is `[offset(32 bytes), length(32 bytes)]`; any non-zero
 * byte in the high 28 bytes of the length word implies a count far above the
 * cap, so we treat it as an early reject.
 */
function assertAbiItemCountWithinLimit(decoded: Uint8Array): void {
  if (decoded.length < ABI_ARRAY_HEAD_BYTES) {
    throw new DecodeError("items payload truncated before ABI array head");
  }
  for (let i = 32; i < ABI_LENGTH_LOW_OFFSET; i++) {
    if (decoded[i] !== 0) {
      throw new DecodeError(
        `items payload exceeds ${MAX_OFFERS_PER_TREE} items`,
      );
    }
  }
  const view = new DataView(
    decoded.buffer,
    decoded.byteOffset,
    decoded.byteLength,
  );
  const length = view.getUint32(ABI_LENGTH_LOW_OFFSET);
  if (length > MAX_OFFERS_PER_TREE) {
    throw new DecodeError(`items payload exceeds ${MAX_OFFERS_PER_TREE} items`);
  }
}

/**
 * Error thrown when a Midnight mempool payload cannot be decoded.
 *
 * @example
 * ```ts
 * import { Payload } from "@morpho-org/midnight-sdk";
 *
 * throw new Payload.DecodeError("payload too short for header");
 * ```
 */
export class DecodeError extends Error {
  public readonly reason: string;

  public constructor(reason: string, cause?: Error) {
    super(`Failed to decode payload: ${reason}`, cause ? { cause } : undefined);
    this.name = "Payload.DecodeError";
    this.reason = reason;
  }
}
