import { build } from 'esbuild'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export function comparisonPrerender() {
 return { name: 'comparison-prerender', apply: 'build', async closeBundle() {
  const entry = path.resolve('dist/.comparison-ssr.mjs')
  try {
   await build({ entryPoints: ['components/ui/comparison-02.tsx'], bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', outfile: entry })
   const { default: Component } = await import(pathToFileURL(entry).href)
   const htmlPath = path.resolve('dist/compare.html')
   const html = await readFile(htmlPath, 'utf8')
   const start = html.indexOf('<div id="comparison-root">')
   const end = html.indexOf('</main>', start)
   if (start < 0 || end < 0) throw new Error('Comparison mount was not found')
   await writeFile(htmlPath, html.slice(0,start) + '<div id="comparison-root" data-prerendered="true">' + renderToString(createElement(Component)) + '</div>' + html.slice(end))
  } finally { await unlink(entry).catch(() => {}) }
 } }
}
