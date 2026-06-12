import { DashboardMetrics, DocumentHistory } from '@/types/document';
import { buildLocationBucket } from '@/lib/location';

export function buildDashboardMetrics(history: DocumentHistory[]): DashboardMetrics {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);

  const topTemplates = Object.entries(
    history.reduce<Record<string, number>>((acc, item) => {
      acc[item.templateName] = (acc[item.templateName] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([templateName, count]) => ({ templateName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const recentFeedback = history
    .flatMap((item) =>
      (item.collaborationComments || []).map((comment) => ({
        ...comment,
        documentId: item.id,
        shareUrl: item.shareUrl,
        templateName: item.templateName,
        referenceNumber: item.referenceNumber,
      }))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const documentSummary = [...history]
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
    .map((item) => {
      const accessEvents = item.accessEvents || [];
      const commentCount = (item.collaborationComments || []).filter((comment) => comment.type === 'comment').length;
      const reviewCount = (item.collaborationComments || []).filter((comment) => comment.type === 'review').length;
      const signCount = accessEvents.filter((event) => event.eventType === 'sign').length;
      const latestActivity = [...accessEvents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      return {
        id: item.id,
        shareUrl: item.shareUrl,
        templateName: item.templateName,
        referenceNumber: item.referenceNumber,
        generatedAt: item.generatedAt,
        openCount: item.openCount || 0,
        downloadCount: item.downloadCount || 0,
        editCount: item.editCount || 0,
        commentCount,
        reviewCount,
        signCount,
        uniqueDevices: Array.from(new Set(accessEvents.map((event) => event.deviceLabel).filter(Boolean) as string[])).slice(0, 6),
        latestActivityAt: latestActivity?.createdAt,
        latestActivityLabel: latestActivity?.deviceLabel,
        pendingFeedbackCount: (item.collaborationComments || []).filter((comment) => !comment.replyMessage).length,
        signedLocationLabel: item.recipientSignedLocationLabel,
        signedLatitude: item.recipientSignedLatitude,
        signedLongitude: item.recipientSignedLongitude,
        signedAccuracyMeters: item.recipientSignedAccuracyMeters,
        recipientSignedAt: item.recipientSignedAt,
        recipientSignedIp: item.recipientSignedIp,
        recipientSignerName: item.recipientSignerName,
      };
    })
    .slice(0, 20);

  const signatureLocationDistribution = Object.entries(
    history.reduce<Record<string, { count: number; documentIds: string[] }>>((acc, item) => {
      if (!item.recipientSignedAt) {
        return acc;
      }

      const bucket = buildLocationBucket(item.recipientSignedLocationLabel, item.recipientSignedLatitude, item.recipientSignedLongitude);
      const current = acc[bucket] || { count: 0, documentIds: [] };
      current.count += 1;
      current.documentIds.push(item.id);
      acc[bucket] = current;
      return acc;
    }, {})
  )
    .map(([locationLabel, value]) => ({
      locationLabel,
      count: value.count,
      documentIds: value.documentIds,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    totalDocuments: history.length,
    documentsThisWeek: history.filter((item) => new Date(item.generatedAt) >= weekAgo).length,
    emailsSent: history.filter((item) => item.emailStatus === 'sent').length,
    templatesUsed: new Set(history.map((item) => item.templateId)).size,
    topTemplates,
    recentActivity: [...history]
      .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
      .slice(0, 8),
    recentFeedback,
    documentSummary,
    signatureLocationDistribution,
  };
}
