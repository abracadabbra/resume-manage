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
})
