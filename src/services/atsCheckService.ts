import { stripHtml } from '@/services/htmlUtils'
import type {
  AwardEntry,
  BasicInfo,
  EducationEntry,
  ProjectEntry,
  WorkEntry,
} from '@/stores/resume'

/**
 * ATS（求职者追踪系统）友好度检测
 *
 * 检测简历是否符合 ATS 机器解析规范：
 * - 联系方式格式
 * - 关键字段完整性
 * - 时间格式规范性
 * - 内容可解析性（HTML 是否过于复杂）
 *
 * 纯本地规则校验，不调用 AI。
 */

export type AtsIssueSeverity = 'critical' | 'warning' | 'info'

export interface AtsIssue {
  severity: AtsIssueSeverity
  category: string
  field?: string
  problem: string
  suggestion: string
}

export interface AtsCheckResult {
  overallScore: number
  passedCount: number
  warningCount: number
  criticalCount: number
  issues: AtsIssue[]
  summary: string
}

export interface AtsCheckInput {
  basicInfo: BasicInfo
  educationList: EducationEntry[]
  workList: WorkEntry[]
  projectList: ProjectEntry[]
  awardList: AwardEntry[]
  skills: string
  selfIntro: string
}

// 中国手机号：1 开头，第二位 3-9，共 11 位
const PHONE_REGEX = /^1[3-9]\d{9}$/
// 邮箱
const EMAIL_REGEX = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/
// 日期格式 YYYY-MM 或 YYYY-MM-DD 或 YYYY.MM 或文字描述
const DATE_FORMAT_REGEX = /^\d{4}[-./]\d{1,2}(-\d{1,2})?$|^\d{4}[-./]\d{1,2}$|^(至今|现在|present|current)$/i

function hasContent(text: string | undefined | null): boolean {
  if (!text) return false
  return stripHtml(String(text)).trim().length > 0
}

function checkPhone(phone: string): AtsIssue | null {
  const trimmed = phone.trim()
  if (!trimmed) {
    return {
      severity: 'critical',
      category: '联系方式',
      field: 'phone',
      problem: '手机号为空',
      suggestion: 'ATS 系统会优先解析手机号，必须填写',
    }
  }
  const digits = trimmed.replace(/\D/g, '')
  if (!PHONE_REGEX.test(digits)) {
    return {
      severity: 'critical',
      category: '联系方式',
      field: 'phone',
      problem: `手机号格式不规范：${trimmed}`,
      suggestion: '使用 11 位手机号格式，如 13800138000',
    }
  }
  return null
}

function checkEmail(email: string): AtsIssue | null {
  const trimmed = email.trim()
  if (!trimmed) return null
  if (!EMAIL_REGEX.test(trimmed)) {
    return {
      severity: 'warning',
      category: '联系方式',
      field: 'email',
      problem: `邮箱格式不规范：${trimmed}`,
      suggestion: '使用标准邮箱格式，如 user@example.com',
    }
  }
  return null
}

function checkBasicInfo(basicInfo: BasicInfo): AtsIssue[] {
  const issues: AtsIssue[] = []

  if (!basicInfo.name.trim()) {
    issues.push({
      severity: 'critical',
      category: '基本信息',
      field: 'name',
      problem: '姓名为空',
      suggestion: 'ATS 系统必须能解析到姓名',
    })
  }

  if (!basicInfo.jobTitle.trim()) {
    issues.push({
      severity: 'warning',
      category: '基本信息',
      field: 'jobTitle',
      problem: '求职岗位为空',
      suggestion: '明确求职岗位，便于 ATS 分类',
    })
  }

  if (!basicInfo.workYears.trim()) {
    issues.push({
      severity: 'info',
      category: '基本信息',
      field: 'workYears',
      problem: '工作年限为空',
      suggestion: '补充工作年限，便于 HR 筛选',
    })
  }

  if (!basicInfo.educationLevel.trim()) {
    issues.push({
      severity: 'info',
      category: '基本信息',
      field: 'educationLevel',
      problem: '最高学历为空',
      suggestion: '补充最高学历，ATS 常按学历筛选',
    })
  }

  const phoneIssue = checkPhone(basicInfo.phone)
  if (phoneIssue) issues.push(phoneIssue)

  const emailIssue = checkEmail(basicInfo.email)
  if (emailIssue) issues.push(emailIssue)

  return issues
}

function checkDateRange(
  startDate: string,
  endDate: string,
  category: string,
  fieldPrefix: string,
): AtsIssue[] {
  const issues: AtsIssue[] = []
  if (!startDate.trim() && !endDate.trim()) return issues

  if (startDate.trim() && !DATE_FORMAT_REGEX.test(startDate.trim())) {
    issues.push({
      severity: 'warning',
      category,
      field: `${fieldPrefix}.startDate`,
      problem: `开始时间格式不规范：${startDate}`,
      suggestion: '使用 YYYY-MM 或 YYYY.MM 格式，或"至今"',
    })
  }
  if (endDate.trim() && !DATE_FORMAT_REGEX.test(endDate.trim())) {
    issues.push({
      severity: 'warning',
      category,
      field: `${fieldPrefix}.endDate`,
      problem: `结束时间格式不规范：${endDate}`,
      suggestion: '使用 YYYY-MM 或 YYYY.MM 格式，或"至今"',
    })
  }
  return issues
}

function checkEducationList(list: EducationEntry[]): AtsIssue[] {
  const issues: AtsIssue[] = []
  if (list.length === 0) {
    issues.push({
      severity: 'warning',
      category: '教育经历',
      problem: '教育经历为空',
      suggestion: 'ATS 通常要求至少一条教育经历',
    })
    return issues
  }

  list.forEach((item, idx) => {
    if (!item.school.trim()) {
      issues.push({
        severity: idx === 0 ? 'warning' : 'info',
        category: '教育经历',
        field: `educationList[${idx}].school`,
        problem: `第 ${idx + 1} 条教育经历缺少学校名称`,
        suggestion: '补充学校名称',
      })
    }
    if (!item.major.trim()) {
      issues.push({
        severity: 'info',
        category: '教育经历',
        field: `educationList[${idx}].major`,
        problem: `第 ${idx + 1} 条教育经历缺少专业`,
        suggestion: '补充专业，便于 ATS 按专业筛选',
      })
    }
    if (!item.degree.trim()) {
      issues.push({
        severity: 'info',
        category: '教育经历',
        field: `educationList[${idx}].degree`,
        problem: `第 ${idx + 1} 条教育经历缺少学位`,
        suggestion: '补充学位（如本科/硕士）',
      })
    }
    issues.push(...checkDateRange(item.startDate, item.endDate, '教育经历', `educationList[${idx}]`))
  })

  return issues
}

function checkWorkList(list: WorkEntry[]): AtsIssue[] {
  const issues: AtsIssue[] = []
  if (list.length === 0) return issues

  list.forEach((item, idx) => {
    if (!item.company.trim()) {
      issues.push({
        severity: 'warning',
        category: '工作经历',
        field: `workList[${idx}].company`,
        problem: `第 ${idx + 1} 条工作经历缺少公司名称`,
        suggestion: '补充公司名称',
      })
    }
    if (!item.position.trim()) {
      issues.push({
        severity: 'info',
        category: '工作经历',
        field: `workList[${idx}].position`,
        problem: `第 ${idx + 1} 条工作经历缺少职位`,
        suggestion: '补充职位名称',
      })
    }
    if (!hasContent(item.description)) {
      issues.push({
        severity: 'info',
        category: '工作经历',
        field: `workList[${idx}].description`,
        problem: `第 ${idx + 1} 条工作经历缺少职责描述`,
        suggestion: '补充职责描述，便于 ATS 提取技能关键词',
      })
    }
    issues.push(...checkDateRange(item.startDate, item.endDate, '工作经历', `workList[${idx}]`))
  })

  return issues
}

function checkProjectList(list: ProjectEntry[]): AtsIssue[] {
  const issues: AtsIssue[] = []
  if (list.length === 0) return issues

  list.forEach((item, idx) => {
    if (!item.name.trim()) {
      issues.push({
        severity: 'info',
        category: '项目经历',
        field: `projectList[${idx}].name`,
        problem: `第 ${idx + 1} 条项目经历缺少项目名称`,
        suggestion: '补充项目名称',
      })
    }
    if (!hasContent(item.mainWork)) {
      issues.push({
        severity: 'info',
        category: '项目经历',
        field: `projectList[${idx}].mainWork`,
        problem: `第 ${idx + 1} 条项目经历缺少主要工作描述`,
        suggestion: '补充主要工作，便于 ATS 提取技术关键词',
      })
    }
    issues.push(...checkDateRange(item.startDate, item.endDate, '项目经历', `projectList[${idx}]`))
  })

  return issues
}

function checkSkills(skills: string): AtsIssue[] {
  const issues: AtsIssue[] = []
  if (!hasContent(skills)) {
    issues.push({
      severity: 'warning',
      category: '专业技能',
      field: 'skills',
      problem: '技能列表为空',
      suggestion: 'ATS 会按技能关键词筛选简历，必须填写',
    })
  } else {
    const plain = stripHtml(skills)
    // 技能列表字符数过少可能是过于简略
    if (plain.length < 30) {
      issues.push({
        severity: 'info',
        category: '专业技能',
        field: 'skills',
        problem: '技能列表过于简略',
        suggestion: '建议按"技术名词 + 熟练度"展开，覆盖核心技能',
      })
    }
  }
  return issues
}

function checkSelfIntro(selfIntro: string): AtsIssue[] {
  const issues: AtsIssue[] = []
  if (!hasContent(selfIntro)) return issues

  const plain = stripHtml(selfIntro)
  if (plain.length > 500) {
    issues.push({
      severity: 'info',
      category: '自我介绍',
      field: 'selfIntro',
      problem: `自我介绍过长（${plain.length} 字）`,
      suggestion: '建议控制在 200-300 字，过长 HR 不会细看',
    })
  }
  return issues
}

function checkHtmlComplexity(input: AtsCheckInput): AtsIssue[] {
  const issues: AtsIssue[] = []
  // 检测是否有过多嵌套的 HTML 结构（ATS 解析困难）
  const htmlFields: Array<{ name: string; value: string }> = [
    { name: 'skills', value: input.skills },
    { name: 'selfIntro', value: input.selfIntro },
    ...input.workList.map((w, i) => ({ name: `workList[${i}].description`, value: w.description })),
    ...input.projectList.map((p, i) => ({ name: `projectList[${i}].mainWork`, value: p.mainWork })),
  ]

  for (const field of htmlFields) {
    if (!field.value) continue
    // 检测表格（ATS 难解析）
    if (/<table/i.test(field.value)) {
      issues.push({
        severity: 'warning',
        category: '内容格式',
        field: field.name,
        problem: '内容中包含表格',
        suggestion: 'ATS 难以解析表格，建议改为列表或纯文本',
      })
    }
    // 检测图片（ATS 无法读取图片中的文字）
    if (/<img/i.test(field.value)) {
      issues.push({
        severity: 'warning',
        category: '内容格式',
        field: field.name,
        problem: '内容中包含图片',
        suggestion: 'ATS 无法识别图片中的文字，重要信息请用文本表达',
      })
    }
  }

  return issues
}

export function runAtsCheck(input: AtsCheckInput): AtsCheckResult {
  const issues: AtsIssue[] = [
    ...checkBasicInfo(input.basicInfo),
    ...checkEducationList(input.educationList),
    ...checkWorkList(input.workList),
    ...checkProjectList(input.projectList),
    ...checkSkills(input.skills),
    ...checkSelfIntro(input.selfIntro),
    ...checkHtmlComplexity(input),
  ]

  // 按严重程度排序
  const order: Record<AtsIssueSeverity, number> = { critical: 0, warning: 1, info: 2 }
  issues.sort((a, b) => order[a.severity] - order[b.severity])

  const criticalCount = issues.filter((i) => i.severity === 'critical').length
  const warningCount = issues.filter((i) => i.severity === 'warning').length
  const infoCount = issues.filter((i) => i.severity === 'info').length
  const passedCount = 0 // 没有显式的"通过项"概念，0 表示未统计

  // 评分逻辑：
  // - 起始 100 分
  // - 每个 critical 扣 15 分
  // - 每个 warning 扣 5 分
  // - 每个 info 扣 1 分
  // - 最低 0 分
  const rawScore = 100 - criticalCount * 15 - warningCount * 5 - infoCount * 1
  const overallScore = Math.max(0, Math.min(100, rawScore))

  let summary: string
  if (overallScore >= 90) {
    summary = `ATS 友好度优秀（${overallScore} 分），可直接投递`
  } else if (overallScore >= 75) {
    summary = `ATS 友好度良好（${overallScore} 分），有 ${warningCount} 项可优化`
  } else if (overallScore >= 60) {
    summary = `ATS 友好度合格（${overallScore} 分），有 ${criticalCount} 项严重问题需修复`
  } else if (overallScore >= 40) {
    summary = `ATS 友好度较弱（${overallScore} 分），可能被 ATS 过滤`
  } else {
    summary = `ATS 友好度严重不足（${overallScore} 分），必须修复 ${criticalCount} 项严重问题`
  }

  return {
    overallScore,
    passedCount,
    warningCount,
    criticalCount,
    issues,
    summary,
  }
}

export function getAtsScoreLevel(score: number): 'excellent' | 'good' | 'fair' | 'weak' | 'poor' {
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'good'
  if (score >= 60) return 'fair'
  if (score >= 40) return 'weak'
  return 'poor'
}

export function getAtsScoreLabel(score: number): string {
  const level = getAtsScoreLevel(score)
  switch (level) {
    case 'excellent':
      return '优秀'
    case 'good':
      return '良好'
    case 'fair':
      return '合格'
    case 'weak':
      return '较弱'
    case 'poor':
      return '严重不足'
    default:
      return ''
  }
}

export function getAtsSeverityLabel(severity: AtsIssueSeverity): string {
  switch (severity) {
    case 'critical':
      return '严重'
    case 'warning':
      return '警告'
    case 'info':
      return '建议'
    default:
      return ''
  }
}
