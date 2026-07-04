import { stripHtml } from '@/services/htmlUtils'
import type { ProjectEntry, WorkEntry } from '@/stores/resume'

/**
 * 简历-JD 关键词高亮工具
 *
 * 从简历中提取技术关键词，在 JD 文本中匹配并标记是否被简历覆盖。
 * 不依赖 AI，纯本地解析，响应迅速。
 */

// 通用技术栈关键词词典（按品类分组，便于扩展）
const TECH_KEYWORD_GROUPS: string[][] = [
  // 语言
  ['Java', 'Kotlin', 'Scala', 'Python', 'Go', 'Golang', 'Rust', 'C++', 'C#', 'JavaScript', 'TypeScript', 'PHP'],
  // JVM & 并发
  ['JVM', 'GC', 'CMS', 'G1', 'ZGC', 'CAS', 'AQS', 'synchronized', 'ReentrantLock', 'volatile', 'ThreadPoolExecutor', 'CompletableFuture', 'ForkJoinPool'],
  // Spring 生态
  ['Spring', 'Spring Boot', 'SpringBoot', 'Spring Cloud', 'SpringCloud', 'Spring AOP', 'Spring MVC', 'Spring Security', 'SpringBatch', 'SpringData'],
  // MyBatis & ORM
  ['MyBatis', 'MyBatis-Plus', 'JPA', 'Hibernate', 'Batis'],
  // 微服务 & RPC
  ['Dubbo', 'gRPC', 'Feign', 'Ribbon', 'Nacos', 'Eureka', 'Consul', 'Zookeeper', 'Gateway', 'Sentinel', 'Hystrix'],
  // 数据库
  ['MySQL', 'PostgreSQL', 'Oracle', 'SQLServer', 'TiDB', 'MongoDB', 'Redis', 'Memcached', 'Elasticsearch', 'ClickHouse', 'HBase'],
  // 消息队列
  ['Kafka', 'RabbitMQ', 'RocketMQ', 'Pulsar', 'ActiveMQ'],
  // 容器 & 部署
  ['Docker', 'Kubernetes', 'K8s', 'Jenkins', 'GitLab CI', 'CI/CD', 'DevOps', 'Helm', 'Istio'],
  // 缓存 & 锁
  ['Redisson', '分布式锁', '本地缓存', '热点缓存', '缓存预热', '双检缓存'],
  // 搜索 & 数据
  ['Lucene', 'DSL', '分库分表', 'ShardingSphere'],
  // 网关 & 代理
  ['Nginx', 'Gateway', '负载均衡'],
  // 工程化
  ['单元测试', 'JUnit', 'Mockito', 'TestNG', 'SonarQube'],
  // 业务领域
  ['高并发', '高可用', '分布式', '微服务', '中台', 'DDD', '领域驱动设计'],
  // 安全
  ['Sa-Token', 'JWT', 'OAuth2', 'Spring Security', 'Shiro'],
  // 调度 & 任务
  ['XXL-Job', 'ElasticJob', 'Quartz', 'SnailJob'],
  // 存储 & 文件
  ['MinIO', 'FastDFS', 'OSS', 'S3'],
  // 监控 & 可观测
  ['Prometheus', 'Grafana', 'SkyWalking', 'Zipkin', 'ELK'],
  // 其他常见
  ['AI', 'LLM', '大模型', '推荐引擎', '推荐系统', 'CRM', 'ERP', 'BI', '风控', '支付', '账户系统'],
]

// 扁平化关键词列表（按长度倒序，确保长词优先匹配，避免 "Spring" 抢走 "Spring Boot"）
const ALL_TECH_KEYWORDS = TECH_KEYWORD_GROUPS.flat()
const SORTED_TECH_KEYWORDS = [...ALL_TECH_KEYWORDS].sort((a, b) => b.length - a.length)

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 从简历技能、工作、项目经历中提取出现的技术关键词。
 * 返回去重后的关键词集合（小写形式，便于不区分大小写匹配）。
 */
export function extractResumeTechKeywords(options: {
  skills: string
  workList: WorkEntry[]
  projectList: ProjectEntry[]
}): Set<string> {
  const { skills, workList, projectList } = options
  const haystack = [
    stripHtml(skills),
    ...workList.map((w) => stripHtml(`${w.position} ${w.description}`)),
    ...projectList.map((p) => stripHtml(`${p.name} ${p.role} ${p.introduction} ${p.mainWork}`)),
  ]
    .join(' ')
    .toLowerCase()

  const result = new Set<string>()
  for (const keyword of SORTED_TECH_KEYWORDS) {
    const lower = keyword.toLowerCase()
    if (haystack.includes(lower)) {
      result.add(lower)
    }
  }
  return result
}

export interface JdKeywordMatch {
  keyword: string
  covered: boolean
  count: number
}

/**
 * 在 JD 文本中匹配技术关键词，统计出现次数和是否被简历覆盖。
 */
export function findKeywordsInJd(jdText: string, resumeKeywords: Set<string>): JdKeywordMatch[] {
  if (!jdText.trim()) return []

  const lowerJd = jdText.toLowerCase()
  const matchMap = new Map<string, JdKeywordMatch>()

  for (const keyword of SORTED_TECH_KEYWORDS) {
    const lower = keyword.toLowerCase()
    // 用正则统计出现次数
    const regex = new RegExp(escapeRegExp(lower), 'gi')
    const matches = lowerJd.match(regex)
    if (!matches || matches.length === 0) continue

    if (!matchMap.has(lower)) {
      matchMap.set(lower, {
        keyword,
        covered: resumeKeywords.has(lower),
        count: matches.length,
      })
    }
  }

  // 按出现次数倒序
  return Array.from(matchMap.values()).sort((a, b) => b.count - a.count)
}

export interface JdHighlightSegment {
  text: string
  keyword: string | null
  covered: boolean
}

/**
 * 把 JD 文本切成片段，标记关键词位置和覆盖状态。
 * 用于在 UI 中高亮渲染。
 */
export function highlightJdKeywords(
  jdText: string,
  resumeKeywords: Set<string>,
): JdHighlightSegment[] {
  if (!jdText) return []

  // 构建联合正则（按长度倒序，长词优先）
  const pattern = SORTED_TECH_KEYWORDS.map(escapeRegExp).join('|')
  if (!pattern) return [{ text: jdText, keyword: null, covered: false }]

  const regex = new RegExp(pattern, 'gi')
  const segments: JdHighlightSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(jdText)) !== null) {
    const start = match.index
    const end = start + match[0].length
    const matchedText = match[0]

    // 前面的非关键词文本
    if (start > lastIndex) {
      segments.push({
        text: jdText.slice(lastIndex, start),
        keyword: null,
        covered: false,
      })
    }

    // 关键词本身
    segments.push({
      text: matchedText,
      keyword: matchedText,
      covered: resumeKeywords.has(matchedText.toLowerCase()),
    })

    lastIndex = end
  }

  // 末尾剩余文本
  if (lastIndex < jdText.length) {
    segments.push({
      text: jdText.slice(lastIndex),
      keyword: null,
      covered: false,
    })
  }

  return segments
}
