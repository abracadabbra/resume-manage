const TECH_STACK_KEYWORDS: Array<{ label: string; patterns: string[] }> = [
  { label: 'Java', patterns: ['java'] },
  { label: 'Spring Boot', patterns: ['spring boot', 'springboot'] },
  { label: 'Spring Cloud', patterns: ['spring cloud', 'springcloud'] },
  { label: 'Spring', patterns: ['spring'] },
  { label: 'MyBatis', patterns: ['mybatis'] },
  { label: 'Dubbo', patterns: ['dubbo'] },
  { label: 'JVM', patterns: ['jvm'] },
  { label: 'MySQL', patterns: ['mysql'] },
  { label: 'Redis', patterns: ['redis'] },
  { label: 'MongoDB', patterns: ['mongodb', 'mongo db'] },
  { label: 'PostgreSQL', patterns: ['postgresql', 'postgres'] },
  { label: 'Oracle', patterns: ['oracle'] },
  { label: 'Elasticsearch', patterns: ['elasticsearch', ' elasticsearch', 'es搜索', 'es '] },
  { label: 'Kafka', patterns: ['kafka'] },
  { label: 'RocketMQ', patterns: ['rocketmq'] },
  { label: 'RabbitMQ', patterns: ['rabbitmq'] },
  { label: 'Flink', patterns: ['flink'] },
  { label: 'Spark', patterns: ['spark'] },
  { label: 'Hive', patterns: ['hive'] },
  { label: 'HBase', patterns: ['hbase'] },
  { label: 'HDFS', patterns: ['hdfs'] },
  { label: 'ClickHouse', patterns: ['clickhouse'] },
  { label: 'Docker', patterns: ['docker'] },
  { label: 'Kubernetes', patterns: ['kubernetes', 'k8s'] },
  { label: 'Linux', patterns: ['linux'] },
  { label: 'Nginx', patterns: ['nginx'] },
  { label: 'Netty', patterns: ['netty'] },
  { label: 'Sentinel', patterns: ['sentinel'] },
  { label: 'Nacos', patterns: ['nacos'] },
  { label: 'Zookeeper', patterns: ['zookeeper'] },
  { label: 'Prometheus', patterns: ['prometheus'] },
  { label: 'Grafana', patterns: ['grafana'] },
  { label: 'XXL-JOB', patterns: ['xxl-job', 'xxljob'] },
  { label: 'Quartz', patterns: ['quartz'] },
  { label: 'Vue', patterns: ['vue'] },
  { label: 'React', patterns: ['react'] },
  { label: 'TypeScript', patterns: ['typescript'] },
  { label: 'JavaScript', patterns: ['javascript'] },
  { label: 'Python', patterns: ['python'] },
  { label: 'Go', patterns: [' golang', 'go语言', 'golang'] },
  { label: 'C++', patterns: ['c++'] },
  { label: 'LangChain', patterns: ['langchain'] },
  { label: 'RAG', patterns: ['rag'] },
  { label: 'OpenAI', patterns: ['openai'] },
  { label: 'MCP', patterns: ['mcp'] },
  { label: 'Supabase', patterns: ['supabase'] },
]

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))]
}

export function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return uniqueStrings(value.map((item) => String(item)))
}

export function buildQuestionSearchText(input: {
  title?: string
  answer?: { content?: string; followUp?: Array<{ question?: string; answer?: string }> }
  labels?: string[]
  projectNames?: string[]
  techStacks?: string[]
}): string {
  const followUps = Array.isArray(input.answer?.followUp)
    ? input.answer?.followUp
        ?.map((item) => `${item.question ?? ''} ${item.answer ?? ''}`.trim())
        .filter(Boolean)
        .join('\n')
    : ''

  return [
    input.title ?? '',
    input.answer?.content ?? '',
    followUps,
    Array.isArray(input.labels) ? input.labels.join(' ') : '',
    Array.isArray(input.projectNames) ? input.projectNames.join(' ') : '',
    Array.isArray(input.techStacks) ? input.techStacks.join(' ') : '',
  ]
    .join('\n')
    .trim()
}

export function extractTechStacksFromText(text: string): string[] {
  const lowered = ` ${text.toLowerCase()} `
  const matched: string[] = []

  for (const keyword of TECH_STACK_KEYWORDS) {
    if (keyword.patterns.some((pattern) => lowered.includes(pattern.toLowerCase()))) {
      matched.push(keyword.label)
    }
  }

  return uniqueStrings(matched)
}

export function matchProjectNamesInText(text: string, projectNames: string[]): string[] {
  const lowered = text.toLowerCase()
  return uniqueStrings(
    projectNames.filter((name) => {
      const normalized = name.trim()
      return normalized.length >= 2 && lowered.includes(normalized.toLowerCase())
    }),
  )
}
