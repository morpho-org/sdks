import {
  bytesToHex,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
  hexToBytes,
} from "viem";

import { MAX_COLLATERALS, MAX_TICK } from "../constants.js";
import { MarketUtils } from "../market/index.js";
import { type IOffer, type OfferStruct, OfferUtils } from "../offers/index.js";

/**
 * One mempool payload item: a maker-side `Offer` together with the opaque
 * `ratifierData` blob a taker hands to `Midnight.take(..., ratifierData)`.
 *
 * `ratifierData` is owned by the ratifier scheme the maker used (e.g.
 * `EcrecoverRatifierUtils.ratifierData`). The payload codec treats it as
 * opaque bytes — simulators that only need to forward `ratifierData` can
 * stay completely ratifier-agnostic.
 *
 * Build items with `EcrecoverRatifierUtils.ratify` or
 * `SetterRatifierUtils.ratify` after the tree is signed or approved, then pass
 * the items to `Payload.encode` for publication.
 *
 * @example
 * ```ts
 * import type { Payload } from "@morpho-org/midnight-sdk";
 *
 * const item: Payload.Item = {
 *   offer: {} as never,
 *   ratifierData: "0x",
 * };
 * console.log(item.ratifierData);
 * ```
 */
export type Item = {
  /** Maker-side offer carried by the payload. */
  readonly offer: IOffer;
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
export const MAX_DECOMPRESSED_ITEMS_BYTES = 6_000_000;

/**
 * Upper bound on opaque bytes appended after the gzip stream (e.g. an app
 * attribution tag). The suffix is meant to be small, so `decode` rejects a
 * larger one: this keeps the `MAX_COMPRESSED_ITEMS_BYTES` ceiling meaningful for
 * the whole input. Without it a tiny declared `gzipLen` could smuggle an
 * arbitrarily large suffix past validation and into the indexer while still
 * forcing the API to receive and hex-decode the whole blob.
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
const MAX_TIMESTAMP_SECONDS = 1_000_000_000_000n - 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

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
 * Largest inbound HTTP request body, in bytes, accepted by the API and
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

/**
 * Optional decode bounds.
 *
 * @example
 * ```ts
 * import type { Payload } from "@morpho-org/midnight-sdk";
 *
 * const options: Payload.DecodeOptions = { maxItems: 16 };
 * console.log(options.maxItems);
 * ```
 */
export type DecodeOptions = {
  /** Optional caller-provided item cap. */
  readonly maxItems?: number;
};

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
 * Use after ratifier utilities have produced payload-ready items and before
 * `MidnightApi.validateMempoolPayload` or an onchain mempool submission.
 *
 * @param items - Per-leaf items in the order the maker committed to. Must
 *   contain at least one item and fit within payload byte-size limits.
 * @returns The encoded payload as a `Hex` string, ready to include in onchain
 *   mempool submission calldata.
 * @throws {DecodeError} when the item list is empty or encoded size exceeds SDK byte-size limits.
 * @example
 * ```ts
 * import { Payload } from "@morpho-org/midnight-sdk";
 *
 * const encoded = await Payload.encode([{ offer: {} as never, ratifierData: "0x" }]);
 * console.log(encoded);
 * ```
 */
export async function encode(items: readonly Item[]): Promise<Hex> {
  if (CURRENT_VERSION > 0xff) {
    throw new DecodeError(`version overflow: ${CURRENT_VERSION} exceeds 255`);
  }
  assertNonEmptyItemCount(items.length);
  const payloadItems = items.map((item) => {
    const offer = OfferUtils.toStruct({ offer: item.offer });
    assertApiValidOfferStruct(offer);
    return {
      offer,
      ratifierData: item.ratifierData,
    };
  });
  const itemBytes = hexToBytes(encodeAbiParameters(itemsAbi, [payloadItems]));
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
 * Use on the take-side, in indexers, or in diagnostics when you need to inspect
 * the offer structs and ratifier data that a maker published.
 *
 * @param payload - Hex payload bytes to decode.
 * @param options - Optional decode bounds.
 * @returns The decoded items in encoded order.
 * @throws {DecodeError} when the payload is malformed or exceeds protocol limits.
 * @example
 * ```ts
 * import { Payload } from "@morpho-org/midnight-sdk";
 *
 * const items = await Payload.decode("0x" as never);
 * console.log(items.length);
 * ```
 */
export async function decode(
  payload: Hex,
  options?: DecodeOptions,
): Promise<Item[]> {
  const maxItems = resolveMaxItems(options?.maxItems);
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

  assertAbiItemCountWithinCallerLimit(decoded, maxItems);

  const items = decodeItemsBytes(decoded);
  assertNonEmptyItemCount(items.length);
  assertCallerItemCountLimit(items.length, maxItems);

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
    return raw.map((entry) => {
      assertApiValidOfferStruct(entry.offer);
      return {
        offer: OfferUtils.normalizeOffer(entry.offer),
        ratifierData: entry.ratifierData,
      };
    });
  } catch (error) {
    if (error instanceof DecodeError) throw error;
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
      offer: OfferUtils.toStruct({ offer: item.offer }),
      ratifierData: item.ratifierData,
    })),
  ]);
  if (canonical !== bytesToHex(decoded)) {
    throw new DecodeError("items payload has non-canonical ABI bytes");
  }
}

function assertApiValidOfferStruct(offer: OfferStruct): void {
  if (isEmptyOfferStruct(offer)) return;

  assertCollateralParams(offer);
  assertSafeTimestamp("market.maturity", offer.market.maturity);
  assertMaturityAt15Utc(offer.market.maturity);
  assertSafeTimestamp("start", offer.start);
  assertSafeTimestamp("expiry", offer.expiry);

  if (offer.start >= offer.expiry) {
    throw new DecodeError("invalid offer bytes: start must be before expiry");
  }
  if (offer.expiry > offer.market.maturity) {
    throw new DecodeError(
      "invalid offer bytes: expiry must be before or equal to maturity",
    );
  }
  if (offer.tick > MAX_TICK) {
    throw new DecodeError(
      `invalid offer bytes: tick exceeds maximum ${MAX_TICK}`,
    );
  }
  if (offer.maxUnits > 0n && offer.maxAssets > 0n) {
    throw new DecodeError(
      "invalid offer bytes: at most one of maxUnits and maxAssets can be non-zero",
    );
  }
}

function assertCollateralParams(offer: OfferStruct): void {
  const collateralParams = offer.market.collateralParams;
  if (collateralParams.length === 0) {
    throw new DecodeError(
      "invalid offer bytes: at least one collateral required",
    );
  }
  if (collateralParams.length > Number(MAX_COLLATERALS)) {
    throw new DecodeError(
      `invalid offer bytes: market.collateralParams has ${collateralParams.length} collaterals, exceeding the maximum of ${MAX_COLLATERALS}`,
    );
  }

  let previousToken: string | undefined;
  for (const params of collateralParams) {
    if (!MarketUtils.isLltvAllowed(params.lltv)) {
      throw new DecodeError(
        `invalid offer bytes: invalid collateral lltv ${params.lltv}`,
      );
    }

    const token = params.token.toLowerCase();
    if (previousToken != null && previousToken >= token) {
      throw new DecodeError(
        "invalid offer bytes: collaterals must be sorted and unique",
      );
    }
    previousToken = token;
  }
}

function assertSafeTimestamp(field: string, value: bigint): void {
  if (value > MAX_TIMESTAMP_SECONDS) {
    throw new DecodeError(
      `invalid offer bytes: ${field} exceeds ${MAX_TIMESTAMP_SECONDS}`,
    );
  }
}

function assertMaturityAt15Utc(value: bigint): void {
  const date = new Date(Number(value) * 1000);
  if (
    date.getUTCHours() !== 15 ||
    date.getUTCMinutes() !== 0 ||
    date.getUTCSeconds() !== 0 ||
    date.getUTCMilliseconds() !== 0
  ) {
    throw new DecodeError(
      "invalid offer bytes: maturity must be at 15:00:00 UTC",
    );
  }
}

function isEmptyOfferStruct(offer: OfferStruct): boolean {
  return (
    isZeroAddress(offer.market.loanToken) &&
    offer.market.collateralParams.length === 0 &&
    offer.market.maturity === 0n &&
    offer.market.rcfThreshold === 0n &&
    isZeroAddress(offer.market.enterGate) &&
    isZeroAddress(offer.market.liquidatorGate) &&
    offer.buy === false &&
    isZeroAddress(offer.maker) &&
    offer.start === 0n &&
    offer.expiry === 0n &&
    offer.tick === 0n &&
    offer.group === ZERO_BYTES32 &&
    isZeroAddress(offer.callback) &&
    offer.callbackData === "0x" &&
    isZeroAddress(offer.receiverIfMakerIsSeller) &&
    isZeroAddress(offer.ratifier) &&
    offer.reduceOnly === false &&
    offer.maxUnits === 0n &&
    offer.maxAssets === 0n
  );
}

function isZeroAddress(value: string): boolean {
  return value.toLowerCase() === ZERO_ADDRESS;
}

function resolveMaxItems(maxItems: number | undefined): number | undefined {
  if (maxItems === undefined) return undefined;
  if (!Number.isInteger(maxItems) || maxItems < 1) {
    throw new DecodeError(
      `maxItems must be a positive integer: got ${maxItems}`,
    );
  }

  return maxItems;
}

function assertNonEmptyItemCount(count: number): void {
  if (count === 0) throw new DecodeError("items payload is empty");
}

function assertCallerItemCountLimit(
  count: number,
  maxItems: number | undefined,
): void {
  if (maxItems === undefined) return;
  if (count > maxItems) {
    throw new DecodeError(`items payload exceeds ${maxItems} items`);
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
  } catch (error) {
    throw new DecodeError(
      "compression failed",
      error instanceof Error ? error : undefined,
    );
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
    throw new DecodeError(
      "decompression failed",
      error instanceof Error ? error : undefined,
    );
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

function assertAbiItemCountWithinCallerLimit(
  decoded: Uint8Array,
  maxItems: number | undefined,
): void {
  if (decoded.length < ABI_ARRAY_HEAD_BYTES) {
    throw new DecodeError("items payload truncated before ABI array head");
  }
  if (maxItems === undefined) return;

  for (let i = 32; i < ABI_LENGTH_LOW_OFFSET; i++) {
    if (decoded[i] !== 0) {
      throw new DecodeError(`items payload exceeds ${maxItems} items`);
    }
  }
  const length = new DataView(
    decoded.buffer,
    decoded.byteOffset,
    decoded.byteLength,
  ).getUint32(ABI_LENGTH_LOW_OFFSET);
  if (length > maxItems) {
    throw new DecodeError(`items payload exceeds ${maxItems} items`);
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
