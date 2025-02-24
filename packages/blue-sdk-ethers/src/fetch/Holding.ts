import { MaxUint256, type Provider } from "ethers";
import {
  BackedWhitelistControllerAggregatorV2__factory,
  ERC20__factory,
  ERC2612__factory,
  PermissionedERC20Wrapper__factory,
  Permit2__factory,
  WrappedBackedToken__factory,
} from "ethers-types";

import {
  type Address,
  ChainUtils,
  ERC20_ALLOWANCE_RECIPIENTS,
  Holding,
  NATIVE_ADDRESS,
  getChainAddresses,
  permissionedBackedTokens,
  permissionedWrapperTokens,
} from "@morpho-org/blue-sdk";
import { fromEntries, getValue } from "@morpho-org/morpho-ts";
import type { FetchOptions } from "../types";

export async function fetchHolding(
  user: Address,
  token: Address,
  runner: { provider: Provider },
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const chainAddresses = getChainAddresses(chainId);

  if (token === NATIVE_ADDRESS)
    return new Holding({
      user,
      token,
      erc20Allowances: fromEntries(
        ERC20_ALLOWANCE_RECIPIENTS.map((label) => [label, MaxUint256]),
      ),
      permit2BundlerAllowance: {
        amount: 0n,
        expiration: 0n,
        nonce: 0n,
      },
      balance: await runner.provider.getBalance(user, overrides.blockTag),
    });

  const erc20 = ERC20__factory.connect(token, runner);
  const erc2612 = ERC2612__factory.connect(token, runner);

  const [
    balance,
    erc20Allowances,
    permit2BundlerAllowance,
    erc2612Nonce,
    whitelistControllerAggregator,
    hasErc20WrapperPermission,
  ] = await Promise.all([
    erc20.balanceOf(user, overrides),
    Promise.all(
      ERC20_ALLOWANCE_RECIPIENTS.map(async (label) => {
        const spender = getValue(chainAddresses, label);
        if (spender == null) return [label, 0n] as const;

        return [
          label,
          await erc20.allowance(user, spender, overrides),
        ] as const;
      }),
    ),
    chainAddresses.permit2 != null
      ? Permit2__factory.connect(chainAddresses.permit2, runner).allowance(
          user,
          token,
          chainAddresses.bundler3.bundler3,
          overrides,
        )
      : { amount: 0n, expiration: 0n, nonce: 0n },
    erc2612.nonces(user, overrides).catch(() => undefined),
    permissionedBackedTokens[chainId].has(token)
      ? WrappedBackedToken__factory.connect(
          token,
          runner,
        ).whitelistControllerAggregator(overrides)
      : undefined,
    PermissionedERC20Wrapper__factory.connect(token, runner)
      .hasPermission(user, overrides)
      .catch(() => !permissionedWrapperTokens[chainId].has(token)),
  ]);

  const holding = new Holding({
    user,
    token,
    erc20Allowances: fromEntries(erc20Allowances),
    permit2BundlerAllowance,
    erc2612Nonce,
    balance,
    canTransfer: hasErc20WrapperPermission,
  });

  if (whitelistControllerAggregator)
    holding.canTransfer =
      await BackedWhitelistControllerAggregatorV2__factory.connect(
        whitelistControllerAggregator,
        runner,
      )
        .isWhitelisted(user, overrides)
        .catch(() => undefined);

  return holding;
}
