import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from 'react';

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function Panel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-800/80 bg-slate-950/70 shadow-[0_18px_60px_rgba(2,6,23,0.28)] backdrop-blur-xl',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  className,
  variant = 'secondary',
  children,
  ...props
}: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'border-cyan-400/30 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25 hover:border-cyan-300/50',
    secondary: 'border-slate-700 bg-slate-900/80 text-slate-200 hover:border-slate-500 hover:bg-slate-800',
    ghost: 'border-transparent bg-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/70',
    danger: 'border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15 hover:border-red-400/40',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium outline-none transition-all disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-600',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full resize-none rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}

export function Badge({ className, tone = 'neutral', children, ...props }: BadgeProps) {
  const tones = {
    neutral: 'border-slate-700 bg-slate-800/70 text-slate-300',
    success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    warning: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
    danger: 'border-red-400/20 bg-red-400/10 text-red-300',
    accent: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

interface SectionTitleProps {
  title: string;
  eyebrow?: string;
  aside?: ReactNode;
}

export function SectionTitle({ title, eyebrow, aside }: SectionTitleProps) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>}
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      </div>
      {aside}
    </div>
  );
}
