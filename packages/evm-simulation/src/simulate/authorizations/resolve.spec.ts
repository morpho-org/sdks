import {
  type Address,
  type Hex,
  decodeFunctionData,
  erc20Abi,
  maxUint256,
} from "viem";

import type { SimulationAuthorization } from "../../types.js";

import { resolveAuthorizations } from "./resolve.js";

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const DAI: Address = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const SENDER: Address = "0x1111111111111111111111111111111111111111";
const SPENDER: Address = "0x2222222222222222222222222222222222222222";
const VAULT: Address = "0x3333333333333333333333333333333333333333";

describe("resolveAuthorizations", () => {
  it("returns an empty array for an empty input", () => {
    expect(resolveAuthorizations([], SENDER)).toEqual([]);
  });

  it("passes approval-type transactions through by reference", () => {
    const approvalTx = {
      from: SENDER,
      to: USDC,
      data: "0xabcdef" as Hex,
      value: 0n,
    };
    const result = resolveAuthorizations(
      [{ type: "approval", transaction: approvalTx }],
      SENDER,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(approvalTx);
  });

  it("encodes a signature auth as approve(spender, maxUint256) by default", () => {
    const result = resolveAuthorizations(
      [{ type: "signature", token: USDC, spender: SPENDER }],
      SENDER,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.from).toBe(SENDER);
    expect(result[0]!.to).toBe(USDC);
    expect(result[0]!.value).toBe(0n);

    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: result[0]!.data,
    });
    expect(decoded.functionName).toBe("approve");
    expect(decoded.args[0]).toBe(SPENDER);
    expect(decoded.args[1]).toBe(maxUint256);
  });

  it("encodes a signature auth with an explicit amount when provided", () => {
    const result = resolveAuthorizations(
      [
        {
          type: "signature",
          token: USDC,
          spender: SPENDER,
          amount: 1_000_000n,
        },
      ],
      SENDER,
    );
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: result[0]!.data,
    });
    expect(decoded.args[1]).toBe(1_000_000n);
  });

  it("uses the passed-in sender as `from` for signature auths, regardless of other data", () => {
    const OTHER_SENDER: Address = "0x9999999999999999999999999999999999999999";
    const result = resolveAuthorizations(
      [{ type: "signature", token: USDC, spender: SPENDER }],
      OTHER_SENDER,
    );
    expect(result[0]!.from).toBe(OTHER_SENDER);
  });

  it("preserves order across mixed approval + signature entries", () => {
    const approvalTx = {
      from: SENDER,
      to: USDC,
      data: "0xabcdef" as Hex,
      value: 0n,
    };
    const auths: SimulationAuthorization[] = [
      { type: "approval", transaction: approvalTx },
      { type: "signature", token: DAI, spender: VAULT },
      { type: "approval", transaction: { ...approvalTx, data: "0x11" as Hex } },
    ];
    const result = resolveAuthorizations(auths, SENDER);

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(approvalTx);
    expect(result[1]!.to).toBe(DAI); // signature encoded to DAI
    expect(result[2]!.data).toBe("0x11" as Hex);
  });

  it("explicit amount of 0n is honored (not replaced by maxUint256)", () => {
    const result = resolveAuthorizations(
      [{ type: "signature", token: USDC, spender: SPENDER, amount: 0n }],
      SENDER,
    );
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: result[0]!.data,
    });
    // `amount ?? maxUint256` → 0n is not nullish, so stays 0n
    expect(decoded.args[1]).toBe(0n);
  });
});
