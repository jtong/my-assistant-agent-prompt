#!/bin/bash

source /Users/jtong/.zshrc

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Load: Code Output XML Prompt
# @raycast.mode compact
# @raycast.packageName Developer Tools

# Optional parameters:
# @raycast.icon 📄
# @raycast.description Read output_file_xml.md content to clipboard

# 定义文件路径
FILE_PATH="/Users/jtong/develop/education/homework-lab/java_microservice/prompt-builder-projects/chatbot_family/doc/my_assistant_test_project/.ai_helper/dev/context/working_prompt/script/prompt/output_file_xml.md"

# 切换到脚本所在目录
cd "$(dirname "$0")"

# 执行 Node.js 脚本并传入文件路径参数
node read-file-to-clipboard.js "$FILE_PATH"
