// read-file-to-clipboard.js
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * 读取文件内容到剪贴板
 */
function readFileToClipboard(filePath) {
    try {
        console.log(`📄 读取文件: ${filePath}`);

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            throw new Error(`文件不存在: ${filePath}`);
        }

        // 读取文件内容
        const content = fs.readFileSync(filePath, 'utf8');
        console.log('✅ 文件读取成功');
        console.log(`📊 文件大小: ${content.length} 字符`);

        // 复制到剪贴板
        console.log('📋 复制到剪贴板...');
        execSync('pbcopy', {
            input: content,
            encoding: 'utf8',
            env: {
                ...process.env,
                LC_ALL: 'en_US.UTF-8',
                LANG: 'en_US.UTF-8'
            }
        });

        console.log('✅ 内容已复制到剪贴板');

        // 显示文件内容的前几行作为预览
        const lines = content.split('\n');
        const preview = lines.slice(0, 3).join('\n');
        console.log('📝 内容预览:');
        console.log(preview);
        if (lines.length > 3) {
            console.log('...(更多内容)');
        }

    } catch (error) {
        console.error('❌ 操作失败:', error.message);
        throw error;
    }
}

/**
 * 主执行函数
 */
function main() {
    // 获取命令行参数
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('❌ 缺少文件路径参数');
        console.log('💡 使用方法: node read-file-to-clipboard.js <文件路径>');
        process.exit(1);
    }

    const filePath = args[0];

    try {
        console.log('🎯 开始读取文件到剪贴板...\n');
        readFileToClipboard(filePath);
        console.log('\n🎉 操作完成！');
    } catch (error) {
        console.error('\n❌ 执行失败:', error.message);
        process.exit(1);
    }
}

// 执行主函数
main();
