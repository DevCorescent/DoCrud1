'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { DocumentTemplate } from '@/types/document';
import TemplateStudioStudio from '@/components/TemplateStudioStudio';

export default function TemplateStudioDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onCreated?: (template: DocumentTemplate) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-none overflow-hidden rounded-[1.25rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(255,255,255,0.84)),radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_38%)] p-0 shadow-[0_36px_120px_rgba(15,23,42,0.18)] backdrop-blur-2xl sm:rounded-[1.9rem]">
        <TemplateStudioStudio onClose={() => onOpenChange(false)} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}
