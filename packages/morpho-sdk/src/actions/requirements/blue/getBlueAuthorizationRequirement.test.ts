import { addressesRegistry } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
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

const USER: Address = "0x1111111111111111111111111111111111111111";
const { morpho } = addressesRegistry[mainnet.id];

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

  test("returns null when GeneralAdapter1 is already authorized", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: morpho,
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
      address: morpho,
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
    expect(tx.to).toBe(addressesRegistry[mainnet.id].morpho);
    expect(tx.action.type).toBe("blueAuthorization");
    expect(tx.action.args.authorized).toBe(
      addressesRegistry[mainnet.id].bundler3.generalAdapter1,
    );
  });

  test("targets an explicitly selected BlueBundlesV1 operator", async () => {
    const authorized = addressesRegistry[mainnet.id].bundles?.blueBundlesV1;
    if (authorized == null) throw new Error("BlueBundlesV1 is not registered");
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: morpho,
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
      address: morpho,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: false,
    });
    mockRead(handle, {
      address: morpho,
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
      addressesRegistry[mainnet.id].bundler3.generalAdapter1,
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
      address: morpho,
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
});
