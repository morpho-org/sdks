import type { Address, Hex } from "viem";
import { describe, expect, test } from "vitest";
import type { AuthorizationRequirementSignature } from "../../types/index.js";
import { getAuthorizationAction } from "./getAuthorizationAction.js";

const OWNER: Address = "0x1111111111111111111111111111111111111111";
const AUTHORIZED: Address = "0x2222222222222222222222222222222222222222";
const SIGNATURE: Hex = `0x${"ab".repeat(65)}`;

const signature: AuthorizationRequirementSignature = {
  action: {
    type: "authorization",
    args: {
      authorized: AUTHORIZED,
      isAuthorized: true,
      deadline: 1_900_000_000n,
    },
  },
  args: {
    owner: OWNER,
    authorized: AUTHORIZED,
    isAuthorized: true,
    nonce: 7n,
    deadline: 1_900_000_000n,
    signature: SIGNATURE,
  },
};

describe("getAuthorizationAction", () => {
  test("default", () => {
    const action = getAuthorizationAction(signature);

    expect(action.type).toBe("morphoSetAuthorizationWithSig");
    expect(action.args).toEqual([
      {
        authorizer: OWNER,
        authorized: AUTHORIZED,
        isAuthorized: true,
        nonce: 7n,
        deadline: 1_900_000_000n,
      },
      SIGNATURE,
      false,
    ]);
  });

  test("behavior: maps owner to authorizer and forwards the raw signature", () => {
    const action = getAuthorizationAction(signature);
    if (action.type !== "morphoSetAuthorizationWithSig") {
      throw new Error("expected a morphoSetAuthorizationWithSig action");
    }
    const [authorization, sig] = action.args;

    // The bundler `Authorization` struct carries `authorizer`, not `owner`.
    expect(authorization).not.toHaveProperty("owner");
    expect(authorization.authorizer).toBe(OWNER);
    expect(sig).toBe(SIGNATURE);
  });
});
