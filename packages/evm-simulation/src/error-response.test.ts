import { HttpRequestError } from "viem";
import { describe, expect, test } from "vitest";
import { toSimulationErrorResponse } from "./error-response.js";
import {
  BlacklistViolationError,
  RpcTransportError,
  SimulationAssertError,
  SimulationLogAssertError,
  SimulationRevertedError,
  UnexpectedSimulationError,
} from "./errors.js";

describe("toSimulationErrorResponse", () => {
  test.each(["0x", "0xDEADBEEF", undefined] as const)(
    "behavior: preserves message and exact revert data %s",
    (revertData) => {
      const response = toSimulationErrorResponse(
        new SimulationRevertedError("InsufficientBalance(1283)", revertData),
      );
      expect(JSON.parse(JSON.stringify(response))).toEqual({
        code: "SIMULATION_REVERTED",
        message: "InsufficientBalance(1283)",
        ...(revertData === undefined ? {} : { revertData }),
      });
      expect(Object.isFrozen(response)).toBe(true);
    },
  );

  test("behavior: omits bigint diagnostics, stack, and cyclic causes", () => {
    const cause: { self?: unknown } = {};
    cause.self = cause;
    const error = new BlacklistViolationError(
      "Retained assets",
      [
        {
          address: "0x0000000000000000000000000000000000000001",
          token: "0x0000000000000000000000000000000000000002",
          netRetained: 2n ** 200n,
        },
      ],
      { cause },
    );
    expect(
      JSON.parse(JSON.stringify(toSimulationErrorResponse(error))),
    ).toEqual({
      code: "BLACKLIST_ERROR",
      message: "Retained assets",
    });
  });

  test.each([
    new HttpRequestError({
      url: "https://rpc.example/secret",
      body: { private: "payload" },
    }),
    new UnexpectedSimulationError("https://rpc.example/secret"),
    new Error("https://rpc.example/secret"),
    "https://rpc.example/secret",
    null,
    undefined,
  ])("behavior: hides infrastructure and unexpected diagnostics", (error) => {
    expect(toSimulationErrorResponse(error)).toEqual({
      code: "UNEXPECTED_SIMULATION_ERROR",
      message: "Simulation failed unexpectedly.",
    });
  });

  test("behavior: exposes the RPC code without provider diagnostics", () => {
    const cause = new HttpRequestError({ url: "https://rpc.example/secret" });
    const error = new RpcTransportError(cause.message, { cause });
    expect(toSimulationErrorResponse(error)).toEqual({
      code: "RPC_TRANSPORT_ERROR",
      message: "RPC request failed. Check the endpoint and try again.",
    });
  });

  test.each([0, 2, undefined])(
    "behavior: forwards an available user index %s",
    (transactionIndex) => {
      const error = new SimulationRevertedError("reverted", "0x", {
        transactionIndex,
      });
      expect(
        JSON.parse(JSON.stringify(toSimulationErrorResponse(error))),
      ).toEqual({
        code: "SIMULATION_REVERTED",
        message: "reverted",
        revertData: "0x",
        ...(transactionIndex === undefined ? {} : { transactionIndex }),
      });
    },
  );

  test("behavior: forwards assertion transaction index without bigint fields", () => {
    const error = new SimulationAssertError("assertion failed", {
      transactionIndex: 2,
      phase: "after",
      assertionIndex: 0,
      assertion: {
        to: "0x0000000000000000000000000000000000000001",
        data: "0x",
        check: () => "failed",
      },
      returnData: "0x32",
    });
    expect(
      JSON.parse(JSON.stringify(toSimulationErrorResponse(error))),
    ).toEqual({
      code: "SIMULATION_ASSERT_FAILED",
      message: "assertion failed",
      transactionIndex: 2,
    });
  });

  test("behavior: forwards log assertion transaction index", () => {
    const error = new SimulationLogAssertError("log assertion failed", {
      transactionIndex: 2,
      assertionIndex: 0,
      assertion: { check: () => "log assertion failed" },
      logs: [],
    });
    expect(
      JSON.parse(JSON.stringify(toSimulationErrorResponse(error))),
    ).toEqual({
      code: "SIMULATION_ASSERT_FAILED",
      message: "log assertion failed",
      transactionIndex: 2,
    });
  });

  test.each([-1, 0.5, NaN, Infinity, "0", null, Number.MAX_SAFE_INTEGER + 1])(
    "behavior: omits invalid indexes on cross-bundle errors",
    (transactionIndex) => {
      expect(
        toSimulationErrorResponse({
          name: "SimulationRevertedError",
          code: "SIMULATION_REVERTED",
          message: "reverted",
          transactionIndex,
        }),
      ).not.toHaveProperty("transactionIndex");
    },
  );

  test.each(["0xdeadbeef", 123, "private data"])(
    "behavior: validates revert data on errors from another bundle",
    (revertData) => {
      const response = toSimulationErrorResponse({
        name: "SimulationRevertedError",
        code: "SIMULATION_REVERTED",
        message: "Reverted",
        revertData,
        cause: "private diagnostic",
      });
      expect(response).toEqual({
        code: "SIMULATION_REVERTED",
        message: "Reverted",
        ...(revertData === "0xdeadbeef" ? { revertData } : {}),
      });
    },
  );
});
