import type {
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';

// Shared design primitives for the ambassador dashboard. Every component below
// is the single source of truth for its pattern — the 6 dashboard files import
// from here so colours, type, spacing and buttons stay consistent.

// ── Token scales ────────────────────────────────────────────────────────────
export const FONT = {
  micro: 10,
  label: 11,
  body: 13,
  bodyLg: 15,
  stat: 28,
  statLg: 36,
} as const;

export const WEIGHT = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  heavy: 800,
} as const;

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({
  children,
  padded = true,
  style,
  className,
}: {
  children: ReactNode;
  padded?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)',
        padding: padded ? SPACE.lg : 0,
        marginBottom: SPACE.lg,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── SectionHeader ───────────────────────────────────────────────────────────
export function SectionHeader({
  title,
  icon,
  action,
  badge,
  style,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: SPACE.sm,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {icon && <span style={{ color: 'var(--text-3)', display: 'flex' }}>{icon}</span>}
        <span
          style={{
            fontSize: FONT.label,
            fontWeight: WEIGHT.bold,
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          {title}
        </span>
        {badge}
      </div>
      {action}
    </div>
  );
}

// ── Button ──────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';

const BTN_SIZE: Record<ButtonSize, CSSProperties> = {
  md: { padding: '10px 16px', minHeight: 40, fontSize: FONT.body },
  sm: { padding: '7px 12px', minHeight: 38, fontSize: FONT.micro + 1 },
};

const BTN_VARIANT: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--accent)', color: 'var(--accent-fg)', border: '1px solid transparent' },
  secondary: { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' },
  ghost: { background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)' },
};

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  disabled,
  loading,
  iconLeft,
  iconRight,
  children,
  onClick,
  type = 'button',
  title,
  style,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  disabled?: boolean;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  title?: string;
  style?: CSSProperties;
}) {
  const inactive = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={inactive}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontFamily: 'inherit',
        fontWeight: WEIGHT.bold,
        borderRadius: 'var(--radius)',
        whiteSpace: 'nowrap',
        cursor: inactive ? (loading ? 'wait' : 'not-allowed') : 'pointer',
        transition: 'filter 120ms, background 120ms',
        width: full ? '100%' : undefined,
        opacity: loading ? 0.75 : 1,
        ...BTN_SIZE[size],
        ...BTN_VARIANT[variant],
        ...(disabled && !loading
          ? { background: 'var(--surface-3)', color: 'var(--text-3)', border: '1px solid var(--border)' }
          : null),
        ...style,
      }}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────────
type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error';

const BADGE_TONE: Record<BadgeTone, CSSProperties> = {
  neutral: { background: 'var(--neutral-bg)', color: 'var(--neutral)' },
  accent: { background: 'var(--accent-muted)', color: 'var(--accent)' },
  success: { background: 'var(--success-bg)', color: 'var(--success)' },
  warning: { background: 'var(--warning-bg)', color: 'var(--warning)' },
  error: { background: 'var(--error-bg)', color: 'var(--error)' },
};

export function Badge({
  tone = 'neutral',
  caps = true,
  children,
  style,
}: {
  tone?: BadgeTone;
  caps?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: caps ? FONT.micro : FONT.micro + 1,
        fontWeight: caps ? WEIGHT.bold : WEIGHT.semibold,
        padding: '3px 8px',
        borderRadius: 999,
        textTransform: caps ? 'uppercase' : 'none',
        letterSpacing: caps ? '0.05em' : 'normal',
        whiteSpace: 'nowrap',
        lineHeight: 1.1,
        ...BADGE_TONE[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ── Stat (KPI block) ────────────────────────────────────────────────────────
export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  size = 'md',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'accent' | 'success';
  size?: 'md' | 'lg';
}) {
  const valueColor =
    tone === 'accent' ? 'var(--accent)' : tone === 'success' ? 'var(--success)' : 'var(--text)';
  return (
    <div>
      <div
        style={{
          fontSize: FONT.label,
          fontWeight: WEIGHT.semibold,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          marginBottom: SPACE.sm,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: size === 'lg' ? FONT.statLg : FONT.stat,
          fontWeight: WEIGHT.heavy,
          color: valueColor,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {sub != null && (
        <div style={{ fontSize: FONT.micro + 1, color: 'var(--text-3)', marginTop: SPACE.xs }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Field + inputs ──────────────────────────────────────────────────────────
export function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ marginBottom: SPACE.md, ...style }}>
      <div
        style={{
          fontSize: FONT.label,
          fontWeight: WEIGHT.semibold,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// Inputs keep no explicit font-size so globals.css can force 16px on mobile
// (the iOS-Safari auto-zoom guard).
const inputBase: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: FONT.body,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text)',
  boxSizing: 'border-box',
  outline: 'none',
  fontFamily: 'inherit',
};

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputBase, ...props.style }} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ ...inputBase, resize: 'vertical', ...props.style }} />;
}

// ── ProgressBar ─────────────────────────────────────────────────────────────
export function ProgressBar({
  value,
  max,
  color = 'var(--accent)',
  height = 6,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
}) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div style={{ height, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 999,
          transition: 'width 0.8s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      />
    </div>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────
export function EmptyState({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        padding: '32px 20px',
        textAlign: 'center',
        color: 'var(--text-3)',
        fontSize: FONT.body,
        lineHeight: 1.5,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────
// `center` = dialog (contracts). `sheet` = mobile bottom-sheet (visit log).
// The caller mounts/unmounts the Modal; there is no `open` prop.
export function Modal({
  onClose,
  title,
  footer,
  children,
  variant = 'center',
  maxWidth,
}: {
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  variant?: 'center' | 'sheet';
  maxWidth?: number;
}) {
  const isSheet = variant === 'sheet';
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 2000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: isSheet ? 'flex-end' : 'center',
        padding: isSheet ? 0 : 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          width: '100%',
          maxWidth: maxWidth ?? (isSheet ? 480 : 720),
          maxHeight: isSheet ? '92dvh' : '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: isSheet
            ? 'var(--radius-xl) var(--radius-xl) 0 0'
            : 'var(--radius)',
        }}
      >
        {isSheet && (
          <div
            style={{
              width: 36,
              height: 4,
              background: 'var(--border)',
              borderRadius: 999,
              margin: '10px auto 2px',
              flexShrink: 0,
            }}
          />
        )}
        {title != null && (
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: SPACE.md,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: FONT.bodyLg,
                fontWeight: WEIGHT.bold,
                color: 'var(--text)',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Fermer
            </Button>
          </div>
        )}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>{children}</div>
        {footer != null && <div style={{ flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  );
}
