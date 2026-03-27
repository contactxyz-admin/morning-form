'use client';

import { useMemo, useState } from 'react';
import type { AssessmentQuestion, AssessmentResponses } from '@/types';

const STORAGE_KEY = 'mf_assessment';

export function getStoredAssessmentResponses(): AssessmentResponses {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AssessmentResponses) : {};
  } catch {
    return {};
  }
}

export function useAssessment(questions: AssessmentQuestion[]) {
  const [responses, setResponses] = useState<AssessmentResponses>(getStoredAssessmentResponses);
  const [currentIndex, setCurrentIndex] = useState(0);

  const question = questions[currentIndex];

  const progress = useMemo(() => {
    if (!questions.length) return 0;
    return (currentIndex + 1) / questions.length;
  }, [currentIndex, questions.length]);

  const saveResponses = (next: AssessmentResponses) => {
    setResponses(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  };

  const updateResponse = (questionId: string, value: string | string[] | number) => {
    saveResponses({ ...responses, [questionId]: value });
  };

  const canContinue = useMemo(() => {
    if (!question) return false;
    if (!question.required) return true;
    const value = responses[question.id];
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== '';
  }, [question, responses]);

  return {
    currentIndex,
    setCurrentIndex,
    question,
    responses,
    progress,
    saveResponses,
    updateResponse,
    canContinue,
  };
}
