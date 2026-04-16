'use client';

import { useCallback, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useIntakeStore } from '@/lib/intake/store';

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
    <div className="space-y-4">
      <Card>
        <h2 className="text-heading font-semibold mb-1">Upload your records</h2>
        <p className="text-body text-text-secondary mb-4">
          Lab results, GP exports, hospital letters, anything in PDF or image form. We extract the
          health-relevant facts and link them back to the source.
        </p>

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
          className={`block border-2 border-dashed rounded-card p-8 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-accent bg-accent-light' : 'border-border hover:border-border-hover'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <p className="text-body text-text-primary font-medium mb-1">
            Drag files here, or tap to choose
          </p>
          <p className="text-caption text-text-tertiary">PDF or image files</p>
        </label>
      </Card>

      {documents.length > 0 && (
        <Card>
          <h3 className="text-label uppercase tracking-widest text-text-tertiary mb-3">
            Staged ({documents.length})
          </h3>
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body text-text-primary truncate">{doc.name}</p>
                  <p className="text-caption text-text-tertiary">{formatBytes(doc.sizeBytes)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDocument(doc.id)}
                  aria-label={`Remove ${doc.name}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
