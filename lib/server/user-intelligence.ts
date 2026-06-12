import { getStoredUsers, saveStoredUsers } from '@/lib/server/auth';
import { readJsonFile, userActivityPath, userFeedbackPath, writeJsonFile } from '@/lib/server/storage';
import { User, UserActivityEvent, UserFeedbackEntry, UserIntelligenceOverview } from '@/types/document';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  generate: 'E-sign Documents',
  summary: 'Document Summary',
  history: 'History',
  doxpert: 'DoXpert AI',
  visualizer: 'Visualizer AI',
  docsheet: 'DocSheet',
  'file-transfers': 'File Transfers',
  'document-encrypter': 'Document Encrypter',
  'internal-mailbox': 'Internal Mailbox',
  'team-workspace': 'Team Workspace',
  profile: 'Profile',
  billing: 'Billing',
  support: 'AI Support',
  'daily-tools': 'Daily Tools',
  tutorials: 'Tutorials',
  'client-portal': 'Client Portal',
  'business-settings': 'Business Settings',
  'employee-portal': 'Employee Portal',
};

const FEEDBACK_THEME_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Mobile usability', pattern: /\bmobile|phone|responsive|small screen\b/i },
  { label: 'Performance and speed', pattern: /\bslow|lag|speed|performance|loading|flicker\b/i },
  { label: 'Navigation clarity', pattern: /\bnavigation|sidebar|menu|find|discover|confusing\b/i },
  { label: 'Billing and plans', pattern: /\bbilling|pricing|plan|payment|checkout|razorpay\b/i },
  { label: 'Documents and generation', pattern: /\bdocument|template|generate|draft|parser|summary\b/i },
  { label: 'DocSheet and data', pattern: /\bdocsheet|sheet|spreadsheet|excel|csv|visualizer|chart\b/i },
  { label: 'Sharing and security', pattern: /\btransfer|share|password|encrypt|security|signature\b/i },
  { label: 'Team collaboration', pattern: /\bteam|mailbox|mail|collaboration|member|invite\b/i },
];

function incrementCount(map: Map<string, number>, label?: string) {
  if (!label) return;
  map.set(label, (map.get(label) || 0) + 1);
}

function buildStatus(value: number, watch: number, critical: number) {
  if (value <= critical) return 'critical' as const;
  if (value <= watch) return 'watch' as const;
  return 'healthy' as const;
}

export async function getUserActivityEvents() {
  return readJsonFile<UserActivityEvent[]>(userActivityPath, []);
}

export async function saveUserActivityEvents(events: UserActivityEvent[]) {
  await writeJsonFile(userActivityPath, events);
}

export async function appendUserActivityEvent(actor: User, payload: Omit<UserActivityEvent, 'id' | 'createdAt' | 'userId' | 'userEmail' | 'userName' | 'role' | 'accountType' | 'organizationId' | 'organizationName'>) {
  const now = new Date().toISOString();
  const events = await getUserActivityEvents();
  const event: UserActivityEvent = {
    id: createId('ua'),
    userId: actor.id,
    userEmail: actor.email,
    userName: actor.name,
    role: actor.role,
    accountType: actor.accountType,
    organizationId: actor.organizationId || (actor.role === 'client' ? actor.id : undefined),
    organizationName: actor.organizationName,
    createdAt: now,
    ...payload,
  };

  await saveUserActivityEvents([event, ...events].slice(0, 20000));

  const users = await getStoredUsers();
  const nextUsers = users.map((entry) => entry.id === actor.id ? { ...entry, lastActivityAt: now } : entry);
  await saveStoredUsers(nextUsers);

  return event;
}

export async function getUserFeedbackEntries() {
  return readJsonFile<UserFeedbackEntry[]>(userFeedbackPath, []);
}

export async function saveUserFeedbackEntries(entries: UserFeedbackEntry[]) {
  await writeJsonFile(userFeedbackPath, entries);
}

export async function submitUserFeedback(actor: User, payload: {
  rating: 1 | 2 | 3 | 4 | 5;
  summary: string;
  painPoints: string;
  requestedImprovements: string;
  mostUsedFeature?: string;
}) {
  const entries = await getUserFeedbackEntries();
  const entry: UserFeedbackEntry = {
    id: createId('uf'),
    userId: actor.id,
    userEmail: actor.email,
    userName: actor.name,
    role: actor.role,
    accountType: actor.accountType,
    organizationId: actor.organizationId || (actor.role === 'client' ? actor.id : undefined),
    organizationName: actor.organizationName,
    createdAt: new Date().toISOString(),
    ...payload,
  };
  await saveUserFeedbackEntries([entry, ...entries].slice(0, 5000));
  await appendUserActivityEvent(actor, {
    eventType: 'feedback_submitted',
    featureId: 'product-feedback',
    detail: payload.summary.slice(0, 160),
  });
  return entry;
}

export async function getFeedbackPromptStatus(user: User) {
  const entries = await getUserFeedbackEntries();
  const latest = entries.find((entry) => entry.userId === user.id);
  const now = Date.now();
  const intervalMs = 1000 * 60 * 60 * 24 * 3;
  const nextPromptAt = latest ? new Date(new Date(latest.createdAt).getTime() + intervalMs).toISOString() : new Date(now).toISOString();
  return {
    latest,
    shouldPrompt: !latest || now >= new Date(nextPromptAt).getTime(),
    nextPromptAt,
  };
}

export async function getUserIntelligenceOverview(): Promise<UserIntelligenceOverview> {
  const [users, events, feedback] = await Promise.all([
    getStoredUsers(),
    getUserActivityEvents(),
    getUserFeedbackEntries(),
  ]);

  const trackedUsers = users.filter((user) => user.role !== 'admin');
  const now = Date.now();
  const events24h = events.filter((event) => now - new Date(event.createdAt).getTime() <= 24 * 60 * 60 * 1000);
  const events7d = events.filter((event) => now - new Date(event.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000);
  const activeUsers24h = new Set(events24h.map((event) => event.userId)).size;
  const activeUsers7d = new Set(events7d.map((event) => event.userId)).size;
  const averageFeedbackRating = feedback.length
    ? Number((feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1))
    : 0;
  const feedbackCoverageRate = trackedUsers.length === 0
    ? 0
    : Math.round((new Set(feedback.map((entry) => entry.userId)).size / trackedUsers.length) * 100);

  const topTabMap = new Map<string, number>();
  const topFeatureMap = new Map<string, number>();
  events7d.forEach((event) => {
    if (event.tabId) incrementCount(topTabMap, TAB_LABELS[event.tabId] || event.tabId);
    if (event.featureId) incrementCount(topFeatureMap, TAB_LABELS[event.featureId] || event.featureId);
  });

  const requestMap = new Map<string, number>();
  const painPointMap = new Map<string, number>();
  feedback.forEach((entry) => {
    FEEDBACK_THEME_PATTERNS.forEach((theme) => {
      if (theme.pattern.test(`${entry.requestedImprovements} ${entry.summary}`)) {
        incrementCount(requestMap, theme.label);
      }
      if (theme.pattern.test(`${entry.painPoints} ${entry.summary}`)) {
        incrementCount(painPointMap, theme.label);
      }
    });
  });

  const feedbackByUser = new Map<string, UserFeedbackEntry>();
  feedback.forEach((entry) => {
    if (!feedbackByUser.has(entry.userId)) {
      feedbackByUser.set(entry.userId, entry);
    }
  });

  const activityByUser = new Map<string, UserActivityEvent[]>();
  events7d.forEach((event) => {
    const list = activityByUser.get(event.userId) || [];
    list.push(event);
    activityByUser.set(event.userId, list);
  });

  const userActivity = trackedUsers.map((user) => {
    const userEvents = activityByUser.get(user.id) || [];
    const lastSeenAt = userEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt || user.lastActivityAt || user.lastLogin;
    const tabCount = new Map<string, number>();
    userEvents.forEach((event) => incrementCount(tabCount, TAB_LABELS[event.tabId || ''] || event.tabId));
    const topTab = Array.from(tabCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    const eventsCount = userEvents.length;
    const status: 'power' | 'active' | 'slipping' = eventsCount >= 12 ? 'power' : eventsCount >= 4 ? 'active' : 'slipping';
    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: user.role,
      organizationName: user.organizationName,
      lastSeenAt,
      events7d: eventsCount,
      topTab,
      feedbackRating: feedbackByUser.get(user.id)?.rating,
      status,
    };
  }).sort((a, b) => (b.events7d - a.events7d) || ((new Date(b.lastSeenAt || 0).getTime()) - new Date(a.lastSeenAt || 0).getTime()));

  const adoptionStatus = buildStatus(activeUsers7d, Math.max(1, Math.round(trackedUsers.length * 0.4)), Math.max(1, Math.round(trackedUsers.length * 0.2)));
  const engagementStatus = buildStatus(events7d.length, Math.max(20, trackedUsers.length * 8), Math.max(10, trackedUsers.length * 4));
  const satisfactionStatus = averageFeedbackRating >= 4.1 ? 'healthy' : averageFeedbackRating >= 3.3 ? 'watch' : averageFeedbackRating === 0 ? 'watch' : 'critical';

  const recommendations: UserIntelligenceOverview['recommendations'] = [];
  if (activeUsers7d < Math.max(1, Math.round(trackedUsers.length * 0.55))) {
    recommendations.push({
      id: 'reactivate-users',
      title: 'Re-activate more logged-in users',
      detail: 'A meaningful portion of non-admin users are not returning often enough. Push simpler daily-use entry points like Daily Tools, Dashboard guidance, and role-based starting actions.',
      priority: 'high',
    });
  }
  if ((requestMap.get('Mobile usability') || 0) >= 2) {
    recommendations.push({
      id: 'mobile-priority',
      title: 'Mobile experience is a recurring request',
      detail: 'User feedback is repeatedly pointing to mobile usability. Continue reducing clutter, improve tab flows, and keep high-frequency actions closer to thumb reach.',
      priority: 'high',
    });
  }
  if ((requestMap.get('Navigation clarity') || 0) >= 2 || (painPointMap.get('Navigation clarity') || 0) >= 2) {
    recommendations.push({
      id: 'navigation-clarity',
      title: 'Navigation still needs simplification',
      detail: 'Users are still asking for clearer navigation. Keep grouping features by task and reduce duplicate entry points across the workspace.',
      priority: 'medium',
    });
  }
  if ((requestMap.get('DocSheet and data') || 0) >= 2) {
    recommendations.push({
      id: 'data-workflow-demand',
      title: 'Data workflow features are driving attention',
      detail: 'DocSheet, Visualizer, and spreadsheet intelligence are receiving repeated demand. Prioritize polish, formula helpers, and insight depth in those areas.',
      priority: 'medium',
    });
  }
  if (averageFeedbackRating > 0 && averageFeedbackRating < 3.5) {
    recommendations.push({
      id: 'satisfaction-recovery',
      title: 'User satisfaction needs attention',
      detail: 'Recent product sentiment is softer than ideal. Review repeated pain points and close the gap between feature power and ease of use.',
      priority: 'high',
    });
  }
  if (!recommendations.length) {
    recommendations.push({
      id: 'continue-optimization',
      title: 'Adoption is stable, now improve depth of usage',
      detail: 'Users are engaging in a relatively healthy way. The next product gains should come from smoother advanced workflows and better cross-feature guidance.',
      priority: 'low',
    });
  }

  const topRequests = Array.from(requestMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({ label, count }));
  const painPointThemes = Array.from(painPointMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({ label, count }));
  const topTabs = Array.from(topTabMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count }));
  const topFeatures = Array.from(topFeatureMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count }));

  const codexImplementationPrompt = [
    'Use the following product intelligence from docrud to suggest and implement the highest-impact improvements.',
    '',
    `Active users in last 7 days: ${activeUsers7d}/${trackedUsers.length}`,
    `Average feedback rating: ${averageFeedbackRating || 0}/5`,
    `Top used tabs: ${topTabs.map((item) => `${item.label} (${item.count})`).join(', ') || 'No recent tab data'}`,
    `Top user requests: ${topRequests.map((item) => `${item.label} (${item.count})`).join(', ') || 'No repeated requests yet'}`,
    `Main pain points: ${painPointThemes.map((item) => `${item.label} (${item.count})`).join(', ') || 'No repeated pain points yet'}`,
    '',
    'Priority recommendations:',
    ...recommendations.map((item) => `- ${item.title}: ${item.detail}`),
    '',
    'Please propose the next product improvements in priority order, explain why they matter for real users, and implement the highest-value changes in a clean, production-ready way.',
  ].join('\n');

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      totalTrackedUsers: trackedUsers.length,
      activeUsers24h,
      activeUsers7d,
      totalActivityEvents: events.length,
      totalFeedbackResponses: feedback.length,
      averageFeedbackRating,
      feedbackCoverageRate,
    },
    survey: {
      topRequestedThemes: topRequests,
      topPainThemes: painPointThemes,
      recentFeedback: feedback.slice(0, 12).map((entry) => ({
        id: entry.id,
        userId: entry.userId,
        userEmail: entry.userEmail,
        userName: entry.userName,
        rating: entry.rating,
        summary: entry.summary,
        painPoints: entry.painPoints,
        requestedImprovements: entry.requestedImprovements,
        createdAt: entry.createdAt,
      })),
    },
    productHealth: {
      adoptionStatus,
      engagementStatus,
      satisfactionStatus,
      summary: `Adoption is ${adoptionStatus}, engagement is ${engagementStatus}, and satisfaction is ${satisfactionStatus}. Use the request themes and active-user patterns to decide what to improve next.`,
    },
    topTabs,
    topFeatures,
    userActivity,
    feedbackInsights: {
      topRequests,
      painPointThemes,
      recentResponses: feedback.slice(0, 8),
      summary: feedback.length
        ? `Users are most often asking for ${topRequests[0]?.label?.toLowerCase() || 'general improvements'} while pain is most visible around ${painPointThemes[0]?.label?.toLowerCase() || 'workflow friction'}.`
        : 'Feedback collection has started, but there is not enough user input yet for a stronger trend summary.',
    },
    recommendations,
    codexImplementationPrompt,
  };
}
