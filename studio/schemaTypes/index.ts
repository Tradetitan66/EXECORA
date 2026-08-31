import type { SchemaTypeDefinition } from 'sanity'
import { blogPost } from './blogPost'
import { siteSettings } from './siteSettings'

export const schemaTypes: SchemaTypeDefinition[] = [siteSettings, blogPost]
