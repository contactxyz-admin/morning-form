'use client';

import { useCallback, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
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
        <p className="text-label uppercase text-text-tertiary mb-4 tabular-nums">01 — Documents</p>
        <h2 className="font-display text-display-sm sm:text-display font-light text-text-primary mb-4">
          Upload your records.
        </h2>
        <p className="text-body-lg text-text-secondary max-w-lg leading-relaxed">
          Lab results, GP exports, hospital letters &mdash; anything in PDF or image form. We
          extract the health-relevant facts and link them back to source.
        </p>
      </header>

      <Card variant="paper" className="p-0 overflow-hidden group/drop">
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
            'block px-8 py-16 text-center cursor-pointer transition-colors duration-450 ease-spring',
            dragOver ? 'bg-accent-light/70' : 'hover:bg-surface',
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
          <span
            className={cn(
              'mx-auto w-14 h-14 rounded-full border flex items-center justify-center mb-6',
              'transition-[transform,border-color,background-color] duration-450 ease-spring',
              dragOver
                ? 'border-accent bg-accent text-surface scale-110'
                : 'border-border-strong text-text-secondary group-hover/drop:border-text-primary group-hover/drop:text-text-primary group-hover/drop:scale-105',
            )}
          >
            <Icon name="arrow-up" size="md" />
          </span>
          <p className="font-display text-subheading text-text-primary mb-2 -tracking-[0.01em]">
            {dragOver ? 'Drop to stage' : 'Drag files here, or tap to choose'}
          </p>
          <p className="text-caption text-text-tertiary">PDF or image files</p>
        </label>
      </Card>

      {documents.length > 0 && (
        <Card>
          <h3 className="text-label uppercase text-text-tertiary mb-4 tabular-nums">
            Staged &middot; {documents.length}
          </h3>
          <ul className="space-y-px -mx-1">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="group/doc flex items-center justify-between gap-4 px-1 py-3 border-b border-border last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body text-text-primary truncate -tracking-[0.005em]">
                    {doc.name}
                  </p>
                  <p className="text-caption text-text-tertiary mt-0.5 tabular-nums">
                    {formatBytes(doc.sizeBytes)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeDocument(doc.id)}
                  aria-label={`Remove ${doc.name}`}
                  className="text-caption text-text-tertiary hover:text-alert transition-colors duration-250 px-2 py-1 -mr-2 opacity-0 group-hover/doc:opacity-100 focus:opacity-100"
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
