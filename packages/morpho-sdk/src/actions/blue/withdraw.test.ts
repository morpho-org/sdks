import { getChainAddresses } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { type Address, decodeFunctionData, type Hex, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { CbbtcUsdcBlue } from "../../../test/fixtures/blue.js";
import { test } from "../../../test/unit.js";
import { bundler3Abi } from "../../abis.js";
import {
  type AuthorizationRequirementSignature,
  MutuallyExclusiveWithdrawAmountsError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";
import { blueWithdraw } from "./withdraw.js";

describe("blueWithdraw unit tests", () => {
  const {
    bundler3: { bundler3 },
  } = getChainAddresses(mainnet.id);

  test("should create direct withdraw transaction by assets", async ({
    client,
  }) => {
    const assets = parseUnits("1000", 6);

    const tx = blueWithdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        assets,
        shares: 0n,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("blueWithdraw");
    expect(tx.action.args.market).toBe(CbbtcUsdcBlue.id);
    expect(tx.action.args.assets).toBe(assets);
    expect(tx.action.args.shares).toBe(0n);
    expect(tx.action.args.receiver).toBe(client.account.address);
    expect(tx.action.args.minSharePrice).toBe(0n);
    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
  });

  test("should create direct withdraw transaction by shares", async ({
    client,
  }) => {
    const shares = parseUnits("1000", 24); // share-side decimals are virtual

    const tx = blueWithdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        assets: 0n,
        shares,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
    });

    expect(tx.action.type).toBe("blueWithdraw");
    expect(tx.action.args.assets).toBe(0n);
    expect(tx.action.args.shares).toBe(shares);
    expect(tx.value).toBe(0n);
  });

  test("should support a receiver different from the signer", async () => {
    const receiver = "0x000000000000000000000000000000000000dEaD" as const;

    const tx = blueWithdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
        receiver,
        minSharePrice: 0n,
      },
    });

    expect(tx.action.args.receiver).toBe(receiver);
  });

  test("should throw NonPositiveInputError when both assets and shares are zero", async ({
    client,
  }) => {
    expect(() =>
      blueWithdraw({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
        args: {
          assets: 0n,
          shares: 0n,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("should throw NegativeInputError when assets is negative", async ({
    client,
  }) => {
    expect(() =>
      blueWithdraw({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
        args: {
          assets: -1n,
          shares: 0n,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("should throw NegativeInputError when shares is negative", async ({
    client,
  }) => {
    expect(() =>
      blueWithdraw({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
        args: {
          assets: 0n,
          shares: -1n,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("should throw MutuallyExclusiveWithdrawAmountsError when both assets and shares are non-zero", async ({
    client,
  }) => {
    expect(() =>
      blueWithdraw({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
        args: {
          assets: parseUnits("100", 6),
          shares: parseUnits("100", 24),
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(MutuallyExclusiveWithdrawAmountsError);
  });

  test("should throw MutuallyExclusiveWithdrawAmountsError on mixed-sign inputs (positive assets, negative shares)", async ({
    client,
  }) => {
    // A mixed-sign pair still expresses "both modes specified" — surface that
    // as the mode-conflict error rather than masking it as a positivity error.
    expect(() =>
      blueWithdraw({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
        args: {
          assets: parseUnits("100", 6),
          shares: -1n,
          receiver: client.account.address,
          minSharePrice: 0n,
        },
      }),
    ).toThrow(MutuallyExclusiveWithdrawAmountsError);
  });

  test("should throw NegativeInputError when minSharePrice is negative", async ({
    client,
  }) => {
    expect(() =>
      blueWithdraw({
        market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
        args: {
          assets: parseUnits("100", 6),
          shares: 0n,
          receiver: client.account.address,
          minSharePrice: -1n,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = blueWithdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });

  test("should append metadata to transaction data when provided", async ({
    client,
  }) => {
    const tx = blueWithdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.action.type).toBe("blueWithdraw");
    expect(tx.data.includes("a1b2c3d4")).toBe(true);
  });
});

// `withdraw` still routes through the v5 GeneralAdapter1/Bundler3 path in this PR (it migrates to
// BlueBundlesV1 in PR 2), so its `setAuthorizationWithSig` wiring is live and must stay covered.
describe("blueWithdraw authorization-signature wiring", () => {
  const USER: Address = "0x1111111111111111111111111111111111111111";
  const addresses = getChainAddresses(mainnet.id);
  const { morpho } = addresses;
  const { generalAdapter1 } = addresses.bundler3;

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
  const decodeBundle = (data: Hex) => {
    const decoded = decodeFunctionData({ abi: bundler3Abi, data });
    expect(decoded.functionName).toBe("multicall");
    return decoded.args[0] as readonly { to: Address; data: Hex }[];
  };

  test("behavior: prepends setAuthorizationWithSig before morphoWithdraw when a signature is provided", () => {
    const tx = blueWithdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
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

  test("behavior: omits the authorization call when no signature is provided", () => {
    const tx = blueWithdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        assets: parseUnits("100", 6),
        shares: 0n,
        receiver: USER,
        minSharePrice: 0n,
      },
    });

    for (const call of decodeBundle(tx.data)) {
      if (call.to !== morpho) continue;
      const inner = decodeFunctionData({ abi: blueAbi, data: call.data });
      expect(inner.functionName).not.toBe("setAuthorizationWithSig");
    }
  });
});
