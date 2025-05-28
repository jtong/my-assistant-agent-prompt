

## Applescript 命令行参数（argv）

### 在 AppleScript 中接收参数：
```applescript
on run argv
    set appName to item 1 of argv
    set textToType to item 2 of argv
    
    tell application appName to activate
    delay 1
    tell application "System Events"
        keystroke textToType
    end tell
end run
```

### 从命令行调用：
```bash
osascript script.applescript "Visual Studio Code" "Hello World"
```

### 在 Node.js 中使用：
```javascript
const { execSync } = require('child_process');

function runScriptWithParams(appName, text) {
    const command = `osascript script.applescript "${appName}" "${text}"`;
    execSync(command);
}

runScriptWithParams("Visual Studio Code", "console.log('Hello');");
```

## 使用示例

```javascript
const AppleScriptExecutor = require('./applescript-executor');

// 示例1: 执行文件（直接执行 .applescript 文件）
try {
    const result1 = AppleScriptExecutor.execFile('./scripts/open-vscode.applescript');
    console.log('Result from file execution:', result1);
} catch (error) {
    console.error('File execution failed:', error.message);
}


// 示例2: 直接执行字符串
try {
    const script = `
    tell application "Visual Studio Code"
        activate
    end tell
    
    tell application "System Events"
        delay 2
        keystroke "console.log('Hello from Node.js!');"
        keystroke return
    end tell
    `;
    
    const result3 = AppleScriptExecutor.execString(script);
    console.log('Result from string execution:', result3);
} catch (error) {
    console.error('String execution failed:', error.message);
}

```

## 常见问题

Q：会等待applescript执行完再向后执行吗？
A：这取决于你使用的执行方式： 使用 execSync 同步执行会等待，使用 exec异步执行不会等待



