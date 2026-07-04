<script setup lang="ts">
import { computed } from 'vue'
import { useResumeStore } from '@/stores/resume'
import {
  buildSkillRadarData,
  getRadarLevel,
  getRadarLevelLabel,
} from '@/services/skillRadarService'

const resumeStore = useResumeStore()

const radarData = computed(() =>
  buildSkillRadarData(
    resumeStore.skills,
    resumeStore.workList,
    resumeStore.projectList,
    resumeStore.selfIntro,
  ),
)

// SVG 配置
const SIZE = 280
const CENTER = SIZE / 2
const MAX_RADIUS = 100
const RING_COUNT = 5
const LABEL_OFFSET = 22

const dimensionCount = computed(() => radarData.value.dimensions.length)

// 计算每个维度的角度（弧度）
function getAngle(index: number, total: number): number {
  // 起始角度 -90 度（顶部），顺时针
  return (Math.PI * 2 * index) / total - Math.PI / 2
}

// 计算维度顶点坐标（按分数）
function getVertex(index: number, total: number, score: number): { x: number; y: number } {
  const angle = getAngle(index, total)
  const radius = (Math.max(0, Math.min(100, score)) / 100) * MAX_RADIUS
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  }
}

// 计算环线顶点（用于背景网格）
function getRingVertex(index: number, total: number, ringRatio: number): { x: number; y: number } {
  const angle = getAngle(index, total)
  const radius = MAX_RADIUS * ringRatio
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  }
}

// 计算标签位置（在雷达图外侧）
function getLabelPosition(index: number, total: number): { x: number; y: number } {
  const angle = getAngle(index, total)
  const radius = MAX_RADIUS + LABEL_OFFSET
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  }
}

const dataPolygon = computed(() => {
  const dims = radarData.value.dimensions
  if (dims.length === 0) return ''
  return dims
    .map((dim, idx) => {
      const v = getVertex(idx, dims.length, dim.score)
      return `${v.x},${v.y}`
    })
    .join(' ')
})

const rings = computed(() => {
  const dims = radarData.value.dimensions
  const result: string[] = []
  for (let r = 1; r <= RING_COUNT; r++) {
    const ratio = r / RING_COUNT
    const points = dims
      .map((_, idx) => {
        const v = getRingVertex(idx, dims.length, ratio)
        return `${v.x},${v.y}`
      })
      .join(' ')
    result.push(points)
  }
  return result
})

const axisLines = computed(() => {
  const dims = radarData.value.dimensions
  return dims.map((_, idx) => {
    const v = getRingVertex(idx, dims.length, 1)
    return { x1: CENTER, y1: CENTER, x2: v.x, y2: v.y }
  })
})

const labelPositions = computed(() => {
  const dims = radarData.value.dimensions
  return dims.map((dim, idx) => {
    const pos = getLabelPosition(idx, dims.length)
    return {
      ...pos,
      name: dim.name,
      score: dim.score,
      level: getRadarLevel(dim.score),
      levelLabel: getRadarLevelLabel(dim.score),
      keywords: dim.keywords,
    }
  })
})

const hasData = computed(() => radarData.value.totalKeywords > 0)
</script>

<template>
  <div class="skill-radar">
    <div class="radar-header">
      <h3 class="radar-title">技能雷达图</h3>
      <p class="radar-desc">
        {{ hasData
          ? `共识别 ${radarData.totalKeywords} 个技术关键词`
          : '请先在简历中填写技能或项目经历' }}
      </p>
    </div>

    <div v-if="hasData" class="radar-content">
      <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" class="radar-svg" :width="SIZE" :height="SIZE">
        <!-- 背景环线 -->
        <polygon
          v-for="(points, idx) in rings"
          :key="`ring-${idx}`"
          :points="points"
          class="radar-ring"
        />

        <!-- 轴线 -->
        <line
          v-for="(line, idx) in axisLines"
          :key="`axis-${idx}`"
          :x1="line.x1"
          :y1="line.y1"
          :x2="line.x2"
          :y2="line.y2"
          class="radar-axis"
        />

        <!-- 数据多边形 -->
        <polygon
          :points="dataPolygon"
          class="radar-data"
        />

        <!-- 数据点 -->
        <circle
          v-for="(dim, idx) in radarData.dimensions"
          :key="`point-${idx}`"
          :cx="getVertex(idx, dimensionCount, dim.score).x"
          :cy="getVertex(idx, dimensionCount, dim.score).y"
          r="3"
          class="radar-point"
        />

        <!-- 标签 -->
        <text
          v-for="(label, idx) in labelPositions"
          :key="`label-${idx}`"
          :x="label.x"
          :y="label.y"
          class="radar-label"
          :class="`level-${label.level}`"
          text-anchor="middle"
          dominant-baseline="middle"
        >
          {{ label.name }} {{ label.score }}
        </text>
      </svg>

      <div class="dimension-list">
        <div
          v-for="(dim, idx) in radarData.dimensions"
          :key="`dim-${idx}`"
          class="dim-row"
          :class="`level-${getRadarLevel(dim.score)}`"
        >
          <div class="dim-head">
            <span class="dim-name">{{ dim.name }}</span>
            <span class="dim-meta">
              {{ dim.score }} 分 · {{ getRadarLevelLabel(dim.score) }}
            </span>
          </div>
          <div v-if="dim.keywords.length" class="dim-keywords">
            <span
              v-for="(kw, kIdx) in dim.keywords"
              :key="`kw-${idx}-${kIdx}`"
              class="keyword-chip"
            >
              {{ kw }}
            </span>
          </div>
          <div v-else class="dim-empty">未识别到相关关键词</div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>填写技能、工作或项目经历后，将自动生成雷达图。</p>
    </div>
  </div>
</template>

<style scoped>
.skill-radar {
  border: 1px solid #e8e0d5;
  border-radius: 10px;
  background: #fff;
  padding: 14px;
}

.radar-header {
  margin-bottom: 12px;
}

.radar-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
}

.radar-desc {
  margin: 6px 0 0;
  font-size: 12px;
  color: #7b6a5b;
}

.radar-content {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.radar-svg {
  flex-shrink: 0;
}

.radar-ring {
  fill: none;
  stroke: #eadfd2;
  stroke-width: 1;
}

.radar-axis {
  stroke: #eadfd2;
  stroke-width: 1;
}

.radar-data {
  fill: rgba(217, 119, 69, 0.18);
  stroke: #d97745;
  stroke-width: 2;
  stroke-linejoin: round;
}

.radar-point {
  fill: #d97745;
}

.radar-label {
  font-size: 11px;
  font-weight: 600;
  fill: #2d2521;
}

.radar-label.level-strong {
  fill: #2b7a45;
}

.radar-label.level-medium {
  fill: #b27d12;
}

.radar-label.level-weak {
  fill: #b74a30;
}

.radar-label.level-none {
  fill: #a08c7b;
}

.dimension-list {
  flex: 1;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dim-row {
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #faf8f5;
  padding: 8px 10px;
}

.dim-row.level-strong {
  border-color: #c8e6cf;
  background: #eef8f1;
}

.dim-row.level-medium {
  border-color: #f0e0c8;
  background: #fffaef;
}

.dim-row.level-weak {
  border-color: #f0d2c8;
  background: #fff5f1;
}

.dim-row.level-none {
  opacity: 0.7;
}

.dim-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.dim-name {
  font-size: 12px;
  font-weight: 700;
  color: #2d2521;
}

.dim-meta {
  font-size: 11px;
  color: #6a5748;
}

.dim-row.level-strong .dim-meta {
  color: #2b7a45;
}

.dim-row.level-medium .dim-meta {
  color: #b27d12;
}

.dim-row.level-weak .dim-meta {
  color: #b74a30;
}

.dim-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.keyword-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  background: #fff;
  border: 1px solid #e1d7ca;
  font-size: 10px;
  color: #6a5748;
}

.dim-empty {
  font-size: 11px;
  color: #a08c7b;
  font-style: italic;
}

.empty-state {
  padding: 30px 16px;
  text-align: center;
  font-size: 12px;
  color: #8a7461;
  background: #faf8f5;
  border-radius: 8px;
  border: 1px dashed #e1d7ca;
}
</style>
