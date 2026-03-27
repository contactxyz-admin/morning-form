import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function getGreeting(name?: string): string {
  const tod = getTimeOfDay();
  const greeting = tod === 'morning' ? 'Good morning' :
                   tod === 'afternoon' ? 'Good afternoon' :
                   tod === 'evening' ? 'Good evening' : 'Good evening';
  return name ? `${greeting}, ${name}.` : `${greeting}.`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')}${ampm}`;
}

export function getDateKey(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}
