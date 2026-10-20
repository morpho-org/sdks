import * as pinnedAbis from "@morpho-org/morpho-sdk/abis";
import { _try } from "@morpho-org/morpho-ts";
import {
  type Abi,
  BaseError,
  decodeErrorResult,
  type Hex,
  toFunctionSelector,
} from "viem";
import { formatAbiItem } from "viem/utils";

const pinnedExports: readonly unknown[] = Object.values(pinnedAbis);

/** Error definitions from every pinned morpho-sdk ABI, deduplicated by full signature. @internal */
export const REVERT_ERRORS_ABI: readonly (Abi[number] & { type: "error" })[] = [
  ...new Map(
    pinnedExports
      // Skips non-ABI exports such as the `MarketParams` tuple parameter.
      .filter((value: unknown): value is Abi => Array.isArray(value))
      .flatMap((abi) =>
        abi.flatMap((item) =>
          item.type === "error" ? [[formatAbiItem(item), item] as const] : [],
        ),
      ),
  ).values(),
];

/**
 * Format every decoded revert argument without assigning a semantic category.
 * Built-in Error(string) and Panic(uint256) are decoded alongside pinned errors.
 * @param data - Original revert bytes returned by the node.
 * @returns Error name and all arguments, or undefined for empty, unknown,
 *   malformed or ambiguous data. The caller preserves the original bytes.
 * @internal
 */
export function formatRevert(data: Hex | undefined): string | undefined {
  if (data === undefined || data.length < 10) return undefined;
  // A selector collision cannot establish which ABI shape the contract used.
  const matches = REVERT_ERRORS_ABI.filter(
    (item) =>
      toFunctionSelector(formatAbiItem(item)) ===
      data.slice(0, 10).toLowerCase(),
  );
  if (matches.length > 1) return undefined;
  // Decode failures do not replace the original revert with a decoder error.
  return _try(() => {
    const { abiItem, errorName, args } = decodeErrorResult({
      abi: matches,
      data,
    });
    const parameters = (args ?? []).map((value, index) => {
      const name = abiItem.inputs[index]?.name;
      const formatted =
        typeof value === "bigint"
          ? value.toString()
          : JSON.stringify(value, (_, nested: unknown) =>
              typeof nested === "bigint" ? nested.toString() : nested,
            );
      return name ? `${name}=${formatted}` : formatted;
    });
    return `${errorName}(${parameters.join(", ")})`;
  }, BaseError);
}
