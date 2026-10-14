import { fc, test } from "@fast-check/vitest";
import { encodeAbiParameters, getAddress, keccak256 } from "viem";
import { expect } from "vitest";
import { VaultV2Utils } from "./VaultV2Utils.js";

const address = fc
  .uint8Array({ minLength: 20, maxLength: 20 })
  .map((bytes) => `0x${Buffer.from(bytes).toString("hex")}` as const);
const anyCaseAddress = fc.oneof(address, address.map(getAddress));

function taggedId(tag: string, value: `0x${string}`) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }],
      [tag, value],
    ),
  );
}

test.prop([anyCaseAddress])(
  "invariant: adapterCapId matches abi.encode(string,address)",
  (adapter) => {
    expect(VaultV2Utils.adapterCapId(adapter)).toBe(taggedId("this", adapter));
  },
);

test.prop([anyCaseAddress])(
  "invariant: collateralCapId matches abi.encode(string,address)",
  (token) => {
    expect(VaultV2Utils.collateralCapId(token)).toBe(
      taggedId("collateralToken", token),
    );
  },
);
