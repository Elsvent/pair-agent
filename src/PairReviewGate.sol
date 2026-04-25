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
/// @dev    Implementation is owned by Claude Code under the rules in CLAUDE.md.
///         This file is a SKELETON. Tests in test/PairReviewGate.test.ts drive the impl.
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
    ) external payable nonReentrant returns (bytes memory) {
        // TODO(T011..T017): Claude Code implements per failing tests in test/PairReviewGate.test.ts.
        //
        // Required steps in order:
        //  1. Validate basic invariants:
        //       - req.proposerId != 0, req.reviewerId != 0  (ZeroAgentId)
        //       - req.proposerId != req.reviewerId          (SameAgentTwice)
        //       - block.timestamp <= req.deadline           (ExpiredDeadline)
        //       - req.value == msg.value                    (WrongMsgValue)
        //  2. Compute pairKey, check req.nonce == _pairNonce[pairKey] (BadNonce).
        //  3. Resolve operators VIA identity.operatorOf(...) AT EXECUTION TIME.
        //     Do NOT cache or pass in. Optional: check identity.isActive(...) (InactiveAgent).
        //  4. Compute the EIP-712 digest from req.
        //  5. Verify proposerSig with SignatureChecker against proposer operator.
        //  6. Verify reviewerSig with SignatureChecker against reviewer operator.
        //  7. EFFECTS: increment _pairNonce[pairKey] BEFORE the external call.
        //  8. INTERACTION: target.call{value: req.value}(req.data); revert on failure.
        //  9. Post APPROVED outcome (score=100) to validation adapter.
        // 10. Emit Executed.
        // 11. Return returnData.
        revert("not implemented");
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
