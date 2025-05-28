const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class AppleScriptExecutor {
    /**
     * 执行 AppleScript 文件（支持参数）
     * @param {string} filePath - AppleScript 文件路径
     * @param {Array<string>} args - 传递给脚本的参数数组
     * @returns {string} - 执行结果
     */
    static execFile(filePath, args = []) {
        try {
            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                throw new Error(`AppleScript file not found: ${filePath}`);
            }

            // 获取文件扩展名
            const ext = path.extname(filePath).toLowerCase();

            // 支持 .applescript, .scpt, .as 等扩展名
            if (!['.applescript', '.scpt', '.as'].includes(ext)) {
                console.warn(`Warning: Unusual file extension for AppleScript: ${ext}`);
            }

            // 构建命令
            let command = `osascript "${filePath}"`;

            // 添加参数
            if (args.length > 0) {
                // 转义参数中的特殊字符
                const escapedArgs = args.map(arg => {
                    // 如果参数包含空格或特殊字符，用引号包围
                    if (typeof arg !== 'string') {
                        arg = String(arg);
                    }
                    // 转义引号
                    arg = arg.replace(/"/g, '\\"');
                    // 如果包含空格，用引号包围
                    if (arg.includes(' ') || arg.includes('\t')) {
                        return `"${arg}"`;
                    }
                    return arg;
                });

                command += ' ' + escapedArgs.join(' ');
            }

            console.log(`Executing AppleScript file: ${filePath}`);
            if (args.length > 0) {
                console.log(`With arguments: [${args.join(', ')}]`);
            }

            // 执行文件
            const result = execSync(command, {
                encoding: 'utf8',
                timeout: 10000 // 10秒超时
            });

            console.log('AppleScript executed successfully');
            return result.trim();

        } catch (error) {
            console.error('Error executing AppleScript file:', error.message);
            throw error;
        }
    }

    /**
     * 执行 AppleScript 字符串
     * @param {string} script - AppleScript 代码
     * @returns {string} - 执行结果
     */
    static execString(script) {
        try {
            console.log('Executing AppleScript string...');

            // 转义引号和特殊字符
            const escapedScript = script.replace(/'/g, "'\"'\"'");

            // 执行脚本
            const result = execSync(`osascript -e '${escapedScript}'`, {
                encoding: 'utf8',
                timeout: 10000 // 10秒超时
            });

            console.log('AppleScript executed successfully');
            return result.trim();

        } catch (error) {
            console.error('Error executing AppleScript string:', error.message);
            throw error;
        }
    }


}

module.exports = AppleScriptExecutor;
