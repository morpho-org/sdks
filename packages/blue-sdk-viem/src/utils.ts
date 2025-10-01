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
  type ReadContractParameters,
  type Transport,
  getAbiItem,
  getAddress,
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

export const safeParseNumber = (value: number, decimals = 18) =>
  safeParseUnits(toFixed(value, decimals), decimals);

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
    (acc, param, index) => {
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
