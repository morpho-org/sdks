import {
  type Address,
  type Hex,
  decodeFunctionData,
  erc20Abi,
  maxUint256,
} from "viem";

import type { SimulateParams, SimulationAuthorization } from "../../types.js";

import { SimulationValidationError } from "../../errors.js";
import { buildSimulationTxs } from "./build-simulation-txs.js";

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const SPENDER: Address = "0x3333333333333333333333333333333333333333";

function makeParams(overrides: Partial<SimulateParams> = {}): SimulateParams {
  return {
    chainId: 1,
    transactions: [{ from: USER, to: VAULT, data: "0x12345678" as Hex }],
    ...overrides,
  };
}

describe("buildSimulationTxs", () => {
  it("returns user transactions unchanged when no authorizations", () => {
    const params = makeParams();
    expect(buildSimulationTxs(params)).toEqual(params.transactions);
  });

  it("returns user transactions unchanged when authorizations is empty array", () => {
    const params = makeParams({ authorizations: [] });
    expect(buildSimulationTxs(params)).toEqual(params.transactions);
  });

  it("prepends an approval-type authorization tx as-is", () => {
    const approvalTx = {
      from: USER,
      to: USDC,
      data: "0xabcdef" as Hex,
      value: 0n,
    };
    const auths: SimulationAuthorization[] = [
      { type: "approval", transaction: approvalTx },
    ];
    const result = buildSimulationTxs(makeParams({ authorizations: auths }));

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(approvalTx);
    expect(result[1]!.to).toBe(VAULT);
  });

  it("encodes a signature-type authorization as approve(spender, maxUint256)", () => {
    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: SPENDER },
    ];
    const result = buildSimulationTxs(makeParams({ authorizations: auths }));

    expect(result).toHaveLength(2);
    expect(result[0]!.from).toBe(USER); // first tx's sender
    expect(result[0]!.to).toBe(USDC);

    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: result[0]!.data,
    });
    expect(decoded.functionName).toBe("approve");
    expect(decoded.args[0]).toBe(SPENDER);
    expect(decoded.args[1]).toBe(maxUint256);
  });

  it("preserves order: all auths first, then all user txs", () => {
    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: SPENDER },
      {
        type: "approval",
        transaction: {
          from: USER,
          to: USDC,
          data: "0xdeadbeef" as Hex,
          value: 0n,
        },
      },
    ];
    const userTxs = [
      { from: USER, to: VAULT, data: "0x11" as Hex },
      { from: USER, to: VAULT, data: "0x22" as Hex },
    ];
    const result = buildSimulationTxs(
      makeParams({ authorizations: auths, transactions: userTxs }),
    );

    expect(result).toHaveLength(4);
    // Auths prepended in order, user txs follow
    expect(result[0]!.to).toBe(USDC); // auth 1
    expect(result[1]!.data).toBe("0xdeadbeef" as Hex); // auth 2 (approval, passed through)
    expect(result[2]!.data).toBe("0x11" as Hex); // user tx 1
    expect(result[3]!.data).toBe("0x22" as Hex); // user tx 2
  });

  it("uses the first user transaction sender for signature auths", () => {
    const OTHER_USER: Address = "0x4444444444444444444444444444444444444444";
    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: SPENDER },
    ];
    const result = buildSimulationTxs(
      makeParams({
        transactions: [{ from: OTHER_USER, to: VAULT, data: "0x12" as Hex }],
        authorizations: auths,
      }),
    );

    expect(result[0]!.from).toBe(OTHER_USER);
  });

  it("rejects approval-type auth whose `from` does not match the user sender (defense-in-depth)", () => {
    const DIFFERENT_SENDER: Address =
      "0x5555555555555555555555555555555555555555";
    const auths: SimulationAuthorization[] = [
      {
        type: "approval",
        transaction: {
          from: DIFFERENT_SENDER,
          to: USDC,
          data: "0xabcdef" as Hex,
          value: 0n,
        },
      },
    ];
    expect(() =>
      buildSimulationTxs(makeParams({ authorizations: auths })),
    ).toThrow(SimulationValidationError);
  });

  it("accepts approval-type auth whose `from` matches the user sender after case normalization", () => {
    // User sender is checksummed; approval tx sender is lowercase — same
    // address, different string form. Must be accepted.
    const userChecksum: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const approvalLower = userChecksum.toLowerCase() as Address;
    const auths: SimulationAuthorization[] = [
      {
        type: "approval",
        transaction: {
          from: approvalLower,
          to: VAULT,
          data: "0xab" as Hex,
          value: 0n,
        },
      },
    ];
    const result = buildSimulationTxs(
      makeParams({
        transactions: [{ from: userChecksum, to: VAULT, data: "0x12" as Hex }],
        authorizations: auths,
      }),
    );
    expect(result).toHaveLength(2);
  });
});
