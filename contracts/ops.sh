#!/usr/bin/env bash
# Operator chores. Usage: ./ops.sh draw | ./ops.sh ticket <handle> [musd] | ./ops.sh status
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
R=${RPC:-https://rpc.test.mezo.org}
J=${JAR:?set JAR in .env}

secret() { cast keccak "$(cast abi-encode 'f(bytes32,uint256)' "$SEED_MASTER" "$1")"; }
commit() { cast keccak "$(cast abi-encode 'f(bytes32)' "$(secret "$1")")"; }
send() { cast send "$@" --private-key "$DEPLOYER_KEY" --rpc-url "$R" --legacy >/dev/null 2>&1 || true; }

case "${1:-status}" in
  status)
    echo "round $(cast call $J 'roundId()(uint256)' --rpc-url $R) locked $(cast call $J 'locked()(bool)' --rpc-url $R) seats $(cast call $J 'seatCount()(uint256)' --rpc-url $R)"
    echo "ends $(date -d @"$(cast call $J 'roundEnd()(uint64)' --rpc-url $R | awk '{print $1}')")  pot $(cast call $J 'pot()(uint256)' --rpc-url $R)"
    ;;
  draw)
    r=$(cast call $J 'roundId()(uint256)' --rpc-url $R | awk '{print $1}')
    [ "$(cast call $J 'locked()(bool)' --rpc-url $R)" = "true" ] || send $J 'lockRound()'
    send $J 'draw(bytes32,bytes32)' "$(secret "$r")" "$(commit $((r + 1)))" --gas-limit 9500000
    sleep 3; "$0" status
    ;;
  ticket)
    h=$(echo "${2:?handle}" | tr 'A-Z' 'a-z' | tr -d '@')
    amt=${3:-10}
    send $J 'depositForHandle(string,uint256)' "$h" "${amt}000000000000000000"
    echo "ticket @$h $amt MUSD"
    ;;
esac
