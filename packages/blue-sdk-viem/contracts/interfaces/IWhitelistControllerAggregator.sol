// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.5.0;

interface IWhitelistControllerAggregator {
    function isWhitelisted(address addressToCheck) external view returns (bool isWhitelisted);
}
