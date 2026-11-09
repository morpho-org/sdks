import { ChainId } from "@morpho-org/blue-sdk";
import { hashTypedData } from "viem";
import { expect, test } from "vitest";
import { getAuthorizationTypedData } from "./manager.js";

const owner = "0x1111111111111111111111111111111111111111";
const spender = "0x2222222222222222222222222222222222222222";

test("getAuthorizationTypedData isolates nested signing types between calls", () => {
  const build = () =>
    getAuthorizationTypedData(
      {
        authorizer: owner,
        authorized: spender,
        isAuthorized: true,
        nonce: 0n,
        deadline: 1n,
      },
      ChainId.EthMainnet,
    );
  const control = build();
  const pristineTypes = structuredClone(control.types);
  const pristineHash = hashTypedData(control);
  const a = build();
  a.types.Authorization[0]!.name = "authorized";
  a.types.Authorization.reverse();
  const b = build();

  expect(b.types).toEqual(pristineTypes);
  expect.soft(hashTypedData(b)).toBe(pristineHash);
  expect.soft(a.types).not.toBe(b.types);
});
