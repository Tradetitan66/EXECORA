import { imageUrlFor } from './client'

/**
 * Minimal Portable Text → HTML renderer for blog article bodies.
 * Supports headings, paragraphs, bullet/numbered lists, links and inline
 * images with alt text. Returns an HTML string (sanitised) for injection.
 */

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function portableTextToHtml(blocks) {
  if (!Array.isArray(blocks)) return ''

  const out = []
  let listBuffer = null // { type: 'bullet'|'number', items: [] }

  function flushList() {
    if (!listBuffer) return
    const tag = listBuffer.type === 'number' ? 'ol' : 'ul'
    out.push(`<${tag}>`)
    for (const item of listBuffer.items) {
      out.push(`<li>${item}</li>`)
    }
    out.push(`</${tag}>`)
    listBuffer = null
  }

  for (const block of blocks) {
    const { _type } = block

    if (_type === 'image') {
      flushList()
      const url = imageUrlFor(block)
      if (url) {
        const alt = block.alt || ''
        const src = url.width(1200).auto('format').url()
        out.push(`<figure class="article-figure"><img src="${src}" alt="${escapeHtml(
          alt
        )}" loading="lazy" /><figcaption>${escapeHtml(alt)}</figcaption></figure>`)
      }
      continue
    }

    if (_type !== 'block') continue

    // Inline link wrapping
    const markDefs = block.markDefs || []
    const linkDef = markDefs.find((m) => m._type === 'link')

    let text = escapeHtml(block.children?.map((c) => c.text || '').join('') || '')

    if (linkDef && linkDef.href) {
      const ext = /^https?:\/\//.test(linkDef.href) && !linkDef.href.includes('execora')
      const target = ext ? ' target="_blank" rel="noopener"' : ''
      text = `<a href="${escapeHtml(linkDef.href)}"${target}>${text}</a>`
    }

    if (block.style === 'h2') {
      flushList()
      out.push(`<h2>${text}</h2>`)
    } else if (block.style === 'h3') {
      flushList()
      out.push(`<h3>${text}</h3>`)
    } else if (block.listItem === 'bullet') {
      if (!listBuffer || listBuffer.type !== 'bullet') {
        flushList()
        listBuffer = { type: 'bullet', items: [] }
      }
      listBuffer.items.push(text)
    } else if (block.listItem === 'number') {
      if (!listBuffer || listBuffer.type !== 'number') {
        flushList()
        listBuffer = { type: 'number', items: [] }
      }
      listBuffer.items.push(text)
    } else {
      flushList()
      out.push(`<p>${text}</p>`)
    }
  }

  flushList()
  return out.join('\n')
}
