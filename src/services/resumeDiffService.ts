import type { ResumeDraftData } from '@/stores/resumePersistence'

export type ResumeDiffKind = 'added' | 'removed' | 'changed'

export interface ResumeFieldDiff {
  key: string
  label: string
  before: string
  after: string
  kind: ResumeDiffKind
}

export interface ResumeEntryDiff {
  key: string
  title: string
  kind: ResumeDiffKind
  fields: ResumeFieldDiff[]
}

export interface ResumeDiffSection {
  key: string
  label: string
  changeCount: number
  fields: ResumeFieldDiff[]
  entries: ResumeEntryDiff[]
}

export interface ResumeDiffSummary {
  sectionCount: number
  fieldChangeCount: number
  addedEntryCount: number
  removedEntryCount: number
  updatedEntryCount: number
}

export interface ResumeDiffResult {
  hasChanges: boolean
  summary: ResumeDiffSummary
  sections: ResumeDiffSection[]
}

type FieldDescriptor = {
  key: string
  label: string
}

type PlainRecord = Record<string, unknown>

type CollectionDescriptor = {
  sectionKey: string
  label: string
  fields: FieldDescriptor[]
  getTitle(entry: PlainRecord, index: number): string
  getStableKey(entry: PlainRecord, index: number): string
}

const BASIC_INFO_FIELDS: FieldDescriptor[] = [
  { key: 'name', label: '姓名' },
  { key: 'phone', label: '电话' },
  { key: 'email', label: '邮箱' },
  { key: 'jobTitle', label: '求职岗位' },
  { key: 'location', label: '所在地' },
  { key: 'educationLevel', label: '学历' },
  { key: 'workYears', label: '工作年限' },
  { key: 'currentStatus', label: '当前状态' },
  { key: 'expectedLocation', label: '期望城市' },
  { key: 'expectedSalary', label: '期望薪资' },
  { key: 'website', label: '个人网站' },
  { key: 'wechat', label: '微信' },
  { key: 'github', label: 'GitHub' },
  { key: 'blog', label: '博客' },
  { key: 'line1', label: '附加信息 1' },
  { key: 'line2', label: '附加信息 2' },
  { key: 'line3', label: '附加信息 3' },
  { key: 'line4', label: '附加信息 4' },
]

const EDUCATION_FIELDS: FieldDescriptor[] = [
  { key: 'school', label: '学校' },
  { key: 'college', label: '学院' },
  { key: 'major', label: '专业' },
  { key: 'degree', label: '学历层次' },
  { key: 'startDate', label: '开始时间' },
  { key: 'endDate', label: '结束时间' },
  { key: 'gpa', label: 'GPA' },
  { key: 'description', label: '描述' },
  { key: 'type', label: '类型' },
  { key: 'location', label: '地点' },
  { key: 'schoolTag', label: '学校标签' },
]

const WORK_FIELDS: FieldDescriptor[] = [
  { key: 'company', label: '公司' },
  { key: 'department', label: '部门' },
  { key: 'position', label: '岗位' },
  { key: 'startDate', label: '开始时间' },
  { key: 'endDate', label: '结束时间' },
  { key: 'location', label: '地点' },
  { key: 'description', label: '工作描述' },
]

const PROJECT_FIELDS: FieldDescriptor[] = [
  { key: 'name', label: '项目名' },
  { key: 'role', label: '角色' },
  { key: 'startDate', label: '开始时间' },
  { key: 'endDate', label: '结束时间' },
  { key: 'link', label: '链接' },
  { key: 'introduction', label: '项目介绍' },
  { key: 'mainWork', label: '主要工作' },
]

const AWARD_FIELDS: FieldDescriptor[] = [
  { key: 'name', label: '奖项名' },
  { key: 'date', label: '时间' },
  { key: 'description', label: '描述' },
]

const EMPTY_DIFF: ResumeDiffResult = {
  hasChanges: false,
  summary: {
    sectionCount: 0,
    fieldChangeCount: 0,
    addedEntryCount: 0,
    removedEntryCount: 0,
    updatedEntryCount: 0,
  },
  sections: [],
}

function isPlainRecord(value: unknown): value is PlainRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
}

function readField(record: unknown, key: string): string {
  if (!isPlainRecord(record)) return ''
  return normalizeText(record[key])
}

function buildFieldDiff(key: string, label: string, beforeValue: unknown, afterValue: unknown): ResumeFieldDiff | null {
  const before = normalizeText(beforeValue)
  const after = normalizeText(afterValue)
  if (before === after) return null

  let kind: ResumeDiffKind = 'changed'
  if (!before && after) {
    kind = 'added'
  } else if (before && !after) {
    kind = 'removed'
  }

  return {
    key,
    label,
    before,
    after,
    kind,
  }
}

function createDirectFieldSection(
  key: string,
  label: string,
  fields: FieldDescriptor[],
  beforeRecord: unknown,
  afterRecord: unknown,
): ResumeDiffSection | null {
  const changes = fields
    .map((field) => buildFieldDiff(field.key, field.label, readField(beforeRecord, field.key), readField(afterRecord, field.key)))
    .filter((item): item is ResumeFieldDiff => Boolean(item))

  if (!changes.length) return null

  return {
    key,
    label,
    changeCount: changes.length,
    fields: changes,
    entries: [],
  }
}

function createTextSection(
  key: string,
  label: string,
  beforeValue: unknown,
  afterValue: unknown,
): ResumeDiffSection | null {
  const change = buildFieldDiff(key, label, beforeValue, afterValue)
  if (!change) return null

  return {
    key,
    label,
    changeCount: 1,
    fields: [change],
    entries: [],
  }
}

function buildModuleOrder(modules: unknown): string {
  if (!Array.isArray(modules)) return ''
  return modules
    .filter((item) => isPlainRecord(item) && item.visible !== false)
    .map((item) => normalizeText(item.label) || normalizeText(item.key))
    .filter(Boolean)
    .join(' > ')
}

function buildHiddenModules(modules: unknown): string {
  if (!Array.isArray(modules)) return ''
  return modules
    .filter((item) => isPlainRecord(item) && item.visible === false)
    .map((item) => normalizeText(item.label) || normalizeText(item.key))
    .filter(Boolean)
    .join('、')
}

function createLayoutSection(before: Partial<ResumeDraftData>, after: Partial<ResumeDraftData>): ResumeDiffSection | null {
  const changes = [
    buildFieldDiff('selectedTemplateKey', '模板', before.selectedTemplateKey, after.selectedTemplateKey),
    buildFieldDiff('moduleOrder', '可见模块顺序', buildModuleOrder(before.modules), buildModuleOrder(after.modules)),
    buildFieldDiff('hiddenModules', '隐藏模块', buildHiddenModules(before.modules), buildHiddenModules(after.modules)),
  ].filter((item): item is ResumeFieldDiff => Boolean(item))

  if (!changes.length) return null

  return {
    key: 'layout',
    label: '布局与模板',
    changeCount: changes.length,
    fields: changes,
    entries: [],
  }
}

function createStableCollectionKey(entry: PlainRecord, index: number, titleKeys: string[]): string {
  const id = readField(entry, 'id')
  if (id) return id

  const composite = titleKeys
    .map((key) => readField(entry, key))
    .filter(Boolean)
    .join('|')

  return composite || `index-${index + 1}`
}

function createCollectionSection(
  descriptor: CollectionDescriptor,
  beforeList: unknown,
  afterList: unknown,
): ResumeDiffSection | null {
  const safeBefore = Array.isArray(beforeList)
    ? beforeList.filter(isPlainRecord)
    : []
  const safeAfter = Array.isArray(afterList)
    ? afterList.filter(isPlainRecord)
    : []

  const beforeMap = new Map<string, { entry: PlainRecord; index: number }>()
  const afterMap = new Map<string, { entry: PlainRecord; index: number }>()

  safeBefore.forEach((entry, index) => {
    beforeMap.set(descriptor.getStableKey(entry, index), { entry, index })
  })

  safeAfter.forEach((entry, index) => {
    afterMap.set(descriptor.getStableKey(entry, index), { entry, index })
  })

  const orderedKeys = [
    ...beforeMap.keys(),
    ...Array.from(afterMap.keys()).filter((key) => !beforeMap.has(key)),
  ]

  const entries = orderedKeys
    .map((key) => {
      const beforeItem = beforeMap.get(key)
      const afterItem = afterMap.get(key)

      if (!beforeItem && !afterItem) return null

      let kind: ResumeDiffKind = 'changed'
      if (!beforeItem && afterItem) {
        kind = 'added'
      } else if (beforeItem && !afterItem) {
        kind = 'removed'
      }

      const fieldDiffs = descriptor.fields
        .map((field) =>
          buildFieldDiff(
            field.key,
            field.label,
            beforeItem ? readField(beforeItem.entry, field.key) : '',
            afterItem ? readField(afterItem.entry, field.key) : '',
          ),
        )
        .filter((item): item is ResumeFieldDiff => Boolean(item))

      if (!fieldDiffs.length) return null

      const reference = afterItem ?? beforeItem
      if (!reference) return null

      return {
        key,
        title: descriptor.getTitle(reference.entry, reference.index),
        kind,
        fields: fieldDiffs,
      } satisfies ResumeEntryDiff
    })
    .filter((item): item is ResumeEntryDiff => Boolean(item))

  if (!entries.length) return null

  return {
    key: descriptor.sectionKey,
    label: descriptor.label,
    changeCount: entries.reduce((sum, entry) => sum + entry.fields.length, 0),
    fields: [],
    entries,
  }
}

function summarizeSections(sections: ResumeDiffSection[]): ResumeDiffSummary {
  let fieldChangeCount = 0
  let addedEntryCount = 0
  let removedEntryCount = 0
  let updatedEntryCount = 0

  sections.forEach((section) => {
    fieldChangeCount += section.fields.length

    section.entries.forEach((entry) => {
      fieldChangeCount += entry.fields.length

      if (entry.kind === 'added') {
        addedEntryCount += 1
      } else if (entry.kind === 'removed') {
        removedEntryCount += 1
      } else {
        updatedEntryCount += 1
      }
    })
  })

  return {
    sectionCount: sections.length,
    fieldChangeCount,
    addedEntryCount,
    removedEntryCount,
    updatedEntryCount,
  }
}

const EDUCATION_COLLECTION: CollectionDescriptor = {
  sectionKey: 'education',
  label: '教育经历',
  fields: EDUCATION_FIELDS,
  getTitle(entry, index) {
    return readField(entry, 'school') || `教育经历 ${index + 1}`
  },
  getStableKey(entry, index) {
    return createStableCollectionKey(entry, index, ['school', 'major', 'startDate', 'endDate'])
  },
}

const WORK_COLLECTION: CollectionDescriptor = {
  sectionKey: 'workExperience',
  label: '工作经历',
  fields: WORK_FIELDS,
  getTitle(entry, index) {
    return readField(entry, 'company') || `工作经历 ${index + 1}`
  },
  getStableKey(entry, index) {
    return createStableCollectionKey(entry, index, ['company', 'position', 'startDate', 'endDate'])
  },
}

const PROJECT_COLLECTION: CollectionDescriptor = {
  sectionKey: 'projectExperience',
  label: '项目经历',
  fields: PROJECT_FIELDS,
  getTitle(entry, index) {
    return readField(entry, 'name') || `项目经历 ${index + 1}`
  },
  getStableKey(entry, index) {
    return createStableCollectionKey(entry, index, ['name', 'role', 'startDate', 'endDate'])
  },
}

const AWARD_COLLECTION: CollectionDescriptor = {
  sectionKey: 'awards',
  label: '荣誉奖项',
  fields: AWARD_FIELDS,
  getTitle(entry, index) {
    return readField(entry, 'name') || `荣誉奖项 ${index + 1}`
  },
  getStableKey(entry, index) {
    return createStableCollectionKey(entry, index, ['name', 'date'])
  },
}

export function buildResumeDiff(
  before: Partial<ResumeDraftData> | null | undefined,
  after: Partial<ResumeDraftData> | null | undefined,
): ResumeDiffResult {
  const safeBefore = before ?? {}
  const safeAfter = after ?? {}

  const sections = [
    createLayoutSection(safeBefore, safeAfter),
    createDirectFieldSection('basicInfo', '基本信息', BASIC_INFO_FIELDS, safeBefore.basicInfo, safeAfter.basicInfo),
    createTextSection('skills', '专业技能', safeBefore.skills, safeAfter.skills),
    createTextSection('certificate', '技能证书', safeBefore.certificate, safeAfter.certificate),
    createCollectionSection(EDUCATION_COLLECTION, safeBefore.educationList, safeAfter.educationList),
    createCollectionSection(WORK_COLLECTION, safeBefore.workList, safeAfter.workList),
    createCollectionSection(PROJECT_COLLECTION, safeBefore.projectList, safeAfter.projectList),
    createCollectionSection(AWARD_COLLECTION, safeBefore.awardList, safeAfter.awardList),
    createTextSection('selfIntro', '个人简介', safeBefore.selfIntro, safeAfter.selfIntro),
  ].filter((section): section is ResumeDiffSection => Boolean(section))

  if (!sections.length) return EMPTY_DIFF

  return {
    hasChanges: true,
    summary: summarizeSections(sections),
    sections,
  }
}
