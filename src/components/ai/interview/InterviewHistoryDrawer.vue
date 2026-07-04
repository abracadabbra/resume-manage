<script setup lang="ts">
import { ref, computed } from 'vue'
import { useInterviewHistoryStore, type InterviewSessionRecord } from '@/stores/interviewHistory'
import { downloadMarkdown } from '@/services/exportMarkdown'
import type { InterviewMode } from '@/services/interviewService'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useResumeStore } from '@/stores/resume'
import { useQuestionBankStore } from '@/stores/questionBank'
import {
  generateInterviewReviewQuestions,
  type InterviewReviewQuestionBatch,
} from '@/services/interviewReviewQuestionService'
import {
  buildQuestionSearchText,
  extractTechStacksFromText,
  matchProjectNamesInText,
} from '@/services/questionMetaService'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const store = useInterviewHistoryStore()
const aiConfig = useAiConfigStore()
const resumeStore = useResumeStore()
const questionBankStore = useQuestionBankStore()

const selectedSessionId = ref<string | null>(null)
const replayIndex = ref(0)
const chartModeFilter = ref<InterviewMode | 'all'>('all')
const listModeFilter = ref<InterviewMode | 'all'>('all')
const compareIds = ref<string[]>([])

const allSessions = computed(() => store.sortedSessions)
const sessions = computed(() => {
  if (listModeFilter.value === 'all') return allSessions.value
  return allSessions.value.filter((s) => s.mode === listModeFilter.value)
})
const selectedSession = computed(() =>
  selectedSessionId.value ? store.getSessionById(selectedSessionId.value) : null,
)

const replayMessage = computed(() => {
  if (!selectedSession.value) return null
  const msgs = selectedSession.value.messages
  if (msgs.length === 0) return null
  const idx = Math.max(0, Math.min(replayIndex.value, msgs.length - 1))
  return msgs[idx]
})

function selectSession(id: string) {
  selectedSessionId.value = id
  replayIndex.value = 0
}

function backToList() {
  selectedSessionId.value = null
  replayIndex.value = 0
}

function prevMessage() {
  replayIndex.value = Math.max(0, replayIndex.value - 1)
}

function nextMessage() {
  if (!selectedSession.value) return
  replayIndex.value = Math.min(selectedSession.value.messages.length - 1, replayIndex.value + 1)
}

function handleDelete(id: string) {
  store.deleteSession(id)
  compareIds.value = compareIds.value.filter((cid) => cid !== id)
  if (selectedSessionId.value === id) {
    backToList()
  }
}

function toggleCompare(id: string) {
  if (compareIds.value.includes(id)) {
    compareIds.value = compareIds.value.filter((cid) => cid !== id)
  } else if (compareIds.value.length < 2) {
    compareIds.value = [...compareIds.value, id]
  } else {
    compareIds.value = [compareIds.value[1]!, id]
  }
}

const compareSessions = computed(() =>
  compareIds.value.map((id) => store.getSessionById(id)).filter(Boolean) as InterviewSessionRecord[],
)

function handleExport(session: InterviewSessionRecord) {
  const md = store.exportSessionMarkdown(session)
  const dateStr = new Date(session.finishedAt).toISOString().slice(0, 10)
  const filename = `interview_${dateStr}_${session.id.slice(-6)}`
  downloadMarkdown(filename, md)
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function modeLabel(mode: string): string {
  return mode === 'candidate' ? '候选人' : '面试官'
}

// ── 阶段 3：成长曲线可视化 ──

const LINE_COLORS = ['#4a90d9', '#e86b5b', '#5aac6c', '#b07cd8']
const LINE_LABELS = ['项目经历', '专业技能', '工作经历', '教育经历']
const CHART_PADDING = 40
const CHART_WIDTH = 520
const CHART_HEIGHT = 260

const timeline = computed(() =>
  chartModeFilter.value === 'all'
    ? store.getScoreTimeline()
    : store.getScoreTimeline(chartModeFilter.value),
)

interface ChartDot {
  cx: number
  cy: number
  color: string
}

interface ChartData {
  lines: Array<{ label: string; color: string; points: string; dim: string }>
  dots: ChartDot[]
  xLabels: string[]
  xPositions: number[]
  yLabels: number[]
  yTicks: Array<{ y: number; value: number }>
}

const chartData = computed<ChartData>(() => {
  const tl = timeline.value
  const empty: ChartData = {
    lines: [],
    dots: [],
    xLabels: [],
    xPositions: [],
    yLabels: [0, 25, 50, 75, 100],
    yTicks: [],
  }
  if (tl.length === 0) return empty

  const drawW = CHART_WIDTH - CHART_PADDING * 2
  const drawH = CHART_HEIGHT - CHART_PADDING * 2
  const fieldKeys = ['projectScore', 'skillScore', 'workScore', 'educationScore'] as const

  const lines: ChartData['lines'] = []
  const dots: ChartDot[] = []

  for (let i = 0; i < fieldKeys.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const key = fieldKeys[i]!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const color = LINE_COLORS[i]!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const label = LINE_LABELS[i]!
    const pts: string[] = []

    for (let j = 0; j < tl.length; j++) {
      const x = CHART_PADDING + (tl.length > 1 ? (j / (tl.length - 1)) * drawW : drawW / 2)
      const item = tl[j]!
      const score = item[key]
      const y = CHART_PADDING + drawH - (score / 100) * drawH
      pts.push(`${x},${y}`)
      dots.push({ cx: x, cy: y, color: color })
    }

    lines.push({
      label,
      color,
      points: pts.join(' '),
      dim: key,
    })
  }

  const xLabels: string[] = tl.map((p) => formatDate(p.finishedAt).split(' ')[0] ?? '')
  const xPositions: number[] = tl.map((_, idx) =>
    tl.length > 1
      ? CHART_PADDING + (idx / (tl.length - 1)) * drawW
      : CHART_PADDING + drawW / 2,
  )

  const yLabels = [0, 25, 50, 75, 100]
  const yTicks = yLabels.map((v, i) => ({
    y: CHART_PADDING + ((4 - i) / 4) * drawH,
    value: v,
  }))

  return { lines, dots, xLabels, xPositions, yLabels, yTicks }
})

// ── 薄弱点追踪 ──

const weakPointAnalysis = computed(() => {
  const tl = timeline.value
  if (tl.length < 1) return { items: [] as Array<{ keyword: string; status: 'persistent' | 'resolved'; sessions: string[] }> }

  const keywordMap = new Map<string, string[]>()
  for (const s of tl) {
    const dateLabel = formatDate(s.finishedAt)
    for (const imp of s.improvements) {
      const words = imp.split(/[,，;；、\s]+/).filter((w) => w.length >= 2)
      for (const w of words) {
        const dates = keywordMap.get(w) || []
        if (!dates.includes(dateLabel)) {
          dates.push(dateLabel)
        }
        keywordMap.set(w, dates)
      }
    }
  }

  const latestDate = formatDate(tl[tl.length - 1]!.finishedAt)
  const items = Array.from(keywordMap.entries())
    .filter(([, dates]) => dates.length >= 1)
    .map(([keyword, dates]) => ({
      keyword,
      status: (dates[dates.length - 1] === latestDate ? 'persistent' : 'resolved') as 'persistent' | 'resolved',
      sessions: dates,
    }))
    .sort((a, b) => b.sessions.length - a.sessions.length)
    .slice(0, 12)

  return { items }
})

// ── 数据导出/导入 ──

function handleExportAll() {
  const json = JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: Date.now(),
      sessions: store.sessions,
    },
    null,
    2,
  )
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `interview_history_${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        if (!Array.isArray(data.sessions)) {
          alert('无效的面试历史文件')
          return
        }
        // 合并导入（避免重复 ID）
        const existingIds = new Set(store.sessions.map((s) => s.id))
        const newSessions = data.sessions.filter((s: { id: string }) => !existingIds.has(s.id))
        if (newSessions.length === 0) {
          alert('没有新记录可导入')
          return
        }
        store.sessions.unshift(...newSessions)
        alert(`已导入 ${newSessions.length} 条面试记录`)
      } catch {
        alert('文件解析失败，请检查格式')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

// ── 薄弱点复习题生成 ──

const isGeneratingQuestions = ref(false)
const generateQuestionError = ref('')
const generateQuestionSuccess = ref('')
const generateQuestionOutput = ref('')
const generateQuestionResult = ref<InterviewReviewQuestionBatch | null>(null)
let generateAbortController: AbortController | null = null

async function handleGenerateWeakPointQuestions(session: InterviewSessionRecord) {
  if (!session.finalEvaluation || isGeneratingQuestions.value) return
  if (!aiConfig.isConfigured) {
    generateQuestionError.value = '请先配置 AI 模型'
    return
  }

  isGeneratingQuestions.value = true
  generateQuestionError.value = ''
  generateQuestionSuccess.value = ''
  generateQuestionResult.value = null
  generateQuestionOutput.value = ''
  generateAbortController = new AbortController()

  const resumeSnapshot = {
    basicInfo: resumeStore.basicInfo,
    skillsText: resumeStore.skills,
    workList: resumeStore.workList,
    projectList: resumeStore.projectList,
    educationList: resumeStore.educationList,
    selfIntro: resumeStore.selfIntro,
  }

  await generateInterviewReviewQuestions(
    {
      finalEvaluation: session.finalEvaluation,
      messages: session.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      resumeSnapshot,
    },
    {
      onChunk(text) {
        generateQuestionOutput.value = text
      },
      onDone(result) {
        generateQuestionResult.value = result
        isGeneratingQuestions.value = false
        generateAbortController = null
      },
      onError(error) {
        generateQuestionError.value = error
        isGeneratingQuestions.value = false
        generateAbortController = null
      },
    },
    generateAbortController.signal,
  )
}

function handleCancelGenerate() {
  generateAbortController?.abort()
  generateAbortController = null
  isGeneratingQuestions.value = false
}

async function handleImportGeneratedQuestions() {
  if (!generateQuestionResult.value) return

  await questionBankStore.ensureBundledQuestionsLoaded()
  if (questionBankStore.loadError) {
    generateQuestionError.value = questionBankStore.loadError
    return
  }

  const projectNames = resumeStore.projectList
    .map((item) => item.name.trim())
    .filter(Boolean)

  const imported = questionBankStore.addQuestions(
    generateQuestionResult.value.questions.map((item) => {
      const searchText = buildQuestionSearchText(item)
      return {
        chapterId: item.chapterId,
        title: item.title,
        difficulty: item.difficulty,
        labels: item.labels,
        source: 'interview-review' as const,
        projectNames: matchProjectNamesInText(searchText, projectNames),
        techStacks: extractTechStacksFromText(searchText),
        answer: item.answer,
      }
    }),
  )

  imported.forEach((item) => {
    questionBankStore.setPracticeMastery(item.id, 'weak')
  })

  generateQuestionSuccess.value = `已导入 ${imported.length} 道薄弱点复习题，打开题库继续练习。`
  generateQuestionError.value = ''
  generateQuestionOutput.value = ''
  generateQuestionResult.value = null
}

function resetQuestionGenState() {
  generateAbortController?.abort()
  generateAbortController = null
  isGeneratingQuestions.value = false
  generateQuestionError.value = ''
  generateQuestionSuccess.value = ''
  generateQuestionOutput.value = ''
  generateQuestionResult.value = null
}
</script>

<template>
  <div class="drawer-overlay" @click.self="emit('close')">
    <aside class="history-drawer">
      <header class="drawer-header">
        <h2 class="drawer-title">面试成长档案</h2>
        <div class="header-actions">
          <button v-if="allSessions.length > 0" class="header-btn" title="导出全部" @click="handleExportAll">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            导出
          </button>
          <button class="header-btn" title="导入备份" @click="handleImport">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            导入
          </button>
          <button class="close-btn" @click="emit('close')">✕</button>
        </div>
      </header>

      <!-- 列表视图 -->
      <section v-if="!selectedSessionId" class="drawer-body">
        <!-- 成长曲线图表 -->
        <div v-if="store.getScoreTimeline().length >= 2" class="chart-card">
          <div class="chart-header-row">
            <h3 class="chart-title">📈 评分趋势</h3>
            <div class="chart-mode-tabs">
              <button
                class="mode-tab" :class="{ active: chartModeFilter === 'all' }"
                @click="chartModeFilter = 'all'"
              >全部</button>
              <button
                class="mode-tab" :class="{ active: chartModeFilter === 'candidate' }"
                @click="chartModeFilter = 'candidate'"
              >候选人</button>
              <button
                class="mode-tab" :class="{ active: chartModeFilter === 'interviewer' }"
                @click="chartModeFilter = 'interviewer'"
              >面试官</button>
            </div>
          </div>
          <div v-if="timeline.length < 2" class="chart-empty-tip">
            当前筛选模式下至少需要 2 次面试才能显示趋势图
          </div>
          <template v-else>
          <svg
            :width="CHART_WIDTH"
            :height="CHART_HEIGHT"
            :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
            class="chart-svg"
          >
            <!-- Y轴网格线 -->
            <line
              v-for="tick in chartData.yTicks" :key="'grid-' + tick.value"
              :x1="CHART_PADDING" :x2="CHART_WIDTH - CHART_PADDING"
              :y1="tick.y" :y2="tick.y"
              stroke="#e4d8cb" stroke-width="0.5"
            />
            <!-- Y轴标签 -->
            <text
              v-for="tick in chartData.yTicks" :key="'yl-' + tick.value"
              :x="CHART_PADDING - 8" :y="tick.y + 4"
              text-anchor="end" font-size="10" fill="#8a7461"
            >{{ tick.value }}</text>
            <!-- X轴标签 -->
            <text
              v-for="(label, i) in chartData.xLabels" :key="'xl-' + i"
              :x="chartData.xPositions[i]"
              :y="CHART_HEIGHT - CHART_PADDING + 16"
              text-anchor="middle" font-size="9" fill="#8a7461"
            >{{ label }}</text>
            <!-- 折线 -->
            <polyline
              v-for="line in chartData.lines" :key="line.dim"
              :points="line.points"
              fill="none" :stroke="line.color" stroke-width="2"
              stroke-linejoin="round"
            />
            <!-- 数据点 -->
            <circle
              v-for="(dot, di) in chartData.dots" :key="'dot-' + di"
              :cx="dot.cx" :cy="dot.cy"
              r="3" :fill="dot.color"
            />
          </svg>
          <!-- 图例 -->
          <div class="chart-legend">
            <span v-for="line in chartData.lines" :key="line.dim" class="legend-item">
              <span class="legend-dot" :style="{ background: line.color }" />
              {{ line.label }}
            </span>
          </div>
          </template>
        </div>

        <!-- 薄弱点追踪 -->
        <div v-if="weakPointAnalysis.items.length > 0" class="weakpoint-card">
          <h3 class="chart-title">🎯 薄弱点追踪</h3>
          <div class="weakpoint-grid">
            <span
              v-for="item in weakPointAnalysis.items" :key="item.keyword"
              class="weakpoint-tag"
              :class="item.status"
              :title="`出现于: ${item.sessions.join(', ')}`"
            >
              {{ item.keyword }}
              <span class="tag-count">{{ item.sessions.length }}</span>
            </span>
          </div>
          <p class="weakpoint-legend">
            <span class="dot persistent" /> 持续薄弱 &nbsp;
            <span class="dot resolved" /> 已改善
          </p>
        </div>

        <!-- 面试对比 --> 
        <div v-if="compareIds.length > 0" class="compare-bar">
          <span>已选 {{ compareIds.length }}/2 条</span>
          <button v-if="compareIds.length === 2" class="action-sm primary" @click="compareIds = []">
            取消对比
          </button>
        </div>
        <div v-if="compareSessions.length === 2" class="compare-card">
          <div class="compare-col" v-for="s in compareSessions" :key="s.id">
            <p class="compare-date">{{ formatDate(s.finishedAt) }} · {{ modeLabel(s.mode) }}</p>
            <p v-if="s.finalEvaluation" class="compare-score" :class="{ pass: s.finalEvaluation.passed }">
              {{ s.finalEvaluation.totalScore }}
            </p>
            <div v-if="s.finalEvaluation" class="compare-dims">
              <div class="compare-dim"><span>项目</span><span>{{ s.finalEvaluation.projectScore }}</span></div>
              <div class="compare-dim"><span>技能</span><span>{{ s.finalEvaluation.skillScore }}</span></div>
              <div class="compare-dim"><span>工作</span><span>{{ s.finalEvaluation.workScore }}</span></div>
              <div class="compare-dim"><span>教育</span><span>{{ s.finalEvaluation.educationScore }}</span></div>
            </div>
          </div>
        </div>

        <!-- 历史列表 --> 
        <div class="list-header-row">
          <h3 v-if="allSessions.length > 0" class="section-title">面试历史</h3>
          <div class="list-mode-tabs" v-if="allSessions.length > 0">
            <button class="mode-tab" :class="{ active: listModeFilter === 'all' }" @click="listModeFilter = 'all'">全部</button>
            <button class="mode-tab" :class="{ active: listModeFilter === 'candidate' }" @click="listModeFilter = 'candidate'">候选人</button>
            <button class="mode-tab" :class="{ active: listModeFilter === 'interviewer' }" @click="listModeFilter = 'interviewer'">面试官</button>
          </div>
        </div>
        <p v-if="allSessions.length === 0" class="empty-text">
          暂无面试记录，完成一场面试后会自动保存。
        </p>

        <div
          v-for="session in sessions" :key="session.id"
          class="session-card"
        >
          <div class="session-meta">
            <label class="compare-check" @click.stop="toggleCompare(session.id)">
              <input type="checkbox" :checked="compareIds.includes(session.id)" />
              <span class="check-label">对比</span>
            </label>
            <span class="session-date" @click="selectSession(session.id)">{{ formatDate(session.finishedAt) }}</span>
            <span class="session-mode">{{ modeLabel(session.mode) }}</span>
            <span
              v-if="session.finalEvaluation"
              class="session-score"
              :class="{ pass: session.finalEvaluation.passed }"
            >
              {{ session.finalEvaluation.totalScore }}
            </span>
            <span class="session-duration">{{ session.durationMinutes }}min</span>
          </div>
          <p v-if="session.finalEvaluation" class="session-summary" @click="selectSession(session.id)">
            {{ session.finalEvaluation.summary.slice(0, 80)
            }}{{ session.finalEvaluation.summary.length > 80 ? '…' : '' }}
          </p>
        </div>
      </section>

      <!-- 回放视图 -->
      <section v-else class="drawer-body replay-view">
        <button class="back-btn" @click="backToList">← 返回列表</button>
        <div class="replay-header">
          <span>{{ formatDate(selectedSession!.finishedAt) }} · {{ modeLabel(selectedSession!.mode) }}</span>
          <div class="replay-actions">
            <button class="action-sm" @click="handleDelete(selectedSession!.id)">删除</button>
            <button class="action-sm primary" @click="handleExport(selectedSession!)">导出 MD</button>
          </div>
        </div>

        <div
          v-if="selectedSession!.finalEvaluation"
          class="final-banner-mini"
          :class="{ pass: selectedSession!.finalEvaluation!.passed }"
        >
          综合 {{ selectedSession!.finalEvaluation!.totalScore }} ·
          项目 {{ selectedSession!.finalEvaluation!.projectScore }} /
          技能 {{ selectedSession!.finalEvaluation!.skillScore }} /
          工作 {{ selectedSession!.finalEvaluation!.workScore }} /
          教育 {{ selectedSession!.finalEvaluation!.educationScore }}
        </div>

        <!-- 薄弱点复习题生成 -->
        <div v-if="selectedSession!.finalEvaluation" class="gen-question-section">
          <template v-if="!generateQuestionResult && !isGeneratingQuestions && !generateQuestionSuccess">
            <button
              class="gen-question-btn"
              :disabled="!aiConfig.isConfigured"
              @click="handleGenerateWeakPointQuestions(selectedSession!)"
            >
              基于薄弱点生成复习题
            </button>
            <p v-if="!aiConfig.isConfigured" class="gen-hint">请先配置 AI 模型</p>
          </template>

          <template v-if="isGeneratingQuestions">
            <div class="gen-loading">
              <span>AI 正在生成复习题...</span>
              <button class="action-sm" @click="handleCancelGenerate">取消</button>
            </div>
            <p v-if="generateQuestionOutput" class="gen-output">{{ generateQuestionOutput.slice(0, 200) }}{{ generateQuestionOutput.length > 200 ? '...' : '' }}</p>
          </template>

          <p v-if="generateQuestionError" class="gen-error">{{ generateQuestionError }}</p>
          <p v-if="generateQuestionSuccess" class="gen-success">{{ generateQuestionSuccess }}</p>

          <div v-if="generateQuestionResult" class="gen-result">
            <p class="gen-result-title">{{ generateQuestionResult.summary }}</p>
            <div v-for="(q, i) in generateQuestionResult.questions" :key="i" class="gen-item">
              <span class="gen-index">{{ i + 1 }}.</span>
              <span>{{ q.title }}</span>
            </div>
            <button class="action-sm primary" @click="handleImportGeneratedQuestions">
              导入题库（标为薄弱）
            </button>
          </div>
        </div>

        <div v-if="replayMessage" class="replay-card">
          <p class="replay-role">
            {{
              replayMessage.role === 'user'
                ? '你'
                : selectedSession!.mode === 'candidate'
                  ? 'AI 面试官'
                  : 'AI 候选人'
            }}
          </p>
          <p class="replay-content">{{ replayMessage.content }}</p>
          <p v-if="replayMessage.score" class="replay-score">
            本轮评分 {{ replayMessage.score.score }} · {{ replayMessage.score.comment }}
          </p>
        </div>

        <div v-if="selectedSession!.messages.length > 0" class="replay-nav">
          <button :disabled="replayIndex === 0" @click="prevMessage">上一条</button>
          <span>{{ replayIndex + 1 }} / {{ selectedSession!.messages.length }}</span>
          <button
            :disabled="replayIndex >= selectedSession!.messages.length - 1"
            @click="nextMessage"
          >
            下一条
          </button>
        </div>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(29, 22, 17, 0.4);
  z-index: 200;
  display: flex;
  justify-content: flex-end;
}

.history-drawer {
  width: 480px;
  max-width: 90vw;
  height: 100%;
  background: #fff;
  border-left: 1px solid #e4d8cb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e4d8cb;
}

.drawer-title {
  font-size: 15px;
  font-weight: 700;
  color: #2d2521;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 1px solid #dfd2c2;
  border-radius: 6px;
  background: #f7f3ee;
  color: #5f5448;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  cursor: pointer;
}
.header-btn:hover {
  background: #efe7de;
}

.close-btn {
  border: none;
  background: none;
  font-size: 16px;
  color: #8a7461;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.close-btn:hover {
  background: #f7f3ee;
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 图表卡片 */
.chart-card,
.weakpoint-card {
  border: 1px solid #e4d8cb;
  border-radius: 10px;
  padding: 12px;
  background: #fcfaf7;
}

.chart-title {
  font-size: 13px;
  font-weight: 700;
  color: #2d2521;
  margin-bottom: 8px;
}
.chart-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.chart-header-row .chart-title {
  margin-bottom: 0;
}
.chart-mode-tabs,
.list-mode-tabs {
  display: flex;
  gap: 2px;
}
.mode-tab {
  border: 1px solid #e4d8cb;
  background: #f7f3ee;
  color: #8a7461;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.mode-tab.active {
  background: #1f1c17;
  color: #fff;
  border-color: #1f1c17;
}
.chart-empty-tip {
  font-size: 11px;
  color: #b74a30;
  text-align: center;
  padding: 8px 0;
}

.list-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}
.list-header-row .section-title {
  margin-top: 0;
}

/* 对比条 */
.compare-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #5f5448;
  font-weight: 600;
  padding: 6px 10px;
  background: #eaf2ff;
  border-radius: 8px;
}
.compare-card {
  display: flex;
  gap: 8px;
}
.compare-col {
  flex: 1;
  border: 1px solid #e4d8cb;
  border-radius: 10px;
  padding: 10px;
  background: #fcfaf7;
}
.compare-date {
  font-size: 11px;
  font-weight: 600;
  color: #2d2521;
  margin-bottom: 4px;
}
.compare-score {
  font-size: 20px;
  font-weight: 700;
  color: #b74a30;
  margin-bottom: 6px;
}
.compare-score.pass {
  color: #2b7a45;
}
.compare-dims {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.compare-dim {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #5f5448;
}
.compare-dim span:last-child {
  font-weight: 700;
}

/* 对比复选框 */
.compare-check {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
}
.compare-check input {
  width: 14px;
  height: 14px;
  accent-color: #4a90d9;
  cursor: pointer;
}
.check-label {
  font-size: 10px;
  color: #8a7461;
  font-weight: 600;
}

.chart-svg {
  display: block;
  width: 100%;
  height: auto;
}

.chart-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.legend-item {
  font-size: 11px;
  color: #5f5448;
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

/* 薄弱点 */
.weakpoint-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.weakpoint-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.weakpoint-tag.persistent {
  background: #ffe8e5;
  color: #b74a30;
  border: 1px solid #f0c7c0;
}

.weakpoint-tag.resolved {
  background: #e3f5e8;
  color: #2b7a45;
  border: 1px solid #bce0c8;
}

.tag-count {
  font-size: 10px;
  opacity: 0.7;
}

.weakpoint-legend {
  font-size: 11px;
  color: #8a7461;
  display: flex;
  gap: 12px;
}

.weakpoint-legend .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 2px;
}
.weakpoint-legend .dot.persistent {
  background: #d95645;
}
.weakpoint-legend .dot.resolved {
  background: #4aac5c;
}

/* 列表 */
.section-title {
  font-size: 13px;
  font-weight: 700;
  color: #2d2521;
  margin-top: 4px;
}

.empty-text {
  color: #8a7461;
  font-size: 12px;
  text-align: center;
  padding: 24px 0;
}

.session-card {
  border: 1px solid #e4d8cb;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fcfaf7;
  cursor: pointer;
  transition: border-color 0.15s;
}
.session-card:hover {
  border-color: #d97745;
}

.session-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.session-date {
  font-size: 12px;
  font-weight: 600;
  color: #2d2521;
}

.session-mode {
  font-size: 11px;
  color: #8a7461;
  background: #f0ece6;
  padding: 2px 8px;
  border-radius: 8px;
}

.session-score {
  font-size: 12px;
  font-weight: 700;
  color: #b74a30;
  background: #fff1ec;
  padding: 2px 8px;
  border-radius: 8px;
}
.session-score.pass {
  color: #2b7a45;
  background: #eaf7ed;
}

.session-duration {
  font-size: 11px;
  color: #8a7461;
  margin-left: auto;
}

.session-summary {
  font-size: 12px;
  color: #5f5448;
  margin-top: 4px;
  line-height: 1.4;
}

/* 回放 */
.replay-view {
  gap: 8px;
}

.back-btn {
  align-self: flex-start;
  border: 1px solid #dfd2c2;
  border-radius: 8px;
  background: #f7f3ee;
  color: #5f5448;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  cursor: pointer;
}

.replay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #5f5448;
  font-weight: 600;
}

.replay-actions {
  display: flex;
  gap: 6px;
}

.action-sm {
  border: 1px solid #dfd2c2;
  border-radius: 6px;
  background: #fff;
  color: #5f5448;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  cursor: pointer;
}
.action-sm.primary {
  background: #1f1c17;
  color: #fff;
  border-color: #1f1c17;
}

.final-banner-mini {
  border-radius: 8px;
  border: 1px solid #f0d2c8;
  background: #fff1ec;
  color: #b74a30;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 8px;
}
.final-banner-mini.pass {
  border-color: #c8e6cf;
  background: #eef8f1;
  color: #2b7a45;
}

.replay-card {
  border: 1px solid #e4d8cb;
  border-radius: 10px;
  padding: 10px;
  background: #fcfaf7;
  flex: 1;
  overflow-y: auto;
  min-height: 120px;
}

.replay-role {
  font-size: 11px;
  font-weight: 700;
  color: #8a7461;
  margin-bottom: 6px;
}

.replay-content {
  font-size: 13px;
  color: #2d2521;
  white-space: pre-wrap;
  line-height: 1.55;
}

.replay-score {
  font-size: 11px;
  font-weight: 600;
  color: #315f9a;
  background: #eaf2ff;
  border-radius: 6px;
  padding: 4px 6px;
  margin-top: 8px;
}

.replay-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 12px;
  color: #5f5448;
}
.replay-nav button {
  border: 1px solid #dfd2c2;
  border-radius: 6px;
  background: #fff;
  color: #5f5448;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 12px;
  cursor: pointer;
}
.replay-nav button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 薄弱点复习题生成 */
.gen-question-section {
  border: 1px solid #e4d8cb;
  border-radius: 10px;
  padding: 10px;
  background: #fdf8f3;
}
.gen-question-btn {
  width: 100%;
  border: 1px solid #d97745;
  border-radius: 8px;
  background: #fff;
  color: #d97745;
  font-size: 12px;
  font-weight: 700;
  padding: 8px;
  cursor: pointer;
}
.gen-question-btn:hover {
  background: #d97745;
  color: #fff;
}
.gen-question-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.gen-hint {
  font-size: 11px;
  color: #8a7461;
  margin-top: 4px;
}
.gen-loading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #5f5448;
  font-weight: 600;
}
.gen-output {
  font-size: 11px;
  color: #8a7461;
  margin-top: 4px;
  line-height: 1.4;
}
.gen-error {
  font-size: 12px;
  color: #b74a30;
  font-weight: 600;
}
.gen-success {
  font-size: 12px;
  color: #2b7a45;
  font-weight: 600;
}
.gen-result {
  margin-top: 8px;
}
.gen-result-title {
  font-size: 11px;
  color: #8a7461;
  margin-bottom: 6px;
}
.gen-item {
  font-size: 12px;
  color: #2d2521;
  padding: 4px 0;
  display: flex;
  gap: 4px;
}
.gen-index {
  color: #d97745;
  font-weight: 700;
  flex-shrink: 0;
}
.gen-result .action-sm {
  margin-top: 8px;
  display: inline-flex;
}
</style>
