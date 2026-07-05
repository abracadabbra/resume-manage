import json

qid = '某高并发电商系统，订单表日增量超过500万条，当前单表数据量已达数十亿，导致慢查'
answer = """## 问题本质

OFFSET 分页在数据量大时性能急剧下降的根本原因是：**数据库需要先扫描并"跳过"前面 N 条记录，才能返回 LIMIT 后的数据**。例如 `LIMIT 20 OFFSET 1000000`，数据库要先扫描 1000020 条记录，只返回最后 20 条，大量的 I/O 操作都是在扫描而非返回数据。

## 方案一：游标分页（最优解）

不用 OFFSET，改用主键 ID 或时间戳作为游标（Cursor）：

```sql
-- 第一页
SELECT * FROM orders
WHERE create_time >= '2026-01-01'
ORDER BY create_time DESC, id DESC
LIMIT 20;

-- 下一页：传入上一页最后一条的 (create_time, id)
SELECT * FROM orders
WHERE (create_time, id) < (:last_time, :last_id)
  AND create_time >= '2026-01-01'
ORDER BY create_time DESC, id DESC
LIMIT 20;
```

**前提**：`(create_time, id)` 上有复合索引。

**优点**：查询时间恒定，不随页码深度增加而变慢。
**缺点**：只能"下一页"，无法跳转到任意指定页。

## 方案二：分区表 + 条件分页

按月/周对订单表做 Range 分区，将历史数据和近期数据分散到不同物理分区：

```sql
CREATE TABLE orders (
    id BIGINT,
    create_time DATETIME,
    ...
) PARTITION BY RANGE (UNIX_TIMESTAMP(create_time)) (
    PARTITION p202601 VALUES LESS THAN (UNIX_TIMESTAMP('2026-02-01')),
    PARTITION p202602 VALUES LESS THAN (UNIX_TIMESTAMP('2026-03-01')),
    ...
);
```

查询时带上时间条件，MySQL 只扫描对应分区，避免全表扫描。

## 方案三：数据归档

将 3-6 个月前的订单迁移到冷库（如 ClickHouse / TiDB OLAP / 归档表），主表只保留近期数据。冷数据通过异构数据库查询，大幅降低主库负载。

## 方案四：覆盖索引

如果只需要返回少量字段，可以建立覆盖索引，避免回表：

```sql
CREATE INDEX idx_covering ON orders(create_time DESC, id DESC) INCLUDES (user_id, amount, status);
```

## 面试追问防御

| 追问 | 回答 |
|------|------|
| 产品非要"跳转到第 N 页"怎么办？ | 展示总数时用游标分页；精确跳转用 `WHERE id > (第N页第一条的ID)` 预计算 |
| 深度分页如何避免雪崩？ | 对查询频率高的游标 key 做 Redis 缓存 |
| 分库分表后如何跨表分页？ | 使用 ES / ClickHouse 做统一搜索入口 |

## 总结

核心思路就一条：**别用 OFFSET 跳过数据，要用 WHERE 条件定位数据**。生产环境最优实践通常是：游标分页 + 复合索引 + 必要时分区/归档，三者配合使用。"""

with open('src/data/ai-answers.json') as f:
    data = json.load(f)

data[qid] = {
    'answer': answer,
    'conversations': [],
    'updatedAt': 1750867200000,
    'question': '某高并发电商系统，订单表日增量超过500万条，当前单表数据量已达数十亿，导致慢查询频发，分页查询深度偏移时性能急剧下降。如何优化？',
    'category': 'MySQL'
}

with open('src/data/ai-answers.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Done! Total entries:', len(data))
