import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { type Address, decodeFunctionData, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { SimulationAuthorization } from "../authorizations.js";
import { prepareAuthorizations } from "./prepare.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const MORPHO: Address = getAddress(
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
);
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const SPENDER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);

const prepare = (authorizations: SimulationAuthorization[]) =>
  prepareAuthorizations({ authorizations, owner: OWNER, morpho: MORPHO });

describe("prepareAuthorizations", () => {
  test("erc20Approval → approve(spender, amount)", () => {
    const [preparation] = prepare([
      {
        type: "erc20Approval",
        token: TOKEN,
        owner: OWNER,
        spender: SPENDER,
        amount: 42n,
      },
    ]);
    expect(preparation?.authorizationIndex).toBe(0);
    expect(preparation?.calls).toHaveLength(1);
    const call = preparation!.calls[0]!;
    expect(call.to).toBe(TOKEN);
    expect(call.data.startsWith("0x095ea7b3")).toBe(true);
    expect(call.value).toBe(0n);
  });

  test("blueAuthorization → setAuthorization(authorized, true)", () => {
    const [preparation] = prepare([
      {
        type: "blueAuthorization",
        authorizer: OWNER,
        authorized: SPENDER,
        isAuthorized: true,
      },
    ]);
    const call = preparation!.calls[0]!;
    expect(call.to).toBe(MORPHO);
    expect(call.data.startsWith("0xeecea000")).toBe(true);
  });

  test("multiple authorizations keep their indices", () => {
    const preparations = prepare([
      {
        type: "erc20Approval",
        token: TOKEN,
        owner: OWNER,
        spender: SPENDER,
        amount: 1n,
      },
      {
        type: "blueAuthorization",
        authorizer: OWNER,
        authorized: SPENDER,
        isAuthorized: true,
      },
    ]);
    expect(preparations.map((p) => p.authorizationIndex)).toEqual([0, 1]);
  });
});

test("behavior: preparation preserves a requested Morpho revocation", () => {
  const [preparation] = prepare([
    {
      type: "blueAuthorization",
      authorizer: OWNER,
      authorized: SPENDER,
      isAuthorized: false,
    },
  ]);
  expect(
    decodeFunctionData({ abi: blueAbi, data: preparation!.calls[0]!.data }),
  ).toMatchObject({ functionName: "setAuthorization", args: [SPENDER, false] });
});
