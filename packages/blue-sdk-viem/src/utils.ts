import {
  type Abi,
  AbiDecodingDataSizeInvalidError,
  AbiDecodingDataSizeTooSmallError,
  AbiDecodingZeroDataError,
  type AbiItemArgs,
  type AbiItemName,
  BaseError,
  type Chain,
  type Client,
  type ContractFunctionArgs,
  type ContractFunctionName,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  ExecutionRevertedError,
  type ExtractAbiFunctionForArgs,
  type GetAbiItemParameters,
  getAbiItem,
  getAddress,
  HttpRequestError,
  IntegerOutOfRangeError,
  InvalidAbiDecodingTypeError,
  InvalidBytesBooleanError,
  LimitExceededRpcError,
  type ReadContractParameters,
  RpcRequestError,
  SliceOffsetOutOfBoundsError,
  SocketClosedError,
  TimeoutError,
  type Transport,
  WebSocketRequestError,
} from "viem";
import { readContract } from "viem/actions";
import { parseUnits } from "viem/utils";
import {
  InvalidNumberError,
  NonTupleReturnValueError,
  UnknownAbiFunctionError,
  UnnamedAbiOutputsError,
} from "./error.js";

/**
 * Checks whether a viem `BaseError` cause chain contains a contract revert.
 * Causes behind a non-viem `Error` wrapper are not inspected.
 *
 * @param error - Error thrown by a contract read.
 * @returns Whether the error contains a `ContractFunctionRevertedError`,
 * `ContractFunctionZeroDataError`, or node-reported `ExecutionRevertedError` other than a
 * gas-cap rejection.
 * @example
 * ```ts
 * import { isContractRevertError } from "@morpho-org/blue-sdk-viem";
 * import { ContractFunctionZeroDataError } from "viem";
 *
 * const error = new ContractFunctionZeroDataError({ functionName: "read" });
 * const isRevert: boolean = isContractRevertError(error);
 * // isRevert === true
 * ```
 */
export const isContractRevertError = (error: unknown): boolean => {
  return (
    error instanceof BaseError &&
    error.walk((cause) => {
      if (
        cause instanceof ContractFunctionRevertedError ||
        cause instanceof ContractFunctionZeroDataError
      )
        return true;
      if (!(cause instanceof ExecutionRevertedError)) return false;
      if (
        cause.walk(
          (nested) =>
            nested instanceof RpcRequestError &&
            nested.code === ExecutionRevertedError.code,
        ) !== null
      )
        return true;

      return !/gas required exceeds allowance/i.test(
        `${cause.details} ${cause.shortMessage}`,
      );
    }) !== null
  );
};

/**
 * Checks whether an error or one of its causes is a failed ABI decode of returned data.
 *
 * A contract answered the call, but its return data cannot decode to the expected type —
 * for example a bytes32 `symbol()` read as `string`, or an integer result that
 * exceeds JavaScript's safe-number range.
 *
 * @param error - Error thrown by a contract read.
 * @returns Whether the error is a viem ABI decoding error.
 * @example
 * ```ts
 * import { isUndecodableResultError } from "@morpho-org/blue-sdk-viem";
 * import { erc20Abi } from "viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { readContract } from "viem/actions";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const symbol = await readContract(client, {
 *   address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
 *   abi: erc20Abi,
 *   functionName: "symbol",
 * }).catch((error: unknown) =>
 *   // MKR's symbol() returns bytes32, which does not decode as `string`.
 *   isUndecodableResultError(error) ? "MKR" : Promise.reject(error),
 * );
 * ```
 */
export const isUndecodableResultError = (error: unknown): boolean =>
  error instanceof BaseError &&
  error.walk(
    (cause) =>
      cause instanceof AbiDecodingZeroDataError ||
      cause instanceof AbiDecodingDataSizeTooSmallError ||
      cause instanceof AbiDecodingDataSizeInvalidError ||
      cause instanceof InvalidAbiDecodingTypeError ||
      cause instanceof InvalidBytesBooleanError ||
      cause instanceof IntegerOutOfRangeError ||
      cause instanceof SliceOffsetOutOfBoundsError ||
      // viem's `PositionOutOfBoundsError` is not exported from the package
      // root, so it is matched by name.
      (cause instanceof BaseError && cause.name === "PositionOutOfBoundsError"),
  ) !== null;

/**
 * Returns a rejection handler that substitutes a fallback only for non-transport contract reverts.
 * Transport errors are rethrown even when their cause chain also contains a revert.
 *
 * @param fallback - Value returned when the error represents a non-transport contract revert.
 * @returns A handler that rethrows all other errors unchanged.
 * @example
 * ```ts
 * import { catchRevertOnly } from "@morpho-org/blue-sdk-viem";
 * import { ContractFunctionZeroDataError } from "viem";
 *
 * const error = new ContractFunctionZeroDataError({ functionName: "read" });
 * const result = catchRevertOnly(0n)(error);
 * // result === 0n
 * ```
 */
export const catchRevertOnly =
  <T>(fallback: T) =>
  (error: unknown): T => {
    if (isTransportError(error)) throw error;
    if (isContractRevertError(error)) return fallback;
    throw error;
  };

/**
 * Checks whether a viem `BaseError` cause chain contains an RPC transport failure.
 * Causes behind a non-viem `Error` wrapper are not inspected.
 *
 * @param error - Error thrown by an RPC request.
 * @returns Whether the error represents a timeout, rate limit, socket failure, or retryable HTTP response.
 * @example
 * ```ts
 * import { isTransportError } from "@morpho-org/blue-sdk-viem";
 * import { HttpRequestError } from "viem";
 *
 * const error = new HttpRequestError({ status: 429, url: "https://rpc.example" });
 * const isTransport: boolean = isTransportError(error);
 * // isTransport === true
 * ```
 */
export const isTransportError = (error: unknown): boolean => {
  return (
    error instanceof BaseError &&
    error.walk(
      (cause) =>
        cause instanceof TimeoutError ||
        cause instanceof LimitExceededRpcError ||
        cause instanceof SocketClosedError ||
        cause instanceof WebSocketRequestError ||
        (cause instanceof HttpRequestError &&
          (cause.status === undefined ||
            cause.status === 408 ||
            cause.status === 429 ||
            cause.status >= 500)),
    ) !== null
  );
};

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
 * @throws {InvalidNumberError} When the formatted value is not a plain decimal string (e.g. `NaN`, `Infinity`).
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
 * @throws {InvalidNumberError} When `strValue` is not a plain decimal string (e.g. `"100.00.999"`, `"1e5"`, `"abc1"`).
 * @example
 * ```ts
 * import { safeParseUnits } from "@morpho-org/blue-sdk-viem";
 *
 * const amount = safeParseUnits("1.25", 6);
 * ```
 */
export const safeParseUnits = (strValue: string, decimals = 18) => {
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(strValue))
    throw new InvalidNumberError(strValue);

  const negative = strValue.startsWith("-");
  const unsigned = strValue.replace(/^[-+]/, "");

  let [whole, dec = ""] = unsigned.split(".");

  dec = dec.slice(0, decimals);

  const parsed = parseUnits(
    [whole || "0", dec].filter((v) => v.length > 0).join("."),
    decimals,
  );

  return negative ? -parsed : parsed;
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
 * @throws {UnknownAbiFunctionError} When `parameters.name` matches no function item in the ABI.
 * @throws {UnnamedAbiOutputsError} When the function's ABI outputs are not all named.
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
        throw new UnnamedAbiOutputsError(x.name);
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
      throw new UnknownAbiFunctionError(String(parameters.name));
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
 * @throws {NonTupleReturnValueError} When the read returns a single value instead of a tuple.
 * @throws {UnnamedAbiOutputsError} When the function's ABI outputs are not all named.
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
    throw new NonTupleReturnValueError(parameters.functionName);
  }

  return restructure(outputs, {
    abi: parameters.abi,
    name: parameters.functionName,
    args: parameters.args,
  } as unknown as GetAbiItemParameters<abi, name, args>);
}
