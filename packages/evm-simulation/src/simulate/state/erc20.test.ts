import { type Address, encodeFunctionResult, erc20Abi, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { InvalidSimulationResponseError } from "../../errors.js";
import { encodeUint256 } from "../../test-helpers/index.js";
import { erc20Reads, parseErc20 } from "./erc20.js";
import { decodeStateRead } from "./read-state.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const SPENDER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);

const reads = erc20Reads({
  balances: [{ token: TOKEN, account: OWNER }],
  allowances: [{ token: TOKEN, owner: OWNER, spender: SPENDER }],
  nonces: [{ token: TOKEN, owner: OWNER }],
});

describe("erc20Reads + parseErc20", () => {
  test("emits one read per subject with stable ids", () => {
    expect(reads.map((r) => r.id)).toEqual([
      `erc20.balance:${TOKEN}:${OWNER}`,
      `erc20.allowance:${TOKEN}:${OWNER}:${SPENDER}`,
      `erc2612.nonce:${TOKEN}:${OWNER}`,
    ]);
    for (const read of reads) expect(read.to).toBe(TOKEN);
  });

  test("decodes into balances, allowances and nonces", () => {
    const decoded = [
      decodeStateRead(reads[0]!, encodeUint256(42n)),
      decodeStateRead(
        reads[1]!,
        encodeFunctionResult({
          abi: erc20Abi,
          functionName: "allowance",
          result: 7n,
        }),
      ),
      decodeStateRead(reads[2]!, encodeUint256(3n)),
    ];
    const parsed = parseErc20(decoded);
    expect(parsed.balances).toEqual([
      { account: OWNER, token: TOKEN, assets: 42n },
    ]);
    expect(parsed.allowances).toEqual([
      { owner: OWNER, token: TOKEN, spender: SPENDER, amount: 7n },
    ]);
    expect(parsed.nonces).toEqual([
      {
        type: "erc2612",
        verifyingContract: TOKEN,
        owner: OWNER,
        nonce: 3n,
      },
    ]);
  });

  test("error: undecodable return data throws", () => {
    expect(() => decodeStateRead(reads[0]!, "0x1234")).toThrow(
      InvalidSimulationResponseError,
    );
  });
});
