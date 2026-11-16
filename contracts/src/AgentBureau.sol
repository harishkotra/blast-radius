// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

/**
 * AgentBureau — authority that attenuates.
 *
 * Blast Radius bounds one key. An agent economy needs the next step: an agent
 * that hires another agent, and hands it less authority than it holds, provably.
 *
 * Every grant is checked against its parent at creation time AND at spend time:
 *   per-tx cap  <= parent per-tx cap
 *   budget      <= parent budget still unspent
 *   expiry      <= parent expiry
 *   targets     subset of parent targets
 *   depth       <= MAX_DEPTH
 *
 * A spend walks the whole ancestor chain, so a child cannot spend the same
 * budget twice, cannot outlive its parent, and dies the instant any ancestor
 * is revoked. The refusal is recorded as an event, never a silent revert.
 */
interface IPqcKeyStatus {
    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven);
}

contract AgentBureau {
    IPqcKeyStatus internal constant PQC_STATUS =
        IPqcKeyStatus(0x0000000000000000000000000000000000000a02);

    uint8 public constant MAX_DEPTH = 4;

    struct Node {
        address parent;
        uint96 perTxCap;
        uint96 budget;
        uint96 spent;
        uint64 expiry;
        uint8 maxCalls;
        uint8 calls;
        uint8 depth;
        bool exists;
        bool active;
    }

    struct Scope {
        uint96 perTxCap;
        uint96 budget;
        uint64 expiry;
        uint8 maxCalls;
        address[] targets;
    }

    mapping(address => Node) public nodes;
    mapping(address => mapping(address => bool)) public allows;
    mapping(address => address[]) public children;

    // Refusal reasons, stable on purpose: a log a judge can read.
    uint8 public constant OK = 0;
    uint8 public constant NO_AUTHORITY = 1;
    uint8 public constant NOT_ACTIVE = 2;
    uint8 public constant EXPIRED = 3;
    uint8 public constant TARGET_REFUSED = 4;
    uint8 public constant OVER_PER_TX = 5;
    uint8 public constant OVER_BUDGET = 6;
    uint8 public constant OVER_CALLS = 7;
    uint8 public constant PARENT_BLOCKED = 8;
    uint8 public constant NOT_POSSESSED = 9;
    uint8 public constant REVOKED = 10;

    event Opened(address indexed node, address funder, uint96 budget, uint64 expiry);
    event Granted(address indexed parent, address indexed child, uint96 perTxCap, uint96 budget, uint64 expiry);
    event Spent(address indexed node, address indexed target, uint96 amount, string memo);
    event Refused(address indexed node, address indexed target, uint96 amount, uint8 code, address blamed);
    event Revoked(address indexed node, uint8 descendants);
    event ToppedUp(address indexed node, uint96 amount);

    modifier onlyHolder(address node) {
        require(msg.sender == node, "bureau: not the holder of this authority");
        _;
    }

    /// Open a root authority and escrow QOR under it.
    function open(
        uint96 perTxCap,
        uint64 expiry,
        uint8 maxCalls,
        address[] calldata targets
    ) external payable returns (Node memory) {
        require(!nodes[msg.sender].exists, "bureau: already has an authority");
        require(msg.value > 0, "bureau: fund it");
        require(expiry > block.timestamp, "bureau: expiry in the past");
        require(maxCalls > 0 && perTxCap > 0, "bureau: empty scope");
        _requirePossession(msg.sender);

        Node storage n = nodes[msg.sender];
        n.parent = address(0);
        n.perTxCap = perTxCap;
        n.budget = uint96(msg.value);
        n.expiry = expiry;
        n.maxCalls = maxCalls;
        n.depth = 0;
        n.exists = true;
        n.active = true;
        _setTargets(msg.sender, targets, true);

        emit Opened(msg.sender, msg.sender, uint96(msg.value), expiry);
        // Funds stay in this contract; payout happens on spend.
        return n;
    }

    /// Delegate a strictly smaller authority to a child agent.
    function grant(address child, Scope calldata scope) external returns (uint8 code) {
        Node storage p = nodes[msg.sender];
        if (!p.exists || !p.active) return _refuse(msg.sender, child, 0, NO_AUTHORITY, msg.sender);
        if (scope.expiry > p.expiry) return _refuse(msg.sender, child, 0, EXPIRED, msg.sender);
        if (p.depth + 1 > MAX_DEPTH) return _refuse(msg.sender, child, 0, NO_AUTHORITY, msg.sender);
        if (scope.perTxCap > p.perTxCap) return _refuse(msg.sender, child, 0, OVER_PER_TX, msg.sender);
        if (uint256(scope.budget) > _remaining(p)) return _refuse(msg.sender, child, 0, OVER_BUDGET, msg.sender);
        if (scope.maxCalls == 0 || scope.maxCalls > p.maxCalls) {
            return _refuse(msg.sender, child, 0, OVER_CALLS, msg.sender);
        }
        if (_hasAncestor(child, msg.sender)) {
            return _refuse(msg.sender, child, 0, NO_AUTHORITY, child); // cycles are not authority
        }
        if (!_status(child)) return _refuse(msg.sender, child, 0, NOT_POSSESSED, child);
        if (nodes[child].exists && nodes[child].parent != msg.sender) {
            return _refuse(msg.sender, child, 0, NO_AUTHORITY, child);
        }

        for (uint256 i = 0; i < scope.targets.length; i++) {
            if (!allows[msg.sender][scope.targets[i]]) {
                return _refuse(msg.sender, child, 0, TARGET_REFUSED, scope.targets[i]); // cannot widen
            }
        }

        Node storage c = nodes[child];
        c.parent = msg.sender;
        c.perTxCap = scope.perTxCap;
        c.budget = scope.budget;
        c.spent = 0;
        c.calls = 0;
        c.expiry = scope.expiry;
        c.maxCalls = scope.maxCalls;
        c.depth = p.depth + 1;
        c.exists = true;
        c.active = true;
        _setTargets(child, scope.targets, true);
        _addChild(msg.sender, child);

        emit Granted(msg.sender, child, scope.perTxCap, scope.budget, scope.expiry);
        return OK;
    }

    /// Spend from an authority. Every ancestor's budget and call count moves too.
    function spend(address payable target, uint96 amount, string calldata memo) external returns (uint8 code) {
        Node storage n = nodes[msg.sender];
        if (!n.exists) return _refuse(msg.sender, target, amount, NO_AUTHORITY, msg.sender);
        if (!n.active) return _refuse(msg.sender, target, amount, REVOKED, msg.sender);
        if (amount == 0) return _refuse(msg.sender, target, amount, OVER_PER_TX, msg.sender);
        if (block.timestamp >= n.expiry) return _refuse(msg.sender, target, amount, EXPIRED, msg.sender);
        if (!allows[msg.sender][target]) return _refuse(msg.sender, target, amount, TARGET_REFUSED, msg.sender);
        if (amount > n.perTxCap) return _refuse(msg.sender, target, amount, OVER_PER_TX, msg.sender);
        if (uint256(n.spent) + amount > n.budget) return _refuse(msg.sender, target, amount, OVER_BUDGET, msg.sender);
        if (n.calls + 1 > n.maxCalls) return _refuse(msg.sender, target, amount, OVER_CALLS, msg.sender);

        // Walk up: the same spend must be affordable at every level, or it is
        // money the parent never granted and no level may honour.
        address cursor = n.parent;
        while (cursor != address(0)) {
            Node storage a = nodes[cursor];
            if (!a.active) return _refuse(msg.sender, target, amount, PARENT_BLOCKED, cursor);
            if (block.timestamp >= a.expiry) return _refuse(msg.sender, target, amount, EXPIRED, cursor);
            if (uint256(a.spent) + amount > a.budget) return _refuse(msg.sender, target, amount, OVER_BUDGET, cursor);
            if (a.calls + 1 > a.maxCalls) return _refuse(msg.sender, target, amount, OVER_CALLS, cursor);
            if (!allows[cursor][target]) return _refuse(msg.sender, target, amount, TARGET_REFUSED, cursor);
            cursor = a.parent;
        }

        // All levels admit it: charge every level.
        cursor = msg.sender;
        while (cursor != address(0)) {
            nodes[cursor].spent += amount;
            nodes[cursor].calls += 1;
            cursor = nodes[cursor].parent;
        }

        (bool ok, ) = target.call{value: amount}("");
        require(ok, "bureau: transfer failed");
        emit Spent(msg.sender, target, amount, memo);
        return OK;
    }

    /// Revoke an authority and everything under it, in one transaction.
    function revoke(address node) external returns (uint8 descendants) {
        Node storage n = nodes[node];
        require(n.exists, "bureau: no such authority");
        require(msg.sender == node || nodes[msg.sender].active, "bureau: not authorised to revoke");

        descendants = _revokeDown(node);
        emit Revoked(node, descendants);
    }

    function topUp() external payable {
        require(nodes[msg.sender].exists, "bureau: no authority");
        nodes[msg.sender].budget += uint96(msg.value);
        emit ToppedUp(msg.sender, uint96(msg.value));
    }

    // ── views ───────────────────────────────────────────────────────────────

    function chainOf(address node) external view returns (address[] memory chain) {
        uint8 d = nodes[node].depth;
        chain = new address[](d + 1);
        address cursor = node;
        uint8 i = d + 1;
        while (i > 0) {
            chain[--i] = cursor;
            cursor = nodes[cursor].parent;
        }
    }

    /// The sentence a judge reads: how much can this key move in total, right now?
    function blastRadius(address node) external view returns (uint96 spendable, uint96 perAttempt, uint8 code) {
        Node storage n = nodes[node];
        if (!n.exists) return (0, 0, NO_AUTHORITY);
        if (!n.active) return (0, 0, REVOKED);
        if (block.timestamp >= n.expiry) return (0, n.perTxCap, EXPIRED);

        uint96 room = uint96(_remaining(n));
        uint8 left = n.maxCalls - n.calls;
        address cursor = n.parent;
        while (cursor != address(0)) {
            Node storage a = nodes[cursor];
            if (!a.active) return (0, n.perTxCap, PARENT_BLOCKED);
            if (block.timestamp >= a.expiry) return (0, n.perTxCap, EXPIRED);
            uint96 r = uint96(_remaining(a));
            if (r < room) room = r;
            uint8 al = a.maxCalls - a.calls;
            if (al < left) left = al;
            cursor = a.parent;
        }
        spendable = left == 0 ? 0 : room;
        perAttempt = n.perTxCap;
        code = left == 0 ? OVER_CALLS : OK;
    }

    // ── internals ───────────────────────────────────────────────────────────

    function _remaining(Node storage n) internal view returns (uint256) {
        return n.budget > n.spent ? n.budget - n.spent : 0;
    }

    function _status(address who) internal view returns (bool) {
        try PQC_STATUS.pqcKeyStatus(who) returns (bool, uint8, bytes memory, bool proven) {
            return proven;
        } catch {
            return false;
        }
    }

    function _requirePossession(address who) internal view {
        require(_status(who), "bureau: register a post-quantum key with proof of possession first");
    }

    function _setTargets(address node, address[] memory targets, bool value) internal {
        for (uint256 i = 0; i < targets.length; i++) {
            allows[node][targets[i]] = value;
        }
    }

    function _addChild(address parent, address child) internal {
        address[] storage kids = children[parent];
        for (uint256 i = 0; i < kids.length; i++) {
            if (kids[i] == child) return;
        }
        kids.push(child);
    }

    function _revokeDown(address node) internal returns (uint8 count) {
        nodes[node].active = false;
        count = 1;
        address[] storage kids = children[node];
        for (uint256 i = 0; i < kids.length; i++) {
            address kid = kids[i];
            if (nodes[kid].exists && nodes[kid].active) {
                count += _revokeDown(kid); // depth is bounded by MAX_DEPTH
            }
        }
    }

    function _hasAncestor(address candidate, address node) internal view returns (bool) {
        address cursor = node;
        while (cursor != address(0)) {
            if (cursor == candidate) return true;
            cursor = nodes[cursor].parent;
        }
        return false;
    }

    function _refuse(
        address node,
        address target,
        uint96 amount,
        uint8 code,
        address blamed
    ) internal returns (uint8) {
        emit Refused(node, target, amount, code, blamed);
        return code;
    }

    receive() external payable {}
}
