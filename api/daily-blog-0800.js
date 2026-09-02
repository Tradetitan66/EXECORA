/**
 * Execora — Vercel Cron wrapper (08:00 UTC) for the daily blog generator.
 *
 * Vercel Cron invokes this via GET. It delegates to the shared
 * /api/generate-daily-blog handler, which enforces the Europe/London
 * 8 AM window and daily idempotency before any OpenAI call.
 *
 * Two schedules target the same generation logic; this wrapper (08:00
 * UTC) and /api/daily-blog-0700 (07:00 UTC) let Vercel host separate
 * cron paths without duplicating generation code.
 */
import handleGenerateDailyBlog from './generate-daily-blog.js'

export default async function handler(req, res) {
  return handleGenerateDailyBlog(req, res)
}
