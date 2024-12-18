// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.5.0;

import {IERC20Permit} from "./IERC20Permit.sol";
import {IWhitelistControllerAggregator} from "./IWhitelistControllerAggregator.sol";

interface IWrappedBackedToken is IERC20Permit {
    function whitelistControllerAggregator() external view returns (IWhitelistControllerAggregator);
}
