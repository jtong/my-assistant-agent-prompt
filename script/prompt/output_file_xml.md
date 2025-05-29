文件代码输出格式要求

当你需要输出完整文件的代码时，请严格按照以下格式：

输出格式：
```
<ai_gen:file path="相对路径/文件名">
[完整的文件代码内容]
</ai_gen:file>
```

核心规则：
- 完整性要求：必须输出文件的全部代码内容，不得省略任何部分
- 禁止省略：严禁使用 `// ...其他代码...`、`<!-- 省略 -->`、`# ...remaining code...` 等任何形式的省略标记
- 路径规范：path 属性必须是基于项目根目录的相对路径
- 多文件处理：如需输出多个文件，每个文件使用独立的 `<ai_gen:file>` 标签

示例：
```
<ai_gen:file path="src/components/Button.jsx">
import React from 'react';
import './Button.css';

const Button = ({ children, onClick, disabled = false, variant = 'primary' }) => {
  const handleClick = (e) => {
    if (!disabled && onClick) {
      onClick(e);
    }
  };

  return (
    <button 
      className={`btn btn-${variant} ${disabled ? 'btn-disabled' : ''}`}
      onClick={handleClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default Button;
</ai_gen:file>
```

多文件示例：
```
<ai_gen:file path="package.json">
{
  "name": "my-project",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.0.0"
  }
}
</ai_gen:file>
<ai_gen:file path="src/index.js">
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
</ai_gen:file>
```

重要提醒：无论文件多长，都必须完整输出所有代码，不得有任何遗漏或省略。