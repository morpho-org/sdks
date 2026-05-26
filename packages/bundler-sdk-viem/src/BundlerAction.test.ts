import { ChainId, getChainAddresses } from "@morpho-org/blue-sdk";
import { type Address, decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import { coreAdapterAbi } from "./abis.js";
import { BundlerAction } from "./BundlerAction.js";
import { BundlerErrors } from "./errors.js";
import type { Action } from "./types/index.js";

describe("BundlerAction address comparisons", () => {
  const chainId = ChainId.EthMainnet;
  const {
    bundler3: { bundler3, generalAdapter1 },
  } = getChainAddresses(chainId);

  const owner = "0x0000000000000000000000000000000000000001";
  const recipient = "0x0000000000000000000000000000000000000002";
  const lowerBundler3 = bundler3.toLowerCase() as Address;
  const lowerGeneralAdapter1 = generalAdapter1.toLowerCase() as Address;

  test("encodeBundle counts lowercased native-transfer registry recipients", () => {
    const actions: Action[] = [
      {
        type: "nativeTransfer",
        args: [owner, lowerBundler3, 5n, false],
      },
      {
        type: "nativeTransfer",
        args: [owner, lowerGeneralAdapter1, 7n, false],
      },
    ];

    expect(BundlerAction.encodeBundle(chainId, actions).value).toBe(12n);
  });

  test("nativeTransfer short-circuits lowercased Bundler3 recipients", () => {
    expect(
      BundlerAction.nativeTransfer(chainId, owner, lowerBundler3, 1n),
    ).toStrictEqual([]);
  });

  test("nativeTransfer treats lowercased GeneralAdapter1 owners as adapter transfers", () => {
    const calls = BundlerAction.nativeTransfer(
      chainId,
      lowerGeneralAdapter1,
      recipient,
      2n,
      true,
    );
    expect(calls).toHaveLength(1);

    const [call] = calls;
    if (call == null) throw new Error("Expected one BundlerCall");

    expect(call.to).toBe(generalAdapter1);
    expect(call.value).toBe(0n);
    expect(call.skipRevert).toBe(false);

    const decoded = decodeFunctionData({
      abi: coreAdapterAbi,
      data: call.data,
    });
    expect(decoded.functionName).toBe("nativeTransfer");
    expect(decoded.args).toEqual([recipient, 2n]);
  });

  test("morphoSetAuthorizationWithSig rejects lowercased Bundler3 authorizations", () => {
    expect(() =>
      BundlerAction.morphoSetAuthorizationWithSig(
        chainId,
        {
          authorizer: owner,
          authorized: lowerBundler3,
          isAuthorized: true,
          nonce: 0n,
          deadline: 1n,
        },
        "0x",
      ),
    ).toThrow(BundlerErrors.UnexpectedSignature);
  });
});
