import { describe, expect, test } from "vitest";
import { VAULT_ADDRESS } from "../__test__/fixtures.js";
import { Eip5267Domain } from "./Eip5267Domain.js";

describe("Eip5267Domain", () => {
  test("constructor stores raw domain fields", () => {
    const domain = new Eip5267Domain({
      fields: "0x00",
      name: "Morpho",
      version: "1",
      chainId: 1n,
      verifyingContract: VAULT_ADDRESS,
      salt: "0x1234",
      extensions: [5267n],
    });

    expect(domain.fields).toBe("0x00");
    expect(domain.name).toBe("Morpho");
    expect(domain.version).toBe("1");
    expect(domain.chainId).toBe(1n);
    expect(domain.verifyingContract).toBe(VAULT_ADDRESS);
    expect(domain.salt).toBe("0x1234");
    expect(domain.extensions).toStrictEqual([5267n]);
    expect(domain.eip712Domain).toStrictEqual({});
  });

  test("eip712Domain includes only fields enabled by the bitmap", () => {
    const domain = new Eip5267Domain({
      fields: "0x1f",
      name: "Morpho",
      version: "1",
      chainId: 1n,
      verifyingContract: VAULT_ADDRESS,
      salt: "0x1234",
      extensions: [],
    });

    expect(domain.eip712Domain).toStrictEqual({
      name: "Morpho",
      version: "1",
      chainId: 1,
      verifyingContract: VAULT_ADDRESS,
      salt: "0x1234",
    });
  });
});
