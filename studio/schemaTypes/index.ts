import type { SchemaTypeDefinition } from 'sanity'
import { blogPost } from './blogPost'
import { siteSettings } from './siteSettings'
import { blogAutomationSettings } from './blogAutomationSettings'

export const schemaTypes: SchemaTypeDefinition[] = [
  siteSettings,
  blogPost,
  blogAutomationSettings,
]
