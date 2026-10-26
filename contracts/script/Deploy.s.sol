// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {KnockoutJar, IERC20} from "../src/KnockoutJar.sol";

/// forge script script/Deploy.s.sol --rpc-url mezo_testnet --broadcast --legacy
/// Round secrets are keccak256(abi.encode(SEED_MASTER, roundId)); see ops.sh.
contract Deploy is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_KEY");
        address musd = vm.envAddress("MUSD");
        uint64 duration = uint64(vm.envOr("ROUND_SECONDS", uint256(6 hours)));
        bytes32 secret = keccak256(abi.encode(vm.envBytes32("SEED_MASTER"), uint256(1)));
        vm.startBroadcast(key);
        KnockoutJar jar = new KnockoutJar(IERC20(musd), vm.addr(key), duration, keccak256(abi.encode(secret)));
        vm.stopBroadcast();
        console.log("KnockoutJar", address(jar));
    }
}
