import { stripHtml } from '@/services/htmlUtils'
import type {
  ProjectEntry,
  WorkEntry,
} from '@/stores/resume'

/**
 * 简历技能雷达图
 *
 * 从简历的 skills + workList + projectList 中提取技术关键词，
 * 按维度归类并打分（0-100），用纯 SVG 绘制雷达图。
 *
 * 维度（7 个）：
 * - 后端开发：Java/Spring/Service/Controller 等
 * - 数据库：MySQL/Redis/MongoDB/SQL 等
 * - 中间件：Kafka/RabbitMQ/RocketMQ/Elasticsearch 等
 * - 系统设计：分布式/微服务/架构/高并发 等
 * - 工程化：Docker/Kubernetes/CI/CD/Git 等
 * - 前端基础：Vue/React/TypeScript/HTML/CSS 等
 * - 业务能力：业务/订单/支付/营销/用户/数据 等
 */

export interface SkillDimension {
  name: string
  score: number
  evidenceCount: number
  keywords: string[]
}

export interface SkillRadarData {
  dimensions: SkillDimension[]
  totalKeywords: number
}

const DIMENSION_KEYWORDS: Record<string, string[]> = {
  后端开发: [
    'Java', 'Spring', 'Spring Boot', 'Spring Cloud', 'Spring MVC', 'Spring AOP',
    'MyBatis', 'MyBatis-Plus', 'JPA', 'Hibernate',
    'Service', 'Controller', 'Repository', 'Mapper',
    'RESTful', 'API', '接口', '后端', '服务端',
    'Netty', 'Vert.x', 'Quarkus',
    'Sa-Token', 'Shiro', 'JWT',
    '线程池', '并发', '异步', 'CompletableFuture',
    'JVM', 'GC', '类加载',
  ],
  数据库: [
    'MySQL', 'PostgreSQL', 'Oracle', 'SQL Server', 'MongoDB', 'Cassandra',
    'Redis', 'Memcached', 'HBase',
    'SQL', '索引', '事务', '锁', 'MVCC',
    '分库分表', '读写分离', '主从',
    '慢查询', '执行计划', '优化',
    '缓存', '穿透', '雪崩', '击穿', '预热',
  ],
  中间件: [
    'Kafka', 'RabbitMQ', 'RocketMQ', 'ActiveMQ', 'Pulsar',
    'Elasticsearch', 'Solr', 'Lucene',
    'Nginx', 'Tomcat', 'Jetty',
    'Zookeeper', 'Nacos', 'Consul', 'Eureka',
    'Apollo', 'SkyWalking', 'Zipkin',
    'MinIO', 'FastDFS',
    'SnailJob', 'XXL-Job', 'Quartz',
  ],
  系统设计: [
    '分布式', '微服务', '架构', '高并发', '高可用',
    '设计模式', 'DDD', '领域驱动',
    '限流', '降级', '熔断', '容灾',
    '负载均衡', '一致性', 'CAP',
    '消息队列', '异步',
    '系统设计', '方案',
    '千万级', '亿级', '海量',
    '性能优化', '压测',
  ],
  工程化: [
    'Docker', 'Kubernetes', 'K8s', 'Container',
    'CI', 'CD', 'Jenkins', 'GitLab CI', 'GitHub Actions',
    'Git', 'SVN', 'Maven', 'Gradle',
    'Linux', 'Shell', 'Bash',
    'DevOps', '运维', '部署',
    'Prometheus', 'Grafana', 'ELK',
    '日志', '监控', '告警',
  ],
  前端基础: [
    'Vue', 'React', 'Angular', 'Svelte',
    'JavaScript', 'TypeScript', 'TS', 'JS',
    'HTML', 'CSS', 'SCSS', 'Less',
    'Webpack', 'Vite', 'Rollup',
    'Node.js', 'Express', 'Koa', 'NestJS',
    'Ajax', 'Axios', 'Fetch',
    '小程序', 'H5',
  ],
  业务能力: [
    '业务', '需求', '方案',
    '订单', '支付', '交易', '电商', '购物车',
    '营销', '活动', '优惠券', '促销',
    '用户', '会员', '账户', '权限',
    '商品', '库存', '物流',
    '风控', '反欺诈', '安全',
    '数据', '报表', '统计', '分析',
    'SaaS', 'B端', 'C端',
    '中台', '后台',
  ],
}

// 计算每个维度的得分权重
function calculateDimensionScore(
  matchedCount: number,
  totalEvidence: number,
): number {
  if (matchedCount === 0) return 0
  // 基础分：每个关键词 8 分，最高 60
  const baseScore = Math.min(60, matchedCount * 8)
  // 加权分：占总量比例 * 40
  const ratioScore = totalEvidence > 0 ? Math.round((matchedCount / totalEvidence) * 40) : 0
  return Math.min(100, baseScore + ratioScore)
}

function extractDimensionMatches(
  fullText: string,
  keywords: string[],
): { count: number; matchedKeywords: string[] } {
  const lowerText = fullText.toLowerCase()
  const matched: string[] = []
  const seen = new Set<string>()

  for (const keyword of keywords) {
    // 转义正则特殊字符
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'gi')
    const matches = lowerText.match(regex)
    if (matches && matches.length > 0) {
      // 用小写作为去重 key
      const key = keyword.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        matched.push(keyword)
      }
    }
  }

  return { count: matched.length, matchedKeywords: matched }
}

export function buildSkillRadarData(
  skills: string,
  workList: WorkEntry[],
  projectList: ProjectEntry[],
  selfIntro: string,
): SkillRadarData {
  // 拼接所有简历文本
  const parts: string[] = []
  if (skills) parts.push(stripHtml(skills))
  if (selfIntro) parts.push(stripHtml(selfIntro))
  for (const work of workList) {
    if (work.description) parts.push(stripHtml(work.description))
    if (work.position) parts.push(work.position)
  }
  for (const project of projectList) {
    if (project.introduction) parts.push(stripHtml(project.introduction))
    if (project.mainWork) parts.push(stripHtml(project.mainWork))
    if (project.role) parts.push(project.role)
  }

  const fullText = parts.join('\n')
  if (!fullText.trim()) {
    return {
      dimensions: Object.keys(DIMENSION_KEYWORDS).map((name) => ({
        name,
        score: 0,
        evidenceCount: 0,
        keywords: [],
      })),
      totalKeywords: 0,
    }
  }

  const dimensions: SkillDimension[] = []
  let totalKeywords = 0

  for (const [dimName, keywords] of Object.entries(DIMENSION_KEYWORDS)) {
    const { count, matchedKeywords } = extractDimensionMatches(fullText, keywords)
    totalKeywords += count
    dimensions.push({
      name: dimName,
      score: 0, // 先占位，后面统一计算
      evidenceCount: count,
      keywords: matchedKeywords,
    })
  }

  // 二次计算得分（需要先知道总关键词数）
  for (const dim of dimensions) {
    dim.score = calculateDimensionScore(dim.evidenceCount, totalKeywords)
  }

  return {
    dimensions,
    totalKeywords,
  }
}

export function getRadarLevel(score: number): 'strong' | 'medium' | 'weak' | 'none' {
  if (score >= 70) return 'strong'
  if (score >= 40) return 'medium'
  if (score >= 10) return 'weak'
  return 'none'
}

export function getRadarLevelLabel(score: number): string {
  const level = getRadarLevel(score)
  switch (level) {
    case 'strong':
      return '突出'
    case 'medium':
      return '一般'
    case 'weak':
      return '薄弱'
    case 'none':
      return '缺失'
    default:
      return ''
  }
}
