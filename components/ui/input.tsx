import type { InputHTMLAttributes, LabelHTMLAttributes } from 'react';
import { cn } from './cn';

export const inputClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-card px-2.5 text-sm placeholder:text-muted-foreground/70 focus-visible:border-ring disabled:opacity-50 aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[13px] font-medium text-muted-foreground', className)} {...props} />;
}
