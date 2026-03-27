'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { guideResponses } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'guide';
  content: string;
}

const suggestions = [
  'Why this protocol?',
  'Can I adjust timing?',
  'What should I expect?',
];

export default function GuidePage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = (text: string) => {
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const key = Object.keys(guideResponses).find(k => text.toLowerCase().includes(k));
    const response = key ? guideResponses[key] : guideResponses['default'];

    setTimeout(() => {
      setIsTyping(false);
      const guideMsg: Message = { id: (Date.now() + 1).toString(), role: 'guide', content: response };
      setMessages(prev => [...prev, guideMsg]);
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) sendMessage(input.trim());
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4 border-b border-border">
        <button onClick={() => router.back()} className="text-text-tertiary hover:text-text-primary">
          <Icon name="back" size="md" />
        </button>
        <h1 className="text-body font-medium text-text-primary">Guide</h1>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-4 no-scrollbar">
        {/* Intro */}
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card variant="default" className="max-w-[85%]">
              <p className="text-body text-text-secondary leading-relaxed">
                I&apos;m your protocol guide. I can explain recommendations, answer questions, and help adjust your protocol.
              </p>
            </Card>

            <div className="mt-4 space-y-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="block w-full text-left px-4 py-3 rounded-card border border-border bg-surface text-caption text-text-primary hover:border-border-hover transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-card p-4 text-body leading-relaxed',
                msg.role === 'user'
                  ? 'bg-accent text-white'
                  : 'bg-surface border border-border text-text-secondary'
              )}
            >
              {msg.content.split('\n').map((line, i) => (
                <p key={i} className={i > 0 ? 'mt-2' : ''}>{line}</p>
              ))}
            </div>
          </motion.div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-surface border border-border rounded-card px-4 py-3 flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-5 pb-6 pt-3 border-t border-border bg-bg">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 h-11 px-4 rounded-card border border-border bg-surface text-body text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="w-11 h-11 rounded-card bg-accent text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            <Icon name="send" size="sm" />
          </button>
        </div>
      </form>
    </div>
  );
}
