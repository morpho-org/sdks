// SPDX-License-Identifier: Apache-2.0

'use strict'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))

const checks = [
  {
    file: 'src/morpho-protocol-evm.js',
    patterns: [
      'client.vaultV1(',
      "|| 'v1'",
      'earnVaultVersion',
      'vaultVersion'
    ]
  },
  {
    file: 'tests/morpho-protocol-evm.test.js',
    patterns: [
      'vaultV1',
      'earnVaultVersion',
      'vaultVersion'
    ]
  },
  {
    file: 'tests/integration/module.test.js',
    patterns: [
      'vaultV1',
      'earnVaultVersion',
      'vaultVersion'
    ]
  },
  {
    file: 'src/morpho-presets.js',
    patterns: [
      'version:'
    ]
  },
  {
    file: 'README.md',
    patterns: [
      'V1/V2',
      'Steakhouse USDT V1',
      'Gauntlet USDT Frontier V1',
      'earnVaultVersion',
      'vaultVersion',
      'vault version'
    ]
  }
]

for (const check of checks) {
  const content = readFileSync(join(root, check.file), 'utf8')
  const pattern = check.patterns.find((pattern) => content.includes(pattern))

  if (pattern) {
    console.error(`${check.file} contains unsupported Morpho vault reference '${pattern}'. Use Morpho Vault V2 only.`)
    process.exit(1)
  }
}

console.log('Morpho vault configuration uses Vault V2 only.')
