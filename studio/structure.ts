import { structureTool } from 'sanity/structure'

/**
 * Simple, client-friendly structure:
 *  - "Blog posts" (list)
 *  - "Blog automation settings" (singleton)
 *  - "Site settings" (singleton)
 * Only shows content relevant to this website.
 */
export const structure = structureTool({
  title: 'Content',
  structure: (S) =>
    S.list()
      .title('Execora content')
      .items([
        S.listItem()
          .title('Blog posts')
          .schemaType('blogPost')
          .child(S.documentTypeList('blogPost').title('Blog posts')),
        S.divider(),
        S.listItem()
          .title('Blog automation settings')
          .child(
            S.editor()
              .id('blogAutomationSettings')
              .schemaType('blogAutomationSettings')
              .documentId('blogAutomationSettings')
              .title('Blog automation settings'),
          ),
        S.listItem()
          .title('Site settings')
          .child(
            S.editor()
              .id('siteSettings')
              .schemaType('siteSettings')
              .documentId('siteSettings')
              .title('Site settings'),
          ),
      ]),
})
