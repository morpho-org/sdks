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

eval(__webpack_require__.ts("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   abi: function() { return /* binding */ abi; },\n/* harmony export */   buildCall: function() { return /* binding */ buildCall; },\n/* harmony export */   code: function() { return /* binding */ code; },\n/* harmony export */   selectMarket: function() { return /* binding */ selectMarket; },\n/* harmony export */   useMarket: function() { return /* binding */ useMarket; }\n/* harmony export */ });\n/* harmony import */ var _morpho_org_blue_sdk__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @morpho-org/blue-sdk */ \"(app-pages-browser)/../../.yarn/__virtual__/@morpho-org-blue-sdk-virtual-89a0aae8b7/1/packages/blue-sdk/src/index.ts\");\n/* harmony import */ var _tanstack_react_query__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @tanstack/react-query */ \"(app-pages-browser)/../../.yarn/__virtual__/@tanstack-react-query-virtual-4dcfd9867e/4/.yarn/berry/cache/@tanstack-react-query-npm-5.55.4-f0e718f216-10c0.zip/node_modules/@tanstack/react-query/build/modern/useQuery.js\");\n/* harmony import */ var wagmi__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! wagmi */ \"(app-pages-browser)/../../.yarn/__virtual__/wagmi-virtual-ef94cb8639/4/.yarn/berry/cache/wagmi-npm-2.12.9-f872ba7f02-10c0.zip/node_modules/wagmi/dist/esm/hooks/useConfig.js\");\n/* harmony import */ var wagmi__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! wagmi */ \"(app-pages-browser)/../../.yarn/__virtual__/wagmi-virtual-ef94cb8639/4/.yarn/berry/cache/wagmi-npm-2.12.9-f872ba7f02-10c0.zip/node_modules/wagmi/dist/esm/hooks/useReadContract.js\");\n/* harmony import */ var wagmi_query__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! wagmi/query */ \"(app-pages-browser)/../../.yarn/__virtual__/@wagmi-core-virtual-ca46c517a5/4/.yarn/berry/cache/@wagmi-core-npm-2.13.4-473137e162-10c0.zip/node_modules/@wagmi/core/dist/esm/query/readContract.js\");\n/* harmony import */ var wagmi_query__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! wagmi/query */ \"(app-pages-browser)/../../.yarn/__virtual__/@wagmi-core-virtual-ca46c517a5/4/.yarn/berry/cache/@wagmi-core-npm-2.13.4-473137e162-10c0.zip/node_modules/@wagmi/core/dist/esm/query/utils.js\");\n/* harmony import */ var _useChainId__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./useChainId */ \"(app-pages-browser)/../../.yarn/__virtual__/@morpho-org-blue-sdk-wagmi-virtual-dd1d11cd44/1/packages/blue-sdk-wagmi/src/hooks/useChainId.ts\");\n\n\n\n\n\nfunction buildCall(chainId, marketId) {\n    const { morpho, adaptiveCurveIrm } = _morpho_org_blue_sdk__WEBPACK_IMPORTED_MODULE_0__.addresses[chainId];\n    return {\n        chainId,\n        code,\n        abi,\n        functionName: \"query\",\n        args: [\n            morpho,\n            marketId,\n            adaptiveCurveIrm\n        ]\n    };\n}\nfunction selectMarket(param) {\n    let [marketParams, market, price, rateAtTarget] = param;\n    return new _morpho_org_blue_sdk__WEBPACK_IMPORTED_MODULE_0__.Market({\n        config: new _morpho_org_blue_sdk__WEBPACK_IMPORTED_MODULE_0__.MarketConfig(marketParams),\n        ...market,\n        price,\n        rateAtTarget\n    });\n}\nfunction useMarket(parameters) {\n    var _parameters_query, _parameters_query1, _parameters_query2;\n    const chainId = (0,_useChainId__WEBPACK_IMPORTED_MODULE_1__.useChainId)(parameters);\n    const config = (0,wagmi__WEBPACK_IMPORTED_MODULE_2__.useConfig)(parameters);\n    var _parameters_chainId;\n    const options = (0,wagmi_query__WEBPACK_IMPORTED_MODULE_3__.readContractQueryOptions)(config, {\n        ...parameters,\n        ...buildCall(chainId, parameters.marketId),\n        chainId: (_parameters_chainId = parameters.chainId) !== null && _parameters_chainId !== void 0 ? _parameters_chainId : chainId\n    });\n    var _parameters_query_enabled, _parameters_query_structuralSharing;\n    return (0,_tanstack_react_query__WEBPACK_IMPORTED_MODULE_4__.useQuery)({\n        ...parameters.query,\n        ...options,\n        enabled: (_parameters_query_enabled = (_parameters_query = parameters.query) === null || _parameters_query === void 0 ? void 0 : _parameters_query.enabled) !== null && _parameters_query_enabled !== void 0 ? _parameters_query_enabled : true,\n        structuralSharing: (_parameters_query_structuralSharing = (_parameters_query1 = parameters.query) === null || _parameters_query1 === void 0 ? void 0 : _parameters_query1.structuralSharing) !== null && _parameters_query_structuralSharing !== void 0 ? _parameters_query_structuralSharing : wagmi_query__WEBPACK_IMPORTED_MODULE_5__.structuralSharing\n    });\n    return (0,wagmi__WEBPACK_IMPORTED_MODULE_6__.useReadContract)({\n        ...parameters,\n        ...buildCall(chainId, parameters.marketId),\n        query: {\n            ...parameters.query,\n            enabled: ((_parameters_query2 = parameters.query) === null || _parameters_query2 === void 0 ? void 0 : _parameters_query2.enabled) !== false && parameters.marketId != null,\n            select: selectMarket\n        }\n    });\n}\nconst abi = [\n    {\n        type: \"function\",\n        name: \"query\",\n        inputs: [\n            {\n                name: \"morpho\",\n                type: \"address\"\n            },\n            {\n                name: \"id\",\n                type: \"bytes32\"\n            },\n            {\n                name: \"adaptiveCurveIrm\",\n                type: \"address\"\n            }\n        ],\n        outputs: [\n            {\n                name: \"marketParams\",\n                type: \"tuple\",\n                components: [\n                    {\n                        name: \"loanToken\",\n                        type: \"address\"\n                    },\n                    {\n                        name: \"collateralToken\",\n                        type: \"address\"\n                    },\n                    {\n                        name: \"oracle\",\n                        type: \"address\"\n                    },\n                    {\n                        name: \"irm\",\n                        type: \"address\"\n                    },\n                    {\n                        name: \"lltv\",\n                        type: \"uint256\"\n                    }\n                ]\n            },\n            {\n                name: \"market\",\n                type: \"tuple\",\n                components: [\n                    {\n                        name: \"totalSupplyAssets\",\n                        type: \"uint128\"\n                    },\n                    {\n                        name: \"totalSupplyShares\",\n                        type: \"uint128\"\n                    },\n                    {\n                        name: \"totalBorrowAssets\",\n                        type: \"uint128\"\n                    },\n                    {\n                        name: \"totalBorrowShares\",\n                        type: \"uint128\"\n                    },\n                    {\n                        name: \"lastUpdate\",\n                        type: \"uint128\"\n                    },\n                    {\n                        name: \"fee\",\n                        type: \"uint128\"\n                    }\n                ]\n            },\n            {\n                name: \"price\",\n                type: \"uint256\"\n            },\n            {\n                name: \"rateAtTarget\",\n                type: \"uint256\"\n            }\n        ],\n        stateMutability: \"view\"\n    }\n];\nconst code = \"0x608080604052346015576104f3908161001b8239f35b600080fdfe608080604052600436101561001357600080fd5b60003560e01c63d8f172c41461002857600080fd5b34610420576060366003190112610420576004356001600160a01b0381169190829003610420576044356001600160a01b038116916024359183900361042057608090600091829161007981610425565b82815282602082015282604082015282606082015201528060a060405161009f81610457565b828152826020820152826040820152826060820152826080820152015260009160405190632c3c915760e01b825280600483015260a082602481895afa918215610388578492610393575b5060c060249660405197888092632e3071cd60e11b82528560048301525afa9586156103885784966102e5575b506040820180519095906001600160a01b031680610272575b506060830180519092906001600160a01b031682146101f2575b50506101a09560806001600160801b039360a09360405198600180871b038351168a52600180871b0360208401511660208b0152600180871b0390511660408a0152600180861b0390511660608901520151608087015282815116828701528260208201511660c08701528260408201511660e08701528260608201511661010087015282608082015116610120870152015116610140840152610160830152610180820152f35b6020906024604097949751809481936301977b5760e01b835260048301525afa91821561026657809261022d575b509093905085608061014a565b9091506020823d60201161025e575b8161024960209383610473565b8101031261025b575051856080610220565b80fd5b3d915061023c565b604051903d90823e3d90fd5b60405163501ad8ff60e11b8152919450602090829060049082905afa9081156102da5785916102a4575b509238610130565b90506020813d6020116102d2575b816102bf60209383610473565b810103126102ce57513861029c565b8480fd5b3d91506102b2565b6040513d87823e3d90fd5b90955060c0813d60c011610380575b8161030160c09383610473565b8101031261037c5761037060a06040519261031b84610457565b610324816104a9565b8452610332602082016104a9565b6020850152610343604082016104a9565b6040850152610354606082016104a9565b6060850152610365608082016104a9565b6080850152016104a9565b60a08201529438610117565b8380fd5b3d91506102f4565b6040513d86823e3d90fd5b95915060a0863d60a011610418575b816103af60a09383610473565b8101031261037c5760c06024966080604051916103cb83610425565b6103d481610495565b83526103e260208201610495565b60208401526103f360408201610495565b604084015261040460608201610495565b6060840152015160808201529296506100ea565b3d91506103a2565b600080fd5b60a0810190811067ffffffffffffffff82111761044157604052565b634e487b7160e01b600052604160045260246000fd5b60c0810190811067ffffffffffffffff82111761044157604052565b90601f8019910116810190811067ffffffffffffffff82111761044157604052565b51906001600160a01b038216820361042057565b51906001600160801b03821682036104205756fea2646970667358221220de30534e0ee0866abd4ebab12dbbea8900313792598eee7d855306e7ff128bc064736f6c634300081a0033\";\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi8uLi8ueWFybi9fX3ZpcnR1YWxfXy9AbW9ycGhvLW9yZy1ibHVlLXNkay13YWdtaS12aXJ0dWFsLWRkMWQxMWNkNDQvMS9wYWNrYWdlcy9ibHVlLXNkay13YWdtaS9zcmMvaG9va3MvdXNlTWFya2V0LnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQU04QjtBQUNtQjtBQVFsQztBQUtNO0FBQ3FCO0FBbUJuQyxTQUFTUyxVQUFVQyxPQUFnQixFQUFFQyxRQUFrQjtJQUM1RCxNQUFNLEVBQUVDLE1BQU0sRUFBRUMsZ0JBQWdCLEVBQUUsR0FBR1gsMkRBQVMsQ0FBQ1EsUUFBUTtJQUV2RCxPQUFPO1FBQ0xBO1FBQ0FJO1FBQ0FDO1FBQ0FDLGNBQWM7UUFDZEMsTUFBTTtZQUFDTDtZQUFRRDtZQUFVRTtTQUFpQjtJQUM1QztBQUNGO0FBRU8sU0FBU0ssYUFBYSxLQUt5QztRQUx6QyxDQUMzQkMsY0FDQUMsUUFDQUMsT0FDQUMsYUFDb0UsR0FMekM7SUFNM0IsT0FBTyxJQUFJdEIsd0RBQU1BLENBQUM7UUFDaEJ1QixRQUFRLElBQUl0Qiw4REFBWUEsQ0FBQ2tCO1FBQ3pCLEdBQUdDLE1BQU07UUFDVEM7UUFDQUM7SUFDRjtBQUNGO0FBRU8sU0FBU0UsVUFDZEMsVUFBdUM7UUFvQjVCQSxtQkFDVUEsb0JBU2ZBO0lBNUJOLE1BQU1mLFVBQVVGLHVEQUFVQSxDQUFDaUI7SUFFM0IsTUFBTUYsU0FBU25CLGdEQUFTQSxDQUFDcUI7UUFVZEE7SUFSWCxNQUFNQyxVQUFVcEIscUVBQXdCQSxDQUt0Q2lCLFFBQVE7UUFDUixHQUFJRSxVQUFVO1FBQ2QsR0FBR2hCLFVBQVVDLFNBQVNlLFdBQVdkLFFBQVEsQ0FBRTtRQUMzQ0QsU0FBU2UsQ0FBQUEsc0JBQUFBLFdBQVdmLE9BQU8sY0FBbEJlLGlDQUFBQSxzQkFBc0JmO0lBQ2pDO1FBS1dlLDJCQUNVQTtJQUpyQixPQUFPdEIsK0RBQVFBLENBQUM7UUFDZCxHQUFHc0IsV0FBV0UsS0FBSztRQUNuQixHQUFHRCxPQUFPO1FBQ1ZFLFNBQVNILENBQUFBLDZCQUFBQSxvQkFBQUEsV0FBV0UsS0FBSyxjQUFoQkYsd0NBQUFBLGtCQUFrQkcsT0FBTyxjQUF6QkgsdUNBQUFBLDRCQUE2QjtRQUN0Q2xCLG1CQUFtQmtCLENBQUFBLHVDQUFBQSxxQkFBQUEsV0FBV0UsS0FBSyxjQUFoQkYseUNBQUFBLG1CQUFrQmxCLGlCQUFpQixjQUFuQ2tCLGlEQUFBQSxzQ0FBdUNsQiwwREFBaUJBO0lBQzdFO0lBRUEsT0FBT0Ysc0RBQWVBLENBQUM7UUFDckIsR0FBR29CLFVBQVU7UUFDYixHQUFHaEIsVUFBVUMsU0FBU2UsV0FBV2QsUUFBUSxDQUFFO1FBQzNDZ0IsT0FBTztZQUNMLEdBQUdGLFdBQVdFLEtBQUs7WUFDbkJDLFNBQ0VILEVBQUFBLHFCQUFBQSxXQUFXRSxLQUFLLGNBQWhCRix5Q0FBQUEsbUJBQWtCRyxPQUFPLE1BQUssU0FBU0gsV0FBV2QsUUFBUSxJQUFJO1lBQ2hFa0IsUUFBUVg7UUFDVjtJQUNGO0FBQ0Y7QUFFTyxNQUFNSCxNQUFNO0lBQ2pCO1FBQ0VlLE1BQU07UUFDTkMsTUFBTTtRQUNOQyxRQUFRO1lBQ047Z0JBQUVELE1BQU07Z0JBQVVELE1BQU07WUFBVTtZQUNsQztnQkFBRUMsTUFBTTtnQkFBTUQsTUFBTTtZQUFVO1lBQzlCO2dCQUFFQyxNQUFNO2dCQUFvQkQsTUFBTTtZQUFVO1NBQzdDO1FBQ0RHLFNBQVM7WUFDUDtnQkFDRUYsTUFBTTtnQkFDTkQsTUFBTTtnQkFDTkksWUFBWTtvQkFDVjt3QkFBRUgsTUFBTTt3QkFBYUQsTUFBTTtvQkFBVTtvQkFDckM7d0JBQUVDLE1BQU07d0JBQW1CRCxNQUFNO29CQUFVO29CQUMzQzt3QkFBRUMsTUFBTTt3QkFBVUQsTUFBTTtvQkFBVTtvQkFDbEM7d0JBQUVDLE1BQU07d0JBQU9ELE1BQU07b0JBQVU7b0JBQy9CO3dCQUFFQyxNQUFNO3dCQUFRRCxNQUFNO29CQUFVO2lCQUNqQztZQUNIO1lBQ0E7Z0JBQ0VDLE1BQU07Z0JBQ05ELE1BQU07Z0JBQ05JLFlBQVk7b0JBQ1Y7d0JBQUVILE1BQU07d0JBQXFCRCxNQUFNO29CQUFVO29CQUM3Qzt3QkFBRUMsTUFBTTt3QkFBcUJELE1BQU07b0JBQVU7b0JBQzdDO3dCQUFFQyxNQUFNO3dCQUFxQkQsTUFBTTtvQkFBVTtvQkFDN0M7d0JBQUVDLE1BQU07d0JBQXFCRCxNQUFNO29CQUFVO29CQUM3Qzt3QkFBRUMsTUFBTTt3QkFBY0QsTUFBTTtvQkFBVTtvQkFDdEM7d0JBQUVDLE1BQU07d0JBQU9ELE1BQU07b0JBQVU7aUJBQ2hDO1lBQ0g7WUFDQTtnQkFBRUMsTUFBTTtnQkFBU0QsTUFBTTtZQUFVO1lBQ2pDO2dCQUFFQyxNQUFNO2dCQUFnQkQsTUFBTTtZQUFVO1NBQ3pDO1FBQ0RLLGlCQUFpQjtJQUNuQjtDQUNELENBQVU7QUFFSixNQUFNckIsT0FDWCxpaUZBQWlpRiIsInNvdXJjZXMiOlsid2VicGFjazovL19OX0UvLi4vLi4vLnlhcm4vX192aXJ0dWFsX18vQG1vcnBoby1vcmctYmx1ZS1zZGstd2FnbWktdmlydHVhbC1kZDFkMTFjZDQ0LzEvcGFja2FnZXMvYmx1ZS1zZGstd2FnbWkvc3JjL2hvb2tzL3VzZU1hcmtldC50cz85OTYzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIENoYWluSWQsXG4gIE1hcmtldCxcbiAgTWFya2V0Q29uZmlnLFxuICBNYXJrZXRJZCxcbiAgYWRkcmVzc2VzLFxufSBmcm9tIFwiQG1vcnBoby1vcmcvYmx1ZS1zZGtcIjtcbmltcG9ydCB7IHVzZVF1ZXJ5IH0gZnJvbSBcIkB0YW5zdGFjay9yZWFjdC1xdWVyeVwiO1xuaW1wb3J0IHsgQWRkcmVzcyB9IGZyb20gXCJ2aWVtXCI7XG5pbXBvcnQge1xuICBDb25maWcsXG4gIFJlc29sdmVkUmVnaXN0ZXIsXG4gIFVzZVJlYWRDb250cmFjdFBhcmFtZXRlcnMsXG4gIHVzZUNvbmZpZyxcbiAgdXNlUmVhZENvbnRyYWN0LFxufSBmcm9tIFwid2FnbWlcIjtcbmltcG9ydCB7XG4gIFJlYWRDb250cmFjdERhdGEsXG4gIHJlYWRDb250cmFjdFF1ZXJ5T3B0aW9ucyxcbiAgc3RydWN0dXJhbFNoYXJpbmcsXG59IGZyb20gXCJ3YWdtaS9xdWVyeVwiO1xuaW1wb3J0IHsgdXNlQ2hhaW5JZCB9IGZyb20gXCIuL3VzZUNoYWluSWRcIjtcblxuZXhwb3J0IGludGVyZmFjZSBVc2VNYXJrZXRPcHRpb25zIHtcbiAgbWFya2V0SWQ/OiBNYXJrZXRJZDtcbn1cblxuZXhwb3J0IHR5cGUgVXNlTWFya2V0UGFyYW1ldGVyczxjb25maWcgZXh0ZW5kcyBDb25maWcgPSBDb25maWc+ID1cbiAgVXNlTWFya2V0T3B0aW9ucyAmXG4gICAgT21pdDxcbiAgICAgIFVzZVJlYWRDb250cmFjdFBhcmFtZXRlcnM8XG4gICAgICAgIHR5cGVvZiBhYmksXG4gICAgICAgIFwicXVlcnlcIixcbiAgICAgICAgW0FkZHJlc3MsIE1hcmtldElkLCBBZGRyZXNzXSxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBNYXJrZXRcbiAgICAgID4sXG4gICAgICBcImFkZHJlc3NcIiB8IFwiYWJpXCIgfCBcImZ1bmN0aW9uTmFtZVwiIHwgXCJhcmdzXCJcbiAgICA+O1xuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRDYWxsKGNoYWluSWQ6IENoYWluSWQsIG1hcmtldElkOiBNYXJrZXRJZCkge1xuICBjb25zdCB7IG1vcnBobywgYWRhcHRpdmVDdXJ2ZUlybSB9ID0gYWRkcmVzc2VzW2NoYWluSWRdO1xuXG4gIHJldHVybiB7XG4gICAgY2hhaW5JZCxcbiAgICBjb2RlLFxuICAgIGFiaSxcbiAgICBmdW5jdGlvbk5hbWU6IFwicXVlcnlcIixcbiAgICBhcmdzOiBbbW9ycGhvLCBtYXJrZXRJZCwgYWRhcHRpdmVDdXJ2ZUlybV0sXG4gIH0gYXMgY29uc3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZWxlY3RNYXJrZXQoW1xuICBtYXJrZXRQYXJhbXMsXG4gIG1hcmtldCxcbiAgcHJpY2UsXG4gIHJhdGVBdFRhcmdldCxcbl06IFJlYWRDb250cmFjdERhdGE8dHlwZW9mIGFiaSwgXCJxdWVyeVwiLCBbQWRkcmVzcywgTWFya2V0SWQsIEFkZHJlc3NdPikge1xuICByZXR1cm4gbmV3IE1hcmtldCh7XG4gICAgY29uZmlnOiBuZXcgTWFya2V0Q29uZmlnKG1hcmtldFBhcmFtcyksXG4gICAgLi4ubWFya2V0LFxuICAgIHByaWNlLFxuICAgIHJhdGVBdFRhcmdldCxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1c2VNYXJrZXQ8Y29uZmlnIGV4dGVuZHMgQ29uZmlnID0gUmVzb2x2ZWRSZWdpc3RlcltcImNvbmZpZ1wiXT4oXG4gIHBhcmFtZXRlcnM6IFVzZU1hcmtldFBhcmFtZXRlcnM8Y29uZmlnPixcbikge1xuICBjb25zdCBjaGFpbklkID0gdXNlQ2hhaW5JZChwYXJhbWV0ZXJzKTtcblxuICBjb25zdCBjb25maWcgPSB1c2VDb25maWcocGFyYW1ldGVycyk7XG5cbiAgY29uc3Qgb3B0aW9ucyA9IHJlYWRDb250cmFjdFF1ZXJ5T3B0aW9uczxcbiAgICBjb25maWcsXG4gICAgdHlwZW9mIGFiaSxcbiAgICBcInF1ZXJ5XCIsXG4gICAgW0FkZHJlc3MsIE1hcmtldElkLCBBZGRyZXNzXVxuICA+KGNvbmZpZywge1xuICAgIC4uLihwYXJhbWV0ZXJzIGFzIGFueSksXG4gICAgLi4uYnVpbGRDYWxsKGNoYWluSWQsIHBhcmFtZXRlcnMubWFya2V0SWQhKSxcbiAgICBjaGFpbklkOiBwYXJhbWV0ZXJzLmNoYWluSWQgPz8gY2hhaW5JZCxcbiAgfSk7XG5cbiAgcmV0dXJuIHVzZVF1ZXJ5KHtcbiAgICAuLi5wYXJhbWV0ZXJzLnF1ZXJ5LFxuICAgIC4uLm9wdGlvbnMsXG4gICAgZW5hYmxlZDogcGFyYW1ldGVycy5xdWVyeT8uZW5hYmxlZCA/PyB0cnVlLFxuICAgIHN0cnVjdHVyYWxTaGFyaW5nOiBwYXJhbWV0ZXJzLnF1ZXJ5Py5zdHJ1Y3R1cmFsU2hhcmluZyA/PyBzdHJ1Y3R1cmFsU2hhcmluZyxcbiAgfSk7XG5cbiAgcmV0dXJuIHVzZVJlYWRDb250cmFjdCh7XG4gICAgLi4ucGFyYW1ldGVycyxcbiAgICAuLi5idWlsZENhbGwoY2hhaW5JZCwgcGFyYW1ldGVycy5tYXJrZXRJZCEpLFxuICAgIHF1ZXJ5OiB7XG4gICAgICAuLi5wYXJhbWV0ZXJzLnF1ZXJ5LFxuICAgICAgZW5hYmxlZDpcbiAgICAgICAgcGFyYW1ldGVycy5xdWVyeT8uZW5hYmxlZCAhPT0gZmFsc2UgJiYgcGFyYW1ldGVycy5tYXJrZXRJZCAhPSBudWxsLFxuICAgICAgc2VsZWN0OiBzZWxlY3RNYXJrZXQsXG4gICAgfSxcbiAgfSk7XG59XG5cbmV4cG9ydCBjb25zdCBhYmkgPSBbXG4gIHtcbiAgICB0eXBlOiBcImZ1bmN0aW9uXCIsXG4gICAgbmFtZTogXCJxdWVyeVwiLFxuICAgIGlucHV0czogW1xuICAgICAgeyBuYW1lOiBcIm1vcnBob1wiLCB0eXBlOiBcImFkZHJlc3NcIiB9LFxuICAgICAgeyBuYW1lOiBcImlkXCIsIHR5cGU6IFwiYnl0ZXMzMlwiIH0sXG4gICAgICB7IG5hbWU6IFwiYWRhcHRpdmVDdXJ2ZUlybVwiLCB0eXBlOiBcImFkZHJlc3NcIiB9LFxuICAgIF0sXG4gICAgb3V0cHV0czogW1xuICAgICAge1xuICAgICAgICBuYW1lOiBcIm1hcmtldFBhcmFtc1wiLFxuICAgICAgICB0eXBlOiBcInR1cGxlXCIsXG4gICAgICAgIGNvbXBvbmVudHM6IFtcbiAgICAgICAgICB7IG5hbWU6IFwibG9hblRva2VuXCIsIHR5cGU6IFwiYWRkcmVzc1wiIH0sXG4gICAgICAgICAgeyBuYW1lOiBcImNvbGxhdGVyYWxUb2tlblwiLCB0eXBlOiBcImFkZHJlc3NcIiB9LFxuICAgICAgICAgIHsgbmFtZTogXCJvcmFjbGVcIiwgdHlwZTogXCJhZGRyZXNzXCIgfSxcbiAgICAgICAgICB7IG5hbWU6IFwiaXJtXCIsIHR5cGU6IFwiYWRkcmVzc1wiIH0sXG4gICAgICAgICAgeyBuYW1lOiBcImxsdHZcIiwgdHlwZTogXCJ1aW50MjU2XCIgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6IFwibWFya2V0XCIsXG4gICAgICAgIHR5cGU6IFwidHVwbGVcIixcbiAgICAgICAgY29tcG9uZW50czogW1xuICAgICAgICAgIHsgbmFtZTogXCJ0b3RhbFN1cHBseUFzc2V0c1wiLCB0eXBlOiBcInVpbnQxMjhcIiB9LFxuICAgICAgICAgIHsgbmFtZTogXCJ0b3RhbFN1cHBseVNoYXJlc1wiLCB0eXBlOiBcInVpbnQxMjhcIiB9LFxuICAgICAgICAgIHsgbmFtZTogXCJ0b3RhbEJvcnJvd0Fzc2V0c1wiLCB0eXBlOiBcInVpbnQxMjhcIiB9LFxuICAgICAgICAgIHsgbmFtZTogXCJ0b3RhbEJvcnJvd1NoYXJlc1wiLCB0eXBlOiBcInVpbnQxMjhcIiB9LFxuICAgICAgICAgIHsgbmFtZTogXCJsYXN0VXBkYXRlXCIsIHR5cGU6IFwidWludDEyOFwiIH0sXG4gICAgICAgICAgeyBuYW1lOiBcImZlZVwiLCB0eXBlOiBcInVpbnQxMjhcIiB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIHsgbmFtZTogXCJwcmljZVwiLCB0eXBlOiBcInVpbnQyNTZcIiB9LFxuICAgICAgeyBuYW1lOiBcInJhdGVBdFRhcmdldFwiLCB0eXBlOiBcInVpbnQyNTZcIiB9LFxuICAgIF0sXG4gICAgc3RhdGVNdXRhYmlsaXR5OiBcInZpZXdcIixcbiAgfSxcbl0gYXMgY29uc3Q7XG5cbmV4cG9ydCBjb25zdCBjb2RlID1cbiAgXCIweDYwODA4MDYwNDA1MjM0NjAxNTU3NjEwNGYzOTA4MTYxMDAxYjgyMzlmMzViNjAwMDgwZmRmZTYwODA4MDYwNDA1MjYwMDQzNjEwMTU2MTAwMTM1NzYwMDA4MGZkNWI2MDAwMzU2MGUwMWM2M2Q4ZjE3MmM0MTQ2MTAwMjg1NzYwMDA4MGZkNWIzNDYxMDQyMDU3NjA2MDM2NjAwMzE5MDExMjYxMDQyMDU3NjAwNDM1NjAwMTYwMDE2MGEwMWIwMzgxMTY5MTkwODI5MDAzNjEwNDIwNTc2MDQ0MzU2MDAxNjAwMTYwYTAxYjAzODExNjkxNjAyNDM1OTE4MzkwMDM2MTA0MjA1NzYwODA5MDYwMDA5MTgyOTE2MTAwNzk4MTYxMDQyNTU2NWI4MjgxNTI4MjYwMjA4MjAxNTI4MjYwNDA4MjAxNTI4MjYwNjA4MjAxNTIwMTUyODA2MGEwNjA0MDUxNjEwMDlmODE2MTA0NTc1NjViODI4MTUyODI2MDIwODIwMTUyODI2MDQwODIwMTUyODI2MDYwODIwMTUyODI2MDgwODIwMTUyMDE1MjYwMDA5MTYwNDA1MTkwNjMyYzNjOTE1NzYwZTAxYjgyNTI4MDYwMDQ4MzAxNTI2MGEwODI2MDI0ODE4OTVhZmE5MTgyMTU2MTAzODg1Nzg0OTI2MTAzOTM1NzViNTA2MGMwNjAyNDk2NjA0MDUxOTc4ODgwOTI2MzJlMzA3MWNkNjBlMTFiODI1Mjg1NjAwNDgzMDE1MjVhZmE5NTg2MTU2MTAzODg1Nzg0OTY2MTAyZTU1NzViNTA2MDQwODIwMTgwNTE5MDk1OTA2MDAxNjAwMTYwYTAxYjAzMTY4MDYxMDI3MjU3NWI1MDYwNjA4MzAxODA1MTkwOTI5MDYwMDE2MDAxNjBhMDFiMDMxNjgyMTQ2MTAxZjI1NzViNTA1MDYxMDFhMDk1NjA4MDYwMDE2MDAxNjA4MDFiMDM5MzYwYTA5MzYwNDA1MTk4NjAwMTgwODcxYjAzODM1MTE2OGE1MjYwMDE4MDg3MWIwMzYwMjA4NDAxNTExNjYwMjA4YjAxNTI2MDAxODA4NzFiMDM5MDUxMTY2MDQwOGEwMTUyNjAwMTgwODYxYjAzOTA1MTE2NjA2MDg5MDE1MjAxNTE2MDgwODcwMTUyODI4MTUxMTY4Mjg3MDE1MjgyNjAyMDgyMDE1MTE2NjBjMDg3MDE1MjgyNjA0MDgyMDE1MTE2NjBlMDg3MDE1MjgyNjA2MDgyMDE1MTE2NjEwMTAwODcwMTUyODI2MDgwODIwMTUxMTY2MTAxMjA4NzAxNTIwMTUxMTY2MTAxNDA4NDAxNTI2MTAxNjA4MzAxNTI2MTAxODA4MjAxNTJmMzViNjAyMDkwNjAyNDYwNDA5Nzk0OTc1MTgwOTQ4MTkzNjMwMTk3N2I1NzYwZTAxYjgzNTI2MDA0ODMwMTUyNWFmYTkxODIxNTYxMDI2NjU3ODA5MjYxMDIyZDU3NWI1MDkwOTM5MDUwODU2MDgwNjEwMTRhNTY1YjkwOTE1MDYwMjA4MjNkNjAyMDExNjEwMjVlNTc1YjgxNjEwMjQ5NjAyMDkzODM2MTA0NzM1NjViODEwMTAzMTI2MTAyNWI1NzUwNTE4NTYwODA2MTAyMjA1NjViODBmZDViM2Q5MTUwNjEwMjNjNTY1YjYwNDA1MTkwM2Q5MDgyM2UzZDkwZmQ1YjYwNDA1MTYzNTAxYWQ4ZmY2MGUxMWI4MTUyOTE5NDUwNjAyMDkwODI5MDYwMDQ5MDgyOTA1YWZhOTA4MTE1NjEwMmRhNTc4NTkxNjEwMmE0NTc1YjUwOTIzODYxMDEzMDU2NWI5MDUwNjAyMDgxM2Q2MDIwMTE2MTAyZDI1NzViODE2MTAyYmY2MDIwOTM4MzYxMDQ3MzU2NWI4MTAxMDMxMjYxMDJjZTU3NTEzODYxMDI5YzU2NWI4NDgwZmQ1YjNkOTE1MDYxMDJiMjU2NWI2MDQwNTEzZDg3ODIzZTNkOTBmZDViOTA5NTUwNjBjMDgxM2Q2MGMwMTE2MTAzODA1NzViODE2MTAzMDE2MGMwOTM4MzYxMDQ3MzU2NWI4MTAxMDMxMjYxMDM3YzU3NjEwMzcwNjBhMDYwNDA1MTkyNjEwMzFiODQ2MTA0NTc1NjViNjEwMzI0ODE2MTA0YTk1NjViODQ1MjYxMDMzMjYwMjA4MjAxNjEwNGE5NTY1YjYwMjA4NTAxNTI2MTAzNDM2MDQwODIwMTYxMDRhOTU2NWI2MDQwODUwMTUyNjEwMzU0NjA2MDgyMDE2MTA0YTk1NjViNjA2MDg1MDE1MjYxMDM2NTYwODA4MjAxNjEwNGE5NTY1YjYwODA4NTAxNTIwMTYxMDRhOTU2NWI2MGEwODIwMTUyOTQzODYxMDExNzU2NWI4MzgwZmQ1YjNkOTE1MDYxMDJmNDU2NWI2MDQwNTEzZDg2ODIzZTNkOTBmZDViOTU5MTUwNjBhMDg2M2Q2MGEwMTE2MTA0MTg1NzViODE2MTAzYWY2MGEwOTM4MzYxMDQ3MzU2NWI4MTAxMDMxMjYxMDM3YzU3NjBjMDYwMjQ5NjYwODA2MDQwNTE5MTYxMDNjYjgzNjEwNDI1NTY1YjYxMDNkNDgxNjEwNDk1NTY1YjgzNTI2MTAzZTI2MDIwODIwMTYxMDQ5NTU2NWI2MDIwODQwMTUyNjEwM2YzNjA0MDgyMDE2MTA0OTU1NjViNjA0MDg0MDE1MjYxMDQwNDYwNjA4MjAxNjEwNDk1NTY1YjYwNjA4NDAxNTIwMTUxNjA4MDgyMDE1MjkyOTY1MDYxMDBlYTU2NWIzZDkxNTA2MTAzYTI1NjViNjAwMDgwZmQ1YjYwYTA4MTAxOTA4MTEwNjdmZmZmZmZmZmZmZmZmZmZmODIxMTE3NjEwNDQxNTc2MDQwNTI1NjViNjM0ZTQ4N2I3MTYwZTAxYjYwMDA1MjYwNDE2MDA0NTI2MDI0NjAwMGZkNWI2MGMwODEwMTkwODExMDY3ZmZmZmZmZmZmZmZmZmZmZjgyMTExNzYxMDQ0MTU3NjA0MDUyNTY1YjkwNjAxZjgwMTk5MTAxMTY4MTAxOTA4MTEwNjdmZmZmZmZmZmZmZmZmZmZmODIxMTE3NjEwNDQxNTc2MDQwNTI1NjViNTE5MDYwMDE2MDAxNjBhMDFiMDM4MjE2ODIwMzYxMDQyMDU3NTY1YjUxOTA2MDAxNjAwMTYwODAxYjAzODIxNjgyMDM2MTA0MjA1NzU2ZmVhMjY0Njk3MDY2NzM1ODIyMTIyMGRlMzA1MzRlMGVlMDg2NmFiZDRlYmFiMTJkYmJlYTg5MDAzMTM3OTI1OThlZWU3ZDg1NTMwNmU3ZmYxMjhiYzA2NDczNmY2YzYzNDMwMDA4MWEwMDMzXCI7XG4iXSwibmFtZXMiOlsiTWFya2V0IiwiTWFya2V0Q29uZmlnIiwiYWRkcmVzc2VzIiwidXNlUXVlcnkiLCJ1c2VDb25maWciLCJ1c2VSZWFkQ29udHJhY3QiLCJyZWFkQ29udHJhY3RRdWVyeU9wdGlvbnMiLCJzdHJ1Y3R1cmFsU2hhcmluZyIsInVzZUNoYWluSWQiLCJidWlsZENhbGwiLCJjaGFpbklkIiwibWFya2V0SWQiLCJtb3JwaG8iLCJhZGFwdGl2ZUN1cnZlSXJtIiwiY29kZSIsImFiaSIsImZ1bmN0aW9uTmFtZSIsImFyZ3MiLCJzZWxlY3RNYXJrZXQiLCJtYXJrZXRQYXJhbXMiLCJtYXJrZXQiLCJwcmljZSIsInJhdGVBdFRhcmdldCIsImNvbmZpZyIsInVzZU1hcmtldCIsInBhcmFtZXRlcnMiLCJvcHRpb25zIiwicXVlcnkiLCJlbmFibGVkIiwic2VsZWN0IiwidHlwZSIsIm5hbWUiLCJpbnB1dHMiLCJvdXRwdXRzIiwiY29tcG9uZW50cyIsInN0YXRlTXV0YWJpbGl0eSJdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(app-pages-browser)/../../.yarn/__virtual__/@morpho-org-blue-sdk-wagmi-virtual-dd1d11cd44/1/packages/blue-sdk-wagmi/src/hooks/useMarket.ts\n"));

/***/ })

});