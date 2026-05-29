'use client';

import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { parseChatAnswer, type ChatAnswerBlock, type ChatAnswerCheckItem } from '@/lib/chat/answer-format';

interface Props {
  content: string;
}

export function AnswerRenderer({ content }: Props) {
  const blocks = parseChatAnswer(content);
  if (blocks.length === 0) {
    return <span className="text-text-tertiary">...</span>;
  }
  return (
    <div className="space-y-4 break-words">
      {blocks.map((block, index) => (
        <AnswerBlockView key={index} block={block} />
      ))}
    </div>
  );
}

function AnswerBlockView({ block }: { block: ChatAnswerBlock }): ReactElement {
  switch (block.kind) {
    case 'paragraph':
      return <p>{block.text}</p>;
    case 'heading':
      return (
        <p className="pt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
          {block.text}
        </p>
      );
    case 'bulletList':
      return (
        <ul className="space-y-2 pl-4 list-disc marker:text-text-tertiary/60">
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol className="space-y-2 pl-5 list-decimal marker:font-mono marker:text-[11px] marker:text-text-tertiary">
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      );
    case 'checkList':
      return (
        <ul className="space-y-2">
          {block.items.map((item, index) => (
            <CheckRow key={`${item.label}-${index}`} item={item} />
          ))}
        </ul>
      );
    default:
      return assertNever(block);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled answer block: ${JSON.stringify(value)}`);
}

function CheckRow({ item }: { item: ChatAnswerCheckItem }) {
  return (
    <li className="grid grid-cols-[10px_minmax(0,1fr)] gap-3">
      <span
        aria-hidden
        className={cn(
          'mt-[0.55em] h-2 w-2 rounded-full',
          item.tone === 'missing' && 'bg-border-strong',
          item.tone === 'found' && 'bg-positive',
          item.tone === 'caution' && 'bg-caution',
          item.tone === 'neutral' && 'bg-text-tertiary',
        )}
      />
      <span className="min-w-0">
        <span className="font-medium text-text-primary">{item.label}</span>
        <span className="text-text-tertiary"> - {item.detail}</span>
      </span>
    </li>
  );
}
