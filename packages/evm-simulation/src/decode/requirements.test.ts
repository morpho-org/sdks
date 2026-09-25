import { getChainAddresses, Token } from "@morpho-org/blue-sdk";
import {
  type ActionRequirement,
  type AuthorizationRequirementSignature,
  type BlueAuthorizationAction,
  type ERC20ApprovalAction,
  type Erc2612RequirementSignature,
  encodeBlueSignatureAuthorization,
  encodeErc20Approval,
  encodeErc20Permit2SignatureTransfer,
  type MidnightAuthorizationAction,
  type Requirement,
  type RequirementTypedData,
  type Transaction,
} from "@morpho-org/morpho-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { getPermitTypedData } from "@morpho-org/morpho-sdk/blue/utils";
import { getChainAddress } from "@morpho-org/morpho-ts";
import * as fc from "fast-check";
import {
  type Address,
  type Client,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  toHex,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  AuthorizationRequestMismatchError,
  UnsupportedOperationError,
} from "../errors.js";
import { toSimulationAuthorizations } from "./requirements.js";

const CHAIN_ID = 1;
const OWNER = getAddress("0x1000000000000000000000000000000000000001");
const OTHER = getAddress("0x2000000000000000000000000000000000000002");
const TOKEN = getAddress("0x3000000000000000000000000000000000000003");
const DEADLINE = 4_000_000_000n;
const NONCE = 7n;

const vaultBundlesV1 = getChainAddress(CHAIN_ID, "bundles.vaultBundlesV1");
const blueBundlesV1 = getChainAddress(CHAIN_ID, "bundles.blueBundlesV1");
const permit2 = getChainAddress(CHAIN_ID, "permit2");
const morpho = getChainAddresses(CHAIN_ID).blue;

const mainnetClient = { chain: { id: CHAIN_ID } } as unknown as Client;

const neverSign = async (): Promise<never> => {
  throw new Error("tests never sign requirements");
};

const permitRequirement = (params: {
  owner?: Address;
  token?: Address;
  spender?: Address;
  amount?: bigint;
  nonce?: bigint;
  deadline?: bigint;
  typedData?: RequirementTypedData;
}): Requirement<Erc2612RequirementSignature> => {
  const owner = params.owner ?? OWNER;
  const spender = params.spender ?? vaultBundlesV1;
  const amount = params.amount ?? 1_000_000n;
  const nonce = params.nonce ?? NONCE;
  const deadline = params.deadline ?? DEADLINE;
  const token = params.token ?? TOKEN;
  return {
    action: {
      type: "permit",
      args: { spender, amount, deadline, nonce },
      typedData:
        params.typedData ??
        getPermitTypedData(
          {
            erc20: new Token({ address: token, name: "USD Coin" }),
            owner,
            spender,
            allowance: amount,
            nonce,
            deadline,
          },
          CHAIN_ID,
        ),
    },
    sign: neverSign,
  };
};

const blueAuthorizationSignatureRequirement = (params?: {
  owner?: Address;
  authorized?: Address;
  isAuthorized?: boolean;
  nonce?: bigint;
  deadline?: bigint;
}): Promise<Requirement<AuthorizationRequirementSignature>> =>
  encodeBlueSignatureAuthorization(mainnetClient, {
    owner: params?.owner ?? OWNER,
    authorized: params?.authorized ?? blueBundlesV1,
    chainId: CHAIN_ID,
    nonce: params?.nonce ?? NONCE,
    isAuthorized: params?.isAuthorized,
    deadline: params?.deadline ?? DEADLINE,
  });

const blueAuthorizationCall = (params?: {
  authorized?: Address;
  isAuthorized?: boolean;
  data?: `0x${string}`;
}): Transaction<BlueAuthorizationAction> => {
  const authorized = params?.authorized ?? blueBundlesV1;
  const isAuthorized = params?.isAuthorized ?? true;
  return {
    to: morpho,
    value: 0n,
    data:
      params?.data ??
      encodeFunctionData({
        abi: blueAbi,
        functionName: "setAuthorization",
        args: [authorized, isAuthorized],
      }),
    action: { type: "blueAuthorization", args: { authorized, isAuthorized } },
  };
};

describe("toSimulationAuthorizations", () => {
  test("default", () => {
    expect(
      toSimulationAuthorizations({
        owner: OWNER,
        requirements: [permitRequirement({})],
      }),
    ).toEqual([
      {
        type: "erc2612Permit",
        typedData: {
          domain: {
            name: "USD Coin",
            version: "1",
            chainId: CHAIN_ID,
            verifyingContract: TOKEN,
          },
          primaryType: "Permit",
          types: {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          message: {
            owner: OWNER,
            spender: vaultBundlesV1,
            value: 1_000_000n,
            nonce: NONCE,
            deadline: DEADLINE,
          },
        },
      },
    ]);
  });

  test("default: empty input", () => {
    expect(
      toSimulationAuthorizations({ owner: OWNER, requirements: [] }),
    ).toEqual([]);
  });

  test("behavior: erc20Approval call requirement maps from decoded calldata", () => {
    const approval = encodeErc20Approval({
      token: TOKEN,
      spender: vaultBundlesV1,
      amount: 42n,
      chainId: CHAIN_ID,
    });

    expect(
      toSimulationAuthorizations({ owner: OWNER, requirements: [approval] }),
    ).toEqual([
      {
        type: "erc20Approval",
        token: TOKEN,
        owner: OWNER,
        spender: vaultBundlesV1,
        amount: 42n,
      },
    ]);
  });

  test("behavior: blueAuthorization call requirement maps from decoded calldata", () => {
    expect(
      toSimulationAuthorizations({
        owner: OWNER,
        requirements: [blueAuthorizationCall({ authorized: blueBundlesV1 })],
      }),
    ).toEqual([
      {
        type: "blueAuthorization",
        authorizer: OWNER,
        authorized: blueBundlesV1,
        isAuthorized: true,
      },
    ]);
  });

  test("behavior: permit2SignatureTransfer maps the signed payload", () => {
    const requirement = encodeErc20Permit2SignatureTransfer({
      token: TOKEN,
      spender: vaultBundlesV1,
      amount: 123n,
      chainId: CHAIN_ID,
      nonce: NONCE,
      deadline: DEADLINE,
    });

    const [authorization] = toSimulationAuthorizations({
      owner: OWNER,
      requirements: [requirement],
    });

    const [permitAuthorization] = toSimulationAuthorizations({
      owner: OWNER,
      requirements: [permitRequirement({})],
    });
    if (permitAuthorization?.type !== "erc2612Permit") {
      throw new Error("expected erc2612Permit");
    }
    expect(Object.values(permitAuthorization.typedData.domain)).not.toContain(
      undefined,
    );

    expect(authorization?.type).toBe("permit2SignatureTransfer");
    if (authorization?.type !== "permit2SignatureTransfer") return;
    expect(authorization.owner).toBe(OWNER);
    expect(authorization.typedData.primaryType).toBe("PermitTransferFrom");
    expect(authorization.typedData.domain).toEqual({
      name: "Permit2",
      chainId: CHAIN_ID,
      verifyingContract: permit2,
    });
    expect(authorization.typedData.message).toEqual({
      permitted: { token: TOKEN, amount: 123n },
      spender: vaultBundlesV1,
      nonce: NONCE,
      deadline: DEADLINE,
    });
  });

  test("behavior: blue authorization signature maps the signed payload", async () => {
    const requirement = await blueAuthorizationSignatureRequirement({
      isAuthorized: true,
    });

    const [authorization] = toSimulationAuthorizations({
      owner: OWNER,
      requirements: [requirement],
    });

    expect(authorization?.type).toBe("blueAuthorizationSignature");
    if (authorization?.type !== "blueAuthorizationSignature") return;
    expect(authorization.typedData.primaryType).toBe("Authorization");
    expect(authorization.typedData.domain).toEqual({
      chainId: CHAIN_ID,
      verifyingContract: morpho,
    });
    expect(authorization.typedData.message).toEqual({
      authorizer: OWNER,
      authorized: blueBundlesV1,
      isAuthorized: true,
      nonce: NONCE,
      deadline: DEADLINE,
    });
  });

  test("behavior: order is preserved across a zero reset followed by a grant", () => {
    const reset = encodeErc20Approval({
      token: TOKEN,
      spender: vaultBundlesV1,
      amount: 0n,
      chainId: CHAIN_ID,
    });
    const grant = encodeErc20Approval({
      token: TOKEN,
      spender: vaultBundlesV1,
      amount: 55n,
      chainId: CHAIN_ID,
    });

    const authorizations = toSimulationAuthorizations({
      owner: OWNER,
      requirements: [reset, grant, permitRequirement({})],
    });

    expect(authorizations.map(({ type }) => type)).toEqual([
      "erc20Approval",
      "erc20Approval",
      "erc2612Permit",
    ]);
    expect(authorizations[0]).toMatchObject({ amount: 0n });
    expect(authorizations[1]).toMatchObject({ amount: 55n });
  });

  test("behavior: Permit2 pair stays ordered as approval then signature", () => {
    const approval = encodeErc20Approval({
      token: TOKEN,
      spender: permit2,
      amount: 999n,
      chainId: CHAIN_ID,
    });
    const transfer = encodeErc20Permit2SignatureTransfer({
      token: TOKEN,
      spender: blueBundlesV1,
      amount: 999n,
      chainId: CHAIN_ID,
      nonce: NONCE,
      deadline: DEADLINE,
    });

    const authorizations = toSimulationAuthorizations({
      owner: OWNER,
      requirements: [approval, transfer],
    });

    expect(authorizations.map(({ type }) => type)).toEqual([
      "erc20Approval",
      "permit2SignatureTransfer",
    ]);
    expect(authorizations[0]).toMatchObject({ spender: permit2 });
  });

  test("error: AuthorizationRequestMismatchError on permit owner mismatch", () => {
    expect(() =>
      toSimulationAuthorizations({
        owner: OTHER,
        requirements: [permitRequirement({})],
      }),
    ).toThrowError(AuthorizationRequestMismatchError);
  });

  test("error: AuthorizationRequestMismatchError on wrong primaryType", () => {
    const requirement = permitRequirement({});
    const tampered: ActionRequirement = {
      ...requirement,
      action: {
        ...requirement.action,
        typedData: { ...requirement.action.typedData, primaryType: "Nope" },
      },
    };
    expect(() =>
      toSimulationAuthorizations({ owner: OWNER, requirements: [tampered] }),
    ).toThrowError(AuthorizationRequestMismatchError);
  });

  test("error: AuthorizationRequestMismatchError on wrong types tuple order", () => {
    const requirement = permitRequirement({});
    const fields = [
      ...(requirement.action.typedData.types.Permit as readonly {
        name: string;
        type: string;
      }[]),
    ].reverse();
    const tampered: ActionRequirement = {
      ...requirement,
      action: {
        ...requirement.action,
        typedData: {
          ...requirement.action.typedData,
          types: { Permit: fields },
        },
      },
    };
    expect(() =>
      toSimulationAuthorizations({ owner: OWNER, requirements: [tampered] }),
    ).toThrowError(AuthorizationRequestMismatchError);
  });

  test("error: AuthorizationRequestMismatchError on decoded spender mismatch", () => {
    const approval: Transaction<ERC20ApprovalAction> = {
      to: TOKEN,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [OTHER, 10n],
      }),
      action: {
        type: "erc20Approval",
        args: { spender: vaultBundlesV1, amount: 10n },
      },
    };

    expect(() =>
      toSimulationAuthorizations({ owner: OWNER, requirements: [approval] }),
    ).toThrowError(AuthorizationRequestMismatchError);
  });

  test("error: UnsupportedOperationError on non-approve approval calldata", () => {
    const approval: Transaction<ERC20ApprovalAction> = {
      to: TOKEN,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [vaultBundlesV1, 10n],
      }),
      action: {
        type: "erc20Approval",
        args: { spender: vaultBundlesV1, amount: 10n },
      },
    };

    expect(() =>
      toSimulationAuthorizations({ owner: OWNER, requirements: [approval] }),
    ).toThrowError(UnsupportedOperationError);
  });

  test("error: UnsupportedOperationError on midnight call requirement", () => {
    const midnight: Transaction<MidnightAuthorizationAction> = {
      to: getAddress("0x4000000000000000000000000000000000000004"),
      value: 0n,
      data: "0x12345678",
      action: {
        type: "midnightAuthorization",
        args: { authorized: OTHER, isAuthorized: true, onBehalf: OWNER },
      },
    };

    expect(() =>
      toSimulationAuthorizations({ owner: OWNER, requirements: [midnight] }),
    ).toThrowError(UnsupportedOperationError);
  });

  test("error: UnsupportedOperationError on midnight offer-root signature", () => {
    const midnightSignature = {
      action: {
        type: "midnightOfferRootSignature",
        args: {
          root: toHex(1n, { size: 32 }),
          ratifier: OTHER,
          offers: 1,
        },
        typedData: {
          domain: {},
          types: {},
          message: {},
          primaryType: "OfferRoot",
        },
      },
      sign: neverSign,
    } as ActionRequirement;

    expect(() =>
      toSimulationAuthorizations({
        owner: OWNER,
        requirements: [midnightSignature],
      }),
    ).toThrowError(UnsupportedOperationError);
  });

  test("behavior: permit payloads round-trip exactly", () => {
    const addressArb = fc
      .bigInt({ min: 0n, max: 2n ** 160n - 1n })
      .map((n) => getAddress(toHex(n, { size: 20 })));
    const uint256Arb = fc.bigInt({ min: 0n, max: 2n ** 256n - 1n });

    fc.assert(
      fc.property(
        fc.tuple(
          addressArb,
          addressArb,
          addressArb,
          uint256Arb,
          uint256Arb,
          uint256Arb,
        ),
        ([owner, token, spender, amount, nonce, deadline]) => {
          const authorizations = toSimulationAuthorizations({
            owner,
            requirements: [
              permitRequirement({
                owner,
                token,
                spender,
                amount,
                nonce,
                deadline,
              }),
            ],
          });

          expect(authorizations).toHaveLength(1);
          const [authorization] = authorizations;
          if (authorization?.type !== "erc2612Permit") {
            throw new Error(
              `expected erc2612Permit, got ${authorization?.type}`,
            );
          }
          expect(authorization.typedData.message).toEqual({
            owner,
            spender,
            value: amount,
            nonce,
            deadline,
          });
          expect(authorization.typedData.domain.verifyingContract).toBe(token);
          expect(authorization.typedData.domain.chainId).toBe(CHAIN_ID);
        },
      ),
    );
  });
});
