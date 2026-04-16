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
    <div className="space-y-5 stagger">
      <header>
        <p className="text-label uppercase text-text-tertiary mb-3">01 — Documents</p>
        <h2 className="font-display text-display-sm sm:text-display font-light text-text-primary mb-3 -tracking-[0.035em]">
          Upload your records.
        </h2>
        <p className="text-body-lg text-text-secondary max-w-lg">
          Lab results, GP exports, hospital letters — anything in PDF or image form. We extract the
          health-relevant facts and link them back to source.
        </p>
      </header>

      <Card variant="paper" className="p-0 overflow-hidden">
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
            'block px-8 py-14 text-center cursor-pointer transition-all duration-450 ease-spring',
            dragOver
              ? 'bg-accent-light/60'
              : 'hover:bg-surface',
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
          <div className="mx-auto w-12 h-12 rounded-full border border-border-strong flex items-center justify-center mb-5 transition-transform duration-450 ease-spring group-hover:scale-105">
            <span aria-hidden className="text-text-secondary text-xl leading-none">↑</span>
          </div>
          <p className="font-display text-subheading text-text-primary mb-1.5 -tracking-[0.01em]">
            Drag files here, or tap to choose
          </p>
          <p className="text-caption text-text-tertiary">PDF or image files</p>
        </label>
      </Card>

      {documents.length > 0 && (
        <Card>
          <h3 className="text-label uppercase text-text-tertiary mb-4">
            Staged · {documents.length}
          </h3>
          <ul className="space-y-px -mx-1">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="group flex items-center justify-between gap-4 px-1 py-3 border-b border-border last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body text-text-primary truncate -tracking-[0.005em]">
                    {doc.name}
                  </p>
                  <p className="text-caption text-text-tertiary mt-0.5">
                    {formatBytes(doc.sizeBytes)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeDocument(doc.id)}
                  aria-label={`Remove ${doc.name}`}
                  className="text-caption text-text-tertiary hover:text-alert transition-colors duration-250 px-2 py-1 -mr-2 opacity-0 group-hover:opacity-100 focus:opacity-100"
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

