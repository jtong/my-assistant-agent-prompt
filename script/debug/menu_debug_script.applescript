tell application "System Events"
	tell process "TextInputMenuAgent"
		set menuBarItems to menu bar items of menu bar 1
		set itemCount to count of menuBarItems
		set itemInfo to ""

		repeat with i from 1 to itemCount
			try
				set itemTitle to title of menu bar item i of menu bar 1
				set itemInfo to itemInfo & "项目 " & i & ": " & itemTitle & return
			on error
				set itemInfo to itemInfo & "项目 " & i & ": (无标题)" & return
			end try
		end repeat

		display dialog "菜单栏项目信息:" & return & itemInfo buttons {"确定"}
	end tell
end tell
