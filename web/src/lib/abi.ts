import { parseAbi } from "viem";

export const jarAbi = parseAbi([
  "function roundId() view returns (uint256)",
  "function roundEnd() view returns (uint64)",
  "function roundDuration() view returns (uint64)",
  "function locked() view returns (bool)",
  "function seedCommit() view returns (bytes32)",
  "function pot() view returns (uint256)",
  "function totalPrincipal() view returns (uint256)",
  "function allSeats() view returns (bytes32[] list, uint128[] weights)",
  "function seats(bytes32) view returns (uint128 principal, uint128 prize, address sponsor, address owner)",
  "function walletSeat(address) pure returns (bytes32)",
  "function deposit(uint256 amount)",
  "function depositForHandle(string handle, uint256 amount)",
  "function withdraw(bytes32 seat, uint256 amount)",
  "function claimPrize(bytes32 seat)",
  "function fundPot(uint256 amount)",
  "function lockRound()",
  "function draw(bytes32 secret, bytes32 nextCommit)",
  "function bindSeat(bytes32 seat, address owner)",
  "event HandleSeat(bytes32 indexed seat, string handle)",
  "event Deposited(bytes32 indexed seat, address indexed sponsor, uint256 amount)",
  "event Drawn(uint256 indexed roundId, bytes32 secret, bytes32 seed, bytes32 indexed winner, uint256 prize, bytes32[] seats, uint128[] weights)",
  "event PotFunded(address indexed from, uint256 amount)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
]);
