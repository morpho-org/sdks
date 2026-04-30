import { Time } from "@morpho-org/morpho-ts";
import { type Address, type Hex, concatHex, isHex, numberToHex } from "viem";
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
    const origin = metadata.origin.replace(/^(?!0x)/, "");

    if (!isHex(`0x${origin}`))
      throw Error("Calldata origin must consists of only hex characters");
    if (origin.length > 8)
      throw Error("Calldata origin must be at most 8 characters long");
    concatItems.push(`0x${origin}`);
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.warn("Invalid calldata origin:\n", error);
  }

  return { data: concatHex(concatItems), ..._tx };
}
