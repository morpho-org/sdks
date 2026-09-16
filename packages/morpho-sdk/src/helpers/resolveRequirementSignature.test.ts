import { getAddress, type TypedDataDefinition } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  InvalidSignatureError,
  MalformedSignatureTypedDataError,
  MissingSignatureOwnerError,
  UnsupportedSignatureTypedDataError,
} from "../types/index.js";
import {
  resolveRequirementSignature,
  resolveRequirementSignatures,
} from "./resolveRequirementSignature.js";

const account = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000001",
);
const otherAccount = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000002",
);

const TOKEN = getAddress("0x0000000000000000000000000000000000000010");
const SPENDER = getAddress("0x0000000000000000000000000000000000000020");
const PERMIT2 = getAddress("0x0000000000000000000000000000000000000030");
const MORPHO = getAddress("0x0000000000000000000000000000000000000040");
const AUTHORIZED = getAddress("0x0000000000000000000000000000000000000050");

const permitTypedData = {
  domain: {
    name: "USD Coin",
    version: "2",
    chainId: mainnet.id,
    verifyingContract: TOKEN,
  },
  types: {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "Permit",
  message: {
    owner: account.address,
    spender: SPENDER,
    value: 1_000_000n,
    nonce: 7n,
    deadline: 4_000_000_000n,
  },
} as const satisfies TypedDataDefinition;

const permit2TypedData = {
  domain: { name: "Permit2", chainId: mainnet.id, verifyingContract: PERMIT2 },
  types: {
    PermitSingle: [
      { name: "details", type: "PermitDetails" },
      { name: "spender", type: "address" },
      { name: "sigDeadline", type: "uint256" },
    ],
    PermitDetails: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
  primaryType: "PermitSingle",
  message: {
    details: {
      token: TOKEN,
      amount: 2_000_000n,
      expiration: 5_000_000_000n,
      nonce: 3n,
    },
    spender: SPENDER,
    sigDeadline: 4_000_000_000n,
  },
} as const satisfies TypedDataDefinition;

const authorizationTypedData = {
  domain: { chainId: mainnet.id, verifyingContract: MORPHO },
  types: {
    Authorization: [
      { name: "authorizer", type: "address" },
      { name: "authorized", type: "address" },
      { name: "isAuthorized", type: "bool" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "Authorization",
  message: {
    authorizer: account.address,
    authorized: AUTHORIZED,
    isAuthorized: true,
    nonce: 0n,
    deadline: 4_000_000_000n,
  },
} as const satisfies TypedDataDefinition;

describe("resolveRequirementSignature", () => {
  test("default: ERC-2612 permit", async () => {
    const signature = await account.signTypedData(permitTypedData);

    const resolved = await resolveRequirementSignature({
      typedData: permitTypedData,
      signature,
    });

    expect(resolved).toStrictEqual({
      args: {
        owner: account.address,
        nonce: 7n,
        asset: TOKEN,
        signature,
        amount: 1_000_000n,
        deadline: 4_000_000_000n,
      },
      action: {
        type: "permit",
        args: {
          spender: SPENDER,
          amount: 1_000_000n,
          deadline: 4_000_000_000n,
        },
      },
    });
  });

  test("behavior: Permit2 reads asset from message.details.token", async () => {
    const signature = await account.signTypedData(
      permit2TypedData as TypedDataDefinition,
    );

    const resolved = await resolveRequirementSignature({
      typedData: permit2TypedData,
      signature,
      owner: account.address,
    });

    expect(resolved).toStrictEqual({
      args: {
        owner: account.address,
        nonce: 3n,
        asset: TOKEN,
        signature,
        amount: 2_000_000n,
        deadline: 4_000_000_000n,
        expiration: 5_000_000_000n,
      },
      action: {
        type: "permit2",
        args: {
          spender: SPENDER,
          amount: 2_000_000n,
          deadline: 4_000_000_000n,
          expiration: 5_000_000_000n,
        },
      },
    });
  });

  test("behavior: Blue authorization derives owner from authorizer", async () => {
    const signature = await account.signTypedData(authorizationTypedData);

    const resolved = await resolveRequirementSignature({
      typedData: authorizationTypedData,
      signature,
    });

    expect(resolved).toStrictEqual({
      args: {
        owner: account.address,
        authorized: AUTHORIZED,
        isAuthorized: true,
        nonce: 0n,
        deadline: 4_000_000_000n,
        signature,
      },
      action: {
        type: "authorization",
        args: {
          authorized: AUTHORIZED,
          isAuthorized: true,
          deadline: 4_000_000_000n,
        },
      },
    });
  });

  test("behavior: survives a JSON round-trip (bigints as strings)", async () => {
    const signature = await account.signTypedData(permitTypedData);
    const roundTripped = JSON.parse(
      JSON.stringify(permitTypedData, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ) as TypedDataDefinition;

    const resolved = await resolveRequirementSignature({
      typedData: roundTripped,
      signature,
    });

    expect(resolved.action.type).toBe("permit");
    expect(resolved.args).toMatchObject({
      nonce: 7n,
      deadline: 4_000_000_000n,
      amount: 1_000_000n,
    });
  });

  test("behavior: resolveRequirementSignatures resolves a batch in order", async () => {
    const permitSig = await account.signTypedData(permitTypedData);
    const authSig = await account.signTypedData(authorizationTypedData);

    const [permit, authorization] = await resolveRequirementSignatures([
      { typedData: permitTypedData, signature: permitSig },
      { typedData: authorizationTypedData, signature: authSig },
    ]);

    expect(permit?.action.type).toBe("permit");
    expect(authorization?.action.type).toBe("authorization");
  });

  test("error: InvalidSignatureError when signature does not recover to signer", async () => {
    const signature = await otherAccount.signTypedData(permitTypedData);

    await expect(
      resolveRequirementSignature({ typedData: permitTypedData, signature }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  test("behavior: verify:false skips recovery", async () => {
    const signature = await otherAccount.signTypedData(permitTypedData);

    await expect(
      resolveRequirementSignature(
        { typedData: permitTypedData, signature },
        { verify: false },
      ),
    ).resolves.toMatchObject({ action: { type: "permit" } });
  });

  test("error: MissingSignatureOwnerError for Permit2 without owner", async () => {
    const signature = await account.signTypedData(
      permit2TypedData as TypedDataDefinition,
    );

    await expect(
      resolveRequirementSignature({ typedData: permit2TypedData, signature }),
    ).rejects.toBeInstanceOf(MissingSignatureOwnerError);
  });

  test("error: UnsupportedSignatureTypedDataError for an unknown primaryType", async () => {
    const unknownTypedData = {
      domain: { chainId: mainnet.id },
      types: { Message: [{ name: "value", type: "uint256" }] },
      primaryType: "Message",
      message: { value: 1n },
    } as const satisfies TypedDataDefinition;
    const signature = await account.signTypedData(unknownTypedData);

    await expect(
      resolveRequirementSignature({ typedData: unknownTypedData, signature }),
    ).rejects.toBeInstanceOf(UnsupportedSignatureTypedDataError);
  });

  test("error: UnsupportedSignatureTypedDataError for a DAI-style permit", async () => {
    const daiTypedData = {
      domain: {
        name: "Dai Stablecoin",
        version: "1",
        chainId: mainnet.id,
        verifyingContract: TOKEN,
      },
      types: {
        Permit: [
          { name: "holder", type: "address" },
          { name: "spender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "allowed", type: "bool" },
        ],
      },
      primaryType: "Permit",
      message: {
        holder: account.address,
        spender: SPENDER,
        nonce: 0n,
        expiry: 4_000_000_000n,
        allowed: true,
      },
    } as const satisfies TypedDataDefinition;
    const signature = await account.signTypedData(daiTypedData);

    await expect(
      resolveRequirementSignature({ typedData: daiTypedData, signature }),
    ).rejects.toBeInstanceOf(UnsupportedSignatureTypedDataError);
  });

  test("error: MalformedSignatureTypedDataError when a field is missing", async () => {
    const malformed = {
      ...permitTypedData,
      message: {
        owner: account.address,
        spender: SPENDER,
        // value missing
        nonce: 7n,
        deadline: 4_000_000_000n,
      },
    } as unknown as TypedDataDefinition;

    await expect(
      resolveRequirementSignature(
        { typedData: malformed, signature: "0x" },
        { verify: false },
      ),
    ).rejects.toBeInstanceOf(MalformedSignatureTypedDataError);
  });
});
