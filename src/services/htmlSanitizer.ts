const ALLOWED_TAGS = new Set([
  'A',
  'B',
  'BLOCKQUOTE',
  'BR',
  'CODE',
  'DIV',
  'EM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'I',
  'LI',
  'OL',
  'P',
  'PRE',
  'SPAN',
  'STRONG',
  'TABLE',
  'TBODY',
  'TD',
  'TH',
  'THEAD',
  'TR',
  'U',
  'UL',
])

const DROP_CONTENT_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'])

const ALLOWED_STYLE_PROPERTIES = new Set([
  'background-color',
  'color',
  'font-size',
  'font-style',
  'font-weight',
  'text-align',
  'text-decoration',
])

const SAFE_URL_PATTERN = /^(https?:|mailto:|tel:|#|\/)/i
const SAFE_STYLE_VALUE_PATTERN = /^[#\w\s,.%()+-]+$/
const SAFE_SIZE_PATTERN = /^\d+(\.\d+)?(px|em|rem|%)$/

function isSafeStyleValue(property: string, value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return false
  const lower = normalized.toLowerCase()
  if (
    lower.includes('url(') ||
    lower.includes('expression(') ||
    lower.includes('javascript:') ||
    lower.includes('@import') ||
    lower.includes('<') ||
    lower.includes('>')
  ) {
    return false
  }
  if (property === 'font-size') return SAFE_SIZE_PATTERN.test(lower)
  return SAFE_STYLE_VALUE_PATTERN.test(normalized)
}

function sanitizeStyle(style: string): string {
  return style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(':')
      if (separatorIndex < 0) return ''
      const property = declaration.slice(0, separatorIndex).trim().toLowerCase()
      const value = declaration.slice(separatorIndex + 1).trim()
      if (!ALLOWED_STYLE_PROPERTIES.has(property) || !isSafeStyleValue(property, value)) {
        return ''
      }
      return `${property}: ${value}`
    })
    .filter(Boolean)
    .join('; ')
}

function sanitizeElement(source: Element): Node {
  const tagName = source.tagName.toUpperCase()

  if (DROP_CONTENT_TAGS.has(tagName)) {
    return document.createTextNode('')
  }

  if (!ALLOWED_TAGS.has(tagName)) {
    const fragment = document.createDocumentFragment()
    source.childNodes.forEach((child) => {
      fragment.appendChild(sanitizeNode(child))
    })
    return fragment
  }

  const element = document.createElement(tagName.toLowerCase())
  if (tagName === 'A') {
    const href = source.getAttribute('href')?.trim() ?? ''
    if (href && SAFE_URL_PATTERN.test(href)) {
      element.setAttribute('href', href)
      element.setAttribute('target', '_blank')
      element.setAttribute('rel', 'noopener noreferrer')
    }
  }

  const style = sanitizeStyle(source.getAttribute('style') ?? '')
  if (style) element.setAttribute('style', style)

  source.childNodes.forEach((child) => {
    element.appendChild(sanitizeNode(child))
  })

  return element
}

function sanitizeNode(node: Node): Node {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent ?? '')
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    return sanitizeElement(node as Element)
  }
  return document.createTextNode('')
}

function stripHtmlFallback(raw: string): string {
  return raw.replace(/<[^>]*>/g, '')
}

export function sanitizeHtml(raw: string): string {
  if (!raw) return ''
  if (typeof document === 'undefined') return stripHtmlFallback(raw)

  const template = document.createElement('template')
  template.innerHTML = raw

  const output = document.createElement('div')
  template.content.childNodes.forEach((child) => {
    output.appendChild(sanitizeNode(child))
  })

  return output.innerHTML
}
