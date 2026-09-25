/** Phone-and-cards scene for the auth screens, in the brand palette. Decorative. */
export default function AuthIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 340" className={className} aria-hidden focusable="false">
      {/* ground and plants */}
      <path d="M20 318h380" stroke="#1F2430" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="210" cy="316" rx="150" ry="10" fill="#FDEDE8" />
      <g fill="#E8552D" opacity=".85">
        <path d="M48 316c-6-40 2-78 14-104 4 34 0 72-6 104z" />
        <path d="M62 316c4-30 16-58 30-74-2 28-12 56-24 74z" opacity=".7" />
        <path d="M372 316c6-40-2-78-14-104-4 34 0 72 6 104z" />
        <path d="M358 316c-4-30-16-58-30-74 2 28 12 56 24 74z" opacity=".7" />
      </g>
      {/* phone */}
      <rect x="150" y="40" width="120" height="236" rx="18" fill="#fff" stroke="#1F2430" strokeWidth="3" />
      <rect x="160" y="56" width="100" height="196" rx="8" fill="#FDEDE8" />
      <rect x="170" y="68" width="80" height="34" rx="6" fill="#fff" stroke="#E8552D" strokeDasharray="4 3" />
      <rect x="170" y="112" width="36" height="84" rx="6" fill="#fff" stroke="#E8552D" strokeDasharray="4 3" />
      <rect x="214" y="112" width="36" height="84" rx="6" fill="#fff" stroke="#E8552D" strokeDasharray="4 3" />
      <rect x="170" y="206" width="80" height="34" rx="6" fill="#fff" stroke="#E8552D" strokeDasharray="4 3" />
      <rect x="160" y="252" width="100" height="14" rx="4" fill="#E8552D" />
      <circle cx="210" cy="259" r="3" fill="#fff" />
      {/* work-order card */}
      <g>
        <rect x="236" y="98" width="130" height="50" rx="10" fill="#E8552D" />
        <circle cx="258" cy="123" r="11" fill="#fff" />
        <path d="M253 123l4 4 7-8" stroke="#E8552D" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="276" y="112" width="74" height="7" rx="3.5" fill="#fff" />
        <rect x="276" y="126" width="52" height="7" rx="3.5" fill="#fff" opacity=".7" />
      </g>
      {/* checklist card */}
      <g>
        <rect x="52" y="120" width="84" height="64" rx="8" fill="#C9461F" />
        {[136, 152, 168].map((y) => (
          <g key={y}>
            <rect x="62" y={y - 4} width="8" height="8" rx="2" fill="#fff" />
            <rect x="76" y={y - 3} width="48" height="6" rx="3" fill="#fff" opacity=".85" />
          </g>
        ))}
      </g>
      {/* play / report tile */}
      <g>
        <rect x="178" y="176" width="64" height="44" rx="8" fill="#C9461F" />
        <path d="M204 188v20l16-10z" fill="#fff" />
      </g>
      {/* wrench badge */}
      <g transform="translate(300 176)">
        <circle r="26" fill="#fff" stroke="#E8552D" strokeWidth="3" />
        <path
          d="M8 -10a10 10 0 0 0-13 13l-11 11 5 5 11-11a10 10 0 0 0 13-13l-6 6-5-5z"
          fill="#E8552D"
        />
      </g>
      {/* gauge badge */}
      <g transform="translate(102 238)">
        <circle r="22" fill="#fff" stroke="#C9461F" strokeWidth="3" />
        <path d="M-12 6a13 13 0 0 1 24 0" stroke="#C9461F" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M0 6l7-9" stroke="#1F2430" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
