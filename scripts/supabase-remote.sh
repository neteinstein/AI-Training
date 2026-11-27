#!/usr/bin/env bash
# Runs the Supabase command line against the hosted project, and runs it again when it could
# not connect for a reason that passes. Used by the Database workflow.
#
# With --remote=<project ref>, the command line asks Supabase's API for the address of the
# project that speaks IPv4 (its connection pooler). When that lookup fails, it falls back to
# the direct address, which is IPv6 only, and GitHub's machines have no IPv6: "IPv6 is not
# supported on your current network". At that point nothing has been connected to, let alone
# changed, so the same command can be run again. Any other failure is passed on at once: a
# migration that fails is never tried twice.
set -uo pipefail

attempts=4
pause="${SUPABASE_RETRY_PAUSE:-15}"
status=1

for attempt in $(seq 1 "$attempts"); do
  output=$(npx supabase "$@" 2>&1)
  status=$?
  printf '%s\n' "$output"
  if [ "$status" -eq 0 ]; then exit 0; fi
  if ! grep -q "IPv6 is not supported" <<<"$output"; then exit "$status"; fi
  if [ "$attempt" -lt "$attempts" ]; then
    echo "No connection (attempt $attempt of $attempts). Trying again in $pause seconds."
    sleep "$pause"
  fi
done

echo "Still no connection after $attempts attempts. Nothing was changed."
exit "$status"
