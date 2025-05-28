const AppleScriptExecutor = require('./AppleScriptExecutor');

try {
    // 直接执行，不需要延迟（因为用户主动触发）
    const filePath = AppleScriptExecutor.execFile('./copy-file-path.applescript');

    console.log('✅ 文件路径已复制:', filePath);

} catch (error) {
    console.error('❌ 执行失败:', error.message);
}
