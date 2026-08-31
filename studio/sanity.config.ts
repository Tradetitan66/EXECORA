import { defineConfig } from 'sanity'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemaTypes'
import { structure } from './structure'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'p0mpfgmr'
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

export default defineConfig({
  name: 'execora',
  title: 'Execora',
  projectId,
  dataset,
  basePath: '/studio',
  plugins: [structure, visionTool()],
  schema: {
    types: schemaTypes,
  },
})
