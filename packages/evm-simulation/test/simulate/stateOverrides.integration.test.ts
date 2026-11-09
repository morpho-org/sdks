import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { type Address, hexToBigInt, toHex, zeroHash } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { SimulationValidationError, simulate } from "../../src/index.js";

const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 25_832_676n,
});

const TARGET: Address = "0x0000000000000000000000000000000000001234";
const SCRATCH: Address = "0x0000000000000000000000000000000000001235";
// Return storage slot zero; EIP-7702 delegation must use the delegator's storage.
const CODE = "0x60005460005260206000f3";

test("caller code and storage overrides affect assertions and transactions without changing onchain state", async ({
  client,
}) => {
  const owner = client.account.address;
  await client.setCode({ address: owner, bytecode: "0x" });
  const config = {
    timeoutMs: 30_000,
    chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
  };
  const request = {
    chainId: mainnet.id,
    blockNumber: await client.getBlockNumber(),
    limits: "none" as const,
    transactions: [
      {
        from: owner,
        to: TARGET,
        data: "0x12" as const,
        assertBefore: [
          {
            to: TARGET,
            data: "0x12" as const,
            check: (data: `0x${string}`) =>
              hexToBigInt(data) === 42n
                ? undefined
                : "Override not applied to assertion",
          },
        ],
      },
    ],
  };
  await expect(simulate(config, request)).rejects.toBeInstanceOf(
    SimulationValidationError,
  );
  const result = await simulate(config, {
    ...request,
    stateOverrides: {
      [TARGET]: {
        code: CODE,
        stateDiff: { [zeroHash]: toHex(42n, { size: 32 }) },
      },
    },
  });
  expect(result.calls[0]!.returnData).toBe(toHex(42n, { size: 32 }));
  expect(await client.getBytecode({ address: TARGET })).toBeUndefined();
  await expect(simulate(config, request)).rejects.toBeInstanceOf(
    SimulationValidationError,
  );
});

test("a 7702 delegation executes scratch code with the delegator's storage, not the scratch storage", async ({
  client,
}) => {
  const owner = client.account.address;
  await client.setCode({ address: owner, bytecode: "0x" });
  await client.setCode({ address: TARGET, bytecode: CODE });
  await client.setStorageAt({
    address: TARGET,
    index: zeroHash,
    value: toHex(42n, { size: 32 }),
  });
  const config = {
    timeoutMs: 30_000,
    chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
  };
  const request = {
    chainId: mainnet.id,
    limits: "none" as const,
    transactions: [{ from: owner, to: TARGET, data: "0x12" as const }],
  };
  const plain = await simulate(config, request);
  const delegated = await simulate(config, {
    ...request,
    stateOverrides: {
      [TARGET]: { code: `0xef0100${SCRATCH.slice(2)}` },
      [SCRATCH]: {
        code: CODE,
        stateDiff: { [zeroHash]: toHex(99n, { size: 32 }) },
      },
    },
  });
  expect(plain.calls[0]!.returnData).toBe(toHex(42n, { size: 32 }));
  expect(delegated.calls[0]!.returnData).toBe(plain.calls[0]!.returnData);
});
