import {
  ChainId,
  getChainAddresses,
  UnknownAddressError,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import { hashTypedData, type TypedData } from "viem";
import { describe, expect, test } from "vitest";
import {
  getPermit2PermitTypedData,
  getPermit2TransferFromTypedData,
} from "./permit2.js";

const owner = "0x1111111111111111111111111111111111111111";
const spender = "0x2222222222222222222222222222222222222222";

test("getPermit2PermitTypedData isolates nested signing types between calls", () => {
  const build = () =>
    getPermit2PermitTypedData(
      { erc20: owner, spender, allowance: 1n, nonce: 0, deadline: 1n },
      ChainId.EthMainnet,
    );
  const control = build();
  const pristineTypes = structuredClone(control.types);
  const pristineHash = hashTypedData(control);
  const a = build();
  a.types.PermitDetails[1]!.name = "nonce";
  a.types.PermitDetails.reverse();
  a.types.PermitSingle.reverse();
  const b = build();

  expect(b.types).toEqual(pristineTypes);
  expect.soft(hashTypedData(b)).toBe(pristineHash);
  expect.soft(a.types).not.toBe(b.types);
});

test("getPermit2TransferFromTypedData isolates nested signing types between calls", () => {
  const build = () =>
    getPermit2TransferFromTypedData(
      { erc20: owner, spender, allowance: 1n, nonce: 0n, deadline: 1n },
      ChainId.EthMainnet,
    );
  const control = build();
  const pristineTypes = structuredClone(control.types);
  const pristineHash = hashTypedData(control);
  const a = build();
  a.types.TokenPermissions[1]!.type = "uint160";
  a.types.TokenPermissions.reverse();
  a.types.PermitTransferFrom.reverse();
  const b = build();

  expect(b.types).toEqual(pristineTypes);
  expect.soft(hashTypedData(b)).toBe(pristineHash);
  expect.soft(a.types).not.toBe(b.types);
});
const args = {
  erc20: "0x1111111111111111111111111111111111111111",
  spender: "0x2222222222222222222222222222222222222222",
  allowance: 1n,
  nonce: 0n,
  deadline: 1n,
} as const;

describe.each([
  {
    name: "getPermit2PermitTypedData",
    hash: "0x1650f2e069210d16e852412116a981e847a5d70ef6cb7ac01b15c1aa2ef9732b",
    build: (chainId: ChainId) =>
      getPermit2PermitTypedData({ ...args, nonce: 0 }, chainId),
  },
  {
    name: "getPermit2TransferFromTypedData",
    hash: "0xa4f057ccdcb148f6f05d09b842c5ce64cc08c1cf5f5a34adafd365489b99f0c0",
    build: (chainId: ChainId) => getPermit2TransferFromTypedData(args, chainId),
  },
])("$name", ({ hash, build }) => {
  test("rejects a registered chain without Permit2", () => {
    expect(
      getChainAddresses(ChainId.WorldChainMainnet).permit2,
    ).toBeUndefined();
    expect(() => build(ChainId.WorldChainMainnet)).toThrow(UnknownAddressError);
  });

  test("rejects an unregistered chain", () => {
    expect(() => build(999_999_999 as ChainId)).toThrow(
      UnsupportedChainIdError,
    );
  });

  test("preserves the supported-chain verifier and signing hash", () => {
    const typedData = build(ChainId.EthMainnet);
    expect(typedData.domain?.verifyingContract).toBe(
      "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    );
    expect(hashTypedData<TypedData, string>(typedData)).toBe(hash);
  });
});
