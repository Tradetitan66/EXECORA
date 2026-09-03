import { defineCliConfig } from 'sanity/cli'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'p0mpfgmr'
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

export default defineCliConfig({
  api: {
    projectId,
    dataset,
  },
  studioHost: process.env.SANITY_STUDIO_HOST || 'execora',
  deployment: {
    appId: 'g5kbxnt5cfg1xf3d2c8ac2pc',
  },
})
