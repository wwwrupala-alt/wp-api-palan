import React, { useRef, useEffect, useCallback } from 'react';
import { RotateCw, Volume2, ShieldCheck, Check } from 'lucide-react';

interface CaptchaBoxProps {
  captchaCode: string;
  userInput: string;
  onChange: (val: string) => void;
  onRefresh: () => void;
  isMatched?: boolean;
}

// Generate random alphanumeric characters omitting easily confused characters (O, 0, I, 1, l)
export const generateCaptchaCode = (length = 5): string => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const CaptchaBox: React.FC<CaptchaBoxProps> = ({
  captchaCode,
  userInput,
  onChange,
  onRefresh,
  isMatched = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render security noise, slants, and characters on HTML5 Canvas
  const drawCaptcha = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    // Light subtle background pattern
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, width, height);

    // Draw background security grid/noise lines
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `hsl(${Math.random() * 360}, 65%, 75%)`;
      ctx.lineWidth = Math.random() * 1.5 + 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * width, Math.random() * height);
      ctx.bezierCurveTo(
        Math.random() * width,
        Math.random() * height,
        Math.random() * width,
        Math.random() * height,
        Math.random() * width,
        Math.random() * height
      );
      ctx.stroke();
    }

    // Draw random noise dots
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `hsl(${Math.random() * 360}, 60%, 65%)`;
      ctx.beginPath();
      ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw individual characters with random rotation, color, and vertical offset
    const charList = captchaCode.split('');
    const charSpacing = width / (charList.length + 1);

    charList.forEach((char, index) => {
      ctx.save();
      const x = charSpacing * (index + 0.7);
      const y = height / 2 + (Math.random() * 6 - 3);

      ctx.translate(x, y);
      const angle = (Math.random() * 34 - 17) * (Math.PI / 180);
      ctx.rotate(angle);

      // Random vibrant high-contrast color for each character
      const colors = ['#0f766e', '#1e40af', '#b45309', '#be123c', '#4338ca', '#047857', '#6d28d9'];
      ctx.fillStyle = colors[index % colors.length];
      const fontSize = Math.floor(Math.random() * 4) + 22;
      ctx.font = `bold ${fontSize}px "Courier New", Courier, monospace`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      ctx.fillText(char, 0, 0);
      ctx.restore();
    });
  }, [captchaCode]);

  useEffect(() => {
    drawCaptcha();
  }, [drawCaptcha]);

  // Audio accessibility support
  const handleAudioSpeak = () => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        // Speak characters spaced out
        const textToSpeak = captchaCode.split('').join(' . ');
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 0.8;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    } catch {}
  };

  return (
    <div className="space-y-2 p-3 rounded-2xl bg-neutral-50/80 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-750">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Security Verification (CAPTCHA)</span>
        </label>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">Anti-Bot Shield</span>
      </div>

      <div className="flex items-center space-x-2">
        {/* Rendered Canvas Image */}
        <div className="relative rounded-xl overflow-hidden border border-neutral-300 dark:border-neutral-700 shadow-2xs shrink-0 select-none bg-neutral-100">
          <canvas
            ref={canvasRef}
            width={140}
            height={42}
            className="block"
            title="Security CAPTCHA"
          />
        </div>

        {/* Action Buttons: Refresh & Audio */}
        <div className="flex flex-col space-y-1">
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh new CAPTCHA code"
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleAudioSpeak}
            title="Listen to CAPTCHA code"
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* User Input */}
        <div className="relative flex-1">
          <input
            type="text"
            required
            maxLength={6}
            autoComplete="off"
            spellCheck="false"
            value={userInput}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            placeholder="Enter code"
            className={`w-full px-3 py-2 text-center font-mono font-bold tracking-widest text-sm rounded-xl border bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 ${
              isMatched
                ? 'border-emerald-500 focus:ring-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'border-neutral-300 dark:border-neutral-700 focus:ring-emerald-500'
            }`}
          />
          {isMatched && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400">
              <Check className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>
      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
        Type the 5 characters shown above to verify you are human.
      </p>
    </div>
  );
};
