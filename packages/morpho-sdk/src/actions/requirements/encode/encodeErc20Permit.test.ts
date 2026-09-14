import { addressesRegistry } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { type Address, isHex, maxUint256, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { signTypedData } from "viem/actions";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, vi } from "vitest";
import { test } from "../../../../test/unit.js";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InvalidSignatureError,
  NonPositiveInputError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../../types/index.js";
import { encodeErc20Permit } from "./encodeErc20Permit.js";

describe("encodeErc20Permit", () => {
  const {
    usdc,
    bundler3: { generalAdapter1 },
  } = addressesRegistry[mainnet.id];

  const mockAmount = 1000000n;
  const mockNonce = 0n;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("sign", () => {
    test("should throw ChainIdMismatchError when client chain does not match", async ({
      client,
    }) => {
      await expect(
        encodeErc20Permit(client, {
          token: usdc,
          owner: client.account.address,
          spender: generalAdapter1,
          amount: mockAmount,
          chainId: mainnet.id + 1,
          nonce: mockNonce,
        }),
      ).rejects.toThrow(ChainIdMismatchError);
    });

    test("should throw UnsupportedErc20ApprovalSpenderError when spender is not supported", async ({
      client,
    }) => {
      const spender = "0x0000000000000000000000000000000000000001" as Address;

      await expect(
        encodeErc20Permit(client, {
          token: usdc,
          owner: client.account.address,
          spender,
          amount: mockAmount,
          chainId: mainnet.id,
          nonce: mockNonce,
        }),
      ).rejects.toThrow(UnsupportedErc20ApprovalSpenderError);
    });

    test("should throw NonPositiveInputError when explicit deadline is not positive", async ({
      client,
    }) => {
      await expect(
        encodeErc20Permit(client, {
          token: usdc,
          owner: client.account.address,
          spender: generalAdapter1,
          amount: mockAmount,
          chainId: mainnet.id,
          nonce: mockNonce,
          deadline: 0n,
        }),
      ).rejects.toThrow(NonPositiveInputError);
    });

    test("should throw InputExceedsMaxError when explicit deadline exceeds uint256", async ({
      client,
    }) => {
      await expect(
        encodeErc20Permit(client, {
          token: usdc,
          owner: client.account.address,
          spender: generalAdapter1,
          amount: mockAmount,
          chainId: mainnet.id,
          nonce: mockNonce,
          deadline: maxUint256 + 1n,
        }),
      ).rejects.toThrow(InputExceedsMaxError);
    });

    test("should throw ExpiredDeadlineError when explicit deadline is already elapsed", async ({
      client,
    }) => {
      await expect(
        encodeErc20Permit(client, {
          token: usdc,
          owner: client.account.address,
          spender: generalAdapter1,
          amount: mockAmount,
          chainId: mainnet.id,
          nonce: mockNonce,
          deadline: 1n,
        }),
      ).rejects.toThrow(ExpiredDeadlineError);
    });

    test("should sign permit for non-DAI token", async ({ client }) => {
      const userAddress = client.account.address;

      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
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
    }) => {
      const differentAddress =
        "0x0000000000000000000000000000000000000001" as Address;

      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      await expect(
        permit.sign(client, differentAddress),
      ).rejects.toBeInstanceOf(AddressMismatchError);
    });

    test("should throw InvalidSignatureError when signature verification fails", async ({
      client,
    }) => {
      const userAddress = client.account.address;
      const wrongSigner = privateKeyToAccount(
        "0x0000000000000000000000000000000000000000000000000000000000000002",
      );
      const invalidSignatureClient = {
        ...client,
        account: {
          ...wrongSigner,
          address: userAddress,
        },
      };
      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      await expect(
        permit.sign(invalidSignatureClient, userAddress),
      ).rejects.toThrow(InvalidSignatureError);
    });

    test("should return all expected properties in signature args", async ({
      client,
    }) => {
      const userAddress = client.account.address;

      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
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
    }) => {
      const userAddress = client.account.address;
      const now = Time.timestamp();

      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
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

    test("should have correct action structure", async ({ client }) => {
      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
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

  describe("action.typedData", () => {
    test("default", async ({ client }) => {
      const userAddress = client.account.address;
      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      const typedData = permit.action.typedData;

      expect(typedData.primaryType).toBe("Permit");
      expect(typedData.domain).toMatchObject({
        chainId: mainnet.id,
        verifyingContract: usdc,
      });
      expect(typedData.message).toMatchObject({
        owner: userAddress,
        spender: generalAdapter1,
        value: mockAmount,
        nonce: mockNonce,
      });
      expect(Object.isFrozen(typedData)).toBe(true);
      expect(Object.isFrozen(typedData.message)).toBe(true);
      expect(Object.isFrozen(typedData.domain)).toBe(true);
    });

    test("behavior: signing action.typedData externally matches sign()", async ({
      client,
    }) => {
      const userAddress = client.account.address;
      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      const typedData = permit.action.typedData;
      const externalSignature = await signTypedData(client, {
        ...typedData,
        account: client.account,
      });
      const signed = await permit.sign(client, userAddress);

      expect(externalSignature).toEqual(signed.args.signature);
      expect(
        await verifyTypedData({
          ...typedData,
          address: userAddress,
          signature: externalSignature,
        }),
      ).toBe(true);
    });
  });

  describe("withSignature", () => {
    test("default", async ({ client }) => {
      const userAddress = client.account.address;
      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: userAddress,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });
      const signature = await signTypedData(client, {
        ...permit.action.typedData,
        account: client.account,
      });

      const external = await permit.withSignature(signature, userAddress);
      const signed = await permit.sign(client, userAddress);

      expect(external).toEqual(signed);
      expect(external.action).toBe(permit.action);
      expect(Object.isFrozen(external)).toBe(true);
      expect(Object.isFrozen(external.args)).toBe(true);
    });

    test("error: AddressMismatchError when signer is not the owner", async ({
      client,
    }) => {
      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });
      const signature = await signTypedData(client, {
        ...permit.action.typedData,
        account: client.account,
      });

      await expect(
        permit.withSignature(
          signature,
          "0x0000000000000000000000000000000000000001",
        ),
      ).rejects.toBeInstanceOf(AddressMismatchError);
    });

    test("error: InvalidSignatureError when signature does not recover owner", async ({
      client,
    }) => {
      const userAddress = client.account.address;
      const wrongSigner = privateKeyToAccount(
        "0x0000000000000000000000000000000000000000000000000000000000000002",
      );
      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: userAddress,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });
      const signature = await wrongSigner.signTypedData(
        permit.action.typedData,
      );

      await expect(
        permit.withSignature(signature, userAddress),
      ).rejects.toBeInstanceOf(InvalidSignatureError);
    });
  });
});
