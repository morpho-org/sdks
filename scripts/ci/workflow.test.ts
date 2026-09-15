import { describe, expect, test, vi } from "vitest";

import {
  describeError,
  readRequiredEnv,
  reportCliError,
  sanitizeAnnotation,
  writeStdout,
} from "./workflow.ts";

describe("readRequiredEnv", () => {
  test("default", () => {
    expect(readRequiredEnv({ GH_TOKEN: "x" }, "GH_TOKEN")).toBe("x");
  });

  test("error: unset or blank variable", () => {
    expect(() => readRequiredEnv({}, "GH_TOKEN")).toThrow(/GH_TOKEN/);
    expect(() => readRequiredEnv({ GH_TOKEN: "" }, "GH_TOKEN")).toThrow(
      /GH_TOKEN/,
    );
  });
});

describe("reportCliError", () => {
  test("default: writes a sanitized ::error:: annotation and marks the process failed", () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const previous = process.exitCode;
    try {
      reportCliError(new Error("line one\nline two"));
      expect(stderr).toHaveBeenCalledWith("::error::line one%0Aline two\n");
      expect(process.exitCode).toBe(1);

      reportCliError("plain string");
      expect(stderr).toHaveBeenLastCalledWith("::error::plain string\n");

      reportCliError(
        new TypeError("fetch failed", {
          cause: new Error("getaddrinfo ENOTFOUND api.github.com"),
        }),
      );
      expect(stderr).toHaveBeenLastCalledWith(
        "::error::fetch failed: getaddrinfo ENOTFOUND api.github.com\n",
      );
    } finally {
      stderr.mockRestore();
      process.exitCode = previous;
    }
  });
});

describe("describeError", () => {
  test("default: joins the cause chain and tolerates cycles and non-Error causes", () => {
    const inner = new Error("inner", { cause: "raw cause" });
    const outer = new Error("outer", { cause: inner });
    expect(describeError(outer)).toBe("outer: inner: raw cause");

    const loop = new Error("loop");
    loop.cause = loop;
    expect(describeError(loop)).toBe("loop");
    expect(describeError(undefined)).toBe("");
  });

  test("behavior: AggregateError with an empty message surfaces its errors", () => {
    const aggregate = new AggregateError(
      [
        new Error("connect ECONNREFUSED ::1:443"),
        new Error("connect ECONNREFUSED 127.0.0.1:443"),
      ],
      "",
    );
    expect(
      describeError(new TypeError("fetch failed", { cause: aggregate })),
    ).toBe(
      "fetch failed: connect ECONNREFUSED ::1:443; connect ECONNREFUSED 127.0.0.1:443",
    );
  });
});

describe("writeStdout", () => {
  test("default", () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      writeStdout("hello\n");
      expect(stdout).toHaveBeenCalledWith("hello\n");
    } finally {
      stdout.mockRestore();
    }
  });
});

describe("sanitizeAnnotation", () => {
  test("default", () => {
    expect(sanitizeAnnotation("plain message")).toBe("plain message");
  });

  test("behavior: encodes line breaks and percent signs", () => {
    expect(sanitizeAnnotation("100% done\r\nnext ::error:: line")).toBe(
      "100%25 done%0D%0Anext ::error:: line",
    );
  });
});
