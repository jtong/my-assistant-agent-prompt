tell application "System Events"
	tell process "TextInputMenuAgent"
		tell menu bar item 1 of menu bar 2
			click
			delay 0.2
			-- 获取所有菜单项
			set menuItems to name of menu items of menu 1
			-- display dialog "可用的输入法: " & (menuItems as string)

			-- 查找并点击第一个英文输入法
			repeat with menuItem in menu items of menu 1
				if name of menuItem contains "ABC" then
					click menuItem
					exit repeat
				end if
			end repeat
		end tell
	end tell
end tell

delay 0.3