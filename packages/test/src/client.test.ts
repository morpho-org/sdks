import { http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { createAnvilTestClient } from "./client.js";

describe("createAnvilTestClient", () => {
  test("polls receipts faster than viem's default interval", () => {
    const client = createAnvilTestClient(http("http://127.0.0.1:0"), mainnet);

    expect(client.pollingInterval).toBe(50);
  });
});
