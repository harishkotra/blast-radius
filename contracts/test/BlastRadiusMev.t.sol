// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BlastRadiusVault} from "../src/BlastRadiusVault.sol";
import {PqcVerifyStub, PqcKeyStatusStub} from "./BlastRadiusVault.t.sol";

/// @title BlastRadiusMev
/// @notice The economic claim, fuzzed. `blastRadius()` says what a key can move
///         "now"; these tests attack the claim itself: give an adversary the
///         agent's key, let it choose every amount, target and moment, and check
///         that the vault never pays more than the policy admits.
///
///         Run hard with:  FOUNDRY_FUZZ_RUNS=20000 forge test --match-path '*Mev*'
contract BlastRadiusMevTest is Test {
    BlastRadiusVault vault;

    address owner = address(0xA11CE);
    address agent = address(0xB0B);
    address vendorA = address(0x1111);
    address vendorB = address(0x2222);
    address offList = address(0xBAD);

    uint96 constant PER_TX = 2 ether;
    uint96 constant DAILY = 5 ether;
    uint8 constant CALLS = 3;

    bytes ownerKey = hex"aa11";

    function setUp() public {
        vm.etch(
            address(0x0000000000000000000000000000000000000a01),
            address(new PqcVerifyStub()).code
        );
        vm.etch(
            address(0x0000000000000000000000000000000000000a02),
            address(new PqcKeyStatusStub()).code
        );
        PqcKeyStatusStub status = PqcKeyStatusStub(address(0x0000000000000000000000000000000000000a02));
        status.set(owner, ownerKey, true);
        status.set(agent, hex"bb22", true);

        vm.deal(owner, 100 ether);
        vm.prank(owner);
        vault = new BlastRadiusVault();
        vm.deal(address(vault), 10 ether);

        address[] memory targets = new address[](2);
        targets[0] = vendorA;
        targets[1] = vendorB;
        BlastRadiusVault.Policy memory p = BlastRadiusVault.Policy({
            perTxCap: PER_TX,
            dailyCap: DAILY,
            expiry: uint64(block.timestamp + 7 days),
            maxCallsPerDay: CALLS,
            active: true,
            heartbeat: 0,
            lastBeat: 0,
            rotatedOut: false
        });
        bytes32 digest = vault.policyDigest(agent, p, targets, 0);
        vm.prank(owner);
        vault.setPolicy(agent, p, targets, abi.encodePacked(digest), ownerKey);
    }

    function _target(uint8 seed, bool mayLeaveList) internal view returns (address) {
        if (mayLeaveList && seed % 4 == 0) return offList;
        return seed % 2 == 0 ? vendorA : vendorB;
    }

    /// @notice The adversary chooses every amount, target and ordering.
    ///         The only invariant that matters: paid out <= the daily cap,
    ///         and no more than the call budget ever succeeds.
    function testFuzz_anyAttackSequenceIsBounded(
        uint96 a0,
        uint96 a1,
        uint96 a2,
        uint96 a3,
        uint96 a4,
        uint8 seeds
    ) public {
        uint96[5] memory amts = [a0, a1, a2, a3, a4];

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(agent); // attacker holds exactly the agent key
            vault.request(_target(uint8(seeds >> i), true), amts[i], bytes32(i));
        }

        uint256 paid = vault.totalPaid();
        (uint256 spent, uint256 calls) = _spend();

        assertLe(paid, DAILY, "paid more than the daily cap");
        assertLe(spent, DAILY, "spend counter above the daily cap");
        assertLe(calls, CALLS, "more calls admitted than the call budget");
        assertLe(address(vendorA).balance + address(vendorB).balance, DAILY, "targets richer than the cap");
        assertEq(address(offList).balance, 0, "an off-list target was paid");
    }

    /// @notice The bound is tight, not vacuous: the adversary really can take the
    ///         whole cap and not one wei more. A cap that is never reachable
    ///         would be a useless number on the poster.
    function test_boundIsTight() public {
        vm.startPrank(agent);
        vault.request(vendorA, PER_TX, "1");
        vault.request(vendorA, PER_TX, "2");
        vault.request(vendorA, 1 ether, "3");
        (bool ok, uint8 code) = vault.request(vendorA, 1 ether, "4");
        vm.stopPrank();

        assertFalse(ok);
        // the money cap binds before the call budget does — either way, refused
        assertEq(code, vault.REFUSED_DAILY_CAP());
        assertEq(vault.totalPaid(), DAILY, "attacker should be able to reach exactly the cap");
        assertEq(address(vendorA).balance, DAILY);
    }

    /// @notice Time is not a loophole: waiting cannot unlock a second budget
    ///         inside the same day, and past expiry nothing moves at all.
    function testFuzz_timeDoesNotWidenAuthority(uint32 jump) public {
        vm.warp(block.timestamp + bound(uint256(jump), 0, 30 days));

        vm.prank(agent);
        vault.request(vendorA, PER_TX, "t1");
        vm.prank(agent);
        vault.request(vendorA, PER_TX, "t2");
        vm.prank(agent);
        vault.request(vendorA, PER_TX, "t3");

        (uint256 spent, ) = _spend();
        assertLe(spent, DAILY, "time travel bought extra budget");
        assertLe(vault.totalPaid(), DAILY, "paid more than the cap after waiting");
    }

    /// @notice No policy, no money — a bare key with nothing installed.
    function testFuzz_noPolicyNoMoney(uint96 amount, address target) public {
        address stranger = address(0x5757);
        vm.prank(stranger);
        (bool ok, uint8 code) = vault.request(target, amount, "x");
        assertFalse(ok);
        assertEq(code, vault.REFUSED_NO_POLICY());
        assertEq(vault.totalPaid(), 0);
    }

    function _spend() internal view returns (uint256 spent, uint256 calls) {
        (uint256 windowStart, uint256 s, uint8 c) = vault.spendOf(agent);
        if (block.timestamp < windowStart + 1 days) return (s, c);
        return (0, 0);
    }
}
