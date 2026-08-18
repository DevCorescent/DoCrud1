/**
 * Service category → subcategory taxonomy.
 *
 * The specification lists twenty primary categories and requires every service
 * to carry a primary category "and, where appropriate, a subcategory", but it
 * does not enumerate the subcategories themselves. It does state that the
 * category structure must be configurable so more can be introduced later, so
 * this file is that configuration point: editing this map is the whole change
 * needed to add, rename or remove a subcategory.
 *
 * The lists below are a starting taxonomy and need product sign-off. Nothing
 * reads them as authoritative data — a service simply stores whichever string
 * the provider chose, and services created before subcategories existed keep
 * no subcategory at all.
 */

/** Subcategories per primary category key. Categories absent here offer none. */
export const SERVICE_SUBCATEGORIES: Record<string, string[]> = {
  design:        ['Brand & Identity', 'UI/UX', 'Graphic Design', 'Product Design', 'Illustration', 'Presentation Design'],
  development:   ['Web Development', 'Mobile Apps', 'Backend & APIs', 'E-commerce', 'DevOps', 'QA & Testing'],
  marketing:     ['SEO', 'Social Media', 'Paid Advertising', 'Content Marketing', 'Email Marketing', 'Brand Strategy'],
  writing:       ['Copywriting', 'Technical Writing', 'Editing & Proofreading', 'Translation', 'Scriptwriting'],
  consulting:    ['Strategy', 'Operations', 'Product Consulting', 'Management Consulting'],
  business:      ['Company Registration', 'Compliance', 'Bookkeeping', 'Market Research', 'Virtual Assistance'],
  finance:       ['Accounting', 'Taxation', 'Financial Modelling', 'Auditing', 'Investment Advisory'],
  legal:         ['Contracts', 'Intellectual Property', 'Corporate Law', 'Litigation Support', 'Compliance'],
  photography:   ['Product Photography', 'Event Photography', 'Portrait', 'Real Estate', 'Photo Editing'],
  video:         ['Video Editing', 'Animation', 'Motion Graphics', 'Videography', 'Explainer Videos'],
  architecture:  ['Residential', 'Commercial', 'Interior Design', '3D Visualisation', 'Landscape'],
  engineering:   ['Civil', 'Mechanical', 'Electrical', 'Structural', 'CAD & Drafting'],
  education:     ['Tutoring', 'Course Creation', 'Test Preparation', 'Curriculum Design', 'Corporate Training'],
  technology:    ['IT Support', 'Cloud & Infrastructure', 'Cybersecurity', 'Systems Integration', 'Networking'],
  ai:            ['Machine Learning', 'Generative AI', 'Data Science', 'Automation', 'AI Consulting'],
  data:          ['Data Analysis', 'Data Engineering', 'Business Intelligence', 'Data Visualisation', 'Data Entry'],
  hr:            ['Recruitment', 'HR Operations', 'Payroll', 'Training & Development', 'Employer Branding'],
  events:        ['Event Planning', 'Wedding Planning', 'Corporate Events', 'Event Production', 'Catering'],
  personal:      ['Fitness Training', 'Nutrition', 'Life Coaching', 'Home Services', 'Styling'],
  music:         ['Music Production', 'Mixing & Mastering', 'Composition', 'Voice Over'],
  coaching:      ['Career Coaching', 'Executive Coaching', 'Interview Preparation'],
  health:        ['Wellness', 'Physiotherapy', 'Mental Health', 'Nutrition'],
  other:         [],
};

/** Subcategories available for a category. Empty when the category has none. */
export function subcategoriesFor(category: string): string[] {
  return SERVICE_SUBCATEGORIES[category] ?? [];
}

/**
 * Whether a subcategory is valid for a category. An empty subcategory is
 * always valid — the specification makes it conditional ("where appropriate"),
 * not mandatory.
 */
export function isValidSubcategory(category: string, subcategory?: string): boolean {
  if (!subcategory) return true;
  return subcategoriesFor(category).includes(subcategory);
}
