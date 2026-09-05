import { defineField, defineType } from 'sanity'

/**
 * Blog post — one featured image per post.
 */
export const blogPost = defineType({
  name: 'blogPost',
  title: 'Blog post',
  type: 'document',
  groups: [
    { name: 'content', title: 'Content' },
    { name: 'seo', title: 'SEO' },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'content',
      options: { source: 'title', maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      group: 'content',
      options: {
        list: [
          { title: 'Website Tips', value: 'Website Tips' },
          { title: 'Local Business', value: 'Local Business' },
          { title: 'Google & SEO', value: 'Google & SEO' },
          { title: 'Customer Experience', value: 'Customer Experience' },
          { title: 'Business Growth', value: 'Business Growth' },
        ],
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      group: 'content',
      rows: 3,
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'image',
      title: 'Featured image',
      type: 'image',
      group: 'content',
      description: 'One image per post (1600×900 recommended).',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          title: 'Alt text',
          type: 'string',
        }),
      ],
    }),
    defineField({
      name: 'publishedDate',
      title: 'Published date',
      type: 'datetime',
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'readingTime',
      title: 'Estimated reading time (minutes)',
      type: 'number',
      group: 'content',
      validation: (r) => r.min(1).integer(),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      group: 'content',
      of: [
        { type: 'block' },
        {
          type: 'image',
          fields: [{ name: 'alt', type: 'string' }],
        },
      ],
    }),
    defineField({
      name: 'seoTitle',
      title: 'SEO title',
      type: 'string',
      group: 'seo',
    }),
    defineField({
      name: 'seoDescription',
      title: 'SEO description',
      type: 'text',
      group: 'seo',
      rows: 3,
    }),
    defineField({
      name: 'primaryKeyword',
      title: 'Primary keyword',
      type: 'string',
      group: 'seo',
      description: 'The single search query this article primarily targets.',
    }),
    defineField({
      name: 'secondaryKeywords',
      title: 'Secondary keywords',
      type: 'array',
      group: 'seo',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      description: '3-6 closely related search terms. Used naturally, never keyword-stuffed.',
    }),
    defineField({
      name: 'searchIntent',
      title: 'Search intent',
      type: 'string',
      group: 'seo',
      options: {
        list: [
          { title: 'Informational', value: 'informational' },
          { title: 'Commercial investigation', value: 'commercial investigation' },
          { title: 'Local', value: 'local' },
          { title: 'Transactional', value: 'transactional' },
        ],
      },
    }),
    defineField({
      name: 'contentCluster',
      title: 'Content cluster',
      type: 'string',
      group: 'seo',
      description:
        'Which topic cluster this article supports (e.g. Website Design, Local SEO, Trades Websites).',
    }),
    defineField({
      name: 'targetLocation',
      title: 'Target location',
      type: 'string',
      group: 'seo',
      description:
        'Location this article is relevant to (e.g. Edinburgh, Penicuik). Leave empty if not locally specific.',
    }),
    defineField({
      name: 'author',
      title: 'Author',
      type: 'string',
      group: 'seo',
      initialValue: 'Execora Editorial Team',
    }),
    defineField({
      name: 'relatedLinks',
      title: 'Related links',
      type: 'array',
      group: 'seo',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'anchor', title: 'Anchor text', type: 'string' },
            {
              name: 'target',
              title: 'Target',
              type: 'string',
              description: 'Execora path such as /website-design or /blog/slug. External URLs only with type external.',
            },
            {
              name: 'type',
              title: 'Type',
              type: 'string',
              options: {
                list: [
                  { title: 'Internal', value: 'internal' },
                  { title: 'External', value: 'external' },
                ],
              },
              initialValue: 'internal',
            },
          ],
        },
      ],
      description: 'Suggested internal links shortlisted for the article.',
    }),
    defineField({
      name: 'externalSources',
      title: 'External sources',
      type: 'array',
      group: 'seo',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'label', title: 'Source label', type: 'string' },
            { name: 'url', title: 'URL', type: 'string' },
          ],
        },
      ],
      description:
        'Authoritative UK/first-party sources cited in the article (Google, GOV.UK, Scottish Government, ONS, ICO).',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'category',
      media: 'image',
    },
  },
})
