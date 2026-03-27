'use client';

import { cn } from '@/lib/utils';

interface SliderProps {
  labels?: [string, string];
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

function Slider({ labels, min = 1, max = 5, step = 1, value, onChange, className }: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn('w-full', className)}>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-runnable-track]:rounded-full
            [&::-webkit-slider-runnable-track]:h-1.5
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-accent
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-white
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:-mt-[7px]
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:duration-150
            [&::-webkit-slider-thumb]:active:scale-110"
          style={{
            background: `linear-gradient(to right, #1A3A3A ${percentage}%, #E5E5E3 ${percentage}%)`,
          }}
        />
      </div>
      {labels && (
        <div className="flex justify-between mt-3">
          <span className="text-caption text-text-tertiary">{labels[0]}</span>
          <span className="text-caption text-text-tertiary">{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

export { Slider, type SliderProps };
