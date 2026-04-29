import { describe, expect } from "vitest";
import { MorphoClient } from "../src/client/index.js";
import { test } from "./setup.js";

describe("MorphoClient", () => {
  test("should create a morpho client", ({ client }) => {
    const morpho = new MorphoClient(client);

    expect(morpho).toBeDefined();
    expect(morpho.viemClient).toBeDefined();
    expect(morpho.vaultV2).toBeDefined();
    expect(typeof morpho.vaultV2).toBe("function");
  });
});
