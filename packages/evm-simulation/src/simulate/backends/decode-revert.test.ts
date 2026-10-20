import * as pinnedAbis from "@morpho-org/morpho-sdk/abis";
import {
  type Abi,
  encodeErrorResult,
  type Hex,
  parseAbi,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import { formatAbiItem } from "viem/utils";
import { describe, expect, test } from "vitest";
import { formatRevert, REVERT_ERRORS_ABI } from "./decode-revert.js";

const custom = (signature: string, args: readonly unknown[] = []): Hex => {
  const abi: Abi = parseAbi([signature]);
  const errorName = signature.slice("error ".length, signature.indexOf("("));
  return encodeErrorResult({ abi, errorName, args });
};

describe("formatRevert", () => {
  test.each([
    [
      custom("error ERC20InsufficientBalance(address,uint256,uint256)", [
        zeroAddress,
        1283n,
        2000n,
      ]),
      `ERC20InsufficientBalance(sender="${zeroAddress}", balance=1283, needed=2000)`,
    ],
    [
      custom("error ERC20InsufficientAllowance(address,uint256,uint256)", [
        zeroAddress,
        0n,
        2n ** 255n,
      ]),
      `ERC20InsufficientAllowance(spender="${zeroAddress}", allowance=0, needed=${2n ** 255n})`,
    ],
    [custom("error AllCapsReached()"), "AllCapsReached()"],
    [custom("error InvalidNonce()"), "InvalidNonce()"],
    [custom("error AdapterNotPartOfVault()"), "AdapterNotPartOfVault()"],
    [
      custom("error Error(string)", ["insufficient collateral"]),
      'Error(message="insufficient collateral")',
    ],
    [
      custom("error Error(string)", ['a "quoted" reason\nwith a newline']),
      'Error(message="a \\"quoted\\" reason\\nwith a newline")',
    ],
    [custom("error Panic(uint256)", [0x11n]), "Panic(reason=17)"],
  ] as const)("behavior: formats all arguments in %s", (data, message) => {
    expect(formatRevert(data)).toBe(message);
  });

  test.each([
    undefined,
    "0x",
    "0xdeadbeef",
    "0x1234",
    toFunctionSelector("ERC20InsufficientBalance(address,uint256,uint256)"),
  ] as const)(
    "behavior: undecodable data %s has no invented reason",
    (data) => {
      expect(formatRevert(data)).toBeUndefined();
    },
  );

  test("behavior: pinned definitions have unique signatures and selectors", () => {
    expect(
      new Set(REVERT_ERRORS_ABI.map((item) => formatAbiItem(item))).size,
    ).toBe(REVERT_ERRORS_ABI.length);
    expect(
      new Set(
        REVERT_ERRORS_ABI.map((item) =>
          toFunctionSelector(formatAbiItem(item)),
        ),
      ).size,
    ).toBe(REVERT_ERRORS_ABI.length);
  });

  test("behavior: decodes every error of every pinned morpho-sdk ABI", () => {
    const signatures = new Set(
      REVERT_ERRORS_ABI.map((item) => formatAbiItem(item)),
    );
    for (const value of Object.values(pinnedAbis)) {
      if (!Array.isArray(value)) continue;
      for (const item of value as Abi) {
        if (item.type === "error") {
          expect(signatures).toContain(formatAbiItem(item));
        }
      }
    }
  });
});
