#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Secure helper: prompts for secrets, sends blog draft, shows result.
# Secrets are never written to disk or displayed.
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Prompt for secrets ──────────────────────────────────────────────────────
read -rsp "Sanity Write Token (SANITY_WRITE_TOKEN): " SANITY_WRITE_TOKEN && echo
read -rsp "Blog Draft API Secret (BLOG_DRAFT_API_SECRET): " BLOG_DRAFT_API_SECRET && echo
echo

# ── Blog post payload ───────────────────────────────────────────────────────
PAYLOAD=$(cat <<'JSON'
{
  "title": "7 Reasons Local Customers Leave Your Website Without Contacting You",
  "slug": "7-reasons-local-customers-leave-your-website",
  "category": "Website Tips",
  "excerpt": "7 reasons local customers leave your website without contacting you — and the specific fixes for each one. Practical advice for UK local businesses.",
  "seoTitle": "7 Reasons Local Customers Leave Your Website | Execora",
  "seoDescription": "Discover why UK local business websites lose customers and how to fix each one. Practical tips for navigation, speed, trust signals and enquiry forms.",
  "body": [
    {"style": "normal", "text": "Your website is meant to bring in new customers. But if visitors land on your site and leave without getting in touch, you are losing money every single day. For UK local businesses, the gap between a website visit and an actual enquiry is often down to small, fixable problems — not the quality of the service itself."},
    {"style": "normal", "text": "Here are seven reasons local customers leave your website without contacting you, and the specific changes that stop them."},
    {"style": "h2", "text": "1. Confusing navigation"},
    {"style": "normal", "text": "Navigation is the silent killer of local business websites. You have invested in getting people to your site, but if they cannot quickly find your services, pricing, or how to get in touch, they leave. Most visitors decide within seconds whether your site is worth their time."},
    {"style": "normal", "text": "For a local business, confusing navigation typically means:"},
    {"style": "normal", "listItem": "bullet", "text": "Too many menu items — Home, About, Services, Blog, Gallery, Testimonials, FAQ, Contact. That is eight choices when most visitors want two or three."},
    {"style": "normal", "listItem": "bullet", "text": "Buried contact information — phone number hidden in the footer, no WhatsApp button, no clear Get a Quote link."},
    {"style": "normal", "listItem": "bullet", "text": "Industry jargon in menu labels — Solutions or Offerings instead of What We Do or Our Services."},
    {"style": "normal", "listItem": "bullet", "text": "No mobile menu — on a phone screen, your navigation needs to be simple and thumb-friendly."},
    {"style": "normal", "text": "How to fix it:"},
    {"style": "normal", "listItem": "bullet", "text": "Limit your main navigation to five to seven items maximum."},
    {"style": "normal", "listItem": "bullet", "text": "Make your phone number or WhatsApp link always visible at the top of every page."},
    {"style": "normal", "listItem": "bullet", "text": "Label menu items in plain language your customers actually use."},
    {"style": "normal", "listItem": "bullet", "text": "Test your site on a phone — if you need to pinch and zoom to navigate, it is broken."},
    {"style": "h2", "text": "2. Hidden contact buttons"},
    {"style": "normal", "text": "Even visitors ready to buy will not hunt for a way to reach you. If your Contact Us button is small, sits at the bottom of a long page, or looks like a plain text link, people will not find it or will not bother."},
    {"style": "normal", "text": "The problem:"},
    {"style": "normal", "listItem": "bullet", "text": "Contact buttons blending into the background with no contrast."},
    {"style": "normal", "listItem": "bullet", "text": "No floating Call Now or WhatsApp Us button on mobile."},
    {"style": "normal", "listItem": "bullet", "text": "Contact page link buried in the footer with no CTA on service pages."},
    {"style": "normal", "text": "How to fix it:"},
    {"style": "normal", "listItem": "bullet", "text": "Add a prominent, floating contact button on mobile that stays visible as visitors scroll."},
    {"style": "normal", "listItem": "bullet", "text": "Place a strong call to action after every major section on your homepage and service pages."},
    {"style": "normal", "listItem": "bullet", "text": "Use contrasting colours so the button stands out from the rest of the page."},
    {"style": "normal", "listItem": "bullet", "text": "Make sure the button triggers a phone call (tap-to-call) on mobile, not just a form."},
    {"style": "h2", "text": "3. Weak trust signals"},
    {"style": "normal", "text": "First-time visitors do not know you yet. Without proof that you are legitimate and good at what you do, they will choose a competitor they feel safer with."},
    {"style": "normal", "text": "What weak trust signals look like:"},
    {"style": "normal", "listItem": "bullet", "text": "No customer reviews or testimonials."},
    {"style": "normal", "listItem": "bullet", "text": "No photos of real work or real team members."},
    {"style": "normal", "listItem": "bullet", "text": "No industry accreditations or membership logos."},
    {"style": "normal", "listItem": "bullet", "text": "A generic stock photo instead of your actual shop, van, or team."},
    {"style": "normal", "listItem": "bullet", "text": "No physical address or local phone number listed."},
    {"style": "normal", "text": "How to build trust quickly:"},
    {"style": "normal", "listItem": "bullet", "text": "Display Google Reviews or Trustpilot scores prominently on your homepage."},
    {"style": "normal", "listItem": "bullet", "text": "Show before-and-after photos of real jobs you have completed."},
    {"style": "normal", "listItem": "bullet", "text": "Add logos of trade bodies you belong to — Federation of Master Builders, Gas Safe Register, Checkatrade, or similar."},
    {"style": "normal", "listItem": "bullet", "text": "Include your full address and local phone number in the header and footer."},
    {"style": "normal", "listItem": "bullet", "text": "Write a short About Us section with a photo of you or your team — people buy from people."},
    {"style": "h2", "text": "4. Slow mobile performance"},
    {"style": "normal", "text": "More than half of your visitors are on their phones. If your site takes more than three seconds to load on a mobile connection, many will leave before they see anything."},
    {"style": "normal", "text": "Common causes of slow local business websites:"},
    {"style": "normal", "listItem": "bullet", "text": "Large, unoptimised images — especially hero banners and gallery photos."},
    {"style": "normal", "listItem": "bullet", "text": "Too many plugins or scripts running in the background."},
    {"style": "normal", "listItem": "bullet", "text": "Cheap hosting with slow server response times."},
    {"style": "normal", "listItem": "bullet", "text": "No caching or content delivery network configured."},
    {"style": "normal", "text": "How to fix it:"},
    {"style": "normal", "listItem": "bullet", "text": "Compress your images before uploading — aim for under 200KB per image."},
    {"style": "normal", "listItem": "bullet", "text": "Run your site through Google PageSpeed Insights and fix the red items."},
    {"style": "normal", "listItem": "bullet", "text": "Remove any plugins or widgets you do not actually use."},
    {"style": "normal", "listItem": "bullet", "text": "Ask your web developer about caching and a content delivery network."},
    {"style": "normal", "listItem": "bullet", "text": "If your site takes more than three seconds to load, it is costing you customers."},
    {"style": "h2", "text": "5. Unclear service areas"},
    {"style": "normal", "text": "A visitor from Birmingham lands on your site but has no idea if you cover their area. If you do not clearly state where you work, they will assume you are too far away and move on."},
    {"style": "normal", "text": "The problem:"},
    {"style": "normal", "listItem": "bullet", "text": "No mention of your service area anywhere on the site."},
    {"style": "normal", "listItem": "bullet", "text": "A single Coverage page that nobody visits."},
    {"style": "normal", "listItem": "bullet", "text": "No local SEO signals — no mention of specific towns, postcodes, or areas."},
    {"style": "normal", "text": "How to fix it:"},
    {"style": "normal", "listItem": "bullet", "text": "State your service area on the homepage — Serving homes and businesses across [Your Town] and [Surrounding Areas]."},
    {"style": "normal", "listItem": "bullet", "text": "Create individual location pages for each area you serve."},
    {"style": "normal", "listItem": "bullet", "text": "Include your service area in your page titles and meta descriptions."},
    {"style": "normal", "listItem": "bullet", "text": "Add a simple Google Maps embed showing your coverage area."},
    {"style": "h2", "text": "6. Poor calls to action"},
    {"style": "normal", "text": "Many local business websites are essentially brochures — they describe what the business does but never ask the visitor to do anything. Without a clear call to action, visitors read the page and leave."},
    {"style": "normal", "text": "What poor calls to action look like:"},
    {"style": "normal", "listItem": "bullet", "text": "No call to action above the fold on your homepage."},
    {"style": "normal", "listItem": "bullet", "text": "Vague language like Get in touch with no context about what happens next."},
    {"style": "normal", "listItem": "bullet", "text": "No urgency or reason to act now."},
    {"style": "normal", "listItem": "bullet", "text": "Calls to action that do not match the visitor's intent at that point on the page."},
    {"style": "normal", "text": "How to fix it:"},
    {"style": "normal", "listItem": "bullet", "text": "Place a clear call to action above the fold on every page — Get a Free Quote or Book a Consultation."},
    {"style": "normal", "listItem": "bullet", "text": "Use action-specific language — Call for a Same-Day Quote beats Contact Us."},
    {"style": "normal", "listItem": "bullet", "text": "Add a secondary call to action further down the page for visitors who need more information first."},
    {"style": "normal", "listItem": "bullet", "text": "Make sure your call to action leads somewhere useful — a simple form, a phone call, or a WhatsApp chat."},
    {"style": "h2", "text": "7. Difficult enquiry forms"},
    {"style": "normal", "text": "You have done everything right — the visitor is ready to contact you. Then they hit your enquiry form and give up. Long, complicated forms are the final barrier between you and a new customer."},
    {"style": "normal", "text": "What puts people off:"},
    {"style": "normal", "listItem": "bullet", "text": "Too many required fields — name, email, phone, address, service, budget, preferred date, and message."},
    {"style": "normal", "listItem": "bullet", "text": "No progress indicator on multi-step forms."},
    {"style": "normal", "listItem": "bullet", "text": "Forms that do not work on mobile or are hard to tap with a thumb."},
    {"style": "normal", "listItem": "bullet", "text": "No confirmation that the form was submitted successfully."},
    {"style": "normal", "text": "How to fix it:"},
    {"style": "normal", "listItem": "bullet", "text": "Ask for only what you need to respond — name, phone number, and a brief message."},
    {"style": "normal", "listItem": "bullet", "text": "Make phone number the primary field so you can call them back quickly."},
    {"style": "normal", "listItem": "bullet", "text": "Show a clear Thank You confirmation after submission."},
    {"style": "normal", "listItem": "bullet", "text": "Set up instant notifications so you respond within minutes, not days."},
    {"style": "normal", "listItem": "bullet", "text": "Test your form on your own phone — if it is annoying for you, it is annoying for your customers."},
    {"style": "h2", "text": "Your website checklist"},
    {"style": "normal", "text": "Go through each item and tick it off. If you cannot tick it, fix it this week:"},
    {"style": "normal", "listItem": "bullet", "text": "Main navigation has seven or fewer items."},
    {"style": "normal", "listItem": "bullet", "text": "Phone number or WhatsApp link is visible on every page."},
    {"style": "normal", "listItem": "bullet", "text": "Contact button uses a contrasting colour and stands out."},
    {"style": "normal", "listItem": "bullet", "text": "Mobile visitors see a floating call or WhatsApp button."},
    {"style": "normal", "listItem": "bullet", "text": "Homepage displays Google Reviews or customer testimonials."},
    {"style": "normal", "listItem": "bullet", "text": "Real photos of your work, team, or premises are visible."},
    {"style": "normal", "listItem": "bullet", "text": "Trade body logos or accreditations are displayed."},
    {"style": "normal", "listItem": "bullet", "text": "Your physical address and local phone number are in the header or footer."},
    {"style": "normal", "listItem": "bullet", "text": "Site loads in under three seconds on mobile."},
    {"style": "normal", "listItem": "bullet", "text": "Images are compressed and under 200KB each."},
    {"style": "normal", "listItem": "bullet", "text": "Service area is stated clearly on the homepage."},
    {"style": "normal", "listItem": "bullet", "text": "You have individual location pages for each area you serve."},
    {"style": "normal", "listItem": "bullet", "text": "A clear call to action appears above the fold on every page."},
    {"style": "normal", "listItem": "bullet", "text": "Your enquiry form asks for no more than three fields."},
    {"style": "normal", "listItem": "bullet", "text": "Form submission shows a confirmation message."},
    {"style": "normal", "listItem": "bullet", "text": "You receive instant notifications for new enquiries."},
    {"style": "normal", "text": "Most of these fixes take less than a day to implement. The ones that take longer — like location pages or speed optimisation — are still worth doing because they bring in more local customers over time."},
    {"style": "normal", "text": "Start with the checklist. Fix what you can this week. The rest can follow. Every improvement makes it easier for the next visitor to choose you over a competitor."}
  ]
}
JSON
)

# ── Send request ─────────────────────────────────────────────────────────────
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST https://www.execora.work/api/create-blog-draft \
  -H "Authorization: Bearer ${BLOG_DRAFT_API_SECRET}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "────────────────────────────────────────"
echo "HTTP Status : ${HTTP_CODE}"
echo "────────────────────────────────────────"
echo "${BODY}" | python3 -m json.tool 2>/dev/null || echo "${BODY}"
echo "────────────────────────────────────────"
