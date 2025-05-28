#!/bin/bash

source /Users/jtong/.zshrc

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Copy File Path
# @raycast.mode compact
# @raycast.packageName Developer Tools

# Optional parameters:
# @raycast.icon 📁
# @raycast.description Copy current file path to clipboard

# 切换到脚本所在目录
cd "$(dirname "$0")"

# 执行 Node.js 脚本并获取输出
node copy-and-read-path.js
