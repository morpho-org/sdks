import { describe, expect } from "vitest";
import { User } from "../src/augment/User.js";
import { test } from "./setup.js";

describe("augment/User", () => {
  test("should fetch user data", async ({ client }) => {
    const expectedData = new User({
      address: client.account.address,
      morphoNonce: 0n,
    });

    const value = await User.fetch(client.account.address, client);

    expect(value).toStrictEqual(expectedData);
  });
});
