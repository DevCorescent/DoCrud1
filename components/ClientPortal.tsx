'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BusinessSettings, DashboardMetrics, DocumentHistory } from '@/types/document';
import { ExternalLink, FileText, FolderKanban, Workflow } from 'lucide-react';
import FeatureGuide from '@/components/FeatureGuide';

const emptyDashboard: DashboardMetrics = {
  totalDocuments: 0,
  documentsThisWeek: 0,
  emailsSent: 0,
  templatesUsed: 0,
  topTemplates: [],
  recentActivity: [],
  recentFeedback: [],
  documentSummary: [],
  signatureLocationDistribution: [],
};

export default function ClientPortal() {
  const { data: session } = useSession();
  const [history, setHistory] = useState<DocumentHistory[]>([]);
  const [dashboard, setDashboard] = useState<DashboardMetrics>(emptyDashboard);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void Promise.all([
      fetch('/api/history').then((response) => response.ok ? response.json() : []),
      fetch('/api/dashboard').then((response) => response.ok ? response.json() : emptyDashboard),
      fetch('/api/business/settings').then((response) => response.ok ? response.json() : null),
    ]).then(([historyPayload, dashboardPayload, settingsPayload]) => {
      setHistory(historyPayload);
      setDashboard(dashboardPayload);
      setSettings(settingsPayload);
    });
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return history.filter((item) => !query || [
      item.templateName,
      item.referenceNumber,
      item.clientOrganization,
      item.folderLabel,
    ].filter(Boolean).some((value) => value?.toLowerCase().includes(query)));
  }, [history, search]);
  const setupChecklist = settings?.workspaceSetupChecklist;
  const setupItems = [
    { key: 'profileConfigured', label: 'Profile' },
    { key: 'brandingConfigured', label: 'Branding' },
    { key: 'starterTemplatesReady', label: 'Templates' },
    { key: 'signaturesReady', label: 'Signatures' },
    { key: 'firstDocumentGenerated', label: 'First document' },
  ] as const;
  const setupCompletion = setupChecklist ? Math.round((setupItems.filter((item) => Boolean(setupChecklist[item.key])).length / setupItems.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,rgba(255,247,237,0.96)_0%,rgba(255,255,255,0.98)_38%,rgba(15,23,42,0.98)_100%)] p-6 text-white shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-200">Client Workspace</p>
        <h2 className="mt-3 text-3xl font-semibold">Documents, approvals, and workflow visibility for {session?.user?.name || 'your account'}.</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-200">Review every document assigned to you, open shared workflows, and track current stages without needing internal admin access.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-5"><p className="text-sm text-slate-500">Assigned Documents</p><p className="mt-2 text-3xl font-semibold text-slate-900">{dashboard.totalDocuments}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-slate-500">This Week</p><p className="mt-2 text-3xl font-semibold text-slate-900">{dashboard.documentsThisWeek}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-slate-500">Pending Feedback</p><p className="mt-2 text-3xl font-semibold text-slate-900">{dashboard.documentSummary.reduce((sum, item) => sum + item.pendingFeedbackCount, 0)}</p></CardContent></Card>
      </div>

      {settings && setupCompletion < 100 && (
        <Card>
          <CardHeader>
            <CardTitle>Workspace Setup Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: `${setupCompletion}%` }} />
            </div>
            <p className="text-sm text-slate-600">{setupCompletion}% complete. Finish your workspace setup from Business Settings before wider tenant rollout.</p>
            <div className="grid gap-3 md:grid-cols-5">
              {setupItems.map((item) => (
                <div key={item.key} className={`rounded-2xl px-3 py-3 text-sm ${setupChecklist?.[item.key] ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-600'}`}>
                  {item.label}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <FeatureGuide
        title="Client Portal Guide"
        tutorial={[
          'Sign in with a client account to see only documents linked to your email.',
          'Use the search bar to find agreements by reference, organization, or folder.',
          'Open a workflow from the document card to review, comment, sign, or upload requirements when permitted.',
        ]}
        examples={[
          'Example: a client user opens an onboarding agreement, reviews comments, and continues the public document workflow.',
          'Example: external counsel filters by `Client Agreements` to find a contract packet shared for signature.',
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">My Documents</CardTitle>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assigned documents" />
        </CardHeader>
        <CardContent className="space-y-4">
          {filtered.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900">{item.templateName}</p>
                  <p className="text-sm text-slate-500">{item.referenceNumber}</p>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-2"><Workflow className="h-4 w-4" />{item.editorState?.lifecycleStage?.replace('_', ' ') || 'draft'}</span>
                    <span className="inline-flex items-center gap-2"><FolderKanban className="h-4 w-4" />{item.folderLabel || 'General'}</span>
                    <span className="inline-flex items-center gap-2"><FileText className="h-4 w-4" />{item.clientOrganization || 'Unassigned organization'}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.shareUrl && (
                    <Button asChild variant="outline" size="sm">
                      <a href={item.shareUrl}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open Workflow
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-sm text-slate-500">No client documents are linked to this account yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
