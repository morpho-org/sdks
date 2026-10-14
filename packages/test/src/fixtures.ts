import { checksumAddress } from "viem";
import { mnemonicToAccount } from "viem/accounts";

export type {
  MidnightAdapterCollateralCap,
  MidnightAdapterMarketCap,
  VaultV2MidnightAdapterFixture,
  VaultV2MidnightAdapterFixtureAdapter,
} from "./vaultV2MidnightFixture.js";
export {
  advanceVaultV2MidnightFixtureTime,
  BASE_MIDNIGHT_FORK_BLOCK_NUMBER,
  configureVaultV2MidnightAdapterCaps,
  createVaultV2MidnightAdapterFixture,
  MAX_MIDNIGHT_ADAPTER_MARKETS,
  takeVaultV2MidnightAdapterOffer,
} from "./vaultV2MidnightFixture.js";

let seed = 1;
const seededRandom = () => {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};

export const randomAddress = (chainId?: number) =>
  checksumAddress(
    `0x${new Array(40)
      .fill(0)
      .map(() => Math.floor(seededRandom() * 16).toString(16))
      .join("")}`,
    chainId,
  );

export const testAccount = (addressIndex?: number) =>
  mnemonicToAccount(
    "test test test test test test test test test test test junk",
    { addressIndex },
  );
