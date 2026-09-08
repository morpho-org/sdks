import {
  ChainIdMismatchError,
  type Erc2612RequirementSignature,
  type RequirementSignature,
} from "@morpho-org/morpho-sdk";
import { createMockClient } from "@morpho-org/test/mock";
import { WalletAccountEvm } from "@tetherto/wdk-wallet-evm";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import MorphoProtocolEvm, {
  type ApprovalOrSignatureRequirement,
  UnresolvedVaultWithdrawRequirementsError,
} from "./morpho-protocol-evm.js";

const { extension } = vi.hoisted(() => ({ extension: vi.fn() }));

// These tests exercise adapter delegation. Keep viem real and intercept chain reads at transport.
vi.mock("@morpho-org/morpho-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@morpho-org/morpho-sdk")>()),
  morphoViemExtension: extension,
}));

const TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const VAULT = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
const OPTIONS = { token: TOKEN, amount: 1_000_000n };

const setup = () => {
  const transport = createMockClient(mainnet);
  const account = new WalletAccountEvm(
    "cook voyage document eight skate token alien guide drink uncle term abuse",
    "0'/0/0",
    { provider: { request: transport.request } },
  );
  const send = vi.spyOn(account, "sendTransaction");
  const quote = vi
    .spyOn(account, "quoteSendTransaction")
    .mockResolvedValue({ fee: 12_345n });
  const transaction = { to: VAULT, data: "0x1234", value: 0n } as const;
  const action = {
    getRequirements: vi
      .fn<() => Promise<readonly ApprovalOrSignatureRequirement[]>>()
      .mockResolvedValue([]),
    buildTx: vi.fn(
      (_signatures?: readonly RequirementSignature[]) => transaction,
    ),
  };
  const withdraw = vi.fn(() => action);
  extension.mockReturnValue(() => ({
    morpho: {
      vaultV2: () => ({ getData: async () => ({ asset: TOKEN }), withdraw }),
    },
  }));
  const protocol = new MorphoProtocolEvm(account, {
    chainId: mainnet.id,
    earnVaultAddress: VAULT,
  });
  return { transport, action, withdraw, transaction, send, quote, protocol };
};

describe.sequential("prepared withdrawal adapter", () => {
  test.each(["getRequirements", "submit", "quote"] as const)(
    "error: ChainIdMismatchError after a provider switch (%s)",
    async (method) => {
      const { protocol, transport, action, send, quote } = setup();
      const prepared = await protocol.prepareWithdraw(OPTIONS);
      transport.request.mockResolvedValue("0x2105");

      await expect(prepared[method]()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );

      expect(action.getRequirements).not.toHaveBeenCalled();
      expect(action.buildTx).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(quote).not.toHaveBeenCalled();
      expect(
        transport.request.mock.calls.every(
          ([call]) => call.method === "eth_chainId",
        ),
      ).toBe(true);
    },
  );

  test.each(["submit", "quote"] as const)(
    "error: ChainIdMismatchError before using a signed permit (%s)",
    async (method) => {
      const { protocol, transport, action, send, quote } = setup();
      const prepared = await protocol.prepareWithdraw(OPTIONS);
      // Permit content is irrelevant: chain validation must reject before the action sees it.
      const signature = {} as Erc2612RequirementSignature;
      transport.request.mockResolvedValue("0x2105");

      await expect(prepared[method](signature)).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );

      expect(action.getRequirements).not.toHaveBeenCalled();
      expect(action.buildTx).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(quote).not.toHaveBeenCalled();
    },
  );

  test.each(["immediate", "prepared"] as const)(
    "error: UnresolvedVaultWithdrawRequirementsError before an unsigned quote (%s)",
    async (route) => {
      const { protocol, action, quote } = setup();
      // Only requirement presence matters to this adapter; exact allowance math is SDK-owned.
      action.getRequirements.mockResolvedValue([
        {} as ApprovalOrSignatureRequirement,
      ]);
      const prepared =
        route === "prepared"
          ? await protocol.prepareWithdraw(OPTIONS)
          : undefined;

      await expect(
        prepared ? prepared.quote() : protocol.quoteWithdraw(OPTIONS),
      ).rejects.toMatchObject({
        constructor: UnresolvedVaultWithdrawRequirementsError,
        requirementCount: 1,
      });

      expect(action.buildTx).not.toHaveBeenCalled();
      expect(quote).not.toHaveBeenCalled();
    },
  );

  test.each(["immediate", "prepared"] as const)(
    "behavior: quotes when the exact share allowance is satisfied (%s)",
    async (route) => {
      const { protocol, action, transaction, quote } = setup();
      const prepared =
        route === "prepared"
          ? await protocol.prepareWithdraw(OPTIONS)
          : undefined;

      await expect(
        prepared ? prepared.quote() : protocol.quoteWithdraw(OPTIONS),
      ).resolves.toEqual({ fee: 12_345n });

      expect(action.getRequirements).toHaveBeenCalledOnce();
      expect(action.buildTx).toHaveBeenCalledWith(undefined);
      expect(quote).toHaveBeenCalledWith(transaction);
    },
  );

  test("behavior: rechecks prerequisites on the same handle after an approval", async () => {
    const { protocol, action, withdraw, quote } = setup();
    action.getRequirements
      .mockResolvedValueOnce([{} as ApprovalOrSignatureRequirement])
      .mockResolvedValueOnce([]);
    const prepared = await protocol.prepareWithdraw(OPTIONS);

    await expect(prepared.quote()).rejects.toBeInstanceOf(
      UnresolvedVaultWithdrawRequirementsError,
    );
    await expect(prepared.quote()).resolves.toEqual({ fee: 12_345n });

    expect(withdraw).toHaveBeenCalledOnce();
    expect(quote).toHaveBeenCalledOnce();
  });

  test("behavior: forwards the signed share permit to the captured action when quoting", async () => {
    const { protocol, action, withdraw, transaction, quote } = setup();
    const prepared = await protocol.prepareWithdraw(OPTIONS);
    // The adapter forwards the signature; the SDK builder validates its contents.
    const signature = {
      action: { type: "permit" },
    } as Erc2612RequirementSignature;

    await expect(prepared.quote(signature)).resolves.toEqual({ fee: 12_345n });

    expect(action.buildTx).toHaveBeenCalledWith([signature]);
    expect(withdraw).toHaveBeenCalledOnce();
    expect(quote).toHaveBeenCalledWith(transaction);
  });

  test("behavior: propagates requirement-read failures without estimating gas", async () => {
    const { protocol, action, quote } = setup();
    const failure = new Error("RPC unavailable");
    action.getRequirements.mockRejectedValue(failure);
    const prepared = await protocol.prepareWithdraw(OPTIONS);

    await expect(prepared.quote()).rejects.toBe(failure);

    expect(action.buildTx).not.toHaveBeenCalled();
    expect(quote).not.toHaveBeenCalled();
  });
});
