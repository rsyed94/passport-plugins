#!/bin/sh
# Passport plugin hook (POSIX sh). Usage:
#
#   passport-hook.sh guard|audit|session-start claude-code|codex|cursor
#
# guard / audit: run the installed Passport CLI's `passport hook guard` or
# `passport hook` with the agent's stdin, and pass its answer through. The CLI
# makes every decision; this script never answers on its own. When the CLI isn't
# installed, or anything goes wrong, it exits 0 and prints nothing, so the agent
# carries on under its own permission rules.
#
# session-start: if no usable Passport CLI is installed, start a background
# install of the pinned passport-bridge into ~/.passport/cli/<version>/ (the
# same layout `passport init` uses) and return at once. Never prints anything.
# Progress and problems go to ~/.passport/logs/plugin-install.log.

PASSPORT_CLI_VERSION="0.15.0"
MIN_NODE_MAJOR=20

mode=${1:-}
client=${2:-claude-code}
case "$client" in claude-code | codex | cursor) ;; *) exit 0 ;; esac
[ -n "${HOME:-}" ] || exit 0

PASSPORT_DIR=${PASSPORT_HOME:-$HOME/.passport}
CLI_ROOT=$PASSPORT_DIR/cli
LOG_DIR=$PASSPORT_DIR/logs
LOG_FILE=$LOG_DIR/plugin-install.log
PIN_DIR=$CLI_ROOT/$PASSPORT_CLI_VERSION
LOCK_DIR=$CLI_ROOT/.plugin-install.lock
FAILED_STAMP=$CLI_ROOT/.plugin-install-failed

# npx and pnpm dlx run from caches that can vanish; never trust them.
is_ephemeral() {
  case "$1" in
    */_npx/* | */.npm/* | */npm-cache/* | */.pnpm-store/* | */pnpm/dlx/* | */.yarn/berry/cache/*) return 0 ;;
  esac
  return 1
}

node_major() {
  "$1" --version 2>/dev/null | sed -n 's/^v\([0-9][0-9]*\).*/\1/p'
}

# A Node.js >= 20 that isn't in npm's cache: PATH first, then the folders GUI
# apps often leave off PATH (Homebrew, nvm, Volta, ~/.local, Bun).
find_node() {
  if [ -n "${PASSPORT_PLUGIN_NODE:-}" ] && [ -x "$PASSPORT_PLUGIN_NODE" ]; then
    printf '%s\n' "$PASSPORT_PLUGIN_NODE"
    return 0
  fi
  search=${PASSPORT_PLUGIN_NODE_SEARCH-"/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.local/bin:$HOME/.bun/bin"}
  if [ -z "${PASSPORT_PLUGIN_NODE_SEARCH+set}" ] && [ -d "$HOME/.nvm/versions/node" ]; then
    for dir in $(for v in "$HOME"/.nvm/versions/node/v[0-9]*; do [ -d "$v" ] && basename "$v"; done | sort -t. -k1.2,1nr -k2,2nr -k3,3nr); do
      search="$search:$HOME/.nvm/versions/node/$dir/bin"
    done
  fi
  old_ifs=$IFS
  IFS=:
  for dir in ${PATH:-} $search; do
    IFS=$old_ifs
    [ -n "$dir" ] || continue
    candidate=$dir/node
    if [ ! -x "$candidate" ] || [ -d "$candidate" ]; then
      continue
    fi
    is_ephemeral "$candidate" && continue
    major=$(node_major "$candidate")
    if [ -n "$major" ] && [ "$major" -ge "$MIN_NODE_MAJOR" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  IFS=$old_ifs
  return 1
}

# The node and entry a `passport init` shim runs: exec '<node>' '<entry>' "$@"
shim_node() { sed -n "s/^exec '\([^']*\)' '\([^']*\)' .*/\1/p" "$1" 2>/dev/null | head -n 1; }
shim_entry() { sed -n "s/^exec '\([^']*\)' '\([^']*\)' .*/\2/p" "$1" 2>/dev/null | head -n 1; }

shim_valid() {
  shim=$CLI_ROOT/bin/passport
  [ -f "$shim" ] || return 1
  sn=$(shim_node "$shim")
  se=$(shim_entry "$shim")
  [ -n "$sn" ] && [ -x "$sn" ] && [ -n "$se" ] && [ -f "$se" ]
}

# A copy Passport installed: its marker names this version and dist/ exists.
install_valid() {
  [ -f "$1/dist/passport.js" ] || return 1
  grep -q "\"version\"[[:space:]]*:[[:space:]]*\"$2\"" "$1/.passport-install.json" 2>/dev/null
}

version_at_least() {
  # $1 >= $2, numeric major.minor.patch
  printf '%s\n%s\n' "$1" "$2" | awk -F'[.+-]' '
    NR == 1 { a1 = $1 + 0; a2 = $2 + 0; a3 = $3 + 0 }
    NR == 2 { b1 = $1 + 0; b2 = $2 + 0; b3 = $3 + 0 }
    END {
      if (a1 != b1) exit !(a1 > b1)
      if (a2 != b2) exit !(a2 > b2)
      exit !(a3 >= b3)
    }'
}

path_passport() {
  old_ifs=$IFS
  IFS=:
  for dir in ${PATH:-}; do
    IFS=$old_ifs
    [ -n "$dir" ] || continue
    candidate=$dir/passport
    if [ ! -x "$candidate" ] || [ -d "$candidate" ]; then
      continue
    fi
    is_ephemeral "$candidate" && continue
    printf '%s\n' "$candidate"
    return 0
  done
  IFS=$old_ifs
  return 1
}

# A global npm install of passport-bridge at the pinned version or newer.
global_cli_current() {
  bin=$(path_passport) || return 1
  target=$bin
  if [ -L "$bin" ]; then
    link=$(readlink "$bin" 2>/dev/null) || return 1
    case "$link" in /*) target=$link ;; *) target=$(dirname "$bin")/$link ;; esac
  fi
  pkg=$(dirname "$(dirname "$target")")/package.json
  [ -f "$pkg" ] || return 1
  grep -q '"name"[[:space:]]*:[[:space:]]*"passport-bridge"' "$pkg" || return 1
  found=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$pkg" | head -n 1)
  [ -n "$found" ] && version_at_least "$found" "$PASSPORT_CLI_VERSION"
}

# Sets CLI_NODE + CLI_ENTRY, or CLI_BIN. Preference: the `passport init` shim
# (the person's chosen version), a `current` link, the plugin's pinned copy,
# then a `passport` on PATH.
resolve_cli() {
  CLI_NODE=
  CLI_ENTRY=
  CLI_BIN=
  if shim_valid; then
    CLI_NODE=$sn
    CLI_ENTRY=$se
    return 0
  fi
  for dir in "$CLI_ROOT/current" "$PIN_DIR"; do
    if [ -f "$dir/dist/passport.js" ]; then
      CLI_NODE=$(find_node) || return 1
      CLI_ENTRY=$dir/dist/passport.js
      return 0
    fi
  done
  CLI_BIN=$(path_passport) || return 1
  return 0
}

# The agent's own settings already run this Passport hook (`passport hook
# install` or `passport init`), so the plugin's copy stays quiet instead of
# recording or asking twice.
settings_file() {
  case "$client" in
    claude-code) printf '%s\n' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json" ;;
    codex) printf '%s\n' "${CODEX_HOME:-$HOME/.codex}/hooks.json" ;;
    cursor) printf '%s\n' "${PASSPORT_CURSOR_HOME:-$HOME/.cursor}/hooks.json" ;;
  esac
}

settings_register() {
  file=$(settings_file)
  [ -f "$file" ] || return 1
  tail='([[:space:]]+--client([[:space:]]+|=)[a-z-]+)?[[:space:]]*"'
  if [ "$1" = guard ]; then
    grep -Eq "passport[^\"]*(\\\\\")?[[:space:]]+hook[[:space:]]+guard$tail" "$file"
  else
    grep -Eq "passport[^\"]*(\\\\\")?[[:space:]]+hook$tail" "$file"
  fi
}

run_hook() {
  [ "${PASSPORT_HOOK_DISABLED:-}" = 1 ] && return 0
  kind=$1
  settings_register "$kind" && return 0
  resolve_cli || return 0
  set -- hook
  [ "$kind" = guard ] && set -- "$@" guard
  [ "$client" = claude-code ] || set -- "$@" --client "$client"
  PASSPORT_HOOK_VIA=plugin
  export PASSPORT_HOOK_VIA
  if [ -n "$CLI_BIN" ]; then
    out=$("$CLI_BIN" "$@" 2>/dev/null) || return 0
  else
    out=$("$CLI_NODE" "$CLI_ENTRY" "$@" 2>/dev/null) || return 0
  fi
  # Only a JSON object reaches the agent; anything else is dropped.
  case "$out" in
    "{"*"}") printf '%s\n' "$out" ;;
  esac
  return 0
}

log_line() {
  mkdir -p "$LOG_DIR" 2>/dev/null || return 0
  chmod 700 "$PASSPORT_DIR" 2>/dev/null
  if [ -f "$LOG_FILE" ] && [ "$(wc -c <"$LOG_FILE" 2>/dev/null || echo 0)" -gt 262144 ]; then
    mv -f "$LOG_FILE" "$LOG_FILE.1" 2>/dev/null
  fi
  printf '%s passport-plugin: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >>"$LOG_FILE" 2>/dev/null
}

# A hint is written once, not once per session.
log_hint() {
  if [ -f "$LOG_FILE" ] && tail -n 1 "$LOG_FILE" 2>/dev/null | grep -qF "$1"; then
    return 0
  fi
  log_line "$1"
}

cli_ready() {
  shim_valid && return 0
  install_valid "$PIN_DIR" "$PASSPORT_CLI_VERSION" && return 0
  [ -f "$CLI_ROOT/current/dist/passport.js" ] && return 0
  global_cli_current && return 0
  return 1
}

# Something recent in $1 (a file or folder), within $2 minutes.
recent() {
  [ -e "$1" ] || return 1
  [ -n "$(find "$1" -prune -mmin "-$2" 2>/dev/null)" ]
}

find_npm() {
  if command -v npm >/dev/null 2>&1; then
    command -v npm
    return 0
  fi
  sibling=$(dirname "$1")/npm
  [ -x "$sibling" ] && printf '%s\n' "$sibling" && return 0
  return 1
}

session_start() {
  if [ "$client" = claude-code ] && [ -n "${CLAUDE_ENV_FILE:-}" ] && ! command -v passport >/dev/null 2>&1; then
    # Let the agent run `passport wait <id>` and `passport rules test` in this session.
    line="export PATH=\"\$PATH:$CLI_ROOT/bin\""
    grep -qxF "$line" "$CLAUDE_ENV_FILE" 2>/dev/null || printf '%s\n' "$line" >>"$CLAUDE_ENV_FILE" 2>/dev/null
  fi
  [ "${PASSPORT_PLUGIN_AUTO_INSTALL:-1}" = 0 ] && return 0
  cli_ready && return 0
  recent "$FAILED_STAMP" 60 && return 0
  if [ -d "$LOCK_DIR" ]; then
    recent "$LOCK_DIR" 15 && return 0
    rm -rf "$LOCK_DIR" 2>/dev/null
  fi
  node=$(find_node) || {
    log_hint "Node.js $MIN_NODE_MAJOR or newer wasn't found, so the Passport CLI isn't installed yet. Install Node.js, or run: npx passport-bridge@latest init"
    return 0
  }
  find_npm "$node" >/dev/null || {
    log_hint "npm wasn't found next to $node, so the Passport CLI isn't installed yet. Run: npx passport-bridge@latest init"
    return 0
  }
  self=$(cd "$(dirname "$0")" 2>/dev/null && pwd)/$(basename "$0")
  mkdir -p "$LOG_DIR" 2>/dev/null || return 0
  PASSPORT_PLUGIN_NODE=$node
  export PASSPORT_PLUGIN_NODE
  # Fully detached: the install must outlive this hook and the agent's session.
  if command -v setsid >/dev/null 2>&1; then
    setsid sh "$self" __ensure-worker "$client" </dev/null >>"$LOG_FILE" 2>&1 &
  else
    "$node" -e '
      const { spawn } = require("node:child_process");
      const { openSync } = require("node:fs");
      const [self, log, client] = process.argv.slice(1);
      const fd = openSync(log, "a");
      spawn("/bin/sh", [self, "__ensure-worker", client], { detached: true, stdio: ["ignore", fd, fd] }).unref();
    ' "$self" "$LOG_FILE" "$client" </dev/null >/dev/null 2>&1 ||
      nohup sh "$self" __ensure-worker "$client" </dev/null >>"$LOG_FILE" 2>&1 &
  fi
  return 0
}

quote_sh() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

# Version-independent launchers, written like `passport init` writes them, only
# when none exist or the existing ones point at something gone.
write_shims() {
  shim_valid && return 0
  bin_dir=$CLI_ROOT/bin
  mkdir -p "$bin_dir" || return 1
  for pair in "passport:passport.js" "passport-bridge:cli.js"; do
    name=${pair%%:*}
    entry=$PIN_DIR/dist/${pair#*:}
    tmp=$bin_dir/.$name-plugin-$$.tmp
    {
      printf '#!/bin/sh\n'
      printf 'exec %s %s "$@"\n' "$(quote_sh "$1")" "$(quote_sh "$entry")"
    } >"$tmp" || continue
    chmod 755 "$tmp" && mv -f "$tmp" "$bin_dir/$name"
    rm -f "$tmp"
  done
}

redact() { sed -e 's/\(_authToken[=:]\)[^[:space:]]*/\1[redacted]/g' -e 's#//[^/@[:space:]]*:[^/@[:space:]]*@#//[redacted]@#g'; }

ensure_worker() {
  umask 077
  mkdir -p "$CLI_ROOT" || exit 0
  chmod 700 "$PASSPORT_DIR" 2>/dev/null
  mkdir "$LOCK_DIR" 2>/dev/null || exit 0
  work=
  trap 'rm -rf "$LOCK_DIR" ${work:+"$work"}' EXIT
  trap 'exit 1' HUP INT TERM
  if install_valid "$PIN_DIR" "$PASSPORT_CLI_VERSION"; then
    write_shims "$PASSPORT_PLUGIN_NODE"
    exit 0
  fi
  node=${PASSPORT_PLUGIN_NODE:-}
  [ -n "$node" ] || node=$(find_node) || exit 0
  npm=$(find_npm "$node") || exit 0
  PATH=$(dirname "$node"):$PATH
  export PATH
  work=$(mktemp -d "$CLI_ROOT/.plugin-install-XXXXXX") || exit 0
  spec=passport-bridge@$PASSPORT_CLI_VERSION
  log_line "Installing $spec into $PIN_DIR"
  fail() {
    log_line "Couldn't install $spec ($1). Passport will retry in an hour, or run: npx passport-bridge@latest init"
    : >"$FAILED_STAMP"
    exit 0
  }
  mkdir "$work/pack" || fail "temporary folder"
  (cd "$work/pack" && "$npm" pack "$spec" --silent --no-audit --no-fund 2>&1 >/dev/null) | redact >>"$LOG_FILE"
  tarball=
  for candidate in "$work/pack"/*.tgz; do [ -f "$candidate" ] && tarball=$candidate && break; done
  [ -n "$tarball" ] || fail "npm pack failed"
  tar -xzf "$tarball" -C "$work" || fail "couldn't unpack the package"
  [ -f "$work/package/dist/passport.js" ] || fail "the package has no dist/passport.js"
  # Dependencies exactly as the package's own npm-shrinkwrap.json pins them.
  if ! (cd "$work/package" && "$npm" ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error >"$work/npm.log" 2>&1) ||
    [ ! -d "$work/package/node_modules" ]; then
    redact <"$work/npm.log" >>"$LOG_FILE"
    (cd "$work/package" && "$npm" install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock --loglevel=error >"$work/npm.log" 2>&1) ||
      { redact <"$work/npm.log" >>"$LOG_FILE"; fail "npm couldn't install its dependencies"; }
    [ -d "$work/package/node_modules" ] || fail "npm couldn't install its dependencies"
  fi
  printf '{"version":"%s","installedAt":%s,"installedBy":"passport-plugin"}\n' \
    "$PASSPORT_CLI_VERSION" "$(date +%s)000" >"$work/package/.passport-install.json"
  rm -rf "$PIN_DIR"
  if ! mv "$work/package" "$PIN_DIR"; then
    install_valid "$PIN_DIR" "$PASSPORT_CLI_VERSION" || fail "couldn't move the copy into place"
  fi
  rm -f "$FAILED_STAMP"
  write_shims "$node"
  log_line "Installed $spec. The Passport guard is on for new commands."
  exit 0
}

case "$mode" in
  guard | audit)
    exec 2>/dev/null
    run_hook "$mode"
    ;;
  session-start)
    exec 2>/dev/null
    session_start >/dev/null
    ;;
  __ensure-worker)
    ensure_worker
    ;;
esac
exit 0
