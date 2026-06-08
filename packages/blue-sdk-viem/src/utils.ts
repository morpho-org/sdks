import {
  type Abi,
  type AbiItemArgs,
  type AbiItemName,
  type Chain,
  type Client,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type ExtractAbiFunctionForArgs,
  type GetAbiItemParameters,
  getAbiItem,
  getAddress,
  type ReadContractParameters,
  type Transport,
} from "viem";
import { readContract } from "viem/actions";
import { parseUnits } from "viem/utils";

// Alternative to Number.toFixed that doesn't use scientific notation for excessively small or large numbers.
const toFixed = (x: number, decimals: number) =>
  new Intl.NumberFormat("en-US", {
    style: "decimal",
    useGrouping: false,
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(x);

/**
 * Parses a JavaScript number into token units without scientific notation drift.
 *
 * @param value - Decimal number to parse.
 * @param decimals - Optional token decimals; defaults to 18.
 * @returns The parsed bigint scaled by `decimals`.
 * @example
 * ```ts
 * import { safeParseNumber } from "@morpho-org/blue-sdk-viem";
 *
 * const amount = safeParseNumber(1.25, 6);
 * ```
 */
export const safeParseNumber = (value: number, decimals = 18) =>
  safeParseUnits(toFixed(value, decimals), decimals);

/**
 * Parses a decimal string into token units, truncating extra fractional digits.
 *
 * @param strValue - Decimal string to parse.
 * @param decimals - Optional token decimals; defaults to 18.
 * @returns The parsed bigint scaled by `decimals`.
 * @example
 * ```ts
 * import { safeParseUnits } from "@morpho-org/blue-sdk-viem";
 *
 * const amount = safeParseUnits("1.25", 6);
 * ```
 */
export const safeParseUnits = (strValue: string, decimals = 18) => {
  if (!/[-+]?[0-9]*\.?[0-9]+/.test(strValue))
    throw Error(`invalid number: ${strValue}`);

  let [whole, dec = ""] = strValue.split(".");

  dec = dec.slice(0, decimals);

  return parseUnits(
    [whole || "0", dec].filter((v) => v.length > 0).join("."),
    decimals,
  );
};

/**
 * Normalizes an address string through viem checksum validation after lowercasing it.
 *
 * @param address - Address string to normalize.
 * @returns The checksummed viem address.
 * @example
 * ```ts
 * import { safeGetAddress } from "@morpho-org/blue-sdk-viem";
 *
 * const address = safeGetAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
 * ```
 */
export const safeGetAddress = (address: string) =>
  getAddress(address.toLowerCase());

type ZipToObject<
  T extends readonly { name?: string }[],
  V extends readonly unknown[],
> = T extends readonly [infer Head, ...infer RestT]
  ? V extends readonly [infer HeadValue, ...infer RestV]
    ? Head extends { name?: infer N }
      ? N extends string
        ? { [K in N]: HeadValue } & ZipToObject<
            RestT extends readonly { name?: string }[] ? RestT : [],
            RestV extends readonly unknown[] ? RestV : []
          >
        : ZipToObject<
            RestT extends readonly { name?: string }[] ? RestT : [],
            RestV extends readonly unknown[] ? RestV : []
          >
      : ZipToObject<
          RestT extends readonly { name?: string }[] ? RestT : [],
          RestV extends readonly unknown[] ? RestV : []
        >
    : object
  : object;

function zipParams<
  T extends readonly { readonly name?: string }[],
  V extends readonly unknown[],
>(params: T, values: V): ZipToObject<T, V> {
  return params.reduce(
    // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
    (acc, param, index) => {
      /* v8 ignore next: restructure rejects unnamed ABI outputs before zipping. */
      return typeof param.name === "string"
        ? // biome-ignore lint/performance/noAccumulatingSpread: This keeps type system happy with negligible performance impact
          { ...acc, [param.name]: values[index] }
        : acc;
    },
    {} as ZipToObject<T, V>,
  );
}

/**
 * When reading contracts, viem converts onchain tuples into arrays -- even when tuple values are named in the ABI.
 * [They argue](https://viem.sh/docs/faq#why-is-a-contract-function-return-type-returning-an-array-instead-of-an-object)
 * this information loss is justified, as it eliminates the ambiguity between tuple return types and struct return
 * types. This utility can be used to convert viem's arrays back to objects, _as if_ the onchain method returned a
 * struct.
 *
 * @example
 *
 * ```
 * // Use with viem...
 * const params = restructure(
 *   await readContract(client, {
 *     ...parameters,
 *     address: morpho,
 *     abi: blueAbi,
 *     functionName: "idToMarketParams",
 *     args: [id],
 *   }),
 *   // These `args` should be placeholders; just match the type of the actual `args` above
 *   { abi: blueAbi, name: "idToMarketParams", args: ["0x"] },
 * )
 * ```
 *
 * @example
 *
 * ```
 * // Use with wagmi hook...
 * const { data: marketsData } = useReadContracts({
 *   contracts: marketIds.map(
 *     (marketId) =>
 *       ({
 *         chainId,
 *         address: morphoAddress,
 *         abi: morphoAbi,
 *         functionName: "market",
 *         args: [marketId],
 *       }) as const,
 *   ),
 *   allowFailure: false,
 *   query: {
 *     select(data) {
 *       // These `args` should be placeholders; just match the type of the actual `args` above
 *       return data.map((x) => restructure(x, { abi: morphoAbi, name: "market", args: ["0x"] }));
 *     },
 *   },
 * });
 * ```
 *
 * @param outputs - Tuple output returned by viem.
 * @param parameters - ABI item lookup parameters matching the read that produced `outputs`.
 * @returns An object whose keys are the named ABI outputs and whose values are the tuple elements.
 */
export function restructure<
  const abi extends Abi,
  name extends AbiItemName<abi> & ContractFunctionName<abi, "view" | "pure">,
  const args extends AbiItemArgs<abi, name>,
  outputs extends readonly unknown[],
>(outputs: outputs, parameters: GetAbiItemParameters<abi, name, args>) {
  const x = getAbiItem(parameters);
  switch (x?.type) {
    case "function": {
      if (x.outputs.some((output) => output.name === undefined)) {
        throw new Error(
          `Attempted to restructure return values lacking names in ABI ${parameters.args!} ${x.outputs}`,
        );
      }
      return zipParams(
        x.outputs as ExtractAbiFunctionForArgs<
          abi,
          "view" | "pure",
          name,
          args
        >["outputs"],
        outputs,
      );
    }
    default:
      throw new Error(
        `Attempted to restructure return values for non-function type ${x}`,
      );
  }
}

function isTuple<T>(x: T): x is T extends readonly unknown[] ? T : never {
  return Array.isArray(x);
}

/**
 * When reading contracts, viem converts onchain tuples into arrays -- even when tuple values are named in the ABI.
 * [They argue](https://viem.sh/docs/faq#why-is-a-contract-function-return-type-returning-an-array-instead-of-an-object)
 * this information loss is justified, as it eliminates the ambiguity between tuple return types and struct return
 * types. This wrapper converts viem's arrays back to objects, _as if_ the onchain method returned a struct.
 *
 * @see {@link restructure}
 * @param client - Viem client used for the read.
 * @param parameters - Read contract parameters for a view or pure function with named tuple outputs.
 * @returns An object whose keys are the named ABI outputs and whose values are the tuple elements.
 * @example
 * ```ts
 * import { readContractRestructured } from "@morpho-org/blue-sdk-viem";
 *
 * const market = await readContractRestructured(client, {
 *   address: morpho,
 *   abi: blueAbi,
 *   functionName: "market",
 *   args: [marketId],
 * });
 * ```
 */
export async function readContractRestructured<
  chain extends Chain | undefined,
  const abi extends Abi,
  name extends AbiItemName<abi> & ContractFunctionName<abi, "view" | "pure">,
  const args extends ContractFunctionArgs<abi, "view" | "pure", name>,
>(
  client: Client<Transport, chain>,
  parameters: ReadContractParameters<abi, name, args>,
) {
  const outputs = await readContract(client, parameters);

  if (!isTuple(outputs)) {
    throw new Error(
      `Attempted to restructure non-tuple return values ${parameters.functionName} -> ${outputs}`,
    );
  }

  return restructure(outputs, {
    abi: parameters.abi,
    name: parameters.functionName,
    args: parameters.args,
  } as unknown as GetAbiItemParameters<abi, name, args>);
}
