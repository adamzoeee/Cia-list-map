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

/* ---- Panel — neumorphic raised card ---- */
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

/* ---- Button — 4 neumorphic variants ---- */
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
      'neu-btn-accent text-cyan-100',
    secondary:
      'neu-btn text-slate-200',
    ghost:
      'bg-transparent border-transparent text-slate-400 ' +
      'hover:text-slate-100 hover:bg-white/4',
    danger:
      'neu-btn text-red-300 !border-red-500/15 ' +
      'hover:!shadow-[7px_7px_16px_rgba(0,0,0,0.5),-4px_-4px_10px_rgba(239,68,68,0.06)]',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium outline-none ' +
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:!border-white/3',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---- TextInput — neumorphic inset ---- */
export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'neu-inset w-full rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 ' +
        'outline-none transition-all focus:border-cyan-400/20 focus:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.45),inset_-2px_-2px_5px_rgba(255,255,255,0.02),0_0_0_2px_rgba(34,211,238,0.08)] ' +
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/* ---- TextArea — neumorphic inset ---- */
export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'neu-inset w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 ' +
        'outline-none transition-all focus:border-cyan-400/20 focus:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.45),inset_-2px_-2px_5px_rgba(255,255,255,0.02),0_0_0_2px_rgba(34,211,238,0.08)] ' +
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/* ---- Badge — soft neumorphic pill ---- */
interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}

export function Badge({ className, tone = 'neutral', children, ...props }: BadgeProps) {
  const tones = {
    neutral:
      'border-white/8 bg-white/4 text-slate-300',
    success:
      'border-emerald-400/15 bg-emerald-400/8 text-emerald-300',
    warning:
      'border-amber-400/15 bg-amber-400/8 text-amber-300',
    danger:
      'border-red-400/15 bg-red-400/8 text-red-300',
    accent:
      'border-cyan-400/15 bg-cyan-400/8 text-cyan-300',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ' +
        'shadow-[2px_2px_4px_rgba(0,0,0,0.25),-1px_-1px_2px_rgba(255,255,255,0.015)]',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/* ---- SectionTitle — no structural change, just color tweaks ---- */
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
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      </div>
      {aside}
    </div>
  );
}
