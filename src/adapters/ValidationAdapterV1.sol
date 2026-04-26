// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IValidationAdapter} from "../interfaces/IValidationAdapter.sol";
import {IERC8004Validation} from "../interfaces/IERC8004Validation.sol";

/// @title ValidationAdapterV1
/// @notice Adapter from PairReviewGate's IValidationAdapter to the canonical
///         ERC-8004 Validation Registry's two-phase API
///         (validationRequest -> validationResponse).
/// @dev    SKELETON until T030. Compile-green stub keeps the gate's call site
///         working; T030 wires the actual two-phase calls.
contract ValidationAdapterV1 is IValidationAdapter {
    IERC8004Validation public immutable registry;

    constructor(IERC8004Validation registry_) {
        registry = registry_;
    }

    /// @inheritdoc IValidationAdapter
    /// @dev TODO(T030): translate to two-phase canonical API:
    ///        registry.validationRequest(address(this), subjectAgentId, evidenceURI, requestHash);
    ///        registry.validationResponse(requestHash, score, evidenceURI, evidenceHash, _tagToString(tag));
    ///      Note: canonical `tag` is `string`, but our gate-facing API uses
    ///      `bytes32`. T030 decides whether to widen IValidationAdapter or
    ///      convert in the adapter.
    function postOutcome(
        uint256 subjectAgentId,
        uint8 score,
        bytes32 requestHash,
        string calldata evidenceURI,
        bytes32 evidenceHash,
        bytes32 tag
    ) external returns (bytes32 validationId) {
        // Stub: compile-green, no on-chain call until T030.
        subjectAgentId;
        score;
        evidenceURI;
        evidenceHash;
        tag;
        validationId = requestHash;
    }
}
