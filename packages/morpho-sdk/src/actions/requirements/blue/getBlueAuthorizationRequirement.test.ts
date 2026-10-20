import { addressesRegistry } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { type Address, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  isRequirementSignature,
  NonPositiveInputError,
  UnsupportedAuthorizationOperatorError,
} from "../../../types/index.js";
import { getBlueAuthorizationRequirement } from "./getBlueAuthorizationRequirement.js";

const answerWrongChain = (handle: ReturnType<typeof createMockClient>) =>
  handle.request.mockImplementation(async ({ method }) => {
    if (method === "eth_chainId") return "0x2105";
    throw new Error(`unexpected ${method}`);
  });

const USER: Address = "0x1111111111111111111111111111111111111111";
const blue = getChainAddress(mainnet.id, "blue");

describe("getBlueAuthorizationRequirement", () => {
  test("throws ChainIdMismatchError when the client chain differs", async () => {
    const wrongChain = { ...mainnet, id: mainnet.id + 1 };
    await expect(
      getBlueAuthorizationRequirement({
        viemClient: createMockClient(wrongChain).client,
        chainId: mainnet.id,
        userAddress: USER,
      }),
    ).rejects.toThrow(ChainIdMismatchError);
  });

  test("returns null when BlueBundlesV1 is already authorized", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: blue,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: true,
    });
    await expect(
      getBlueAuthorizationRequirement({
        viemClient: handle.client,
        chainId: mainnet.id,
        userAddress: USER,
      }),
    ).resolves.toBeNull();
  });

  test("builds an authorization transaction when authorization is missing", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: blue,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: false,
    });
    const tx = await getBlueAuthorizationRequirement({
      viemClient: handle.client,
      chainId: mainnet.id,
      userAddress: USER,
    });

    if (tx == null || isRequirementSignature(tx)) {
      throw new Error("expected an authorization transaction");
    }
    expect(tx.to).toBe(blue);
    expect(tx.action.type).toBe("blueAuthorization");
    expect(tx.action.args.authorized).toBe(
      addressesRegistry[mainnet.id].bundles?.blueBundlesV1,
    );
  });

  test("targets an explicitly selected BlueBundlesV1 operator", async () => {
    const authorized = addressesRegistry[mainnet.id].bundles?.blueBundlesV1;
    if (authorized == null) throw new Error("BlueBundlesV1 is not registered");
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: blue,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: false,
    });

    const tx = await getBlueAuthorizationRequirement({
      viemClient: handle.client,
      chainId: mainnet.id,
      userAddress: USER,
      authorized,
    });

    if (tx == null || isRequirementSignature(tx)) {
      throw new Error("expected an authorization transaction");
    }
    expect(tx.action.args.authorized).toBe(authorized);
  });

  test("behavior: returns a signable requirement when supportSignature is true", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: blue,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: false,
    });
    mockRead(handle, {
      address: blue,
      abi: blueAbi,
      functionName: "nonce",
      result: 3n,
    });
    const requirement = await getBlueAuthorizationRequirement({
      viemClient: handle.client,
      chainId: mainnet.id,
      userAddress: USER,
      supportSignature: true,
    });

    if (requirement == null || !isRequirementSignature(requirement)) {
      throw new Error("expected a signable authorization requirement");
    }
    if (requirement.action.type !== "authorization") {
      throw new Error("expected an authorization action");
    }
    expect(requirement.action.args.authorized).toBe(
      addressesRegistry[mainnet.id].bundles?.blueBundlesV1,
    );
  });

  test("behavior: an overridden now lets a signature path outlive the wall clock", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: blue,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: false,
    });
    mockRead(handle, {
      address: blue,
      abi: blueAbi,
      functionName: "nonce",
      result: 3n,
    });

    // Expired on the wall clock but live at the supplied `now`: the signature
    // encoder must honour the same override as the resolver's deadline check.
    const deadline = Time.timestamp() - Time.s.from.h(1n);
    const requirement = await getBlueAuthorizationRequirement({
      viemClient: handle.client,
      chainId: mainnet.id,
      userAddress: USER,
      deadline,
      now: deadline - Time.s.from.h(1n),
      supportSignature: true,
    });

    if (requirement == null || !isRequirementSignature(requirement)) {
      throw new Error("expected a signable authorization requirement");
    }
    expect(requirement.action.type).toBe("authorization");
    expect(requirement.action.args.authorized).toBe(
      addressesRegistry[mainnet.id].bundles?.blueBundlesV1,
    );
  });

  test("error: UnsupportedAuthorizationOperatorError for an unregistered operator", async () => {
    const handle = createMockClient(mainnet);
    // Authorization is an SDK security invariant: an arbitrary operator override must be rejected
    // before any RPC read, so it can never reach setAuthorization.
    await expect(
      getBlueAuthorizationRequirement({
        viemClient: handle.client,
        chainId: mainnet.id,
        userAddress: USER,
        authorized: "0x000000000000000000000000000000000000dEaD",
      }),
    ).rejects.toBeInstanceOf(UnsupportedAuthorizationOperatorError);
  });

  test("behavior: accepts the registered BlueBundlesV1 operator", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: blue,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: true,
    });
    await expect(
      getBlueAuthorizationRequirement({
        viemClient: handle.client,
        chainId: mainnet.id,
        userAddress: USER,
        authorized: getChainAddress(mainnet.id, "bundles.blueBundlesV1"),
      }),
    ).resolves.toBeNull();
  });

  test("error: rejects an invalid signable authorization deadline", async () => {
    const handle = createMockClient(mainnet);
    const base = {
      viemClient: handle.client,
      chainId: mainnet.id,
      userAddress: USER,
      supportSignature: true,
    } as const;
    // Validation runs before any RPC read, so no mock is needed.
    await expect(
      getBlueAuthorizationRequirement({ ...base, deadline: 0n }),
    ).rejects.toBeInstanceOf(NonPositiveInputError);
    await expect(
      getBlueAuthorizationRequirement({ ...base, deadline: maxUint256 + 1n }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);
    await expect(
      getBlueAuthorizationRequirement({ ...base, deadline: 1n }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
  });
  test("[INV-05] error: ChainIdMismatchError when the RPC reports another chain via eth_chainId", async () => {
    const handle = createMockClient(mainnet);
    answerWrongChain(handle);
    await expect(
      getBlueAuthorizationRequirement({
        viemClient: handle.client,
        chainId: mainnet.id,
        userAddress: USER,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("[INV-05] error: ChainIdMismatchError when the RPC reports another chain on the signable path", async () => {
    const handle = createMockClient(mainnet);
    answerWrongChain(handle);
    await expect(
      getBlueAuthorizationRequirement({
        viemClient: handle.client,
        chainId: mainnet.id,
        userAddress: USER,
        supportSignature: true,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
  });
});
