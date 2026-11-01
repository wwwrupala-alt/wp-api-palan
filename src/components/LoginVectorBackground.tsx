import React from 'react';

/**
 * Animated SVG & CSS Vector Background for WABACLOUD Login Page
 * Features floating WhatsApp message bubbles, Cloud API transmission nodes,
 * and ambient emerald glowing gradients. 100% lightweight and GPU-accelerated.
 */
export const LoginVectorBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden select-none z-0"
    >
      {/* 1. Subtle Enterprise Mesh Dot Grid */}
      <div
        className="absolute inset-0 opacity-[0.4] dark:opacity-[0.25]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '32px 32px',
          color: 'var(--grid-dot-color, #10b981)',
        }}
      />

      {/* 2. Soft Ambient Glowing Radial Orbs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute top-1/3 -right-40 w-[450px] h-[450px] rounded-full bg-teal-500/15 dark:bg-teal-500/20 blur-3xl animate-pulse" style={{ animationDuration: '11s', animationDelay: '2s' }} />
      <div className="absolute -bottom-32 left-1/4 w-96 h-96 rounded-full bg-emerald-600/10 dark:bg-emerald-600/15 blur-3xl animate-pulse" style={{ animationDuration: '9s', animationDelay: '4s' }} />

      {/* 3. Subtle Animated Vector Transmission Network Lines */}
      <svg
        className="absolute inset-0 w-full h-full opacity-25 dark:opacity-20"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="lineGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#10b981" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="lineGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#10b981" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Network connection wave 1 */}
        <path
          d="M -100,200 Q 300,50 700,280 T 1500,220"
          fill="none"
          stroke="url(#lineGrad1)"
          strokeWidth="1.5"
          strokeDasharray="6 8"
          className="animate-pulse"
          style={{ animationDuration: '6s' }}
        />

        {/* Network connection wave 2 */}
        <path
          d="M -50,600 Q 400,750 900,550 T 1700,680"
          fill="none"
          stroke="url(#lineGrad2)"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          className="animate-pulse"
          style={{ animationDuration: '8s', animationDelay: '1s' }}
        />

        {/* Diagonal high-speed API transmission route */}
        <path
          d="M 100,-50 L 1300,950"
          fill="none"
          stroke="url(#lineGrad1)"
          strokeWidth="1"
          strokeDasharray="8 12"
          className="opacity-40"
        />
      </svg>

      {/* 4. Floating Animated WhatsApp & Cloud Vector Elements */}

      {/* Vector Bubble 1: Top-Left (Chat speech bubble with double checkmark) */}
      <div
        className="absolute top-16 left-10 md:left-24 w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white/80 dark:bg-neutral-850/80 border border-emerald-500/30 dark:border-emerald-500/20 shadow-lg shadow-emerald-500/10 backdrop-blur-md flex items-center justify-center text-emerald-600 dark:text-emerald-400"
        style={{
          animation: 'floatSlow 7s ease-in-out infinite',
        }}
      >
        <svg className="w-7 h-7 md:w-8 md:h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          <path d="M9 12l2 2 4-4" strokeWidth="2" />
        </svg>
      </div>

      {/* Vector Bubble 2: Top-Right (Cloud API node vector) */}
      <div
        className="absolute top-28 right-8 md:right-28 w-16 h-16 md:w-20 md:h-20 rounded-3xl bg-white/70 dark:bg-neutral-850/70 border border-teal-500/30 dark:border-teal-500/20 shadow-lg shadow-teal-500/10 backdrop-blur-md flex items-center justify-center text-teal-600 dark:text-teal-400"
        style={{
          animation: 'floatMedium 9s ease-in-out infinite',
          animationDelay: '1.5s',
        }}
      >
        <svg className="w-8 h-8 md:w-10 md:h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
          <path d="M12 12v4m0 0l-2-2m2 2l2-2" strokeWidth="1.8" />
        </svg>
      </div>

      {/* Vector Bubble 3: Bottom-Left (Secure Verified Shield & Automation Vector) */}
      <div
        className="absolute bottom-20 left-8 md:left-28 w-14 h-14 md:w-18 md:h-18 rounded-2xl bg-white/75 dark:bg-neutral-850/75 border border-emerald-500/30 dark:border-emerald-500/20 shadow-lg shadow-emerald-500/10 backdrop-blur-md flex items-center justify-center text-emerald-600 dark:text-emerald-400"
        style={{
          animation: 'floatSlow 8.5s ease-in-out infinite',
          animationDelay: '3s',
        }}
      >
        <svg className="w-7 h-7 md:w-9 md:h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" strokeWidth="2" />
        </svg>
      </div>

      {/* Vector Bubble 4: Bottom-Right (Outbound broadcast campaign rocket/paper-plane) */}
      <div
        className="absolute bottom-28 right-12 md:right-32 w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white/75 dark:bg-neutral-850/75 border border-emerald-500/30 dark:border-emerald-500/20 shadow-lg shadow-emerald-500/10 backdrop-blur-md flex items-center justify-center text-emerald-600 dark:text-emerald-400"
        style={{
          animation: 'floatMedium 7.5s ease-in-out infinite',
          animationDelay: '2.2s',
        }}
      >
        <svg className="w-6 h-6 md:w-8 md:h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </div>

      {/* 5. Custom Keyframes Style Block */}
      <style>{`
        @keyframes floatSlow {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-16px) rotate(2deg);
          }
        }
        @keyframes floatMedium {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-22px) rotate(-3deg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-pulse {
            animation: none !important;
          }
          div[style*="animation: float"] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
};
