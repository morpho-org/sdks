"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
self["webpackHotUpdate_N_E"]("app/page",{

/***/ "(app-pages-browser)/./src/app/page.tsx":
/*!**************************!*\
  !*** ./src/app/page.tsx ***!
  \**************************/
/***/ (function(module, __webpack_exports__, __webpack_require__) {

eval(__webpack_require__.ts("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-dev-runtime */ \"(app-pages-browser)/../../.yarn/__virtual__/next-virtual-05f6d9dd8a/4/.yarn/berry/cache/next-npm-14.2.4-37fb4e5b51-10c0.zip/node_modules/next/dist/compiled/react/jsx-dev-runtime.js\");\n/* harmony import */ var _morpho_org_blue_sdk_wagmi__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @morpho-org/blue-sdk-wagmi */ \"(app-pages-browser)/../../.yarn/__virtual__/@morpho-org-blue-sdk-wagmi-virtual-dd1d11cd44/1/packages/blue-sdk-wagmi/src/index.ts\");\n/* __next_internal_client_entry_do_not_use__ default auto */ \nvar _s = $RefreshSig$();\n\nfunction App() {\n    _s();\n    const market = (0,_morpho_org_blue_sdk_wagmi__WEBPACK_IMPORTED_MODULE_1__.useMarket)({\n        marketId: \"0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49\"\n    });\n    console.log(market);\n    return /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, {\n        children: /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"div\", {\n            children: /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"h2\", {\n                children: \"Wagmi Project\"\n            }, void 0, false, {\n                fileName: \"/home/rubilmax/sites/morpho.xyz/sdks/packages/wagmi-project/src/app/page.tsx\",\n                lineNumber: 17,\n                columnNumber: 9\n            }, this)\n        }, void 0, false, {\n            fileName: \"/home/rubilmax/sites/morpho.xyz/sdks/packages/wagmi-project/src/app/page.tsx\",\n            lineNumber: 16,\n            columnNumber: 7\n        }, this)\n    }, void 0, false);\n}\n_s(App, \"J1KiYpaOJ29cclwS66pfUHylOFs=\", false, function() {\n    return [\n        _morpho_org_blue_sdk_wagmi__WEBPACK_IMPORTED_MODULE_1__.useMarket\n    ];\n});\n_c = App;\n/* harmony default export */ __webpack_exports__[\"default\"] = (App);\nvar _c;\n$RefreshReg$(_c, \"App\");\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uL3NyYy9hcHAvcGFnZS50c3giLCJtYXBwaW5ncyI6Ijs7Ozs7QUFHdUQ7QUFFdkQsU0FBU0M7O0lBQ1AsTUFBTUMsU0FBU0YscUVBQVNBLENBQUM7UUFDdkJHLFVBQ0U7SUFDSjtJQUVBQyxRQUFRQyxHQUFHLENBQUNIO0lBRVoscUJBQ0U7a0JBQ0UsNEVBQUNJO3NCQUNDLDRFQUFDQzswQkFBRzs7Ozs7Ozs7Ozs7O0FBSVo7R0FmU047O1FBQ1FELGlFQUFTQTs7O0tBRGpCQztBQWlCVCwrREFBZUEsR0FBR0EsRUFBQyIsInNvdXJjZXMiOlsid2VicGFjazovL19OX0UvLi9zcmMvYXBwL3BhZ2UudHN4P2Y2OGEiXSwic291cmNlc0NvbnRlbnQiOlsiXCJ1c2UgY2xpZW50XCI7XG5cbmltcG9ydCB7IE1hcmtldElkIH0gZnJvbSBcIkBtb3JwaG8tb3JnL2JsdWUtc2RrXCI7XG5pbXBvcnQgeyB1c2VNYXJrZXQgfSBmcm9tIFwiQG1vcnBoby1vcmcvYmx1ZS1zZGstd2FnbWlcIjtcblxuZnVuY3Rpb24gQXBwKCkge1xuICBjb25zdCBtYXJrZXQgPSB1c2VNYXJrZXQoe1xuICAgIG1hcmtldElkOlxuICAgICAgXCIweDNhODVlNjE5NzUxMTUyOTkxNzQyODEwZGY2ZWM2OWNlNDczZGFlZjk5ZTI4YTY0YWIyMzQwZDdiN2NjZmVlNDlcIiBhcyBNYXJrZXRJZCxcbiAgfSk7XG5cbiAgY29uc29sZS5sb2cobWFya2V0KTtcblxuICByZXR1cm4gKFxuICAgIDw+XG4gICAgICA8ZGl2PlxuICAgICAgICA8aDI+V2FnbWkgUHJvamVjdDwvaDI+XG4gICAgICA8L2Rpdj5cbiAgICA8Lz5cbiAgKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgQXBwO1xuIl0sIm5hbWVzIjpbInVzZU1hcmtldCIsIkFwcCIsIm1hcmtldCIsIm1hcmtldElkIiwiY29uc29sZSIsImxvZyIsImRpdiIsImgyIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(app-pages-browser)/./src/app/page.tsx\n"));

/***/ })

});