#!/bin/bash
# raycast-generate-template.sh

source "/Users/jtong/.zshrc"

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Generate from Template
# @raycast.mode compact
# @raycast.packageName Developer Tools

# Optional parameters:
# @raycast.icon 🎯
# @raycast.description Generate content from template using current file

cd "$(dirname "$0")"
node generate-from-template.js
