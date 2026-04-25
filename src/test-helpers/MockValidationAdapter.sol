// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IValidationAdapter} from "../interfaces/IValidationAdapter.sol";

/// @notice Recording validation adapter for tests. Captures every postOutcome call.
contract MockValidationAdapter is IValidationAdapter {
    struct Call {
        uint256 subjectAgentId;
        uint8 score;
        bytes32 requestHash;
        string evidenceURI;
        bytes32 evidenceHash;
        bytes32 tag;
    }

    Call[] public calls;

    function postOutcome(
        uint256 subjectAgentId,
        uint8 score,
        bytes32 requestHash,
        string calldata evidenceURI,
        bytes32 evidenceHash,
        bytes32 tag
    ) external returns (bytes32 validationId) {
        calls.push(Call({
            subjectAgentId: subjectAgentId,
            score: score,
            requestHash: requestHash,
            evidenceURI: evidenceURI,
            evidenceHash: evidenceHash,
            tag: tag
        }));
        return keccak256(abi.encode(calls.length, subjectAgentId, requestHash));
    }

    function callCount() external view returns (uint256) {
        return calls.length;
    }

    function lastCall() external view returns (Call memory) {
        require(calls.length > 0, "no calls");
        return calls[calls.length - 1];
    }
}
