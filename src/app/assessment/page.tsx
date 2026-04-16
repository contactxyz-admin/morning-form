'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { assessmentQuestions, questionGroups } from '@/lib/assessment-questions';
import { Button } from '@/components/ui/button';
import { SelectCard } from '@/components/ui/select-card';
import { Chip } from '@/components/ui/chip';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SectionLabel } from '@/components/ui/section-label';
import { Icon } from '@/components/ui/icon';
import type { AssessmentResponses } from '@/types';

export default function AssessmentPage() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<AssessmentResponses>({});
  const [showGroupIntro, setShowGroupIntro] = useState(true);
  const [lastGroup, setLastGroup] = useState('');

  const question = assessmentQuestions[currentIndex];
  const progress = (currentIndex + 1) / assessmentQuestions.length;

  // Check if we're entering a new group
  useEffect(() => {
    if (question && question.group !== lastGroup) {
      const groupInfo = questionGroups.find(g => g.id === question.group);
      if (groupInfo && groupInfo.description) {
        setShowGroupIntro(true);
        const timer = setTimeout(() => setShowGroupIntro(false), 2000);
        return () => clearTimeout(timer);
      } else {
        setShowGroupIntro(false);
      }
    } else {
      setShowGroupIntro(false);
    }
  }, [currentIndex, question, lastGroup]);

  const canContinue = useCallback(() => {
    if (!question) return false;
    if (!question.required) return true;
    const val = responses[question.id];
    if (val === undefined || val === null) return false;
    if (typeof val === 'string' && val === '') return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  }, [question, responses]);

  const handleNext = () => {
    setLastGroup(question.group);
    if (currentIndex < assessmentQuestions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Save to localStorage and navigate
      localStorage.setItem('mf_assessment', JSON.stringify(responses));
      router.push('/processing');
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setLastGroup(assessmentQuestions[currentIndex - 1].group);
      setCurrentIndex(currentIndex - 1);
    }
  };

  const setResponse = (value: string | string[] | number) => {
    setResponses(prev => ({ ...prev, [question.id]: value }));
  };

  const toggleMultiSelect = (value: string) => {
    const current = (responses[question.id] as string[]) || [];
    if (current.includes(value)) {
      setResponse(current.filter(v => v !== value));
    } else {
      setResponse([...current, value]);
    }
  };

  if (!question) return null;

  return (
    <div className="min-h-screen bg-bg">
      <ProgressBar progress={progress} />

      {/* Back button + step counter */}
      <div className="px-5 sm:px-8 pt-8 flex items-center justify-between">
        {currentIndex > 0 ? (
          <button
            onClick={handleBack}
            className="text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
          >
            <Icon name="back" size="md" />
          </button>
        ) : (
          <span className="text-label uppercase text-text-tertiary">Assessment</span>
        )}
        <span className="font-mono text-caption text-text-tertiary">
          {String(currentIndex + 1).padStart(2, '0')} / {String(assessmentQuestions.length).padStart(2, '0')}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {showGroupIntro ? (
          <motion.div
            key={`group-${question.group}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
            className="flex flex-col items-center justify-center min-h-[60vh] px-6 sm:px-8 text-center"
          >
            <SectionLabel>{question.groupLabel}</SectionLabel>
            <p className="mt-5 font-display font-light text-display-sm text-text-primary -tracking-[0.03em] leading-[1.15] max-w-xl">
              {questionGroups.find(g => g.id === question.group)?.description}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={question.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            className="px-5 sm:px-8 pt-10 pb-32 max-w-xl mx-auto"
          >
            {/* Question */}
            <p className="text-label uppercase text-text-tertiary mb-3">{question.groupLabel}</p>
            <h2 className="font-display font-light text-display-sm sm:text-[2.25rem] text-text-primary mb-10 -tracking-[0.03em] leading-[1.15]">
              {question.question}
            </h2>

            {/* Card Select */}
            {question.type === 'card-select' && question.options && (
              <div className="space-y-3">
                {question.options.map((opt) => (
                  <SelectCard
                    key={opt.value}
                    selected={responses[question.id] === opt.value}
                    onClick={() => setResponse(opt.value)}
                  >
                    {opt.label}
                  </SelectCard>
                ))}
              </div>
            )}

            {/* Multi Select */}
            {question.type === 'multi-select' && question.options && (
              <div className="flex flex-wrap gap-2.5">
                {question.options.map((opt) => (
                  <Chip
                    key={opt.value}
                    selected={((responses[question.id] as string[]) || []).includes(opt.value)}
                    onClick={() => toggleMultiSelect(opt.value)}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            )}

            {/* Slider */}
            {question.type === 'slider' && (
              <div className="pt-8 pb-4">
                <Slider
                  labels={question.sliderLabels}
                  min={question.sliderMin || 1}
                  max={question.sliderMax || 5}
                  value={(responses[question.id] as number) || 3}
                  onChange={(v) => setResponse(v)}
                />
              </div>
            )}

            {/* Time Picker */}
            {question.type === 'time-picker' && (
              <div className="pt-4">
                <input
                  type="time"
                  value={(responses[question.id] as string) || ''}
                  onChange={(e) => setResponse(e.target.value)}
                  className="w-full h-14 px-4 rounded-input border border-border bg-surface font-display text-heading text-text-primary text-center tracking-[-0.02em] focus:outline-none focus:border-text-primary focus:shadow-ring-accent transition-[border-color,box-shadow] duration-300 ease-spring"
                />
              </div>
            )}

            {/* Free Text */}
            {question.type === 'free-text' && (
              <div className="pt-2">
                <Input
                  placeholder={question.placeholder}
                  value={(responses[question.id] as string) || ''}
                  onChange={(e) => setResponse(e.target.value)}
                />
                {!question.required && (
                  <p className="mt-3 text-caption text-text-tertiary">
                    This is optional. You can skip if you prefer.
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Continue button */}
      {!showGroupIntro && (
        <div className="fixed bottom-0 left-0 right-0 px-5 sm:px-8 pb-6 pt-12 bg-gradient-to-t from-bg via-bg/95 to-transparent">
          <div className="max-w-xl mx-auto">
            <Button
              fullWidth
              size="lg"
              onClick={handleNext}
              disabled={question.required && !canContinue()}
            >
              {currentIndex === assessmentQuestions.length - 1 ? 'Complete assessment →' : 'Continue →'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
