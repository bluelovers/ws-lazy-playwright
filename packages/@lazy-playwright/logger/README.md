# @lazy-playwright/logger

以 debug-color2 的 `Console2` 為基礎的終端日誌工具：提供可彈性指定方法與樣式的 `logConsole`，以及四個預設日誌實例。

## 安裝 (Installation)

```bash
# 使用 yarn / Using yarn
yarn add @lazy-playwright/logger

# 使用 yarn-tool / Using yarn-tool
yarn-tool add @lazy-playwright/logger
# yt 是 yarn-tool 的別名 / yt is an alias for yarn-tool
yt add @lazy-playwright/logger

# 使用 pnpm / Using pnpm
pnpm add @lazy-playwright/logger

# 使用 npm / Using npm
npm install @lazy-playwright/logger
```

## 使用方式 (Usage)

### 預設日誌實例

| 實例 | `label` | `time` | 說明 |
| --- | --- | --- | --- |
| `consoleLoggerBase` | — | — | 基礎日誌：不帶標籤與時間戳 |
| `consoleLoggerTimeAndLabel` | ✓ | ✓ | 帶標籤與時間戳 |
| `consoleLoggerLabelOnly` | ✓ | — | 僅帶標籤 |
| `consoleLoggerTimeOnly` | — | ✓ | 僅帶時間戳 |

```typescript
import { consoleLoggerTimeAndLabel } from '@lazy-playwright/logger';

consoleLoggerTimeAndLabel.log('[task]', 'range resolved');
```

### logConsole

`logConsole(console, method, ...args)` 的 `method` 參數支援三種形式：

```typescript
import { logConsole, consoleLoggerBase } from '@lazy-playwright/logger';

// 直接指定方法名稱
logConsole(consoleLoggerBase, 'warn', 'task failed');

// 陣列：僅含方法
logConsole(consoleLoggerBase, ['error'], 'upload failed');

// 陣列：樣式置前、方法置於尾端
logConsole(consoleLoggerBase, ['yellow', 'success'], 'range resolved');

// 未傳入 method 時以 'log' 輸出
logConsole(consoleLoggerBase, undefined, 'plain message');
```

樣式會以屬性鏈依序疊加：`['yellow', 'success']` 等同呼叫 `console.yellow.success(...)`。

