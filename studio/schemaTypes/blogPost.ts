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
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'category',
      media: 'image',
    },
  },
})
