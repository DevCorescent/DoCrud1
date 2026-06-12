'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DocumentHistory, SubmittedDocument } from '@/types/document';
import { ExternalLink, FileText, MessageSquare, ShieldCheck, UploadCloud } from 'lucide-react';

const backgroundFields: Array<{ key: string; label: string; type?: string }> = [
  { key: 'legalFullName', label: 'Legal Full Name' },
  { key: 'preferredName', label: 'Preferred Name' },
  { key: 'personalEmail', label: 'Personal Email', type: 'email' },
  { key: 'personalPhone', label: 'Personal Phone' },
  { key: 'alternatePhone', label: 'Alternate Phone' },
  { key: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'fatherOrGuardianName', label: 'Father or Guardian Name' },
  { key: 'motherName', label: 'Mother Name' },
  { key: 'currentAddress', label: 'Current Address' },
  { key: 'permanentAddress', label: 'Permanent Address' },
  { key: 'aadhaarNumber', label: 'Aadhaar Number' },
  { key: 'panNumber', label: 'PAN Number' },
  { key: 'passportNumber', label: 'Passport Number' },
  { key: 'uanNumber', label: 'UAN Number' },
  { key: 'bankAccountNumber', label: 'Bank Account Number' },
  { key: 'bankIfscCode', label: 'Bank IFSC Code' },
  { key: 'emergencyContactName', label: 'Emergency Contact Name' },
  { key: 'emergencyContactRelationship', label: 'Emergency Contact Relationship' },
  { key: 'emergencyContactPhone', label: 'Emergency Contact Phone' },
  { key: 'highestEducation', label: 'Highest Education' },
  { key: 'institutionName', label: 'Institution Name' },
  { key: 'courseName', label: 'Course Name' },
  { key: 'graduationYear', label: 'Graduation Year' },
  { key: 'previousEmployerName', label: 'Previous Employer Name' },
  { key: 'previousEmployerDesignation', label: 'Previous Employer Designation' },
  { key: 'previousEmploymentStartDate', label: 'Previous Employment Start Date', type: 'date' },
  { key: 'previousEmploymentEndDate', label: 'Previous Employment End Date', type: 'date' },
  { key: 'previousEmployerHrName', label: 'Previous Employer HR Name' },
  { key: 'previousEmployerHrEmail', label: 'Previous Employer HR Email', type: 'email' },
  { key: 'referenceOneName', label: 'Reference One Name' },
  { key: 'referenceOneEmail', label: 'Reference One Email', type: 'email' },
  { key: 'referenceTwoName', label: 'Reference Two Name' },
  { key: 'referenceTwoEmail', label: 'Reference Two Email', type: 'email' },
  { key: 'criminalRecordDeclaration', label: 'Criminal Record Declaration' },
  { key: 'dualEmploymentDeclaration', label: 'Dual Employment Declaration' },
];

export default function EmployeePortal() {
  const { data: session } = useSession();
  const [records, setRecords] = useState<DocumentHistory[]>([]);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});
  const [profileDrafts, setProfileDrafts] = useState<Record<string, Record<string, string>>>({});
  const [documentUploads, setDocumentUploads] = useState<Record<string, Record<string, SubmittedDocument>>>({});
  const [message, setMessage] = useState('');

  const loadRecords = async () => {
    const response = await fetch('/api/employee/onboarding');
    if (response.ok) {
      const payload = await response.json();
      setRecords(payload);
      setProfileDrafts(Object.fromEntries(payload.map((entry: DocumentHistory) => [entry.id, entry.backgroundVerificationProfile || {}])));
    }
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  const activeRecord = useMemo(() => records[0] || null, [records]);

  const updateProfile = async (id: string) => {
    const response = await fetch('/api/employee/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        backgroundVerificationProfile: profileDrafts[id],
      }),
    });
    if (response.ok) {
      setMessage('Background verification profile updated successfully.');
      await loadRecords();
    }
  };

  const submitDocuments = async (id: string) => {
    const uploads = Object.values(documentUploads[id] || {});
    if (!uploads.length) return;
    const response = await fetch('/api/employee/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        submittedDocuments: uploads,
      }),
    });
    if (response.ok) {
      setMessage('Background verification documents submitted for review.');
      await loadRecords();
    }
  };

  const askQuestion = async (id: string) => {
    const question = questionDrafts[id]?.trim();
    if (!question) return;
    const response = await fetch('/api/employee/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, question }),
    });
    if (response.ok) {
      setQuestionDrafts((prev) => ({ ...prev, [id]: '' }));
      setMessage('Your question has been sent to admin.');
      await loadRecords();
    }
  };

  const handleDocumentUpload = async (recordId: string, label: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Unable to read file'));
      reader.readAsDataURL(file);
    });
    setDocumentUploads((prev) => ({
      ...prev,
      [recordId]: {
        ...(prev[recordId] || {}),
        [label]: {
          id: `${recordId}-${label}`,
          label,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataUrl,
          uploadedAt: new Date().toISOString(),
        },
      },
    }));
  };

  if (!activeRecord) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-6">
        <h2 className="text-2xl font-semibold text-slate-900">Employee Onboarding</h2>
        <p className="mt-3 text-sm text-slate-600">No onboarding workflow is linked to this employee account yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,rgba(39,25,255,0.96)_0%,rgba(11,12,13,0.98)_100%)] p-6 text-white shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200">Employee Dashboard</p>
        <h2 className="mt-3 text-3xl font-semibold">Track onboarding, complete BGV, and sign your offer when verification is complete.</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-200">Welcome, {session?.user?.name || 'Employee'}. Your onboarding progress, verification status, document checklist, and admin responses are all visible here.</p>
      </div>

      {message && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-5"><p className="text-sm text-slate-500">Onboarding Stage</p><p className="mt-2 text-xl font-semibold text-slate-900">{activeRecord.onboardingStage?.replace(/_/g, ' ')}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-slate-500">Progress</p><p className="mt-2 text-xl font-semibold text-slate-900">{activeRecord.onboardingProgress || 0}%</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-slate-500">BGV Status</p><p className="mt-2 text-xl font-semibold text-slate-900">{activeRecord.backgroundVerificationStatus || 'not_started'}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-slate-500">Offer Signing</p><p className="mt-2 text-xl font-semibold text-slate-900">{activeRecord.backgroundVerificationStatus === 'verified' ? 'Unlocked' : 'Locked until verification'}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-xl">Background Verification Profile</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {backgroundFields.map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-sm font-medium text-slate-700">{field.label}</label>
              <Input
                type={field.type || 'text'}
                value={profileDrafts[activeRecord.id]?.[field.key] || ''}
                onChange={(event) => setProfileDrafts((prev) => ({
                  ...prev,
                  [activeRecord.id]: {
                    ...(prev[activeRecord.id] || {}),
                    [field.key]: event.target.value,
                  },
                }))}
              />
            </div>
          ))}
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={() => void updateProfile(activeRecord.id)}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Save Verification Profile
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Required Background Verification Documents</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {(activeRecord.requiredDocuments || []).map((label) => (
            <div key={label} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900">{label}</p>
                <p className="text-sm text-slate-500">{documentUploads[activeRecord.id]?.[label]?.fileName || activeRecord.submittedDocuments?.find((item) => item.label === label)?.fileName || 'Not uploaded yet'}</p>
              </div>
              <div className="flex items-center gap-3">
                <Input type="file" className="max-w-xs" onChange={(event) => void handleDocumentUpload(activeRecord.id, label, event)} />
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Button onClick={() => void submitDocuments(activeRecord.id)}>
              <UploadCloud className="mr-2 h-4 w-4" />
              Submit Documents for Verification
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader><CardTitle className="text-xl">Questions and Admin Responses</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {(activeRecord.employeeQuestions || []).map((question) => (
                <div key={question.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-900">{question.question}</p>
                  <p className="mt-1 text-xs text-slate-500">Asked {new Date(question.askedAt).toLocaleString()}</p>
                  {question.reply && <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-slate-700">Admin reply: {question.reply}</p>}
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Ask a question</label>
              <textarea
                value={questionDrafts[activeRecord.id] || ''}
                onChange={(event) => setQuestionDrafts((prev) => ({ ...prev, [activeRecord.id]: event.target.value }))}
                className="min-h-[120px] w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Ask HR or admin about your onboarding, documents, or offer process."
              />
              <div className="mt-3 flex justify-end">
                <Button onClick={() => void askQuestion(activeRecord.id)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Send Question
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">Offer Workflow</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">{activeRecord.templateName}</p>
              <p className="mt-1 text-sm text-slate-500">{activeRecord.referenceNumber}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Your login email</p>
              <p className="mt-1 font-medium text-slate-900">{activeRecord.onboardingCredentials?.email || activeRecord.employeeEmail}</p>
              <p className="mt-3 text-sm text-slate-500">Temporary password shared for this onboarding</p>
              <p className="mt-1 font-medium text-slate-900">{activeRecord.onboardingCredentials?.temporaryPassword || 'Available with admin'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Verification note</p>
              <p className="mt-1 text-sm text-slate-700">{activeRecord.backgroundVerificationNotes || 'No admin note yet.'}</p>
            </div>
            <Button asChild disabled={activeRecord.backgroundVerificationStatus !== 'verified'}>
              <a href={activeRecord.shareUrl || '#'} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Offer Workflow
              </a>
            </Button>
            <p className="text-xs text-slate-500">The offer letter signature step stays locked until admin verifies your background verification documents.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
