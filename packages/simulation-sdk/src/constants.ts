import { ChainId } from "@morpho-org/blue-sdk";
import { type Address, maxUint96 } from "viem";

export const APPROVE_ONLY_ONCE_TOKENS: Partial<Record<number, Address[]>> = {
  [ChainId.EthMainnet]: [
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    "0xD533a949740bb3306d119CC777fa900bA034cd52", // CRV
  ],
};

export const MAX_TOKEN_APPROVALS: Partial<
  Record<number, Record<Address, bigint>>
> = {
  [ChainId.EthMainnet]: {
    "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984": maxUint96, // UNI --> see https://github.com/Uniswap/governance/blob/eabd8c71ad01f61fb54ed6945162021ee419998e/contracts/Uni.sol#L154
  },
};
