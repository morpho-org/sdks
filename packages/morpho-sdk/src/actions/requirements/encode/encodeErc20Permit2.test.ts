import { addressesRegistry, MathLib } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { type Address, createWalletClient, custom, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, optimism } from "viem/chains";
import { describe, expect } from "vitest";
import { test } from "../../../../test/setup.js";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  MissingClientPropertyError,
} from "../../../types/index.js";
import { encodeErc20Permit2 } from "./encodeErc20Permit2.js";

describe("encodeErc20Permit2", () => {
  const {
    usdc,
    bundler3: { generalAdapter1 },
  } = addressesRegistry[mainnet.id];

  const mockAmount = 1000000n;
  const mockNonce = 0n;
  const mockExpiration = MathLib.MAX_UINT_48;

  describe("sign", () => {
    test("should sign permit2 for token", async ({ client }) => {
      const userAddress = client.account.address;

      const permit = encodeErc20Permit2({
        token: usdc,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
        expiration: mockExpiration,
      });

      const signatureRequirement = await permit.sign(client, userAddress);

      expect(signatureRequirement.args.owner).toEqual(userAddress);
      expect(isHex(signatureRequirement.args.signature)).toBe(true);
      expect(signatureRequirement.args.signature.length).toBe(132);
    });

    test("should throw error if client account address does not match user address", async ({
      client,
    }) => {
      const differentAddress: Address =
        "0x0000000000000000000000000000000000000001";

      const permit = encodeErc20Permit2({
        token: usdc,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
        expiration: mockExpiration,
      });

      await expect(permit.sign(client, differentAddress)).rejects.toThrow(
        new AddressMismatchError(client.account.address, differentAddress),
      );
    });

    test("should throw ChainIdMismatchError if wallet client is on wrong chain", async ({
      client,
    }) => {
      const userAddress = client.account.address;

      const permit = encodeErc20Permit2({
        token: usdc,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
        expiration: mockExpiration,
      });

      // Wallet client on a different chain than the permit was built for.
      // The chainId guard fires before any signing, pinning the permit's
      // chain-binding security property.
      const walletClientOnWrongChain = createWalletClient({
        account: privateKeyToAccount(
          "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        ),
        chain: optimism,
        transport: custom({ request: client.request }),
      });

      await expect(
        permit.sign(walletClientOnWrongChain, userAddress),
      ).rejects.toBeInstanceOf(ChainIdMismatchError);
    });

    test("should throw MissingClientPropertyError if wallet client has no account", async ({
      client,
    }) => {
      const userAddress = client.account.address;

      const permit = encodeErc20Permit2({
        token: usdc,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
        expiration: mockExpiration,
      });

      const walletClientWithoutAccount = createWalletClient({
        chain: mainnet,
        transport: custom({ request: client.request }),
      });

      await expect(
        permit.sign(walletClientWithoutAccount, userAddress),
      ).rejects.toBeInstanceOf(MissingClientPropertyError);
    });

    test("should return all expected properties in signature args", async ({
      client,
    }) => {
      const permit = encodeErc20Permit2({
        token: usdc,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
        expiration: mockExpiration,
      });

      const signatureRequirement = await permit.sign(
        client,
        client.account.address,
      );

      expect(signatureRequirement.args).toHaveProperty("owner");
      expect(signatureRequirement.args).toHaveProperty("signature");
      expect(signatureRequirement.args).toHaveProperty("deadline");
      expect(signatureRequirement.args).toHaveProperty("amount");
      expect(signatureRequirement.args).toHaveProperty("asset");
      expect(signatureRequirement.args).toHaveProperty("nonce");
      expect(signatureRequirement.args).toHaveProperty("expiration");
      expect(signatureRequirement.args.owner).toEqual(client.account.address);
      expect(signatureRequirement.args.amount).toEqual(mockAmount);
      expect(signatureRequirement.args.asset).toEqual(usdc);
      expect(signatureRequirement.args.nonce).toEqual(mockNonce);

      if (!("expiration" in signatureRequirement.args)) {
        throw new Error("Expiration is not defined");
      }
      expect(signatureRequirement.args.expiration).toEqual(mockExpiration);
    });

    test("should set deadline to approximately 2 hours in the future", async ({
      client,
    }) => {
      const now = Time.timestamp();

      const permit = encodeErc20Permit2({
        token: usdc,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
        expiration: mockExpiration,
      });

      const signatureRequirement = await permit.sign(
        client,
        client.account.address,
      );

      // Deadline should be approximately 2 hours (7200 seconds) in the future
      // Allow 5 seconds tolerance for test execution time
      const expectedDeadline = now + 7200n;
      const tolerance = 5n;

      expect(signatureRequirement.args.deadline).toBeGreaterThan(now);
      expect(signatureRequirement.args.deadline).toBeGreaterThanOrEqual(
        expectedDeadline - tolerance,
      );
      expect(signatureRequirement.args.deadline).toBeLessThanOrEqual(
        expectedDeadline + tolerance,
      );
    });

    test("should have correct action structure", async () => {
      const permit = encodeErc20Permit2({
        token: usdc,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
        expiration: mockExpiration,
      });

      if (permit.action.type !== "permit2") {
        throw new Error("Permit action type is not permit2");
      }

      expect(permit.action.type).toBe("permit2");
      expect(permit.action.args).toHaveProperty("spender");
      expect(permit.action.args).toHaveProperty("amount");
      expect(permit.action.args).toHaveProperty("deadline");
      expect(permit.action.args).toHaveProperty("expiration");
      expect(permit.action.args.spender).toEqual(generalAdapter1);
      expect(permit.action.args.amount).toEqual(mockAmount);
      expect(permit.action.args.expiration).toEqual(mockExpiration);
    });
  });
});
