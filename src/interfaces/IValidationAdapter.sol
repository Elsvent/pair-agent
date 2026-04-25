// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IValidationAdapter
/// @notice Decouples PairReviewGate from a specific ERC-8004 Validation Registry version.
///         Swapping registry versions = swapping the adapter; gate is untouched.
interface IValidationAdapter {
    function postOutcome(
        uint256 subjectAgentId,
        uint8 score,
        bytes32 requestHash,
        string calldata evidenceURI,
        bytes32 evidenceHash,
        bytes32 tag
    ) external returns (bytes32 validationId);
}
