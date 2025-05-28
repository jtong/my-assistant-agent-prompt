#!/bin/bash
source "/Users/jtong/.zshrc"

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title direct generate
# @raycast.mode compact
# @raycast.packageName Developer Tools

# Optional parameters:
# @raycast.icon 🤖

cd "$(dirname "$0")"
node generate-direct.js
