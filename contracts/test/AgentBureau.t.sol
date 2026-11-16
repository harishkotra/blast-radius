// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentBureau} from "../src/AgentBureau.sol";

/// Stand-in for the pqcKeyStatus precompile at 0x…0a02.
contract PqcStatusStub {
    mapping(address => bool) public proven;

    function set(address a, bool p) external {
        proven[a] = p;
    }

    function pqcKeyStatus(address a)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven)
    {
        return (proven[a], 1, "", proven[a]);
    }
}

contract AgentBureauTest is Test {
    AgentBureau bureau;
    PqcStatusStub status;

    address root = address(0xA11CE);
    address child = address(0xB0B);
    address grandchild = address(0xC0C);
    address vendorA = address(0x1111);
    address vendorB = address(0x2222);

    uint96 constant ONE = 1 ether;

    function setUp() public {
        status = PqcStatusStub(address(0x0000000000000000000000000000000000000a02));
        vm.etch(address(0x0000000000000000000000000000000000000a02), address(new PqcStatusStub()).code);
        status = PqcStatusStub(address(0x0000000000000000000000000000000000000a02));

        status.set(root, true);
        status.set(child, true);
        status.set(grandchild, true);

        bureau = new AgentBureau();
        vm.deal(root, 100 ether);
    }

    function _targets(address a) internal pure returns (address[] memory t) {
        t = new address[](1);
        t[0] = a;
    }

    function _openRoot() internal {
        _openRootWithCalls(5);
    }

    function _openRootWithCalls(uint8 maxCalls) internal {
        vm.prank(root);
        bureau.open{value: 10 ether}(1 ether, uint64(block.timestamp + 1 days), maxCalls, _targets(vendorA));
    }

    function _grant(address parent, address kid, uint96 perTx, uint96 budget, uint8 calls, address target)
        internal
        returns (uint8)
    {
        AgentBureau.Scope memory s = AgentBureau.Scope({
            perTxCap: perTx,
            budget: budget,
            expiry: uint64(block.timestamp + 1 hours),
            maxCalls: calls,
            targets: _targets(target)
        });
        vm.prank(parent);
        return bureau.grant(kid, s);
    }

    // ── opening ────────────────────────────────────────────────────────────

    function test_openRequiresPossessionProof() public {
        address stranger = address(0xDEAD1);
        vm.deal(stranger, 1 ether);
        status.set(stranger, false);
        vm.prank(stranger);
        vm.expectRevert(bytes("bureau: register a post-quantum key with proof of possession first"));
        bureau.open{value: 1 ether}(1 ether, uint64(block.timestamp + 1 days), 3, _targets(vendorA));
    }

    function test_openSetsBlastRadius() public {
        _openRoot();
        (uint96 spendable, uint96 perAttempt, uint8 code) = bureau.blastRadius(root);
        assertEq(spendable, 10 ether);
        assertEq(perAttempt, 1 ether);
        assertEq(code, 0);
    }

    // ── attenuation ────────────────────────────────────────────────────────

    function test_childCannotExceedParentPerTx() public {
        _openRoot();
        uint8 code = _grant(root, child, 2 ether, 4 ether, 3, vendorA); // parent cap is 1
        assertEq(code, 5, "OVER_PER_TX");
        (, , , , , , , , bool exists, ) = bureau.nodes(child);
        assertFalse(exists, "a refused grant must not create authority");
    }

    function test_childCannotWidenTargets() public {
        _openRoot();
        uint8 code = _grant(root, child, 1 ether, 4 ether, 3, vendorB); // parent only allows vendorA
        assertEq(code, 4, "TARGET_REFUSED");
    }

    function test_childCannotOutliveParent() public {
        _openRoot();
        AgentBureau.Scope memory s = AgentBureau.Scope({
            perTxCap: 1 ether,
            budget: 1 ether,
            expiry: uint64(block.timestamp + 2 days), // parent expires in 1
            maxCalls: 2,
            targets: _targets(vendorA)
        });
        vm.prank(root);
        uint8 code = bureau.grant(child, s);
        assertEq(code, 3, "EXPIRED");
    }

    function test_childBudgetCannotExceedParentRemaining() public {
        _openRoot();
        uint8 code = _grant(root, child, 1 ether, 11 ether, 3, vendorA); // parent holds 10
        assertEq(code, 6, "OVER_BUDGET");
    }

    function test_grantedChildSpendsAndChargesParent() public {
        _openRoot();
        assertEq(_grant(root, child, 1 ether, 3 ether, 3, vendorA), 0);

        vm.prank(child);
        assertEq(bureau.spend(payable(vendorA), 1 ether, "invoice"), 0);

        assertEq(vendorA.balance, 1 ether);
        (, , , uint96 childSpent, , , , , , ) = bureau.nodes(child);
        (, , , uint96 rootSpent, , , , , , ) = bureau.nodes(root);
        assertEq(childSpent, 1 ether);
        assertEq(rootSpent, 1 ether, "the parent paid for it too");
    }

    function test_childCannotSpendBeyondParentBudget() public {
        _openRootWithCalls(30);
        _grant(root, child, 1 ether, 3 ether, 20, vendorA);

        // parent has 10 ether total; spend 9 from the parent itself
        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "a");
        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "b");
        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "c");
        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "d");
        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "e");

        // 3 of child's own budget remain, but only 5 of the parent's were used
        vm.prank(child);
        assertEq(bureau.spend(payable(vendorA), 1 ether, "ok"), 0);

        // push the parent to its 10 ether ceiling
        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "f");
        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "g");
        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "h");
        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "i");

        // child still has 2 ether of its own, but the parent has nothing left
        vm.prank(child);
        assertEq(bureau.spend(payable(vendorA), 1 ether, "greedy"), 6, "OVER_BUDGET");
    }

    function test_childCallBudgetIsLimitedByParent() public {
        _openRoot();
        _grant(root, child, 1 ether, 3 ether, 5, vendorA);

        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "1"); // parent: 5 calls total
        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "2");
        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "3");
        vm.prank(root);
        bureau.spend(payable(vendorA), 1 ether, "4");

        vm.prank(child);
        assertEq(bureau.spend(payable(vendorA), 1 ether, "5"), 0); // parent's 5th call

        vm.prank(child);
        assertEq(bureau.spend(payable(vendorA), 1 ether, "6"), 7, "OVER_CALLS");
    }

    // ── depth ──────────────────────────────────────────────────────────────

    function test_grandchildIsBoundedByEveryAncestor() public {
        _openRoot();
        _grant(root, child, 1 ether, 5 ether, 5, vendorA);
        assertEq(_grant(child, grandchild, 1 ether, 2 ether, 3, vendorA), 0);

        vm.prank(grandchild);
        assertEq(bureau.spend(payable(vendorA), 1 ether, "sub"), 0);

        (, , , uint96 rSpent, , , , , , ) = bureau.nodes(root);
        (, , , uint96 cSpent, , , , , , ) = bureau.nodes(child);
        (, , , uint96 gSpent, , , , , , ) = bureau.nodes(grandchild);
        assertEq(rSpent, 1 ether);
        assertEq(cSpent, 1 ether);
        assertEq(gSpent, 1 ether);
    }

    function test_cannotGrantToAnAncestor() public {
        _openRoot();
        _grant(root, child, 1 ether, 3 ether, 3, vendorA);

        vm.prank(child);
        AgentBureau.Scope memory s = AgentBureau.Scope({
            perTxCap: 1 ether,
            budget: 1 ether,
            expiry: uint64(block.timestamp + 30 minutes),
            maxCalls: 1,
            targets: _targets(vendorA)
        });
        assertEq(bureau.grant(root, s), 1, "cycle refused as NO_AUTHORITY");
    }

    // ── revocation ─────────────────────────────────────────────────────────

    function test_revokingParentKillsDescendants() public {
        _openRoot();
        _grant(root, child, 1 ether, 4 ether, 4, vendorA);
        _grant(child, grandchild, 1 ether, 2 ether, 2, vendorA);

        vm.prank(root);
        uint8 killed = bureau.revoke(root);
        assertEq(killed, 3, "root + child + grandchild");

        vm.prank(grandchild);
        assertEq(bureau.spend(payable(vendorA), 1 ether, "after"), 10, "REVOKED");

        (uint96 spendable, , uint8 code) = bureau.blastRadius(grandchild);
        assertEq(spendable, 0);
        assertEq(code, 10, "REVOKED");
    }

    function test_childCannotSelfReviveAfterParentRevoked() public {
        _openRoot();
        _grant(root, child, 1 ether, 4 ether, 4, vendorA);

        vm.prank(root);
        bureau.revoke(child);

        vm.prank(child);
        assertEq(bureau.grant(grandchild, _scopeFor(vendorA)), 1, "NO_AUTHORITY");
    }

    function _scopeFor(address target) internal view returns (AgentBureau.Scope memory) {
        return AgentBureau.Scope({
            perTxCap: 1 ether,
            budget: 1 ether,
            expiry: uint64(block.timestamp + 10 minutes),
            maxCalls: 1,
            targets: _targets(target)
        });
    }

    function test_refusalIsRecordedNotReverted() public {
        _openRoot();
        _grant(root, child, 1 ether, 2 ether, 2, vendorA);

        vm.recordLogs();
        vm.prank(child);
        uint8 code = bureau.spend(payable(vendorB), 1 ether, "off-list");
        assertEq(code, 4);

        // the call succeeded and the balance did not move
        assertEq(vendorB.balance, 0);
    }
}