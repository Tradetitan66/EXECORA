/**
 * Execora — GROQ queries.
 */

// Single site-settings singleton (id: "siteSettings").
export const siteSettingsQuery = `
  *[_type == "siteSettings" && _id == "siteSettings"][0]{
    businessName,
    heroEyebrow,
    heroTitle,
    heroWords,
    heroSub,
    primaryCta,
    whatsappNumber,
    contactHeading,
    contactSub,
    footerTagline
  }
`

// Blog index — published posts, newest first.
export const blogPostsQuery = `
  *[_type == "blogPost" && defined(slug.current) && publishedDate <= now()]
  | order(publishedDate desc)
  {
    _id,
    title,
    slug,
    category,
    excerpt,
    publishedDate,
    readingTime,
    image
  }
`

// Single blog post by slug.
export const blogPostBySlugQuery = `
  *[_type == "blogPost" && slug.current == $slug && defined(slug.current)][0]
  {
    _id,
    title,
    slug,
    category,
    excerpt,
    publishedDate,
    readingTime,
    image,
    body[]{
      ...,
      markDefs[]{
        ...,
        _type == "link" => { "href": @.href }
      }
    },
    seoTitle,
    seoDescription
  }
`

// All categories present in published posts.
export const blogCategoriesQuery = `
  array::unique(
    *[_type == "blogPost" && defined(slug.current) && publishedDate <= now()].category
  )
`
