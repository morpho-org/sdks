import { encodeFunctionData, erc20Abi, maxUint256, zeroAddress } from "viem";
import { expect, it } from "vitest";
import { approval, decode, requireFee, uint } from "./checks.js";
import {
  CalldataAmountError,
  CalldataCallError,
  CalldataDecodeError,
  CalldataFeeError,
} from "./errors.js";
import type { CalldataCall } from "./types.js";

const token = "0x1000000000000000000000000000000000000001";
const spender = "0x2000000000000000000000000000000000000002";
const call = {
  id: "approval",
  kind: "approve",
  to: token,
  value: "0",
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, 1n],
  }),
} satisfies CalldataCall;

it.each([
  ["a number", 1],
  ["a hexadecimal string", "0x1"],
  ["above uint256", (maxUint256 + 1n).toString()],
] as const)("rejects %s as an unsigned decimal amount", (_label, value) => {
  expect(() => uint(value as string, { field: "value", call })).toThrow(
    expect.objectContaining({
      constructor: CalldataAmountError,
      field: "value",
    }),
  );
});

it.each(["0", 0.5, -1, 10_001])(
  "rejects invalid referral bps %j with a zero encoded fee",
  (bps) => {
    expect(() =>
      requireFee(
        { pct: 0n, recipient: spender },
        {
          call,
          intent: {
            max_fee_bps: 0,
            referral_fee: { bps: bps as number, recipient: spender },
          },
        },
      ),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataFeeError,
        field: "referral_fee.bps",
      }),
    );
  },
);

it("rejects ETH sent to a token approval", () => {
  expect(() => approval({ ...call, value: "1" }, { spender, token })).toThrow(
    expect.objectContaining({
      constructor: CalldataAmountError,
      field: "value",
    }),
  );
});

it("rejects a token transfer in place of an approval", () => {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [spender, 1n],
  });
  expect(() => approval({ ...call, data }, { spender, token })).toThrow(
    expect.objectContaining({
      constructor: CalldataCallError,
      field: "function",
    }),
  );
});

it("rejects trailing bytes only in nested calldata", () => {
  const withSuffix = { ...call, data: `${call.data}00` } as const;
  expect(decode(withSuffix, { abi: erc20Abi }).functionName).toBe("approve");
  const verify = () => decode(withSuffix, { abi: erc20Abi, nested: true });
  expect(verify).toThrow(
    expect.objectContaining({
      constructor: CalldataDecodeError,
      field: "data",
    }),
  );
  expect(verify).not.toThrow(
    expect.objectContaining({ cause: expect.any(CalldataDecodeError) }),
  );
});

it.each([
  ["an odd-length suffix", `${call.data}0`],
  ["a nonhex suffix", `${call.data}zz`],
  [
    "nonzero address padding",
    `0x${call.data.slice(2, 10)}01${call.data.slice(12)}`,
  ],
] as const)("rejects calldata with %s", (_label, data) => {
  expect(() => decode({ ...call, data }, { abi: erc20Abi })).toThrow(
    expect.objectContaining({
      constructor: CalldataDecodeError,
      field: "data",
    }),
  );
});

it("rejects an odd hex suffix even when the decoded arguments are unchanged", () => {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [zeroAddress, 0n],
  });
  expect(decode({ ...call, data }, { abi: erc20Abi }).args).toEqual([
    zeroAddress,
    0n,
  ]);
  expect(() =>
    decode({ ...call, data: `${data}0` }, { abi: erc20Abi }),
  ).toThrow(
    expect.objectContaining({
      constructor: CalldataDecodeError,
      field: "data",
    }),
  );
});
