import { addressesRegistry, Token } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  ContractFunctionRevertedError,
  erc20Abi,
  maxUint256,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { expect, test } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
} from "../../test/fixtures/inKindRedeem.js";
import { encodeErc20Approval } from "../actions/requirements/encode/encodeErc20Approval.js";
import { encodeVaultSharesPermit } from "../actions/requirements/encode/encodeVaultSharesPermit.js";
import { UnexpectedRequirementSignatureError } from "../types/index.js";
import {
  buildApprovalStep,
  buildPermitSignatureRequest,
  getTokenRequirements,
} from "./requirements.js";

const { usdc, dai, bundles } = addressesRegistry[1];
const params = {
  token: usdc,
  spender: bundles!.vaultBundlesV1!,
  owner: zeroAddress,
  amount: 100n,
  chainId: 1,
  now: 100n,
  deadline: 200n,
  deployless: false,
};

test.each([0n, 7n])(
  "converts a permit with nonce %s without changing its payload or argument order",
  (nonce) => {
    const requirement = encodeVaultSharesPermit({
      vault: new Token({ address: IN_KIND_VAULT }),
      version: "vaultV2",
      spender: params.spender,
      owner: IN_KIND_USER,
      chainId: 1,
      nonce,
      deadline: params.deadline,
      now: params.now,
    });
    const request = buildPermitSignatureRequest(requirement, "custom:permit");
    expect(request).toEqual({
      id: "custom:permit",
      kind: "permit",
      typedData: requirement.action.typedData,
      args: {
        spender: params.spender,
        amount: maxUint256,
        deadline: params.deadline,
        nonce,
      },
    });
    expect(request.typedData).toBe(requirement.action.typedData);
    expect(Object.keys(request.args)).toEqual([
      "spender",
      "amount",
      "deadline",
      "nonce",
    ]);
    expect(requirement.action.args.nonce).toBe(nonce);
  },
);

test("rejects a permit requirement without a concrete nonce", () => {
  const requirement = encodeVaultSharesPermit({
    vault: new Token({ address: IN_KIND_VAULT }),
    version: "vaultV2",
    spender: params.spender,
    owner: IN_KIND_USER,
    chainId: 1,
    nonce: 7n,
    deadline: params.deadline,
    now: params.now,
  });
  expect(() =>
    buildPermitSignatureRequest(
      {
        ...requirement,
        action: {
          ...requirement.action,
          args: { ...requirement.action.args, nonce: undefined },
        },
      },
      "missing:nonce",
    ),
  ).toThrow(new UnexpectedRequirementSignatureError("permit"));
});

test.each(
  (["assets", "shares"] as const).flatMap((denomination) =>
    [0n, maxUint256].map((amount) => ({ denomination, amount })),
  ),
)(
  "converts an approval for $amount $denomination with prepared context and stable field order",
  ({ denomination, amount }) => {
    const requirement = encodeErc20Approval({
      token: usdc,
      spender: params.spender,
      amount,
      chainId: 1,
    });
    const step = buildApprovalStep(requirement, {
      id: "custom:approval",
      chainId: 1,
      account: IN_KIND_USER,
      denomination,
    });
    expect(step).toEqual({
      id: "custom:approval",
      label: "Approve token spending",
      action: {
        type: "erc20Approval",
        inputs: {
          token: usdc,
          spender: requirement.action.args.spender,
          [denomination]: amount,
          chainId: 1,
          account: IN_KIND_USER,
        },
      },
    });
    expect(Object.keys(step.action.inputs)).toEqual([
      "token",
      "spender",
      denomination,
      "chainId",
      "account",
    ]);
    expect(requirement.action.args).toEqual({
      spender: params.spender,
      amount,
    });
  },
);

test.each([false, true])(
  "sufficient allowance skips approval and permit with supportSignature %s",
  async (supportSignature) => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: params.amount,
    });
    expect(
      await getTokenRequirements(handle.client, {
        ...params,
        supportSignature,
      }),
    ).toEqual([]);
    expect(handle.request).toHaveBeenCalledTimes(1);
  },
);

test("disabled signature support approves a permit-capable token without probing nonces", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: usdc,
    abi: erc20Abi,
    functionName: "allowance",
    result: 0n,
  });
  mockRead(handle, {
    address: usdc,
    abi: erc2612Abi,
    functionName: "nonces",
    result: 7n,
  });
  const requirements = await getTokenRequirements(handle.client, {
    ...params,
    supportSignature: false,
  });
  expect(requirements.map(({ action }) => action)).toEqual([
    {
      type: "erc20Approval",
      args: { spender: params.spender, amount: maxUint256 },
    },
  ]);
  expect(handle.request).toHaveBeenCalledTimes(1);
});

test("enabled signature support excludes DAI without probing its non-standard permit", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: dai!,
    abi: erc20Abi,
    functionName: "allowance",
    result: 0n,
  });
  const requirements = await getTokenRequirements(handle.client, {
    ...params,
    token: dai!,
    supportSignature: true,
  });
  expect(requirements[0]?.action.type).toBe("erc20Approval");
  expect(handle.request).toHaveBeenCalledTimes(1);
});

test("enabled signature support falls back to approval when nonces reverts", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: usdc,
    abi: erc20Abi,
    functionName: "allowance",
    result: 0n,
  });
  const request = handle.request.getMockImplementation()!;
  handle.request.mockImplementation(async (call) => {
    if (call.method === "eth_call") {
      const [tx] = call.params as [{ data: string }];
      if (tx.data.startsWith("0x7ecebe00"))
        throw new ContractFunctionRevertedError({
          abi: erc2612Abi,
          functionName: "nonces",
        });
    }
    return request(call);
  });
  const requirements = await getTokenRequirements(handle.client, {
    ...params,
    supportSignature: true,
  });
  expect(requirements[0]?.action).toMatchObject({
    type: "erc20Approval",
    args: { amount: maxUint256 },
  });
});
