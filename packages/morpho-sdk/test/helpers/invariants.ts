import {
  type AccrualPosition,
  getChainAddresses,
  type MarketParams,
} from "@morpho-org/blue-sdk";
import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { entries } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import { type Address, type Block, type Chain, erc4626Abi } from "viem";
import { expect } from "vitest";

export interface MarketInvariant {
  block: Block;
  morphoLoanTokenBalance: bigint;
  morphoCollateralTokenBalance: bigint;
  userNativeBalance: bigint;
  userLoanTokenBalance: bigint;
  userCollateralTokenBalance: bigint;
  position: AccrualPosition;
  bundlerLoanTokenBalances: bigint[];
  bundlerCollateralTokenBalances: bigint[];
}

export interface VaultInvariant {
  block: Block;
  vaultBalance: bigint;
  morphoAssetBalance: bigint;
  morphoSharesBalance: bigint;
  userAssetBalance: bigint;
  userAssetBalanceInShares: bigint;
  userSharesBalance: bigint;
  userSharesBalanceInAssets: bigint;
  userNativeBalance: bigint;
  maxWithdraw: bigint;
  maxRedeem: bigint;
  bundlerAssetBalances: bigint[];
  bundlerSharesBalances: bigint[];
}

export interface HoldingInvariant {
  block: Block;
  morphoBalance: bigint;
  userBalance: bigint;
  bundlerBalances: bigint[];
}

export type MarketParamsMap<T extends string = string> = {
  [K in T]: MarketParams;
};

export interface VaultParams {
  address: Address;
  asset: Address;
}

export type VaultParamsMap<T extends string = string> = {
  [K in T]: VaultParams;
};

export type HoldingParamsMap<T extends string = string> = {
  [K in T]: Address;
};

export interface ActionParams<
  TMarketName extends string = string,
  TVaultName extends string = string,
  THoldingName extends string = string,
> {
  markets?: MarketParamsMap<TMarketName>;
  vaults?: VaultParamsMap<TVaultName>;
  holdings?: HoldingParamsMap<THoldingName>;
}

export interface MarketInvariantResult {
  initialState: MarketInvariant;
  finalState: MarketInvariant;
  accruedInterest: bigint;
  marketAccruedInterest: bigint;
}

export interface VaultInvariantResult {
  initialState: VaultInvariant;
  finalState: VaultInvariant;
}

export interface HoldingInvariantResult {
  initialState: HoldingInvariant;
  finalState: HoldingInvariant;
}

export type MarketInvariantResults<T extends string> = {
  [K in T]: MarketInvariantResult;
};

export type VaultInvariantResults<T extends string> = {
  [K in T]: VaultInvariantResult;
};

export type HoldingInvariantResults<T extends string> = {
  [K in T]: HoldingInvariantResult;
};

export interface InvariantCheckResult<
  TMarketName extends string,
  TVaultName extends string,
  THoldingName extends string,
> {
  markets: MarketInvariantResults<TMarketName>;
  vaults: VaultInvariantResults<TVaultName>;
  holdings: HoldingInvariantResults<THoldingName>;
}

export interface InvariantCheck<
  TMarketName extends string = string,
  TVaultName extends string = string,
  THoldingName extends string = string,
> {
  client: AnvilTestClient<Chain>;
  params: ActionParams<TMarketName, TVaultName, THoldingName>;
  actionFn: () => Promise<void>;
}

/**
 * Resolve every bundler contract whose balance must be conserved by a bundle:
 * the Bundler3 executor and its adapters, plus the standalone bundle periphery
 * contracts (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1). Optional
 * addresses absent on a chain are filtered out so the returned order matches the
 * balances fetched alongside it.
 * @param chainId - The chain id to resolve the bundler contracts for
 * @returns The named, defined bundler and bundle contract addresses
 */
const _getBundlerContracts = (
  chainId: number,
): { name: string; address: Address }[] => {
  const { bundler3, bundles } = getChainAddresses(chainId);
  return [...entries(bundler3), ...entries(bundles)]
    .map(([name, address]) => ({ name: String(name), address }))
    .filter(
      (contract): contract is { name: string; address: Address } =>
        contract.address != null,
    );
};

/**
 * Validate that every bundler and bundle contract holds no residual balance
 * after a bundle by asserting each final balance equals its initial snapshot.
 * @param contracts - The named bundler contracts, in balance order
 * @param initialBalances - The initial balances to validate
 * @param finalBalances - The final balances to validate
 * @param balanceType - The type of balance to validate
 */
const _validateBundlerBalances = ({
  contracts,
  initialBalances,
  finalBalances,
  balanceType,
}: {
  contracts: { name: string; address: Address }[];
  initialBalances: bigint[];
  finalBalances: bigint[];
  balanceType: string;
}): void => {
  for (const [index, value] of initialBalances.entries()) {
    expect(
      value,
      `${contracts[index]?.name} ${balanceType} should be 0`,
    ).toEqual(finalBalances[index]);
  }
};

/**
 * Fetch the state of a market operation
 * @param client - The client to use for the test
 * @param market - The market to fetch the state of
 * @returns The state of the market operation
 */
const _fetchMarketOperationState = async ({
  client,
  market,
}: {
  client: AnvilTestClient<Chain>;
  market: MarketParams;
}): Promise<MarketInvariant> => {
  const { loanToken, collateralToken } = market;

  const { morpho } = getChainAddresses(client.chain.id);
  const bundlerContracts = _getBundlerContracts(client.chain.id);

  const [
    block,
    morphoLoanTokenBalance,
    morphoCollateralTokenBalance,
    userNativeBalance,
    userLoanTokenBalance,
    userCollateralTokenBalance,
    position,
    bundlerLoanTokenBalances,
    bundlerCollateralTokenBalances,
  ] = await Promise.all([
    client.getBlock(),
    client.balanceOf({ erc20: loanToken, owner: morpho }),
    client.balanceOf({ erc20: collateralToken, owner: morpho }),
    client.balanceOf({}),
    client.balanceOf({ erc20: loanToken }),
    client.balanceOf({ erc20: collateralToken }),
    fetchAccrualPosition(client.account.address, market.id, client),
    Promise.all(
      bundlerContracts.map(({ address }) =>
        client.balanceOf({ erc20: loanToken, owner: address }),
      ),
    ),
    Promise.all(
      bundlerContracts.map(({ address }) =>
        client.balanceOf({ erc20: collateralToken, owner: address }),
      ),
    ),
  ]);

  return {
    block,
    morphoLoanTokenBalance,
    morphoCollateralTokenBalance,
    userNativeBalance,
    userLoanTokenBalance,
    userCollateralTokenBalance,
    position,
    bundlerLoanTokenBalances,
    bundlerCollateralTokenBalances,
  };
};

/**
 * Fetch the state of a vault operation
 * @param client - The client to use for the test
 * @param vault - The vault to fetch the state of
 * @returns The state of the vault operation
 */
const _fetchVaultOperationState = async ({
  client,
  vault,
}: {
  client: AnvilTestClient<Chain>;
  vault: {
    address: Address;
    asset: Address;
  };
}): Promise<VaultInvariant> => {
  const { asset, address } = vault;

  const { morpho } = getChainAddresses(client.chain.id);
  const bundlerContracts = _getBundlerContracts(client.chain.id);

  const [
    block,
    vaultBalance,
    morphoAssetBalance,
    morphoSharesBalance,
    userAssetBalance,
    userSharesBalance,
    userNativeBalance,
    bundlerAssetBalances,
    bundlerSharesBalances,
    maxWithdraw,
    maxRedeem,
  ] = await Promise.all([
    client.getBlock(),
    client.balanceOf({ erc20: asset, owner: address }),
    client.balanceOf({ erc20: asset, owner: morpho }),
    client.balanceOf({ erc20: address, owner: morpho }),
    client.balanceOf({ erc20: asset }),
    client.balanceOf({ erc20: address }),
    client.balanceOf({}),
    Promise.all(
      bundlerContracts.map(({ address: owner }) =>
        client.balanceOf({ erc20: asset, owner }),
      ),
    ),
    Promise.all(
      bundlerContracts.map(({ address: owner }) =>
        client.balanceOf({ erc20: address, owner }),
      ),
    ),
    client.maxWithdraw({ erc4626: address }),
    client.readContract({
      abi: erc4626Abi,
      address: vault.address,
      functionName: "maxRedeem",
      args: [client.account.address],
    }),
  ]);

  const [userAssetBalanceInShares, userSharesBalanceInAssets] =
    await Promise.all([
      client.convertToShares({
        erc4626: vault.address,
        assets: userAssetBalance,
      }),
      client.convertToAssets({
        erc4626: vault.address,
        shares: userSharesBalance,
      }),
    ]);

  return {
    block,
    vaultBalance,
    morphoAssetBalance,
    morphoSharesBalance,
    userAssetBalance,
    userAssetBalanceInShares,
    userSharesBalance,
    userSharesBalanceInAssets,
    userNativeBalance,
    maxWithdraw,
    maxRedeem,
    bundlerAssetBalances,
    bundlerSharesBalances,
  };
};

/**
 * Fetch the state of a holding operation
 * @param client - The client to use for the test
 * @param address - The address of the holding
 * @returns The state of the holding operation
 */
const _fetchHoldingOperationState = async ({
  client,
  address,
}: {
  client: AnvilTestClient<Chain>;
  address: Address;
}): Promise<HoldingInvariant> => {
  const { morpho } = getChainAddresses(client.chain.id);
  const bundlerContracts = _getBundlerContracts(client.chain.id);
  const [block, morphoBalance, userBalance, bundlerBalances] =
    await Promise.all([
      client.getBlock(),
      client.balanceOf({
        erc20: address,
        owner: morpho,
      }),
      client.balanceOf({
        erc20: address,
        owner: client.account.address,
      }),
      Promise.all(
        bundlerContracts.map(({ address: owner }) =>
          client.balanceOf({ owner }),
        ),
      ),
    ]);

  return {
    block,
    morphoBalance,
    userBalance,
    bundlerBalances,
  };
};

/**
 * Build a map of market parameters and initial states
 * @param client - The client to use for the test
 * @param markets - The map of market parameters
 * @returns The map of market parameters and initial states
 */
const _buildMarketInitialState = async <TMarketName extends string>({
  client,
  markets,
}: {
  client: AnvilTestClient<Chain>;
  markets?: MarketParamsMap<TMarketName>;
}): Promise<
  Map<TMarketName, { params: MarketParams; initialState: MarketInvariant }>
> => {
  const marketMap = new Map();

  if (!markets) return marketMap;

  for (const [name, marketParams] of Object.entries(markets) as [
    TMarketName,
    MarketParams,
  ][]) {
    const initialState = await _fetchMarketOperationState({
      client,
      market: marketParams,
    });
    marketMap.set(name, { params: marketParams, initialState });
  }

  return marketMap;
};

/**
 * Build a map of vault parameters and initial states
 * @param client - The client to use for the test
 * @param vaults - The map of vault parameters
 * @returns The map of vault parameters and initial states
 */
const _buildVaultInitialState = async <TVaultName extends string>({
  client,
  vaults,
}: {
  client: AnvilTestClient<Chain>;
  vaults?: VaultParamsMap<TVaultName>;
}): Promise<
  Map<TVaultName, { params: VaultParams; initialState: VaultInvariant }>
> => {
  const vaultMap = new Map();

  if (!vaults) return vaultMap;

  for (const [name, vaultParams] of Object.entries(vaults) as [
    TVaultName,
    VaultParams,
  ][]) {
    const initialState = await _fetchVaultOperationState({
      client,
      vault: vaultParams,
    });
    vaultMap.set(name, { params: vaultParams, initialState });
  }

  return vaultMap;
};

/**
 * Build a map of holding parameters and initial states
 * @param client - The client to use for the test
 * @param holdings - The map of holding parameters
 * @returns The map of holding parameters and initial states
 */
const _buildHoldingInitialState = async <THoldingName extends string>({
  client,
  holdings,
}: {
  client: AnvilTestClient<Chain>;
  holdings?: HoldingParamsMap<THoldingName>;
}): Promise<
  Map<THoldingName, { params: Address; initialState: HoldingInvariant }>
> => {
  const holdingMap = new Map();

  if (!holdings) return holdingMap;

  for (const [name, holdingParams] of Object.entries(holdings) as [
    THoldingName,
    Address,
  ][]) {
    const initialState = await _fetchHoldingOperationState({
      client,
      address: holdingParams,
    });
    holdingMap.set(name, { params: holdingParams, initialState });
  }

  return holdingMap;
};

/**
 * Build the final state of a market operation
 * @param client - The client to use for the test
 * @param marketMap - The map of market parameters and initial states
 * @returns The results of the test
 */
const _buildMarketFinalState = async <TMarketName extends string>({
  client,
  marketMap,
}: {
  client: AnvilTestClient<Chain>;
  marketMap: Map<
    TMarketName,
    { params: MarketParams; initialState: MarketInvariant }
  >;
}): Promise<MarketInvariantResults<TMarketName>> => {
  const results = {} as MarketInvariantResults<TMarketName>;

  for (const [name, { params, initialState }] of marketMap.entries()) {
    const finalState = await _fetchMarketOperationState({
      client,
      market: params,
    });

    const bundlerContracts = _getBundlerContracts(client.chain.id);

    _validateBundlerBalances({
      contracts: bundlerContracts,
      initialBalances: initialState.bundlerLoanTokenBalances,
      finalBalances: finalState.bundlerLoanTokenBalances,
      balanceType: "loan token balance",
    });

    _validateBundlerBalances({
      contracts: bundlerContracts,
      initialBalances: initialState.bundlerCollateralTokenBalances,
      finalBalances: finalState.bundlerCollateralTokenBalances,
      balanceType: "collateral token balance",
    });

    const accrued = initialState.position.accrueInterest(
      finalState.block.timestamp,
    );

    results[name] = {
      initialState,
      finalState,
      accruedInterest:
        accrued.borrowAssets - initialState.position.borrowAssets,
      marketAccruedInterest:
        accrued.market.totalSupplyAssets -
        initialState.position.market.totalSupplyAssets,
    };
  }

  return results;
};

/**
 * Build the final state of a vault operation
 * @param client - The client to use for the test
 * @param vaultMap - The map of vault parameters and initial states
 * @returns The results of the test
 */
const _buildVaultFinalState = async <TVaultName extends string>({
  client,
  vaultMap,
}: {
  client: AnvilTestClient<Chain>;
  vaultMap: Map<
    TVaultName,
    { params: VaultParams; initialState: VaultInvariant }
  >;
}): Promise<VaultInvariantResults<TVaultName>> => {
  const results = {} as VaultInvariantResults<TVaultName>;

  for (const [name, { params, initialState }] of vaultMap.entries()) {
    const finalState = await _fetchVaultOperationState({
      client,
      vault: params,
    });

    const bundlerContracts = _getBundlerContracts(client.chain.id);

    _validateBundlerBalances({
      contracts: bundlerContracts,
      initialBalances: initialState.bundlerAssetBalances,
      finalBalances: finalState.bundlerAssetBalances,
      balanceType: "asset balance",
    });

    _validateBundlerBalances({
      contracts: bundlerContracts,
      initialBalances: initialState.bundlerSharesBalances,
      finalBalances: finalState.bundlerSharesBalances,
      balanceType: "shares balance",
    });

    results[name] = {
      initialState,
      finalState,
    };
  }

  return results;
};

/**
 * Build the final state of a holding operation
 * @param client - The client to use for the test
 * @param holdingMap - The map of holding parameters and initial states
 * @returns The results of the test
 */
const _buildHoldingFinalState = async <THoldingName extends string>({
  client,
  holdingMap,
}: {
  client: AnvilTestClient<Chain>;
  holdingMap: Map<
    THoldingName,
    { params: Address; initialState: HoldingInvariant }
  >;
}): Promise<HoldingInvariantResults<THoldingName>> => {
  const results = {} as HoldingInvariantResults<THoldingName>;

  for (const [name, { params, initialState }] of holdingMap.entries()) {
    const finalState = await _fetchHoldingOperationState({
      client,
      address: params,
    });

    results[name] = {
      initialState,
      finalState,
    };
  }

  return results;
};

/**
 * Test a market operation and check invariants
 * @param client - The client to use for the test
 * @param params - The parameters for the test
 * @param actionFn - The function to execute the test
 * @returns The results of the test
 */
export const testInvariants = async <
  TMarketName extends string,
  TVaultName extends string,
  THoldingName extends string,
>({
  client,
  params,
  actionFn,
}: InvariantCheck<TMarketName, TVaultName, THoldingName>): Promise<
  InvariantCheckResult<TMarketName, TVaultName, THoldingName>
> => {
  const [marketInitialState, vaultInitialState, holdingInitialState] =
    await Promise.all([
      _buildMarketInitialState<TMarketName>({
        client,
        markets: params.markets,
      }),
      _buildVaultInitialState<TVaultName>({
        client,
        vaults: params.vaults,
      }),
      _buildHoldingInitialState<THoldingName>({
        client,
        holdings: params.holdings,
      }),
    ]);

  await actionFn();

  const [markets, vaults, holdings] = await Promise.all([
    _buildMarketFinalState<TMarketName>({
      client,
      marketMap: marketInitialState,
    }),
    _buildVaultFinalState<TVaultName>({
      client,
      vaultMap: vaultInitialState,
    }),
    _buildHoldingFinalState<THoldingName>({
      client,
      holdingMap: holdingInitialState,
    }),
  ]);

  return {
    markets,
    vaults,
    holdings,
  };
};
