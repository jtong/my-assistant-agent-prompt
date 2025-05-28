// generate-from-template.js
require('dotenv').config();
const AppleScriptExecutor = require('./AppleScriptExecutor');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 获取当前文件的绝对路径
 */
function getCurrentFilePath() {
    console.log('📁 获取当前文件路径...');
    const absolutePath = AppleScriptExecutor.execFile('./copy-file-path.applescript');
    console.log('✅ 当前文件路径:', absolutePath);
    return absolutePath.trim();
}

/**
 * 计算相对路径
 */
function getRelativePath(absolutePath, projectPath) {
    console.log('🔄 计算相对路径...');
    console.log('项目根路径:', projectPath);
    console.log('文件绝对路径:', absolutePath);

    const relativePath = path.relative(projectPath, absolutePath);
    console.log('✅ 相对路径:', relativePath);
    return relativePath;
}

/**
 * 加载并处理模板
 */
function processTemplate(templatePath, variables) {
    console.log('📄 加载模板文件...');

    if (!fs.existsSync(templatePath)) {
        throw new Error(`模板文件不存在: ${templatePath}`);
    }

    let template = fs.readFileSync(templatePath, 'utf8');
    console.log('✅ 模板加载成功');

    console.log('🔧 替换模板变量...');
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `\${${key}}`;
        template = template.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
        console.log(`✅ 替换 ${placeholder} -> ${value}`);
    }

    return template;
}

/**
 * 复制内容到剪贴板
 */
function copyToClipboard(content) {
    console.log('📋 复制到剪贴板...');
    execSync('pbcopy', {
        input: content,
        encoding: 'utf8'
    });
    console.log('✅ 内容已复制到剪贴板');
}

/**
 * 执行 VS Code 命令
 */
function executeVSCodeCommand() {
    console.log('🚀 执行 VS Code 命令...');
    AppleScriptExecutor.execFile('./generate-from-clipboard.applescript');
    console.log('✅ VS Code 命令执行完成');
}

/**
 * 主执行函数
 */
function main() {
    try {
        console.log('🎯 开始模板生成流程...\n');

        // 检查环境变量
        const projectPath = process.env.PROJECT_WORKFLOW_TEST_VSCODE_OPENED_PATH;
        const templatePath = process.env.CODING_TEMPLATE;

        if (!projectPath || !templatePath) {
            throw new Error('缺少必要的环境变量配置');
        }

        // 1. 获取当前文件路径
        const absolutePath = getCurrentFilePath();

        // 2. 计算相对路径
        const relativePath = getRelativePath(absolutePath, projectPath);

        // 3. 处理模板
        const processedTemplate = processTemplate(templatePath, {
            instruction_file: relativePath
        });

        // 4. 复制到剪贴板
        copyToClipboard(processedTemplate);

        // 5. 执行 VS Code 命令
        executeVSCodeCommand();

        console.log('\n🎉 模板生成流程完成！');

    } catch (error) {
        console.error('\n❌ 执行失败:', error.message);
        process.exit(1);
    }
}

// 执行主函数
main();
