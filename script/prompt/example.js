const AIGenFileParser = require('./AIGenFileParser');

// 使用示例
async function example() {
    const projectPath = '/Users/jtong/develop/education/homework-lab/java_microservice/prompt-builder-projects/chatbot_family/doc/my_assistant_test_project/.ai_helper/dev/context/working_prompt/script/prompt/test'; // 项目根目录
    const parser = new AIGenFileParser(projectPath);

    const inputString = `
<ai_gen:file path="src/components/Hello.js">
function Hello() {
  return <div>Hello World!</div>;
}

export default Hello;
</ai_gen:file>
<ai_gen:file path="package.json">
{
  "name": "my-app",
  "version": "1.0.0"
}
</ai_gen:file>
  `;

    try {
        // 1. 验证输入格式
        const validation = parser.validate(inputString);
        if (!validation.valid) {
            console.log('Validation issues:', validation.issues);
            return;
        }

        // 2. 预览将要处理的文件
        const preview = parser.preview(inputString);
        console.log('Files to process:', preview);

        // 3. 实际执行解析和文件替换
        const results = parser.parseAndReplace(inputString);

        console.log('Processing completed:');
        console.log('Success:', results.success);
        console.log('Errors:', results.errors);
        console.log('Stats:', results.stats);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// 运行示例
if (require.main === module) {
    example();
}

module.exports = { example };