# 大厂面经专栏 (Big Tech Interview Questions)

## Goal
将 2676 道去重面试题（清洗后约 2100 道）导入 Resume Builder 系统，新增"大厂面经"作为第 5 个顶级菜单，支持按技术栈分类导航、公司多选筛选、频次排序和关键词搜索。

## User Value
- 一站式浏览 20 家大厂（滴滴/字节/京东/美团/阿里等）的真实面试题
- 按技术栈快速定位薄弱领域
- 按目标公司筛选针对性题目
- 高频题优先展示，高效备考

## Confirmed Facts
- 数据源：199 篇小红书面试笔记，经 OCR + 文本提取
- 原始 3104 题 → 去重 2676 → 清洗后预计 ~2100 道有效题
- 19 个技术分类：MySQL(427), 并发编程(344), Redis(328), 算法(291), 系统设计(203), Java基础(165), 分布式(163), JVM(143), 消息队列(141), Spring(135), 网络(132), AI大模型(126), 智力题(108), 设计模式(99), 容器运维(68), Go其他(44), 其他数据库(37), 项目场景(720), 其他(614)
- 20 家公司：滴滴、京东、小红书、字节跳动、阿里、美团、百度、腾讯、顺丰、钉钉、小鹏、快手、搜狗、平安、蚂蚁、畅捷通、华为、拼多多、得物、影石
- 现有项目：Vue 3 + Pinia + TypeScript + Vite

## Requirements

### R1: 数据清洗
- 过滤自我介绍/反问环节/开场寒暄等流程类题目
- 过滤 <10 字无意义片段（保留含技术关键词的短题）
- 过滤 >30 字非问句描述文本
- 过滤标签残留和 OCR 碎片
- 预计清理 ~576 条

### R2: 数据格式
- 输出到 `src/data/tech-interview-questions.json`
- 紧凑格式：短 key（q/f/c），按 category 分组
- 包含 companies 列表和 categories 元数据

### R3: Pinia Store
- 新建 `src/stores/techInterviewQuestions.ts`（~180 行）
- 只读：无 CRUD、无练习记录、无云同步
- 筛选：分类(activeCategoryId)、公司多选(selectedCompanies)、搜索(searchQuery)、排序(sortBy)
- 动态加载：`import()` 按需加载 JSON

### R4: UI 组件
- `TechInterviewPanel.vue` — 三栏布局顶层面板
- `TechCategoryNav.vue` — 左侧分类导航（160px）
- `TechQuestionList.vue` — 中间：搜索 + 公司 chips + 题目列表（340px）
- `TechQuestionDetail.vue` — 右侧详情面板（flex-1）
- 暖色调主题（#d97745 主色）
- 公司筛选用 chip 多选，Top 8 默认展示

### R5: App Shell 集成
- `App.vue`：添加异步组件 + 路由
- `ModuleSidebar.vue`：添加"大厂面经"菜单项

## Acceptance Criteria
- [ ] `npm run dev` 启动后，侧边栏显示"大厂面经"菜单
- [ ] 点击进入，左侧显示 19 个技术分类导航
- [ ] 点击分类，中间列表只显示该分类题目，按频次降序
- [ ] 公司 chip 多选筛选正常（OR 逻辑）
- [ ] 搜索框支持关键词搜索
- [ ] 点击题目，右侧显示完整信息（题目文本、频次、公司列表）
- [ ] `npm run type-check` 无错误
- [ ] `npm run lint` 无错误
- [ ] 数据加载为懒加载（首次进入才加载 JSON）

## Out of Scope
- 练习记录/掌握度追踪
- 云同步
- AI 生成参考答案
- 题目编辑/新增/删除
- 虚拟滚动（720 题列表性能可接受）

## Open Questions
无（需求已在计划阶段充分讨论确认）
# 大厂面经专栏

## Goal

TBD.

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
