import { checksumAddress } from "viem";
import { mnemonicToAccount } from "viem/accounts";

export const randomAddress = (chainId?: number) =>
  checksumAddress(
    `0x${new Array(40)
      .fill(0)
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join("")}`,
    chainId,
  );

export const testAccount = (addressIndex?: number) =>
  mnemonicToAccount(
    "test test test test test test test test test test test junk",
    { addressIndex },
  );
