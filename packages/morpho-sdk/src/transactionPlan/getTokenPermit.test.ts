import { AccrualVaultV2, addressesRegistry } from "@morpho-org/blue-sdk";
import { erc2612Abi, erc5267Abi } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  type Address,
  erc20Abi,
  getTypesForEIP712Domain,
  HttpRequestError,
  hashDomain,
  maxUint256,
  type TypedData,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { expect, test } from "vitest";
import {
  IN_KIND_USER,
  inKindVaultV2Data,
} from "../../test/fixtures/inKindRedeem.js";
import { getTokenPermit } from "./getTokenPermit.js";
import { prepareVaultV2Deposit } from "./vaultv2/deposit.js";

const { usdc, dai, bundles } = addressesRegistry[mainnet.id];
const params = {
  token: usdc,
  owner: zeroAddress,
  spender: bundles!.vaultBundlesV1!,
  amount: 1n,
  chainId: mainnet.id,
  deadline: 200n,
  now: 100n,
  supportDeployless: false,
};

function mockPermitToken(scenario = "matching", token: Address = usdc) {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: token,
    abi: erc2612Abi,
    functionName: "nonces",
    result: 0n,
  });
  mockRead(handle, {
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
    result: 6,
  });
  mockRead(handle, {
    address: token,
    abi: erc20Abi,
    functionName: "name",
    result: "USD Coin",
  });
  mockRead(handle, {
    address: token,
    abi: erc20Abi,
    functionName: "symbol",
    result: "USDC",
  });
  mockRead(handle, {
    address: token,
    abi: erc5267Abi,
    functionName: "eip712Domain",
    result: [
      "0x0f",
      "USD Coin",
      "2",
      scenario === "wrong chain" ? 8453n : 1n,
      scenario === "wrong token" ? zeroAddress : token,
      `0x${"00".repeat(32)}`,
      scenario === "extensions" ? [1n] : [],
    ],
  });
  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: 1,
    verifyingContract: token,
  };
  mockRead(handle, {
    address: token,
    abi: erc2612Abi,
    functionName: "DOMAIN_SEPARATOR",
    result:
      scenario === "mismatch"
        ? `0x${"00".repeat(32)}`
        : hashDomain<TypedData>({
            domain,
            types: { EIP712Domain: getTypesForEIP712Domain({ domain }) },
          }),
  });
  return handle;
}

test("returns the ERC-2612 requirement when nonce, domain and separator match", async () => {
  const handle = mockPermitToken();
  const permit = await getTokenPermit(handle.client, params);
  expect(permit?.action.type).toBe("permit");
  expect(permit?.action.args).toEqual({
    spender: params.spender,
    amount: 1n,
    nonce: 0n,
    deadline: 200n,
  });
});

test("returns undefined for DAI without reading its nonce", async () => {
  const handle = createMockClient(mainnet);
  expect(
    await getTokenPermit(handle.client, { ...params, token: dai! }),
  ).toBeUndefined();
  expect(handle.request).not.toHaveBeenCalled();
});

test("propagates nonce transport errors instead of treating the token as unsupported", async () => {
  const handle = createMockClient(mainnet);
  const error = new HttpRequestError({
    url: "https://rpc.example",
    status: 503,
  });
  handle.request.mockRejectedValue(error);
  await expect(getTokenPermit(handle.client, params)).rejects.toSatisfy(
    (caught: Error) => {
      let cause: unknown = caught;
      while (cause instanceof Error && cause !== error) cause = cause.cause;
      return cause === error;
    },
  );
});

test.each(["wrong chain", "wrong token", "extensions", "mismatch"])(
  "returns undefined for an ineligible permit domain: %s",
  async (scenario) => {
    const handle = mockPermitToken(scenario);
    expect(await getTokenPermit(handle.client, params)).toBeUndefined();
  },
);

test.each(["wrong chain", "wrong token", "extensions", "mismatch"])(
  "prepares deposit approval without a permit for %s",
  async (scenario) => {
    const data = inKindVaultV2Data();
    const token = usdc;
    const handle = mockPermitToken(scenario, token);
    mockRead(handle, {
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const vaultData = new AccrualVaultV2(
      { ...data, asset: usdc },
      undefined,
      [],
      1_000n,
      {},
    );
    const plan = await prepareVaultV2Deposit(handle.client, {
      vault: data.address,
      vaultData,
      chainId: 1,
      account: IN_KIND_USER,
      amount: 100n,
      supportSignature: true,
      deployless: false,
    });
    expect(plan.signatureRequests).toEqual([]);
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "vaultV2Deposit",
    ]);
    expect(plan.steps[0]?.action).toMatchObject({
      inputs: { token, amount: maxUint256 },
    });
  },
);
