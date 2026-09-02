import { defineField, defineType } from 'sanity'

/**
 * Singleton controlling the automatic daily blog article and featured-image
 * generation. The owner can edit these prompts from the Studio without touching
 * code or redeploying. Only the published document affects automatic generation.
 */
export const blogAutomationSettings = defineType({
  name: 'blogAutomationSettings',
  title: 'Blog Automation Settings',
  type: 'document',
  fields: [
    defineField({
      name: 'imageStylePrompt',
      title: 'Featured Image Style Prompt',
      type: 'text',
      rows: 12,
      description:
        'Controls the visual style used for future automatic blog images. Prepend the recommended Execora style to customise it.',
    }),
    defineField({
      name: 'imageNegativePrompt',
      title: 'Avoid in Images',
      type: 'text',
      rows: 6,
      description:
        'Visual elements, colours and styles that OpenAI should avoid in generated images.',
    }),
    defineField({
      name: 'articleContentPrompt',
      title: 'Article Content Guidance',
      type: 'text',
      rows: 6,
      description:
        'Controls what future articles should focus on, including audience problems, practical advice and business priorities.',
    }),
    defineField({
      name: 'articleTonePrompt',
      title: 'Writing Style and Tone',
      type: 'text',
      rows: 4,
      description: 'Controls tone, readability, structure and level of detail.',
    }),
    defineField({
      name: 'articleAvoidPrompt',
      title: 'Avoid in Articles',
      type: 'text',
      rows: 4,
      description:
        'Subjects, claims, phrases, writing habits and content styles to avoid.',
    }),
    defineField({
      name: 'articleCtaPrompt',
      title: 'Article Call to Action',
      type: 'text',
      rows: 4,
      description:
        'Controls how Execora should be mentioned and what readers should be encouraged to do.',
    }),
    defineField({
      name: 'nextArticleTopic',
      title: 'Next Article Topic',
      type: 'string',
      description:
        'Optional one-time topic for the next normal daily article. Leave empty to let the automation select a topic.',
    }),
  ],
})
