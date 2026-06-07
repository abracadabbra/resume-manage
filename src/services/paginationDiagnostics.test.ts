import { describe, expect, it } from 'vitest'

import {
  buildPaginationDiagnostics,
} from '@/services/paginationDiagnostics'

describe('paginationDiagnostics', () => {
  it('builds per-page usage and break context diagnostics', () => {
    const result = buildPaginationDiagnostics({
      breaks: [760],
      contentHeight: 1180,
      innerTotalHeight: 1500,
      firstPageUsableHeight: 800,
      regularPageUsableHeight: 700,
      segments: [
        { top: 640, bottom: 744, label: '项目经历 - 订单中台' },
        { top: 778, bottom: 930, label: '项目经历 - 营销平台' },
      ],
    })

    expect(result.totalPages).toBe(2)
    expect(result.hasSuspiciousWhitespace).toBe(true)
    expect(result.pages[0]).toMatchObject({
      pageNumber: 1,
      usedHeight: 760,
      blankHeight: 40,
      previousLabel: '项目经历 - 订单中台',
      nextLabel: '项目经历 - 营销平台',
      suspiciousBlank: false,
    })
    expect(result.pages[1]).toMatchObject({
      pageNumber: 2,
      usedHeight: 420,
      blankHeight: 280,
      suspiciousBlank: true,
    })
  })

  it('marks pages with large blank area as suspicious', () => {
    const result = buildPaginationDiagnostics({
      breaks: [],
      contentHeight: 520,
      innerTotalHeight: 794,
      firstPageUsableHeight: 794,
      regularPageUsableHeight: 700,
      segments: [],
    })

    expect(result.totalPages).toBe(1)
    expect(result.lastPageBlankHeight).toBe(274)
    expect(result.lastPageBlankRatio).toBeCloseTo(0.345, 3)
    expect(result.hasSuspiciousWhitespace).toBe(true)
  })
})
