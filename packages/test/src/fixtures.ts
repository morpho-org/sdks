import { checksumAddress } from "viem";

export const randomAddress = (chainId?: number) =>
  checksumAddress(
    `0x${new Array(40)
      .fill(0)
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join("")}`,
    chainId,
  );
