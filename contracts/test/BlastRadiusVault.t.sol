// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BlastRadiusVault} from "../src/BlastRadiusVault.sol";

/// @notice Stand-in for the PQC Verify precompile at 0x…0a01.
/// A "signature" is valid when it hashes to the message digest — enough to
/// exercise the contract's trust logic without 4.6KB Dilithium artifacts.
contract PqcVerifyStub {
    function pqcVerify(bytes calldata, bytes calldata signature, bytes calldata message)
        external
        pure
        returns (bool)
    {
        return signature.length == 32 && keccak256(signature) == keccak256(message);
    }
}

/// @notice Stand-in for the PQC Key Status precompile at 0x…0a02.
contract PqcKeyStatusStub {
    mapping(address => bool) public registered;
    mapping(address => bool) public proven;
    mapping(address => bytes) internal keys;

    function set(address a, bytes calldata key, bool isProven) external {
        registered[a] = true;
        proven[a] = isProven;
        keys[a] = key;
    }

    function pqcKeyStatus(address account)
        external
        view
        returns (bool, uint8, bytes memory, bool)
    {
        if (!registered[account]) return (false, 0, "", false);
        return (true, 1, keys[account], proven[account]);
    }
}

contract BlastRadiusVaultTest is Test {
    BlastRadiusVault vault;
    PqcKeyStatusStub status;

    address owner = address(0xA11CE);
    address agent = address(0xB0B);
    address vendor = address(0xCAFE);
    address attackerTarget = address(0xBAD);
    address surplus = address(0x5111);

    bytes ownerKey = hex"aa11";
    bytes agentKey = hex"bb22";

    function setUp() public {
        // Etch the stubs at the real precompile addresses, then talk to the
        // etched copy so storage lives where the vault actually reads.
        PqcVerifyStub verifyTemplate = new PqcVerifyStub();
        PqcKeyStatusStub statusTemplate = new PqcKeyStatusStub();
        vm.etch(address(0x0000000000000000000000000000000000000a01), address(verifyTemplate).code);
        vm.etch(address(0x0000000000000000000000000000000000000a02), address(statusTemplate).code);
        status = PqcKeyStatusStub(address(0x0000000000000000000000000000000000000a02));

        vm.deal(owner, 100 ether);
        vm.prank(owner);
        vault = new BlastRadiusVault();
        vm.deal(address(vault), 10 ether);

        status.set(owner, ownerKey, true);
        status.set(agent, agentKey, true);
    }

    function _sig(bytes32 digest) internal pure returns (bytes memory) {
        return abi.encodePacked(digest);
    }

    function _policy(uint96 perTx, uint96 daily, uint64 expiry, uint8 calls)
        internal
        pure
        returns (BlastRadiusVault.Policy memory)
    {
        return BlastRadiusVault.Policy({
            perTxCap: perTx,
            dailyCap: daily,
            expiry: expiry,
            maxCallsPerDay: calls,
            active: true,
            heartbeat: 0,
            lastBeat: 0,
            rotatedOut: false
        });
    }

    function _install(uint96 perTx, uint96 daily, uint64 expiry, uint8 calls) internal {
        address[] memory targets = new address[](1);
        targets[0] = vendor;
        BlastRadiusVault.Policy memory p = _policy(perTx, daily, expiry, calls);
        bytes32 digest = vault.policyDigest(agent, p, targets, 0);
        vm.prank(owner);
        vault.setPolicy(agent, p, targets, _sig(digest), ownerKey);
    }

    // ---------- authority ----------

    function test_setPolicy_requiresPossessionProof() public {
        address[] memory targets = new address[](1);
        targets[0] = vendor;
        BlastRadiusVault.Policy memory p = _policy(1 ether, 2 ether, uint64(block.timestamp + 1 days), 5);
        bytes32 digest = vault.policyDigest(agent, p, targets, 0);

        status.set(owner, ownerKey, false); // registered, but not proven
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(BlastRadiusVault.NotPossessionProven.selector, owner)
        );
        vault.setPolicy(agent, p, targets, _sig(digest), ownerKey);
    }

    function test_setPolicy_rejectsBadPqcSignature() public {
        address[] memory targets = new address[](1);
        targets[0] = vendor;
        BlastRadiusVault.Policy memory p = _policy(1 ether, 2 ether, uint64(block.timestamp + 1 days), 5);
        vm.prank(owner);
        vm.expectRevert(BlastRadiusVault.BadSignature.selector);
        vault.setPolicy(agent, p, targets, abi.encodePacked(bytes32(uint256(1))), ownerKey);
    }

    // ---------- the happy path ----------

    function test_paysAllowlistedWithinCaps() public {
        _install(1 ether, 3 ether, uint64(block.timestamp + 1 days), 5);
        vm.prank(agent);
        (bool ok, uint8 code) = vault.request(vendor, 0.8 ether, "inv-1");
        assertTrue(ok);
        assertEq(code, 0);
        assertEq(vendor.balance, 0.8 ether);
        assertEq(vault.totalPaid(), 0.8 ether);
    }

    // ---------- what a leaked key cannot do ----------

    function test_leakedKeyCannotReachUnlistedTarget() public {
        _install(1 ether, 3 ether, uint64(block.timestamp + 1 days), 5);
        vm.prank(agent); // attacker holds exactly this key
        (bool ok, uint8 code) = vault.request(attackerTarget, 1 ether, "drain");

        assertFalse(ok);
        assertEq(code, vault.REFUSED_NOT_ALLOWLISTED());
        assertEq(attackerTarget.balance, 0);
        assertEq(vault.refusalCount(agent), 1);
    }

    function test_leakedKeyCannotExceedCaps() public {
        _install(1 ether, 2 ether, uint64(block.timestamp + 1 days), 5);

        vm.prank(agent);
        (, uint8 code) = vault.request(vendor, 2 ether, "too-big");
        assertEq(code, vault.REFUSED_PER_TX_CAP());

        vm.prank(agent);
        (bool ok, ) = vault.request(vendor, 1 ether, "ok-1");
        assertTrue(ok);
        vm.prank(agent);
        (ok, ) = vault.request(vendor, 1 ether, "ok-2");
        assertTrue(ok);
        vm.prank(agent);
        (, code) = vault.request(vendor, 1 ether, "ok-3");
        assertEq(code, vault.REFUSED_DAILY_CAP());
    }

    function test_callBudget() public {
        _install(1 ether, 10 ether, uint64(block.timestamp + 1 days), 2);
        vm.prank(agent);
        vault.request(vendor, 0.1 ether, "a");
        vm.prank(agent);
        vault.request(vendor, 0.1 ether, "b");
        vm.prank(agent);
        (, uint8 code) = vault.request(vendor, 0.1 ether, "c");
        assertEq(code, vault.REFUSED_CALL_BUDGET());
    }

    function test_expiryKillsPolicy() public {
        _install(1 ether, 3 ether, uint64(block.timestamp + 1 hours), 5);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(agent);
        (, uint8 code) = vault.request(vendor, 0.1 ether, "late");
        assertEq(code, vault.REFUSED_EXPIRED());
    }

    function test_possessionRevokedLosesAuthority() public {
        _install(1 ether, 3 ether, uint64(block.timestamp + 1 days), 5);
        status.set(agent, agentKey, false); // key re-registered without proof
        vm.prank(agent);
        (, uint8 code) = vault.request(vendor, 0.1 ether, "x");
        assertEq(code, vault.REFUSED_NO_POSSESSION_PROOF());
    }

    // ---------- asymmetric kill switch ----------

    function test_freezeIsCheap_unfreezeNeedsMLDSA() public {
        _install(1 ether, 3 ether, uint64(block.timestamp + 1 days), 5);

        vm.prank(owner);
        vault.freeze(agent);
        vm.prank(agent);
        (, uint8 code) = vault.request(vendor, 0.1 ether, "while-frozen");
        assertEq(code, vault.REFUSED_FROZEN());

        bytes32 digest = keccak256(
            abi.encode(block.chainid, address(vault), agent, vault.policyNonce(agent), "UNFREEZE")
        );
        vm.prank(owner);
        vm.expectRevert(BlastRadiusVault.BadSignature.selector);
        vault.unfreeze(agent, abi.encodePacked(bytes32(uint256(9))), ownerKey);

        vm.prank(owner);
        vault.unfreeze(agent, _sig(digest), ownerKey);
        vm.prank(agent);
        (bool ok, ) = vault.request(vendor, 0.1 ether, "after");
        assertTrue(ok);
    }

    // ---------- the published number ----------

    function test_blastRadiusShrinksAsBudgetIsUsed() public {
        _install(1 ether, 2 ether, uint64(block.timestamp + 1 days), 3);

        (uint256 now0, , , , , ) = vault.blastRadius(agent);
        assertEq(now0, 1 ether); // per-tx cap binds first

        vm.prank(agent);
        vault.request(vendor, 1 ether, "1");

        (uint256 now1, , uint256 dailyLeft, , , ) = vault.blastRadius(agent);
        assertEq(dailyLeft, 1 ether);
        assertEq(now1, 1 ether);

        vm.prank(owner);
        vault.freeze(agent);
        (uint256 nowFrozen, , , , bool isFrozen, ) = vault.blastRadius(agent);
        assertTrue(isFrozen);
        assertEq(nowFrozen, 0);
    }

    function test_refusalsAreCheap() public {
        _install(1 ether, 3 ether, uint64(block.timestamp + 1 days), 5);
        uint256 gasBefore = gasleft();
        vm.prank(agent);
        vault.request(attackerTarget, 1 ether, "spam");
        uint256 used = gasBefore - gasleft();
        emit log_named_uint("gas for a recorded refusal", used);
        assertLt(used, 120_000);
    }
    // ---------- liveness: authority has a pulse ----------

    function _installWithHeartbeat(uint32 beat) internal {
        address[] memory targets = new address[](1);
        targets[0] = vendor;
        BlastRadiusVault.Policy memory p = _policy(1 ether, 3 ether, uint64(block.timestamp + 7 days), 5);
        p.heartbeat = beat;
        bytes32 digest = vault.policyDigest(agent, p, targets, 0);
        vm.prank(owner);
        vault.setPolicy(agent, p, targets, _sig(digest), ownerKey);
    }

    function test_silenceKillsAuthorityWithoutATransaction() public {
        _installWithHeartbeat(1 hours);

        vm.prank(agent);
        (bool ok, ) = vault.request(vendor, 0.1 ether, "while-alive");
        assertTrue(ok);

        vm.warp(block.timestamp + 2 hours); // owner goes quiet; nobody sends a kill tx

        vm.prank(agent);
        (, uint8 code) = vault.request(vendor, 0.1 ether, "after-silence");
        assertEq(code, vault.REFUSED_STALE_HEARTBEAT());
        (uint256 spendable, , , , , ) = vault.blastRadius(agent);
        assertEq(spendable, 0);
        assertEq(vault.authorityLeft(agent), 0);
    }

    function test_heartbeatRestoresAuthority() public {
        _installWithHeartbeat(1 hours);
        vm.warp(block.timestamp + 2 hours);

        (uint96 ptc, uint96 dc, uint64 ex, uint8 mcp, bool act, uint32 hb, uint64 lb, bool ro) =
            vault.policyOf(agent);
        ptc; dc; ex; mcp; act; ro;
        bytes32 digest = vault.heartbeatDigest(agent, lb, hb);
        vm.prank(owner);
        vm.expectRevert(BlastRadiusVault.BadSignature.selector);
        vault.beat(agent, abi.encodePacked(bytes32(uint256(3))), ownerKey);

        // anyone can relay the owner's signature — including a third party
        address relayer = address(0xFEE1);
        vm.prank(relayer);
        vault.beat(agent, _sig(digest), ownerKey);

        vm.prank(agent);
        (bool ok, ) = vault.request(vendor, 0.1 ether, "alive-again");
        assertTrue(ok);
        assertGt(vault.authorityLeft(agent), 0);
    }

    // ---------- rotation: the thief's copy dies mid-run ----------

    function _rotateTo(address newAgent) internal {
        bytes32 digest = keccak256(
            abi.encode(
                block.chainid,
                address(vault),
                "ROTATE",
                agent,
                newAgent,
                vault.policyNonce(agent)
            )
        );
        vm.prank(owner);
        vault.rotate(agent, newAgent, _sig(digest), ownerKey);
    }

    function test_rotationKillsTheStolenCopy() public {
        _install(1 ether, 3 ether, uint64(block.timestamp + 1 days), 5);
        address fresh = address(0xF4E5);
        status.set(fresh, hex"cc33", true);

        vm.prank(agent); // the thief has been spending
        (bool ok, ) = vault.request(vendor, 0.5 ether, "thief-1");
        assertTrue(ok);

        _rotateTo(fresh);

        vm.prank(agent); // same stolen key, next attempt
        (, uint8 code) = vault.request(vendor, 0.5 ether, "thief-2");
        assertEq(code, vault.REFUSED_ROTATED());
        assertEq(vault.authorityLeft(agent), 0);

        vm.prank(fresh); // the key the thief never saw
        (ok, ) = vault.request(vendor, 0.5 ether, "real-work");
        assertTrue(ok);
    }

    function test_rotationCannotLaunderTheDailyCap() public {
        _install(1 ether, 1 ether, uint64(block.timestamp + 1 days), 5);
        address fresh = address(0xF4E5);
        status.set(fresh, hex"cc33", true);

        vm.prank(agent);
        vault.request(vendor, 1 ether, "day-spent");
        _rotateTo(fresh);

        vm.prank(fresh); // spend carried over with the policy: no fresh budget
        (, uint8 code) = vault.request(vendor, 0.1 ether, "same-day");
        assertEq(code, vault.REFUSED_DAILY_CAP());
    }

    function test_frozenKeyCannotRotateItselfOpen() public {
        _install(1 ether, 3 ether, uint64(block.timestamp + 1 days), 5);
        address fresh = address(0xF4E5);
        status.set(fresh, hex"cc33", true);
        vm.prank(owner);
        vault.freeze(agent);

        _rotateTo(fresh);

        vm.prank(fresh); // the freeze rides along with the policy
        (, uint8 code) = vault.request(vendor, 0.1 ether, "still-frozen");
        assertEq(code, vault.REFUSED_FROZEN());
    }

    function test_canSpendAgreesWithRequest() public {
        _install(1 ether, 3 ether, uint64(block.timestamp + 1 days), 5);
        (bool ok, uint8 code) = vault.canSpend(agent, vendor, 0.5 ether);
        assertTrue(ok);
        assertEq(code, 0);
        (ok, code) = vault.canSpend(agent, attackerTarget, 0.5 ether);
        assertFalse(ok);
        assertEq(code, vault.REFUSED_NOT_ALLOWLISTED());
    }
}
