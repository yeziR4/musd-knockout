// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KnockoutJar, IERC20} from "../src/KnockoutJar.sol";

contract MockMUSD {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract KnockoutJarTest is Test {
    MockMUSD musd;
    KnockoutJar jar;
    address op = makeAddr("operator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address sponsor = makeAddr("sponsor");

    function setUp() public {
        musd = new MockMUSD();
        jar = new KnockoutJar(IERC20(address(musd)), op, 6 hours, _commit(1));
        address[4] memory users = [alice, bob, carol, sponsor];
        for (uint256 i; i < 4; ++i) {
            musd.mint(users[i], 1_000e18);
            vm.prank(users[i]);
            musd.approve(address(jar), type(uint256).max);
        }
    }

    function _commit(uint256 round) internal pure returns (bytes32) {
        return keccak256(abi.encode(_secret(round)));
    }

    function _secret(uint256 round) internal pure returns (bytes32) {
        return keccak256(abi.encode("secret", round));
    }

    function _runDraw() internal returns (bytes32 winner) {
        vm.warp(jar.roundEnd());
        jar.lockRound();
        uint256 r = jar.roundId();
        vm.recordLogs();
        vm.prank(op);
        jar.draw(_secret(r), _commit(r + 1));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == KnockoutJar.Drawn.selector) return logs[i].topics[2];
        }
        revert("no Drawn");
    }

    function test_depositWithdrawIsNoLoss() public {
        vm.prank(alice);
        jar.deposit(100e18);
        assertEq(jar.totalPrincipal(), 100e18);
        bytes32 aliceSeat = jar.walletSeat(alice);
        vm.prank(alice);
        jar.withdraw(aliceSeat, 100e18);
        assertEq(musd.balanceOf(alice), 1_000e18);
        assertEq(jar.seatCount(), 0);
    }

    function test_winnerGetsPotAndPrincipalUntouched() public {
        vm.prank(alice);
        jar.deposit(100e18);
        vm.prank(bob);
        jar.deposit(300e18);
        vm.prank(sponsor);
        jar.fundPot(25e18);
        assertEq(jar.pot(), 25e18);

        bytes32 winner = _runDraw();
        (uint128 principal, uint128 prize,, address owner) = jar.seats(winner);
        assertEq(prize, 25e18);
        assertGt(principal, 0);
        assertEq(jar.pot(), 0);
        assertEq(jar.roundId(), 2);

        vm.prank(owner);
        jar.claimPrize(winner);
        // everyone still gets their full deposit back
        bytes32 aliceSeat = jar.walletSeat(alice);
        vm.prank(alice);
        jar.withdraw(aliceSeat, 100e18);
        bytes32 bobSeat = jar.walletSeat(bob);
        vm.prank(bob);
        jar.withdraw(bobSeat, 300e18);
        assertEq(musd.balanceOf(address(jar)), 0);
    }

    function test_depositsFrozenWhileDrawing() public {
        vm.prank(alice);
        jar.deposit(100e18);
        vm.warp(jar.roundEnd());
        jar.lockRound();
        vm.prank(bob);
        vm.expectRevert(KnockoutJar.RoundNotOpen.selector);
        jar.deposit(1e18);
        bytes32 aliceSeat = jar.walletSeat(alice);
        vm.prank(alice);
        vm.expectRevert(KnockoutJar.RoundNotOpen.selector);
        jar.withdraw(aliceSeat, 1e18);
    }

    function test_cannotLockEarlyOrDrawUnlocked() public {
        vm.prank(alice);
        jar.deposit(1e18);
        vm.expectRevert(KnockoutJar.TooEarly.selector);
        jar.lockRound();
        vm.prank(op);
        vm.expectRevert(KnockoutJar.NothingToDraw.selector);
        jar.draw(_secret(1), _commit(2));
    }

    function test_revealMustMatchCommit() public {
        vm.prank(alice);
        jar.deposit(1e18);
        vm.warp(jar.roundEnd());
        jar.lockRound();
        vm.prank(op);
        vm.expectRevert(KnockoutJar.BadReveal.selector);
        jar.draw(_secret(99), _commit(2));
        vm.prank(alice);
        vm.expectRevert(KnockoutJar.NotOperator.selector);
        jar.draw(_secret(1), _commit(2));
    }

    function test_secondRoundUsesNextCommit() public {
        vm.prank(alice);
        jar.deposit(1e18);
        _runDraw();
        assertEq(jar.seedCommit(), _commit(2));
        _runDraw();
        assertEq(jar.roundId(), 3);
    }

    function test_anyoneUnlocksIfOperatorVanishes() public {
        vm.prank(alice);
        jar.deposit(100e18);
        vm.warp(jar.roundEnd());
        jar.lockRound();
        vm.expectRevert(KnockoutJar.TooEarly.selector);
        jar.unlock();
        vm.warp(block.timestamp + 1 days);
        vm.prank(bob);
        jar.unlock();
        bytes32 aliceSeat = jar.walletSeat(alice);
        vm.prank(alice);
        jar.withdraw(aliceSeat, 100e18);
        assertEq(musd.balanceOf(alice), 1_000e18);
    }

    function test_operatorCannotSwapLiveCommit() public {
        vm.prank(op);
        vm.expectRevert(KnockoutJar.AlreadyBound.selector);
        jar.commitSeed(bytes32(uint256(5)));
    }

    function test_handleSeatSponsoredBoundAndClaimed() public {
        bytes32 seat = jar.handleSeat("satoshi");
        vm.prank(sponsor);
        jar.depositForHandle("satoshi", 10e18);
        vm.prank(sponsor);
        jar.fundPot(5e18);

        bytes32 winner = _runDraw();
        assertEq(winner, seat);

        // prize waits for the owner
        vm.prank(alice);
        vm.expectRevert(KnockoutJar.NotOwner.selector);
        jar.claimPrize(seat);

        vm.prank(alice);
        vm.expectRevert(KnockoutJar.NotOperator.selector);
        jar.bindSeat(seat, alice);

        vm.prank(op);
        jar.bindSeat(seat, carol);
        vm.prank(carol);
        jar.claimPrize(seat);
        assertEq(musd.balanceOf(carol), 1_005e18);

        // principal still belongs to the sponsor, not the handle owner
        vm.prank(carol);
        vm.expectRevert(KnockoutJar.NotSponsor.selector);
        jar.withdraw(seat, 10e18);
        vm.prank(sponsor);
        jar.withdraw(seat, 10e18);
    }

    function test_onlySponsorTopsUpHandleSeat() public {
        bytes32 seat = jar.handleSeat("satoshi");
        vm.prank(sponsor);
        jar.depositForHandle("satoshi", 10e18);
        vm.prank(alice);
        vm.expectRevert(KnockoutJar.NotSponsor.selector);
        jar.depositForHandle("satoshi", 1e18);
    }

    function test_rejectsBadHandles() public {
        string[4] memory bad = ["", "Satoshi", "has space", "waytoolonghandle1"];
        for (uint256 i; i < 4; ++i) {
            vm.prank(alice);
            vm.expectRevert(KnockoutJar.BadSeat.selector);
            jar.depositForHandle(bad[i], 1e18);
        }
    }

    function test_emptyRoundJustExtends() public {
        vm.warp(jar.roundEnd());
        jar.lockRound();
        assertFalse(jar.locked());
        assertEq(jar.roundEnd(), block.timestamp + 6 hours);
    }

    function test_seatCap() public {
        for (uint256 i; i < 128; ++i) {
            address u = address(uint160(0x1000 + i));
            musd.mint(u, 1e18);
            vm.startPrank(u);
            musd.approve(address(jar), 1e18);
            jar.deposit(1e18);
            vm.stopPrank();
        }
        vm.prank(alice);
        vm.expectRevert(KnockoutJar.TooManySeats.selector);
        jar.deposit(1e18);
        // full bracket draw stays affordable
        uint256 g = gasleft();
        _runDraw();
        assertLt(g - gasleft(), 15_000_000);
    }

    function test_bracketSingleEntrant() public view {
        uint128[] memory w = new uint128[](1);
        w[0] = 5;
        assertEq(jar.bracketWinner(bytes32(uint256(7)), w), 0);
    }

    /// Win rates over many seeds track deposit share, including odd field sizes (byes).
    function test_bracketIsProportional() public view {
        uint128[] memory w = new uint128[](5);
        w[0] = 10;
        w[1] = 20;
        w[2] = 30;
        w[3] = 15;
        w[4] = 25; // total 100
        uint256[5] memory wins;
        uint256 trials = 4000;
        for (uint256 s; s < trials; ++s) {
            wins[jar.bracketWinner(keccak256(abi.encode(s)), w)]++;
        }
        for (uint256 i; i < 5; ++i) {
            uint256 expected = trials * w[i] / 100;
            // within 3 percentage points
            assertApproxEqAbs(wins[i], expected, trials * 3 / 100);
        }
    }

    function testFuzz_bracketWinnerInRange(bytes32 seed, uint8 n) public view {
        n = uint8(bound(n, 1, 40));
        uint128[] memory w = new uint128[](n);
        for (uint256 i; i < n; ++i) w[i] = uint128(uint256(keccak256(abi.encode(seed, i))) % 1e20) + 1;
        assertLt(jar.bracketWinner(seed, w), n);
    }
}

import {Vm} from "forge-std/Vm.sol";
