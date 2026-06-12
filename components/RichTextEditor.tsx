'use client';

import { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeightClassName?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeightClassName = 'min-h-[160px]',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const runCommand = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command);
    onChange(editorRef.current?.innerHTML || '');
  };

  return (
    <div className={cn('rounded-2xl border border-input bg-background', className)}>
      <div className="flex flex-wrap gap-2 border-b border-input px-3 py-2">
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand('bold')}><Bold className="h-4 w-4" /></Button>
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand('italic')}><Italic className="h-4 w-4" /></Button>
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand('underline')}><Underline className="h-4 w-4" /></Button>
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand('insertUnorderedList')}><List className="h-4 w-4" /></Button>
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand('insertOrderedList')}><ListOrdered className="h-4 w-4" /></Button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || 'Start typing...'}
        className={cn(
          'rich-editor px-4 py-3 text-sm focus:outline-none',
          minHeightClassName,
        )}
        onInput={(event) => onChange((event.currentTarget as HTMLDivElement).innerHTML)}
      />
    </div>
  );
}
