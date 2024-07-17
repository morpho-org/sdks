import { Provider } from "ethers";
import { ViewOverrides } from "ethers-types/dist/common";
import {} from "ethers-types/dist/token/ERC20/ERC20";

import {
  Address,
  ChainId,
  ChainUtils,
  User,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { MorphoBlue__factory } from "ethers-types";

export async function fetchUser(
  address: Address,
  runner: { provider: Provider },
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const { morpho, bundler } = getChainAddresses(chainId);
  const blue = MorphoBlue__factory.connect(morpho, runner);

  const [isBundlerAuthorized, morphoNonce] = await Promise.all([
    blue.isAuthorized(address, bundler, overrides),
    blue.nonce(address, overrides),
  ]);

  return new User({
    address,
    isBundlerAuthorized,
    morphoNonce,
  });
}
