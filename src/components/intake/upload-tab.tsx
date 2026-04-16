'use client';

import { useCallback, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { useIntakeStore } from '@/lib/intake/store';
import { cn } from '@/lib/utils';

const ACCEPT = 'application/pdf,image/*,.pdf';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadTab() {
  const documents = useIntakeStore((s) => s.documents);
  const addDocuments = useIntakeStore((s) => s.addDocuments);
  const removeDocument = useIntakeStore((s) => s.removeDocument);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      addDocuments(Array.from(files));
    },
    [addDocuments],
  );

  return (
    <div className="space-y-6 stagger">
      <header>
        <div className="flex items-baseline gap-2.5 mb-4">
          <span className="font-mono text-label uppercase text-text-tertiary">01</span>
          <span className="text-label uppercase text-text-tertiary">Documents</span>
        </div>
        <h2 className="font-display text-display-sm sm:text-display font-light text-text-primary mb-4 -tracking-[0.035em]">
          Upload your records.
        </h2>
        <p className="text-body-lg text-text-secondary max-w-lg">
          Lab results, GP exports, hospital letters — anything in PDF or image form. We extract the
          health-relevant facts and link them back to source.
        </p>
      </header>

      <Card variant="paper" inset className="overflow-hidden">
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
            'group/drop block px-8 py-16 text-center cursor-pointer transition-colors duration-450 ease-spring',
            dragOver ? 'bg-accent-light/80' : 'hover:bg-surface',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div
            aria-hidden
            className={cn(
              'relative mx-auto w-14 h-14 rounded-full border border-border-strong flex items-center justify-center mb-6',
              'transition-all duration-450 ease-spring',
              'group-hover/drop:border-text-primary group-hover/drop:scale-[1.04]',
              dragOver && 'border-accent scale-[1.06]',
            )}
          >
            <svg
              width="18"
              height="22"
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
          <p className="font-display-ui text-subheading text-text-primary mb-1.5 -tracking-[0.01em]">
            {dragOver ? 'Release to stage' : 'Drag files here, or tap to choose'}
          </p>
          <p className="text-caption text-text-tertiary">
            PDF or image files · multiple at once
          </p>
        </label>
      </Card>

      {documents.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-label uppercase text-text-tertiary">
              Staged · {documents.length}
            </h3>
            <span className="text-caption text-text-tertiary">
              Will upload on finish
            </span>
          </div>
          <ul className="-mx-1">
            {documents.map((doc, i) => (
              <li
                key={doc.id}
                className={cn(
                  'group flex items-center justify-between gap-4 px-1 py-3.5',
                  i > 0 && 'border-t border-border',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body text-text-primary truncate -tracking-[0.005em]">
                    {doc.name}
                  </p>
                  <p className="text-caption text-text-tertiary mt-0.5 font-mono">
                    {formatBytes(doc.sizeBytes)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeDocument(doc.id)}
                  aria-label={`Remove ${doc.name}`}
                  className={cn(
                    'text-caption text-text-tertiary hover:text-alert',
                    'transition-all duration-250 px-2 py-1 -mr-2',
                    'opacity-0 group-hover:opacity-100 focus:opacity-100',
                  )}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
