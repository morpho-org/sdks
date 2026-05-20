import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits } from 'viem'
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'
import MorphoProtocolEvm from '../../index.js'

const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const USDT_WHALE = '0x28C6c06298d514Db089934071355E5743bf21d60'
const VAULT = '0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11'
const DEPOSIT_AMOUNT = 1_000_000n

const maybeDescribe = process.env.MAINNET_RPC_URL ? describe : describe.skip

async function getFreePort () {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function waitForRpc (rpcUrl) {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: []
        })
      })
      if (response.ok) return
    } catch {}
    await delay(250)
  }

  throw new Error('Timed out waiting for Anvil fork RPC.')
}

function toWdkTransaction (tx) {
  return {
    to: tx.to,
    value: tx.value ?? 0n,
    data: tx.data
  }
}

maybeDescribe('MorphoProtocolEvm fork e2e', () => {
  let anvil
  let rpcUrl
  let publicClient

  beforeAll(async () => {
    const port = await getFreePort()
    rpcUrl = `http://127.0.0.1:${port}`
    anvil = spawn('anvil', [
      '--fork-url',
      process.env.MAINNET_RPC_URL,
      '--chain-id',
      '1',
      '--port',
      String(port),
      '--silent'
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    await waitForRpc(rpcUrl)
    publicClient = createPublicClient({
      transport: http(rpcUrl)
    })
  }, 60_000)

  afterAll(async () => {
    if (anvil) {
      anvil.kill()
      await new Promise(resolve => anvil.once('close', resolve))
    }
  })

  test('executes requirements and a vault deposit on a mainnet fork', async () => {
    const account = new WalletAccountEvm(SEED, "0'/0/0", { provider: rpcUrl })
    const accountAddress = await account.getAddress()
    const whale = createWalletClient({
      account: USDT_WHALE,
      transport: http(rpcUrl)
    })

    await publicClient.request({ method: 'anvil_setBalance', params: [
      accountAddress,
      '0x3635C9ADC5DEA00000'
    ] })
    await publicClient.request({ method: 'anvil_setBalance', params: [
      USDT_WHALE,
      '0x3635C9ADC5DEA00000'
    ] })
    await publicClient.request({ method: 'anvil_impersonateAccount', params: [USDT_WHALE] })

    const hash = await whale.writeContract({
      address: USDT,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [accountAddress, parseUnits('10', 6)]
    })
    await publicClient.waitForTransactionReceipt({ hash })
    await publicClient.request({ method: 'anvil_stopImpersonatingAccount', params: [USDT_WHALE] })

    expect(await publicClient.readContract({
      address: USDT,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [accountAddress]
    })).toBeGreaterThanOrEqual(DEPOSIT_AMOUNT)

    const morpho = new MorphoProtocolEvm(account, {
      chainId: 1,
      earnVaultAddress: VAULT
    })
    const requirements = await morpho.getSupplyRequirements({
      token: USDT,
      amount: DEPOSIT_AMOUNT
    })

    for (const requirement of requirements) {
      if (requirement.to) {
        await account.sendTransaction(toWdkTransaction(requirement))
      }
    }

    const result = await morpho.supply({
      token: USDT,
      amount: DEPOSIT_AMOUNT
    })

    expect(result.hash).toMatch(/^0x[0-9a-fA-F]{64}$/)
  }, 120_000)
})
