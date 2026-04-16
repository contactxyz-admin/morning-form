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
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const key = Object.keys(guideResponses).find((k) => text.toLowerCase().includes(k));
    const response = key ? guideResponses[key] : guideResponses['default'];

    setTimeout(() => {
      setIsTyping(false);
      const guideMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'guide',
        content: response,
      };
      setMessages((prev) => [...prev, guideMsg]);
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) sendMessage(input.trim());
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-4 border-b border-border">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
        >
          <Icon name="back" size="md" />
        </button>
        <span aria-hidden className="block w-4 h-px bg-text-primary/60" />
        <span className="text-label uppercase text-text-tertiary">Guide</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-8 space-y-4 no-scrollbar">
        {/* Intro */}
        {messages.length === 0 && (
          <div className="rise max-w-[90%]">
            <h2 className="font-display font-light text-display-sm sm:text-display text-text-primary mb-5 -tracking-[0.035em]">
              Ask me <span className="italic text-accent">anything</span>.
            </h2>
            <p className="text-body text-text-secondary leading-relaxed mb-8 max-w-md">
              I&rsquo;m your protocol guide. I can explain recommendations, answer questions, and
              help adjust your protocol.
            </p>

            <div className="space-y-2 stagger">
              <p className="font-mono text-label uppercase text-text-tertiary mb-2">Try asking</p>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="block w-full text-left px-4 py-3 rounded-card-sm border border-border bg-surface text-caption text-text-primary hover:border-border-strong hover:bg-surface-warm transition-[background-color,border-color] duration-450 ease-spring"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-card p-4 text-body leading-relaxed',
                msg.role === 'user'
                  ? 'bg-accent text-[#FFFFFF]'
                  : 'bg-surface border border-border text-text-secondary',
              )}
            >
              {msg.content.split('\n').map((line, i) => (
                <p key={i} className={i > 0 ? 'mt-2' : ''}>
                  {line}
                </p>
              ))}
            </div>
          </motion.div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-surface border border-border rounded-card px-4 py-3 flex gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-5 pb-6 pt-3 border-t border-border bg-bg/85 backdrop-blur-xl">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            className="flex-1 h-11 px-4 rounded-input border border-border bg-surface text-body text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-primary focus:shadow-ring-accent transition-[border-color,box-shadow] duration-300 ease-spring"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send"
            className="w-11 h-11 rounded-input bg-button text-[#FFFFFF] flex items-center justify-center disabled:bg-surface-warm disabled:text-text-tertiary disabled:border disabled:border-border-strong hover:bg-button-hover transition-[background-color,transform] duration-300 ease-spring active:scale-[0.97]"
          >
            <Icon name="send" size="sm" />
          </button>
        </div>
      </form>
    </div>
  );
}
