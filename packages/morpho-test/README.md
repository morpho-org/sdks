# @morpho-org/morpho-test

[![npm package][npm-img]][npm-url]
[![Downloads][downloads-img]][downloads-url]

Lightweight developer package that includes helpers to run hardhat and jest tests.

## Install

```bash
npm install @morpho-org/morpho-test
```

```bash
yarn add @morpho-org/morpho-test
```

---

## Usage

### jest

When running a jest test suite, you may encounter the following error:

```log
node:internal/modules/esm/utils:211
    throw new ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG();
          ^

TypeError: A dynamic import callback was invoked without --experimental-vm-modules
```

To fix this, [run jest using experimental VM modules](https://jestjs.io/docs/ecmascript-modules).

[downloads-img]: https://img.shields.io/npm/dt/@morpho-org/morpho-test
[downloads-url]: https://www.npmtrends.com/@morpho-org/morpho-test
[npm-img]: https://img.shields.io/npm/v/@morpho-org/morpho-test
[npm-url]: https://www.npmjs.com/package/@morpho-org/morpho-test
