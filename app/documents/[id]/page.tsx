'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ProcessProgress } from '@/components/ui/process-progress';
import { AlertTriangle, Camera, Check, CheckCircle2, ChevronRight, Copy, Download, ExternalLink, FileCheck2, FileText, History, KeyRound, Loader2, Lock, MapPin, MessageSquare, PencilLine, RefreshCw, Share2, ShieldCheck, X } from 'lucide-react';
import SignaturePad from '@/components/SignaturePad';
import { PdfSignatureBoxPreview } from '@/components/PdfSignatureBoxPreview';
import { PdfSignatureBoxSigner } from '@/components/PdfSignatureBoxSigner';
import {
  CollaborationComment,
  DataCollectionSubmission,
  DataCollectionStatus,
  DocSheetWorkbook,
  DocumentField,
  FormAppearance,
  RecipientAccessLevel,
  RecipientSignaturePlacements,
  SubmittedDocument,
  DocumentAccessEvent,
} from '@/types/document';
import RichTextEditor from '@/components/RichTextEditor';
import { exportDocSheetToCsv, getDocSheetDisplayValue, normalizeDocSheetWorkbook } from '@/lib/docsheet';

interface SharedDocumentPayload {
  id: string;
  shareId?: string;
  templateId?: string;
  documentSourceType?: 'generated' | 'uploaded_pdf';
  templateName: string;
  referenceNumber?: string;
  generatedAt: string;
  requiresPassword?: boolean;
  passwordValidated?: boolean;
  signingSession?: {
    signerKey?: string | null;
    signerEmail?: string | null;
    signerName?: string | null;
  };
  previewHtml?: string;
  uploadedPdfFileName?: string;
  uploadedPdfPreviewUrl?: string;
  recipientSignaturePlacements?: RecipientSignaturePlacements;
  templateFields?: DocumentField[];
  formAppearance?: FormAppearance;
  data?: Record<string, string>;
  recipientAccess?: RecipientAccessLevel;
  dataCollectionEnabled?: boolean;
  dataCollectionStatus?: DataCollectionStatus;
  dataCollectionInstructions?: string;
  dataCollectionSubmittedAt?: string;
  dataCollectionSubmittedBy?: string;
  dataCollectionSubmissions?: DataCollectionSubmission[];
  dataCollectionReviewNotes?: string;
  dataCollectionReviewedAt?: string;
  dataCollectionReviewedBy?: string;
  requiredDocumentWorkflowEnabled?: boolean;
  requiredDocuments?: string[];
  submittedDocuments?: SubmittedDocument[];
  documentsVerificationStatus?: 'not_required' | 'pending' | 'verified' | 'rejected';
  documentsVerificationNotes?: string;
  recipientSignatureRequired?: boolean;
  recipientAadhaarVerificationRequired?: boolean;
  aadhaarVerificationConfigured?: boolean;
  aadhaarProviderLabel?: string;
  aadhaarEnvironment?: 'sandbox' | 'production';
  recipientSignerName?: string;
  recipientSignerEmail?: string;
  recipientSigners?: Array<{
    signerKey: string;
    signerName: string;
    signerEmail?: string;
    signingStatus: 'pending' | 'signed';
    signedAt?: string;
    signedIp?: string;
    signedLocationLabel?: string;
    signedLatitude?: number;
    signedLongitude?: number;
    signedAccuracyMeters?: number;
    authenticationMethods?: string[];
    photoDataUrl?: string;
    photoCapturedAt?: string;
    photoCapturedIp?: string;
    photoCaptureMethod?: 'live_camera';
    consentedAt?: string;
    consentText?: string;
    signatureSource?: 'drawn' | 'uploaded';
    signatureDataUrl?: string;
    signatureBoxSummary?: {
      totalBoxes: number;
      requiredBoxes: number;
      completedBoxes: number;
      missingRequiredBoxIds?: string[];
    };
  }>;
  recipientSignerConfigsByKey?: Record<string, {
    cameraCaptureEnabled?: boolean;
    signatureDrawEnabled?: boolean;
    signatureUploadEnabled?: boolean;
    signatureTypedEnabled?: boolean;
    initialsEnabled?: boolean;
    emailOtpEnabled?: boolean;
    consentRequired?: boolean;
    captureIpDeviceLocationEnabled?: boolean;
  }>;
  recipientSignatureBoxSummary?: {
    totalBoxes: number;
    requiredBoxes: number;
    completedBoxes: number;
    missingRequiredBoxIds?: string[];
  };
  recipientSignedAt?: string;
  recipientSignedIp?: string;
  recipientPhotoDataUrl?: string;
  recipientPhotoCapturedAt?: string;
  recipientPhotoCapturedIp?: string;
  recipientPhotoCaptureMethod?: 'live_camera';
  recipientConsentedAt?: string;
  recipientConsentText?: string;
  signatureReceiptCompletionPageEnabled?: boolean;
  recipientAadhaarVerifiedAt?: string;
  recipientAadhaarVerifiedIp?: string;
  recipientAadhaarReferenceId?: string;
  recipientAadhaarMaskedId?: string;
  recipientAadhaarVerificationMode?: 'otp';
  recipientAadhaarProviderLabel?: string;
  recipientSignatureSource?: 'drawn' | 'uploaded';
  recipientSignedLocationLabel?: string;
  recipientSignedLatitude?: number;
  recipientSignedLongitude?: number;
  recipientSignedAccuracyMeters?: number;
  hasRecipientSignature?: boolean;
  collaborationComments?: CollaborationComment[];
  docsheetWorkbook?: DocSheetWorkbook;
  docsheetShareMode?: 'view' | 'edit';
  docsheetSessionStatus?: 'active' | 'expired' | 'revoked';
  docsheetSharedWithEmail?: string;
  accessEvents?: DocumentAccessEvent[];
  shareAccessPolicy?: 'standard' | 'expiring' | 'one_time';
  shareExpiresAt?: string;
  maxAccessCount?: number;
  shareUrl?: string;
}

interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  label: string;
  capturedAt: string;
}

interface LivePhotoEvidence {
  photoDataUrl: string;
  capturedAt: string;
  capturedIp?: string;
  evidenceCaptureToken: string;
  captureMethod?: 'live_camera';
}

interface AadhaarVerificationState {
  identityType: 'aadhaar' | 'vid';
  identityValue: string;
  otp: string;
  transactionId: string;
  maskedId?: string;
  verifiedAt?: string;
  verifiedIp?: string;
  referenceId?: string;
  providerLabel?: string;
}

const sanitizeEditorHtml = (value: string) =>
  value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+="[^"]*"/gi, '')
    .replace(/\son[a-z]+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');

export default function SharedDocumentPage() {
  const params = useParams<{ id: string }>();
  const routeId = Array.isArray(params?.id) ? params.id[0] : params?.id || '';
  const searchParams = useSearchParams();
  const signingToken = useMemo(() => (searchParams?.get('token') || '').trim(), [searchParams]);
  const [documentData, setDocumentData] = useState<SharedDocumentPayload | null>(null);
  const [password, setPassword] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [boxSignaturesById, setBoxSignaturesById] = useState<Record<string, string>>({});
  const [signatureSource, setSignatureSource] = useState<'drawn' | 'uploaded'>('drawn');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [reviewerName, setReviewerName] = useState('');
  const [commentType, setCommentType] = useState<'comment' | 'review'>('comment');
  const [commentMessage, setCommentMessage] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [editableData, setEditableData] = useState<Record<string, string>>({});
  const [isSavingEdits, setIsSavingEdits] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeStep, setActiveStep] = useState<'unlock' | 'review' | 'complete'>('unlock');
  const [documentExpanded, setDocumentExpanded] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false);
  const [submitterName, setSubmitterName] = useState('');
  const [documentUploads, setDocumentUploads] = useState<Record<string, SubmittedDocument | null>>({});
  const [isSubmittingDocuments, setIsSubmittingDocuments] = useState(false);
  const [clientLocation, setClientLocation] = useState<CapturedLocation | null>(null);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [sharedWorkbook, setSharedWorkbook] = useState<DocSheetWorkbook | null>(null);
  const [downloadCopyAfterSubmit, setDownloadCopyAfterSubmit] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isSavingEvidencePhoto, setIsSavingEvidencePhoto] = useState(false);
  const [livePhotoEvidence, setLivePhotoEvidence] = useState<LivePhotoEvidence | null>(null);
  const [attestationAccepted, setAttestationAccepted] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpVerifiedAt, setOtpVerifiedAt] = useState('');
  const [isRequestingEmailOtp, setIsRequestingEmailOtp] = useState(false);
  const [isVerifyingEmailOtp, setIsVerifyingEmailOtp] = useState(false);
  const [emailOtpDialogOpen, setEmailOtpDialogOpen] = useState(false);
  const [activeSignerKey, setActiveSignerKey] = useState('recipient');
  const [aadhaarState, setAadhaarState] = useState<AadhaarVerificationState>({
    identityType: 'aadhaar',
    identityValue: '',
    otp: '',
    transactionId: '',
  });
  const [isRequestingAadhaarOtp, setIsRequestingAadhaarOtp] = useState(false);
  const [isVerifyingAadhaarOtp, setIsVerifyingAadhaarOtp] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const signingAttestationText =
    'I confirm I’m authorised to sign and consent to storing signature evidence (live photo, location, timestamp, and device/IP trail) for audit. Additional legal requirements (if any) may still apply.';

  const receiptSigners = useMemo(() => {
    const list = Array.isArray(documentData?.recipientSigners) ? documentData?.recipientSigners : [];
    if (list && list.length) return list;
    if (!documentData?.recipientSignerName && !documentData?.recipientSignedAt) return [];
    return [{
      signerKey: 'recipient',
      signerName: documentData?.recipientSignerName || 'Signer',
      signerEmail: documentData?.recipientSignerEmail,
      signingStatus: documentData?.recipientSignedAt ? 'signed' as const : 'pending' as const,
      signedAt: documentData?.recipientSignedAt,
      signedIp: documentData?.recipientSignedIp,
      signedLocationLabel: documentData?.recipientSignedLocationLabel,
      signedLatitude: documentData?.recipientSignedLatitude,
      signedLongitude: documentData?.recipientSignedLongitude,
      signedAccuracyMeters: documentData?.recipientSignedAccuracyMeters,
      photoDataUrl: documentData?.recipientPhotoDataUrl,
      photoCapturedAt: documentData?.recipientPhotoCapturedAt,
      photoCapturedIp: documentData?.recipientPhotoCapturedIp,
      photoCaptureMethod: documentData?.recipientPhotoCaptureMethod,
      consentedAt: documentData?.recipientConsentedAt,
      consentText: documentData?.recipientConsentText,
      signatureBoxSummary: documentData?.recipientSignatureBoxSummary,
      authenticationMethods: [
        documentData?.requiresPassword !== false ? 'Access password' : null,
        documentData?.recipientPhotoDataUrl ? 'Live photo evidence' : null,
        documentData?.recipientSignedLatitude && documentData?.recipientSignedLongitude ? 'Live location capture' : null,
        documentData?.recipientAadhaarVerifiedAt ? 'Aadhaar OTP verification' : null,
      ].filter(Boolean) as string[],
    }];
  }, [documentData]);

  const boxPlacement = documentData?.recipientSignaturePlacements?.mode === 'boxes'
    ? documentData.recipientSignaturePlacements
    : null;
  const signerKeys = useMemo(() => {
    if (!boxPlacement?.boxes?.length) return ['recipient'];
    const keys = Array.from(new Set(boxPlacement.boxes.map((b: any) => String((b as any)?.signerKey || 'recipient').trim() || 'recipient')));
    return keys.length ? keys : ['recipient'];
  }, [boxPlacement?.boxes]);
  useEffect(() => {
    if (!signerKeys.includes(activeSignerKey)) {
      setActiveSignerKey(signerKeys[0] || 'recipient');
    }
  }, [activeSignerKey, signerKeys]);

  const activeSignerConfig = useMemo(() => {
    const cfg = documentData?.recipientSignerConfigsByKey?.[activeSignerKey] || {};
    return {
      cameraCaptureEnabled: cfg.cameraCaptureEnabled !== false,
      emailOtpEnabled: cfg.emailOtpEnabled === true,
      consentRequired: cfg.consentRequired !== false,
      captureIpDeviceLocationEnabled: cfg.captureIpDeviceLocationEnabled !== false,
    };
  }, [activeSignerKey, documentData?.recipientSignerConfigsByKey]);
  const boxesForActiveSigner = useMemo(() => {
    if (!boxPlacement?.boxes?.length) return null;
    return boxPlacement.boxes.filter((b: any) => String((b as any)?.signerKey || 'recipient').trim() === activeSignerKey);
  }, [activeSignerKey, boxPlacement?.boxes]);
  const requiredBoxIds = useMemo(
    () => ((boxesForActiveSigner || boxPlacement?.boxes || []) as any[]).filter((b) => (b as any).required !== false).map((b) => b.id),
    [boxPlacement?.boxes, boxesForActiveSigner]
  );
  const missingRequiredBoxIds = useMemo(
    () => requiredBoxIds.filter((id) => !boxSignaturesById[id]),
    [requiredBoxIds, boxSignaturesById]
  );
  const verificationChecklist = useMemo(() => {
    const items: Array<{ key: string; label: string; done: boolean }> = [];
    if (activeSignerConfig.emailOtpEnabled) items.push({ key: 'otp', label: 'Email OTP verified', done: Boolean(otpVerifiedAt) });
    if (activeSignerConfig.captureIpDeviceLocationEnabled) items.push({ key: 'location', label: 'Live location captured', done: Boolean(clientLocation) });
    if (activeSignerConfig.cameraCaptureEnabled) items.push({ key: 'camera', label: 'Live photo captured', done: Boolean(livePhotoEvidence?.evidenceCaptureToken) });
    if (activeSignerConfig.consentRequired) items.push({ key: 'consent', label: 'Consent accepted', done: Boolean(attestationAccepted) });
    return items;
  }, [
    activeSignerConfig.cameraCaptureEnabled,
    activeSignerConfig.captureIpDeviceLocationEnabled,
    activeSignerConfig.consentRequired,
    activeSignerConfig.emailOtpEnabled,
    attestationAccepted,
    clientLocation,
    livePhotoEvidence?.evidenceCaptureToken,
    otpVerifiedAt,
  ]);
  const verificationComplete = useMemo(() => verificationChecklist.every((i) => i.done), [verificationChecklist]);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const handleFormImageUpload = (fieldName: string, file: File | null) => {
    if (!file) {
      setEditableData((prev) => ({ ...prev, [fieldName]: '' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEditableData((prev) => ({ ...prev, [fieldName]: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const loadDocument = useCallback(async (passwordValue?: string, options?: { showLoading?: boolean; successMessage?: string }) => {
    if (!routeId) {
      setErrorMessage('Invalid document link.');
      setIsUnlocked(false);
      return null;
    }

    const shouldShowLoading = options?.showLoading ?? true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    try {
      if (shouldShowLoading) {
        setIsLoading(true);
      }

      const query = new URLSearchParams();
      if (passwordValue) query.set('password', passwordValue.trim().toUpperCase());
      if (signingToken) query.set('token', signingToken);
      const search = query.toString() ? `?${query.toString()}` : '';
      const response = await fetch(`/api/public/documents/${routeId}${search}`, {
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load document');
      }

      const unlocked = Boolean(payload?.passwordValidated) || payload?.requiresPassword === false;

      setDocumentData(payload);
      setEditableData(payload?.data || {});
      setSharedWorkbook(payload?.docsheetWorkbook ? normalizeDocSheetWorkbook(payload.docsheetWorkbook) : null);
      setIsUnlocked(unlocked);
      if (signingToken && payload?.signingSession?.signerKey) {
        setActiveSignerKey(String(payload.signingSession.signerKey));
      }
      if (signingToken && unlocked && payload?.signingSession?.signerName) {
        const lockedName = String(payload.signingSession.signerName || '').trim();
        if (lockedName) setSignerName((prev) => (prev.trim() ? prev : lockedName));
      }
      if (signingToken && unlocked) {
        setActiveStep('review');
      }

      if (unlocked) {
        setErrorMessage('');
        if (options?.successMessage) {
          setSuccessMessage(options.successMessage);
        }
      }

      return payload;
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'This document is taking too long to open. Please retry in a moment.'
        : error instanceof Error
          ? error.message
          : 'Failed to load document';
      setErrorMessage(message);
      setSuccessMessage('');
      setIsUnlocked(false);
      return null;
    } finally {
      window.clearTimeout(timeoutId);
      if (shouldShowLoading) {
        setIsLoading(false);
      }
    }
  }, [routeId, signingToken]);

  useEffect(() => {
    void loadDocument(undefined, { showLoading: false });
  }, [loadDocument]);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !cameraStreamRef.current) {
      return;
    }
    videoRef.current.srcObject = cameraStreamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [cameraOpen]);

  const stopCameraStream = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => stopCameraStream(), [stopCameraStream]);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const sharePassword = documentData?.requiresPassword ? password : '';
  const activeSharedSheet = sharedWorkbook?.sheets?.[0] || null;
  const formAppearance = documentData?.formAppearance;
  const formHeroTitle = formAppearance?.heroTitle || documentData?.templateName || 'Shared Document';
  const formHeroDescription = formAppearance?.heroDescription
    || documentData?.dataCollectionInstructions
    || 'Complete the requested form and submit your response securely.';
  const submitActionLabel = formAppearance?.submitLabel || 'Submit Form Data';
  const formMediaSlides = formAppearance?.mediaSlides?.filter((slide) => slide.imageUrl) || [];
  const mediaLoopSlides = formMediaSlides.length > 3 ? [...formMediaSlides, ...formMediaSlides] : formMediaSlides;
  const formCtas = formAppearance?.ctaButtons || [];
  const formBanners = formAppearance?.banners || [];
  const formSubmissionHistory = documentData?.dataCollectionSubmissions || [];
  const allowSingleEditAfterSubmit = formAppearance?.allowSingleEditAfterSubmit !== false;
  const showSubmissionHistory = formAppearance?.showSubmissionHistory !== false;
  const formHeroAlignment = formAppearance?.heroAlignment === 'center' ? 'center' : 'left';
  const formFieldColumns = formAppearance?.fieldColumns === 1 ? 1 : 2;
  const submitButtonWidth = formAppearance?.submitButtonWidth === 'fit' ? 'fit' : 'full';
  const thankYouRedirectUrl = formAppearance?.thankYouRedirectUrl || '';
  const maxFormSubmissions = allowSingleEditAfterSubmit ? 2 : 1;
  const hasReachedSubmissionLimit = Boolean(documentData?.dataCollectionEnabled && formSubmissionHistory.length >= maxFormSubmissions);
  const remainingFormEdits = Math.max(0, maxFormSubmissions - formSubmissionHistory.length);
  const whatsappLink = formAppearance?.whatsappNumber
    ? `https://wa.me/${formAppearance.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(formAppearance.whatsappMessage || `Hello, I am opening the ${formHeroTitle} form.`)}`
    : '';
  const isMinimalFormPage = Boolean(documentData?.dataCollectionEnabled);
  const isProcessingRequest = isLoading || isSavingEdits || isSigning || isSubmittingDocuments || isDownloadingPdf || isDownloadingReceipt || isUnlocking;
  const enableSigningStep = Boolean(documentData?.recipientSignatureRequired || documentData?.requiredDocumentWorkflowEnabled);
  const showSigningStepper = Boolean(documentData && !isMinimalFormPage);
  const isSigned = Boolean(documentData?.hasRecipientSignature);
  const displayedPhotoEvidence = livePhotoEvidence || (documentData?.recipientPhotoDataUrl ? {
    photoDataUrl: documentData.recipientPhotoDataUrl,
    capturedAt: documentData.recipientPhotoCapturedAt || '',
    capturedIp: documentData.recipientPhotoCapturedIp,
    evidenceCaptureToken: '',
    captureMethod: documentData.recipientPhotoCaptureMethod,
  } : null);
  const aadhaarVerified = Boolean(documentData?.recipientAadhaarVerifiedAt);
  const derivedRespondentName = useMemo(() => {
    const candidates = [
      editableData.full_name,
      editableData.fullName,
      editableData.name,
      editableData.applicant_name,
      editableData.applicantName,
      editableData.email_address,
      editableData.email,
    ];
    return candidates.find((value) => value?.trim())?.trim() || reviewerName.trim() || 'Recipient';
  }, [editableData, reviewerName]);

  useEffect(() => {
    if (!showSigningStepper) return;
    if (!enableSigningStep && activeStep === 'complete') {
      setActiveStep('review');
    }
    if (isUnlocked) {
      setActiveStep((current) => (current === 'unlock' ? 'review' : current));
      return;
    }
    setActiveStep('unlock');
  }, [activeStep, enableSigningStep, isUnlocked, showSigningStepper]);

  const updateSharedSheetCell = (rowId: string, columnId: string, value: string) => {
    setSharedWorkbook((current) => current ? {
      ...current,
      updatedAt: new Date().toISOString(),
      sheets: current.sheets.map((sheet, sheetIndex) => sheetIndex === 0 ? {
        ...sheet,
        updatedAt: new Date().toISOString(),
        rows: sheet.rows.map((row) => row.id === rowId ? {
          ...row,
          values: {
            ...row.values,
            [columnId]: value,
          },
        } : row),
      } : sheet),
    } : current);
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setSuccessMessage('Document link copied.');
    setErrorMessage('');
  };

  const shareDocument = async () => {
    if (!shareUrl) return;
    const text = `Review this docrud document${sharePassword ? `\nSigning password: ${sharePassword}` : ''}`;
    if (navigator.share) {
      await navigator.share({
        title: documentData?.templateName || 'docrud Document',
        text,
        url: shareUrl,
      });
      return;
    }
    await copyLink();
  };

  const unlockDocument = async () => {
    try {
      setIsUnlocking(true);
      const payload = await loadDocument(password, {
        showLoading: false,
        successMessage: 'Document unlocked successfully.',
      });
      if (!payload?.passwordValidated) {
        throw new Error('Invalid document password');
      }
      setActiveStep('review');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to unlock document');
      setSuccessMessage('');
      setIsUnlocked(false);
    } finally {
      setIsUnlocking(false);
    }
  };

  const signDocument = async () => {
    if (activeSignerConfig.captureIpDeviceLocationEnabled && !clientLocation) {
      setErrorMessage('Enable live location access before signing the document.');
      setSuccessMessage('');
      return;
    }
    if (activeSignerConfig.emailOtpEnabled && !otpVerifiedAt) {
      setErrorMessage('Verify your email OTP before signing.');
      setSuccessMessage('');
      return;
    }
    if (activeSignerConfig.cameraCaptureEnabled && !livePhotoEvidence?.evidenceCaptureToken) {
      setErrorMessage('Capture a live signer photo before signing.');
      setSuccessMessage('');
      return;
    }
    if (activeSignerConfig.consentRequired && !attestationAccepted) {
      setErrorMessage('Accept the signing consent before signing.');
      setSuccessMessage('');
      return;
    }

    try {
      setIsSigning(true);
      const response = await fetch(`/api/public/documents/${routeId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: signingToken ? undefined : password,
            token: signingToken || undefined,
            signerKey: activeSignerKey,
            signerName,
            signatureDataUrl,
            signaturesByBoxId: (documentData as any)?.recipientSignaturePlacements?.mode === 'boxes'
              ? Object.fromEntries(Object.entries(boxSignaturesById).filter(([boxId]) => requiredBoxIds.includes(boxId) || (boxesForActiveSigner ? boxesForActiveSigner.some((b: any) => b.id === boxId) : false)))
              : undefined,
            signatureSource,
            otpSessionId: activeSignerConfig.emailOtpEnabled ? otpSessionId : undefined,
            attestationAccepted: activeSignerConfig.consentRequired ? attestationAccepted : true,
            attestationText: signingAttestationText,
            evidenceCaptureToken: activeSignerConfig.cameraCaptureEnabled ? livePhotoEvidence?.evidenceCaptureToken : 'bypass',
            location: activeSignerConfig.captureIpDeviceLocationEnabled ? clientLocation : { latitude: 0, longitude: 0, label: 'not-captured', capturedAt: new Date().toISOString() },
          }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to sign document');
      }
      setDocumentData({
        id: payload.id,
        shareId: payload.shareId,
        documentSourceType: payload.documentSourceType,
        templateName: payload.templateName,
        referenceNumber: payload.referenceNumber,
        generatedAt: payload.generatedAt,
        previewHtml: payload.previewHtml,
        uploadedPdfFileName: payload.uploadedPdfFileName,
        uploadedPdfPreviewUrl: payload.uploadedPdfPreviewUrl,
        recipientSignaturePlacements: payload.recipientSignaturePlacements || documentData?.recipientSignaturePlacements,
        templateFields: payload.templateFields || documentData?.templateFields || [],
        formAppearance: payload.formAppearance || documentData?.formAppearance,
        data: payload.data || editableData,
        recipientAccess: payload.recipientAccess,
        requiredDocumentWorkflowEnabled: payload.requiredDocumentWorkflowEnabled,
        requiredDocuments: payload.requiredDocuments || [],
        submittedDocuments: payload.submittedDocuments || [],
        documentsVerificationStatus: payload.documentsVerificationStatus,
        documentsVerificationNotes: payload.documentsVerificationNotes,
        recipientSignatureRequired: payload.recipientSignatureRequired,
        recipientSignerName: payload.recipientSignerName,
        recipientSignerEmail: payload.recipientSignerEmail,
        recipientSigners: payload.recipientSigners || documentData?.recipientSigners || [],
        recipientSignedAt: payload.recipientSignedAt,
        recipientSignedIp: payload.recipientSignedIp,
        recipientSignatureBoxSummary: payload.recipientSignatureBoxSummary,
        recipientPhotoDataUrl: payload.recipientPhotoDataUrl,
        recipientPhotoCapturedAt: payload.recipientPhotoCapturedAt,
        recipientPhotoCapturedIp: payload.recipientPhotoCapturedIp,
        recipientPhotoCaptureMethod: payload.recipientPhotoCaptureMethod,
        recipientConsentedAt: payload.recipientConsentedAt,
        recipientConsentText: payload.recipientConsentText,
        signatureReceiptCompletionPageEnabled: payload.signatureReceiptCompletionPageEnabled ?? documentData?.signatureReceiptCompletionPageEnabled,
        recipientAadhaarVerificationRequired: payload.recipientAadhaarVerificationRequired ?? documentData?.recipientAadhaarVerificationRequired,
        aadhaarVerificationConfigured: documentData?.aadhaarVerificationConfigured,
        aadhaarProviderLabel: payload.recipientAadhaarProviderLabel || documentData?.aadhaarProviderLabel,
        aadhaarEnvironment: documentData?.aadhaarEnvironment,
        recipientAadhaarVerifiedAt: payload.recipientAadhaarVerifiedAt,
        recipientAadhaarVerifiedIp: payload.recipientAadhaarVerifiedIp,
        recipientAadhaarReferenceId: payload.recipientAadhaarReferenceId,
        recipientAadhaarMaskedId: payload.recipientAadhaarMaskedId,
        recipientAadhaarVerificationMode: payload.recipientAadhaarVerificationMode,
        recipientAadhaarProviderLabel: payload.recipientAadhaarProviderLabel,
        recipientSignatureSource: payload.recipientSignatureSource,
        recipientSignedLocationLabel: payload.recipientSignedLocationLabel,
        recipientSignedLatitude: payload.recipientSignedLatitude,
        recipientSignedLongitude: payload.recipientSignedLongitude,
        recipientSignedAccuracyMeters: payload.recipientSignedAccuracyMeters,
        hasRecipientSignature: Boolean(payload.hasRecipientSignature ?? payload.recipientSignedAt),
        collaborationComments: payload.collaborationComments || documentData?.collaborationComments || [],
      });
      setLivePhotoEvidence(payload.recipientPhotoDataUrl ? {
        photoDataUrl: payload.recipientPhotoDataUrl,
        capturedAt: payload.recipientPhotoCapturedAt,
        capturedIp: payload.recipientPhotoCapturedIp,
        evidenceCaptureToken: livePhotoEvidence?.evidenceCaptureToken || '',
        captureMethod: payload.recipientPhotoCaptureMethod,
      } : null);
      setSuccessMessage('Document signed successfully.');
      setErrorMessage('');
      if (payload.recipientSignedAt) {
        setActiveStep('complete');
      } else {
        setSuccessMessage('Signature recorded. Next signer can continue from this link.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to sign document');
      setSuccessMessage('');
      if (error instanceof Error && /IP mismatch/i.test(error.message)) {
        setLivePhotoEvidence(null);
      }
    } finally {
      setIsSigning(false);
    }
  };

  const requestEmailOtp = async () => {
    try {
      setIsRequestingEmailOtp(true);
      const response = await fetch(`/api/public/documents/${routeId}/email-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_otp',
          password: signingToken ? undefined : password,
          token: signingToken || undefined,
          signerKey: activeSignerKey,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to request OTP');
      setOtpSessionId(String(payload.otpSessionId || ''));
      setOtpVerifiedAt('');
      setOtpCode('');
      setSuccessMessage('OTP sent to your email.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to request OTP');
      setSuccessMessage('');
    } finally {
      setIsRequestingEmailOtp(false);
    }
  };

  const verifyEmailOtp = async () => {
    if (!otpSessionId) {
      setErrorMessage('Request an OTP first.');
      setSuccessMessage('');
      return;
    }
    if (!otpCode.trim()) {
      setErrorMessage('Enter the 6-digit OTP.');
      setSuccessMessage('');
      return;
    }
    try {
      setIsVerifyingEmailOtp(true);
      const response = await fetch(`/api/public/documents/${routeId}/email-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_otp',
          password: signingToken ? undefined : password,
          token: signingToken || undefined,
          signerKey: activeSignerKey,
          otpSessionId,
          otp: otpCode.trim(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to verify OTP');
      setOtpVerifiedAt(String(payload.verifiedAt || new Date().toISOString()));
      setSuccessMessage('Email verified successfully.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to verify OTP');
      setSuccessMessage('');
    } finally {
      setIsVerifyingEmailOtp(false);
    }
  };

  const handleSignClick = () => {
    if (activeSignerConfig.emailOtpEnabled && !otpVerifiedAt) {
      setEmailOtpDialogOpen(true);
      return;
    }
    void signDocument();
  };

  const saveComment = async () => {
    try {
      setIsSavingComment(true);
      const response = await fetch(`/api/public/documents/${routeId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: commentType,
          message: commentMessage,
          authorName: reviewerName,
          password,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save feedback');
      }
      setDocumentData((prev) => prev ? { ...prev, collaborationComments: payload.collaborationComments || [] } : prev);
      setCommentMessage('');
      setSuccessMessage(`${commentType === 'review' ? 'Review' : 'Comment'} saved successfully.`);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save feedback');
      setSuccessMessage('');
    } finally {
      setIsSavingComment(false);
    }
  };

  const saveEdits = async () => {
    try {
      setIsSavingEdits(true);
      const response = await fetch(`/api/public/documents/${routeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: editableData,
          reviewerName: documentData?.dataCollectionEnabled ? derivedRespondentName : reviewerName,
          password,
          docsheetWorkbook: sharedWorkbook,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save document updates');
      }
      setDocumentData((prev) => prev ? {
        ...prev,
        data: payload.data || editableData,
        previewHtml: payload.previewHtml || prev.previewHtml,
        formAppearance: payload.formAppearance || prev.formAppearance,
        dataCollectionEnabled: payload.dataCollectionEnabled ?? prev.dataCollectionEnabled,
        dataCollectionStatus: payload.dataCollectionStatus || prev.dataCollectionStatus,
        dataCollectionInstructions: payload.dataCollectionInstructions ?? prev.dataCollectionInstructions,
        dataCollectionSubmittedAt: payload.dataCollectionSubmittedAt || prev.dataCollectionSubmittedAt,
        dataCollectionSubmittedBy: payload.dataCollectionSubmittedBy || prev.dataCollectionSubmittedBy,
        dataCollectionSubmissions: payload.dataCollectionSubmissions || prev.dataCollectionSubmissions || [],
        dataCollectionReviewNotes: payload.dataCollectionReviewNotes ?? prev.dataCollectionReviewNotes,
        dataCollectionReviewedAt: payload.dataCollectionReviewedAt || prev.dataCollectionReviewedAt,
        dataCollectionReviewedBy: payload.dataCollectionReviewedBy || prev.dataCollectionReviewedBy,
        collaborationComments: payload.collaborationComments || prev.collaborationComments || [],
        docsheetWorkbook: payload.docsheetWorkbook || prev.docsheetWorkbook,
        docsheetShareMode: payload.docsheetShareMode || prev.docsheetShareMode,
      } : prev);
      if (payload.docsheetWorkbook) {
        setSharedWorkbook(normalizeDocSheetWorkbook(payload.docsheetWorkbook));
      }
      setSuccessMessage(payload.formAppearance?.successMessage || 'Document updates saved successfully.');
      setErrorMessage('');
      if (payload.dataCollectionEnabled && downloadCopyAfterSubmit) {
        window.setTimeout(() => {
          void downloadPdf();
        }, 180);
      }
      if (payload.dataCollectionEnabled && thankYouRedirectUrl) {
        window.setTimeout(() => {
          window.location.href = thankYouRedirectUrl;
        }, downloadCopyAfterSubmit ? 900 : 500);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save document updates');
      setSuccessMessage('');
    } finally {
      setIsSavingEdits(false);
    }
  };

  const downloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      const query = new URLSearchParams();
      if (signingToken) query.set('token', signingToken);
      else query.set('password', password.trim().toUpperCase());
      const response = await fetch(`/api/public/documents/${routeId}/pdf?${query.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to download PDF');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = documentData?.uploadedPdfFileName || `${documentData?.templateName || 'document'}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
      setSuccessMessage('PDF downloaded successfully.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to download PDF');
      setSuccessMessage('');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const downloadSignatureReceipt = async () => {
    try {
      setIsDownloadingReceipt(true);
      const receiptSignerKey = encodeURIComponent(activeSignerKey || 'recipient');
      const query = new URLSearchParams();
      if (signingToken) query.set('token', signingToken);
      else query.set('password', password.trim().toUpperCase());
      query.set('signerKey', receiptSignerKey);
      const response = await fetch(`/api/public/documents/${routeId}/receipt?${query.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to download signature receipt');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const baseName = (documentData?.uploadedPdfFileName || documentData?.templateName || 'signature-receipt').replace(/\.pdf$/i, '');
      anchor.download = `${baseName}-signature-receipt.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
      setSuccessMessage('Signature receipt downloaded successfully.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to download signature receipt');
      setSuccessMessage('');
    } finally {
      setIsDownloadingReceipt(false);
    }
  };

  const downloadSharedCsv = async () => {
    if (!activeSharedSheet) return;
    const csv = exportDocSheetToCsv(activeSharedSheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(sharedWorkbook?.title || 'shared-sheet').replace(/\s+/g, '-').toLowerCase()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
    setSuccessMessage('CSV downloaded successfully.');
    setErrorMessage('');
  };

  const handleDocumentUpload = (label: string, file: File | null) => {
    if (!file) {
      setDocumentUploads((prev) => ({ ...prev, [label]: null }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setDocumentUploads((prev) => ({
        ...prev,
        [label]: {
          id: `${label}-${Date.now()}`,
          label,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataUrl: String(reader.result || ''),
          uploadedAt: new Date().toISOString(),
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureUpload = (file: File | null) => {
    if (!file) {
      setSignatureDataUrl('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSignatureSource('uploaded');
      setSignatureDataUrl(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const locationStorageKey = useMemo(() => {
    if (!routeId) return '';
    return `docrud:signing:lastLocation:${routeId}:${activeSignerKey}`;
  }, [activeSignerKey, routeId]);

  useEffect(() => {
    if (!locationStorageKey) return;
    if (!activeSignerConfig.captureIpDeviceLocationEnabled) return;
    if (clientLocation) return;
    try {
      const raw = localStorage.getItem(locationStorageKey);
      if (!raw) return;
      const cached = JSON.parse(raw) as CapturedLocation & { capturedAt?: string };
      if (typeof cached?.latitude !== 'number' || typeof cached?.longitude !== 'number') return;
      const capturedAt = cached.capturedAt ? new Date(cached.capturedAt).getTime() : 0;
      if (!capturedAt) return;
      if (Date.now() - capturedAt > 15 * 60 * 1000) return;
      setClientLocation({
        latitude: cached.latitude,
        longitude: cached.longitude,
        accuracyMeters: cached.accuracyMeters,
        label: cached.label || `${cached.latitude.toFixed(6)}, ${cached.longitude.toFixed(6)}`,
        capturedAt: cached.capturedAt!,
      });
    } catch {
      // ignore cache issues
    }
  }, [activeSignerConfig.captureIpDeviceLocationEnabled, clientLocation, locationStorageKey]);

  const captureLocation = async () => {
    if (!navigator.geolocation) {
      setErrorMessage('Location services are not supported in this browser. A live location is required to sign.');
      setSuccessMessage('');
      return;
    }

    let permissionState: 'granted' | 'prompt' | 'denied' | 'unknown' = 'unknown';
    try {
      setIsCapturingLocation(true);

      if (typeof window !== 'undefined' && (window as any).isSecureContext === false) {
        setErrorMessage('Live location requires a secure context (HTTPS). Please open this signing link over HTTPS (or localhost) and try again.');
        setSuccessMessage('');
        return;
      }

      permissionState = await (async () => {
        try {
          if (!('permissions' in navigator) || !(navigator as any).permissions?.query) return 'unknown' as const;
          const status = await (navigator as any).permissions.query({ name: 'geolocation' });
          return String(status?.state || 'unknown') as 'granted' | 'prompt' | 'denied' | 'unknown';
        } catch {
          return 'unknown' as const;
        }
      })();

      const getPosition = (options: PositionOptions) => new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });

      const watchForPosition = (options: PositionOptions, timeoutMs: number) => new Promise<GeolocationPosition>((resolve, reject) => {
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            window.clearTimeout(timerId);
            navigator.geolocation.clearWatch(watchId);
            resolve(pos);
          },
          (err) => {
            window.clearTimeout(timerId);
            navigator.geolocation.clearWatch(watchId);
            reject(err);
          },
          options,
        );
        const timerId = window.setTimeout(() => {
          navigator.geolocation.clearWatch(watchId);
          reject(Object.assign(new Error('Geolocation timed out'), { code: 3 }));
        }, timeoutMs);
      });

      const position = await (async () => {
        try {
          return await getPosition({ enableHighAccuracy: false, timeout: 9000, maximumAge: 5 * 60 * 1000 });
        } catch (firstErr) {
          // Retry with high accuracy + longer timeout (useful when cached position isn't available).
          try {
            return await getPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
          } catch (secondErr) {
            // Some browsers/devices are more reliable with watchPosition than getCurrentPosition.
            return await watchForPosition({ enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }, 30000);
          }
        }
      })();

      const nextLocation: CapturedLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        label: `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`,
        capturedAt: new Date(typeof position.timestamp === 'number' ? position.timestamp : Date.now()).toISOString(),
      };
      setClientLocation(nextLocation);
      if (locationStorageKey) {
        try {
          localStorage.setItem(locationStorageKey, JSON.stringify(nextLocation));
        } catch {
          // ignore storage issues
        }
      }
      setSuccessMessage('Live location captured. You can now complete the signature step.');
      setErrorMessage('');
    } catch (error) {
      const err = error as any;
      const code = typeof err?.code === 'number' ? err.code : null;
      const message = (() => {
        // GeolocationPositionError codes: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        if (code === 1 || permissionState === 'denied') {
          return 'Location permission is mandatory. Please allow location access in your browser settings and try again.';
        }
        if (code === 3) {
          return 'Location capture timed out. Please retry (move to an open area / turn off battery saver / ensure GPS is available).';
        }
        if (code === 2) {
          return 'Unable to determine your location. Ensure browser + OS location permission is enabled (and try disabling VPN / improving signal), then retry.';
        }
        return 'Failed to capture live location. Please try again.';
      })();
      setErrorMessage(message);
      setSuccessMessage('');
      // Keep any previously captured location; only clear when permission is denied.
      if (code === 1 || permissionState === 'denied') {
        setClientLocation(null);
      }
    } finally {
      setIsCapturingLocation(false);
    }
  };

  const openCameraCapture = async () => {
    if (!signingToken && !password.trim()) {
      setErrorMessage('Enter the signing password first, then open the live camera capture.');
      setSuccessMessage('');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Live camera capture is not supported in this browser.');
      setSuccessMessage('');
      return;
    }

    try {
      setIsStartingCamera(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      stopCameraStream();
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage('Live camera permission is mandatory before signing. Please allow camera access and try again.');
      setSuccessMessage('');
    } finally {
      setIsStartingCamera(false);
    }
  };

  const closeCameraCapture = () => {
    setCameraOpen(false);
    stopCameraStream();
  };

  const captureLiveEvidencePhoto = async () => {
    if (!canvasRef.current || !videoRef.current) {
      setErrorMessage('Camera preview is not ready yet. Please try again.');
      setSuccessMessage('');
      return;
    }
    if (!signingToken && !password.trim()) {
      setErrorMessage('Enter the signing password before capturing the live signer photo.');
      setSuccessMessage('');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      setErrorMessage('Unable to access the camera canvas. Please retry.');
      setSuccessMessage('');
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    const photoDataUrl = canvas.toDataURL('image/jpeg', 0.92);

    try {
      setIsSavingEvidencePhoto(true);
      const response = await fetch(`/api/public/documents/${routeId}/evidence-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: signingToken ? undefined : password,
          token: signingToken || undefined,
          signerKey: activeSignerKey,
          photoDataUrl,
          capturedAt: new Date().toISOString(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to capture live signer photo.');
      }
      setLivePhotoEvidence({
        photoDataUrl: payload.photoDataUrl,
        capturedAt: payload.capturedAt,
        capturedIp: payload.capturedIp,
        evidenceCaptureToken: payload.evidenceCaptureToken,
        captureMethod: payload.captureMethod,
      });
      setSuccessMessage('Live signer photo captured and linked to this signing session.');
      setErrorMessage('');
      closeCameraCapture();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to capture live signer photo.');
      setSuccessMessage('');
    } finally {
      setIsSavingEvidencePhoto(false);
    }
  };

  const requestAadhaarOtp = async () => {
    if (!password.trim()) {
      setErrorMessage('Enter the signing password before requesting Aadhaar OTP.');
      setSuccessMessage('');
      return;
    }
    if (!aadhaarState.identityValue.trim()) {
      setErrorMessage(aadhaarState.identityType === 'vid' ? 'Enter your 16-digit VID before requesting OTP.' : 'Enter your 12-digit Aadhaar number before requesting OTP.');
      setSuccessMessage('');
      return;
    }

    try {
      setIsRequestingAadhaarOtp(true);
      const response = await fetch(`/api/public/documents/${routeId}/aadhaar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_otp',
          password,
          signerName,
          identityType: aadhaarState.identityType,
          identityValue: aadhaarState.identityValue,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to request Aadhaar OTP.');
      }
      setAadhaarState((current) => ({
        ...current,
        transactionId: payload.transactionId || '',
        maskedId: payload.maskedId,
        providerLabel: payload.providerLabel,
      }));
      setSuccessMessage(payload?.message || 'Aadhaar OTP sent successfully.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to request Aadhaar OTP.');
      setSuccessMessage('');
    } finally {
      setIsRequestingAadhaarOtp(false);
    }
  };

  const verifyAadhaarOtp = async () => {
    if (!password.trim()) {
      setErrorMessage('Enter the signing password before verifying Aadhaar OTP.');
      setSuccessMessage('');
      return;
    }
    if (!aadhaarState.transactionId) {
      setErrorMessage('Request OTP first before verifying Aadhaar.');
      setSuccessMessage('');
      return;
    }
    if (!aadhaarState.otp.trim()) {
      setErrorMessage('Enter the OTP sent to your Aadhaar-linked mobile number.');
      setSuccessMessage('');
      return;
    }

    try {
      setIsVerifyingAadhaarOtp(true);
      const response = await fetch(`/api/public/documents/${routeId}/aadhaar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_otp',
          password,
          signerName,
          identityType: aadhaarState.identityType,
          identityValue: aadhaarState.identityValue,
          otp: aadhaarState.otp,
          transactionId: aadhaarState.transactionId,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to verify Aadhaar OTP.');
      }
      setDocumentData((prev) => prev ? {
        ...prev,
        recipientAadhaarVerifiedAt: payload.verifiedAt,
        recipientAadhaarVerifiedIp: payload.verifiedIp,
        recipientAadhaarReferenceId: payload.referenceId,
        recipientAadhaarMaskedId: payload.maskedId,
        recipientAadhaarVerificationMode: payload.verificationMode,
        recipientAadhaarProviderLabel: payload.providerLabel,
      } : prev);
      setAadhaarState((current) => ({
        ...current,
        verifiedAt: payload.verifiedAt,
        verifiedIp: payload.verifiedIp,
        referenceId: payload.referenceId,
        maskedId: payload.maskedId,
        providerLabel: payload.providerLabel,
      }));
      setSuccessMessage(payload?.message || 'Aadhaar verified successfully.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to verify Aadhaar OTP.');
      setSuccessMessage('');
    } finally {
      setIsVerifyingAadhaarOtp(false);
    }
  };

  const submitRequiredDocuments = async () => {
    try {
      setIsSubmittingDocuments(true);
      const submittedDocuments = (documentData?.requiredDocuments || [])
        .map((label) => documentUploads[label])
        .filter(Boolean) as SubmittedDocument[];

      const response = await fetch(`/api/public/documents/${routeId}/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          submitterName,
          submittedDocuments,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to submit required documents');
      }
      setDocumentData((prev) => prev ? {
        ...prev,
        submittedDocuments: payload.submittedDocuments || [],
        documentsVerificationStatus: payload.documentsVerificationStatus,
        documentsVerificationNotes: payload.documentsVerificationNotes,
      } : prev);
      setSuccessMessage('Required documents submitted successfully. Admin verification is now pending.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit required documents');
      setSuccessMessage('');
    } finally {
      setIsSubmittingDocuments(false);
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden" style={{ background: '#08090a' }}>
      <style jsx global>{`
        @keyframes form-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .form-marquee-track {
          width: max-content;
          animation: form-marquee 28s linear infinite;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ambient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/4 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-600/[0.05] blur-[120px]" />
        <div className="absolute right-0 bottom-1/3 h-[360px] w-[360px] rounded-full bg-emerald-600/[0.04] blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.25] [background-image:repeating-linear-gradient(135deg,rgba(148,163,184,0.04)_0,rgba(148,163,184,0.04)_100px,rgba(0,0,0,0)_100px,rgba(0,0,0,0)_240px)]" />
      </div>

      {/* process progress overlay */}
      {isProcessingRequest ? (
        <ProcessProgress
          active={isProcessingRequest}
          fullscreen
          showQuotes
          profile={isDownloadingPdf ? 'export' : isSigning || isSavingEvidencePhoto ? 'publish' : isUnlocking || isLoading ? 'sync' : 'save'}
          title={
            isSigning
              ? 'Completing secure signature'
              : isSavingEvidencePhoto
                ? 'Saving live signer photo'
                : isSavingEdits
                  ? 'Saving form changes'
                  : isDownloadingPdf
                    ? 'Preparing document download'
                    : isUnlocking
                      ? 'Unlocking secure document'
                      : 'Loading shared document'
          }
          subtitle="Please keep this tab open. This usually takes a few seconds."
          className="border-white/80 bg-white/95"
        />
      ) : null}

      {/* ══════════════════════════════════════════
          STICKY HEADER
      ══════════════════════════════════════════ */}
      <header className="relative z-40 border-b border-white/[0.07] bg-[#08090a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          {/* Brand */}
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.06]">
              <FileCheck2 className="h-4 w-4 text-white/70" />
            </div>
            <span className="hidden text-[13px] font-black lowercase tracking-[0.10em] text-white/60 sm:block">docrud</span>
          </div>

          {/* Document title */}
          <div className="flex-1 min-w-0 mx-2">
            <p className="truncate text-[13px] font-semibold text-white/80">
              {documentData?.templateName || 'Secure Document'}
            </p>
            {documentData?.referenceNumber && (
              <p className="text-[10px] text-white/30 truncate">Ref: {documentData.referenceNumber}</p>
            )}
          </div>

          {/* Step pills */}
          {showSigningStepper && (
            <div className="hidden sm:flex items-center gap-1">
              {(enableSigningStep
                ? [
                    { key: 'unlock' as const, label: '1 · Access', done: isUnlocked },
                    { key: 'review' as const, label: '2 · Review', done: isUnlocked && activeStep !== 'unlock' },
                    { key: 'complete' as const, label: '3 · Sign', done: isSigned },
                  ]
                : [
                    { key: 'unlock' as const, label: '1 · Access', done: isUnlocked },
                    { key: 'review' as const, label: '2 · Review', done: isUnlocked && activeStep !== 'unlock' },
                  ]
              ).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  disabled={!isUnlocked && s.key !== 'unlock'}
                  onClick={() => { if (isUnlocked || s.key === 'unlock') setActiveStep(s.key); }}
                  className={[
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-semibold whitespace-nowrap transition-all',
                    s.key === activeStep
                      ? 'bg-white text-slate-950 shadow-[0_2px_12px_rgba(255,255,255,0.16)]'
                      : s.done
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        : 'bg-white/[0.05] text-white/30 border border-white/[0.07]',
                  ].join(' ')}
                >
                  {s.done && s.key !== activeStep && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1.5 ml-2">
            {isUnlocked && (
              <button
                type="button"
                onClick={() => void downloadPdf()}
                disabled={isDownloadingPdf}
                title="Download PDF"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.04] text-white/50 transition hover:bg-white/[0.10] hover:text-white disabled:opacity-40"
              >
                {isDownloadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => void shareDocument()}
              title="Copy link"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.04] text-white/50 transition hover:bg-white/[0.10] hover:text-white"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Mobile step bar */}
        {showSigningStepper && (
          <div className="border-t border-white/[0.05] px-4 py-2.5 sm:hidden">
            <div className="flex items-center gap-1.5">
              {(enableSigningStep
                ? [
                    { key: 'unlock' as const, label: 'Access', done: isUnlocked },
                    { key: 'review' as const, label: 'Review', done: isUnlocked && activeStep !== 'unlock' },
                    { key: 'complete' as const, label: 'Sign', done: isSigned },
                  ]
                : [
                    { key: 'unlock' as const, label: 'Access', done: isUnlocked },
                    { key: 'review' as const, label: 'Review', done: isUnlocked && activeStep !== 'unlock' },
                  ]
              ).map((s, idx, arr) => (
                <div key={s.key} className="flex flex-1 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!isUnlocked && s.key !== 'unlock'}
                    onClick={() => { if (isUnlocked || s.key === 'unlock') setActiveStep(s.key); }}
                    className={[
                      'flex flex-1 items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold transition-all',
                      s.key === activeStep
                        ? 'bg-white text-slate-950 shadow-[0_2px_8px_rgba(255,255,255,0.15)]'
                        : s.done
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                          : 'bg-white/[0.04] text-white/30 border border-white/[0.06]',
                    ].join(' ')}
                  >
                    {s.done && s.key !== activeStep && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                    {s.label}
                  </button>
                  {idx < arr.length - 1 && <ChevronRight className="h-3 w-3 shrink-0 text-white/20" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ══════════════════════════════════════════
          MAIN BODY
      ══════════════════════════════════════════ */}
      <div className={`relative z-10 mx-auto w-full px-4 py-8 sm:px-6 sm:py-10 ${isMinimalFormPage ? 'max-w-3xl' : 'max-w-5xl'}`}>
        <div className="space-y-5">
          {/* —— global messages —— */}
          {(errorMessage || successMessage) && (
            <div className={[
              'flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm',
              errorMessage
                ? 'border-rose-500/20 bg-rose-500/[0.07] text-rose-300'
                : 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300',
            ].join(' ')}>
              {errorMessage
                ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                : <Check className="h-4 w-4 mt-0.5 shrink-0" />}
              <span className="flex-1">{errorMessage || successMessage}</span>
              <button
                type="button"
                onClick={() => { setErrorMessage(''); setSuccessMessage(''); }}
                className="shrink-0 text-white/30 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {isLoading && !documentData && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-white/30" />
            </div>
          )}
          {false ? (
            <div className="hidden">
		                {(() => {
		                  const stepKeys = enableSigningStep ? (['unlock', 'review', 'complete'] as const) : (['unlock', 'review'] as const);
		                  const stepIndex = Math.max(0, stepKeys.indexOf(activeStep as any));
		                  const progress = `${Math.round(((stepIndex + 1) / stepKeys.length) * 100)}%`;

			                  return (
			                    <>
			                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			                  <div className="min-w-0">
			                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/30">Secure flow</p>
			                    <p className="mt-1 text-sm font-semibold tracking-[-0.02em] text-white/90">
			                      Unlock • Review{enableSigningStep ? ' • Sign' : ''}
		                    </p>
		                  </div>
		                  <div className="flex items-center justify-between gap-2 sm:justify-end">
		                    <div className="hidden text-xs text-white/30 sm:block">
		                      {activeStep === 'unlock'
		                        ? 'Enter password to start.'
		                        : activeStep === 'review'
		                          ? 'Review and add feedback.'
		                          : isSigned
		                            ? 'Signed. You can download the copy.'
		                            : 'Complete signing requirements.'}
		                    </div>
		                    {isUnlocked ? (
		                      <Button
		                        type="button"
		                        variant="outline"
		                        size="icon"
		                        className="h-9 w-9 rounded-full border border-white/[0.10] bg-white/[0.05] text-white/60 hover:bg-white/[0.10] hover:text-white"
		                        onClick={() => void downloadPdf()}
		                        disabled={isDownloadingPdf}
		                        title={isDownloadingPdf ? 'Preparing download' : 'Download PDF'}
		                        aria-label={isDownloadingPdf ? 'Preparing download' : 'Download PDF'}
		                      >
		                        <Download className="h-4 w-4" />
		                      </Button>
		                    ) : null}
		                    <Button
		                      type="button"
		                      variant="outline"
		                      className="h-9 rounded-full border border-white/[0.10] bg-white/[0.05] px-4 text-sm font-semibold text-white/60 hover:bg-white/[0.10] hover:text-white"
		                      onClick={() => {
		                        if (enableSigningStep) {
		                          setActiveStep(activeStep === 'unlock' ? 'review' : activeStep === 'review' ? 'complete' : 'review');
		                          return;
		                        }
		                        setActiveStep(activeStep === 'unlock' ? 'review' : 'unlock');
		                      }}
		                      disabled={!isUnlocked && activeStep !== 'unlock'}
		                    >
		                      {enableSigningStep
		                        ? (activeStep === 'unlock' ? 'Go to review' : activeStep === 'review' ? 'Go to sign' : 'Back to review')
		                        : (activeStep === 'unlock' ? 'Go to review' : 'Back to unlock')}
		                    </Button>
		                  </div>
		                </div>
		                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
		                  {(
		                    (enableSigningStep
		                      ? ([
		                          { key: 'unlock', label: 'Unlock', disabled: false, done: isUnlocked },
		                          { key: 'review', label: 'Review', disabled: !isUnlocked, done: isUnlocked && activeStep !== 'unlock' },
		                          { key: 'complete', label: 'Sign', disabled: !isUnlocked, done: isSigned },
		                        ] as const)
		                      : ([
		                          { key: 'unlock', label: 'Unlock', disabled: false, done: isUnlocked },
		                          { key: 'review', label: 'Review', disabled: !isUnlocked, done: isUnlocked && activeStep !== 'unlock' },
		                        ] as const))
		                  ).map((step) => (
		                    <button
		                      key={step.key}
		                      type="button"
		                      onClick={() => setActiveStep(step.key)}
		                      disabled={step.disabled}
		                      className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ring-1 ${
		                        step.key === activeStep
		                          ? 'bg-white text-[#0D0D0F] ring-transparent font-bold'
		                          : step.disabled
		                            ? 'cursor-not-allowed bg-white/[0.04] text-white/20 ring-white/[0.06]'
		                            : 'bg-white/[0.07] text-white/55 ring-white/[0.10] hover:bg-white/[0.12]'
		                      }`}
		                    >
		                      <span className="inline-flex items-center gap-2">
		                        <span className={`h-2 w-2 rounded-full ${step.done ? 'bg-emerald-300' : step.key === activeStep ? 'bg-white' : 'bg-slate-300'}`} />
		                        {step.label}
		                      </span>
		                    </button>
		                  ))}
		                </div>
		                <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
		                  <div
		                    className="h-full rounded-full bg-white/60 transition-all"
			                    style={{ width: progress }}
			                  />
			                </div>
			                    </>
			                  );
			                })()}
		              </div>
		            ) : null}


          {/* ══════════════════════════════════════════
              STEP 1: UNLOCK
          ══════════════════════════════════════════ */}
          {documentData && !isUnlocked && documentData.requiresPassword !== false && (!showSigningStepper || activeStep === 'unlock') && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-full max-w-md">
                {/* Icon + heading */}
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                    <Lock className="h-7 w-7 text-white/40" />
                  </div>
                  <h1 className="text-2xl font-semibold tracking-[-0.04em] text-white">Access this document</h1>
                  <p className="mt-2 text-sm text-white/40">Enter the password shared with you to unlock and review this secure document.</p>
                </div>

                {/* Password card */}
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/35">Document password</label>
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value.toUpperCase())}
                      onKeyDown={(e) => { if (e.key === 'Enter') void unlockDocument(); }}
                      placeholder="Enter password"
                      className="h-11 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 font-mono text-sm tracking-[0.18em] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void unlockDocument()}
                    disabled={isUnlocking || !password.trim()}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white font-semibold text-slate-950 shadow-[0_8px_32px_rgba(255,255,255,0.10)] transition hover:bg-white/90 active:scale-[0.98] disabled:opacity-50"
                  >
                    {isUnlocking ? <><Loader2 className="h-4 w-4 animate-spin" /> Unlocking…</> : <><ShieldCheck className="h-4 w-4" /> Unlock Document</>}
                  </button>
                  <p className="text-center text-[11px] text-white/25">Access is logged for security and compliance.</p>
                </div>

                {/* What happens next */}
                <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">What happens next</p>
                  {[
                    { icon: <FileText className="h-3.5 w-3.5" />, text: 'Review the document in full — PDF or generated document.' },
                    { icon: <ShieldCheck className="h-3.5 w-3.5" />, text: 'Complete identity verification steps (OTP, camera, location).' },
                    { icon: <CheckCircle2 className="h-3.5 w-3.5" />, text: 'Sign assigned boxes and receive a signed copy by email.' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm text-white/50">
                      <span className="mt-0.5 shrink-0 text-white/25">{item.icon}</span>
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showSigningStepper && !isUnlocked && activeStep !== 'unlock' && (
            <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] px-4 py-3 text-sm text-amber-300/80">
              Unlock the document first to continue to this step.
            </div>
          )}

          {/* ══════════════════════════════════════════
              STEP 2: REVIEW
          ══════════════════════════════════════════ */}
          {isUnlocked && (!showSigningStepper || activeStep === 'review') && (
            <div className="space-y-5">

              {/* Docsheet */}
              {activeSharedSheet && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">Shared DocSheet</p>
                      <h2 className="mt-1 text-base font-semibold text-white">{sharedWorkbook?.title || 'Shared Sheet'}</h2>
                      <p className="mt-0.5 text-xs text-white/40">
                        {documentData?.docsheetShareMode === 'edit' ? 'Editable — changes sync back to the sender workspace.' : 'View only.'}
                      </p>
                    </div>
                    <span className="inline-flex h-7 w-fit items-center rounded-full border border-white/[0.08] px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      {documentData?.docsheetSessionStatus || 'active'}
                    </span>
                  </div>
                </div>
              )}

              {/* Generated HTML document */}
              {documentData?.previewHtml && documentData?.documentSourceType !== 'uploaded_pdf' && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                  <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">Document Preview</p>
                      <h2 className="mt-0.5 text-sm font-semibold text-white">{documentData.templateName}</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDocumentExpanded((p) => !p)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      <RefreshCw className="h-3 w-3" /> {documentExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                  <div className="p-4">
                    <iframe
                      title={documentData.templateName}
                      srcDoc={documentData.previewHtml}
                      className={`w-full rounded-xl border border-white/[0.06] bg-white ${documentExpanded ? 'min-h-[90vh]' : 'h-[60vh] min-h-[420px]'}`}
                    />
                  </div>
                </div>
              )}

              {/* Uploaded PDF */}
              {documentData?.documentSourceType === 'uploaded_pdf' && documentData.uploadedPdfPreviewUrl && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                  <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">PDF Document</p>
                      <h2 className="mt-0.5 text-sm font-semibold text-white">{documentData.uploadedPdfFileName || documentData.templateName}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDocumentExpanded((p) => !p)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white"
                      >
                        {documentExpanded ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                  </div>
                  <div className="p-4">
                    {boxPlacement?.boxes?.length ? (
                      <div className={`w-full overflow-auto rounded-xl border border-white/[0.06] bg-white ${documentExpanded ? 'min-h-[90vh]' : 'h-[62vh] min-h-[480px]'}`}>
                        <PdfSignatureBoxPreview
                          pdfDataUrl={String(documentData.uploadedPdfPreviewUrl)}
                          boxes={boxPlacement.boxes as any}
                          scale={1.25}
                          maxPages={24}
                        />
                      </div>
                    ) : (
                      <iframe
                        title={documentData.uploadedPdfFileName || documentData.templateName}
                        src={documentData.uploadedPdfPreviewUrl}
                        className={`w-full rounded-xl border border-white/[0.06] bg-white ${documentExpanded ? 'min-h-[90vh]' : 'h-[62vh] min-h-[480px]'}`}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Data collection / editable fields */}
              {documentData && documentData.recipientAccess === 'edit' && !documentData.templateId?.startsWith('docsheet') && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                  <div className="border-b border-white/[0.06] px-5 py-4">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">
                      {documentData.dataCollectionEnabled ? 'Form Submission' : 'Editable Fields'}
                    </p>
                    {documentData.dataCollectionEnabled && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${hasReachedSubmissionLimit ? 'bg-white/[0.06] text-white/30' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {hasReachedSubmissionLimit ? 'Locked' : `${remainingFormEdits} edit${remainingFormEdits === 1 ? '' : 's'} remaining`}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <fieldset disabled={documentData.dataCollectionEnabled && hasReachedSubmissionLimit} className={`grid grid-cols-1 gap-4 ${formFieldColumns === 2 ? 'sm:grid-cols-2' : ''} disabled:opacity-60`}>
                      {(documentData.templateFields || []).map((field) => (
                        <div key={field.id} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                          <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/35">{field.label}</label>
                          {field.type === 'textarea' ? (
                            <RichTextEditor value={editableData[field.name] || ''} onChange={(v) => setEditableData((p) => ({ ...p, [field.name]: v }))} />
                          ) : field.type === 'select' ? (
                            <select
                              value={editableData[field.name] || ''}
                              onChange={(e) => setEditableData((p) => ({ ...p, [field.name]: e.target.value }))}
                              className="h-10 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 text-sm text-white/80 focus:border-white/25 focus:outline-none"
                            >
                              <option value="">{field.placeholder || `Select ${field.label.toLowerCase()}`}</option>
                              {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : field.type === 'radio' ? (
                            <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                              {(field.options || []).map((opt) => (
                                <label key={opt} className="flex items-center gap-3 text-sm text-white/60">
                                  <input type="radio" name={field.name} value={opt} checked={editableData[field.name] === opt} onChange={(e) => setEditableData((p) => ({ ...p, [field.name]: e.target.value }))} />
                                  {opt}
                                </label>
                              ))}
                            </div>
                          ) : field.type === 'checkbox' ? (
                            <label className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white/60">
                              <input type="checkbox" checked={['true','yes','checked','1'].includes((editableData[field.name]||'').toLowerCase())} onChange={(e) => setEditableData((p) => ({ ...p, [field.name]: e.target.checked ? 'Yes' : '' }))} />
                              {field.placeholder || 'Checked'}
                            </label>
                          ) : field.type === 'image' ? (
                            <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                              <Input type="file" accept="image/*" onChange={(e) => handleFormImageUpload(field.name, e.target.files?.[0] || null)} />
                              {editableData[field.name] && <Image src={editableData[field.name]} alt={field.label} width={640} height={320} unoptimized className="max-h-48 w-full rounded-lg object-contain" />}
                            </div>
                          ) : (
                            <Input
                              type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : 'text'}
                              value={editableData[field.name] || ''}
                              onChange={(e) => setEditableData((p) => ({ ...p, [field.name]: e.target.value }))}
                              placeholder={field.placeholder}
                              className="h-10 rounded-xl border-white/[0.10] bg-white/[0.04] text-white/80 placeholder:text-white/20"
                            />
                          )}
                        </div>
                      ))}
                    </fieldset>
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <p className="text-xs text-white/30">
                        {documentData.dataCollectionEnabled && allowSingleEditAfterSubmit
                          ? hasReachedSubmissionLimit ? 'Edit window closed.' : `${remainingFormEdits} edit${remainingFormEdits === 1 ? '' : 's'} left after submit.`
                          : ''}
                      </p>
                      <button
                        type="button"
                        onClick={() => void saveEdits()}
                        disabled={isSavingEdits || (documentData.dataCollectionEnabled && hasReachedSubmissionLimit)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.12] bg-white px-6 text-sm font-semibold text-slate-950 transition hover:bg-white/90 disabled:opacity-50"
                      >
                        {isSavingEdits ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : (documentData.dataCollectionEnabled ? submitActionLabel : 'Save Changes')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Comments */}
              {!documentData?.dataCollectionEnabled && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                  <div className="border-b border-white/[0.06] px-5 py-4">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">Comments & Reviews</p>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/35">Your Name</label>
                        <input
                          value={reviewerName}
                          onChange={(e) => setReviewerName(e.target.value)}
                          placeholder="Full name"
                          className="h-10 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 text-sm text-white/80 placeholder:text-white/20 focus:border-white/25 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/35">Type</label>
                        <div className="flex h-10 gap-1.5">
                          {(['comment', 'review'] as const).map((t) => (
                            <button key={t} type="button" onClick={() => setCommentType(t)}
                              className={`flex-1 rounded-xl border text-[11.5px] font-semibold capitalize transition ${commentType === t ? 'border-white/25 bg-white/10 text-white' : 'border-white/[0.08] bg-white/[0.03] text-white/35 hover:bg-white/[0.06]'}`}>
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <RichTextEditor value={commentMessage} onChange={setCommentMessage} placeholder="Add your comments, review notes, or approval observations" />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void saveComment()}
                        disabled={isSavingComment || !reviewerName.trim() || !commentMessage.trim()}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.06] px-5 text-sm font-semibold text-white/70 transition hover:bg-white/[0.10] hover:text-white disabled:opacity-40"
                      >
                        {isSavingComment ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><MessageSquare className="h-3.5 w-3.5" /> Add Feedback</>}
                      </button>
                    </div>
                    {(documentData?.collaborationComments || []).length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                        {(documentData?.collaborationComments || []).map((item) => (
                          <div key={item.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <p className="text-sm font-semibold text-white/80">{item.authorName}</p>
                              <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/30">{item.type}</span>
                            </div>
                            <div className="prose prose-sm prose-invert max-w-none text-sm text-white/50" dangerouslySetInnerHTML={{ __html: sanitizeEditorHtml(item.message) }} />
                            <p className="mt-2 text-[10px] text-white/25">{new Date(item.createdAt).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Navigate to sign */}
              {enableSigningStep && !isSigned && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveStep('complete')}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/[0.12] bg-white px-8 text-sm font-semibold text-slate-950 shadow-[0_4px_20px_rgba(255,255,255,0.10)] transition hover:bg-white/90 active:scale-[0.98]"
                  >
                    Continue to Sign <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════
              STEP 3: SIGN
          ══════════════════════════════════════════ */}
          {isUnlocked && documentData?.recipientSignatureRequired && !documentData.hasRecipientSignature &&
            (!documentData.requiredDocumentWorkflowEnabled || documentData.documentsVerificationStatus === 'verified') &&
            (!showSigningStepper || activeStep === 'complete') && (
            <div className="space-y-5">

              {/* Required documents gate */}
              {documentData?.requiredDocumentWorkflowEnabled && documentData.documentsVerificationStatus !== 'verified' && (
                <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] px-4 py-3 text-sm text-amber-300/80">
                  <p className="font-semibold">Document verification pending</p>
                  <p className="mt-0.5 opacity-70">Signing will unlock after the admin verifies your submitted documents.</p>
                </div>
              )}

              {/* Signer slot selector */}
              {boxPlacement && signerKeys.length > 1 && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">Your Signer Slot</p>
                  <select
                    className="h-10 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 text-sm text-white/80 focus:border-white/25 focus:outline-none"
                    value={activeSignerKey}
                    disabled={Boolean(signingToken)}
                    onChange={(e) => {
                      setActiveSignerKey(e.target.value);
                      setLivePhotoEvidence(null);
                      setSignatureDataUrl('');
                      setOtpSessionId('');
                      setOtpCode('');
                      setOtpVerifiedAt('');
                    }}
                  >
                    {signerKeys.map((key, idx) => (
                      <option key={key} value={key}>{`Signer ${idx + 1} (${key})`}</option>
                    ))}
                  </select>
                  {signingToken && <p className="text-xs text-white/30">This link is locked to your assigned signer slot.</p>}
                </div>
              )}

              {/* Verification checklist */}
              {verificationChecklist.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">Verification Gates</p>
                      <p className="mt-0.5 text-sm text-white/60">Complete all checks before signing</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[10.5px] font-semibold ${verificationComplete ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {verificationChecklist.filter((i) => i.done).length}/{verificationChecklist.length} complete
                    </span>
                  </div>
                  <div className="grid gap-2 p-4 sm:grid-cols-2">
                    {verificationChecklist.map((item) => (
                      <div key={item.key} className={[
                        'flex items-center gap-3 rounded-xl border px-4 py-3.5 text-sm transition',
                        item.done
                          ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300'
                          : 'border-white/[0.07] bg-white/[0.02] text-white/50',
                      ].join(' ')}>
                        {item.done
                          ? <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-400" />
                          : <div className="h-4 w-4 shrink-0 rounded-full border-2 border-white/20" />}
                        <span className="flex-1 text-[13px]">{item.label}</span>
                        {!item.done && item.key === 'otp' && (
                          <button type="button" onClick={() => setEmailOtpDialogOpen(true)}
                            className="shrink-0 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.12] hover:text-white">
                            Verify
                          </button>
                        )}
                        {!item.done && item.key === 'location' && (
                          <button type="button" onClick={() => void captureLocation()} disabled={isCapturingLocation}
                            className="shrink-0 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.12] hover:text-white disabled:opacity-40">
                            {isCapturingLocation ? 'Capturing…' : 'Enable'}
                          </button>
                        )}
                        {!item.done && item.key === 'camera' && (
                          <button type="button" onClick={() => void openCameraCapture()} disabled={isStartingCamera}
                            className="shrink-0 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.12] hover:text-white disabled:opacity-40">
                            {isStartingCamera ? 'Opening…' : 'Capture'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Camera capture */}
              {cameraOpen && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0b0c]">
                  <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">Live Camera Capture</p>
                      <p className="mt-0.5 text-xs text-white/35">Look directly at the camera and click Capture.</p>
                    </div>
                    <button type="button" onClick={closeCameraCapture}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.10] bg-white/[0.05] text-white/40 transition hover:bg-white/[0.10] hover:text-white">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="p-4">
                    {/* Live preview */}
                    <div className="relative overflow-hidden rounded-xl bg-black aspect-video max-h-[320px] sm:max-h-[280px]">
                      <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
                      {/* Face guide overlay */}
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="h-40 w-32 rounded-full border-2 border-white/20 sm:h-36 sm:w-28" />
                      </div>
                    </div>
                    {/* Captured preview + actions */}
                    <div className="mt-3 flex items-center gap-3">
                      {displayedPhotoEvidence && (
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-emerald-500/25">
                          <Image src={displayedPhotoEvidence.photoDataUrl} alt="Captured" width={56} height={56} unoptimized className="h-full w-full object-cover" />
                        </div>
                      )}
                      <div className="flex flex-1 gap-2">
                        <button type="button" onClick={() => void captureLiveEvidencePhoto()} disabled={isSavingEvidencePhoto}
                          className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white text-sm font-semibold text-slate-950 transition hover:bg-white/90 active:scale-[0.98] disabled:opacity-50">
                          {isSavingEvidencePhoto ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Camera className="h-4 w-4" /> {displayedPhotoEvidence ? 'Retake' : 'Capture Photo'}</>}
                        </button>
                      </div>
                    </div>
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                </div>
              )}

              {/* Location status */}
              {activeSignerConfig.captureIpDeviceLocationEnabled && clientLocation && (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 text-sm">
                  <MapPin className="h-4 w-4 shrink-0 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-emerald-300">Location captured</p>
                    <p className="text-xs text-emerald-400/70 truncate">{clientLocation.label} · {new Date(clientLocation.capturedAt).toLocaleTimeString()}</p>
                  </div>
                  <button type="button" onClick={() => void captureLocation()} disabled={isCapturingLocation}
                    className="shrink-0 text-[10.5px] font-semibold text-emerald-400/60 hover:text-emerald-300">
                    Refresh
                  </button>
                </div>
              )}

              {/* Signer identity */}
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                <div className="border-b border-white/[0.06] px-5 py-4">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">Signer Identity</p>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  {!signingToken && (
                    <div className="space-y-1.5">
                      <label className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/35">Signing password</label>
                      <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value.toUpperCase())}
                        placeholder="Enter password"
                        className="h-10 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 font-mono text-sm text-white/80 placeholder:text-white/20 focus:border-white/25 focus:outline-none"
                      />
                    </div>
                  )}
                  {signingToken && (
                    <div className="space-y-1.5">
                      <label className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/35">Access</label>
                      <div className="flex h-10 items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-sm text-emerald-300">Unlocked via secure link</span>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/35">Your full name <span className="text-rose-400">*</span></label>
                    <input
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="Full name as it will appear on the signed document"
                      className="h-10 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 text-sm text-white/80 placeholder:text-white/20 focus:border-white/25 focus:outline-none"
                    />
                  </div>
                </div>
                {activeSignerConfig.emailOtpEnabled && (
                  <div className="flex items-center gap-3 border-t border-white/[0.06] px-5 py-3">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-400" />
                    <p className="flex-1 text-xs text-white/45">
                      OTP will be sent to{' '}
                      <span className="font-semibold text-white/60">
                        {documentData?.signingSession?.signerEmail?.trim() || 'your assigned email'}
                      </span>
                    </p>
                    {otpVerifiedAt
                      ? <span className="text-[10.5px] font-semibold text-emerald-400">Verified ✓</span>
                      : <button type="button" onClick={() => setEmailOtpDialogOpen(true)}
                          className="text-[10.5px] font-semibold text-white/50 underline underline-offset-2 hover:text-white">
                          Verify now
                        </button>
                    }
                  </div>
                )}
              </div>

              {/* Signature boxes or signature pad */}
              {boxPlacement ? (
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                  <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">Signature Boxes</p>
                      <p className="mt-0.5 text-xs text-white/40">Click each highlighted box on the document to add your signature</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[10.5px] font-semibold ${missingRequiredBoxIds.length ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {missingRequiredBoxIds.length ? `${missingRequiredBoxIds.length} remaining` : 'All signed ✓'}
                    </span>
                  </div>
                  <div className="p-4">
                    <PdfSignatureBoxSigner
                      pdfDataUrl={String(documentData?.uploadedPdfPreviewUrl || '')}
                      boxes={(boxesForActiveSigner || boxPlacement.boxes) as any}
                      signatures={boxSignaturesById}
                      onChange={(next) => {
                        setBoxSignaturesById(next);
                        const first = Object.values(next).find((v) => typeof v === 'string' && v.startsWith('data:image/')) || '';
                        if (first) { setSignatureSource('drawn'); setSignatureDataUrl(first); }
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                  <div className="border-b border-white/[0.06] px-5 py-4">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">Signature</p>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="flex gap-2">
                      {(['drawn', 'uploaded'] as const).map((src) => (
                        <button key={src} type="button"
                          onClick={() => { setSignatureSource(src); setSignatureDataUrl(''); }}
                          className={`flex-1 h-9 rounded-xl border text-[11.5px] font-semibold capitalize transition ${signatureSource === src ? 'border-white/25 bg-white/10 text-white' : 'border-white/[0.08] bg-white/[0.03] text-white/35 hover:bg-white/[0.06]'}`}>
                          {src === 'drawn' ? 'Draw signature' : 'Upload image'}
                        </button>
                      ))}
                    </div>
                    {signatureSource === 'drawn' ? (
                      <SignaturePad value={signatureDataUrl} onChange={(v) => { setSignatureSource('drawn'); setSignatureDataUrl(v); }} />
                    ) : (
                      <div className="space-y-2">
                        <Input type="file" accept="image/*" onChange={(e) => handleSignatureUpload(e.target.files?.[0] || null)} />
                        {signatureDataUrl && <p className="text-xs text-emerald-400">Signature image ready.</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Consent attestation */}
              {activeSignerConfig.consentRequired && (
                <label className={[
                  'flex cursor-pointer items-start gap-3 rounded-2xl border px-5 py-4 transition',
                  attestationAccepted
                    ? 'border-emerald-500/20 bg-emerald-500/[0.05]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]',
                ].join(' ')}>
                  <input
                    type="checkbox"
                    checked={attestationAccepted}
                    onChange={(e) => setAttestationAccepted(e.target.checked)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className={`text-sm leading-relaxed ${attestationAccepted ? 'text-emerald-300/80' : 'text-white/45'}`}>
                    {signingAttestationText}
                  </span>
                </label>
              )}

              {/* Sign button */}
              <div className="flex flex-col items-end gap-2">
                {(!signingToken && !password.trim()) && <p className="text-xs text-rose-400/70">Enter your signing password to proceed.</p>}
                {!signerName.trim() && <p className="text-xs text-rose-400/70">Your full name is required.</p>}
                <button
                  type="button"
                  onClick={handleSignClick}
                  disabled={
                    isSigning
                    || (!signingToken && !password.trim())
                    || !signerName.trim()
                    || (boxPlacement ? missingRequiredBoxIds.length > 0 : !signatureDataUrl)
                    || (activeSignerConfig.captureIpDeviceLocationEnabled && !clientLocation)
                    || (activeSignerConfig.cameraCaptureEnabled && !livePhotoEvidence?.evidenceCaptureToken)
                    || (activeSignerConfig.consentRequired && !attestationAccepted)
                    || Boolean(documentData?.recipientAadhaarVerificationRequired && (!documentData?.aadhaarVerificationConfigured || !aadhaarVerified))
                  }
                  className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-white/[0.12] bg-white text-sm font-semibold text-slate-950 shadow-[0_8px_32px_rgba(255,255,255,0.12)] transition hover:bg-white/90 active:scale-[0.98] disabled:opacity-50 sm:w-auto sm:px-10"
                >
                  {isSigning ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing…</> : <><FileCheck2 className="h-4 w-4" /> Sign Document</>}
                </button>
              </div>
            </div>
          )}

          {/* Required documents upload */}
          {isUnlocked && documentData?.requiredDocumentWorkflowEnabled && (!showSigningStepper || activeStep === 'complete') &&
            (documentData.documentsVerificationStatus === 'pending' || documentData.documentsVerificationStatus === 'rejected' || !documentData.submittedDocuments?.length) && (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">Required Document Submission</p>
                <p className="mt-0.5 text-xs text-white/40">Upload all required documents before signing is enabled.</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/35">Your full name</label>
                  <Input value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} placeholder="Full name" />
                </div>
                {(documentData.requiredDocuments || []).map((label) => (
                  <div key={label} className="space-y-1.5">
                    <label className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/35">{label}</label>
                    <Input type="file" onChange={(e) => handleDocumentUpload(label, e.target.files?.[0] || null)} />
                    {documentUploads[label]?.fileName && <p className="text-xs text-emerald-400">Selected: {documentUploads[label]?.fileName}</p>}
                  </div>
                ))}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void submitRequiredDocuments()}
                    disabled={isSubmittingDocuments || !submitterName.trim() || (documentData.requiredDocuments || []).some((l) => !documentUploads[l])}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.12] bg-white px-6 text-sm font-semibold text-slate-950 transition hover:bg-white/90 disabled:opacity-50"
                  >
                    {isSubmittingDocuments ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…</> : 'Submit Documents'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              SIGNED: RECEIPT
          ══════════════════════════════════════════ */}
          {isUnlocked && documentData?.hasRecipientSignature && (!showSigningStepper || activeStep === 'complete') && (
            <div className="space-y-4">
              {/* Completion banner */}
              <div className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05]">
                <div className="flex items-center gap-4 px-5 py-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.10]">
                    <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-emerald-300">Document signed successfully</p>
                    <p className="mt-0.5 text-sm text-emerald-400/60 truncate">{documentData.templateName}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 border-t border-emerald-500/10 px-5 pb-5 pt-4 sm:flex-row">
                  <button type="button" onClick={() => void downloadPdf()} disabled={isDownloadingPdf}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50">
                    {isDownloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download Signed PDF
                  </button>
                  <button type="button" onClick={() => void downloadSignatureReceipt()} disabled={isDownloadingReceipt}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.05] text-sm font-semibold text-white/60 transition hover:bg-white/[0.08] disabled:opacity-50">
                    {isDownloadingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Signature Receipt
                  </button>
                </div>
              </div>

              {/* Signers detail */}
              {documentData.signatureReceiptCompletionPageEnabled !== false && receiptSigners.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                  <div className="border-b border-white/[0.06] px-5 py-4">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">Signature Receipt</p>
                    <p className="mt-0.5 text-xs text-white/40">Envelope: {documentData.shareId || documentData.id}</p>
                  </div>
                  <div className="divide-y divide-white/[0.05]">
                    {receiptSigners.map((signer, idx) => (
                      <div key={`${signer.signerKey}-${idx}`} className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <p className="text-sm font-semibold text-white">{signer.signerName}</p>
                            <p className="text-xs text-white/40 mt-0.5">{signer.signerEmail || '—'}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-[10.5px] font-semibold ${signer.signingStatus === 'signed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                            {signer.signingStatus === 'signed' ? 'Signed ✓' : 'Pending'}
                          </span>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                          {signer.photoDataUrl ? (
                            <div className="overflow-hidden rounded-xl border border-white/[0.07]">
                              <Image src={signer.photoDataUrl} alt="Signer photo" width={140} height={140} unoptimized className="h-36 w-full object-cover" />
                            </div>
                          ) : (
                            <div className="flex h-36 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.02] text-xs text-white/20">No photo</div>
                          )}
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">Signature Details</p>
                              <div className="space-y-1.5 text-xs text-white/50">
                                <div><span className="text-white/30">Signed at: </span><span className="text-white/70">{signer.signedAt ? new Date(signer.signedAt).toLocaleString() : '—'}</span></div>
                                <div><span className="text-white/30">IP: </span><span className="text-white/70">{signer.signedIp || '—'}</span></div>
                                <div><span className="text-white/30">Auth: </span><span className="text-white/70">{(signer.authenticationMethods || []).join(' · ') || '—'}</span></div>
                                {signer.signatureBoxSummary && (
                                  <div><span className="text-white/30">Fields: </span><span className="text-white/70">{signer.signatureBoxSummary.completedBoxes}/{signer.signatureBoxSummary.totalBoxes} completed</span></div>
                                )}
                              </div>
                            </div>
                            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">Consent</p>
                              <p className="text-xs text-white/50 leading-relaxed">{signer.consentText || signingAttestationText}</p>
                              {signer.consentedAt && (
                                <p className="text-[10px] text-white/30">Accepted: {new Date(signer.consentedAt).toLocaleString()}</p>
                              )}
                              {signer.signedLocationLabel && (
                                <p className="text-[10px] text-white/30"><MapPin className="mr-1 inline h-3 w-3" />{signer.signedLocationLabel}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Audit metadata */}
                  <div className="border-t border-white/[0.05] p-5">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/25">Audit Metadata</p>
                    <div className="grid gap-3 sm:grid-cols-2 text-xs text-white/50">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3 space-y-1">
                        <p><span className="text-white/30">Document ID: </span><span className="font-mono text-white/60">{documentData.id}</span></p>
                        <p><span className="text-white/30">Envelope ID: </span><span className="font-mono text-white/60">{documentData.shareId || documentData.id}</span></p>
                        {documentData.referenceNumber && <p><span className="text-white/30">Reference: </span><span className="text-white/60">{documentData.referenceNumber}</span></p>}
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3 space-y-1">
                        <p><span className="text-white/30">Link policy: </span><span className="capitalize text-white/60">{documentData.shareAccessPolicy || 'standard'}</span></p>
                        {documentData.shareExpiresAt && <p><span className="text-white/30">Expires: </span><span className="text-white/60">{new Date(documentData.shareExpiresAt).toLocaleDateString()}</span></p>}
                        <p><span className="text-white/30">Generated: </span><span className="text-white/60">{new Date(documentData.generatedAt).toLocaleDateString()}</span></p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════
              EMAIL OTP DIALOG
          ══════════════════════════════════════════ */}
          <Dialog open={emailOtpDialogOpen} onOpenChange={setEmailOtpDialogOpen}>
            <DialogContent className="mx-auto max-w-[480px] w-[calc(100vw-32px)] rounded-3xl border border-white/[0.10] bg-[#0f1012] p-0 shadow-[0_32px_80px_rgba(0,0,0,0.8)]">
              <div className="border-b border-white/[0.07] px-5 py-4 sm:px-6 sm:py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/[0.08]">
                    <ShieldCheck className="h-5 w-5 text-indigo-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-[14px] font-semibold text-white">Email OTP Verification</DialogTitle>
                    <p className="text-[11px] text-white/35">Verify your identity before signing</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4 px-5 py-5 sm:px-6">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-sm text-white/50 leading-relaxed">
                  An OTP will be sent to{' '}
                  <span className="font-semibold text-indigo-300">
                    {documentData?.signingSession?.signerEmail?.trim() || 'your assigned signer email'}
                  </span>
                </div>

                {/* Send OTP button (shown first) */}
                {!otpSessionId && (
                  <button type="button" onClick={() => void requestEmailOtp()} disabled={isRequestingEmailOtp}
                    className="h-11 w-full rounded-xl border border-white/[0.12] bg-white/[0.07] text-sm font-semibold text-white transition hover:bg-white/[0.12] active:scale-[0.98] disabled:opacity-50">
                    {isRequestingEmailOtp ? 'Sending OTP…' : 'Send OTP to my email'}
                  </button>
                )}

                {otpSessionId && (
                  <>
                    {/* OTP input — large touch target */}
                    <div className="space-y-2">
                      <label className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/30">Enter 6-digit OTP</label>
                      <input
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        inputMode="numeric"
                        maxLength={6}
                        className="h-14 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 text-center font-mono text-2xl tracking-[0.4em] text-white placeholder:text-white/15 focus:border-white/30 focus:outline-none"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button type="button" onClick={() => void requestEmailOtp()} disabled={isRequestingEmailOtp}
                        className="flex-1 h-11 rounded-xl border border-white/[0.10] bg-white/[0.04] text-sm font-semibold text-white/60 transition hover:bg-white/[0.08] disabled:opacity-50">
                        {isRequestingEmailOtp ? 'Sending…' : 'Resend OTP'}
                      </button>
                      <button type="button" onClick={() => void verifyEmailOtp()} disabled={isVerifyingEmailOtp || otpCode.length < 6 || !otpSessionId}
                        className="flex-1 h-11 rounded-xl border border-white/[0.12] bg-white text-sm font-semibold text-slate-950 transition hover:bg-white/90 active:scale-[0.98] disabled:opacity-50">
                        {isVerifyingEmailOtp ? 'Verifying…' : 'Verify OTP'}
                      </button>
                    </div>
                  </>
                )}

                {otpVerifiedAt && (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-300">Email verified</p>
                      <p className="text-xs text-emerald-400/60">Verified at {new Date(otpVerifiedAt).toLocaleTimeString()}</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setEmailOtpDialogOpen(false)}
                    className="flex-1 h-11 rounded-xl border border-white/[0.08] bg-white/[0.03] text-sm font-semibold text-white/40 transition hover:bg-white/[0.06]">
                    Cancel
                  </button>
                  {otpVerifiedAt && (
                    <button type="button" onClick={() => { setEmailOtpDialogOpen(false); void signDocument(); }}
                      className="flex-1 h-11 rounded-xl border border-white/[0.12] bg-white text-sm font-semibold text-slate-950 transition hover:bg-white/90 active:scale-[0.98]">
                      Continue to sign →
                    </button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Footer */}
          <div className="border-t border-white/[0.05] pt-6 text-center text-[11px] leading-6 text-white/20">
            <p>Secured by docrud · End-to-end signed audit trail</p>
            <p className="mt-1">
              <a href="/terms-and-conditions" className="hover:text-white/40">Terms</a>
              {' · '}
              <a href="/privacy-policy" className="hover:text-white/40">Privacy</a>
            </p>
          </div>

        </div>{/* end space-y-5 */}
      </div>{/* end body container */}
    </main>
  );
}
