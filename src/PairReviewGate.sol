// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPairReviewGate} from "./interfaces/IPairReviewGate.sol";
import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";
import {IValidationAdapter} from "./interfaces/IValidationAdapter.sol";

/// @title PairReviewGate
/// @notice 2-of-2 agent safety gate built on ERC-8004.
/// @dev    Implementation owned by Claude Code under the rules in CLAUDE.md.
///         Tests in test/PairReviewGate.test.ts drive the impl.
contract PairReviewGate is IPairReviewGate, EIP712, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // EIP-712 type definitions
    // -------------------------------------------------------------------------
    //
    // Type hash for AgentRequest. The dynamic `bytes data` field is hashed with
    // keccak256 in the struct-hash computation (per EIP-712 dynamic-type rule).
    // If you change AgentRequest, update this typehash AND app/lib/eip712.ts AND
    // regenerate the cross-reference fixtures. The cross-reference test catches
    // mismatches.
    bytes32 internal constant _AGENT_REQUEST_TYPEHASH = keccak256(
        "AgentRequest(uint256 proposerId,uint256 reviewerId,address target,uint256 value,bytes data,uint256 nonce,uint256 deadline,bytes32 contextHash)"
    );

    bytes32 internal constant _VALIDATION_TAG = keccak256("PairReviewGate.v1");

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    IERC8004Identity public immutable identity;
    IValidationAdapter public immutable validation;

    /// @dev Nonce keyed by canonical pair (min(a,b), max(a,b)). Same pair, same counter.
    mapping(bytes32 => uint256) private _pairNonce;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(IERC8004Identity identity_, IValidationAdapter validation_)
        EIP712("PairReviewGate", "1")
    {
        identity = identity_;
        validation = validation_;
    }

    // -------------------------------------------------------------------------
    // External — execute
    // -------------------------------------------------------------------------

    /// @inheritdoc IPairReviewGate
    function execute(
        AgentRequest calldata req,
        bytes calldata proposerSig,
        bytes calldata reviewerSig,
        string calldata evidenceURI,
        bytes32 evidenceHash
    ) external payable nonReentrant returns (bytes memory returnData) {
        // 1. Basic invariants. Order matters: cheapest checks first.
        if (req.proposerId == 0 || req.reviewerId == 0) revert ZeroAgentId();
        if (req.proposerId == req.reviewerId) revert SameAgentTwice(req.proposerId);
        if (block.timestamp > req.deadline) revert ExpiredDeadline(req.deadline, block.timestamp);
        if (msg.value != req.value) revert WrongMsgValue(req.value, msg.value);

        // 2. Pair-keyed nonce check.
        bytes32 pairKey = _pairKey(req.proposerId, req.reviewerId);
        uint256 expectedNonce = _pairNonce[pairKey];
        if (req.nonce != expectedNonce) revert BadNonce(expectedNonce, req.nonce);

        // 3. Resolve current agent wallets at EXECUTION time (CLAUDE.md Rule 5).
        //    Never cache, never pre-resolve, never pass in.
        address proposerWallet = identity.getAgentWallet(req.proposerId);
        address reviewerWallet = identity.getAgentWallet(req.reviewerId);

        // 4. EIP-712 digest the agents signed over.
        bytes32 digest = _hashTypedDataV4(_structHash(req));

        // 5/6. Verify both signatures (SignatureChecker handles ERC-1271 dispatch
        //      transparently for smart-account reviewers, T015).
        if (!SignatureChecker.isValidSignatureNow(proposerWallet, digest, proposerSig)) {
            revert InvalidProposerSig();
        }
        if (!SignatureChecker.isValidSignatureNow(reviewerWallet, digest, reviewerSig)) {
            revert InvalidReviewerSig();
        }

        // 7. Effects: bump pair nonce BEFORE the external call (CLAUDE.md Rule 6).
        unchecked {
            _pairNonce[pairKey] = expectedNonce + 1;
        }

        // 8. Interaction.
        bool ok;
        (ok, returnData) = req.target.call{value: req.value}(req.data);
        if (!ok) revert CallFailed(returnData);

        // 9. Post APPROVED outcome (score=100). The adapter wraps the canonical
        //    two-phase ERC-8004 Validation Registry call (T030).
        validation.postOutcome(
            req.proposerId, 100, digest, evidenceURI, evidenceHash, _VALIDATION_TAG
        );

        // 10. Emit.
        emit Executed(req.proposerId, req.reviewerId, digest, req.target, req.value, returnData);
    }

    // -------------------------------------------------------------------------
    // External — postRejection
    // -------------------------------------------------------------------------

    /// @inheritdoc IPairReviewGate
    function postRejection(
        AgentRequest calldata req,
        bytes calldata proposerSig,
        RejectionReason reason,
        string calldata evidenceURI,
        bytes32 evidenceHash
    ) external {
        // TODO(T018): Claude Code implements per failing tests.
        //
        // Steps:
        //  1. Same invariant checks as execute (ids, deadline, nonce match).
        //  2. If proposerSig.length > 0, verify it (so we know the Proposer at least signed).
        //  3. Increment _pairNonce so the request cannot be re-used as approved.
        //  4. Post REJECTED outcome (score=0) to validation adapter.
        //  5. Emit Rejected.
        revert("not implemented");
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @inheritdoc IPairReviewGate
    function nonceOf(uint256 proposerId, uint256 reviewerId) external view returns (uint256) {
        return _pairNonce[_pairKey(proposerId, reviewerId)];
    }

    /// @notice EIP-712 digest of `req`. Useful for off-chain signing & cross-reference test.
    function digestOf(AgentRequest calldata req) external view returns (bytes32) {
        return _hashTypedDataV4(_structHash(req));
    }

    /// @notice The exposed EIP-712 domain separator (for tests).
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _pairKey(uint256 a, uint256 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    function _structHash(AgentRequest calldata req) internal pure returns (bytes32) {
        // Per EIP-712: dynamic `bytes data` is keccak256-hashed in the struct hash.
        return keccak256(
            abi.encode(
                _AGENT_REQUEST_TYPEHASH,
                req.proposerId,
                req.reviewerId,
                req.target,
                req.value,
                keccak256(req.data),
                req.nonce,
                req.deadline,
                req.contextHash
            )
        );
    }
}
