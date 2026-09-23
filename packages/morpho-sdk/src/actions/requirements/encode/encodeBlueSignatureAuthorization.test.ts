import { addressesRegistry } from "@morpho-org/blue-sdk";
import { getAuthorizationTypedData } from "@morpho-org/blue-sdk-viem";
import {
  ChainId,
  UnknownAddressError,
  UnsupportedChainIdError,
} from "@morpho-org/morpho-ts";
import {
  type Chain,
  createWalletClient,
  http,
  isHex,
  maxUint256,
  verifyTypedData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NonPositiveInputError,
  UnsupportedAuthorizationOperatorError,
} from "../../../types/index.js";
import { encodeBlueSignatureAuthorization } from "./encodeBlueSignatureAuthorization.js";

// Anvil account #0 — signing is local crypto, so no RPC is required.
const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

const blueBundlesV1 = addressesRegistry[mainnet.id].bundles?.blueBundlesV1;
if (blueBundlesV1 == null) throw new Error("BlueBundlesV1 is not registered");

function walletClient(chainId: number = mainnet.id) {
  const chain: Chain = { ...mainnet, id: chainId };
  return createWalletClient({ account, chain, transport: http() });
}

describe("encodeBlueSignatureAuthorization", () => {
  test("error: ChainIdMismatchError when client chain differs", async () => {
    await expect(
      encodeBlueSignatureAuthorization(walletClient(mainnet.id), {
        owner: account.address,
        authorized: blueBundlesV1,
        chainId: mainnet.id + 1,
        nonce: 0n,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });

  test("error: UnsupportedChainIdError on a chain with no registry", async () => {
    await expect(
      encodeBlueSignatureAuthorization(walletClient(999_999), {
        owner: account.address,
        authorized: blueBundlesV1,
        chainId: 999_999,
        nonce: 0n,
      }),
    ).rejects.toBeInstanceOf(UnsupportedChainIdError);
  });

  test("error: UnknownAddressError on a chain without BlueBundlesV1", async () => {
    await expect(
      encodeBlueSignatureAuthorization(walletClient(ChainId.FraxtalMainnet), {
        owner: account.address,
        authorized: blueBundlesV1,
        chainId: ChainId.FraxtalMainnet,
        nonce: 0n,
      }),
    ).rejects.toBeInstanceOf(UnknownAddressError);
  });

  test("error: UnsupportedAuthorizationOperatorError", async () => {
    await expect(
      encodeBlueSignatureAuthorization(walletClient(), {
        owner: account.address,
        authorized: "0x1111111111111111111111111111111111111111",
        chainId: mainnet.id,
        nonce: 0n,
      }),
    ).rejects.toBeInstanceOf(UnsupportedAuthorizationOperatorError);
  });

  test("default: signs a verifiable Morpho authorization", async () => {
    const client = walletClient();
    const requirement = await encodeBlueSignatureAuthorization(client, {
      owner: account.address,
      authorized: blueBundlesV1,
      chainId: mainnet.id,
      nonce: 0n,
    });

    expect(requirement.action.type).toBe("authorization");

    const signed = await requirement.sign(client, account.address);

    expect(signed.action.type).toBe("authorization");
    expect(signed.args.owner).toBe(account.address);
    expect(signed.args.authorized).toBe(blueBundlesV1);
    expect(signed.args.isAuthorized).toBe(true);
    expect(signed.args.nonce).toBe(0n);
    expect(isHex(signed.args.signature)).toBe(true);
    expect(signed.args.signature.length).toBe(132);

    const typedData = getAuthorizationTypedData(
      {
        authorizer: account.address,
        authorized: blueBundlesV1,
        isAuthorized: true,
        nonce: 0n,
        deadline: signed.args.deadline,
      },
      mainnet.id,
    );
    await expect(
      verifyTypedData({
        ...typedData,
        address: account.address,
        signature: signed.args.signature,
      }),
    ).resolves.toBe(true);
  });

  test("error: NonPositiveInputError when deadline is not positive", async () => {
    await expect(
      encodeBlueSignatureAuthorization(walletClient(), {
        owner: account.address,
        authorized: blueBundlesV1,
        chainId: mainnet.id,
        nonce: 0n,
        deadline: 0n,
      }),
    ).rejects.toBeInstanceOf(NonPositiveInputError);
  });

  test("error: InputExceedsMaxError when deadline exceeds uint256", async () => {
    await expect(
      encodeBlueSignatureAuthorization(walletClient(), {
        owner: account.address,
        authorized: blueBundlesV1,
        chainId: mainnet.id,
        nonce: 0n,
        deadline: maxUint256 + 1n,
      }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);
  });

  test("error: ExpiredDeadlineError when deadline is in the past", async () => {
    await expect(
      encodeBlueSignatureAuthorization(walletClient(), {
        owner: account.address,
        authorized: blueBundlesV1,
        chainId: mainnet.id,
        nonce: 0n,
        deadline: 1n,
      }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
  });

  test("behavior: supports revocation via isAuthorized=false", async () => {
    const client = walletClient();
    const requirement = await encodeBlueSignatureAuthorization(client, {
      owner: account.address,
      authorized: blueBundlesV1,
      chainId: mainnet.id,
      nonce: 1n,
      isAuthorized: false,
    });

    const signed = await requirement.sign(client, account.address);
    expect(signed.args.isAuthorized).toBe(false);
  });

  test("error: AddressMismatchError when signer differs from userAddress", async () => {
    const client = walletClient();
    const requirement = await encodeBlueSignatureAuthorization(client, {
      owner: account.address,
      authorized: blueBundlesV1,
      chainId: mainnet.id,
      nonce: 0n,
    });

    await expect(
      requirement.sign(client, "0x1111111111111111111111111111111111111111"),
    ).rejects.toBeInstanceOf(AddressMismatchError);
  });

  test("action.typedData carries the Authorization payload for the owner", async () => {
    const client = walletClient();
    const requirement = await encodeBlueSignatureAuthorization(client, {
      owner: account.address,
      authorized: blueBundlesV1,
      chainId: mainnet.id,
      nonce: 0n,
    });

    const typedData = requirement.action.typedData;

    expect(typedData.primaryType).toBe("Authorization");
    expect(typedData.message).toMatchObject({
      authorizer: account.address,
      authorized: blueBundlesV1,
      isAuthorized: true,
      nonce: 0n,
    });
  });

  test("behavior: signing action.typedData externally matches sign()", async () => {
    const client = walletClient();
    const requirement = await encodeBlueSignatureAuthorization(client, {
      owner: account.address,
      authorized: blueBundlesV1,
      chainId: mainnet.id,
      nonce: 0n,
    });

    const typedData = requirement.action.typedData;
    const externalSignature = await account.signTypedData(typedData);
    const signed = await requirement.sign(client, account.address);

    expect(externalSignature).toEqual(signed.args.signature);
    await expect(
      verifyTypedData({
        ...typedData,
        address: account.address,
        signature: externalSignature,
      }),
    ).resolves.toBe(true);
  });
});
