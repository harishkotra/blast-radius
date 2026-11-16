// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IQorePQC} from "./IQorePQC.sol";

/// @title BlastRadiusVault
/// @notice Holds an operator's funds and publishes, on chain, exactly what a
///         stolen key could do at any moment — and every attempt it refused.
///
/// Design commitments, each checkable on the explorer:
///  1. A policy can only be written with BOTH the owner's classical key and a
///     valid ML-DSA-87 signature over the policy digest (PQC Verify precompile).
///  2. An agent is only trusted if its key was registered WITH a proof of
///     possession (`possessionProven`), not merely `registered`.
///  3. Freezing needs only the fast classical key. Unfreezing needs ML-DSA.
///     So a compromised classical key can close the door but never reopen it.
///  4. Refusals do not revert — they are recorded as events. The vault keeps a
///     public log of everything a leaked key tried and was not allowed to do.
contract BlastRadiusVault {
    IQorePQC internal constant PQC_VERIFY =
        IQorePQC(address(0x0000000000000000000000000000000000000a01));
    IQorePQC internal constant PQC_KEY_STATUS =
        IQorePQC(address(0x0000000000000000000000000000000000000a02));

    address public immutable owner;

    struct Policy {
        uint96 perTxCap; // max value of a single payment, in wei
        uint96 dailyCap; // rolling 24h cap, in wei
        uint64 expiry; // unix seconds after which the policy is dead
        uint8 maxCallsPerDay; // caps how many times the key can be exercised
        bool active;
    }

    struct Spend {
        uint256 windowStart;
        uint256 spent;
        uint8 calls;
    }

    // Refusal codes — stable, so the public log can be read without our ABI.
    uint8 public constant REFUSED_NO_POLICY = 1;
    uint8 public constant REFUSED_FROZEN = 2;
    uint8 public constant REFUSED_EXPIRED = 3;
    uint8 public constant REFUSED_NOT_ALLOWLISTED = 4;
    uint8 public constant REFUSED_PER_TX_CAP = 5;
    uint8 public constant REFUSED_DAILY_CAP = 6;
    uint8 public constant REFUSED_CALL_BUDGET = 7;
    uint8 public constant REFUSED_NO_POSSESSION_PROOF = 8;
    uint8 public constant REFUSED_INSUFFICIENT_BALANCE = 9;

    mapping(address => Policy) public policyOf;
    mapping(address => Spend) public spendOf;
    mapping(address => mapping(address => bool)) public isAllowedTarget;
    mapping(address => uint256) public policyNonce;
    mapping(address => bool) public frozen;
    mapping(address => uint256) public refusalCount;

    uint256 public totalPaid;
    uint256 public totalRefused;

    event PolicySet(address indexed agent, bytes32 digest, uint96 perTxCap, uint96 dailyCap, uint64 expiry);
    event Frozen(address indexed agent, address by);
    event Unfrozen(address indexed agent, bytes32 digest);
    event Paid(address indexed agent, address indexed target, uint256 amount, bytes32 invoiceId);
    event Refused(address indexed agent, address indexed target, uint256 amount, uint8 code, bytes32 invoiceId);
    event Funded(address indexed from, uint256 amount);

    error NotOwner();
    error BadSignature();
    error NotPossessionProven(address account);
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ---------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------

    function fund() external payable {
        emit Funded(msg.sender, msg.value);
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    // ---------------------------------------------------------------------
    // Authority
    // ---------------------------------------------------------------------

    /// @notice Write an agent's policy. Requires the owner's classical key
    ///         (msg.sender) *and* an ML-DSA-87 signature over the digest.
    function setPolicy(
        address agent,
        Policy calldata p,
        address[] calldata targets,
        bytes calldata pqcSig,
        bytes calldata ownerPubkey
    ) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();

        // The key we trust must be possession-proven, not just registered.
        (bool registered, , bytes memory registeredKey, bool possessionProven) =
            PQC_KEY_STATUS.pqcKeyStatus(owner);
        if (!registered || !possessionProven) revert NotPossessionProven(owner);
        if (keccak256(registeredKey) != keccak256(ownerPubkey)) revert BadSignature();

        bytes32 digest = policyDigest(agent, p, targets, policyNonce[agent]);
        if (!PQC_VERIFY.pqcVerify(ownerPubkey, pqcSig, abi.encodePacked(digest))) {
            revert BadSignature();
        }

        policyOf[agent] = p;
        policyNonce[agent] += 1;
        frozen[agent] = false;
        emit PolicySet(agent, digest, p.perTxCap, p.dailyCap, p.expiry);

        for (uint256 i = 0; i < targets.length; i++) {
            isAllowedTarget[agent][targets[i]] = true;
        }
    }

    /// @notice Fast kill switch: classical key only. Cheap by design.
    function freeze(address agent) external onlyOwner {
        frozen[agent] = true;
        emit Frozen(agent, msg.sender);
    }

    /// @notice Reopening requires the post-quantum key. A stolen classical key
    ///         can therefore close the vault but never reopen it.
    function unfreeze(address agent, bytes calldata pqcSig, bytes calldata ownerPubkey)
        external
        onlyOwner
    {
        bytes32 digest = keccak256(
            abi.encode(block.chainid, address(this), agent, policyNonce[agent], "UNFREEZE")
        );
        if (!PQC_VERIFY.pqcVerify(ownerPubkey, pqcSig, abi.encodePacked(digest))) {
            revert BadSignature();
        }
        frozen[agent] = false;
        emit Unfrozen(agent, digest);
    }

    function policyDigest(
        address agent,
        Policy calldata p,
        address[] calldata targets,
        uint256 nonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid,
                address(this),
                agent,
                nonce,
                p.perTxCap,
                p.dailyCap,
                p.expiry,
                p.maxCallsPerDay,
                p.active,
                targets
            )
        );
    }

    // ---------------------------------------------------------------------
    // The leaked-key path
    // ---------------------------------------------------------------------

    /// @notice Called by the agent (or by whoever holds the agent's key).
    ///         Never reverts on policy grounds: a refusal is recorded.
    /// @return ok whether the payment was released
    /// @return code refusal code, 0 when paid
    function request(address target, uint256 amount, bytes32 invoiceId)
        external
        returns (bool ok, uint8 code)
    {
        address agent = msg.sender;
        Policy memory p = policyOf[agent];

        if (!p.active) return _refuse(agent, target, amount, REFUSED_NO_POLICY, invoiceId);
        if (frozen[agent]) return _refuse(agent, target, amount, REFUSED_FROZEN, invoiceId);
        if (block.timestamp > p.expiry) {
            return _refuse(agent, target, amount, REFUSED_EXPIRED, invoiceId);
        }
        if (!isAllowedTarget[agent][target]) {
            return _refuse(agent, target, amount, REFUSED_NOT_ALLOWLISTED, invoiceId);
        }

        // Possession proof is checked live, so a key re-registered without one
        // silently loses its authority.
        (, , , bool possessionProven) = PQC_KEY_STATUS.pqcKeyStatus(agent);
        if (!possessionProven) {
            return _refuse(agent, target, amount, REFUSED_NO_POSSESSION_PROOF, invoiceId);
        }

        if (amount > p.perTxCap) {
            return _refuse(agent, target, amount, REFUSED_PER_TX_CAP, invoiceId);
        }

        Spend memory s = spendOf[agent];
        if (block.timestamp >= s.windowStart + 1 days) {
            s.windowStart = block.timestamp;
            s.spent = 0;
            s.calls = 0;
        }
        if (s.spent + amount > p.dailyCap) {
            return _refuse(agent, target, amount, REFUSED_DAILY_CAP, invoiceId);
        }
        if (s.calls >= p.maxCallsPerDay) {
            return _refuse(agent, target, amount, REFUSED_CALL_BUDGET, invoiceId);
        }
        if (address(this).balance < amount) {
            return _refuse(agent, target, amount, REFUSED_INSUFFICIENT_BALANCE, invoiceId);
        }

        s.spent += amount;
        s.calls += 1;
        spendOf[agent] = s;
        totalPaid += amount;

        (bool sent, ) = payable(target).call{value: amount}("");
        if (!sent) {
            return _refuse(agent, target, amount, REFUSED_INSUFFICIENT_BALANCE, invoiceId);
        }

        emit Paid(agent, target, amount, invoiceId);
        return (true, 0);
    }

    function _refuse(
        address agent,
        address target,
        uint256 amount,
        uint8 code,
        bytes32 invoiceId
    ) internal returns (bool, uint8) {
        refusalCount[agent] += 1;
        totalRefused += 1;
        emit Refused(agent, target, amount, code, invoiceId);
        return (false, code);
    }

    // ---------------------------------------------------------------------
    // The number that goes on the poster
    // ---------------------------------------------------------------------

    /// @notice What a stolen agent key can actually move right now.
    function blastRadius(address agent)
        external
        view
        returns (
            uint256 spendableNow,
            uint256 perTxCap,
            uint256 dailyRemaining,
            uint64 expiry,
            bool isFrozen,
            bool active
        )
    {
        Policy memory p = policyOf[agent];

        uint256 spent;
        uint256 calls;
        (spent, calls) = _currentSpend(agent);

        uint256 remaining = p.dailyCap > spent ? p.dailyCap - spent : 0;
        uint256 callRoom = calls < p.maxCallsPerDay ? uint256(p.maxCallsPerDay) - calls : 0;
        uint256 balance = address(this).balance;

        uint256 cap = remaining < balance ? remaining : balance;
        if (p.perTxCap < cap) cap = p.perTxCap;
        if (callRoom == 0) cap = 0;
        bool dead = frozen[agent] || !p.active || block.timestamp > p.expiry;

        return (dead ? 0 : cap, p.perTxCap, remaining, p.expiry, frozen[agent], p.active);
    }

    function _currentSpend(address agent) internal view returns (uint256 spent, uint256 calls) {
        Spend memory s = spendOf[agent];
        if (block.timestamp < s.windowStart + 1 days) {
            spent = s.spent;
            calls = s.calls;
        }
    }

    function refusalCodes() external pure returns (string[9] memory) {
        return [
            "0 none",
            "1 no policy",
            "2 frozen",
            "3 expired",
            "4 target not allowlisted",
            "5 over per-tx cap",
            "6 over daily cap",
            "7 call budget exhausted",
            "8 no possession proof"
        ];
    }
}
