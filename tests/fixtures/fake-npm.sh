#!/bin/sh
# Test double for npm: `pack` produces the fake passport-bridge tarball, `ci`
# and `install` create node_modules. Every call is logged to $FAKE_NPM_LOG.
[ -n "${FAKE_NPM_LOG:-}" ] && printf '%s\n' "$*" >>"$FAKE_NPM_LOG"
[ -n "${FAKE_NPM_DELAY:-}" ] && sleep "$FAKE_NPM_DELAY"
case "$1" in
  pack)
    [ "${FAKE_NPM_FAIL:-}" = pack ] && { echo "npm error 404 Not Found - GET https://registry.npmjs.org/passport-bridge" >&2; exit 1; }
    tar -czf "passport-bridge-0.16.0.tgz" -C "$FAKE_NPM_PACKAGE" package
    echo "passport-bridge-0.16.0.tgz"
    ;;
  ci | install)
    [ "${FAKE_NPM_FAIL:-}" = deps ] && { echo "npm error code E500 //registry.example/:_authToken=secret-value" >&2; exit 1; }
    mkdir -p node_modules/@modelcontextprotocol/sdk
    echo '{"name":"@modelcontextprotocol/sdk","version":"1.30.0"}' >node_modules/@modelcontextprotocol/sdk/package.json
    ;;
esac
exit 0
