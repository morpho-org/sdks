import { addressesRegistry } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  type AuthorizationRequirementSignature,
  BundlerErrors,
} from "../../types/index.js";
import { getAuthorizationAction } from "./getAuthorizationAction.js";

const OWNER: Address = "0x1111111111111111111111111111111111111111";
const {
  bundler3: { generalAdapter1 },
} = addressesRegistry[mainnet.id];
const SIGNATURE: Hex = `0x${"ab".repeat(65)}`;

const signature: AuthorizationRequirementSignature = {
  action: {
    type: "authorization",
    args: {
      authorized: generalAdapter1,
      isAuthorized: true,
      deadline: 1_900_000_000n,
    },
  },
  args: {
    owner: OWNER,
    authorized: generalAdapter1,
    isAuthorized: true,
    nonce: 7n,
    deadline: 1_900_000_000n,
    signature: SIGNATURE,
  },
};

describe("getAuthorizationAction", () => {
  test("default", () => {
    const action = getAuthorizationAction(mainnet.id, signature);

    expect(action.type).toBe("morphoSetAuthorizationWithSig");
    expect(action.args).toEqual([
      {
        authorizer: OWNER,
        authorized: generalAdapter1,
        isAuthorized: true,
        nonce: 7n,
        deadline: 1_900_000_000n,
      },
      SIGNATURE,
      false,
    ]);
  });

  test("behavior: maps owner to authorizer and forwards the raw signature", () => {
    const action = getAuthorizationAction(mainnet.id, signature);
    if (action.type !== "morphoSetAuthorizationWithSig") {
      throw new Error("expected a morphoSetAuthorizationWithSig action");
    }
    const [authorization, sig] = action.args;

    // The bundler `Authorization` struct carries `authorizer`, not `owner`.
    expect(authorization).not.toHaveProperty("owner");
    expect(authorization.authorizer).toBe(OWNER);
    expect(sig).toBe(SIGNATURE);
  });

  test("error: UnexpectedSignature when authorized is not GeneralAdapter1", () => {
    const rogue: Address = "0x2222222222222222222222222222222222222222";
    const rogueSignature: AuthorizationRequirementSignature = {
      action: {
        ...signature.action,
        args: { ...signature.action.args, authorized: rogue },
      },
      args: { ...signature.args, authorized: rogue },
    };

    expect(() => getAuthorizationAction(mainnet.id, rogueSignature)).toThrow(
      BundlerErrors.UnexpectedSignature,
    );
  });

  test("error: UnexpectedAuthorizationRevocation when signature revokes", () => {
    const revocation: AuthorizationRequirementSignature = {
      action: {
        ...signature.action,
        args: { ...signature.action.args, isAuthorized: false },
      },
      args: { ...signature.args, isAuthorized: false },
    };

    expect(() => getAuthorizationAction(mainnet.id, revocation)).toThrow(
      BundlerErrors.UnexpectedAuthorizationRevocation,
    );
  });
});
