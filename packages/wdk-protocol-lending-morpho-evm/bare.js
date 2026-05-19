// SPDX-License-Identifier: Apache-2.0
'use strict'

import 'bare-node-runtime/global'

export * from './index.js' with { imports: 'bare-node-runtime/imports' }

export { default } from './index.js' with { imports: 'bare-node-runtime/imports' }
