export interface PaginationSegment {
  top: number
  bottom: number
  label: string
}

export interface PaginationPageDiagnostic {
  pageNumber: number
  start: number
  end: number
  breakAt: number | null
  availableHeight: number
  usedHeight: number
  blankHeight: number
  usageRatio: number
  blankRatio: number
  previousLabel: string | null
  nextLabel: string | null
  suspiciousBlank: boolean
}

export interface PaginationDiagnostics {
  totalPages: number
  suspiciousPageCount: number
  lastPageBlankHeight: number
  lastPageBlankRatio: number
  hasSuspiciousWhitespace: boolean
  pages: PaginationPageDiagnostic[]
}

export interface PaginationDiagnosticsInput {
  breaks: number[]
  contentHeight: number
  innerTotalHeight: number
  firstPageUsableHeight: number
  regularPageUsableHeight: number
  segments: PaginationSegment[]
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.max(0, Math.min(1, value))
}

function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000
}

function findPreviousLabel(segments: PaginationSegment[], breakAt: number): string | null {
  let matched: PaginationSegment | null = null
  for (const segment of segments) {
    if (segment.bottom <= breakAt) {
      if (!matched || segment.bottom > matched.bottom) matched = segment
    }
  }
  return matched?.label ?? null
}

function findNextLabel(segments: PaginationSegment[], breakAt: number): string | null {
  let matched: PaginationSegment | null = null
  for (const segment of segments) {
    if (segment.top >= breakAt) {
      if (!matched || segment.top < matched.top) matched = segment
    }
  }
  return matched?.label ?? null
}

function isSuspiciousBlank(blankHeight: number, blankRatio: number): boolean {
  return blankHeight >= 96 || (blankHeight >= 64 && blankRatio >= 0.22)
}

export function buildPaginationDiagnostics(input: PaginationDiagnosticsInput): PaginationDiagnostics {
  const boundaries = [0, ...input.breaks, input.innerTotalHeight]
  const pages: PaginationPageDiagnostic[] = []

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index] ?? 0
    const end = boundaries[index + 1] ?? input.innerTotalHeight
    const breakAt = index < input.breaks.length ? input.breaks[index] ?? null : null
    const availableHeight = index === 0 ? input.firstPageUsableHeight : input.regularPageUsableHeight
    const contentEnd = Math.min(input.contentHeight, end)
    const usedHeight = Math.max(0, contentEnd - start)
    const blankHeight = Math.max(0, availableHeight - usedHeight)
    const usageRatio = roundRatio(clampRatio(usedHeight / availableHeight))
    const blankRatio = roundRatio(clampRatio(blankHeight / availableHeight))

    pages.push({
      pageNumber: index + 1,
      start,
      end,
      breakAt,
      availableHeight,
      usedHeight,
      blankHeight,
      usageRatio,
      blankRatio,
      previousLabel: breakAt === null ? null : findPreviousLabel(input.segments, breakAt),
      nextLabel: breakAt === null ? null : findNextLabel(input.segments, breakAt),
      suspiciousBlank: isSuspiciousBlank(blankHeight, blankRatio),
    })
  }

  const lastPage = pages[pages.length - 1]

  return {
    totalPages: pages.length,
    suspiciousPageCount: pages.filter((page) => page.suspiciousBlank).length,
    lastPageBlankHeight: lastPage?.blankHeight ?? 0,
    lastPageBlankRatio: lastPage?.blankRatio ?? 0,
    hasSuspiciousWhitespace: pages.some((page) => page.suspiciousBlank),
    pages,
  }
}
