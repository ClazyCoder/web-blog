#!/bin/sh
# Run ONLY in a disposable redis:7-alpine container; no host ports or production data.
set -eu

redis-server --daemonize yes --appendonly yes --appendfsync always --maxmemory 128mb --maxmemory-policy noeviction --save ""
until redis-cli ping >/dev/null 2>&1; do sleep 0.1; done
test "$(redis-cli SET blacklist:test 1 EX 600 NX)" = OK
test -z "$(redis-cli SET blacklist:test 1 EX 600 NX)"
test "$(redis-cli --raw CONFIG GET appendfsync | tail -n 1)" = always
test "$(redis-cli --raw CONFIG GET maxmemory-policy | tail -n 1)" = noeviction

# Clean restart must retain the revocation and its TTL.
redis-cli SHUTDOWN
redis-server --daemonize yes --appendonly yes --appendfsync always --maxmemory 128mb --maxmemory-policy noeviction --save ""
until redis-cli ping >/dev/null 2>&1; do sleep 0.1; done
test "$(redis-cli GET blacklist:test)" = 1
test "$(redis-cli TTL blacklist:test)" -gt 0

# Force memory exhaustion. It must reject new writes without evicting revocations.
redis-cli CONFIG SET maxmemory 1 >/dev/null
result="$(redis-cli SET another-key value)"
case "$result" in *OOM*) ;; *) exit 1 ;; esac
test "$(redis-cli GET blacklist:test)" = 1
redis-cli SHUTDOWN
echo "Redis rotation, restart persistence, and noeviction checks passed"
