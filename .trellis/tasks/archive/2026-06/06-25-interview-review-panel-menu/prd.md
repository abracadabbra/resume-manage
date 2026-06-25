# 面试复盘面板独立菜单

## 背景

当前 `QuestionReviewInsights` 组件嵌入在 `QuestionBankPanel` 中，导致题库页面过于拥挤。复盘面板本身是一个独立的概览视图，适合作为独立入口。

## 需求

将「面试复盘面板」从面试题库内部独立出来，作为顶级菜单入口。

## 变更范围

### 1. 侧边栏菜单新增入口

在 `ModuleSidebar.vue` 的 `primaryMenus` 中增加 `interview-review` 条目：
- label: `面试复盘`
- 位置：在 `ai-interviewer`（AI面试）之后

### 2. App.vue 路由扩展

在 `activeMenu` 类型和条件渲染中增加 `interview-review` 分支，渲染新的 `InterviewReviewPanel`。

### 3. 新建 InterviewReviewPanel.vue

新建 `src/components/interview-review/InterviewReviewPanel.vue`：
- 独立页面布局
- 承载 `QuestionReviewInsights` 组件作为核心内容
- 不再在 `QuestionBankPanel` 中引用 `QuestionReviewInsights`

### 4. 移除题库中的复盘面板

从 `QuestionBankPanel.vue` 中移除 `<QuestionReviewInsights />` 组件的引用和导入。

## 验收标准

- [ ] 侧边栏显示「面试复盘」菜单项，点击可切换到独立复盘视图
- [ ] 复盘面板不再出现在面试题库页面中
- [ ] 面试题库页面加载正常，复盘数据（练习记录、薄弱项等）不受影响
- [ ] 快捷键 J/K 切换题目功能在题库中仍然正常
