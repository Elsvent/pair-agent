// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test attacker that re-enters PairReviewGate.execute() during the
///         inner external call. CLAUDE.md Rule 6 (nonReentrant + CEI) MUST
///         block this — if the test passes the attack, the gate is unsafe.
contract ReentrancyAttacker {
    address public gate;
    bytes public reentrantCalldata;

    function arm(address gate_, bytes calldata reentrantCalldata_) external {
        gate = gate_;
        reentrantCalldata = reentrantCalldata_;
    }

    /// @dev fallback fires when gate.call{value: ...}(req.data) lands on us
    ///      with non-empty calldata that doesn't match any function selector.
    fallback() external payable {
        if (gate != address(0)) {
            (bool ok, bytes memory ret) = gate.call(reentrantCalldata);
            // If the gate's reentrancy guard let the recursive call through,
            // the inner call would have succeeded — we want it to fail.
            // Bubble the inner revert so the OUTER execute() sees CallFailed.
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }

    receive() external payable {}
}
