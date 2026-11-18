import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";

import { isAddress } from "./address.js";
import { InvalidAddressError, InvalidHexError } from "./errors.js";

/** Creation-code prefix Midnight's `IdLib` puts before `abi.encode(market)` (SSTORE2). */
const SSTORE2_PREFIX = hexToBytes("600b380380600b5f395ff3");

const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;

/**
 * Midnight market primitives shared by the Blue and Midnight SDKs.
 *
 * @example
 * ```ts
 * import { MidnightMarketLib } from "@morpho-org/morpho-ts";
 *
 * const id = MidnightMarketLib.id("0x00000000000000000000000000000000000000AA", "0x");
 * ```
 */
export namespace MidnightMarketLib {
  /**
   * Computes a Midnight market id from `abi.encode(market)`, as Midnight's `IdLib.toId` does: the
   * CREATE2 address preimage hash of the SSTORE2 contract storing the market, deployed by `midnight`
   * with a zero salt.
   *
   * @param midnight - Midnight core address (`market.midnight`).
   * @param encodedMarket - ABI encoding of the `Market` struct, hashed as given.
   * @returns The 32-byte market id.
   * @throws {InvalidAddressError} when `midnight` is not a 20-byte hex address.
   * @throws {InvalidHexError} when `encodedMarket` is not `0x`-prefixed hex bytes.
   * @example
   * ```ts
   * import { MidnightMarketLib } from "@morpho-org/morpho-ts";
   * import { encodeAbiParameters } from "viem";
   * import { midnightMarketAbi } from "@morpho-org/morpho-ts/abis";
   *
   * const id = MidnightMarketLib.id(
   *   market.midnight,
   *   encodeAbiParameters([midnightMarketAbi], [market]),
   * );
   * ```
   */
  export function id(midnight: string, encodedMarket: string): `0x${string}` {
    if (!isAddress(midnight)) throw new InvalidAddressError(midnight);
    if (!HEX_BYTES.test(encodedMarket))
      throw new InvalidHexError(encodedMarket);

    const creationHash = keccak_256(
      concatBytes(SSTORE2_PREFIX, hexToBytes(encodedMarket.slice(2))),
    );
    return `0x${bytesToHex(
      keccak_256(
        concatBytes(
          Uint8Array.of(0xff),
          hexToBytes(midnight.slice(2)),
          new Uint8Array(32),
          creationHash,
        ),
      ),
    )}`;
  }
}
