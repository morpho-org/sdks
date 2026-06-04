import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";

import { addresses } from "../__test__/fixtures.js";
import { midnightAbi } from "../abis.js";
import { planAuthorizationRequirement } from "./authorization.js";

describe("planAuthorizationRequirement", () => {
  test("default", () => {
    const requirement = planAuthorizationRequirement({
      midnight: addresses.midnight,
      authorizer: addresses.taker,
      authorized: addresses.midnightBundles,
      isAuthorized: false,
    });

    expect(requirement).toMatchObject({
      type: "authorization",
      authorizer: addresses.taker,
      authorized: addresses.midnightBundles,
      isAuthorized: false,
      call: { to: addresses.midnight },
    });

    const decoded = decodeFunctionData({
      abi: midnightAbi,
      data: requirement!.call.data,
    });

    expect(decoded.functionName).toMatchInlineSnapshot(`"setIsAuthorized"`);
    expect(decoded.args[0]).toBe(addresses.midnightBundles);
    expect(decoded.args[1]).toBe(true);
    expect(decoded.args[2]).toBe(addresses.taker);
  });

  test("behavior: skips satisfied authorization", () => {
    const requirement = planAuthorizationRequirement({
      midnight: addresses.midnight,
      authorizer: addresses.taker,
      authorized: addresses.midnightBundles,
      isAuthorized: true,
    });

    expect(requirement).toBeUndefined();
  });
});
