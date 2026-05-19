import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import * as viem from 'viem'

const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const ADDRESS = '0x405005C7c4422390F4B334F64Cf20E0b767131d0'
const TOKEN = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const COLLATERAL = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const VAULT = '0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11'
const MARKET_ID = '0xe7e9694b754c4d4f7e21faf7223f6fa71abaeb10296a4c43a54a7977149687d2'
const MARKET_PARAMS = {
  loanToken: TOKEN,
  collateralToken: COLLATERAL,
  oracle: '0x76b2242ea5BE1FCBBF4206EA09601EA5aB22Af4d',
  irm: '0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC',
  lltv: 860000000000000000n
}

const SUPPLY_TX = { to: '0x0000000000000000000000000000000000000001', value: 0n, data: '0x01' }
const WITHDRAW_TX = { to: '0x0000000000000000000000000000000000000002', value: 0n, data: '0x02' }
const BORROW_TX = { to: '0x0000000000000000000000000000000000000003', value: 0n, data: '0x03' }
const REPAY_TX = { to: '0x0000000000000000000000000000000000000004', value: 0n, data: '0x04' }
const SUPPLY_COLLATERAL_TX = { to: '0x0000000000000000000000000000000000000005', value: 0n, data: '0x05' }
const WITHDRAW_COLLATERAL_TX = { to: '0x0000000000000000000000000000000000000006', value: 0n, data: '0x06' }

const vaultData = {
  address: VAULT,
  asset: TOKEN,
  toAssets: jest.fn((shares) => shares),
  toShares: jest.fn((assets) => assets)
}

const positionData = {
  supplyShares: 11n,
  borrowShares: 22n,
  borrowAssets: 33n,
  collateral: 44n
}

const supplyAction = {
  getRequirements: jest.fn().mockResolvedValue([{ action: { type: 'erc20Approval' } }]),
  buildTx: jest.fn().mockReturnValue(SUPPLY_TX)
}
const withdrawAction = {
  buildTx: jest.fn().mockReturnValue(WITHDRAW_TX)
}
const borrowAction = {
  getRequirements: jest.fn().mockResolvedValue([{ action: { type: 'morphoAuthorization' } }]),
  buildTx: jest.fn().mockReturnValue(BORROW_TX)
}
const repayAction = {
  getRequirements: jest.fn().mockResolvedValue([{ action: { type: 'erc20Approval' } }]),
  buildTx: jest.fn().mockReturnValue(REPAY_TX)
}
const supplyCollateralAction = {
  getRequirements: jest.fn().mockResolvedValue([{ action: { type: 'erc20Approval' } }]),
  buildTx: jest.fn().mockReturnValue(SUPPLY_COLLATERAL_TX)
}
const withdrawCollateralAction = {
  buildTx: jest.fn().mockReturnValue(WITHDRAW_COLLATERAL_TX)
}

const vaultV2Entity = {
  getData: jest.fn().mockResolvedValue(vaultData),
  deposit: jest.fn().mockReturnValue(supplyAction),
  withdraw: jest.fn().mockReturnValue(withdrawAction)
}

const marketEntity = {
  getPositionData: jest.fn().mockResolvedValue(positionData),
  supplyCollateral: jest.fn().mockReturnValue(supplyCollateralAction),
  borrow: jest.fn().mockReturnValue(borrowAction),
  repay: jest.fn().mockReturnValue(repayAction),
  withdrawCollateral: jest.fn().mockReturnValue(withdrawCollateralAction)
}

const vaultV2Mock = jest.fn().mockReturnValue(vaultV2Entity)
const marketV1Mock = jest.fn().mockReturnValue(marketEntity)
const morphoClientMock = jest.fn().mockImplementation(() => ({
  vaultV2: vaultV2Mock,
  marketV1: marketV1Mock
}))
const fetchMarketMock = jest.fn()
const mockGetChainId = jest.fn().mockResolvedValue(1)
const readContractMock = jest.fn().mockResolvedValue(123n)
const extendMock = jest.fn().mockReturnValue({
  account: { address: ADDRESS },
  chain: { id: 1 },
  getChainId: mockGetChainId,
  readContract: readContractMock
})
const createClientMock = jest.fn().mockReturnValue({ extend: extendMock })

jest.unstable_mockModule('@morpho-org/morpho-sdk', () => ({
  MorphoClient: morphoClientMock
}))

jest.unstable_mockModule('@morpho-org/blue-sdk-viem', () => ({
  fetchMarket: fetchMarketMock
}))

jest.unstable_mockModule('viem', () => ({
  ...viem,
  createClient: createClientMock
}))

const { MarketParams } = await import('@morpho-org/blue-sdk')
const { WalletAccountEvm, WalletAccountReadOnlyEvm } = await import('@tetherto/wdk-wallet-evm')
const { WalletAccountEvmErc4337 } = await import('@tetherto/wdk-wallet-evm-erc-4337')
const { default: MorphoProtocolEvm } = await import('../index.js')

describe('MorphoProtocolEvm', () => {
  let account
  let protocol

  beforeEach(() => {
    jest.clearAllMocks()
    fetchMarketMock.mockResolvedValue({
      params: new MarketParams(MARKET_PARAMS)
    })
    mockGetChainId.mockResolvedValue(1)
    readContractMock.mockResolvedValue(123n)

    account = new WalletAccountEvm(SEED, "0'/0/0", {
      provider: 'https://dummy-rpc-url.com'
    })
    account.getAddress = jest.fn().mockResolvedValue(ADDRESS)
    protocol = new MorphoProtocolEvm(account, {
      chainId: 1,
      earnVaultAddress: VAULT,
      borrowMarketParams: MARKET_PARAMS
    })
  })

  describe('supply', () => {
    test('should build a vault deposit with morpho-sdk and send it', async () => {
      account.getTokenBalance = jest.fn().mockResolvedValue(100_000n)
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-supply-hash', fee: 12_345n })

      const result = await protocol.supply({ token: TOKEN, amount: 100_000n })

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1)
      expect(vaultV2Entity.deposit).toHaveBeenCalledWith({
        amount: 100_000n,
        nativeAmount: undefined,
        userAddress: ADDRESS,
        accrualVault: vaultData,
        slippageTolerance: undefined
      })
      expect(account.sendTransaction).toHaveBeenCalledWith(SUPPLY_TX)
      expect(result).toEqual({ hash: 'dummy-supply-hash', fee: 12_345n })
    })

    test('should return supply requirements from morpho-sdk', async () => {
      const requirementOptions = { useSimplePermit: true }
      const requirements = await protocol.getSupplyRequirements({ token: TOKEN, amount: 100_000n }, requirementOptions)

      expect(requirements).toEqual([{ action: { type: 'erc20Approval' } }])
      expect(supplyAction.getRequirements).toHaveBeenCalledWith(requirementOptions)
    })

    test('should use vaultV2 when an explicit vault is configured', async () => {
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS
      })

      account.getTokenBalance = jest.fn().mockResolvedValue(100_000n)
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-supply-hash', fee: 12_345n })

      await protocol.supply({ token: TOKEN, amount: 100_000n })

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1)
    })

    test('should default explicit vault configuration to Morpho Vault V2', async () => {
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS
      })

      await protocol.getVaultPosition()

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1)
    })

    test('should copy options instead of keeping the caller reference', async () => {
      const options = {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: { ...MARKET_PARAMS }
      }
      const protocol = new MorphoProtocolEvm(account, options)
      options.earnVaultAddress = '0x0000000000000000000000000000000000000001'
      options.borrowMarketParams.loanToken = COLLATERAL

      account.getTokenBalance = jest.fn().mockResolvedValue(100_000n)
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-supply-hash', fee: 12_345n })

      await protocol.supply({ token: TOKEN, amount: 100_000n })

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1)
      expect(vaultV2Entity.deposit).toHaveBeenCalledWith(expect.objectContaining({
        amount: 100_000n
      }))
    })

    test('should build a native-only vault deposit', async () => {
      vaultV2Entity.getData.mockResolvedValueOnce({
        ...vaultData,
        asset: COLLATERAL
      })

      account.getTokenBalance = jest.fn()
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-supply-hash', fee: 12_345n })

      await protocol.supply({ token: COLLATERAL, nativeAmount: 100_000n })

      expect(account.getTokenBalance).not.toHaveBeenCalled()
      expect(vaultV2Entity.deposit).toHaveBeenCalledWith({
        amount: 0n,
        nativeAmount: 100_000n,
        userAddress: ADDRESS,
        accrualVault: expect.objectContaining({ asset: COLLATERAL }),
        slippageTolerance: undefined
      })
    })

    test('should reject zero deposit amount across erc20 and native sources', async () => {
      await expect(protocol.supply({ token: TOKEN, amount: 0n }))
        .rejects.toThrow("'amount' or 'nativeAmount' should be greater than zero.")
    })

    test('should use vaultV2 when the selected preset is configured', async () => {
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        presets: { earn: 'sky-money-usdt-savings' },
        borrowMarketParams: MARKET_PARAMS
      })

      account.getTokenBalance = jest.fn().mockResolvedValue(100_000n)
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-supply-hash', fee: 12_345n })

      await protocol.supply({ token: TOKEN, amount: 100_000n })

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1)
    })

    test('should reject earn presets on the wrong chain', async () => {
      mockGetChainId.mockResolvedValue(8453)
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        presets: { earn: 'sky-money-usdt-savings' },
        borrowMarketParams: MARKET_PARAMS
      })

      await expect(protocol.getVaultPosition())
        .rejects.toThrow('Morpho target is configured for chain 1, but the connected provider is on chain 8453.')
    })

    test("should throw if 'token' is invalid", async () => {
      await expect(protocol.supply({ token: 'invalid-token-address', amount: 100_000n }))
        .rejects.toThrow("'token' must be a valid address.")
    })

    test("should throw if 'amount' and 'nativeAmount' are zero", async () => {
      await expect(protocol.supply({ token: TOKEN, amount: 0n }))
        .rejects.toThrow("'amount' or 'nativeAmount' should be greater than zero.")
    })

    test('should require chainId with explicit Morpho targets', () => {
      expect(() => new MorphoProtocolEvm(account, {
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS
      })).toThrow("'chainId' must be configured when using explicit Morpho targets.")
    })
  })

  describe('quoteSupply', () => {
    test('should quote a vault deposit transaction', async () => {
      account.quoteSendTransaction = jest.fn().mockResolvedValue({ fee: 12_345n })

      const result = await protocol.quoteSupply({ token: TOKEN, amount: 100_000n })

      expect(account.quoteSendTransaction).toHaveBeenCalledWith(SUPPLY_TX)
      expect(result).toEqual({ fee: 12_345n })
    })
  })

  describe('withdraw', () => {
    test('should build a vault withdraw with morpho-sdk and send it', async () => {
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-withdraw-hash', fee: 12_345n })

      const result = await protocol.withdraw({ token: TOKEN, amount: 100_000n })

      expect(vaultV2Entity.withdraw).toHaveBeenCalledWith({
        amount: 100_000n,
        userAddress: ADDRESS
      })
      expect(account.sendTransaction).toHaveBeenCalledWith(WITHDRAW_TX)
      expect(result).toEqual({ hash: 'dummy-withdraw-hash', fee: 12_345n })
    })

    test("should throw if 'to' is not the wallet address", async () => {
      await expect(protocol.withdraw({
        token: TOKEN,
        amount: 100_000n,
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
      })).rejects.toThrow("'to' must equal the wallet account address for Morpho vault withdrawals.")
    })
  })

  describe('borrow', () => {
    test('should build a market borrow with morpho-sdk and send it', async () => {
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-borrow-hash', fee: 12_345n })

      const result = await protocol.borrow({ token: TOKEN, amount: 100_000n })

      expect(marketV1Mock).toHaveBeenCalledWith(expect.objectContaining({
        loanToken: TOKEN,
        collateralToken: COLLATERAL
      }), 1)
      expect(marketEntity.getPositionData).toHaveBeenCalledWith(ADDRESS)
      expect(marketEntity.borrow).toHaveBeenCalledWith({
        amount: 100_000n,
        userAddress: ADDRESS,
        positionData,
        slippageTolerance: undefined,
        reallocations: undefined
      })
      expect(account.sendTransaction).toHaveBeenCalledWith(BORROW_TX)
      expect(result).toEqual({ hash: 'dummy-borrow-hash', fee: 12_345n })
    })

    test('should fetch market params when only borrowMarketId is configured', async () => {
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketId: MARKET_ID
      })

      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-borrow-hash', fee: 12_345n })

      await protocol.borrow({ token: TOKEN, amount: 100_000n })

      expect(fetchMarketMock).toHaveBeenCalledWith(MARKET_ID, expect.any(Object), {
        chainId: 1,
        deployless: undefined
      })
    })

    test('should reject borrow presets on the wrong chain', async () => {
      mockGetChainId.mockResolvedValue(8453)
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        presets: { borrow: 'wsteth' }
      })

      await expect(protocol.borrow({ token: TOKEN, amount: 100_000n }))
        .rejects.toThrow('Morpho target is configured for chain 1, but the connected provider is on chain 8453.')
      expect(fetchMarketMock).not.toHaveBeenCalled()
    })

    test('should return borrow requirements from morpho-sdk', async () => {
      const requirements = await protocol.getBorrowRequirements({ token: TOKEN, amount: 100_000n })

      expect(requirements).toEqual([{ action: { type: 'morphoAuthorization' } }])
      expect(borrowAction.getRequirements).toHaveBeenCalled()
    })

    test("should throw if 'onBehalfOf' differs from the wallet address", async () => {
      await expect(protocol.borrow({
        token: TOKEN,
        amount: 100_000n,
        onBehalfOf: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
      })).rejects.toThrow("'onBehalfOf' must equal the wallet account address for Morpho SDK-backed operations.")
    })
  })

  describe('repay', () => {
    test('should build a max repay by shares with morpho-sdk', async () => {
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-repay-hash', fee: 12_345n })

      const result = await protocol.repay({ token: TOKEN, amount: 'max' })

      expect(marketEntity.repay).toHaveBeenCalledWith({
        shares: 22n,
        userAddress: ADDRESS,
        positionData,
        slippageTolerance: undefined
      })
      expect(account.sendTransaction).toHaveBeenCalledWith(REPAY_TX)
      expect(result).toEqual({ hash: 'dummy-repay-hash', fee: 12_345n })
    })

    test('should build an asset repay with morpho-sdk after balance check', async () => {
      account.getTokenBalance = jest.fn().mockResolvedValue(100_000n)
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-repay-hash', fee: 12_345n })

      await protocol.repay({ token: TOKEN, amount: 100_000n })

      expect(account.getTokenBalance).toHaveBeenCalledWith(TOKEN)
      expect(marketEntity.repay).toHaveBeenCalledWith({
        assets: 100_000n,
        userAddress: ADDRESS,
        positionData,
        slippageTolerance: undefined
      })
    })

    test('should pass requirement options to morpho-sdk repay requirements', async () => {
      const requirementOptions = { useSimplePermit: true }
      const requirements = await protocol.getRepayRequirements({ token: TOKEN, amount: 100_000n }, requirementOptions)

      expect(requirements).toEqual([{ action: { type: 'erc20Approval' } }])
      expect(repayAction.getRequirements).toHaveBeenCalledWith(requirementOptions)
    })
  })

  describe('collateral', () => {
    test('should build a supply collateral transaction with morpho-sdk', async () => {
      account.getTokenBalance = jest.fn().mockResolvedValue(100_000n)
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-collateral-hash', fee: 12_345n })

      const result = await protocol.supplyCollateral({ token: COLLATERAL, amount: 100_000n })

      expect(marketEntity.supplyCollateral).toHaveBeenCalledWith({
        amount: 100_000n,
        nativeAmount: undefined,
        userAddress: ADDRESS
      })
      expect(account.sendTransaction).toHaveBeenCalledWith(SUPPLY_COLLATERAL_TX)
      expect(result).toEqual({ hash: 'dummy-collateral-hash', fee: 12_345n })
    })

    test('should build a native-only supply collateral transaction', async () => {
      account.getTokenBalance = jest.fn()
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-collateral-hash', fee: 12_345n })

      await protocol.supplyCollateral({ token: COLLATERAL, nativeAmount: 100_000n })

      expect(account.getTokenBalance).not.toHaveBeenCalled()
      expect(marketEntity.supplyCollateral).toHaveBeenCalledWith({
        amount: 0n,
        nativeAmount: 100_000n,
        userAddress: ADDRESS
      })
    })

    test('should build a withdraw collateral transaction with morpho-sdk', async () => {
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-withdraw-collateral-hash', fee: 12_345n })

      const result = await protocol.withdrawCollateral({ token: COLLATERAL, amount: 100_000n })

      expect(marketEntity.withdrawCollateral).toHaveBeenCalledWith({
        amount: 100_000n,
        userAddress: ADDRESS,
        positionData
      })
      expect(account.sendTransaction).toHaveBeenCalledWith(WITHDRAW_COLLATERAL_TX)
      expect(result).toEqual({ hash: 'dummy-withdraw-collateral-hash', fee: 12_345n })
    })

    test('should pass requirement options to morpho-sdk supply collateral requirements', async () => {
      const requirementOptions = { useSimplePermit: true }
      const requirements = await protocol.getSupplyCollateralRequirements({ token: COLLATERAL, amount: 100_000n }, requirementOptions)

      expect(requirements).toEqual([{ action: { type: 'erc20Approval' } }])
      expect(supplyCollateralAction.getRequirements).toHaveBeenCalledWith(requirementOptions)
    })
  })

  describe('erc-4337', () => {
    test('should send through an erc-4337 account with config', async () => {
      const account = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
        chainId: 1,
        provider: 'https://dummy-rpc-url.com'
      })
      account.getAddress = jest.fn().mockResolvedValue(ADDRESS)
      account.getTokenBalance = jest.fn().mockResolvedValue(100_000n)
      account.sendTransaction = jest.fn().mockResolvedValue({ hash: 'dummy-user-operation-hash', fee: 12_345n })

      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS
      })

      const config = { paymasterToken: { address: TOKEN } }
      const result = await protocol.supply({ token: TOKEN, amount: 100_000n }, config)

      expect(account.sendTransaction).toHaveBeenCalledWith(SUPPLY_TX, config)
      expect(result).toEqual({ hash: 'dummy-user-operation-hash', fee: 12_345n })
    })
  })

  describe('read methods', () => {
    test('should return vault position data', async () => {
      const result = await protocol.getVaultPosition()

      expect(readContractMock).toHaveBeenCalledWith({
        address: VAULT,
        abi: viem.erc4626Abi,
        functionName: 'balanceOf',
        args: [ADDRESS]
      })
      expect(result).toEqual({
        shares: 123n,
        assets: 123n,
        vaultAddress: VAULT
      })
    })

    test('should return market position data', async () => {
      const result = await protocol.getMarketPosition()

      expect(result).toEqual({
        supplyShares: 11n,
        borrowShares: 22n,
        borrowAssets: 33n,
        collateral: 44n,
        marketId: new MarketParams(MARKET_PARAMS).id
      })
    })

    test('should invalidate chain-bound caches when the provider chain changes', async () => {
      await protocol.getMarketPosition()
      expect(marketV1Mock).toHaveBeenCalledWith(expect.any(Object), 1)

      mockGetChainId.mockResolvedValue(8453)

      await expect(protocol.getMarketPosition())
        .rejects.toThrow('Morpho target is configured for chain 1, but the connected provider is on chain 8453.')
      expect(marketV1Mock).toHaveBeenCalledTimes(1)
    })
  })

  describe('read-only accounts', () => {
    test('should reject write methods', async () => {
      const account = new WalletAccountReadOnlyEvm(ADDRESS, {
        provider: 'https://dummy-rpc-url.com'
      })
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS
      })

      await expect(protocol.supply({ token: TOKEN, amount: 100_000n }))
        .rejects.toThrow("The 'supply(options)' method requires the protocol to be initialized with a non read-only account.")
    })
  })
})
