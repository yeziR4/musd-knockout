// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KnockoutJar, IERC20, ISavingsVault} from "../src/KnockoutJar.sol";
import {MockMUSD} from "./KnockoutJar.t.sol";

/// @dev 1:1 deposit/withdraw, yield claimed in MUSD. Same shape as Mezo's MUSDSavingsRate.
contract MockSavings is ISavingsVault {
    MockMUSD public musd;
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public yieldOf;

    constructor(MockMUSD musd_) {
        musd = musd_;
    }

    function musdToken() external view returns (address) {
        return address(musd);
    }

    function deposit(uint256 amount) external {
        require(musd.transferFrom(msg.sender, address(this), amount), "pull");
        balanceOf[msg.sender] += amount;
    }

    function withdraw(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        require(musd.transfer(msg.sender, amount), "push");
    }

    function claimableYield(address holder) external view returns (uint256) {
        return yieldOf[holder];
    }

    function claimYield() external returns (uint256) {
        uint256 y = yieldOf[msg.sender];
        yieldOf[msg.sender] = 0;
        musd.mint(msg.sender, y);
        return y;
    }

    function accrue(address holder, uint256 amount) external {
        yieldOf[holder] += amount;
    }
}

contract SavingsPotTest is Test {
    MockMUSD musd;
    MockSavings vault;
    KnockoutJar jar;
    address op = makeAddr("operator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address treasury = makeAddr("treasury");

    function setUp() public {
        musd = new MockMUSD();
        vault = new MockSavings(musd);
        jar = new KnockoutJar(IERC20(address(musd)), op, 6 hours, keccak256(abi.encode(bytes32("secret"))));
        musd.mint(alice, 1_000e18);
        musd.mint(bob, 1_000e18);
        vm.prank(alice);
        musd.approve(address(jar), type(uint256).max);
        vm.prank(bob);
        musd.approve(address(jar), type(uint256).max);
        vm.prank(op);
        jar.setSavings(vault, treasury, 1_000); // 10%
    }

    function test_depositIsParkedOneToOneAndWithdrawnInFull() public {
        vm.prank(alice);
        jar.deposit(100e18);
        assertEq(musd.balanceOf(address(jar)), 0);
        assertEq(vault.balanceOf(address(jar)), 100e18);
        assertEq(jar.pot(), 0);

        bytes32 seat = jar.walletSeat(alice);
        vm.prank(alice);
        jar.withdraw(seat, 100e18);
        assertEq(musd.balanceOf(alice), 1_000e18);
        assertEq(vault.balanceOf(address(jar)), 0);
    }

    function test_yieldFundsThePotAndFeeGoesToTreasury() public {
        vm.prank(alice);
        jar.deposit(100e18);
        vm.prank(bob);
        jar.deposit(300e18);
        vault.accrue(address(jar), 40e18);

        assertEq(jar.pot(), 36e18); // 10% fee stays out of the pot

        jar.harvest();
        assertEq(musd.balanceOf(treasury), 4e18);
        assertEq(vault.balanceOf(address(jar)), 436e18);
        assertEq(jar.pot(), 36e18);
        assertEq(jar.totalPrincipal(), 400e18);
    }

    function test_drawPaysNetYieldAndPrincipalComesBack() public {
        vm.prank(alice);
        jar.deposit(100e18);
        vm.prank(bob);
        jar.deposit(100e18);
        vault.accrue(address(jar), 20e18);

        vm.warp(jar.roundEnd());
        jar.lockRound();
        vm.prank(op);
        jar.draw(bytes32("secret"), keccak256(abi.encode(bytes32("next"))));

        assertEq(musd.balanceOf(treasury), 2e18);
        assertEq(jar.pot(), 0);
        assertEq(jar.totalPrizeOwed(), 18e18);

        bytes32 aliceSeat = jar.walletSeat(alice);
        bytes32 bobSeat = jar.walletSeat(bob);
        (, uint128 aPrize,,) = _seat(aliceSeat);
        (, uint128 bPrize,,) = _seat(bobSeat);
        bytes32 winner = aPrize == 18e18 ? aliceSeat : bobSeat;
        address winnerAccount = winner == aliceSeat ? alice : bob;
        assertEq(aPrize + bPrize, 18e18);

        vm.prank(winnerAccount);
        jar.claimPrize(winner);
        vm.prank(alice);
        jar.withdraw(aliceSeat, 100e18);
        vm.prank(bob);
        jar.withdraw(bobSeat, 100e18);

        assertEq(musd.balanceOf(alice) + musd.balanceOf(bob), 2_000e18 + 18e18);
        assertEq(musd.balanceOf(address(jar)) + vault.balanceOf(address(jar)), 0);
    }

    function test_rejectsAVaultForADifferentAsset() public {
        MockSavings other = new MockSavings(new MockMUSD());
        vm.prank(op);
        vm.expectRevert(KnockoutJar.SavingsAsset.selector);
        jar.setSavings(other, treasury, 1_000);
    }

    function _seat(bytes32 seat) internal view returns (uint128, uint128, address, address) {
        return jar.seats(seat);
    }
}
