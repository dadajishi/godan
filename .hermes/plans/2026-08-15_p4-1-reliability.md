# P4-1 工具可靠性强化计划（2026-08-15）

> 主题：让 Godan 的工具调用更可靠——参数错误在进场前被拦截，错误信息可执行。
> 原则：不推翻现有架构，延续 P3 系列（状态机/Replanner/Watch/权限）的成果。

## 已完成里程碑

| 里程碑 | 内容 | 提交 |
|---|---|---|
| M1 ✅ | 工具参数 Schema 预验证（toolSchema.js：required/groups/optional，10 工具全覆盖，30 用例） | 5963421 |
| M2 ✅ | applications.open App 解析增强（真实 .app 路径解析 + mdfind/lsregister 兜底 + appNotFound 明确错误） | 792f7ec |

## 剩余里程碑（本计划）

### M3：参数 Schema 补漏 + 结构校验
M1 的 schema 是「键存在性」验证，有两类漏洞：

1. **互斥/至少一个约束缺失**：
   - `watch.waitValue`：equals/contains 必须至少一个（当前只校验 app，缺条件会到工具内部才报错）
   - `watch.waitProcess`：running/exited 同时传会冲突（内部已容错，但应提前拦截）
   - `watch.waitTree`：role/label 均缺时语义模糊（等"任意控件"），应提示 LLM 显式说明
2. **参数结构校验缺失**：
   - `mouse.drag`：from/to 必须是 `{x, y}` 对象（当前只查键存在，传 `"100,200"` 字符串会到 cliclick 才炸）
   - `screenshot.capture`：bounds 必须是 `{x, y, w, h}` 对象
   - `watch.waitProcess`：pid 必须是数字（传字符串 "abc" 应提前拦截）

实现：toolSchema 增加 `shape`（嵌套结构校验）+ `atLeastOne`（至少一个约束），验证失败返回结构化 `paramError`（含 expected 示例）。

验收：
- 单元用例：waitValue 缺条件 / drag from 缺 x / pid 非数字 → paramError 正确拦截；正常参数零误拦
- 真实任务回归：计算器任务步数不退化

### M4：paramError 反馈闭环
参数错误被拦截后，LLM 是否有效利用 `missing/allowed` 信息修正参数？
- 验证 computerAgent 对 paramError 的响应（错误注入历史后 LLM 带齐参数重试）
- 若 LLM 反复传错参数（同一 paramError ≥2 次）→ 复用到 P3-3 Replanner 的重复失败检测（已有机制，确认覆盖）

### M5：全工具可靠性回归基准
- `backend/benchmark.js`：一键跑 schema 单元用例 + 真实任务基准
  - 计算器 AX 任务（84 键闭环回归）
  - Blender 打开任务（M2 回归）
  - watch 等待任务（P3-4 回归）
  - 失败恢复任务（P3-3 回归）
- 输出报告：各任务步数 / 成功率 / 参数错误数 / 总时长

## 风险
- shape 校验误拦合法参数 → 只对明确结构的参数启用（drag/bounds），宽松匹配（容忍 {x,y} 数字字符串）
- benchmark 依赖真实应用（Blender/计算器）→ 应用缺失时跳过并标注
