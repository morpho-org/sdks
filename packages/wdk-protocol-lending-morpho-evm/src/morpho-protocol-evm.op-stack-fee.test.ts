import type { RequirementSignature } from "@morpho-org/morpho-sdk";
import { createMockClient } from "@morpho-org/test/mock";
import { WalletAccountEvm } from "@tetherto/wdk-wallet-evm";
import {
  type Chain,
  decodeFunctionData,
  encodeAbiParameters,
  type Hex,
  serializeTransaction,
} from "viem";
import { mainnet, optimism } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  InvalidTransactionMaxFeeError,
  MaximumFeeExceededError,
} from "./index.js";
import MorphoProtocolEvm, {
  GAS_PRICE_ORACLE_ABI,
  type PreparedMorphoWithdraw,
} from "./morpho-protocol-evm.js";

const { extension } = vi.hoisted(() => ({ extension: vi.fn() }));

vi.mock("@morpho-org/morpho-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@morpho-org/morpho-sdk")>()),
  morphoViemExtension: extension,
}));

const SEED =
  "cook voyage document eight skate token alien guide drink uncle term abuse";
const VAULT = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
const TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TRANSACTION = { to: VAULT, data: "0x1234", value: 0n } as const;
const EXPECTED_SERIALIZED_TRANSACTION = serializeTransaction({
  chainId: optimism.id,
  ...TRANSACTION,
  gas: 100n,
  nonce: 0,
  gasPrice: 1n,
});

type SetupOptions = {
  chain?: Chain;
  maxFeePerGas?: bigint;
  quotedFee?: bigint;
  transactionMaxFee?: bigint | number;
  l1Fee?: bigint;
  operatorFee?: bigint;
  revertL1Fee?: boolean;
  revertOperatorFee?: boolean;
};

const setup = async ({
  chain = optimism,
  maxFeePerGas,
  quotedFee = 100n,
  transactionMaxFee,
  l1Fee = 0n,
  operatorFee = 0n,
  revertL1Fee = false,
  revertOperatorFee = false,
}: SetupOptions) => {
  const transport = createMockClient(chain);
  const account = new WalletAccountEvm(SEED, "0'/0/0", {
    transactionMaxFee,
    provider: {
      request: ({ method, params }) =>
        transport.request({
          method,
          params: Array.isArray(params) ? params : undefined,
        }),
    },
  });
  const owner = await account.getAddress();
  const l1Transactions: Hex[] = [];
  const oracleCalls: string[] = [];
  transport.request.mockImplementation(async ({ method, params }) => {
    if (method === "eth_chainId") return `0x${chain.id.toString(16)}`;
    if (method === "eth_fillTransaction") {
      const feeParameters =
        maxFeePerGas === undefined
          ? { gasPrice: "0x1", type: "0x0" }
          : {
              maxFeePerGas: `0x${maxFeePerGas.toString(16)}`,
              maxPriorityFeePerGas: "0x1",
              type: "0x2",
            };
      return {
        tx: {
          chainId: `0x${chain.id.toString(16)}`,
          from: owner,
          to: TRANSACTION.to,
          input: TRANSACTION.data,
          value: "0x0",
          gas: "0x64",
          nonce: "0x0",
          ...feeParameters,
        },
      };
    }
    if (method === "eth_call") {
      const call = Array.isArray(params) ? params[0] : params;
      const data =
        typeof call === "object" && call !== null
          ? Reflect.get(call, "data")
          : undefined;
      if (typeof data !== "string")
        throw new Error("Expected eth_call calldata");
      const decoded = decodeFunctionData({
        abi: GAS_PRICE_ORACLE_ABI,
        data: data as Hex,
      });
      oracleCalls.push(decoded.functionName);
      if (decoded.functionName === "getL1Fee") {
        const serialized = decoded.args[0];
        l1Transactions.push(serialized);
        if (serialized === EXPECTED_SERIALIZED_TRANSACTION && revertL1Fee)
          throw new Error("execution reverted");
        return encodeAbiParameters(
          [{ type: "uint256" }],
          [serialized === EXPECTED_SERIALIZED_TRANSACTION ? l1Fee : 0n],
        );
      }
      if (decoded.functionName === "getOperatorFee") {
        if (revertOperatorFee) throw new Error("execution reverted");
        return encodeAbiParameters([{ type: "uint256" }], [operatorFee]);
      }
    }
    if (method === "eth_sendRawTransaction") return HASH;
    throw new Error(`Unhandled RPC ${method}`);
  });
  account.quoteSendTransaction = vi.fn().mockResolvedValue({ fee: quotedFee });
  const signTransaction = vi.spyOn(account, "signTransaction");
  const action = {
    getRequirements: vi
      .fn<PreparedMorphoWithdraw["getRequirements"]>()
      .mockResolvedValue([]),
    buildTx: vi.fn(
      (_signatures?: readonly RequirementSignature[]) => TRANSACTION,
    ),
  };
  const withdraw = vi.fn(() => action);
  extension.mockReturnValue(() => ({
    morpho: {
      vaultV2: () => ({
        getData: async () => ({ asset: TOKEN }),
        withdraw,
      }),
    },
  }));
  const protocol = new MorphoProtocolEvm(account, {
    chainId: chain.id,
    earnVaultAddress: VAULT,
  });
  const prepared = await protocol.prepareWithdraw({
    token: TOKEN,
    amount: 1_000_000n,
  });

  return {
    account,
    l1Transactions,
    oracleCalls,
    prepared,
    signTransaction,
    transport,
  };
};

describe.sequential("Optimism EOA transactionMaxFee", () => {
  test("error: includes the operator fee and signs nothing when it exceeds the cap", async () => {
    const fixture = await setup({
      transactionMaxFee: 100n,
      operatorFee: 1n,
    });

    await expect(fixture.prepared.submit()).rejects.toMatchObject({
      constructor: MaximumFeeExceededError,
      message:
        'Transaction fee "101" (execution "100" + L1 "0" + operator "1") exceeds transactionMaxFee "100". Raise transactionMaxFee or retry when L1 fees are lower.',
    });

    expect(fixture.l1Transactions.length).toBeGreaterThan(0);
    expect(
      fixture.l1Transactions.every(
        (transaction) => transaction === EXPECTED_SERIALIZED_TRANSACTION,
      ),
    ).toBe(true);
    expect(fixture.signTransaction).not.toHaveBeenCalled();
    expect(
      fixture.transport.request.mock.calls.map(([call]) => call.method),
    ).not.toContain("eth_sendRawTransaction");
  });

  test("error: propagates an operator-fee eth_call revert before signing", async () => {
    const fixture = await setup({
      transactionMaxFee: 100n,
      revertOperatorFee: true,
    });

    await expect(fixture.prepared.submit()).rejects.toThrow();

    expect(fixture.signTransaction).not.toHaveBeenCalled();
    expect(
      fixture.transport.request.mock.calls.map(([call]) => call.method),
    ).not.toContain("eth_sendRawTransaction");
  });

  test("error: propagates an exact-transaction L1-fee eth_call revert", async () => {
    const fixture = await setup({
      transactionMaxFee: 100n,
      revertL1Fee: true,
    });

    await expect(fixture.prepared.submit()).rejects.toThrow();

    expect(fixture.l1Transactions.length).toBeGreaterThan(0);
    expect(
      fixture.l1Transactions.every(
        (transaction) => transaction === EXPECTED_SERIALIZED_TRANSACTION,
      ),
    ).toBe(true);
    expect(fixture.signTransaction).not.toHaveBeenCalled();
    expect(
      fixture.transport.request.mock.calls.map(([call]) => call.method),
    ).not.toContain("eth_sendRawTransaction");
  });

  test("error: rejects a fractional transactionMaxFee before signing", async () => {
    const fixture = await setup({ transactionMaxFee: 1.5 });

    await expect(fixture.prepared.submit()).rejects.toMatchObject({
      constructor: InvalidTransactionMaxFeeError,
      message: expect.stringContaining('"1.5"'),
    });

    expect(fixture.signTransaction).not.toHaveBeenCalled();
    expect(
      fixture.transport.request.mock.calls.map(([call]) => call.method),
    ).not.toContain("eth_sendRawTransaction");
  });

  test.each([-1n, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "error: rejects invalid transactionMaxFee %s before signing",
    async (transactionMaxFee) => {
      const fixture = await setup({ transactionMaxFee });

      await expect(fixture.prepared.submit()).rejects.toBeInstanceOf(
        InvalidTransactionMaxFeeError,
      );

      expect(fixture.signTransaction).not.toHaveBeenCalled();
    },
  );

  test("error: rejects a non-object wallet config before signing", async () => {
    const fixture = await setup({ transactionMaxFee: 100n });
    Reflect.set(fixture.account, "_config", null);

    await expect(fixture.prepared.submit()).rejects.toMatchObject({
      constructor: InvalidTransactionMaxFeeError,
      message: expect.stringContaining('"null"'),
    });

    expect(fixture.signTransaction).not.toHaveBeenCalled();
    expect(
      fixture.transport.request.mock.calls.map(([call]) => call.method),
    ).not.toContain("eth_sendRawTransaction");
  });

  test("behavior: broadcasts when both OP Stack fees fit under a generous cap", async () => {
    const fixture = await setup({
      transactionMaxFee: 1_000n,
      l1Fee: 10n,
      operatorFee: 10n,
    });

    await expect(fixture.prepared.submit()).resolves.toEqual({
      hash: HASH,
      fee: 100n,
    });

    expect(fixture.l1Transactions).toEqual([EXPECTED_SERIALIZED_TRANSACTION]);
    expect(fixture.signTransaction).toHaveBeenCalledOnce();
    expect(
      fixture.transport.request.mock.calls.map(([call]) => call.method),
    ).toContain("eth_sendRawTransaction");
  });

  test("behavior: accepts an integer transactionMaxFee above the safe-integer range", async () => {
    const fixture = await setup({ transactionMaxFee: 1e16 });

    await expect(fixture.prepared.submit()).resolves.toEqual({
      hash: HASH,
      fee: 100n,
    });

    expect(fixture.signTransaction).toHaveBeenCalledOnce();
  });

  test("error: uses the populated EIP-1559 execution cost in the fee cap", async () => {
    const fixture = await setup({
      maxFeePerGas: 2n,
      transactionMaxFee: 150n,
    });

    await expect(fixture.prepared.submit()).rejects.toMatchObject({
      constructor: MaximumFeeExceededError,
      message: expect.stringContaining('execution "200"'),
    });

    expect(fixture.oracleCalls).toHaveLength(2);
    expect(fixture.oracleCalls).toContain("getL1Fee");
    expect(fixture.oracleCalls).toContain("getOperatorFee");
    expect(fixture.l1Transactions).toEqual([
      serializeTransaction({
        chainId: optimism.id,
        ...TRANSACTION,
        gas: 100n,
        nonce: 0,
        maxFeePerGas: 2n,
        maxPriorityFeePerGas: 1n,
      }),
    ]);
    expect(fixture.signTransaction).not.toHaveBeenCalled();
    expect(
      fixture.transport.request.mock.calls.map(([call]) => call.method),
    ).not.toContain("eth_sendRawTransaction");
  });

  test("error: uses the quoted fee when it exceeds the EIP-1559 execution cost", async () => {
    const fixture = await setup({
      maxFeePerGas: 1n,
      quotedFee: 500n,
      transactionMaxFee: 300n,
      l1Fee: 0n,
      operatorFee: 0n,
    });
    fixture.signTransaction.mockResolvedValue(
      serializeTransaction({
        chainId: optimism.id,
        ...TRANSACTION,
        gas: 100n,
        nonce: 0,
        maxFeePerGas: 1n,
        maxPriorityFeePerGas: 1n,
        r: "0x1",
        s: "0x1",
        yParity: 0,
      }),
    );

    await expect(fixture.prepared.submit()).rejects.toMatchObject({
      constructor: MaximumFeeExceededError,
      message: expect.stringContaining('execution "500"'),
    });

    expect(fixture.signTransaction).not.toHaveBeenCalled();
    expect(
      fixture.transport.request.mock.calls.map(([call]) => call.method),
    ).not.toContain("eth_sendRawTransaction");
  });

  test("behavior: skips OP Stack fee reads on mainnet and signs a capped transaction", async () => {
    const fixture = await setup({
      chain: mainnet,
      transactionMaxFee: 1_000n,
    });

    await expect(fixture.prepared.submit()).resolves.toEqual({
      hash: HASH,
      fee: 100n,
    });

    expect(fixture.oracleCalls).toEqual([]);
    expect(fixture.signTransaction).toHaveBeenCalledOnce();
  });

  test("behavior: broadcasts without oracle reads when no fee cap is configured", async () => {
    const fixture = await setup({});

    await expect(fixture.prepared.submit()).resolves.toEqual({
      hash: HASH,
      fee: 100n,
    });

    expect(fixture.l1Transactions).toHaveLength(0);
    expect(fixture.signTransaction).toHaveBeenCalledOnce();
    expect(
      fixture.transport.request.mock.calls.map(([call]) => call.method),
    ).toContain("eth_sendRawTransaction");
  });
});
