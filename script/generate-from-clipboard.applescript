-- generate-from-clipboard.applescript
tell application "System Events"
-- 打开 Raycast（CMD+Space）
  keystroke " " using command down
  delay 0.5

  -- 输入项目名称来打开项目
  keystroke "workflow_test"
  delay 0.5
  keystroke return
  delay 1

  -- 等待 VS Code 打开并激活(没必要，这个是为了没打开的)
  -- delay 2

  -- 执行 CMD+Shift+P 打开命令面板
  keystroke "p" using {command down, shift down}
  delay 0.5

  -- 输入命令
  keystroke "Generate All from Clipboard"
  delay 0.3

  -- 回车执行
  keystroke return
end tell
