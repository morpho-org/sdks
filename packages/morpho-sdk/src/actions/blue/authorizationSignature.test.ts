import { getChainAddresses } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { type Address, decodeFunctionData, type Hex, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { WethUsdsBlue } from "../../../test/fixtures/blue.js";
import { bundler3Abi } from "../../abis.js";
import type { AuthorizationRequirementSignature } from "../../types/index.js";
import { blueBorrow } from "./borrow.js";
import { blueWithdraw } from "./withdraw.js";

const USER: Address = "0x1111111111111111111111111111111111111111";

const { morpho } = getChainAddresses(mainnet.id);
const { generalAdapter1 } = getChainAddresses(mainnet.id).bundler3;

const authorizationSignature: AuthorizationRequirementSignature = {
  action: {
    type: "authorization",
    args: {
      authorized: generalAdapter1,
      isAuthorized: true,
      deadline: 1_900_000_000n,
    },
  },
  args: {
    owner: USER,
    authorized: generalAdapter1,
    isAuthorized: true,
    nonce: 0n,
    deadline: 1_900_000_000n,
    // 32-byte r + 32-byte s + valid v (0x1b = 27).
    signature: `0x${"11".repeat(32)}${"22".repeat(32)}1b` as Hex,
  },
};

/** Decodes the bundler3 `multicall` calldata into its ordered inner calls. */
function decodeBundle(data: Hex) {
  const decoded = decodeFunctionData({ abi: bundler3Abi, data });
  expect(decoded.functionName).toBe("multicall");
  return decoded.args[0] as readonly { to: Address; data: Hex }[];
}

describe("authorization signature wiring", () => {
  test("blueBorrow prepends setAuthorizationWithSig when a signature is provided", () => {
    const tx = blueBorrow({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount: parseUnits("100", 18),
        receiver: USER,
        minSharePrice: 0n,
        authorizationSignature,
      },
    });

    const calls = decodeBundle(tx.data);
    expect(calls[0]!.to).toBe(morpho);
    const inner = decodeFunctionData({ abi: blueAbi, data: calls[0]!.data });
    expect(inner.functionName).toBe("setAuthorizationWithSig");
  });

  test("behavior: blueWithdraw omits the authorization call when no signature is provided", () => {
    const tx = blueWithdraw({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        assets: parseUnits("100", 18),
        shares: 0n,
        receiver: USER,
        minSharePrice: 0n,
      },
    });

    const calls = decodeBundle(tx.data);
    for (const call of calls) {
      if (call.to !== morpho) continue;
      const inner = decodeFunctionData({ abi: blueAbi, data: call.data });
      expect(inner.functionName).not.toBe("setAuthorizationWithSig");
    }
  });

  test("behavior: blueWithdraw prepends the authorization call before morphoWithdraw", () => {
    const tx = blueWithdraw({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        assets: parseUnits("100", 18),
        shares: 0n,
        receiver: USER,
        minSharePrice: 0n,
        authorizationSignature,
      },
    });

    const calls = decodeBundle(tx.data);
    const inner = decodeFunctionData({ abi: blueAbi, data: calls[0]!.data });
    expect(calls[0]!.to).toBe(morpho);
    expect(inner.functionName).toBe("setAuthorizationWithSig");
  });
});
