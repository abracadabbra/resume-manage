// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { sanitizeHtml } from './htmlSanitizer'

describe('htmlSanitizer', () => {
  it('keeps allowed resume formatting tags and safe inline styles', () => {
    const result = sanitizeHtml(
      '<p style="color: #333; font-size: 14px; position: fixed">核心<strong>成果</strong></p>',
    )

    expect(result).toBe('<p style="color: #333; font-size: 14px">核心<strong>成果</strong></p>')
  })

  it('unwraps disallowed elements and removes event handlers', () => {
    const result = sanitizeHtml(
      '<section onclick="alert(1)">项目<script>alert(1)</script><span onmouseover="x">经历</span></section>',
    )

    expect(result).toBe('项目<span>经历</span>')
  })

  it('drops unsafe href and style values', () => {
    const result = sanitizeHtml(
      '<a href="javascript:alert(1)" style="color: url(javascript:alert(1))">链接</a><span style="font-size: 14px">文本</span>',
    )

    expect(result).toBe('<a>链接</a><span style="font-size: 14px">文本</span>')
  })

  it('keeps common markdown output tags', () => {
    const result = sanitizeHtml('<h2>标题</h2><pre><code>const a = 1</code></pre><table><tbody><tr><td>值</td></tr></tbody></table>')

    expect(result).toBe('<h2>标题</h2><pre><code>const a = 1</code></pre><table><tbody><tr><td>值</td></tr></tbody></table>')
  })

  // AI Generated Start
  it('unwraps legacy font tags produced by execCommand before RichEditor converts them', () => {
    const result = sanitizeHtml('<font size="7" color="#ff0000">项目描述</font>')

    expect(result).toBe('项目描述')
  })

  it('preserves span-based font size and color used by RichEditor', () => {
    const result = sanitizeHtml(
      '<span style="font-size: 14px; color: #ff0000">项目描述</span>',
    )

    expect(result).toBe('<span style="font-size: 14px; color: #ff0000">项目描述</span>')
  })

  it('preserves rgb color values from browser inline styles', () => {
    const result = sanitizeHtml('<span style="color: rgb(255, 0, 0)">项目描述</span>')

    expect(result).toBe('<span style="color: rgb(255, 0, 0)">项目描述</span>')
  })
  // AI Generated End
})
