import {
  type Address,
  encodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  erc4626Abi,
  ethAddress,
  getAddress,
  multicall3Abi,
} from "viem";
import {
  MissingVerificationEvidenceError,
  SimulationRevertedError,
} from "../errors.js";
import type { Assertion } from "../types.js";
import { encodeAssertion, evaluateAssertion } from "./assertions.js";

const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const ACCOUNT: Address = getAddress(
  "0x1111111111111111111111111111111111111111",
);
const VAULT: Address = getAddress("0x2222222222222222222222222222222222222222");

const context = {
  transactionIndex: 2,
  phase: "before" as const,
  assertionIndex: 1,
  chainId: 1,
  mode: "final" as const,
  blockNumber: 24_000_000n,
};

describe("encodeAssertion", () => {
  test.each([
    {
      assertion: {
        type: "erc20Balance",
        token: TOKEN,
        account: ACCOUNT,
        min: 4n,
      } satisfies Assertion,
      to: TOKEN,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [ACCOUNT],
      }),
    },
    {
      assertion: {
        type: "nativeBalance",
        account: ACCOUNT,
        min: 4n,
      } satisfies Assertion,
      to: "0xcA11bde05977b3631167028862bE2a173976CA11",
      data: encodeFunctionData({
        abi: multicall3Abi,
        functionName: "getEthBalance",
        args: [ACCOUNT],
      }),
    },
    {
      assertion: {
        type: "maxDeposit",
        vault: VAULT,
        receiver: ACCOUNT,
        min: 4n,
      } satisfies Assertion,
      to: VAULT,
      data: encodeFunctionData({
        abi: erc4626Abi,
        functionName: "maxDeposit",
        args: [ACCOUNT],
      }),
    },
  ])("encodes $assertion.type", ({ assertion, to, data }) => {
    expect(encodeAssertion(assertion)).toEqual({ to, data });
  });
});

describe("evaluateAssertion", () => {
  test.each([
    {
      assertion: {
        type: "erc20Balance",
        token: TOKEN,
        account: ACCOUNT,
        min: 5n,
      } satisfies Assertion,
      data: encodeFunctionResult({
        abi: erc20Abi,
        functionName: "balanceOf",
        result: 5n,
      }),
    },
    {
      assertion: {
        type: "nativeBalance",
        account: ACCOUNT,
        min: 5n,
      } satisfies Assertion,
      data: encodeFunctionResult({
        abi: multicall3Abi,
        functionName: "getEthBalance",
        result: 5n,
      }),
    },
    {
      assertion: {
        type: "maxDeposit",
        vault: VAULT,
        receiver: ACCOUNT,
        min: 5n,
      } satisfies Assertion,
      data: encodeFunctionResult({
        abi: erc4626Abi,
        functionName: "maxDeposit",
        result: 5n,
      }),
    },
  ])("passes equality for $assertion.type", ({ assertion, data }) => {
    expect(() =>
      evaluateAssertion({
        ...context,
        assertion,
        returnData: data,
        status: true,
      }),
    ).not.toThrow();
  });

  test.each([
    {
      assertion: {
        type: "erc20Balance",
        token: TOKEN,
        account: ACCOUNT,
        min: 5n,
      } satisfies Assertion,
      data: encodeFunctionResult({
        abi: erc20Abi,
        functionName: "balanceOf",
        result: 4n,
      }),
      reasonCode: "INSUFFICIENT_BALANCE",
      account: ACCOUNT,
      token: TOKEN,
      vault: undefined,
      assertionType: "erc20Balance",
    },
    {
      assertion: {
        type: "nativeBalance",
        account: ACCOUNT,
        min: 5n,
      } satisfies Assertion,
      data: encodeFunctionResult({
        abi: multicall3Abi,
        functionName: "getEthBalance",
        result: 4n,
      }),
      reasonCode: "INSUFFICIENT_BALANCE",
      account: ACCOUNT,
      token: ethAddress,
      vault: undefined,
      assertionType: "nativeBalance",
    },
    {
      assertion: {
        type: "maxDeposit",
        vault: VAULT,
        receiver: ACCOUNT,
        min: 5n,
      } satisfies Assertion,
      data: encodeFunctionResult({
        abi: erc4626Abi,
        functionName: "maxDeposit",
        result: 4n,
      }),
      reasonCode: "CAP_EXCEEDED",
      account: ACCOUNT,
      token: undefined,
      vault: VAULT,
      assertionType: "maxDeposit",
    },
  ])("fails one below min for $assertion.type", (testCase) => {
    let error: unknown;
    try {
      evaluateAssertion({
        ...context,
        assertion: testCase.assertion,
        returnData: testCase.data,
        status: true,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({
      reasonCode: testCase.reasonCode,
      details: undefined,
      context: {
        stage: "execution",
        chainId: 1,
        mode: "final",
        blockNumber: 24_000_000n,
        transactionIndex: 2,
        phase: "before",
        assertionIndex: 1,
        assertion: testCase.assertionType,
        account: testCase.account,
        ...(testCase.token !== undefined ? { token: testCase.token } : {}),
        ...(testCase.vault !== undefined ? { vault: testCase.vault } : {}),
        expected: 5n,
        observed: 4n,
      },
    });
    expect((error as SimulationRevertedError).reason).toContain(
      'of at least "5" before execution, got "4".',
    );
  });

  test("empty data reports missing verification evidence", () => {
    expect(() =>
      evaluateAssertion({
        ...context,
        assertion: {
          type: "erc20Balance",
          token: TOKEN,
          account: ACCOUNT,
          min: 1n,
        },
        returnData: "0x",
        status: true,
      }),
    ).toThrow(MissingVerificationEvidenceError);
  });

  test("reverted reads report missing verification evidence", () => {
    let error: unknown;
    try {
      evaluateAssertion({
        ...context,
        assertion: {
          type: "erc20Balance",
          token: TOKEN,
          account: ACCOUNT,
          min: 1n,
        },
        returnData: "0x",
        status: false,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MissingVerificationEvidenceError);
    expect(error).toMatchObject({
      context: {
        stage: "verification",
        field: "transactions[2].assertBefore[1]",
      },
    });
  });

  test("undecodable data reports an invalid response", () => {
    const assertion: Assertion = {
      type: "erc20Balance",
      token: TOKEN,
      account: ACCOUNT,
      min: 1n,
    };
    expect(() =>
      evaluateAssertion({
        ...context,
        assertion,
        returnData: "0x01",
        status: true,
      }),
    ).toThrow("Cannot decode transaction assertion");
  });
});
