/**
 * 大厂面经 tech_field 归一化
 *
 * 背景：
 * - 数据源（Supabase `tech_interview_questions.tech_field`）有 243 个不同字面量
 * - UI 侧约定的 17 个大类见 src/data/tech-interview-questions.json 的 categories
 * - 之前 store 直接用 row.tech_field 当 category id，导致云端走通时分类碎成 100+ 桶
 *
 * 策略：keyword 优先级匹配（顺序敏感，先匹配先生效），未命中归 "其他"。
 * 后续如果需要更精细分类，从这里扩展 keyword 即可。
 */
export const TECH_FIELD_CATEGORIES = [
  'AI',
  'Java',
  'MySQL',
  'Redis',
  '前端',
  '大数据',
  '客户端',
  '工具',
  '操作系统',
  '消息队列',
  '算法',
  '系统设计',
  '编程语言',
  '网络',
  '软技能',
  '项目',
  '其他',
] as const

export type TechFieldCategory = (typeof TECH_FIELD_CATEGORIES)[number]

interface CategoryRule {
  category: TechFieldCategory
  /** 任一 keyword 命中即匹配（大小写不敏感、子串匹配） */
  keywords: string[]
}

const RULES: CategoryRule[] = [
  { category: 'AI', keywords: ['AI', 'Agent', 'RAG', 'LLM', '大模型', 'LangChain', '深度学习', '机器学习', '推荐算法', '推荐系统', '科研', '论文', '算法/机器学习', 'AI/RAG', 'AI/LLM', 'AI/大模型'] },
  { category: 'Java', keywords: ['Java', 'JVM', 'Spring', 'MyBatis', '并发', '多线程', '集合', 'Java基础', 'Java并发', 'Java集合', 'Dubbo', 'Shiro'] },
  { category: 'MySQL', keywords: ['MySQL', '数据库', 'SQL', '数据仓库', '数据开发', '数据分析', '数据治理', 'OLAP', 'Elasticsearch', 'ES'] },
  { category: 'Redis', keywords: ['Redis', '缓存', 'Disruptor'] },
  { category: '消息队列', keywords: ['MQ', '消息队列', 'Kafka', 'RabbitMQ', 'RocketMQ', '中间件', 'Dubbo/RPC', 'RPC'] },
  { category: '前端', keywords: ['前端', 'JavaScript', 'React', 'Vue', 'Webpack', '工程化', '浏览器', 'Web', '前端工程化', '前端基础', '前端业务', '编程语言/基础'] },
  { category: '客户端', keywords: ['iOS', 'Android', '客户端', 'LBS'] },
  { category: '操作系统', keywords: ['操作系统', 'Linux', 'IO多路复用', '性能排查'] },
  { category: '网络', keywords: ['网络', 'Netty', 'HTTP', 'TCP', 'UDP', '网络安全', '通信', '协议'] },
  { category: '系统设计', keywords: ['系统设计', '架构', '场景设计', '场景题', '高并发', '分布式', '微服务', '云原生', '容器', '分布式锁', 'RPC', '分布式系统', '链路追踪'] },
  { category: '项目', keywords: ['项目', '实习', '工程实践', '秒杀', '业务', '岗位认知', '自我介绍', '比赛'] },
  { category: '算法', keywords: ['算法', '数据结构', '手撕', '代码题', '逻辑', '数学题', '估算'] },
  { category: '大数据', keywords: ['大数据', 'Flink', '数据仓库', 'OLAP', '数据开发', '数据治理', '数据分析', '实时计算'] },
  { category: '编程语言', keywords: ['Golang', 'Go', 'C++', 'Python', 'PHP', '编程语言', 'Go语言', 'JavaScript', 'Java vs Go', 'Java / Python'] },
  { category: '工具', keywords: ['Git', 'Vim', 'DevOps', 'Webpack', '工程化', '构建', 'CI', '调试', '测试'] },
  { category: '软技能', keywords: ['软技能', 'HR', '职业规划', '职业发展', '学习能力', '自我介绍', '反问', '综合素质', '综合', '场景题/软技能', '软问题'] },
]

const FALLBACK: TechFieldCategory = '其他'

/**
 * 把任意 tech_field 字面量归一化到 17 个大类之一。
 * 空值/null/undefined 也走 fallback。
 */
export function normalizeTechField(field: string | null | undefined): TechFieldCategory {
  if (!field) return FALLBACK
  const lower = field.toLowerCase()
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) return rule.category
    }
  }
  return FALLBACK
}