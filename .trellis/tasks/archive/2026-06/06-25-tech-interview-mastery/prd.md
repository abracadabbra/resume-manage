# 大厂面经添加练习状态

## 背景

大厂面经（`TechInterviewPanel`）目前只有 AI 答案编辑能力，缺少面试题库已有的「未练/练过/熟练/薄弱」熟练度体系。用户希望在面经里也能追踪练习进度。

## 需求

在大厂面经的题目列表和详情区，每道题显示并支持切换熟练度状态（与面试题库一致）。

## 变更范围

### 1. Store 扩展

`techInterviewQuestions.ts` 增加：
- `practiceRecords: Record<string, PracticeRecord>`（从 localStorage 加载/保存）
- `PracticeMastery` 类型：`'unpracticed' | 'practicing' | 'mastered' | 'weak'`
- `PracticeRecord` 结构：`{ mastery: PracticeMastery, answer: string, notes: string, updatedAt: number | null }`
- `setPracticeMastery(questionId, mastery)` 方法
- `getPracticeRecord(questionId)` 方法
- 批量操作方法（可选）

### 2. 题目列表（TechQuestionList.vue）

- 每道题显示熟练度 chip，颜色与题库一致
  - 未练：灰色
  - 练过：蓝色
  - 熟练：绿色
  - 薄弱：红色
- 点击 chip 弹出熟练度选择菜单

### 3. 题目详情（TechQuestionDetail.vue）

- 添加熟练度切换栏（显示当前状态 + 可点击切换）
- 位置：在题目信息下方

### 4. 复盘面板联动

- `QuestionReviewInsights` 组件已经按 `store.questions` 渲染
- 大厂面经的练习数据独立于题库，复盘面板不需要改动（暂不联动）

## 验收标准

- [x] 大厂面经每道题显示熟练度 chip，状态正确对应
- [x] 点击 chip 可切换状态，切换后保存到 localStorage
- [x] 熟练度状态刷新页面后保持
- [x] 快捷键 J/K 切换题目功能不受影响
- [x] 与面试题库的熟练度视觉风格保持一致
