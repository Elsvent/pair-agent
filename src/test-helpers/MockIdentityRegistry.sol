// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC8004Identity} from "../interfaces/IERC8004Identity.sol";

/// @notice Test mock for IERC8004Identity. Lets tests rotate operators and toggle
///         active state to exercise PairReviewGate's security properties.
contract MockIdentityRegistry is IERC8004Identity {
    struct Agent {
        address owner;
        address operator;
        string uri;
        bool active;
        bool exists;
    }

    mapping(uint256 => Agent) internal _agents;

    function setAgent(
        uint256 agentId,
        address owner_,
        address operator_,
        string memory uri_,
        bool active_
    ) external {
        _agents[agentId] = Agent({
            owner: owner_,
            operator: operator_,
            uri: uri_,
            active: active_,
            exists: true
        });
    }

    function rotateOperator(uint256 agentId, address newOperator) external {
        require(_agents[agentId].exists, "no agent");
        _agents[agentId].operator = newOperator;
    }

    function setActive(uint256 agentId, bool v) external {
        require(_agents[agentId].exists, "no agent");
        _agents[agentId].active = v;
    }

    function operatorOf(uint256 agentId) external view returns (address) {
        return _agents[agentId].operator;
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        return _agents[agentId].owner;
    }

    function tokenURI(uint256 agentId) external view returns (string memory) {
        return _agents[agentId].uri;
    }

    function isActive(uint256 agentId) external view returns (bool) {
        return _agents[agentId].active;
    }
}
