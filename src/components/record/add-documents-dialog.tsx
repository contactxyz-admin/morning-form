'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { cn } from '@/lib/utils';

/**
 * Post-intake add-documents affordance. Opens a drop zone, uploads each
 * PDF sequentially through the existing /api/intake/documents pipeline
 * (same auth, dedup, extraction, topic-promotion), and calls onCompleted
 * when anything lands so the parent record view can refetch.
 *
 * Why a dialog and not a navigation: the intake tabs (upload/history/
 * essentials) are the first-run surface. A user coming back to add one
 * more lab PDF shouldn't have to pick a category — the server already
 * auto-categorises via biomarker extraction. This dialog is strictly the
 * re-entry point.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

type FileStatus = 'pending' | 'uploading' | 'success' | 'deduped' | 'error';

interface FileState {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  status: FileStatus;
  kind?: string;
  detail?: string;
}

const AUTO_CLOSE_DWELL_MS = 900;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileId(file: File): string {
  return `${file.name}-${file.lastModified}-${file.size}`;
}

export function AddDocumentsDialog({ open, onClose, onCompleted }: Props) {
  const [files, setFiles] = useState<FileState[]>([]);
  const [rejectedNote, setRejectedNote] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isUploading = files.some(
    (f) => f.status === 'pending' || f.status === 'uploading',
  );
  const hasAnyTerminal = files.some(
    (f) => f.status === 'success' || f.status === 'deduped' || f.status === 'error',
  );
  const allDone = files.length > 0 && !isUploading;
  const allSucceeded =
    allDone && files.every((f) => f.status === 'success' || f.status === 'deduped');
  const anyAdded = files.some(
    (f) => f.status === 'success' || f.status === 'deduped',
  );

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setRejectedNote(null);
      setDragOver(false);
    }
  }, [open]);

  const requestClose = useCallback(() => {
    if (isUploading) return;
    if (anyAdded) onCompleted();
    onClose();
  }, [isUploading, anyAdded, onCompleted, onClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, requestClose]);

  useEffect(() => {
    if (!allSucceeded) return;
    const t = window.setTimeout(() => {
      onCompleted();
      onClose();
    }, AUTO_CLOSE_DWELL_MS);
    return () => window.clearTimeout(t);
  }, [allSucceeded, onCompleted, onClose]);

  const runUpload = useCallback(async (target: FileState) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === target.id ? { ...f, status: 'uploading' } : f)),
    );
    const fd = new FormData();
    fd.append('file', target.file);
    try {
      const res = await fetch('/api/intake/documents', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        let kind: string | undefined;
        let detail: string | undefined;
        try {
          const body = await res.json();
          kind = body?.kind;
          detail = body?.detail ?? body?.error;
        } catch {
          /* no JSON body */
        }
        setFiles((prev) =>
          prev.map((f) =>
            f.id === target.id
              ? {
                  ...f,
                  status: 'error',
                  kind,
                  detail: detail ?? `HTTP ${res.status}`,
                }
              : f,
          ),
        );
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { deduped?: boolean };
      setFiles((prev) =>
        prev.map((f) =>
          f.id === target.id
            ? { ...f, status: body.deduped ? 'deduped' : 'success' }
            : f,
        ),
      );
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === target.id
            ? {
                ...f,
                status: 'error',
                detail: err instanceof Error ? err.message : 'network error',
              }
            : f,
        ),
      );
    }
  }, []);

  const handleFiles = useCallback(
    async (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const incoming = Array.from(list);
      const pdfs = incoming.filter((f) => f.type === 'application/pdf');
      const rejected = incoming.length - pdfs.length;
      setRejectedNote(
        rejected > 0
          ? `${rejected} file${rejected === 1 ? '' : 's'} skipped — PDF only for now.`
          : null,
      );
      if (pdfs.length === 0) return;

      setFiles((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        const fresh: FileState[] = pdfs
          .filter((file) => !existingIds.has(fileId(file)))
          .map((file) => ({
            id: fileId(file),
            file,
            name: file.name,
            sizeBytes: file.size,
            status: 'pending',
          }));
        return [...prev, ...fresh];
      });

      // Sequential uploads. Re-read state via closure-safe lookup so queueing
      // while another batch is still processing stays ordered.
      for (const file of pdfs) {
        const id = fileId(file);
        await runUpload({
          id,
          file,
          name: file.name,
          sizeBytes: file.size,
          status: 'pending',
        });
      }
    },
    [runUpload],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="add-docs-backdrop"
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={requestClose}
        >
          <motion.div
            key="add-docs-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Add documents to your record"
            className="absolute left-1/2 top-1/2 w-[min(520px,94vw)] -translate-x-1/2 -translate-y-1/2"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Card variant="paper" className="py-6">
              <SectionLabel>Add to record</SectionLabel>
              <h2 className="mt-3 font-display font-light text-heading text-text-primary -tracking-[0.02em]">
                Add more documents
              </h2>
              <p className="mt-2 text-caption text-text-tertiary leading-relaxed">
                Drop a lab PDF, GP letter, or hospital report. We extract the
                health-relevant facts and place them on your graph.
              </p>

              <div className="mt-5">
                <Card inset className="overflow-hidden">
                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      handleFiles(e.dataTransfer.files);
                    }}
                    className={cn(
                      'group/drop block px-6 py-10 text-center cursor-pointer transition-colors duration-450 ease-spring',
                      dragOver ? 'bg-accent-light/80' : 'hover:bg-surface',
                    )}
                  >
                    <input
                      ref={inputRef}
                      type="file"
                      multiple
                      accept="application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        handleFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <div
                      aria-hidden
                      className={cn(
                        'relative mx-auto w-12 h-12 rounded-full border border-border-strong flex items-center justify-center mb-4',
                        'transition-all duration-450 ease-spring',
                        'group-hover/drop:border-text-primary group-hover/drop:scale-[1.04]',
                        dragOver && 'border-accent scale-[1.06]',
                      )}
                    >
                      <svg
                        width="16"
                        height="20"
                        viewBox="0 0 18 22"
                        fill="none"
                        className={cn(
                          'transition-transform duration-450 ease-spring',
                          'group-hover/drop:-translate-y-0.5',
                          dragOver && '-translate-y-1',
                        )}
                      >
                        <path
                          d="M9 1V17M9 1L3 7M9 1L15 7M1 21H17"
                          stroke="currentColor"
                          strokeWidth="1.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={cn(
                            'transition-colors duration-250',
                            dragOver ? 'text-accent' : 'text-text-secondary',
                          )}
                        />
                      </svg>
                    </div>
                    <p className="font-display-ui text-subheading text-text-primary mb-1 -tracking-[0.01em]">
                      {dragOver ? 'Release to upload' : 'Drag PDFs here, or tap to choose'}
                    </p>
                    <p className="text-caption text-text-tertiary">
                      We start extracting immediately.
                    </p>
                  </label>
                </Card>
              </div>

              {rejectedNote && (
                <p className="mt-3 text-caption text-caution">{rejectedNote}</p>
              )}

              {files.length > 0 && (
                <ul className="mt-5 -mx-1">
                  {files.map((f, i) => (
                    <li
                      key={f.id}
                      className={cn(
                        'flex items-start justify-between gap-3 px-1 py-2.5',
                        i > 0 && 'border-t border-border',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-body text-text-primary truncate -tracking-[0.005em]">
                          {f.name}
                        </p>
                        <p className="mt-0.5 text-caption text-text-tertiary font-mono">
                          {formatBytes(f.sizeBytes)}
                        </p>
                        {f.status === 'error' && (f.kind || f.detail) && (
                          <p className="mt-1 text-caption text-alert whitespace-pre-line">
                            {f.kind ? `${f.kind}: ` : ''}
                            {f.detail ?? 'Upload failed'}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          'shrink-0 text-caption font-mono uppercase tracking-wider',
                          f.status === 'pending' && 'text-text-tertiary',
                          f.status === 'uploading' && 'text-accent animate-pulse-subtle',
                          f.status === 'success' && 'text-positive',
                          f.status === 'deduped' && 'text-text-secondary',
                          f.status === 'error' && 'text-alert',
                        )}
                      >
                        {f.status === 'pending' && 'Queued'}
                        {f.status === 'uploading' && 'Uploading…'}
                        {f.status === 'success' && 'Added'}
                        {f.status === 'deduped' && 'Already in record'}
                        {f.status === 'error' && 'Failed'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 flex items-center justify-end gap-2">
                {isUploading ? (
                  <span className="text-caption text-text-tertiary">
                    Hold on — extraction runs on each file.
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant={hasAnyTerminal ? 'secondary' : 'ghost'}
                    onClick={requestClose}
                  >
                    {hasAnyTerminal ? 'Done' : 'Close'}
                  </Button>
                )}
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
