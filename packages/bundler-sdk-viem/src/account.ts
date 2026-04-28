import type { Account, Chain, Client, Transport } from "viem";
import { getAddresses } from "viem/actions";

export async function getSigningAccount(
  client: Client,
  account?: Account,
): Promise<Account> {
  if (account != null) return account;

  const clientAccount = client.account;

  if (clientAccount?.type !== "json-rpc") {
    if (clientAccount != null) return clientAccount;

    const [address] = await getAddresses(client);
    if (address == null) throw new Error("No account available for signing");

    return { address, type: "json-rpc" };
  }

  const [address] = await getAddresses(client);

  return {
    ...clientAccount,
    address: address ?? clientAccount.address,
  };
}

export type SigningClient = Client<Transport, Chain | undefined, Account>;
