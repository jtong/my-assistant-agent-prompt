tell application "System Events"
  key code 53
  delay 0.3
end tell

tell application "WebStorm"
  activate
  delay 0.3
end tell

tell application "System Events"
  keystroke "c" using {command down, shift down}
  delay 0.3
end tell

set clipboardContent to the clipboard as string
return clipboardContent
