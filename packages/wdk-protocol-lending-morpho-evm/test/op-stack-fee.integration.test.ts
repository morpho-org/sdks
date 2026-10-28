import { getChainAddress } from "@morpho-org/blue-sdk";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { MaximumFeeExceededError } from "@tetherto/wdk-wallet";
import { WalletAccountEvm } from "@tetherto/wdk-wallet-evm";
import { type Address, erc20Abi, type Hash, parseEther } from "viem";
import { optimism } from "viem/chains";
import { describe, expect } from "vitest";
import MorphoProtocolEvm from "../src/index.js";

const SEED =
  "cook voyage document eight skate token alien guide drink uncle term abuse";
const VAULT: Address = "0x3d63934715b6D4c4DFbBC1a00Fe2A2145079DD76";
const maybeDescribe = process.env.ERPC_SECRET ? describe : describe.skip;

const test = createViemTest(optimism, {
  forkUrl: getErpcForkUrl(optimism.id, process.env.ERPC_SECRET),
  chainId: optimism.id,
  forkBlockNumber: 158_700_000n,
  stepsTracing: false,
});

maybeDescribe("MorphoProtocolEvm OP Stack fee cap", () => {
  test("behavior: rejects an OP Stack submission whose L1-inclusive fee exceeds transactionMaxFee", async ({
    client,
  }) => {
    const provider = client.transport.url!;
    const token = getChainAddress(10, "wNative");
    const options = { token, nativeAmount: 10n ** 15n };
    const account = new WalletAccountEvm(SEED, "0'/0/0", { provider });
    const owner = (await account.getAddress()) as Address;
    await client.setCode({ address: owner, bytecode: "0x" });
    await client.setBalance({ address: owner, value: parseEther("10") });
    const morpho = new MorphoProtocolEvm(account, {
      chainId: optimism.id,
      earnVaultAddress: VAULT,
    });
    const prepared = await morpho.prepareSupply(options);
    expect(await prepared.getRequirements()).toEqual([]);
    const { fee } = await prepared.quote();
    const sharesBefore = await client.readContract({
      address: VAULT,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });

    const cappedAccount = new WalletAccountEvm(SEED, "0'/0/0", {
      provider,
      transactionMaxFee: fee,
    });
    const cappedMorpho = new MorphoProtocolEvm(cappedAccount, {
      chainId: optimism.id,
      earnVaultAddress: VAULT,
    });
    const cappedPrepared = await cappedMorpho.prepareSupply(options);
    const submission = await cappedPrepared.submit().then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    );
    if ("result" in submission)
      await client.waitForTransactionReceipt({
        hash: submission.result.hash as Hash,
      });
    const sharesAfter = await client.readContract({
      address: VAULT,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });

    expect(sharesAfter).toBe(sharesBefore);
    expect("error" in submission ? submission.error : undefined).toBeInstanceOf(
      MaximumFeeExceededError,
    );
  });

  test("behavior: an OP Stack submission succeeds when transactionMaxFee covers L1 fees", async ({
    client,
  }) => {
    const provider = client.transport.url!;
    const token = getChainAddress(10, "wNative");
    const options = { token, nativeAmount: 10n ** 15n };
    const account = new WalletAccountEvm(SEED, "0'/0/0", { provider });
    const owner = (await account.getAddress()) as Address;
    await client.setCode({ address: owner, bytecode: "0x" });
    await client.setBalance({ address: owner, value: parseEther("10") });
    const morpho = new MorphoProtocolEvm(account, {
      chainId: optimism.id,
      earnVaultAddress: VAULT,
    });
    const prepared = await morpho.prepareSupply(options);
    const { fee } = await prepared.quote();

    const cappedAccount = new WalletAccountEvm(SEED, "0'/0/0", {
      provider,
      transactionMaxFee: fee * 10n + 10n ** 15n,
    });
    const cappedMorpho = new MorphoProtocolEvm(cappedAccount, {
      chainId: optimism.id,
      earnVaultAddress: VAULT,
    });
    const cappedPrepared = await cappedMorpho.prepareSupply(options);
    const result = await cappedPrepared.submit();
    const receipt = await client.waitForTransactionReceipt({
      hash: result.hash as Hash,
    });

    expect(receipt.status).toBe("success");
  });
});
