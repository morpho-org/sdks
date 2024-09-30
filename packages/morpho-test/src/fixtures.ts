import { getAddress } from "ethers";

export const createRandomAddress = () =>
  getAddress(
    "0x" +
      new Array(40)
        .fill(0)
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join(""),
  ) as `0x${string}`;
