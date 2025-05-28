const fs = require('fs');
const path = require('path');

/*
 * AI代码解析器
 * 解析 <ai_gen:data> 标签中的代码并替换对应文件和函数
 */
class AICodeParser {
    constructor(baseDir = process.cwd()) {
        this.baseDir = baseDir;
    }

    /*
     * 解析AI生成的代码文本
     * @param {string} content - 包含AI生成标签的文本内容
     * @returns {Object} 解析结果
     */
    parse(content) {
        const result = {
            files: [],
            functions: [],
            errors: []
        };

        // 提取所有 <ai_gen:data> 块
        const dataBlocks = this.extractDataBlocks(content);

        for (const block of dataBlocks) {
            try {
                this.parseDataBlock(block, result);
            } catch (error) {
                result.errors.push({
                    type: 'parse_error',
                    message: error.message,
                    block: block.substring(0, 100) + '...'
                });
            }
        }

        return result;
    }

    /*
     * 提取所有 <ai_gen:data> 块
     * @param {string} content - 文本内容
     * @returns {Array} 数据块数组
     */
    extractDataBlocks(content) {
        const blocks = [];
        const regex = /<ai_gen:data>([\s\S]*?)<\/ai_gen:data>/g;
        let match;

        while ((match = regex.exec(content)) !== null) {
            blocks.push(match[1].trim());
        }

        return blocks;
    }

    /*
     * 解析单个数据块
     * @param {string} block - 数据块内容
     * @param {Object} result - 结果对象
     */
    parseDataBlock(block, result) {
        // 解析文件标签
        this.parseFileBlocks(block, result);

        // 解析函数标签
        this.parseFunctionBlocks(block, result);
    }

    /*
     * 解析文件块
     * @param {string} block - 数据块内容
     * @param {Object} result - 结果对象
     */
    parseFileBlocks(block, result) {
        const fileRegex = /<ai_gen:file\s+path="([^"]+)">([\s\S]*?)<\/ai_gen:file>/g;
        let match;

        while ((match = fileRegex.exec(block)) !== null) {
            const filePath = match[1];
            const fileContent = match[2].trim();

            result.files.push({
                path: filePath,
                content: fileContent,
                fullPath: path.resolve(this.baseDir, filePath)
            });
        }
    }

    /*
        * 解析函数块
    * @param {string} block - 数据块内容
    * @param {Object} result - 结果对象
    */
    parseFunctionBlocks(block, result) {
        const functionRegex = /<ai_gen:function\s+path="([^"]+)"\s+name="([^"]+)">([\s\S]*?)<\/ai_gen:function>/g;
        let match;

        while ((match = functionRegex.exec(block)) !== null) {
            const filePath = match[1];
            const functionName = match[2];
            const functionContent = match[3].trim();

            result.functions.push({
                path: filePath,
                name: functionName,
                content: functionContent,
                fullPath: path.resolve(this.baseDir, filePath)
            });
        }
    }

    /*
    * 应用解析结果到文件系统
    * @param {Object} parseResult - 解析结果
    * @param {Object} options - 选项
    */
    async apply(parseResult, options = {}) {
        const { backup = true, dryRun = false } = options;
        const operations = [];

        // 处理完整文件替换
        for (const file of parseResult.files) {
            try {
                if (backup && fs.existsSync(file.fullPath)) {
                    await this.backupFile(file.fullPath);
                }

                operations.push({
                    type: 'file_replace',
                    path: file.path,
                    success: true
                });

                if (!dryRun) {
                    // 确保目录存在
                    const dir = path.dirname(file.fullPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    fs.writeFileSync(file.fullPath, file.content, 'utf8');
                }
            } catch (error) {
                operations.push({
                    type: 'file_replace',
                    path: file.path,
                    success: false,
                    error: error.message
                });
            }
        }

        // 处理函数替换
        for (const func of parseResult.functions) {
            try {
                if (backup && fs.existsSync(func.fullPath)) {
                    await this.backupFile(func.fullPath);
                }

                operations.push({
                    type: 'function_replace',
                    path: func.path,
                    name: func.name,
                    success: true
                });

                if (!dryRun) {
                    await this.replaceFunctionInFile(func);
                }
            } catch (error) {
                operations.push({
                    type: 'function_replace',
                    path: func.path,
                    name: func.name,
                    success: false,
                    error: error.message
                });
            }
        }

        return operations;
    }

    /*
    * 备份文件
    * @param {string} filePath - 文件路径
    */
    async backupFile(filePath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${filePath}.backup.${timestamp}`;

        if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, backupPath);
        }
    }

    /*
    * 替换文件中的函数
    * @param {Object} func - 函数信息
    */
    async replaceFunctionInFile(func) {
        if (!fs.existsSync(func.fullPath)) {
            throw new Error(`File not found: ${func.fullPath}`);
        }

        let fileContent = fs.readFileSync(func.fullPath, 'utf8');

        // 查找并替换函数
        const functionRegex = new RegExp(
            `(function\\s+${func.name}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\}|` +
            `const\\s+${func.name}\\s*=\\s*[\\s\\S]*?(?=\\n\\s*(?:const|let|var|function|class|$))|` +
            `${func.name}\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\}|` +
            `${func.name}\\s*=\\s*[\\s\\S]*?(?=\\n\\s*(?:const|let|var|function|class|$)))`,
            'g'
        );

        const replaced = fileContent.replace(functionRegex, func.content);

        if (replaced === fileContent) {
            // 如果没有找到函数，尝试在文件末尾添加
            fileContent += `\n\n${func.content}`;
        } else {
            fileContent = replaced;
        }

        fs.writeFileSync(func.fullPath, fileContent, 'utf8');
    }

    /*
    * 验证解析结果
    * @param {Object} parseResult - 解析结果
    * @returns {Object} 验证结果
    */
    validate(parseResult) {
        const validation = {
            valid: true,
            warnings: [],
            errors: []
        };

        // 检查文件路径
        for (const file of parseResult.files) {
            if (!file.path || file.path.includes('..')) {
                validation.errors.push(`Invalid file path: ${file.path}`);
                validation.valid = false;
            }
        }

        // 检查函数信息
        for (const func of parseResult.functions) {
            if (!func.path || !func.name) {
                validation.errors.push(`Invalid function definition: path=${func.path}, name=${func.name}`);
                validation.valid = false;
            }
        }

        return validation;
    }
}

// 使用示例
async function example() {
    const parser = new AICodeParser('./project');

    const aiOutput = `
    <ai_gen:data>
    <ai_gen:file path="src/utils.js">
    function helper() {
        return "Hello World";
    }
    module.exports = { helper };
    </ai_gen:file>
    <ai_gen:function path="src/main.js" name="processData">
    function processData(data) {
        return data.map(item => item.toString());
    }
    </ai_gen:function>
    </ai_gen:data>
    `;

    try {
        const result = parser.parse(aiOutput);
        console.log('解析结果:', result);

        const validation = parser.validate(result);
        if (!validation.valid) {
            console.error('验证失败:', validation.errors);
            return;
        }

        const operations = await parser.apply(result, {
            backup: true,
            dryRun: false
        });

        console.log('应用结果:', operations);
    } catch (error) {
        console.error('处理失败:', error);
    }
}

module.exports = AICodeParser;