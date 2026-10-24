#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

is_python3() {
  "$1" -c 'import sys; raise SystemExit(0 if sys.version_info[0] == 3 else 1)' >/dev/null 2>&1
}

candidates=()
if command -v python3 >/dev/null 2>&1; then
  candidates+=("$(command -v python3)")
fi
if command -v python >/dev/null 2>&1; then
  candidates+=("$(command -v python)")
fi

shopt -s nullglob
for install in \
  "${LOCALAPPDATA:-}/Programs/Python/Python3"*/python.exe \
  "/c/Users/${USERNAME:-${USER:-}}/AppData/Local/Programs/Python/Python3"*/python.exe \
  /usr/bin/python3
do
  candidates+=("$install")
done

for bin in "${candidates[@]}"; do
  if is_python3 "$bin"; then
    exec "$bin" "$DIR/guard-constitution.py"
  fi
done

if command -v py >/dev/null 2>&1 && py -3 -c 'import sys' >/dev/null 2>&1; then
  exec py -3 "$DIR/guard-constitution.py"
fi

echo "guard-constitution: no working python3 interpreter" >&2
exit 1
