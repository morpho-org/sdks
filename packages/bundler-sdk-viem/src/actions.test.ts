import { ChainId, getChainAddresses, User } from "@morpho-org/blue-sdk";
import { SimulationState } from "@morpho-org/simulation-sdk";
import { type Address, isAddressEqual } from "viem";
import { describe, expect, test } from "vitest";
import { encodeOperation } from "./actions.js";
import { BundlerErrors } from "./errors.js";

const chainId = ChainId.EthMainnet;
const {
  bundler3: { bundler3 },
} = getChainAddresses(chainId);

const owner = "0x0000000000000000000000000000000000000001";

const makeState = () =>
  new SimulationState({
    chainId,
    block: { number: 1n, timestamp: 1n },
    users: {
      [owner]: new User({
        address: owner,
        isBundlerAuthorized: false,
        morphoNonce: 0n,
      }),
    },
  });

describe("encodeOperation protected address comparisons", () => {
  test("rejects lowercase Bundler3 authorization before collecting a reusable signature", () => {
    const lowerBundler3 = bundler3.toLowerCase() as Address;

    expect(isAddressEqual(lowerBundler3, bundler3)).toBe(true);
    expect(lowerBundler3).not.toBe(bundler3);

    expect(() =>
      encodeOperation(
        {
          type: "Blue_SetAuthorization",
          sender: owner,
          args: { owner, authorized: lowerBundler3, isAuthorized: true },
        },
        makeState(),
      ),
    ).toThrow(BundlerErrors.UnexpectedSignature);
  });
});
