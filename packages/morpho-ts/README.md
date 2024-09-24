# @morpho-org/morpho-ts

[![npm package][npm-img]][npm-url]
[![Downloads][downloads-img]][downloads-url]

Lightweight package that includes TypeScript helpers to easily build apps around Morpho Blue & MetaMorpho.

## Install

```bash
npm install @morpho-org/morpho-ts
```

```bash
yarn add @morpho-org/morpho-ts
```

---

## Usage

### Utility

Refer to the specific documentation for detailed information on each utility:
- [`format`](./src/format/format/README.md)
- [`Time`](./src/time/README.md)

### jest

When running a jest ts suite, you may encounter the following error:

```log
node:internal/modules/esm/utils:211
    throw new ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG();
          ^

TypeError: A dynamic import callback was invoked without --experimental-vm-modules
```

To fix this, [run jest using experimental VM modules](https://jestjs.io/docs/ecmascript-modules).

[downloads-img]: https://img.shields.io/npm/dt/@morpho-org/morpho-ts
[downloads-url]: https://www.npmtrends.com/@morpho-org/morpho-ts
[npm-img]: https://img.shields.io/npm/v/@morpho-org/morpho-ts
[npm-url]: https://www.npmjs.com/package/@morpho-org/morpho-ts
