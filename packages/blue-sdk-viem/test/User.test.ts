import { describe, expect } from "vitest";
import { test } from "./setup.js";

import { User } from "../src/augment/User.js";

describe("augment/User", () => {
  test("should fetch user data", async ({ client }) => {
    const expectedData = new User({
      address: client.account.address,
      isBundlerAuthorized: true,
      morphoNonce: 0n,
    });

    const value = await User.fetch(client.account.address, client);

    expect(value).to.eql(expectedData);
  });
});
