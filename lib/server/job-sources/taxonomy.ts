/**
 * The job domain taxonomy.
 *
 * WHY THIS IS NOT `SERVICE_CATEGORIES`. lib/services-ui.ts holds a 23-key
 * category map, and it was the first candidate for reuse. It is not the right
 * list for jobs, for two reasons that both matter:
 *
 *   · It is a PRESENTATION map for the services marketplace - label, colour,
 *     background and emoji - consumed by six services and projects screens.
 *     Classifying jobs through it would couple the ingestion classifier to a
 *     UI palette, so changing a service's colour would touch job data.
 *   · Its buckets are service-shaped. It carries photography, music, events,
 *     personal and coaching, which are not job domains, and it has no sales,
 *     product, operations or customer support, which are among the largest.
 *     Forcing jobs into it would collapse distinct domains without evidence.
 *
 * WHAT IS SHARED ANYWAY. Every key below that has a genuine equivalent in
 * SERVICE_CATEGORIES uses the SAME key string - design, marketing, finance,
 * legal, hr, data, education, health, engineering, writing. So the two
 * vocabularies agree wherever they overlap, and a later phase that wants to
 * show a job and a service side by side can key both off one string. Only the
 * genuinely job-specific domains are new.
 *
 * NOTHING HERE IS FUZZY. Classification is keyword scoring over fields the
 * posting actually contains. There is no model, no network and no clock, so
 * the same job always lands in the same domain.
 */

/** The canonical domains. `other` is the explicit "did not match" bucket. */
export const JOB_DOMAINS = [
  'software', 'data', 'ai', 'design', 'product', 'marketing', 'sales',
  'finance', 'hr', 'operations', 'legal', 'support', 'health', 'education',
  'engineering', 'writing', 'security', 'other',
] as const;

export type JobDomain = typeof JOB_DOMAINS[number];

/** Human labels. Kept here so no caller has to invent one. */
export const JOB_DOMAIN_LABELS: Record<JobDomain, string> = {
  software: 'Software Engineering',
  data: 'Data & Analytics',
  ai: 'AI & Machine Learning',
  design: 'Design',
  product: 'Product',
  marketing: 'Marketing',
  sales: 'Sales',
  finance: 'Finance & Accounting',
  hr: 'HR & Recruiting',
  operations: 'Operations',
  legal: 'Legal',
  support: 'Customer Support',
  health: 'Healthcare',
  education: 'Education',
  engineering: 'Engineering (non-software)',
  writing: 'Content & Writing',
  security: 'Security',
  other: 'Other',
};

/**
 * Sub-domains offered per domain, for the `subDomain` field.
 *
 * Only assigned when a sub-domain keyword is matched outright; there is no
 * default sub-domain, because "Software Engineering / Backend" is a claim and
 * "Software Engineering" alone is the honest answer when the posting did not
 * say which side of the stack it is.
 */
export const JOB_SUBDOMAINS: Partial<Record<JobDomain, Record<string, RegExp>>> = {
  software: {
    Frontend: /\b(frontend|front[- ]end|react|angular|vue|svelte|ui engineer)\b/i,
    Backend: /\b(backend|back[- ]end|server[- ]side|api engineer|microservices)\b/i,
    'Full Stack': /\b(full[- ]?stack)\b/i,
    Mobile: /\b(android|ios|react native|flutter|mobile engineer|swift|kotlin)\b/i,
    DevOps: /\b(devops|sre|site reliability|platform engineer|infrastructure engineer|kubernetes)\b/i,
    QA: /\b(qa|quality assurance|test engineer|sdet|automation tester)\b/i,
    Embedded: /\b(embedded|firmware|rtos)\b/i,
  },
  data: {
    'Data Engineering': /\b(data engineer|etl|data pipeline|spark|airflow|warehouse)\b/i,
    'Data Science': /\b(data scientist|data science)\b/i,
    Analytics: /\b(analyst|analytics|business intelligence|\bbi\b|tableau|power bi)\b/i,
  },
  ai: {
    'Machine Learning': /\b(machine learning|\bml\b|deep learning|pytorch|tensorflow)\b/i,
    'NLP': /\b(nlp|natural language|llm|large language model)\b/i,
    'Computer Vision': /\b(computer vision|image recognition)\b/i,
  },
  design: {
    'Product Design': /\b(product design|ux|user experience)\b/i,
    'Visual Design': /\b(visual design|graphic design|brand)\b/i,
    Research: /\b(user research|ux research)\b/i,
  },
  marketing: {
    Growth: /\b(growth|performance marketing|demand gen)\b/i,
    Content: /\b(content marketing|content strategist)\b/i,
    SEO: /\b(seo|search engine optimi)\b/i,
    Social: /\b(social media)\b/i,
  },
  sales: {
    'Business Development': /\b(business development|\bbd\b|bdr)\b/i,
    'Account Management': /\b(account manager|account executive|\bae\b)\b/i,
    'Inside Sales': /\b(inside sales|sdr|sales development)\b/i,
  },
};

/**
 * Domain keyword rules.
 *
 * Each entry is a regular expression and the weight one match contributes.
 * Weights encode how much a phrase PROVES the domain: "software engineer" is
 * decisive, "engineer" alone is a weak hint that half a dozen domains share.
 *
 * The lists stay small on purpose. A large hand-written keyword set looks
 * thorough and is mostly untested guesswork; these cover the phrases that
 * actually appear in the ATS boards this platform ingests.
 */
export const DOMAIN_RULES: Record<Exclude<JobDomain, 'other'>, Array<[RegExp, number]>> = {
  software: [
    [/\b(software engineer|software developer|swe\b|programmer)\b/i, 10],
    [/\b(frontend|front[- ]end|backend|back[- ]end|full[- ]?stack)\b/i, 8],
    [/\b(developer|engineer)\b.*\b(web|api|platform|application|mobile)\b/i, 6],
    [/\b(react|angular|vue|node\.?js|django|rails|spring boot|\.net|golang|typescript|javascript|python developer)\b/i, 5],
    [/\b(devops|sre|site reliability|kubernetes|docker|microservices)\b/i, 6],
    [/\b(android|ios|flutter|react native)\b/i, 6],
    [/\b(qa engineer|sdet|test automation)\b/i, 5],
  ],
  data: [
    [/\b(data engineer|data analyst|data scientist|analytics engineer)\b/i, 10],
    [/\b(business intelligence|\bbi developer\b|data warehouse|etl)\b/i, 7],
    [/\b(sql|snowflake|spark|airflow|dbt|tableau|power bi|looker)\b/i, 4],
    [/\b(analytics|reporting|dashboards)\b/i, 3],
  ],
  ai: [
    [/\b(machine learning engineer|ml engineer|ai engineer|research scientist)\b/i, 10],
    [/\b(machine learning|deep learning|neural network|computer vision|\bnlp\b)\b/i, 7],
    [/\b(pytorch|tensorflow|hugging ?face|\bllm\b|large language model|generative ai)\b/i, 6],
  ],
  design: [
    [/\b(product designer|ux designer|ui designer|graphic designer|visual designer)\b/i, 10],
    [/\b(ux|user experience|user interface|interaction design|design system)\b/i, 6],
    [/\b(figma|sketch|adobe xd|photoshop|illustrator)\b/i, 4],
  ],
  product: [
    [/\b(product manager|product owner|\bpm\b|group product manager|associate product manager)\b/i, 10],
    [/\b(product strategy|roadmap|product analytics|user stories|backlog grooming)\b/i, 5],
  ],
  marketing: [
    [/\b(marketing manager|growth marketer|digital marketing|brand manager|marketing executive)\b/i, 10],
    [/\b(seo|sem|content marketing|social media|campaign|demand generation)\b/i, 6],
    [/\b(google ads|hubspot|mailchimp|marketo)\b/i, 4],
  ],
  sales: [
    [/\b(sales|account executive|business development|inside sales|sales development)\b/i, 9],
    [/\b(\bbdr\b|\bsdr\b|\bae\b|quota|pipeline generation|prospecting|cold calling)\b/i, 6],
    [/\b(crm|salesforce|hubspot crm)\b/i, 3],
  ],
  finance: [
    [/\b(accountant|financial analyst|finance manager|controller|auditor|bookkeeper)\b/i, 10],
    [/\b(accounting|taxation|payroll|accounts payable|accounts receivable|financial reporting)\b/i, 7],
    [/\b(gaap|ifrs|quickbooks|tally|\bcpa\b|\bca\b)\b/i, 4],
  ],
  hr: [
    [/\b(recruiter|talent acquisition|hr manager|human resources|hrbp|people operations)\b/i, 10],
    [/\b(onboarding|employee engagement|payroll administration|hiring manager)\b/i, 5],
  ],
  operations: [
    [/\b(operations manager|operations executive|supply chain|logistics|warehouse manager|procurement)\b/i, 10],
    [/\b(process improvement|vendor management|inventory|fulfilment|fulfillment)\b/i, 5],
  ],
  legal: [
    [/\b(lawyer|attorney|legal counsel|paralegal|company secretary|compliance officer)\b/i, 10],
    [/\b(contracts|litigation|intellectual property|regulatory compliance)\b/i, 6],
  ],
  support: [
    [/\b(customer support|customer success|technical support|support engineer|help ?desk|service desk)\b/i, 10],
    [/\b(ticketing|zendesk|freshdesk|sla|customer satisfaction|csat)\b/i, 5],
    [/\b(call centre|call center|bpo|voice process)\b/i, 6],
  ],
  health: [
    [/\b(nurse|physician|doctor|clinician|pharmacist|medical officer|radiologist|therapist)\b/i, 10],
    [/\b(patient care|clinical|healthcare|hospital|diagnosis)\b/i, 6],
  ],
  education: [
    [/\b(teacher|professor|lecturer|tutor|instructor|academic coordinator)\b/i, 10],
    [/\b(curriculum|classroom|syllabus|pedagogy|student assessment)\b/i, 6],
  ],
  engineering: [
    [/\b(mechanical engineer|civil engineer|electrical engineer|chemical engineer|structural engineer)\b/i, 10],
    [/\b(autocad|solidworks|\bcad\b|site engineer|manufacturing engineer|maintenance engineer)\b/i, 6],
  ],
  writing: [
    [/\b(technical writer|content writer|copywriter|editor|journalist)\b/i, 10],
    [/\b(copywriting|proofreading|documentation|editorial)\b/i, 5],
  ],
  security: [
    [/\b(security engineer|security analyst|penetration tester|infosec|cybersecurity)\b/i, 10],
    [/\b(soc analyst|vulnerability|threat detection|\bsiem\b|iso 27001)\b/i, 6],
  ],
};

/**
 * Source-supplied category labels mapped onto canonical domains.
 *
 * ATS boards expose a team or department string ("Engineering", "People",
 * "GTM"), which is stronger evidence than any keyword because a human at the
 * company chose it. Only unambiguous labels appear here - a department called
 * "Operations" at a logistics firm and at a SaaS firm mean different things,
 * so it maps to `operations` only as a weighted signal, never as an override.
 */
export const SOURCE_CATEGORY_ALIASES: Record<string, JobDomain> = {
  engineering: 'software',
  'software engineering': 'software',
  'software development': 'software',
  development: 'software',
  developers: 'software',
  technology: 'software',
  tech: 'software',
  it: 'software',
  'r&d': 'software',
  infrastructure: 'software',
  platform: 'software',
  data: 'data',
  'data science': 'data',
  analytics: 'data',
  'business intelligence': 'data',
  ai: 'ai',
  'machine learning': 'ai',
  'artificial intelligence': 'ai',
  research: 'ai',
  design: 'design',
  ux: 'design',
  'user experience': 'design',
  product: 'product',
  'product management': 'product',
  marketing: 'marketing',
  growth: 'marketing',
  brand: 'marketing',
  sales: 'sales',
  gtm: 'sales',
  'go to market': 'sales',
  'business development': 'sales',
  revenue: 'sales',
  finance: 'finance',
  accounting: 'finance',
  'finance & accounting': 'finance',
  hr: 'hr',
  people: 'hr',
  'people operations': 'hr',
  'human resources': 'hr',
  recruiting: 'hr',
  'talent acquisition': 'hr',
  operations: 'operations',
  ops: 'operations',
  'supply chain': 'operations',
  logistics: 'operations',
  legal: 'legal',
  compliance: 'legal',
  support: 'support',
  'customer support': 'support',
  'customer success': 'support',
  'customer experience': 'support',
  healthcare: 'health',
  clinical: 'health',
  medical: 'health',
  education: 'education',
  academics: 'education',
  teaching: 'education',
  content: 'writing',
  editorial: 'writing',
  security: 'security',
  infosec: 'security',
  'information security': 'security',
};
