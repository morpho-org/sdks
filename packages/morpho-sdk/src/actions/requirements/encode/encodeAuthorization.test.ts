import { addressesRegistry } from "@morpho-org/blue-sdk";
import { getAuthorizationTypedData } from "@morpho-org/blue-sdk-viem";
import {
  type Chain,
  createWalletClient,
  http,
  isHex,
  verifyTypedData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  AddressMismatchError,
  ChainIdMismatchError,
} from "../../../types/index.js";
import { encodeAuthorization } from "./encodeAuthorization.js";

// Anvil account #0 — signing is local crypto, so no RPC is required.
const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

const {
  bundler3: { generalAdapter1 },
} = addressesRegistry[mainnet.id];

function walletClient(chainId: number = mainnet.id) {
  const chain: Chain = { ...mainnet, id: chainId };
  return createWalletClient({ account, chain, transport: http() });
}

describe("encodeAuthorization", () => {
  test("error: ChainIdMismatchError when client chain differs", async () => {
    await expect(
      encodeAuthorization(walletClient(mainnet.id), {
        authorized: generalAdapter1,
        chainId: mainnet.id + 1,
        nonce: 0n,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });

  test("default: signs a verifiable Morpho authorization", async () => {
    const client = walletClient();
    const requirement = await encodeAuthorization(client, {
      authorized: generalAdapter1,
      chainId: mainnet.id,
      nonce: 0n,
    });

    expect(requirement.action.type).toBe("authorization");

    const signed = await requirement.sign(client, account.address);

    expect(signed.action.type).toBe("authorization");
    expect(signed.args.owner).toBe(account.address);
    expect(signed.args.authorized).toBe(generalAdapter1);
    expect(signed.args.isAuthorized).toBe(true);
    expect(signed.args.nonce).toBe(0n);
    expect(isHex(signed.args.signature)).toBe(true);
    expect(signed.args.signature.length).toBe(132);

    const typedData = getAuthorizationTypedData(
      {
        authorizer: account.address,
        authorized: generalAdapter1,
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

  test("behavior: supports revocation via isAuthorized=false", async () => {
    const client = walletClient();
    const requirement = await encodeAuthorization(client, {
      authorized: generalAdapter1,
      chainId: mainnet.id,
      nonce: 1n,
      isAuthorized: false,
    });

    const signed = await requirement.sign(client, account.address);
    expect(signed.args.isAuthorized).toBe(false);
  });

  test("error: AddressMismatchError when signer differs from userAddress", async () => {
    const client = walletClient();
    const requirement = await encodeAuthorization(client, {
      authorized: generalAdapter1,
      chainId: mainnet.id,
      nonce: 0n,
    });

    await expect(
      requirement.sign(client, "0x1111111111111111111111111111111111111111"),
    ).rejects.toBeInstanceOf(AddressMismatchError);
  });
});
