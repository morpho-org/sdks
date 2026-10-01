import { permit2Abi } from "@morpho-org/morpho-sdk/abis";
import { type Address, encodeFunctionResult, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { parsePermit2, permit2Reads } from "./permit2.js";
import { decodeStateRead } from "./read-state.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const PERMIT2: Address = getAddress(
  "0x000000000022D473030F116dDEE9F6B43aC78BA3",
);

describe("permit2Reads + parsePermit2", () => {
  test("emits one word read per tracked nonce, deduped", () => {
    const reads = permit2Reads({
      permit2: PERMIT2,
      nonces: [
        { owner: OWNER, nonce: 5n },
        { owner: OWNER, nonce: 5n },
        { owner: OWNER, nonce: 300n },
      ],
    });
    expect(reads).toHaveLength(2);
    expect(reads[0]?.kind).toBe("permit2.nonceBitmap");
    expect(reads[1]?.id).toContain(":1:");
  });

  test("decodes the spent bit for the tracked nonce", () => {
    const [read] = permit2Reads({
      permit2: PERMIT2,
      nonces: [{ owner: OWNER, nonce: 5n }],
    });
    const bitmap = encodeFunctionResult({
      abi: permit2Abi,
      functionName: "nonceBitmap",
      result: 1n << 5n,
    });
    const decoded = parsePermit2([decodeStateRead(read!, bitmap)]);
    expect(decoded).toEqual([
      {
        type: "permit2",
        verifyingContract: PERMIT2,
        owner: OWNER,
        nonce: 5n,
        used: true,
      },
    ]);
  });
});
