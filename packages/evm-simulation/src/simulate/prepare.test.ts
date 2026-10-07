import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { type Address, decodeFunctionData, erc20Abi, getAddress } from "viem";
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
  prepareAuthorizations({
    chainId: 1,
    authorizations,
    owner: OWNER,
    morpho: MORPHO,
  });

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
    expect(call.chainId).toBe(1);
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

  test("erc2612Permit prepares approve using typed-data fields", () => {
    const typedData = {
      domain: { chainId: 1, verifyingContract: TOKEN },
      primaryType: "Permit" as const,
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      message: {
        owner: OWNER,
        spender: SPENDER,
        value: 42n,
        nonce: 3n,
        deadline: 100n,
      },
    };
    const call = prepare([{ type: "erc2612Permit", typedData }])[0]!.calls[0]!;
    expect(call.to).toBe(typedData.domain.verifyingContract);
    expect(
      decodeFunctionData({ abi: erc20Abi, data: call.data }),
    ).toMatchObject({
      functionName: "approve",
      args: [typedData.message.spender, typedData.message.value],
    });
  });

  test("permit2SignatureTransfer prepares approve using typed-data fields", () => {
    const typedData = {
      domain: { chainId: 1, verifyingContract: MORPHO },
      primaryType: "PermitTransferFrom" as const,
      types: {
        PermitTransferFrom: [
          { name: "permitted", type: "TokenPermissions" },
          { name: "spender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
        TokenPermissions: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
      message: {
        permitted: { token: TOKEN, amount: 43n },
        spender: SPENDER,
        nonce: 4n,
        deadline: 101n,
      },
    };
    const call = prepare([
      { type: "permit2SignatureTransfer", owner: OWNER, typedData },
    ])[0]!.calls[0]!;
    expect(call.to).toBe(typedData.message.permitted.token);
    expect(
      decodeFunctionData({ abi: erc20Abi, data: call.data }),
    ).toMatchObject({
      functionName: "approve",
      args: [typedData.message.spender, typedData.message.permitted.amount],
    });
  });

  test("blueAuthorizationSignature prepares setAuthorization using typed-data fields", () => {
    const typedData = {
      domain: { chainId: 1, verifyingContract: MORPHO },
      primaryType: "Authorization" as const,
      types: {
        Authorization: [
          { name: "authorizer", type: "address" },
          { name: "authorized", type: "address" },
          { name: "isAuthorized", type: "bool" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      message: {
        authorizer: OWNER,
        authorized: SPENDER,
        isAuthorized: false,
        nonce: 5n,
        deadline: 102n,
      },
    };
    const call = prepare([
      { type: "blueAuthorizationSignature", typedData },
    ])[0]!.calls[0]!;
    expect(call.to).toBe(MORPHO);
    expect(decodeFunctionData({ abi: blueAbi, data: call.data })).toMatchObject(
      {
        functionName: "setAuthorization",
        args: [typedData.message.authorized, typedData.message.isAuthorized],
      },
    );
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
