---
name: resume-template-from-image
description: 当用户发送简历模板图片时，按本项目现有模板规范直接生成可用的新模板（含组件、注册与预览图接入）。
---

# 简历模板图片直生技能（Claude）

当用户上传一张或多张简历模板图片，并表达“照这个样式生成模板/新增模板”时，直接执行本技能。

## 目标

基于用户图片，生成一套可在当前项目直接切换使用的模板实现，且严格对齐现有模板规则，不发散到项目外实现。
图片只用于参考视觉样式，不用于决定数据字段结构。

## 触发条件

- 用户发送模板图片（截图、设计稿、成品图均可）。
- 用户明确提供模板名称（必填）。
- 用户意图是“生成新模板”而不是“优化已有模板的小样式”。

## 默认行为（名称必填）

- 模板名称是必填项；若未提供名称，先提示用户补充名称，再继续生成。
- 若用户未提供模板 key：自动生成 kebab-case key（如 `image-style-20260328`）。
- 若用户未提供预览图文件名：使用 `${key}-preview.svg`（或 png/webp）。

## 必须遵守的项目规则

1. 模板文件结构固定为：
- `src/templates/resume/<key>/ResumeTemplate.vue`
- `src/templates/resume/<key>/template.ts`
- `src/assets/templates/resume/<key>-preview.svg`

2. 模板注册必须更新：
- `src/templates/resume/index.ts`
- 需要新增 import，并加入 `RESUME_TEMPLATES` 列表。
- `key` 必须唯一，`name` 和 `previewImage` 不能为空。

3. `template.ts` 必须使用静态资源导入方式（与现有模板保持一致）：
- `import previewImage from '../../../assets/templates/resume/<key>-preview.svg'`
- 禁止使用 `resolveTemplatePreviewImage('../../../assets/templates/resume/<key>-preview.svg', import.meta.url)`，避免 Vite 构建时遗漏静态资源打包。
- 导出 `ResumeTemplateDefinition` 对象，字段仅用 `key/name/previewImage/component`。

4. `ResumeTemplate.vue` 必须复用现有数据来源：
- `useResumeTemplateData()`。
- 必须使用 `moduleOrderStyle` 维持模块顺序。
- 只能使用 `src/stores/resume.ts` 已有字段，不新增数据模型字段。
- 图片中的文案仅作为样式参考，禁止把图片文本当成固定内容写进模板。

5. 模块渲染规则必须兼容当前系统：
- `basicInfo`: `store.isModuleVisible('basicInfo')`
- `education`: `store.isModuleVisible('education') && store.educationList.some((e) => e.school)`
- `skills`: `store.isModuleVisible('skills') && store.skills`
- `workExperience`: `store.isModuleVisible('workExperience') && store.workList.some((w) => w.company)`
- `projectExperience`: `store.isModuleVisible('projectExperience') && store.projectList.some((p) => p.name)`
- `awards`: `store.isModuleVisible('awards') && store.awardList.some((a) => a.name)`
- `selfIntro`: `store.isModuleVisible('selfIntro') && store.selfIntro`
- 空态必须保留：`!hasAnyContent` 时展示提示。

6. 富文本字段规则：
- `skills / selfIntro / work.description / project.introduction / project.mainWork / award.description / education.description` 用 `v-html` 渲染。
- 列表样式需在 `:deep(.entry-rich ...)` 提供基础兼容样式（ul/ol/li/p）。

7. 布局与导出兼容规则：
- 根容器需 `width: 100%`、`min-height: 100%`、`box-sizing: border-box`。
- 避免写死会截断内容的固定高度。
- 设计要适配 A4 预览容器（参考 `PreviewPanel.vue` 的 794 宽画布）。

8. 链接字段规则：
- 若展示 `website/github/blog/link`，链接需支持可点击并带 `target="_blank"` 与 `rel="noopener noreferrer"`。
- 对非完整 URL 建议复用 `toHref` 处理。

9. 预览图（硬性要求）：
- 必须在 `src/assets/templates/resume` 下创建与模板同名风格的 SVG 预览图：`<key>-preview.svg`。
- SVG 必须是“按模板样式排版”的真实预览，不允许空白图、纯占位块、或复用其他模板预览图。
- 建议保持与现有预览一致的画布规格（`800 x 1120`，`viewBox="0 0 800 1120"`），保证模板选择器显示效果稳定。
- SVG 仅允许骨架化图形（rect/circle/path/line 等），禁止放真实文案，禁止使用 `<text>` 节点。
- SVG 中禁止 `font-family`、`font-size` 等字体相关属性。
- `template.ts` 的 `previewImage` 必须通过“静态 import”引用该 SVG 文件。

10. 模块标题与顺序（硬性要求）：
- 简历模板中的分区标题文案必须与编辑区模块名称一致，禁止改名（例如禁止把“个人简介”改成“个人总结/其他”）。
- 标题文案以 `src/stores/resume.ts` 的 `modules` 为唯一来源：
  `教育经历`、`专业技能`、`工作经历`、`项目经历`、`荣誉奖项`、`个人简介`。
- 模块展示顺序必须与编辑区一致：`basicInfo` 固定在首位，其余模块必须通过 `moduleOrderStyle` 跟随编辑区顺序变化。

11. 模块信息完整性（硬性要求）：
- 每个编辑区模块对应的信息不能缺失：凡是 `src/stores/resume.ts` 中该模块已存在且用户已填写的字段，都必须在模板中有对应展示位置。
- 禁止只渲染“部分核心字段”而省略其余字段（例如工作经历不能只显示公司和时间而漏掉岗位/部门/地点等已填信息）。
- `basicInfo`、`education`、`skills`、`workExperience`、`projectExperience`、`awards`、`selfIntro` 七个模块都必须支持完整映射；模块隐藏仅由可见性控制，不得通过删除渲染逻辑实现。

## 执行工作流

### Step 1：读图拆解

- 识别版式骨架：单栏/双栏/侧栏/顶部 Hero。
- 识别视觉 token：主色、辅助色、标题样式、分割线、卡片边框、头像形状。
- 识别信息密度：标题层级、行距、分组间距、模块顺序倾向。
- 不提取图片里的具体姓名、电话、公司名等文案内容。

### Step 2：映射到项目字段

- 将图片中的信息区映射到项目现有模块与字段。
- 禁止引入 store 中不存在的新字段。
- 必须保证“同一份数据”在新模板中可完整呈现。
- 基础信息优先复用 `useResumeTemplateData` 中的 `lineOneMeta / lineTwoMeta / lineThreeMeta` 体系，避免字段缺失。
- 分区标题必须直接使用编辑区对应模块名，不做同义改写。
- 为每个模块建立字段映射清单，逐项核对“已填字段是否都有展示位”后再生成代码。

### Step 3：生成代码文件

- 产出 `ResumeTemplate.vue`、`template.ts`、`src/assets/templates/resume/<key>-preview.svg`。
- 预览图必须按目标模板样式进行 SVG 排版绘制后再接入，不得使用占位图。
- 预览图必须是“骨架 SVG”，不允许真实文字。
- `template.ts` 中的预览图接入必须使用 `import previewImage from ...svg`，禁止 `resolveTemplatePreviewImage + import.meta.url` 写法。
- 保持样式具备可读性与打印稳定性。

### Step 4：注册模板

- 在 `src/templates/resume/index.ts` 完成 import + 注册。
- 不修改已有模板行为，不破坏默认模板回退逻辑。

### Step 5：自检并输出

- 自检是否满足“模块可见性、字段完整性、A4 兼容、空态、链接安全、SVG 预览图真实可用”。
- 额外检查：预览 SVG 中不存在 `<text>` 与字体属性。
- 额外检查：分区标题文案与编辑区模块名完全一致，且顺序与编辑区一致。
- 额外检查：七个模块的已填字段均可在模板中找到对应渲染逻辑，不存在缺失字段。
- 输出变更文件清单与简短说明。

## 输出要求

- 默认直接给出完成后的代码修改，不先输出长篇方案。
- 若图片存在歧义，优先按“可用性与一致性”做最稳妥实现，再在结果里说明假设点。
- 回复语言默认中文。
