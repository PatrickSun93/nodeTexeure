'use client';

import { useTranslations } from 'next-intl';

export const ORDER_STATUS_STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

// Champagne & Charcoal colours for the shared .nt-status-timeline markup
// (layout lives in styles/checkout-orders.css). The wrapper is full width and
// capped at 720px: inside .aesop-container (a centred flex column) the
// timeline would otherwise shrink to its content and the step labels would
// run into each other.
const TIMELINE_CSS = `
  .nt-timeline-wrap { width: 100%; max-width: 720px; margin: 0 auto; }
  .nt-timeline-wrap .nt-status-timeline { margin: 0; }
  .nt-timeline-wrap .nt-timeline-dot { background: var(--noirae-bg-sand); color: var(--noirae-text-muted); border-color: var(--noirae-border-dark); }
  .nt-timeline-wrap .nt-step-active .nt-timeline-dot { background: var(--noirae-accent-gold); color: var(--noirae-bg-white); border-color: var(--noirae-accent-gold); }
  .nt-timeline-wrap .nt-step-current .nt-timeline-dot { background: var(--noirae-text-primary); color: var(--noirae-bg-cream); border-color: var(--noirae-text-primary); box-shadow: 0 0 0 4px var(--noirae-warning-bg); }
  .nt-timeline-wrap .nt-timeline-label { color: var(--noirae-text-muted); }
  .nt-timeline-wrap .nt-step-active .nt-timeline-label { color: var(--noirae-text-primary); font-weight: 500; }
  .nt-timeline-wrap .nt-timeline-step:not(:last-child)::after { background: var(--noirae-border-dark); }
  .nt-timeline-wrap .nt-timeline-step.nt-step-active:not(:last-child)::after { background: var(--noirae-accent-gold); }
  @media (max-width: 600px) {
    .nt-timeline-wrap .nt-status-timeline { padding: 0; }
    .nt-timeline-wrap .nt-timeline-label { font-size: 0.6rem; letter-spacing: 0.02em; }
  }
`;

// Progress steps for an order (pending → delivered). Statuses outside the
// happy path (cancelled, refunded) mark no step as reached.
export default function OrderStatusTimeline({ status, style }) {
  const t = useTranslations('Orders.statuses');
  const statusIdx = ORDER_STATUS_STEPS.indexOf(status);

  return (
    <div className="nt-timeline-wrap" style={style}>
      <style>{TIMELINE_CSS}</style>
      <div className="nt-status-timeline">
        {ORDER_STATUS_STEPS.map((step, idx) => (
          <div key={step} className={`nt-timeline-step ${idx <= statusIdx ? 'nt-step-active' : ''} ${idx === statusIdx ? 'nt-step-current' : ''}`}>
            <div className="nt-timeline-dot">{idx < statusIdx ? '✓' : idx + 1}</div>
            <span className="nt-timeline-label">{t(step)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
