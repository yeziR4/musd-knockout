// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Mezo MUSD Savings Vault (`MUSDSavingsRate`). Not ERC-4626:
/// deposit and withdraw are 1:1 in MUSD, and yield is claimed separately.
interface ISavingsVault {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function claimYield() external returns (uint256);
    function claimableYield(address holder) external view returns (uint256);
    function musdToken() external view returns (address);
    function balanceOf(address account) external view returns (uint256);
}

/// @title KnockoutJar
/// @notice No-loss MUSD prize savings decided by a weighted knockout bracket.
///
/// Players ("seats") deposit MUSD. Deposits are never at risk: they can be withdrawn
/// in full whenever a round is open. Each round, every seat enters a bracket. In each
/// match the chance of advancing is proportional to the two sides' weights, and the
/// winner carries both weights forward. That makes each seat's chance of winning the
/// whole bracket exactly its share of all deposits, while giving a live, watchable
/// elimination. The winner takes the pot: Mezo savings-vault yield, plus any sponsor top-up.
///
/// Seats are either wallets (seat id = the address) or X handles (seat id =
/// keccak256("x:" + lowercase handle)). A handle seat can be sponsored before its owner
/// ever connects a wallet; prizes it wins wait until the operator binds it to the
/// wallet the owner signs in with.
contract KnockoutJar {
    struct Seat {
        uint128 principal; // MUSD entered in the bracket, owned by `sponsor`
        uint128 prize; // MUSD won and not yet claimed, owned by `owner`
        address sponsor; // who funded the principal and may withdraw it
        address owner; // who may claim prizes (unset for unclaimed handle seats)
    }

    uint256 public constant MAX_SEATS = 128;
    uint256 public constant DRAW_TIMEOUT = 1 days; // after this, anyone can unlock
    uint16 public constant MAX_FEE_BPS = 2_000; // 20% of yield, hard cap

    IERC20 public immutable musd;
    address public operator;
    uint64 public roundDuration;

    uint256 public roundId;
    uint64 public roundEnd;
    bool public locked; // deposits and withdrawals pause between lock and draw
    uint64 public lockedAt;
    /// keccak256(abi.encode(secret)) for the current round, committed when the round
    /// opens, before anyone enters. Mezo's BLOCKHASH returns zero, so block hashes
    /// cannot seed the draw.
    bytes32 public seedCommit;

    uint256 public totalPrincipal;
    uint256 public totalPrizeOwed;

    /// Mezo's MUSD Savings Vault. Unset until the operator calls `setSavings`.
    /// While set, idle MUSD is parked 1:1 and `claimYield` funds the pot.
    ISavingsVault public savings;
    address public treasury;
    uint16 public feeBps;

    mapping(bytes32 => Seat) public seats;
    bytes32[] internal seatList;
    mapping(bytes32 => uint256) internal seatPos; // index + 1, 0 = not listed

    event Deposited(bytes32 indexed seat, address indexed sponsor, uint256 amount);
    event Withdrawn(bytes32 indexed seat, address indexed sponsor, uint256 amount);
    event HandleSeat(bytes32 indexed seat, string handle);
    event PotFunded(address indexed from, uint256 amount);
    event SavingsSet(address indexed vault, address indexed treasury, uint16 feeBps);
    event YieldHarvested(uint256 gross, uint256 fee, uint256 net);
    event SeatBound(bytes32 indexed seat, address indexed owner);
    event PrizeClaimed(bytes32 indexed seat, address indexed owner, uint256 amount);
    event SeedCommitted(uint256 indexed roundId, bytes32 commit);
    event RoundLocked(uint256 indexed roundId, bytes32 commit);
    event RoundUnlocked(uint256 indexed roundId);
    event Drawn(
        uint256 indexed roundId,
        bytes32 secret,
        bytes32 seed,
        bytes32 indexed winner,
        uint256 prize,
        bytes32[] seats,
        uint128[] weights
    );
    event RoundOpened(uint256 indexed roundId, uint64 roundEnd);

    error NotOperator();
    error RoundNotOpen();
    error NotSponsor();
    error NotOwner();
    error BadSeat();
    error ZeroAmount();
    error TooManySeats();
    error TooEarly();
    error NothingToDraw();
    error AlreadyBound();
    error TransferFailed();
    error NoCommit();
    error BadReveal();
    error FeeTooHigh();
    error SavingsAsset();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier whenOpen() {
        if (locked) revert RoundNotOpen();
        _;
    }

    constructor(IERC20 musd_, address operator_, uint64 roundDuration_, bytes32 firstCommit) {
        musd = musd_;
        operator = operator_;
        roundDuration = roundDuration_;
        roundId = 1;
        roundEnd = uint64(block.timestamp) + roundDuration_;
        seedCommit = firstCommit;
        emit RoundOpened(1, roundEnd);
        emit SeedCommitted(1, firstCommit);
    }

    // ----------------------------------------------------------------- seat ids

    function walletSeat(address account) public pure returns (bytes32) {
        return bytes32(uint256(uint160(account)));
    }

    /// @param handle lowercase X handle without the "@"
    function handleSeat(string calldata handle) external pure returns (bytes32) {
        return keccak256(abi.encodePacked("x:", handle));
    }

    function isWalletSeat(bytes32 seat) public pure returns (bool) {
        return uint256(seat) >> 160 == 0;
    }

    // ----------------------------------------------------------------- players

    /// @notice Enter (or top up) your own wallet seat.
    function deposit(uint256 amount) external whenOpen {
        bytes32 seat = walletSeat(msg.sender);
        Seat storage s = seats[seat];
        if (s.owner == address(0)) {
            s.owner = msg.sender;
            s.sponsor = msg.sender;
        }
        _deposit(seat, amount);
    }

    /// @notice Sponsor a ticket for an X handle. The first sponsor of a seat keeps
    ///         control of its principal; the handle's owner only ever receives prizes.
    /// @param handle lowercase X handle without the "@" (a-z, 0-9, _; 1-15 chars)
    function depositForHandle(string calldata handle, uint256 amount) external whenOpen {
        bytes memory h = bytes(handle);
        if (h.length == 0 || h.length > 15) revert BadSeat();
        for (uint256 i; i < h.length; ++i) {
            bytes1 c = h[i];
            if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "_")) revert BadSeat();
        }
        bytes32 seat = keccak256(abi.encodePacked("x:", handle));
        if (seatPos[seat] == 0 && seats[seat].principal == 0) emit HandleSeat(seat, handle);
        Seat storage s = seats[seat];
        if (s.sponsor == address(0)) s.sponsor = msg.sender;
        else if (s.sponsor != msg.sender) revert NotSponsor();
        _deposit(seat, amount);
    }

    function withdraw(bytes32 seat, uint256 amount) external whenOpen {
        Seat storage s = seats[seat];
        if (s.sponsor != msg.sender) revert NotSponsor();
        if (amount == 0 || amount > s.principal) revert ZeroAmount();
        s.principal -= uint128(amount);
        totalPrincipal -= amount;
        if (s.principal == 0) {
            _unlist(seat);
            // A handle seat can be sponsored again by someone else once emptied.
            if (!isWalletSeat(seat)) s.sponsor = address(0);
        }
        emit Withdrawn(seat, msg.sender, amount);
        _send(msg.sender, amount);
    }

    function claimPrize(bytes32 seat) external {
        Seat storage s = seats[seat];
        if (s.owner != msg.sender) revert NotOwner();
        uint256 amount = s.prize;
        if (amount == 0) revert ZeroAmount();
        s.prize = 0;
        totalPrizeOwed -= amount;
        emit PrizeClaimed(seat, msg.sender, amount);
        _send(msg.sender, amount);
    }

    /// @notice Add MUSD to the current pot (sponsors, yield harvests, agents).
    function fundPot(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _pull(amount);
        _park();
        emit PotFunded(msg.sender, amount);
    }

    /// @notice Point the jar at Mezo's MUSD Savings Vault. Idle MUSD is parked 1:1.
    /// Yield claimed from the vault, minus `feeBps_` (max 20%), is the pot.
    /// Passing the zero vault withdraws any parked MUSD back to this contract.
    function setSavings(ISavingsVault vault, address treasury_, uint16 feeBps_) external onlyOperator {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (treasury_ == address(0)) revert BadSeat();
        if (address(vault) != address(0) && vault.musdToken() != address(musd)) revert SavingsAsset();
        _exitSavings();
        savings = vault;
        treasury = treasury_;
        feeBps = feeBps_;
        emit SavingsSet(address(vault), treasury_, feeBps_);
        _park();
    }

    /// @notice Claim vault yield, pay the fee, and park the rest so it compounds into the pot.
    /// Anyone can call this.
    function harvest() external returns (uint256 net) {
        net = _harvestToCash();
        _park();
    }

    // ----------------------------------------------------------------- rounds

    /// @notice Anyone can lock a finished round, freezing the field for the draw.
    function lockRound() external whenOpen {
        if (block.timestamp < roundEnd) revert TooEarly();
        if (seatList.length == 0) {
            roundEnd = uint64(block.timestamp) + roundDuration;
            emit RoundOpened(roundId, roundEnd);
            return;
        }
        if (seedCommit == bytes32(0)) revert NoCommit();
        locked = true;
        lockedAt = uint64(block.timestamp);
        emit RoundLocked(roundId, seedCommit);
    }

    /// @notice The operator reveals the secret committed when this round opened and
    ///         commits the next round's secret in the same call.
    function draw(bytes32 secret, bytes32 nextCommit) external onlyOperator {
        if (!locked) revert NothingToDraw();
        if (keccak256(abi.encode(secret)) != seedCommit) revert BadReveal();
        bytes32 seed = keccak256(abi.encode(secret, roundId, address(this)));
        uint256 n = seatList.length;
        bytes32[] memory list = new bytes32[](n);
        uint128[] memory weights = new uint128[](n);
        for (uint256 i; i < n; ++i) {
            list[i] = seatList[i];
            weights[i] = seats[list[i]].principal;
        }
        bytes32 winner = list[bracketWinner(seed, weights)];
        _harvestToCash();
        _park();
        uint256 prize = pot();
        seats[winner].prize += uint128(prize);
        totalPrizeOwed += prize;

        emit Drawn(roundId, secret, seed, winner, prize, list, weights);

        roundId += 1;
        roundEnd = uint64(block.timestamp) + roundDuration;
        locked = false;
        seedCommit = nextCommit;
        emit RoundOpened(roundId, roundEnd);
        emit SeedCommitted(roundId, nextCommit);
    }

    /// @notice If the operator never reveals, anyone can reopen the round after
    ///         DRAW_TIMEOUT so deposits are never stuck.
    function unlock() external {
        if (!locked) revert NothingToDraw();
        if (block.timestamp < lockedAt + DRAW_TIMEOUT) revert TooEarly();
        locked = false;
        roundEnd = uint64(block.timestamp) + roundDuration;
        emit RoundUnlocked(roundId);
    }

    /// @notice Commit a secret for a round left without one (e.g. after `unlock`).
    function commitSeed(bytes32 commit) external onlyOperator whenOpen {
        if (seedCommit != bytes32(0)) revert AlreadyBound(); // no swapping a live commit
        seedCommit = commit;
        emit SeedCommitted(roundId, commit);
    }

    /// @notice The bracket. Pure, so anyone can replay a draw from the Drawn event.
    /// 1. Shuffle entrant order with Fisher-Yates driven by the seed.
    /// 2. Pad to a power of two. Byes go to the first entrants, one per pair, so after
    ///    round one the field is a full power of two.
    /// 3. Each match: r = H(seed, 2, round, match) mod (wA + wB); A advances if r < wA.
    ///    The winner carries wA + wB, so P(win bracket) = weight / total weight.
    /// @return winner index into `weights`
    function bracketWinner(bytes32 seed, uint128[] memory weights) public pure returns (uint256 winner) {
        uint256 n = weights.length;
        if (n == 0) revert NothingToDraw();
        if (n == 1) return 0;
        uint256[] memory order = new uint256[](n);
        for (uint256 i; i < n; ++i) order[i] = i;
        for (uint256 i = n - 1; i > 0; --i) {
            uint256 j = uint256(keccak256(abi.encode(seed, uint256(1), i, uint256(0)))) % (i + 1);
            (order[i], order[j]) = (order[j], order[i]);
        }

        uint256 size = 1;
        while (size < n) size <<= 1;
        uint256 byes = size - n;

        // slot value: entrant index + 1, 0 = bye
        uint256[] memory slot = new uint256[](size);
        uint256[] memory w = new uint256[](size);
        uint256 k;
        for (uint256 p; p < size / 2; ++p) {
            slot[2 * p] = order[k] + 1;
            w[2 * p] = weights[order[k]];
            ++k;
            if (p < byes) continue; // 2p+1 stays a bye
            slot[2 * p + 1] = order[k] + 1;
            w[2 * p + 1] = weights[order[k]];
            ++k;
        }

        uint256 round;
        while (size > 1) {
            uint256 half = size / 2;
            for (uint256 m; m < half; ++m) {
                uint256 a = 2 * m;
                uint256 b = a + 1;
                uint256 keep;
                if (slot[b] == 0) {
                    keep = a;
                } else if (slot[a] == 0) {
                    keep = b;
                } else {
                    uint256 total = w[a] + w[b];
                    uint256 r = uint256(keccak256(abi.encode(seed, uint256(2), round, m))) % total;
                    keep = r < w[a] ? a : b;
                }
                uint256 carried = w[a] + w[b];
                slot[m] = slot[keep];
                w[m] = carried;
            }
            size = half;
            ++round;
        }
        return slot[0] - 1;
    }

    // ----------------------------------------------------------------- views

    function pot() public view returns (uint256) {
        return _assets() - totalPrincipal - totalPrizeOwed;
    }

    /// @notice MUSD held as cash, parked 1:1 in the savings vault, and net unclaimed yield.
    function _assets() internal view returns (uint256 assets) {
        assets = musd.balanceOf(address(this));
        if (address(savings) == address(0)) return assets;
        assets += savings.balanceOf(address(this));
        uint256 gross = savings.claimableYield(address(this));
        assets += gross - (gross * feeBps) / 10_000;
    }

    function seatCount() external view returns (uint256) {
        return seatList.length;
    }

    function allSeats() external view returns (bytes32[] memory list, uint128[] memory weights) {
        uint256 n = seatList.length;
        list = new bytes32[](n);
        weights = new uint128[](n);
        for (uint256 i; i < n; ++i) {
            list[i] = seatList[i];
            weights[i] = seats[list[i]].principal;
        }
    }

    // ----------------------------------------------------------------- operator

    /// @notice Bind a handle seat to the wallet its owner signed in with via X.
    ///         Wave 1 trusts the operator's X login check; Wave 2 replaces this
    ///         with a signed attestation anyone can submit.
    function bindSeat(bytes32 seat, address owner_) external onlyOperator {
        if (isWalletSeat(seat) || owner_ == address(0)) revert BadSeat();
        Seat storage s = seats[seat];
        if (s.owner != address(0)) revert AlreadyBound();
        s.owner = owner_;
        emit SeatBound(seat, owner_);
    }

    function setRoundDuration(uint64 d) external onlyOperator {
        roundDuration = d;
    }

    function setOperator(address next) external onlyOperator {
        operator = next;
    }

    // ----------------------------------------------------------------- internal

    function _deposit(bytes32 seat, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (seatPos[seat] == 0) {
            if (seatList.length >= MAX_SEATS) revert TooManySeats();
            seatList.push(seat);
            seatPos[seat] = seatList.length;
        }
        seats[seat].principal += uint128(amount);
        totalPrincipal += amount;
        _pull(amount);
        _park();
        emit Deposited(seat, msg.sender, amount);
    }

    function _unlist(bytes32 seat) internal {
        uint256 pos = seatPos[seat];
        uint256 last = seatList.length;
        if (pos != last) {
            bytes32 moved = seatList[last - 1];
            seatList[pos - 1] = moved;
            seatPos[moved] = pos;
        }
        seatList.pop();
        seatPos[seat] = 0;
    }

    function _pull(uint256 amount) internal {
        if (!musd.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
    }

    function _send(address to, uint256 amount) internal {
        _ensureCash(amount);
        if (!musd.transfer(to, amount)) revert TransferFailed();
        _park();
    }

    /// @dev Pull yield and, if still short, 1:1 principal out of the vault.
    function _ensureCash(uint256 amount) internal {
        if (musd.balanceOf(address(this)) >= amount) return;
        _harvestToCash();
        uint256 cash = musd.balanceOf(address(this));
        if (cash >= amount || address(savings) == address(0)) return;
        savings.withdraw(amount - cash);
    }

    /// @dev Claim yield into cash and forward the fee. Returns the net left here.
    function _harvestToCash() internal returns (uint256 net) {
        if (address(savings) == address(0)) return 0;
        if (savings.claimableYield(address(this)) == 0) return 0;
        uint256 gross = savings.claimYield();
        uint256 fee = (gross * feeBps) / 10_000;
        net = gross - fee;
        if (fee != 0) {
            if (!musd.transfer(treasury, fee)) revert TransferFailed();
        }
        emit YieldHarvested(gross, fee, net);
    }

    /// @dev Deposit every loose MUSD into the vault. Principal stays 1:1.
    function _park() internal {
        if (address(savings) == address(0)) return;
        uint256 cash = musd.balanceOf(address(this));
        if (cash == 0) return;
        if (!musd.approve(address(savings), cash)) revert TransferFailed();
        savings.deposit(cash);
    }

    /// @dev Bring parked MUSD and unclaimed yield back to cash before swapping vaults.
    function _exitSavings() internal {
        if (address(savings) == address(0)) return;
        _harvestToCash();
        uint256 parked = savings.balanceOf(address(this));
        if (parked != 0) savings.withdraw(parked);
    }
}
