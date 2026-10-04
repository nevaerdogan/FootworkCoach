/** Boxing glove, side view, fist pointing right. 120 × 100 units. */
export function Glove({ tone = 'accent', className = '' }: { tone?: 'accent' | 'chalk'; className?: string }) {
  const id = `glove-${tone}`;
  return (
    <svg className={`glove ${className}`} viewBox="0 0 120 100" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {tone === 'accent' ? (
            <>
              <stop offset="0%" stopColor="#ff7a4f" />
              <stop offset="55%" stopColor="#ff4a1c" />
              <stop offset="100%" stopColor="#c2310c" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="60%" stopColor="#ece9e3" />
              <stop offset="100%" stopColor="#b9b4ab" />
            </>
          )}
        </linearGradient>
      </defs>
      {/* Cuff */}
      <rect x="3" y="30" width="22" height="50" rx="6" fill={tone === 'accent' ? '#8f2309' : '#9c978e'} />
      <rect x="9" y="30" width="3" height="50" fill="rgba(0,0,0,0.18)" />
      {/* Mitt */}
      <path
        d="M20,30 C20,13 34,5 54,5 L80,5 C102,5 116,20 116,45 C116,72 99,90 74,90 L50,90 C39,90 32,85 28,79 L20,79 Z"
        fill={`url(#${id})`}
      />
      {/* Knuckle highlight */}
      <path d="M58,14 C78,11 98,16 106,30" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="4" strokeLinecap="round" />
      {/* Thumb */}
      <path
        d="M50,62 C50,53 58,48 69,50 C80,52 87,58 85,67 C83,74 73,76 62,74 C55,72 50,68 50,62 Z"
        fill="none"
        stroke="rgba(0,0,0,0.22)"
        strokeWidth="3"
      />
    </svg>
  );
}
