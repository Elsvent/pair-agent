// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPairReviewGate
/// @notice Interface for the 2-of-2 agent safety gate.
/// @dev See ARCHITECTURE.md for full design.
interface IPairReviewGate {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice EIP-712 typed structure that BOTH agents sign.
    /// @dev Type hash: see PairReviewGate._AGENT_REQUEST_TYPEHASH.
    ///      `data` is hashed with keccak256 in the struct hash (dynamic type rule).
    struct AgentRequest {
        uint256 proposerId;
        uint256 reviewerId;
        address target;
        uint256 value;
        bytes data;
        uint256 nonce;
        uint256 deadline;
        bytes32 contextHash;
    }

    enum RejectionReason {
        Unspecified,
        ReviewerPolicy,
        ReviewerSignatureMissing,
        ProposerSignatureMissing,
        ContextMismatch,
        Other
    }

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error BadNonce(uint256 expected, uint256 got);
    error ExpiredDeadline(uint256 deadline, uint256 nowTs);
    error InvalidProposerSig();
    error InvalidReviewerSig();
    error SameAgentTwice(uint256 agentId);
    error ZeroAgentId();
    error ContextHashMismatch();
    error InactiveAgent(uint256 agentId);
    error CallFailed(bytes returnData);
    error WrongMsgValue(uint256 expected, uint256 got);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted on a successful pair-approved execution.
    event Executed(
        uint256 indexed proposerId,
        uint256 indexed reviewerId,
        bytes32 indexed requestHash,
        address target,
        uint256 value,
        bytes returnData
    );

    /// @notice Emitted when a request is recorded as rejected (Reviewer refused, etc.).
    event Rejected(
        uint256 indexed proposerId,
        uint256 indexed reviewerId,
        bytes32 indexed requestHash,
        RejectionReason reason,
        string evidenceURI
    );

    // -------------------------------------------------------------------------
    // External
    // -------------------------------------------------------------------------

    /// @notice Execute a request approved by both agents. Reverts on any verification failure.
    /// @dev Pulls operator addresses from the Identity Registry at call time.
    function execute(
        AgentRequest calldata req,
        bytes calldata proposerSig,
        bytes calldata reviewerSig,
        string calldata evidenceURI,
        bytes32 evidenceHash
    ) external payable returns (bytes memory);

    /// @notice Record a rejection (e.g. Reviewer refused). Advances the pair nonce so
    ///         the same request cannot be re-submitted as approved.
    function postRejection(
        AgentRequest calldata req,
        bytes calldata proposerSig,
        RejectionReason reason,
        string calldata evidenceURI,
        bytes32 evidenceHash
    ) external;

    /// @notice Current nonce for a given agent pair, in canonical (lowerId, higherId) order.
    function nonceOf(uint256 proposerId, uint256 reviewerId) external view returns (uint256);
}
