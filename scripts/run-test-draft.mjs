import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(root, '.env')

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

const required = ['OPENAI_API_KEY', 'SANITY_WRITE_TOKEN', 'CRON_SECRET']
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[run-test-draft] Missing ${key} in .env — aborting.`)
    process.exit(1)
  }
}

const { default: handler } = await import(resolve(root, 'api/generate-daily-blog.js'))

const makeReq = ({ token, url = '/api/generate-daily-blog?test=true' } = {}) => ({
  method: 'POST',
  url,
  headers: token ? { authorization: `Bearer ${token}` } : {},
})

const makeRes = () => {
  const res = { _status: 200, _json: null, _sent: false }
  res.status = (code) => { res._status = code; return res }
  res.setHeader = () => res
  res.json = (obj) => { res._json = obj; res._sent = true; return res }
  return res
}

const req = makeReq({ token: process.env.CRON_SECRET })
const res = makeRes()

process.stdout.write('[run-test-draft] Invoking handler in test mode…\n')
try {
  await handler(req, res)
  console.log(`[run-test-draft] HTTP ${res._status}`)
  console.log(JSON.stringify(res._json, null, 2))
} catch (err) {
  console.error('[run-test-draft] Handler threw:', err)
  process.exit(1)
}