import {
  type Address,
  encodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  erc4626Abi,
  getAddress,
  type Hex,
  multicall3Abi,
} from "viem";
import { describe, expect, test } from "vitest";
import { SimulationAssertError } from "../errors.js";
import type { Assertion } from "../types.js";
import {
  type AssertionBounds,
  erc20BalanceAssertion,
  evaluateAssertion,
  maxDepositAssertion,
  nativeBalanceAssertion,
} from "./assertions.js";

const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const ACCOUNT: Address = getAddress(
  "0x1111111111111111111111111111111111111111",
);
const VAULT: Address = getAddress("0x2222222222222222222222222222222222222222");
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

const helperCases: readonly {
  readonly name: string;
  readonly to: Address;
  readonly create: (bounds: AssertionBounds) => Assertion;
  readonly encode: (observed: bigint) => Hex;
}[] = [
  {
    name: "ERC-20 balance",
    to: TOKEN,
    create: (bounds) =>
      erc20BalanceAssertion({ token: TOKEN, account: ACCOUNT, ...bounds }),
    encode: (observed) =>
      encodeFunctionResult({
        abi: erc20Abi,
        functionName: "balanceOf",
        result: observed,
      }),
  },
  {
    name: "native balance",
    to: MULTICALL3,
    create: (bounds) => nativeBalanceAssertion({ account: ACCOUNT, ...bounds }),
    encode: (observed) =>
      encodeFunctionResult({
        abi: multicall3Abi,
        functionName: "getEthBalance",
        result: observed,
      }),
  },
  {
    name: "maxDeposit",
    to: VAULT,
    create: (bounds) =>
      maxDepositAssertion({ vault: VAULT, receiver: ACCOUNT, ...bounds }),
    encode: (observed) =>
      encodeFunctionResult({
        abi: erc4626Abi,
        functionName: "maxDeposit",
        result: observed,
      }),
  },
];

describe.each(helperCases)("$name assertion helper", (helper) => {
  test("encodes the expected view call", () => {
    const assertion = helper.create({ min: 1n });
    expect(assertion.to).toBe(helper.to);
    expect(assertion.data).toBe(
      helper.name === "ERC-20 balance"
        ? encodeFunctionData({
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [ACCOUNT],
          })
        : helper.name === "native balance"
          ? encodeFunctionData({
              abi: multicall3Abi,
              functionName: "getEthBalance",
              args: [ACCOUNT],
            })
          : encodeFunctionData({
              abi: erc4626Abi,
              functionName: "maxDeposit",
              args: [ACCOUNT],
            }),
    );
  });

  test.each([
    { name: "exactly min", bounds: { min: 5n }, observed: 5n },
    { name: "exactly max", bounds: { max: 5n }, observed: 5n },
    {
      name: "inside both bounds",
      bounds: { min: 4n, max: 6n },
      observed: 5n,
    },
  ] as const)("passes $name", ({ bounds, observed }) => {
    expect(
      helper.create(bounds).check(helper.encode(observed)),
    ).toBeUndefined();
  });

  test("reports a value below min", () => {
    expect(helper.create({ min: 10n }).check(helper.encode(5n))).toContain(
      'is "5", expected at least "10".',
    );
  });

  test("reports a value above max", () => {
    expect(helper.create({ max: 3n }).check(helper.encode(5n))).toContain(
      'is "5", expected at most "3".',
    );
  });

  test("reports both inclusive bounds", () => {
    expect(
      helper.create({ min: 6n, max: 10n }).check(helper.encode(5n)),
    ).toContain('is "5", expected between "6" and "10".');
  });

  test.each(["0x", "0x01"] as const)(
    "returns a failure for undecodable data %s",
    (returnData) => {
      expect(() => helper.create({ min: 1n }).check(returnData)).not.toThrow();
      expect(helper.create({ min: 1n }).check(returnData)).toContain(
        `undecodable data "${returnData}"`,
      );
    },
  );
});

describe("evaluateAssertion", () => {
  const coordinates = {
    transactionIndex: 2,
    phase: "before" as const,
    assertionIndex: 1,
  };

  test("throws a SimulationAssertError with the assertion and return data", () => {
    const assertion: Assertion = {
      to: TOKEN,
      data: "0x1234",
      check: () => "Allowance is not zero.",
    };
    const returnData = "0xabcdef";
    let error: unknown;
    try {
      evaluateAssertion({
        ...coordinates,
        assertion,
        returnData,
        status: true,
        revertData: "0x",
        cause: undefined,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationAssertError);
    expect(error).toMatchObject({
      code: "SIMULATION_ASSERT_FAILED",
      ...coordinates,
      returnData,
    });
    expect((error as SimulationAssertError).assertion).toEqual(assertion);
    expect((error as SimulationAssertError).message).toContain(
      "Allowance is not zero.",
    );
  });

  test("passes when the check returns undefined", () => {
    expect(() =>
      evaluateAssertion({
        ...coordinates,
        assertion: { to: TOKEN, data: "0x1234", check: () => undefined },
        returnData: "0xabcd",
        status: true,
        revertData: "0x",
        cause: undefined,
      }),
    ).not.toThrow();
  });

  test("reports reverted reads with revert data and cause", () => {
    const cause = new Error("node call error");
    let error: unknown;
    try {
      evaluateAssertion({
        ...coordinates,
        assertion: { to: TOKEN, data: "0x1234", check: () => undefined },
        returnData: "0x",
        status: false,
        revertData: "0xdeadbeef",
        cause,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationAssertError);
    expect(error).toMatchObject({
      transactionIndex: 2,
      phase: "before",
      assertionIndex: 1,
      returnData: "0xdeadbeef",
      cause,
    });
    expect((error as Error).message).toContain(
      "Transaction 2 assertBefore[1] read reverted:",
    );
  });

  test("wraps a caller check exception with its error as cause", () => {
    const thrown = new Error("caller bug");
    const assertion: Assertion = {
      to: TOKEN,
      data: "0x1234",
      check: () => {
        throw thrown;
      },
    };
    let error: unknown;
    try {
      evaluateAssertion({
        ...coordinates,
        assertion,
        returnData: "0xabcd",
        status: true,
        revertData: "0x",
        cause: undefined,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationAssertError);
    expect(error).toMatchObject({
      ...coordinates,
      assertion,
      returnData: "0xabcd",
      cause: thrown,
    });
  });
});
