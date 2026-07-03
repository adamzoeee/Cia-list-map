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

/* ── Neumorphic raised panel ── */
export function Panel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('neu-raised rounded-2xl', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/* ── Neumorphic inset panel (for chart areas, wells) ── */
export function InsetPanel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('neu-inset rounded-2xl', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/* ── Button variants ── */
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
    primary:
      'text-cyan-300 font-semibold',
    secondary:
      'text-slate-300',
    ghost:
      'text-slate-500 hover:text-slate-200',
    danger:
      'text-rose-400 font-semibold',
  };

  return (
    <button
      className={cn(
        'neu-raised inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium outline-none transition-all',
        'active:neu-pressed',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:shadow-[6px_6px_14px_#15171c,-6px_-6px_14px_#272b33]',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ── Text input with inset style ── */
export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'neu-inset w-full rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-all',
        'focus:shadow-[inset_4px_4px_10px_#15171c,inset_-4px_-4px_10px_#272b33]',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    />
  );
}

/* ── Textarea with inset style ── */
export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'neu-inset w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-all',
        'focus:shadow-[inset_4px_4px_10px_#15171c,inset_-4px_-4px_10px_#272b33]',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    />
  );
}

/* ── Badge ── */
interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}

export function Badge({ className, tone = 'neutral', children, ...props }: BadgeProps) {
  const tones = {
    neutral: 'text-slate-400 bg-[#2a2d33]',
    success: 'text-emerald-400 bg-emerald-400/10',
    warning: 'text-amber-400 bg-amber-400/10',
    danger: 'text-rose-400 bg-rose-400/10',
    accent: 'text-cyan-400 bg-cyan-400/10',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/* ── Section title ── */
interface SectionTitleProps {
  title: string;
  eyebrow?: string;
  aside?: ReactNode;
}

export function SectionTitle({ title, eyebrow, aside }: SectionTitleProps) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {eyebrow}
          </p>
        )}
        <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      </div>
      {aside}
    </div>
  );
}
