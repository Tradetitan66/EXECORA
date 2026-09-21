/**
 * Execora - GROQ queries.
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
    footerTagline,
    essentialMonthlyFee,
    growthMonthlyFee
  }
`

// Blog index - published posts, newest first.
export const blogPostsQuery = `
  *[_type == "blogPost" && defined(slug.current) && publishedDate <= now()]
  | order(publishedDate desc)
  {
    _id,
    _updatedAt,
    title,
    slug,
    category,
    contentCluster,
    excerpt,
    publishedDate,
    readingTime,
    image {
      ...,
      asset-> {
        _id,
        metadata { dimensions { width, height } }
      }
    }
  }
`

// Single blog post by slug.
export const blogPostBySlugQuery = `
  *[_type == "blogPost" && slug.current == $slug && defined(slug.current)][0]
  {
    _id,
    _updatedAt,
    title,
    slug,
    category,
    excerpt,
    publishedDate,
    readingTime,
    image {
      ...,
      asset-> {
        _id,
        metadata { dimensions { width, height } }
      }
    },
    body[]{
      ...,
      "imageDims": image.asset->.metadata.dimensions,
      markDefs[]{
        ...,
        _type == "link" => { "href": @.href }
      }
    },
    seoTitle,
    seoDescription,
    primaryKeyword,
    secondaryKeywords,
    searchIntent,
    contentCluster,
    targetLocation,
    author,
    relatedLinks,
    externalSources
  }
`

// All categories present in published posts.
export const blogCategoriesQuery = `
  array::unique(
    *[_type == "blogPost" && defined(slug.current) && publishedDate <= now()].category
  )
`
