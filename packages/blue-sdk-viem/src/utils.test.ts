import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  AbiDecodingZeroDataError,
  BaseError,
  BytesSizeMismatchError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  decodeAbiParameters,
  ExecutionRevertedError,
  encodeErrorResult,
  erc20Abi,
  HttpRequestError,
  IntegerOutOfRangeError,
  InvalidAddressError,
  LimitExceededRpcError,
  parseAbi,
  parseAbiParameters,
  parseUnits,
  RpcRequestError,
  SocketClosedError,
  TimeoutError,
  WebSocketRequestError,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  InvalidNumberError,
  NonTupleReturnValueError,
  UnknownAbiFunctionError,
  UnnamedAbiOutputsError,
} from "./error.js";
import {
  catchRevertOnly,
  isContractRevertError,
  isTransportError,
  isUndecodableResultError,
  readContractRestructured,
  restructure,
  safeGetAddress,
  safeParseNumber,
  safeParseUnits,
} from "./utils.js";

describe("error classification", () => {
  const revert = new ContractFunctionRevertedError({
    abi: [],
    data: "0x",
    functionName: "read",
  });
  const zeroData = new ContractFunctionZeroDataError({
    functionName: "read",
  });
  const executionReverted = new ExecutionRevertedError({
    cause: new RpcRequestError({
      body: { method: "eth_call", params: [] },
      error: { code: -32000, message: "execution reverted" },
      url: "http://rpc.test",
    }),
  });
  const gasAllowanceExecutionReverted = new ExecutionRevertedError({
    cause: new RpcRequestError({
      body: { method: "eth_call", params: [] },
      error: { code: -32000, message: "gas required exceeds allowance" },
      url: "http://rpc.test",
    }),
    message: "gas required exceeds allowance",
  });

  test("detects contract reverts through nested viem causes", () => {
    const error = new BaseError("outer", {
      cause: new BaseError("inner", { cause: zeroData }),
    });

    expect(isContractRevertError(revert)).toBe(true);
    expect(isContractRevertError(error)).toBe(true);
    expect(isContractRevertError(executionReverted)).toBe(true);
    expect(isTransportError(executionReverted)).toBe(false);
    expect(isContractRevertError(new Error("unavailable"))).toBe(false);
  });

  test("does not classify gas allowance errors as contract reverts or transport errors", () => {
    expect(isContractRevertError(gasAllowanceExecutionReverted)).toBe(false);
    expect(isTransportError(gasAllowanceExecutionReverted)).toBe(false);
  });

  test("uses catchRevertOnly fallbacks only for contract reverts", () => {
    const recover = catchRevertOnly("fallback");
    const transportError = new HttpRequestError({
      status: 429,
      url: "http://rpc.test",
    });
    let thrown: unknown;

    expect(recover(revert)).toBe("fallback");
    try {
      recover(transportError);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(transportError);
  });

  test("rethrows transport errors even when their cause chain contains a revert", () => {
    const abi = parseAbi(["error ReadFailed()"]);
    const transportError = new HttpRequestError({
      status: 429,
      url: "http://rpc.test",
      cause: new ContractFunctionRevertedError({
        abi,
        data: encodeErrorResult({ abi, errorName: "ReadFailed" }),
        functionName: "read",
      }),
    });
    let thrown: unknown;

    try {
      catchRevertOnly(0n)(transportError);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(transportError);
  });

  test("detects undecodable results through nested viem causes", () => {
    const undecodable = new AbiDecodingZeroDataError();
    const wrapped = new BaseError("outer", { cause: undecodable });
    const integerDecodeError = (() => {
      try {
        decodeAbiParameters(
          parseAbiParameters("uint8"),
          `0x${(1n << 200n).toString(16).padStart(64, "0")}`,
        );
      } catch (error) {
        return error;
      }
    })();
    const encodeOnlyBytesSize = new BytesSizeMismatchError({
      expectedSize: 32,
      givenSize: 31,
    });

    expect(isUndecodableResultError(undecodable)).toBe(true);
    expect(isUndecodableResultError(wrapped)).toBe(true);
    expect(integerDecodeError).toBeInstanceOf(IntegerOutOfRangeError);
    expect(isUndecodableResultError(integerDecodeError)).toBe(true);
    expect(isUndecodableResultError(encodeOnlyBytesSize)).toBe(false);
    expect(isUndecodableResultError(revert)).toBe(false);
    expect(isUndecodableResultError(new Error("unavailable"))).toBe(false);
  });

  test("detects PositionOutOfBoundsError by name, only on viem BaseError causes", () => {
    const boundsError = (() => {
      try {
        // 32 bytes is too short for the eip712Domain tuple.
        decodeAbiParameters(
          parseAbiParameters(
            "bytes1, string, string, uint256, address, bytes32, uint256[]",
          ),
          `0x${"12".repeat(32)}`,
        );
      } catch (error) {
        return error;
      }
    })();
    const impostor = Object.assign(new Error("impostor"), {
      name: "PositionOutOfBoundsError",
    });

    expect(boundsError).toBeInstanceOf(BaseError);
    expect((boundsError as BaseError).name).toBe("PositionOutOfBoundsError");
    expect(isUndecodableResultError(boundsError)).toBe(true);
    expect(isUndecodableResultError(impostor)).toBe(false);
  });

  test("recognizes transport errors and only retryable HTTP statuses", () => {
    const retryable = [
      new TimeoutError({ body: {}, url: "http://rpc.test" }),
      new LimitExceededRpcError(new Error("limit")),
      new SocketClosedError({ url: "ws://rpc.test" }),
      new WebSocketRequestError({ url: "ws://rpc.test" }),
      new HttpRequestError({ url: "http://rpc.test" }),
      new HttpRequestError({ status: 408, url: "http://rpc.test" }),
      new HttpRequestError({ status: 429, url: "http://rpc.test" }),
      new HttpRequestError({ status: 503, url: "http://rpc.test" }),
    ];
    const nonRetryable = [
      new HttpRequestError({ status: 400, url: "http://rpc.test" }),
      new HttpRequestError({ status: 413, url: "http://rpc.test" }),
      new Error("unavailable"),
      new Error("x", {
        cause: new HttpRequestError({
          status: 429,
          url: "http://rpc.test",
        }),
      }),
    ];

    for (const error of retryable) expect(isTransportError(error)).toBe(true);
    for (const error of nonRetryable)
      expect(isTransportError(error)).toBe(false);
  });
});

describe("safeParseNumber", () => {
  test("parses an integer", () => {
    expect(safeParseNumber(1)).toBe(parseUnits("1", 18));
  });

  test("parses a decimal at default 18 decimals", () => {
    expect(safeParseNumber(1.5)).toBe(parseUnits("1.5", 18));
  });

  test("respects explicit decimals", () => {
    expect(safeParseNumber(1, 6)).toBe(parseUnits("1", 6));
    expect(safeParseNumber(1.5, 4)).toBe(parseUnits("1.5", 4));
  });

  test("avoids scientific notation for small values", () => {
    // 0.0000001 parsed at 8 decimals should yield 10
    expect(safeParseNumber(0.0000001, 8)).toBe(10n);
  });

  test("avoids scientific notation for large values", () => {
    expect(safeParseNumber(1e20, 0)).toBe(100_000_000_000_000_000_000n);
  });

  test("handles zero", () => {
    expect(safeParseNumber(0)).toBe(0n);
  });

  test("handles negatives", () => {
    expect(safeParseNumber(-1)).toBe(-parseUnits("1", 18));
  });

  test("error: throws InvalidNumberError on NaN and Infinity", () => {
    expect(() => safeParseNumber(Number.NaN)).toThrow(InvalidNumberError);
    expect(() => safeParseNumber(Number.POSITIVE_INFINITY)).toThrow(
      InvalidNumberError,
    );
    expect(() => safeParseNumber(Number.NEGATIVE_INFINITY)).toThrow(
      InvalidNumberError,
    );
  });
});

describe("safeParseUnits", () => {
  test("parses a normal decimal string", () => {
    expect(safeParseUnits("1.5", 18)).toBe(parseUnits("1.5", 18));
  });

  test("truncates extra fractional digits beyond decimals", () => {
    // "1.123456789" at decimals=4 -> "1.1234"
    expect(safeParseUnits("1.123456789", 4)).toBe(parseUnits("1.1234", 4));
  });

  test("handles whole numbers", () => {
    expect(safeParseUnits("42", 6)).toBe(parseUnits("42", 6));
  });

  test("treats leading dot as 0.x", () => {
    expect(safeParseUnits(".5", 4)).toBe(parseUnits("0.5", 4));
  });

  test("throws on completely invalid strings", () => {
    expect(() => safeParseUnits("abc")).toThrow(InvalidNumberError);
    expect(() => safeParseUnits("")).toThrow(InvalidNumberError);
  });

  test("throws on malformed multi-decimal and non-numeric strings", () => {
    expect(() => safeParseUnits("100.00.999")).toThrow(InvalidNumberError);
    expect(() => safeParseUnits("1.2.3")).toThrow(InvalidNumberError);
    expect(() => safeParseUnits("1e5")).toThrow(InvalidNumberError);
    expect(() => safeParseUnits("abc1")).toThrow(InvalidNumberError);
  });

  test("parses leading-dot, negative, and signed-positive values", () => {
    expect(safeParseUnits(".5")).toBe(parseUnits("0.5", 18));
    expect(safeParseUnits("-1.5")).toBe(-1500000000000000000n);
    expect(safeParseUnits("+2")).toBe(2n * 10n ** 18n);
  });

  test("behavior: trailing dot, signed leading dot, and zero decimals", () => {
    expect(safeParseUnits("1.")).toBe(parseUnits("1", 18));
    expect(safeParseUnits("-.5")).toBe(-parseUnits("0.5", 18));
    expect(safeParseUnits("1.9", 0)).toBe(1n);
  });

  test("truncates extra fractional digits at decimals", () => {
    expect(safeParseUnits("100.123456789", 6)).toBe(100123456n);
  });

  test("handles negative numbers", () => {
    expect(safeParseUnits("-1.5", 18)).toBe(-parseUnits("1.5", 18));
  });
});

describe("safeGetAddress", () => {
  test("returns the EIP-55 checksum form for any input case", () => {
    expect(safeGetAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")).toBe(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    );
    expect(safeGetAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")).toBe(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    );
  });

  test("throws InvalidAddressError on a non-address string", () => {
    // Pin viem's typed error class so a regression that swaps to a generic
    // Error or silently coerces is caught.
    expect(() => safeGetAddress("0xnotanaddress")).toThrow(InvalidAddressError);
  });
});

describe("restructure", () => {
  const namedAbi = parseAbi([
    "function getMarket() view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  ]);

  test("converts a positional tuple into an object using named ABI outputs", () => {
    const tuple = [1n, 2n, 3n, 4n, 5n, 6n] as const;
    const r = restructure(tuple, {
      abi: namedAbi,
      name: "getMarket",
      args: [],
    });
    expect(r).toEqual({
      totalSupplyAssets: 1n,
      totalSupplyShares: 2n,
      totalBorrowAssets: 3n,
      totalBorrowShares: 4n,
      lastUpdate: 5n,
      fee: 6n,
    });
  });

  test("error: UnknownAbiFunctionError when the function does not exist in the abi", () => {
    expect(() =>
      restructure([] as never, {
        abi: namedAbi,
        // @ts-expect-error - intentional bad input
        name: "doesNotExist",
        args: [],
      }),
    ).toThrow(UnknownAbiFunctionError);
  });

  test("error: UnnamedAbiOutputsError when ABI outputs lack names", () => {
    const unnamedAbi = parseAbi([
      "function foo() view returns (uint256, uint256)",
    ]);
    expect(() =>
      restructure([1n, 2n], { abi: unnamedAbi, name: "foo", args: [] }),
    ).toThrow(UnnamedAbiOutputsError);
  });

  test("error: readContractRestructured throws NonTupleReturnValueError when viem returns a scalar", async () => {
    const handle = createMockClient(mainnet);
    const token = "0x1111111111111111111111111111111111111111";
    mockRead(handle, {
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
      result: 18,
    });

    await expect(
      readContractRestructured(handle.client, {
        address: token,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ).rejects.toBeInstanceOf(NonTupleReturnValueError);
  });
});
