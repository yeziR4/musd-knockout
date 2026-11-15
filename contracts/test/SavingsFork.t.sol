// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KnockoutJar, IERC20, ISavingsVault} from "../src/KnockoutJar.sol";

/// Runs the jar against Mezo's real MUSDSavingsRate on a fork of Mezo testnet.
/// Needs network access: MEZO_FORK=1 forge test --match-contract SavingsFork -vv
/// Without MEZO_FORK the tests are reported as skipped, not passed.
contract SavingsForkTest is Test {
    IERC20 constant MUSD = IERC20(0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503);
    ISavingsVault constant VAULT = ISavingsVault(0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16);
    // Mezo's StabilityPool holds plenty of testnet MUSD; used only as a funding source.
    address constant MUSD_HOLDER = 0x1CCA7E410eE41739792eA0A24e00349Dd247680e;
    // The deployed Wave 2 jar.
    KnockoutJar constant LIVE = KnockoutJar(0x96649EeD4617c1CB9E253f0233D0A891069Da76C);

    address op = makeAddr("operator");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    KnockoutJar jar;

    function setUp() public {
        if (!vm.envOr("MEZO_FORK", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(vm.rpcUrl("mezo_testnet"));
        jar = new KnockoutJar(MUSD, op, 1 hours, keccak256(abi.encode(bytes32(uint256(1)))));
        vm.prank(op);
        jar.setSavings(VAULT, treasury, 1000);
        vm.prank(MUSD_HOLDER);
        MUSD.transfer(alice, 25e18);
    }

    function test_realVaultMatchesJarMusd() public view {
        assertEq(VAULT.musdToken(), address(MUSD));
        assertEq(address(jar.savings()), address(VAULT));
    }

    function test_depositParksInRealVaultAndWithdrawsOneToOne() public {
        vm.startPrank(alice);
        MUSD.approve(address(jar), 25e18);
        jar.deposit(25e18);
        vm.stopPrank();

        assertEq(MUSD.balanceOf(address(jar)), 0, "jar keeps no idle MUSD");
        assertEq(VAULT.balanceOf(address(jar)), 25e18, "vault holds the deposit 1:1");
        assertEq(jar.totalPrincipal(), 25e18);

        // permissionless harvest against the real vault must not touch principal
        jar.harvest();
        assertEq(VAULT.balanceOf(address(jar)) + MUSD.balanceOf(address(jar)), jar.totalPrincipal() + jar.pot());

        bytes32 seat = jar.walletSeat(alice);
        vm.prank(alice);
        jar.withdraw(seat, 25e18);
        assertEq(MUSD.balanceOf(alice), 25e18, "full deposit back");
        assertEq(jar.totalPrincipal(), 0);
    }

    /// The deployed jar must hold at least every deposit (parked plus idle cash).
    function test_liveJarIsSolvent() public view {
        uint256 held = VAULT.balanceOf(address(LIVE)) + MUSD.balanceOf(address(LIVE));
        assertGe(held, LIVE.totalPrincipal());
        assertEq(address(LIVE.savings()), address(VAULT));
    }
}
