'use client';

import { Loader2 } from 'lucide-react';

interface LoadingProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Loading({ text = 'Loading...', size = 'md' }: LoadingProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-primary`} />
      <p className="text-muted-foreground">{text}</p>
    </div>
  );
} 