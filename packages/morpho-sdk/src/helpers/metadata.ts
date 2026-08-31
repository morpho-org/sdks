import { Time } from "@morpho-org/morpho-ts";
import { type Address, concatHex, type Hex, isHex, numberToHex } from "viem";
import type { Metadata } from "../types/index.js";

/**
 * Adds metadata to a transaction object by concatenating additional
 * hex-encoded data to the transaction's `data` field. The additional
 * data may include a timestamp and an origin identifier derived
 * from the metadata.
 *
 * The function ensures that the transaction data is correctly formatted
 * and includes optional metadata elements if provided.
 *
 * `metadata.origin` accepts either a raw hex string (`"cafe"`) or a
 * 0x-prefixed hex string (`"0xcafe"` / `"0Xcafe"`); both produce the same
 * appended 4-byte origin tag. The 0x/0X prefix is stripped case-insensitively
 * before length-validation, so an origin of `"0xdeadbeef"` (10 chars
 * including prefix, 8 raw hex chars) is accepted while `"0xdeadbeef00"`
 * (10 raw hex chars) is rejected and a warning is logged. Odd-length raw
 * fragments (e.g. `"abc"`, `"0xabc"`) are also rejected — concatenating
 * a non-byte-aligned fragment would corrupt the trailing analytics byte
 * once viem's `concatHex` pads it to a whole byte at broadcast time.
 *
 * @param {Object} tx - The original transaction object.
 * @param {Hex} tx.data - The existing hex-encoded data for the transaction.
 * @param {bigint} tx.value - The value to be sent with the transaction.
 * @param {Address} tx.to - The recipient address of the transaction.
 * @param {Metadata} metadata - An object containing optional metadata fields
 * such as `timestamp` and `origin`.
 *
 * @returns {Object} - A new transaction object with the modified `data` field
 * including the concatenated metadata.
 *
 * If no `data` is present in the original transaction, the function returns
 * the transaction unmodified.
 */
export function addTransactionMetadata(
  tx: { data: Hex; value: bigint; to: Address },
  metadata: Metadata,
) {
  const { data, ..._tx } = tx;

  if (!data) return tx;

  const concatItems = [data];

  if (metadata.timestamp) {
    concatItems.push(numberToHex(Time.timestamp(), { size: 4 }));
  }

  try {
    // Strip a leading "0x" / "0X" case-insensitively so callers can pass
    // "cafe", "0xcafe", or "0Xcafe" — all produce the same 4-byte appended
    // origin. The case-insensitive form prevents "0Xcafe" from falling
    // through to `isHex("0x0Xcafe")` and being silently dropped.
    const origin = metadata.origin.replace(/^0x/i, "");

    if (!isHex(`0x${origin}`))
      throw Error("Calldata origin must consists of only hex characters");
    if (origin.length > 8)
      throw Error("Calldata origin must be at most 8 characters long");
    // Reject odd-length raw fragments. viem's `concatHex` would pad the
    // stray nibble to a whole byte at broadcast, corrupting the trailing
    // analytics byte on-chain.
    if (origin.length % 2 !== 0)
      throw Error("Calldata origin must have an even number of hex characters");
    concatItems.push(`0x${origin}`);
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.warn("Invalid calldata origin:\n", error);
  }

  return { data: concatHex(concatItems), ..._tx };
}
