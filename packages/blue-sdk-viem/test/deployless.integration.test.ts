import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  ContractFunctionExecutionError,
  createPublicClient,
  custom,
  isAddressEqual,
  isHex,
  type StateOverride,
  size,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { QUERY_ADDRESS } from "../src/deployless.js";
import { fetchToken } from "../src/fetch/Token.js";
import {
  fetchAccrualVaultV2,
  fetchVaultV2,
} from "../src/fetch/vault-v2/VaultV2.js";
import { vaultV2Test } from "./setup.js";

const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 26_448_630,
});
const largeVault = "0xbeef0D24920098C404c7Fc7942ee6d0f66d65D57";
const baseVault = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";

for (const deployless of [true, false]) {
  test(`code-less VaultV2 preserves state errors when metadata fails first (deployless=${deployless})`, async ({
    client,
  }) => {
    const vault = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
    await client.setCode({ address: vault, bytecode: "0x" });
    const state = Promise.withResolvers<void>();
    const metadata = Promise.withResolvers<void>();
    const metadataSelectors = new Set([
      "0x313ce567",
      "0x95d89b41",
      "0x06fdde03",
      "0x84b0196e",
    ]);
    const wrapped = createPublicClient({
      chain: client.chain,
      transport: custom(
        {
          async request({ method, params }) {
            const response = await client.request({ method, params });
            const call = method === "eth_call" ? params?.[0] : undefined;
            if (call?.to && isAddressEqual(call.to, vault)) {
              const selector = call.data?.slice(0, 10);
              if (selector === "0x313ce567") metadata.resolve();
              if (!metadataSelectors.has(selector)) await state.promise;
            }
            return response;
          },
        },
        { retryCount: 0 },
      ),
    });
    let settled = false;
    const result = fetchVaultV2(vault, wrapped, { deployless }).then(
      (value) => {
        settled = true;
        return value;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    let settledBeforeState: boolean;
    try {
      await metadata.promise;
      await new Promise((resolve) => setImmediate(resolve));
      settledBeforeState = settled;
    } finally {
      state.resolve();
    }
    expect(await result).toBeInstanceOf(ContractFunctionExecutionError);
    expect(settledBeforeState).toBe(false);
  });
}

test("large accrual response uses exactly one runtime eth_call", async ({
  client,
}) => {
  // Warm fork storage before measuring the bounded deployless read.
  const expected = await fetchAccrualVaultV2(largeVault, client, {
    deployless: false,
  });
  const calls: unknown[][] = [];
  let responseBytes = 0;
  const wrapped = createPublicClient({
    chain: client.chain,
    transport: custom(
      {
        async request({ method, params }) {
          if (method === "eth_call") calls.push(params ?? []);
          const response = await client.request({ method, params });
          if (method === "eth_call" && isHex(response))
            responseBytes = size(response);
          return response;
        },
      },
      { retryCount: 0 },
    ),
  });
  const vault = await fetchAccrualVaultV2(largeVault, wrapped, {
    deployless: "force",
  });
  expect(vault).toStrictEqual(expected);
  expect(calls).toHaveLength(1);
  expect(responseBytes).toBeGreaterThan(24_576);
  expect(calls[0]?.[0]).toMatchObject({ to: QUERY_ADDRESS });
  expect(calls[0]?.[2]).toHaveProperty(QUERY_ADDRESS);
});

for (const failure of ["strip", "reject"] as const) {
  vaultV2Test(
    `creation bytecode preserves vault after override ${failure}`,
    async ({ client }) => {
      const calls: { to?: string }[] = [];
      const wrapped = createPublicClient({
        chain: client.chain,
        transport: custom(
          {
            async request({ method, params }) {
              if (method === "eth_call") {
                calls.push(params?.[0]);
                if (params?.[2]) {
                  if (failure === "reject")
                    throw Object.assign(
                      new Error("state overrides not supported"),
                      { code: -32602 },
                    );
                  return client.request({ method, params: params.slice(0, 2) });
                }
              }
              return client.request({ method, params });
            },
          },
          { retryCount: 0 },
        ),
      });
      const vault = await fetchAccrualVaultV2(baseVault, wrapped, {
        deployless: "force",
      });
      const expected = await fetchAccrualVaultV2(baseVault, client, {
        deployless: false,
      });
      expect(vault).toStrictEqual(expected);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ to: QUERY_ADDRESS });
      expect(calls[1]).not.toHaveProperty("to");
    },
  );
}

test("caller-supplied token code override still applies", async ({
  client,
}) => {
  const token = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  // Return 9 for decimals(); revert for every optional metadata selector.
  const stateOverride: StateOverride = [
    {
      address: token,
      code: "0x60003560e01c63313ce5671460145760006000fd5b600960005260206000f3",
    },
  ];
  const overridden = await fetchToken(token, client, {
    stateOverride,
    deployless: "force",
  });
  expect(overridden.decimals).toBe(9);
  expect(
    (await fetchToken(token, client, { deployless: "force" })).decimals,
  ).toBe(6);
});
