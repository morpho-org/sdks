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

/***/ "(app-pages-browser)/../../.yarn/__virtual__/@morpho-org-blue-sdk-wagmi-virtual-dd1d11cd44/1/packages/blue-sdk-wagmi/src/hooks/useMarket.ts":
/*!******************************************************************************************************************************!*\
  !*** ../../.yarn/__virtual__/@morpho-org-blue-sdk-wagmi-virtual-dd1d11cd44/1/packages/blue-sdk-wagmi/src/hooks/useMarket.ts ***!
  \******************************************************************************************************************************/
/***/ (function(module, __webpack_exports__, __webpack_require__) {

eval(__webpack_require__.ts("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   abi: function() { return /* binding */ abi; },\n/* harmony export */   buildCall: function() { return /* binding */ buildCall; },\n/* harmony export */   code: function() { return /* binding */ code; },\n/* harmony export */   selectMarket: function() { return /* binding */ selectMarket; },\n/* harmony export */   useMarket: function() { return /* binding */ useMarket; }\n/* harmony export */ });\n/* harmony import */ var _morpho_org_blue_sdk__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @morpho-org/blue-sdk */ \"(app-pages-browser)/../../.yarn/__virtual__/@morpho-org-blue-sdk-virtual-89a0aae8b7/1/packages/blue-sdk/src/index.ts\");\n/* harmony import */ var _tanstack_react_query__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @tanstack/react-query */ \"(app-pages-browser)/../../.yarn/__virtual__/@tanstack-react-query-virtual-4dcfd9867e/4/.yarn/berry/cache/@tanstack-react-query-npm-5.55.4-f0e718f216-10c0.zip/node_modules/@tanstack/react-query/build/modern/useQuery.js\");\n/* harmony import */ var wagmi__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! wagmi */ \"(app-pages-browser)/../../.yarn/__virtual__/wagmi-virtual-ef94cb8639/4/.yarn/berry/cache/wagmi-npm-2.12.9-f872ba7f02-10c0.zip/node_modules/wagmi/dist/esm/hooks/useConfig.js\");\n/* harmony import */ var wagmi__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! wagmi */ \"(app-pages-browser)/../../.yarn/__virtual__/wagmi-virtual-ef94cb8639/4/.yarn/berry/cache/wagmi-npm-2.12.9-f872ba7f02-10c0.zip/node_modules/wagmi/dist/esm/hooks/useReadContract.js\");\n/* harmony import */ var wagmi_query__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! wagmi/query */ \"(app-pages-browser)/../../.yarn/__virtual__/@wagmi-core-virtual-ca46c517a5/4/.yarn/berry/cache/@wagmi-core-npm-2.13.4-473137e162-10c0.zip/node_modules/@wagmi/core/dist/esm/query/readContract.js\");\n/* harmony import */ var wagmi_query__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! wagmi/query */ \"(app-pages-browser)/../../.yarn/__virtual__/@wagmi-core-virtual-ca46c517a5/4/.yarn/berry/cache/@wagmi-core-npm-2.13.4-473137e162-10c0.zip/node_modules/@wagmi/core/dist/esm/query/utils.js\");\n/* harmony import */ var _useChainId__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./useChainId */ \"(app-pages-browser)/../../.yarn/__virtual__/@morpho-org-blue-sdk-wagmi-virtual-dd1d11cd44/1/packages/blue-sdk-wagmi/src/hooks/useChainId.ts\");\n\n\n\n\n\nfunction buildCall(chainId, marketId) {\n    const { morpho, adaptiveCurveIrm } = _morpho_org_blue_sdk__WEBPACK_IMPORTED_MODULE_0__.addresses[chainId];\n    return {\n        chainId,\n        code,\n        abi,\n        functionName: \"query\",\n        args: [\n            morpho,\n            marketId,\n            adaptiveCurveIrm\n        ]\n    };\n}\nfunction selectMarket(param) {\n    let [marketParams, market, price, rateAtTarget] = param;\n    return new _morpho_org_blue_sdk__WEBPACK_IMPORTED_MODULE_0__.Market({\n        config: new _morpho_org_blue_sdk__WEBPACK_IMPORTED_MODULE_0__.MarketConfig(marketParams),\n        ...market,\n        price,\n        rateAtTarget\n    });\n}\nfunction useMarket(parameters) {\n    var _parameters_query, _parameters_query1, _parameters_query2;\n    const chainId = (0,_useChainId__WEBPACK_IMPORTED_MODULE_1__.useChainId)(parameters);\n    const config = (0,wagmi__WEBPACK_IMPORTED_MODULE_2__.useConfig)(parameters);\n    const options = (0,wagmi_query__WEBPACK_IMPORTED_MODULE_3__.readContractQueryOptions)(config, {\n        ...parameters,\n        ...buildCall(chainId, parameters.marketId),\n        chainId\n    });\n    var _parameters_query_enabled, _parameters_query_structuralSharing;\n    return (0,_tanstack_react_query__WEBPACK_IMPORTED_MODULE_4__.useQuery)({\n        ...parameters.query,\n        ...options,\n        enabled: (_parameters_query_enabled = (_parameters_query = parameters.query) === null || _parameters_query === void 0 ? void 0 : _parameters_query.enabled) !== null && _parameters_query_enabled !== void 0 ? _parameters_query_enabled : true,\n        structuralSharing: (_parameters_query_structuralSharing = (_parameters_query1 = parameters.query) === null || _parameters_query1 === void 0 ? void 0 : _parameters_query1.structuralSharing) !== null && _parameters_query_structuralSharing !== void 0 ? _parameters_query_structuralSharing : wagmi_query__WEBPACK_IMPORTED_MODULE_5__.structuralSharing\n    });\n    return (0,wagmi__WEBPACK_IMPORTED_MODULE_6__.useReadContract)({\n        ...parameters,\n        ...buildCall(chainId, parameters.marketId),\n        query: {\n            ...parameters.query,\n            enabled: ((_parameters_query2 = parameters.query) === null || _parameters_query2 === void 0 ? void 0 : _parameters_query2.enabled) !== false && parameters.marketId != null,\n            select: selectMarket\n        }\n    });\n}\nconst abi = [\n    {\n        type: \"function\",\n        name: \"query\",\n        inputs: [\n            {\n                name: \"morpho\",\n                type: \"address\"\n            },\n            {\n                name: \"id\",\n                type: \"bytes32\"\n            },\n            {\n                name: \"adaptiveCurveIrm\",\n                type: \"address\"\n            }\n        ],\n        outputs: [\n            {\n                name: \"marketParams\",\n                type: \"tuple\",\n                components: [\n                    {\n                        name: \"loanToken\",\n                        type: \"address\"\n                    },\n                    {\n                        name: \"collateralToken\",\n                        type: \"address\"\n                    },\n                    {\n                        name: \"oracle\",\n                        type: \"address\"\n                    },\n                    {\n                        name: \"irm\",\n                        type: \"address\"\n                    },\n                    {\n                        name: \"lltv\",\n                        type: \"uint256\"\n                    }\n                ]\n            },\n            {\n                name: \"market\",\n                type: \"tuple\",\n                components: [\n                    {\n                        name: \"totalSupplyAssets\",\n                        type: \"uint128\"\n                    },\n                    {\n                        name: \"totalSupplyShares\",\n                        type: \"uint128\"\n                    },\n                    {\n                        name: \"totalBorrowAssets\",\n                        type: \"uint128\"\n                    },\n                    {\n                        name: \"totalBorrowShares\",\n                        type: \"uint128\"\n                    },\n                    {\n                        name: \"lastUpdate\",\n                        type: \"uint128\"\n                    },\n                    {\n                        name: \"fee\",\n                        type: \"uint128\"\n                    }\n                ]\n            },\n            {\n                name: \"price\",\n                type: \"uint256\"\n            },\n            {\n                name: \"rateAtTarget\",\n                type: \"uint256\"\n            }\n        ],\n        stateMutability: \"view\"\n    }\n];\nconst code = \"0x608080604052346015576104f3908161001b8239f35b600080fdfe608080604052600436101561001357600080fd5b60003560e01c63d8f172c41461002857600080fd5b34610420576060366003190112610420576004356001600160a01b0381169190829003610420576044356001600160a01b038116916024359183900361042057608090600091829161007981610425565b82815282602082015282604082015282606082015201528060a060405161009f81610457565b828152826020820152826040820152826060820152826080820152015260009160405190632c3c915760e01b825280600483015260a082602481895afa918215610388578492610393575b5060c060249660405197888092632e3071cd60e11b82528560048301525afa9586156103885784966102e5575b506040820180519095906001600160a01b031680610272575b506060830180519092906001600160a01b031682146101f2575b50506101a09560806001600160801b039360a09360405198600180871b038351168a52600180871b0360208401511660208b0152600180871b0390511660408a0152600180861b0390511660608901520151608087015282815116828701528260208201511660c08701528260408201511660e08701528260608201511661010087015282608082015116610120870152015116610140840152610160830152610180820152f35b6020906024604097949751809481936301977b5760e01b835260048301525afa91821561026657809261022d575b509093905085608061014a565b9091506020823d60201161025e575b8161024960209383610473565b8101031261025b575051856080610220565b80fd5b3d915061023c565b604051903d90823e3d90fd5b60405163501ad8ff60e11b8152919450602090829060049082905afa9081156102da5785916102a4575b509238610130565b90506020813d6020116102d2575b816102bf60209383610473565b810103126102ce57513861029c565b8480fd5b3d91506102b2565b6040513d87823e3d90fd5b90955060c0813d60c011610380575b8161030160c09383610473565b8101031261037c5761037060a06040519261031b84610457565b610324816104a9565b8452610332602082016104a9565b6020850152610343604082016104a9565b6040850152610354606082016104a9565b6060850152610365608082016104a9565b6080850152016104a9565b60a08201529438610117565b8380fd5b3d91506102f4565b6040513d86823e3d90fd5b95915060a0863d60a011610418575b816103af60a09383610473565b8101031261037c5760c06024966080604051916103cb83610425565b6103d481610495565b83526103e260208201610495565b60208401526103f360408201610495565b604084015261040460608201610495565b6060840152015160808201529296506100ea565b3d91506103a2565b600080fd5b60a0810190811067ffffffffffffffff82111761044157604052565b634e487b7160e01b600052604160045260246000fd5b60c0810190811067ffffffffffffffff82111761044157604052565b90601f8019910116810190811067ffffffffffffffff82111761044157604052565b51906001600160a01b038216820361042057565b51906001600160801b03821682036104205756fea2646970667358221220de30534e0ee0866abd4ebab12dbbea8900313792598eee7d855306e7ff128bc064736f6c634300081a0033\";\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi8uLi8ueWFybi9fX3ZpcnR1YWxfXy9AbW9ycGhvLW9yZy1ibHVlLXNkay13YWdtaS12aXJ0dWFsLWRkMWQxMWNkNDQvMS9wYWNrYWdlcy9ibHVlLXNkay13YWdtaS9zcmMvaG9va3MvdXNlTWFya2V0LnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQU04QjtBQUNtQjtBQVFsQztBQUtNO0FBQ3FCO0FBbUJuQyxTQUFTUyxVQUFVQyxPQUFnQixFQUFFQyxRQUFrQjtJQUM1RCxNQUFNLEVBQUVDLE1BQU0sRUFBRUMsZ0JBQWdCLEVBQUUsR0FBR1gsMkRBQVMsQ0FBQ1EsUUFBUTtJQUV2RCxPQUFPO1FBQ0xBO1FBQ0FJO1FBQ0FDO1FBQ0FDLGNBQWM7UUFDZEMsTUFBTTtZQUFDTDtZQUFRRDtZQUFVRTtTQUFpQjtJQUM1QztBQUNGO0FBRU8sU0FBU0ssYUFBYSxLQUt5QztRQUx6QyxDQUMzQkMsY0FDQUMsUUFDQUMsT0FDQUMsYUFDb0UsR0FMekM7SUFNM0IsT0FBTyxJQUFJdEIsd0RBQU1BLENBQUM7UUFDaEJ1QixRQUFRLElBQUl0Qiw4REFBWUEsQ0FBQ2tCO1FBQ3pCLEdBQUdDLE1BQU07UUFDVEM7UUFDQUM7SUFDRjtBQUNGO0FBRU8sU0FBU0UsVUFDZEMsVUFBdUM7UUFvQjVCQSxtQkFDVUEsb0JBU2ZBO0lBNUJOLE1BQU1mLFVBQVVGLHVEQUFVQSxDQUFDaUI7SUFFM0IsTUFBTUYsU0FBU25CLGdEQUFTQSxDQUFDcUI7SUFFekIsTUFBTUMsVUFBVXBCLHFFQUF3QkEsQ0FLdENpQixRQUFRO1FBQ1IsR0FBSUUsVUFBVTtRQUNkLEdBQUdoQixVQUFVQyxTQUFTZSxXQUFXZCxRQUFRLENBQUU7UUFDM0NEO0lBQ0Y7UUFLV2UsMkJBQ1VBO0lBSnJCLE9BQU90QiwrREFBUUEsQ0FBQztRQUNkLEdBQUdzQixXQUFXRSxLQUFLO1FBQ25CLEdBQUdELE9BQU87UUFDVkUsU0FBU0gsQ0FBQUEsNkJBQUFBLG9CQUFBQSxXQUFXRSxLQUFLLGNBQWhCRix3Q0FBQUEsa0JBQWtCRyxPQUFPLGNBQXpCSCx1Q0FBQUEsNEJBQTZCO1FBQ3RDbEIsbUJBQW1Ca0IsQ0FBQUEsdUNBQUFBLHFCQUFBQSxXQUFXRSxLQUFLLGNBQWhCRix5Q0FBQUEsbUJBQWtCbEIsaUJBQWlCLGNBQW5Da0IsaURBQUFBLHNDQUF1Q2xCLDBEQUFpQkE7SUFDN0U7SUFFQSxPQUFPRixzREFBZUEsQ0FBQztRQUNyQixHQUFHb0IsVUFBVTtRQUNiLEdBQUdoQixVQUFVQyxTQUFTZSxXQUFXZCxRQUFRLENBQUU7UUFDM0NnQixPQUFPO1lBQ0wsR0FBR0YsV0FBV0UsS0FBSztZQUNuQkMsU0FDRUgsRUFBQUEscUJBQUFBLFdBQVdFLEtBQUssY0FBaEJGLHlDQUFBQSxtQkFBa0JHLE9BQU8sTUFBSyxTQUFTSCxXQUFXZCxRQUFRLElBQUk7WUFDaEVrQixRQUFRWDtRQUNWO0lBQ0Y7QUFDRjtBQUVPLE1BQU1ILE1BQU07SUFDakI7UUFDRWUsTUFBTTtRQUNOQyxNQUFNO1FBQ05DLFFBQVE7WUFDTjtnQkFBRUQsTUFBTTtnQkFBVUQsTUFBTTtZQUFVO1lBQ2xDO2dCQUFFQyxNQUFNO2dCQUFNRCxNQUFNO1lBQVU7WUFDOUI7Z0JBQUVDLE1BQU07Z0JBQW9CRCxNQUFNO1lBQVU7U0FDN0M7UUFDREcsU0FBUztZQUNQO2dCQUNFRixNQUFNO2dCQUNORCxNQUFNO2dCQUNOSSxZQUFZO29CQUNWO3dCQUFFSCxNQUFNO3dCQUFhRCxNQUFNO29CQUFVO29CQUNyQzt3QkFBRUMsTUFBTTt3QkFBbUJELE1BQU07b0JBQVU7b0JBQzNDO3dCQUFFQyxNQUFNO3dCQUFVRCxNQUFNO29CQUFVO29CQUNsQzt3QkFBRUMsTUFBTTt3QkFBT0QsTUFBTTtvQkFBVTtvQkFDL0I7d0JBQUVDLE1BQU07d0JBQVFELE1BQU07b0JBQVU7aUJBQ2pDO1lBQ0g7WUFDQTtnQkFDRUMsTUFBTTtnQkFDTkQsTUFBTTtnQkFDTkksWUFBWTtvQkFDVjt3QkFBRUgsTUFBTTt3QkFBcUJELE1BQU07b0JBQVU7b0JBQzdDO3dCQUFFQyxNQUFNO3dCQUFxQkQsTUFBTTtvQkFBVTtvQkFDN0M7d0JBQUVDLE1BQU07d0JBQXFCRCxNQUFNO29CQUFVO29CQUM3Qzt3QkFBRUMsTUFBTTt3QkFBcUJELE1BQU07b0JBQVU7b0JBQzdDO3dCQUFFQyxNQUFNO3dCQUFjRCxNQUFNO29CQUFVO29CQUN0Qzt3QkFBRUMsTUFBTTt3QkFBT0QsTUFBTTtvQkFBVTtpQkFDaEM7WUFDSDtZQUNBO2dCQUFFQyxNQUFNO2dCQUFTRCxNQUFNO1lBQVU7WUFDakM7Z0JBQUVDLE1BQU07Z0JBQWdCRCxNQUFNO1lBQVU7U0FDekM7UUFDREssaUJBQWlCO0lBQ25CO0NBQ0QsQ0FBVTtBQUVKLE1BQU1yQixPQUNYLGlpRkFBaWlGIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vX05fRS8uLi8uLi8ueWFybi9fX3ZpcnR1YWxfXy9AbW9ycGhvLW9yZy1ibHVlLXNkay13YWdtaS12aXJ0dWFsLWRkMWQxMWNkNDQvMS9wYWNrYWdlcy9ibHVlLXNkay13YWdtaS9zcmMvaG9va3MvdXNlTWFya2V0LnRzPzk5NjMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgQ2hhaW5JZCxcbiAgTWFya2V0LFxuICBNYXJrZXRDb25maWcsXG4gIE1hcmtldElkLFxuICBhZGRyZXNzZXMsXG59IGZyb20gXCJAbW9ycGhvLW9yZy9ibHVlLXNka1wiO1xuaW1wb3J0IHsgdXNlUXVlcnkgfSBmcm9tIFwiQHRhbnN0YWNrL3JlYWN0LXF1ZXJ5XCI7XG5pbXBvcnQgeyBBZGRyZXNzIH0gZnJvbSBcInZpZW1cIjtcbmltcG9ydCB7XG4gIENvbmZpZyxcbiAgUmVzb2x2ZWRSZWdpc3RlcixcbiAgVXNlUmVhZENvbnRyYWN0UGFyYW1ldGVycyxcbiAgdXNlQ29uZmlnLFxuICB1c2VSZWFkQ29udHJhY3QsXG59IGZyb20gXCJ3YWdtaVwiO1xuaW1wb3J0IHtcbiAgUmVhZENvbnRyYWN0RGF0YSxcbiAgcmVhZENvbnRyYWN0UXVlcnlPcHRpb25zLFxuICBzdHJ1Y3R1cmFsU2hhcmluZyxcbn0gZnJvbSBcIndhZ21pL3F1ZXJ5XCI7XG5pbXBvcnQgeyB1c2VDaGFpbklkIH0gZnJvbSBcIi4vdXNlQ2hhaW5JZFwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFVzZU1hcmtldE9wdGlvbnMge1xuICBtYXJrZXRJZD86IE1hcmtldElkO1xufVxuXG5leHBvcnQgdHlwZSBVc2VNYXJrZXRQYXJhbWV0ZXJzPGNvbmZpZyBleHRlbmRzIENvbmZpZyA9IENvbmZpZz4gPVxuICBVc2VNYXJrZXRPcHRpb25zICZcbiAgICBPbWl0PFxuICAgICAgVXNlUmVhZENvbnRyYWN0UGFyYW1ldGVyczxcbiAgICAgICAgdHlwZW9mIGFiaSxcbiAgICAgICAgXCJxdWVyeVwiLFxuICAgICAgICBbQWRkcmVzcywgTWFya2V0SWQsIEFkZHJlc3NdLFxuICAgICAgICBjb25maWcsXG4gICAgICAgIE1hcmtldFxuICAgICAgPixcbiAgICAgIFwiYWRkcmVzc1wiIHwgXCJhYmlcIiB8IFwiZnVuY3Rpb25OYW1lXCIgfCBcImFyZ3NcIlxuICAgID47XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZENhbGwoY2hhaW5JZDogQ2hhaW5JZCwgbWFya2V0SWQ6IE1hcmtldElkKSB7XG4gIGNvbnN0IHsgbW9ycGhvLCBhZGFwdGl2ZUN1cnZlSXJtIH0gPSBhZGRyZXNzZXNbY2hhaW5JZF07XG5cbiAgcmV0dXJuIHtcbiAgICBjaGFpbklkLFxuICAgIGNvZGUsXG4gICAgYWJpLFxuICAgIGZ1bmN0aW9uTmFtZTogXCJxdWVyeVwiLFxuICAgIGFyZ3M6IFttb3JwaG8sIG1hcmtldElkLCBhZGFwdGl2ZUN1cnZlSXJtXSxcbiAgfSBhcyBjb25zdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlbGVjdE1hcmtldChbXG4gIG1hcmtldFBhcmFtcyxcbiAgbWFya2V0LFxuICBwcmljZSxcbiAgcmF0ZUF0VGFyZ2V0LFxuXTogUmVhZENvbnRyYWN0RGF0YTx0eXBlb2YgYWJpLCBcInF1ZXJ5XCIsIFtBZGRyZXNzLCBNYXJrZXRJZCwgQWRkcmVzc10+KSB7XG4gIHJldHVybiBuZXcgTWFya2V0KHtcbiAgICBjb25maWc6IG5ldyBNYXJrZXRDb25maWcobWFya2V0UGFyYW1zKSxcbiAgICAuLi5tYXJrZXQsXG4gICAgcHJpY2UsXG4gICAgcmF0ZUF0VGFyZ2V0LFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVzZU1hcmtldDxjb25maWcgZXh0ZW5kcyBDb25maWcgPSBSZXNvbHZlZFJlZ2lzdGVyW1wiY29uZmlnXCJdPihcbiAgcGFyYW1ldGVyczogVXNlTWFya2V0UGFyYW1ldGVyczxjb25maWc+LFxuKSB7XG4gIGNvbnN0IGNoYWluSWQgPSB1c2VDaGFpbklkKHBhcmFtZXRlcnMpO1xuXG4gIGNvbnN0IGNvbmZpZyA9IHVzZUNvbmZpZyhwYXJhbWV0ZXJzKTtcblxuICBjb25zdCBvcHRpb25zID0gcmVhZENvbnRyYWN0UXVlcnlPcHRpb25zPFxuICAgIGNvbmZpZyxcbiAgICB0eXBlb2YgYWJpLFxuICAgIFwicXVlcnlcIixcbiAgICBbQWRkcmVzcywgTWFya2V0SWQsIEFkZHJlc3NdXG4gID4oY29uZmlnLCB7XG4gICAgLi4uKHBhcmFtZXRlcnMgYXMgYW55KSxcbiAgICAuLi5idWlsZENhbGwoY2hhaW5JZCwgcGFyYW1ldGVycy5tYXJrZXRJZCEpLFxuICAgIGNoYWluSWQsXG4gIH0pO1xuXG4gIHJldHVybiB1c2VRdWVyeSh7XG4gICAgLi4ucGFyYW1ldGVycy5xdWVyeSxcbiAgICAuLi5vcHRpb25zLFxuICAgIGVuYWJsZWQ6IHBhcmFtZXRlcnMucXVlcnk/LmVuYWJsZWQgPz8gdHJ1ZSxcbiAgICBzdHJ1Y3R1cmFsU2hhcmluZzogcGFyYW1ldGVycy5xdWVyeT8uc3RydWN0dXJhbFNoYXJpbmcgPz8gc3RydWN0dXJhbFNoYXJpbmcsXG4gIH0pO1xuXG4gIHJldHVybiB1c2VSZWFkQ29udHJhY3Qoe1xuICAgIC4uLnBhcmFtZXRlcnMsXG4gICAgLi4uYnVpbGRDYWxsKGNoYWluSWQsIHBhcmFtZXRlcnMubWFya2V0SWQhKSxcbiAgICBxdWVyeToge1xuICAgICAgLi4ucGFyYW1ldGVycy5xdWVyeSxcbiAgICAgIGVuYWJsZWQ6XG4gICAgICAgIHBhcmFtZXRlcnMucXVlcnk/LmVuYWJsZWQgIT09IGZhbHNlICYmIHBhcmFtZXRlcnMubWFya2V0SWQgIT0gbnVsbCxcbiAgICAgIHNlbGVjdDogc2VsZWN0TWFya2V0LFxuICAgIH0sXG4gIH0pO1xufVxuXG5leHBvcnQgY29uc3QgYWJpID0gW1xuICB7XG4gICAgdHlwZTogXCJmdW5jdGlvblwiLFxuICAgIG5hbWU6IFwicXVlcnlcIixcbiAgICBpbnB1dHM6IFtcbiAgICAgIHsgbmFtZTogXCJtb3JwaG9cIiwgdHlwZTogXCJhZGRyZXNzXCIgfSxcbiAgICAgIHsgbmFtZTogXCJpZFwiLCB0eXBlOiBcImJ5dGVzMzJcIiB9LFxuICAgICAgeyBuYW1lOiBcImFkYXB0aXZlQ3VydmVJcm1cIiwgdHlwZTogXCJhZGRyZXNzXCIgfSxcbiAgICBdLFxuICAgIG91dHB1dHM6IFtcbiAgICAgIHtcbiAgICAgICAgbmFtZTogXCJtYXJrZXRQYXJhbXNcIixcbiAgICAgICAgdHlwZTogXCJ0dXBsZVwiLFxuICAgICAgICBjb21wb25lbnRzOiBbXG4gICAgICAgICAgeyBuYW1lOiBcImxvYW5Ub2tlblwiLCB0eXBlOiBcImFkZHJlc3NcIiB9LFxuICAgICAgICAgIHsgbmFtZTogXCJjb2xsYXRlcmFsVG9rZW5cIiwgdHlwZTogXCJhZGRyZXNzXCIgfSxcbiAgICAgICAgICB7IG5hbWU6IFwib3JhY2xlXCIsIHR5cGU6IFwiYWRkcmVzc1wiIH0sXG4gICAgICAgICAgeyBuYW1lOiBcImlybVwiLCB0eXBlOiBcImFkZHJlc3NcIiB9LFxuICAgICAgICAgIHsgbmFtZTogXCJsbHR2XCIsIHR5cGU6IFwidWludDI1NlwiIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBuYW1lOiBcIm1hcmtldFwiLFxuICAgICAgICB0eXBlOiBcInR1cGxlXCIsXG4gICAgICAgIGNvbXBvbmVudHM6IFtcbiAgICAgICAgICB7IG5hbWU6IFwidG90YWxTdXBwbHlBc3NldHNcIiwgdHlwZTogXCJ1aW50MTI4XCIgfSxcbiAgICAgICAgICB7IG5hbWU6IFwidG90YWxTdXBwbHlTaGFyZXNcIiwgdHlwZTogXCJ1aW50MTI4XCIgfSxcbiAgICAgICAgICB7IG5hbWU6IFwidG90YWxCb3Jyb3dBc3NldHNcIiwgdHlwZTogXCJ1aW50MTI4XCIgfSxcbiAgICAgICAgICB7IG5hbWU6IFwidG90YWxCb3Jyb3dTaGFyZXNcIiwgdHlwZTogXCJ1aW50MTI4XCIgfSxcbiAgICAgICAgICB7IG5hbWU6IFwibGFzdFVwZGF0ZVwiLCB0eXBlOiBcInVpbnQxMjhcIiB9LFxuICAgICAgICAgIHsgbmFtZTogXCJmZWVcIiwgdHlwZTogXCJ1aW50MTI4XCIgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICB7IG5hbWU6IFwicHJpY2VcIiwgdHlwZTogXCJ1aW50MjU2XCIgfSxcbiAgICAgIHsgbmFtZTogXCJyYXRlQXRUYXJnZXRcIiwgdHlwZTogXCJ1aW50MjU2XCIgfSxcbiAgICBdLFxuICAgIHN0YXRlTXV0YWJpbGl0eTogXCJ2aWV3XCIsXG4gIH0sXG5dIGFzIGNvbnN0O1xuXG5leHBvcnQgY29uc3QgY29kZSA9XG4gIFwiMHg2MDgwODA2MDQwNTIzNDYwMTU1NzYxMDRmMzkwODE2MTAwMWI4MjM5ZjM1YjYwMDA4MGZkZmU2MDgwODA2MDQwNTI2MDA0MzYxMDE1NjEwMDEzNTc2MDAwODBmZDViNjAwMDM1NjBlMDFjNjNkOGYxNzJjNDE0NjEwMDI4NTc2MDAwODBmZDViMzQ2MTA0MjA1NzYwNjAzNjYwMDMxOTAxMTI2MTA0MjA1NzYwMDQzNTYwMDE2MDAxNjBhMDFiMDM4MTE2OTE5MDgyOTAwMzYxMDQyMDU3NjA0NDM1NjAwMTYwMDE2MGEwMWIwMzgxMTY5MTYwMjQzNTkxODM5MDAzNjEwNDIwNTc2MDgwOTA2MDAwOTE4MjkxNjEwMDc5ODE2MTA0MjU1NjViODI4MTUyODI2MDIwODIwMTUyODI2MDQwODIwMTUyODI2MDYwODIwMTUyMDE1MjgwNjBhMDYwNDA1MTYxMDA5ZjgxNjEwNDU3NTY1YjgyODE1MjgyNjAyMDgyMDE1MjgyNjA0MDgyMDE1MjgyNjA2MDgyMDE1MjgyNjA4MDgyMDE1MjAxNTI2MDAwOTE2MDQwNTE5MDYzMmMzYzkxNTc2MGUwMWI4MjUyODA2MDA0ODMwMTUyNjBhMDgyNjAyNDgxODk1YWZhOTE4MjE1NjEwMzg4NTc4NDkyNjEwMzkzNTc1YjUwNjBjMDYwMjQ5NjYwNDA1MTk3ODg4MDkyNjMyZTMwNzFjZDYwZTExYjgyNTI4NTYwMDQ4MzAxNTI1YWZhOTU4NjE1NjEwMzg4NTc4NDk2NjEwMmU1NTc1YjUwNjA0MDgyMDE4MDUxOTA5NTkwNjAwMTYwMDE2MGEwMWIwMzE2ODA2MTAyNzI1NzViNTA2MDYwODMwMTgwNTE5MDkyOTA2MDAxNjAwMTYwYTAxYjAzMTY4MjE0NjEwMWYyNTc1YjUwNTA2MTAxYTA5NTYwODA2MDAxNjAwMTYwODAxYjAzOTM2MGEwOTM2MDQwNTE5ODYwMDE4MDg3MWIwMzgzNTExNjhhNTI2MDAxODA4NzFiMDM2MDIwODQwMTUxMTY2MDIwOGIwMTUyNjAwMTgwODcxYjAzOTA1MTE2NjA0MDhhMDE1MjYwMDE4MDg2MWIwMzkwNTExNjYwNjA4OTAxNTIwMTUxNjA4MDg3MDE1MjgyODE1MTE2ODI4NzAxNTI4MjYwMjA4MjAxNTExNjYwYzA4NzAxNTI4MjYwNDA4MjAxNTExNjYwZTA4NzAxNTI4MjYwNjA4MjAxNTExNjYxMDEwMDg3MDE1MjgyNjA4MDgyMDE1MTE2NjEwMTIwODcwMTUyMDE1MTE2NjEwMTQwODQwMTUyNjEwMTYwODMwMTUyNjEwMTgwODIwMTUyZjM1YjYwMjA5MDYwMjQ2MDQwOTc5NDk3NTE4MDk0ODE5MzYzMDE5NzdiNTc2MGUwMWI4MzUyNjAwNDgzMDE1MjVhZmE5MTgyMTU2MTAyNjY1NzgwOTI2MTAyMmQ1NzViNTA5MDkzOTA1MDg1NjA4MDYxMDE0YTU2NWI5MDkxNTA2MDIwODIzZDYwMjAxMTYxMDI1ZTU3NWI4MTYxMDI0OTYwMjA5MzgzNjEwNDczNTY1YjgxMDEwMzEyNjEwMjViNTc1MDUxODU2MDgwNjEwMjIwNTY1YjgwZmQ1YjNkOTE1MDYxMDIzYzU2NWI2MDQwNTE5MDNkOTA4MjNlM2Q5MGZkNWI2MDQwNTE2MzUwMWFkOGZmNjBlMTFiODE1MjkxOTQ1MDYwMjA5MDgyOTA2MDA0OTA4MjkwNWFmYTkwODExNTYxMDJkYTU3ODU5MTYxMDJhNDU3NWI1MDkyMzg2MTAxMzA1NjViOTA1MDYwMjA4MTNkNjAyMDExNjEwMmQyNTc1YjgxNjEwMmJmNjAyMDkzODM2MTA0NzM1NjViODEwMTAzMTI2MTAyY2U1NzUxMzg2MTAyOWM1NjViODQ4MGZkNWIzZDkxNTA2MTAyYjI1NjViNjA0MDUxM2Q4NzgyM2UzZDkwZmQ1YjkwOTU1MDYwYzA4MTNkNjBjMDExNjEwMzgwNTc1YjgxNjEwMzAxNjBjMDkzODM2MTA0NzM1NjViODEwMTAzMTI2MTAzN2M1NzYxMDM3MDYwYTA2MDQwNTE5MjYxMDMxYjg0NjEwNDU3NTY1YjYxMDMyNDgxNjEwNGE5NTY1Yjg0NTI2MTAzMzI2MDIwODIwMTYxMDRhOTU2NWI2MDIwODUwMTUyNjEwMzQzNjA0MDgyMDE2MTA0YTk1NjViNjA0MDg1MDE1MjYxMDM1NDYwNjA4MjAxNjEwNGE5NTY1YjYwNjA4NTAxNTI2MTAzNjU2MDgwODIwMTYxMDRhOTU2NWI2MDgwODUwMTUyMDE2MTA0YTk1NjViNjBhMDgyMDE1Mjk0Mzg2MTAxMTc1NjViODM4MGZkNWIzZDkxNTA2MTAyZjQ1NjViNjA0MDUxM2Q4NjgyM2UzZDkwZmQ1Yjk1OTE1MDYwYTA4NjNkNjBhMDExNjEwNDE4NTc1YjgxNjEwM2FmNjBhMDkzODM2MTA0NzM1NjViODEwMTAzMTI2MTAzN2M1NzYwYzA2MDI0OTY2MDgwNjA0MDUxOTE2MTAzY2I4MzYxMDQyNTU2NWI2MTAzZDQ4MTYxMDQ5NTU2NWI4MzUyNjEwM2UyNjAyMDgyMDE2MTA0OTU1NjViNjAyMDg0MDE1MjYxMDNmMzYwNDA4MjAxNjEwNDk1NTY1YjYwNDA4NDAxNTI2MTA0MDQ2MDYwODIwMTYxMDQ5NTU2NWI2MDYwODQwMTUyMDE1MTYwODA4MjAxNTI5Mjk2NTA2MTAwZWE1NjViM2Q5MTUwNjEwM2EyNTY1YjYwMDA4MGZkNWI2MGEwODEwMTkwODExMDY3ZmZmZmZmZmZmZmZmZmZmZjgyMTExNzYxMDQ0MTU3NjA0MDUyNTY1YjYzNGU0ODdiNzE2MGUwMWI2MDAwNTI2MDQxNjAwNDUyNjAyNDYwMDBmZDViNjBjMDgxMDE5MDgxMTA2N2ZmZmZmZmZmZmZmZmZmZmY4MjExMTc2MTA0NDE1NzYwNDA1MjU2NWI5MDYwMWY4MDE5OTEwMTE2ODEwMTkwODExMDY3ZmZmZmZmZmZmZmZmZmZmZjgyMTExNzYxMDQ0MTU3NjA0MDUyNTY1YjUxOTA2MDAxNjAwMTYwYTAxYjAzODIxNjgyMDM2MTA0MjA1NzU2NWI1MTkwNjAwMTYwMDE2MDgwMWIwMzgyMTY4MjAzNjEwNDIwNTc1NmZlYTI2NDY5NzA2NjczNTgyMjEyMjBkZTMwNTM0ZTBlZTA4NjZhYmQ0ZWJhYjEyZGJiZWE4OTAwMzEzNzkyNTk4ZWVlN2Q4NTUzMDZlN2ZmMTI4YmMwNjQ3MzZmNmM2MzQzMDAwODFhMDAzM1wiO1xuIl0sIm5hbWVzIjpbIk1hcmtldCIsIk1hcmtldENvbmZpZyIsImFkZHJlc3NlcyIsInVzZVF1ZXJ5IiwidXNlQ29uZmlnIiwidXNlUmVhZENvbnRyYWN0IiwicmVhZENvbnRyYWN0UXVlcnlPcHRpb25zIiwic3RydWN0dXJhbFNoYXJpbmciLCJ1c2VDaGFpbklkIiwiYnVpbGRDYWxsIiwiY2hhaW5JZCIsIm1hcmtldElkIiwibW9ycGhvIiwiYWRhcHRpdmVDdXJ2ZUlybSIsImNvZGUiLCJhYmkiLCJmdW5jdGlvbk5hbWUiLCJhcmdzIiwic2VsZWN0TWFya2V0IiwibWFya2V0UGFyYW1zIiwibWFya2V0IiwicHJpY2UiLCJyYXRlQXRUYXJnZXQiLCJjb25maWciLCJ1c2VNYXJrZXQiLCJwYXJhbWV0ZXJzIiwib3B0aW9ucyIsInF1ZXJ5IiwiZW5hYmxlZCIsInNlbGVjdCIsInR5cGUiLCJuYW1lIiwiaW5wdXRzIiwib3V0cHV0cyIsImNvbXBvbmVudHMiLCJzdGF0ZU11dGFiaWxpdHkiXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/../../.yarn/__virtual__/@morpho-org-blue-sdk-wagmi-virtual-dd1d11cd44/1/packages/blue-sdk-wagmi/src/hooks/useMarket.ts\n"));

/***/ })

});