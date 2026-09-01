import { getAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  AmbiguousRequirementSignaturesError,
  type BlueBundlesV1TokenRequirementSignature,
} from "../../types/index.js";
import { selectBlueBundlesV1RequirementSignatures } from "./common.js";

const owner = getAddress("0x00000000000000000000000000000000000000a1");
const spender = getAddress("0x00000000000000000000000000000000000000b1");
const asset = getAddress("0x0000000000000000000000000000000000000011");

const permit = {
  args: {
    owner,
    nonce: 1n,
    asset,
    signature: "0x1234",
    amount: 5n,
    deadline: 123n,
  },
  action: { type: "permit", args: { spender, amount: 5n, deadline: 123n } },
} satisfies BlueBundlesV1TokenRequirementSignature;

const permit2TransferFrom = {
  args: {
    owner,
    nonce: 2n,
    asset,
    signature: "0x5678",
    amount: 5n,
    deadline: 123n,
  },
  action: {
    type: "permit2TransferFrom",
    args: { spender, amount: 5n, deadline: 123n },
  },
} satisfies BlueBundlesV1TokenRequirementSignature;

describe("selectBlueBundlesV1RequirementSignatures", () => {
  test("default: returns the single accepted token signature", () => {
    const selected = selectBlueBundlesV1RequirementSignatures([permit], {
      token: true,
    });
    expect(selected.token).toBe(permit);
  });

  test("error: AmbiguousRequirementSignaturesError when both a permit and a permit2TransferFrom target the single token slot", () => {
    // The single BlueBundlesV1 permit slot can carry one token signature; two competing ones would
    // otherwise silently drop one and mis-fund the bundle, so the selector must reject them.
    expect(() =>
      selectBlueBundlesV1RequirementSignatures([permit, permit2TransferFrom], {
        token: true,
      }),
    ).toThrow(AmbiguousRequirementSignaturesError);
  });
});
