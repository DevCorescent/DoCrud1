'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Building2, CheckCircle2, Edit, Plus, Save, Signature, Sparkles, Trash2, Upload } from 'lucide-react';
import { BusinessSettings, DocumentTemplate, SignatureRecord } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import TemplateEditor from '@/components/TemplateEditor';
import SignaturePad from '@/components/SignaturePad';
import FeatureGuide from '@/components/FeatureGuide';
import { getIndustryWorkspaceProfile, industryOptions, workspacePresetOptions } from '@/lib/industry-presets';

const emptySettings: BusinessSettings = {
  organizationId: '',
  organizationName: '',
  displayName: '',
  industry: 'technology',
  companySize: '1-25',
  primaryUseCase: '',
  workspacePreset: 'executive_control',
  onboardingCompleted: false,
  supportEmail: '',
  supportPhone: '',
  accentColor: '#2719FF',
  watermarkLabel: 'docrud workspace',
  businessDescription: '',
  updatedAt: '',
  letterheadMode: 'default',
  letterheadImageDataUrl: '',
  letterheadHtml: '',
};

export default function BusinessSettingsCenter() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<BusinessSettings>(emptySettings);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [message, setMessage] = useState('');
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | undefined>(undefined);
  const [signatureDraft, setSignatureDraft] = useState({
    signerName: '',
    signerRole: '',
    signatureDataUrl: '',
  });

  const businessTemplates = useMemo(
    () => templates.filter((template) => template.organizationId === session?.user?.id),
    [session?.user?.id, templates],
  );
  const industryProfile = useMemo(() => getIndustryWorkspaceProfile(settings.industry), [settings.industry]);
  const setupChecklistEntries = useMemo(() => ([
    { key: 'profileConfigured', label: 'Business profile configured' },
    { key: 'brandingConfigured', label: 'Branding configured' },
    { key: 'starterTemplatesReady', label: 'Starter templates ready' },
    { key: 'signaturesReady', label: 'Authorized signatures ready' },
    { key: 'firstDocumentGenerated', label: 'First document generated' },
  ]), []);

  const loadData = async () => {
    const [settingsResponse, templatesResponse, signaturesResponse] = await Promise.all([
      fetch('/api/business/settings'),
      fetch('/api/templates'),
      fetch('/api/settings/signature'),
    ]);
    if (settingsResponse.ok) setSettings(await settingsResponse.json());
    if (templatesResponse.ok) setTemplates(await templatesResponse.json());
    if (signaturesResponse.ok) {
      const payload = await signaturesResponse.json();
      setSignatures(payload.signatures || []);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const saveSettings = async () => {
    const response = await fetch('/api/business/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (response.ok) {
      setSettings(await response.json());
      setMessage('Business settings saved successfully.');
    }
  };

  const handleLetterheadUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Unable to read file'));
      reader.readAsDataURL(file);
    });
    setSettings((prev) => ({
      ...prev,
      letterheadMode: 'image',
      letterheadImageDataUrl: dataUrl,
    }));
  };

  const saveTemplate = async (template: DocumentTemplate) => {
    const method = editingTemplate ? 'PUT' : 'POST';
    const response = await fetch('/api/templates/manage', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    if (response.ok) {
      setTemplateDialogOpen(false);
      setEditingTemplate(undefined);
      setMessage(editingTemplate ? 'Template updated successfully.' : 'Template created successfully.');
      await loadData();
    }
  };

  const deleteTemplate = async (templateId: string) => {
    if (!confirm('Delete this business template?')) return;
    const response = await fetch(`/api/templates/manage?id=${templateId}`, { method: 'DELETE' });
    if (response.ok) {
      setMessage('Template deleted successfully.');
      await loadData();
    }
  };

  const saveSignature = async () => {
    const response = await fetch('/api/settings/signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signatureDraft),
    });
    if (response.ok) {
      setSignatureDraft({ signerName: '', signerRole: '', signatureDataUrl: '' });
      setMessage('Business signature saved successfully.');
      await loadData();
    }
  };

  const deleteSignature = async (id: string) => {
    const response = await fetch(`/api/settings/signature?id=${id}`, { method: 'DELETE' });
    if (response.ok) {
      setMessage('Business signature deleted successfully.');
      await loadData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(242,247,255,0.98)_50%,rgba(15,23,42,0.96)_100%)] p-6 shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Business Settings</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">Run docrud with your own business settings, templates, and signatures.</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-600">Businesses can define their brand-facing settings, create custom document formats, maintain signature authorities, and build reusable templates for their own workflows.</p>
      </div>

      {message && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

      <FeatureGuide
        title="Business Settings Guide"
        purpose="Use this space to shape docrud around how your business actually works, so your team sees your branding, your templates, your signature authorities, and your preferred operating setup from day one."
        whyItMatters={[
          'It helps your team feel like they are working inside your business system, not a generic software shell.',
          'It reduces repeated setup work by keeping branding, standard templates, and signature assets ready for everyday use.',
        ]}
        tutorial={[
          'Start with your business profile so the workspace shows the right company name, support contacts, watermark, and operating model.',
          'Add your letterhead or branded header once so future documents already feel client-ready without manual formatting every time.',
          'Save the signatures of authorized approvers so your team can issue documents faster without hunting for sign-off assets.',
          'Create the templates your team repeats most often so daily work becomes faster, more consistent, and easier to delegate.',
        ]}
        examples={[
          'Example: a consulting firm sets up a branded proposal template, company watermark, and founder signature so every client-facing document is immediately presentation-ready.',
          'Example: an HR company creates its own onboarding document pack so recruiters can issue consistent offer, joining, and policy documents without rework.',
        ]}
      />

      <Card className="border-white/60 bg-white/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-orange-600" />Workspace Rollout</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                {settings.onboardingCompleted ? 'Initial workspace onboarding completed' : 'Workspace onboarding still in progress'}
              </div>
              <p className="mt-2 text-emerald-800">Your account is aligned to the <strong>{industryProfile.label}</strong> operating model with a <strong>{workspacePresetOptions.find((preset) => preset.key === settings.workspacePreset)?.label || 'premium'}</strong> workspace preset.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {industryProfile.onboardingSteps.map((step) => (
                <div key={step} className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">{step}</div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {setupChecklistEntries.map((item) => {
                const complete = Boolean(settings.workspaceSetupChecklist?.[item.key as keyof NonNullable<BusinessSettings['workspaceSetupChecklist']>]);
                return (
                  <div key={item.key} className={`rounded-2xl border p-4 text-sm ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-600'}`}>
                    {item.label}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-[28px] bg-slate-950 p-5 text-white shadow-[0_22px_50px_rgba(15,23,42,0.16)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200">Starter Pack</p>
            <p className="mt-3 text-lg font-semibold">{industryProfile.heroTitle}</p>
            <p className="mt-2 text-sm leading-6 text-slate-200">{industryProfile.heroDescription}</p>
            <div className="mt-4 space-y-2">
              {industryProfile.recommendedModules.map((item) => (
                <div key={item} className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-slate-100">{item}</div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Business Profile</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div><label className="mb-1 block text-sm font-medium">Organization Name</label><Input value={settings.organizationName} disabled /></div>
          <div><label className="mb-1 block text-sm font-medium">Display Name</label><Input value={settings.displayName} onChange={(e) => setSettings((prev) => ({ ...prev, displayName: e.target.value }))} /></div>
          <div>
            <label className="mb-1 block text-sm font-medium">Industry</label>
            <select value={settings.industry || 'technology'} onChange={(e) => setSettings((prev) => ({ ...prev, industry: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm">
              {industryOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Company Size</label>
            <select value={settings.companySize || '1-25'} onChange={(e) => setSettings((prev) => ({ ...prev, companySize: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="1-25">1-25</option>
              <option value="26-100">26-100</option>
              <option value="101-500">101-500</option>
              <option value="500+">500+</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Workspace Preset</label>
            <select value={settings.workspacePreset || 'executive_control'} onChange={(e) => setSettings((prev) => ({ ...prev, workspacePreset: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm">
              {workspacePresetOptions.map((preset) => (
                <option key={preset.key} value={preset.key}>{preset.label}</option>
              ))}
            </select>
          </div>
          <div><label className="mb-1 block text-sm font-medium">Support Email</label><Input type="email" value={settings.supportEmail} onChange={(e) => setSettings((prev) => ({ ...prev, supportEmail: e.target.value }))} /></div>
          <div><label className="mb-1 block text-sm font-medium">Support Phone</label><Input value={settings.supportPhone} onChange={(e) => setSettings((prev) => ({ ...prev, supportPhone: e.target.value }))} /></div>
          <div><label className="mb-1 block text-sm font-medium">Accent Color</label><Input value={settings.accentColor} onChange={(e) => setSettings((prev) => ({ ...prev, accentColor: e.target.value }))} placeholder="#2719FF" /></div>
          <div><label className="mb-1 block text-sm font-medium">Free Tier Watermark</label><Input value={settings.watermarkLabel} onChange={(e) => setSettings((prev) => ({ ...prev, watermarkLabel: e.target.value }))} /></div>
          <div>
            <label className="mb-1 block text-sm font-medium">Letterhead Mode</label>
            <select
              value={settings.letterheadMode || 'default'}
              onChange={(e) => setSettings((prev) => ({ ...prev, letterheadMode: e.target.value as BusinessSettings['letterheadMode'] }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="default">Use default docrud header</option>
              <option value="image">Use uploaded letterhead image</option>
              <option value="html">Use custom HTML letterhead</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Upload Letterhead</label>
            <div className="flex items-center gap-3">
              <Input type="file" accept="image/*" onChange={(e) => void handleLetterheadUpload(e)} />
              <Upload className="h-4 w-4 text-slate-500" />
            </div>
          </div>
          {settings.letterheadImageDataUrl && (
            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-medium text-slate-700">Uploaded Letterhead Preview</p>
              <img src={settings.letterheadImageDataUrl} alt="Letterhead preview" className="max-h-40 w-full rounded-xl object-contain" />
            </div>
          )}
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Custom Letterhead HTML</label>
            <textarea value={settings.letterheadHtml || ''} onChange={(e) => setSettings((prev) => ({ ...prev, letterheadHtml: e.target.value, letterheadMode: 'html' }))} className="min-h-[140px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm" placeholder="<div>Your branded letterhead HTML here</div>" />
            <p className="mt-2 text-xs text-slate-500">Use this if you already have a structured letterhead block. Image upload is the easiest option for most businesses.</p>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Business Description</label>
            <textarea value={settings.businessDescription || ''} onChange={(e) => setSettings((prev) => ({ ...prev, businessDescription: e.target.value }))} className="min-h-[88px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Primary Use Case</label>
            <textarea value={settings.primaryUseCase || ''} onChange={(e) => setSettings((prev) => ({ ...prev, primaryUseCase: e.target.value }))} className="min-h-[88px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Describe the main document workflows your team runs here." />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={() => void saveSettings()}><Save className="mr-2 h-4 w-4" />Save Business Settings</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Edit className="h-5 w-5" />Business Templates</CardTitle>
          <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingTemplate(undefined); setTemplateDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
              <DialogHeader><DialogTitle>{editingTemplate ? 'Edit Business Template' : 'Create Business Template'}</DialogTitle></DialogHeader>
              <TemplateEditor template={editingTemplate} onSave={saveTemplate} onClose={() => setTemplateDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-4">
          {businessTemplates.map((template) => (
            <div key={template.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{template.name}</p>
                  <p className="text-sm text-slate-500">{template.category}</p>
                  <p className="mt-1 text-sm text-slate-600">{template.description || 'No description added.'}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditingTemplate(template); setTemplateDialogOpen(true); }}>Edit</Button>
                  <Button variant="destructive" size="sm" onClick={() => void deleteTemplate(template.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          ))}
          {businessTemplates.length === 0 && <p className="text-sm text-slate-500">No business templates created yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Signature className="h-5 w-5" />Business Signatures</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="mb-1 block text-sm font-medium">Signer Name</label><Input value={signatureDraft.signerName} onChange={(e) => setSignatureDraft((prev) => ({ ...prev, signerName: e.target.value }))} /></div>
            <div><label className="mb-1 block text-sm font-medium">Signer Role</label><Input value={signatureDraft.signerRole} onChange={(e) => setSignatureDraft((prev) => ({ ...prev, signerRole: e.target.value }))} /></div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium">Signature Capture</label>
              <SignaturePad value={signatureDraft.signatureDataUrl} onChange={(value) => setSignatureDraft((prev) => ({ ...prev, signatureDataUrl: value }))} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void saveSignature()}><Save className="mr-2 h-4 w-4" />Save Signature</Button>
          </div>
          <div className="space-y-3">
            {signatures.map((signature) => (
              <div key={signature.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{signature.signerName}</p>
                  <p className="text-sm text-slate-500">{signature.signerRole}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={() => void deleteSignature(signature.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            {signatures.length === 0 && <p className="text-sm text-slate-500">No business signatures created yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
