// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IValidationAdapter} from "../interfaces/IValidationAdapter.sol";
import {IERC8004Validation} from "../interfaces/IERC8004Validation.sol";

/// @title ValidationAdapterV1
/// @notice Bridges PairReviewGate's IValidationAdapter (one-shot postOutcome)
///         to the canonical ERC-8004 Validation Registry's two-phase API
///         (validationRequest + validationResponse).
/// @dev    For postOutcome to succeed against the canonical registry, the
///         agent owner of `subjectAgentId` must have approved this adapter
///         (e.g., via setApprovalForAll) so msg.sender is authorized for
///         validationRequest. T032's mintAgents script handles the approval.
contract ValidationAdapterV1 is IValidationAdapter {
    IERC8004Validation public immutable registry;

    constructor(IERC8004Validation registry_) {
        registry = registry_;
    }

    /// @inheritdoc IValidationAdapter
    /// @dev validatorAddress is set to address(this) so this contract has
    ///      authority to call validationResponse in the same transaction.
    function postOutcome(
        uint256 subjectAgentId,
        uint8 score,
        bytes32 requestHash,
        string calldata evidenceURI,
        bytes32 evidenceHash,
        bytes32 tag
    ) external returns (bytes32 validationId) {
        // Phase 1: declare upcoming validation. Permission: msg.sender (this
        //          adapter) must be the agent owner OR an approved operator.
        registry.validationRequest(address(this), subjectAgentId, evidenceURI, requestHash);

        // Phase 2: record the outcome. Permission: msg.sender must be the
        //          validatorAddress declared above (which is address(this)).
        registry.validationResponse(
            requestHash, score, evidenceURI, evidenceHash, _bytes32ToHexString(tag)
        );

        validationId = requestHash;
    }

    /// @dev Render a bytes32 as a 0x-prefixed lowercase hex string ("0x" + 64 chars).
    ///      Used to translate the gate's bytes32 tag to the canonical registry's
    ///      string tag without losing information.
    function _bytes32ToHexString(bytes32 v) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory result = new bytes(66);
        result[0] = "0";
        result[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(v[i]);
            result[2 + i * 2] = alphabet[b >> 4];
            result[3 + i * 2] = alphabet[b & 0x0f];
        }
        return string(result);
    }
}
