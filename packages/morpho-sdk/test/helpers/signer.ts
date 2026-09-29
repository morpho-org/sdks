import { createWalletClient, custom, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

/** A local signer whose transport throws on any RPC request. */
export const signerAccount = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
export const signerAddress = signerAccount.address;
export const signerWalletClient: WalletClient = createWalletClient({
  account: signerAccount,
  chain: mainnet,
  transport: custom({
    request: async ({ method }) => {
      throw new Error(`Unexpected RPC request "${method}".`);
    },
  }),
});
