import { mnemonicToAccount } from "viem/accounts";

export const testAccount = (addressIndex?: number) =>
  mnemonicToAccount(
    "test test test test test test test test test test test junk",
    { addressIndex },
  );
