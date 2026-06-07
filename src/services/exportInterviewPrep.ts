import MarkdownIt from 'markdown-it'
import type { Chapter, PracticeRecord, Question } from '@/stores/questionBank'
import { buildQuestionReviewInsights } from '@/services/questionInsightService'

type QuestionSourceLabel = {
  bundled: string
  manual: string
  'resume-generated': string
  'project-generated': string
  'interview-review': string
}

const SOURCE_LABELS: QuestionSourceLabel = {
  bundled: '内置题库',
  manual: '手动添加',
  'resume-generated': '简历生成',
  'project-generated': '项目生成',
  'interview-review': '面试复盘',
}

const prepMarkdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})

function difficultyLabel(value: Question['difficulty']): string {
  if (value === 'basic') return '基础'
  if (value === 'advanced') return '高级'
  return '中等'
}

function masteryLabel(value: PracticeRecord['mastery']): string {
  switch (value) {
    case 'practicing':
      return '练过'
    case 'mastered':
      return '熟练'
    case 'weak':
      return '薄弱'
    default:
      return '未练'
  }
}

function sourceLabel(question: Question): string {
  const source = question.source ?? 'manual'
  return SOURCE_LABELS[source] ?? '题库'
}

function formatDateTime(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function formatUpdatedAt(value: number | null): string {
  if (!value) return '未保存'
  return formatDateTime(new Date(value))
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function chapterLabelMap(chapters: Chapter[]): Map<string, string> {
  return new Map(chapters.map((chapter) => [chapter.id, chapter.name]))
}

function hasPracticeContent(record: PracticeRecord | undefined): boolean {
  if (!record) return false
  return (
    record.answer.trim() !== ''
    || record.notes.trim() !== ''
    || record.mastery !== 'unpracticed'
    || record.aiReview !== null
  )
}

export function filterPreparedQuestions(
  questions: Question[],
  practiceRecords: Record<string, PracticeRecord>,
): Question[] {
  return questions.filter((question) => {
    const record = practiceRecords[question.id]
    return question.source !== 'bundled' || hasPracticeContent(record)
  })
}

export interface InterviewPrepExportInput {
  displayName?: string
  scopeLabel?: string
  questions: Question[]
  chapters: Chapter[]
  practiceRecords: Record<string, PracticeRecord>
  generatedAt?: Date
}

export function generateInterviewPrepMarkdown(input: InterviewPrepExportInput): string {
  const displayName = input.displayName?.trim() || '候选人'
  const generatedAt = input.generatedAt ?? new Date()
  const chapterMap = chapterLabelMap(input.chapters)
  const insights = buildQuestionReviewInsights(input.questions, input.practiceRecords)
  const answeredCount = input.questions.filter((question) => input.practiceRecords[question.id]?.answer.trim()).length
  const notedCount = input.questions.filter((question) => input.practiceRecords[question.id]?.notes.trim()).length
  const lines: string[] = []

  lines.push(`# ${displayName}｜面试准备包`, '')
  lines.push(`- 生成时间：${formatDateTime(generatedAt)}`)
  if (input.scopeLabel?.trim()) lines.push(`- 导出范围：${input.scopeLabel.trim()}`)
  lines.push(`- 题目数量：${input.questions.length}`)
  lines.push(`- 已写回答：${answeredCount}`)
  lines.push(`- 已写备注：${notedCount}`)
  lines.push(`- AI 点评：${insights.summary.aiReviewedQuestions}`)
  lines.push(`- 待复习：${insights.summary.reviewCount}`)
  lines.push(`- 薄弱题：${insights.summary.weakCount}`)
  lines.push('')

  lines.push('## 复盘摘要', '')
  if (insights.summary.averageAiScore !== null) {
    lines.push(`- AI 平均分：${insights.summary.averageAiScore}`)
  }
  if (insights.weakTechStacks.length > 0) {
    lines.push(`- 最常卡技术点：${insights.weakTechStacks.map((item) => `${item.label}(${item.count})`).join('、')}`)
  }
  if (insights.weakProjects.length > 0) {
    lines.push(`- 最弱项目：${insights.weakProjects.map((item) => `${item.label}(${item.count})`).join('、')}`)
  }
  if (insights.actionItems.length > 0) {
    lines.push('- 建议下一步：')
    for (const item of insights.actionItems) {
      lines.push(`  - ${item}`)
    }
  }
  lines.push('')

  lines.push('## 题目清单', '')

  for (const question of input.questions) {
    const record = input.practiceRecords[question.id]
    const chapterName = chapterMap.get(question.chapterId) ?? question.chapterId

    lines.push(`### Q${question.number}｜${question.title}`, '')
    lines.push(`- 章节：${chapterName}`)
    lines.push(`- 难度：${difficultyLabel(question.difficulty)}`)
    lines.push(`- 来源：${sourceLabel(question)}`)
    lines.push(`- 标签：${question.labels.length > 0 ? question.labels.join('、') : '无'}`)
    if (question.projectNames?.length) {
      lines.push(`- 项目：${question.projectNames.join('、')}`)
    }
    if (question.techStacks?.length) {
      lines.push(`- 技术栈：${question.techStacks.join('、')}`)
    }
    if (record) {
      lines.push(`- 掌握状态：${masteryLabel(record.mastery)}`)
      lines.push(`- 最近更新：${formatUpdatedAt(record.updatedAt)}`)
    }
    lines.push('')

    lines.push('#### 参考答案', '', question.answer.content.trim() || '（无）', '')

    if (question.answer.followUp.length > 0) {
      lines.push('#### 高频追问', '')
      question.answer.followUp.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.question}`)
        lines.push(`   - 参考方向：${item.answer}`)
      })
      lines.push('')
    }

    if (record?.answer.trim()) {
      lines.push('#### 我的回答', '', record.answer.trim(), '')
    }

    if (record?.notes.trim()) {
      lines.push('#### 练习备注', '', record.notes.trim(), '')
    }

    if (record?.aiReview) {
      lines.push('#### AI 点评', '')
      lines.push(`- 综合：${record.aiReview.overallScore}`)
      lines.push(`- 完整度：${record.aiReview.completenessScore}`)
      lines.push(`- 准确性：${record.aiReview.accuracyScore}`)
      lines.push(`- 深度：${record.aiReview.depthScore}`)
      lines.push(`- 表达：${record.aiReview.deliveryScore}`)
      lines.push(`- 结论：${record.aiReview.summary}`)
      if (record.aiReview.strengths.length > 0) {
        lines.push(`- 优点：${record.aiReview.strengths.join('；')}`)
      }
      if (record.aiReview.improvements.length > 0) {
        lines.push(`- 待补：${record.aiReview.improvements.join('；')}`)
      }
      if (record.aiReview.improvedAnswer.trim()) {
        lines.push('', '#### 优化后回答', '', record.aiReview.improvedAnswer.trim(), '')
      } else {
        lines.push('')
      }
    }

    lines.push('---', '')
  }

  return lines.join('\n').trim() + '\n'
}

export function buildInterviewPrepHtmlDocument(title: string, markdown: string): string {
  const safeTitle = title.trim() || '面试准备包'
  const rendered = prepMarkdownRenderer.render(markdown)

  return `
    <section class="prep-export" data-title="${escapeHtmlAttribute(safeTitle)}">
      <style>
        .prep-export {
          width: 100%;
          box-sizing: border-box;
          padding: 24px 28px;
          background: #ffffff;
          color: #1f2937;
          font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
          line-height: 1.75;
          font-size: 13px;
        }

        .prep-export h1,
        .prep-export h2,
        .prep-export h3,
        .prep-export h4 {
          color: #111827;
          line-height: 1.45;
          margin: 0;
          break-after: avoid-page;
        }

        .prep-export h1 {
          font-size: 24px;
          margin-bottom: 16px;
        }

        .prep-export h2 {
          margin-top: 28px;
          margin-bottom: 12px;
          padding-bottom: 6px;
          font-size: 18px;
          border-bottom: 1px solid #e5e7eb;
        }

        .prep-export h3 {
          margin-top: 24px;
          margin-bottom: 10px;
          font-size: 15px;
        }

        .prep-export h4 {
          margin-top: 18px;
          margin-bottom: 8px;
          font-size: 13px;
        }

        .prep-export p,
        .prep-export ul,
        .prep-export ol,
        .prep-export blockquote {
          margin: 8px 0;
        }

        .prep-export ul,
        .prep-export ol {
          padding-left: 20px;
        }

        .prep-export li {
          margin: 4px 0;
        }

        .prep-export hr {
          border: 0;
          border-top: 1px solid #e5e7eb;
          margin: 24px 0;
        }

        .prep-export strong {
          color: #111827;
        }

        .prep-export code {
          padding: 2px 4px;
          border-radius: 4px;
          background: #f3f4f6;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12px;
        }

        .prep-export pre {
          padding: 12px;
          overflow: hidden;
          border-radius: 8px;
          background: #f9fafb;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .prep-export pre code {
          padding: 0;
          background: transparent;
        }

        .prep-export table {
          width: 100%;
          border-collapse: collapse;
        }

        .prep-export th,
        .prep-export td {
          padding: 8px 10px;
          border: 1px solid #e5e7eb;
          text-align: left;
          vertical-align: top;
        }
      </style>
      ${rendered}
    </section>
  `.trim()
}

export async function downloadInterviewPrepPdf(filename: string, markdown: string, title: string): Promise<void> {
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.style.width = '794px'
  host.style.background = '#ffffff'
  host.style.pointerEvents = 'none'
  host.style.opacity = '0'
  host.innerHTML = buildInterviewPrepHtmlDocument(title, markdown)
  document.body.appendChild(host)

  try {
    const html2pdfModule = await import('html2pdf.js') as unknown as {
      default?: () => {
        set: (options: Record<string, unknown>) => {
          from: (source: HTMLElement) => {
            save: () => Promise<void>
          }
        }
      }
    }
    const html2pdf = html2pdfModule.default
    if (!html2pdf) {
      throw new Error('未能加载 PDF 导出模块')
    }

    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(host)
      .save()
  } finally {
    host.remove()
  }
}
