import { addressesRegistry } from "@morpho-org/blue-sdk";
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
import { encodeErc20Permit } from "./encodeErc20Permit.js";

describe("encodeErc20Permit", () => {
  const {
    usdc,
    dai,
    bundler3: { generalAdapter1 },
  } = addressesRegistry[mainnet.id];

  const mockAmount = 1000000n;
  const mockNonce = 0n;

  describe("sign", () => {
    test("should sign permit for non-DAI token", async ({
      client,
      publicClient,
    }) => {
      const userAddress = client.account.address;

      const permit = await encodeErc20Permit(publicClient, {
        token: usdc,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      const signatureRequirement = await permit.sign(client, userAddress);

      expect(signatureRequirement.args.owner).toEqual(userAddress);
      expect(isHex(signatureRequirement.args.signature)).toBe(true);
      expect(signatureRequirement.args.signature.length).toBe(132);
    });

    test("should sign permit for DAI token", async ({
      client,
      publicClient,
    }) => {
      const userAddress = client.account.address;

      const permit = await encodeErc20Permit(publicClient, {
        token: dai,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      const signatureRequirement = await permit.sign(client, userAddress);

      expect(signatureRequirement.args.owner).toEqual(userAddress);
      expect(isHex(signatureRequirement.args.signature)).toBe(true);
      expect(signatureRequirement.args.signature.length).toBe(132);
    });

    test("should throw error if client account address does not match user address", async ({
      client,
      publicClient,
    }) => {
      const differentAddress =
        "0x0000000000000000000000000000000000000001" as Address;

      const permit = await encodeErc20Permit(publicClient, {
        token: usdc,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      await expect(permit.sign(client, differentAddress)).rejects.toThrow(
        new AddressMismatchError(client.account.address, differentAddress),
      );
    });

    test("should throw ChainIdMismatchError if wallet client is on wrong chain", async ({
      client,
      publicClient,
    }) => {
      const userAddress = client.account.address;

      const permit = await encodeErc20Permit(publicClient, {
        token: usdc,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      // Wallet client on a different chain than the permit was built for.
      // Reuses the Anvil transport so no real RPC is required — the
      // chainId guard fires before any signing.
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
      publicClient,
    }) => {
      const userAddress = client.account.address;

      const permit = await encodeErc20Permit(publicClient, {
        token: usdc,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
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
      publicClient,
    }) => {
      const userAddress = client.account.address;

      const permit = await encodeErc20Permit(publicClient, {
        token: usdc,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      const signatureRequirement = await permit.sign(client, userAddress);

      expect(signatureRequirement.args).toHaveProperty("owner");
      expect(signatureRequirement.args).toHaveProperty("signature");
      expect(signatureRequirement.args).toHaveProperty("deadline");
      expect(signatureRequirement.args).toHaveProperty("amount");
      expect(signatureRequirement.args).toHaveProperty("asset");
      expect(signatureRequirement.args).toHaveProperty("nonce");
      expect(signatureRequirement.args.owner).toEqual(userAddress);
      expect(signatureRequirement.args.amount).toEqual(mockAmount);
      expect(signatureRequirement.args.asset).toEqual(usdc);
      expect(signatureRequirement.args.nonce).toEqual(mockNonce);
    });

    test("should set deadline to approximately 2 hours in the future", async ({
      client,
      publicClient,
    }) => {
      const userAddress = client.account.address;
      const now = Time.timestamp();

      const permit = await encodeErc20Permit(publicClient, {
        token: usdc,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      const signatureRequirement = await permit.sign(client, userAddress);

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

    test("should have correct action structure", async ({ publicClient }) => {
      const permit = await encodeErc20Permit(publicClient, {
        token: usdc,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      expect(permit.action.type).toBe("permit");
      expect(permit.action.args).toHaveProperty("spender");
      expect(permit.action.args).toHaveProperty("amount");
      expect(permit.action.args).toHaveProperty("deadline");
      expect(permit.action.args.spender).toEqual(generalAdapter1);
      expect(permit.action.args.amount).toEqual(mockAmount);
    });
  });
});
