// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test target that records calls so we can assert execute() forwards correctly.
/// @dev    Deployed by tests; never on production chains.
contract CallTarget {
    bytes public lastData;
    uint256 public lastValue;
    uint256 public callCount;

    function bump(uint256 x) external payable returns (uint256) {
        lastData = msg.data;
        lastValue = msg.value;
        callCount++;
        return x + 1;
    }

    receive() external payable {
        lastValue = msg.value;
        callCount++;
    }
}
