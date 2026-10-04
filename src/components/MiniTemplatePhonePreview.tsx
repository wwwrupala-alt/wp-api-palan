import React from 'react';
import {
  ImageIcon,
  Video,
  FileText,
  ExternalLink,
  Phone,
  CornerDownLeft,
  CheckCheck,
  ShieldCheck,
} from 'lucide-react';
import type { Template } from '../types/index.ts';

interface MiniTemplatePhonePreviewProps {
  template: Template;
  businessName?: string;
  className?: string;
  compact?: boolean;
}

export const MiniTemplatePhonePreview: React.FC<MiniTemplatePhonePreviewProps> = ({
  template,
  businessName = 'Verified Business',
  className = '',
  compact = false,
}) => {
  const headerComp = template.components?.find((c) => c.type === 'HEADER');
  const bodyComp = template.components?.find((c) => c.type === 'BODY');
  const footerComp = template.components?.find((c) => c.type === 'FOOTER');
  const buttonsComp = template.components?.find((c) => c.type === 'BUTTONS');

  // Format header media preview URL
  const format = (headerComp?.format || 'TEXT').toUpperCase();
  const rawHeaderHandle =
    headerComp?.example?.header_handle?.[0] ||
    (headerComp as any)?.mediaSampleUrl ||
    (headerComp as any)?.exampleUrl ||
    '';

  const isRemoteOrLocalUrl =
    typeof rawHeaderHandle === 'string' &&
    (rawHeaderHandle.startsWith('http') || rawHeaderHandle.startsWith('/uploads/'));

  // Substitute {{1}}, {{2}} with realistic dummy sample values
  const getSubstitutedBodyText = () => {
    if (!bodyComp?.text) return 'Hello, thank you for contacting us!';
    let text = bodyComp.text;

    // Check if examples are provided in component
    const sampleList: string[] =
      bodyComp.example?.body_text?.[0] ||
      (bodyComp.example as any)?.body_text_flat ||
      [];

    const defaultSamples = ['Rahul', 'ORD-9842', 'Tomorrow', 'Track Order', '50% OFF'];

    text = text.replace(/\{\{(\d+)\}\}/g, (match, p1) => {
      const idx = parseInt(p1, 10) - 1;
      const val = sampleList[idx] || defaultSamples[idx % defaultSamples.length] || `Param ${p1}`;
      return val;
    });

    return text;
  };

  return (
    <div
      className={`shrink-0 bg-neutral-900 dark:bg-neutral-950 shadow-md border-neutral-800 dark:border-neutral-700 text-neutral-900 select-none flex flex-col ${
        compact
          ? `w-[145px] sm:w-[155px] rounded-[20px] p-1.5 border-2 ${className}`
          : `w-full max-w-[210px] rounded-[28px] p-2 border-[3px] shadow-lg ${className}`
      }`}
    >
      {/* Phone Top Notch / Speaker Grill */}
      <div className={`flex items-center justify-center space-x-1 shrink-0 ${compact ? 'h-2 mb-1' : 'h-3 mb-1.5 space-x-1.5'}`}>
        <div className={`bg-neutral-700 dark:bg-neutral-800 rounded-full ${compact ? 'w-5 h-0.5' : 'w-8 h-1'}`} />
        <div className={`bg-neutral-700 dark:bg-neutral-800 rounded-full ${compact ? 'w-1 h-1' : 'w-1.5 h-1.5'}`} />
      </div>

      {/* Screen Container */}
      <div
        className={`overflow-hidden bg-[#efeae2] dark:bg-[#0b141b] flex flex-col justify-between relative border border-neutral-800/20 ${
          compact ? 'rounded-[14px] min-h-[210px]' : 'rounded-[20px] min-h-[300px]'
        }`}
        style={{
          backgroundImage: 'radial-gradient(#128c7e10 1px, transparent 1px)',
          backgroundSize: compact ? '8px 8px' : '12px 12px',
        }}
      >
        {/* WhatsApp Chat Top Header Bar */}
        <div
          className={`bg-[#075e54] dark:bg-[#1f2c34] text-white flex items-center z-10 shadow-xs shrink-0 ${
            compact ? 'px-1.5 py-1 space-x-1' : 'px-2.5 py-1.5 space-x-1.5'
          }`}
        >
          <div
            className={`rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold shrink-0 ring-1 ring-white/30 ${
              compact ? 'w-4 h-4 text-[7.5px]' : 'w-5 h-5 text-[9px]'
            }`}
          >
            WA
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-0.5">
              <p className={`font-semibold truncate leading-tight ${compact ? 'text-[8.5px]' : 'text-[10px]'}`}>
                {businessName}
              </p>
              <ShieldCheck className={`text-emerald-300 shrink-0 ${compact ? 'w-2 h-2' : 'w-2.5 h-2.5'}`} />
            </div>
            <p className={`text-emerald-100/80 leading-none truncate ${compact ? 'text-[6.5px]' : 'text-[7.5px]'}`}>
              Official WhatsApp
            </p>
          </div>
        </div>

        {/* WhatsApp Chat Message Area */}
        <div className={`flex-1 flex flex-col justify-start overflow-hidden ${compact ? 'p-1.5 space-y-1' : 'p-2 space-y-2'}`}>
          {/* Chat Bubble with subtle WhatsApp drop-shadow */}
          <div
            className={`bg-white dark:bg-[#1f2c34] rounded-tl-xs shadow-xs max-w-full text-neutral-900 dark:text-neutral-100 border border-neutral-200/50 dark:border-neutral-700/50 relative ${
              compact ? 'rounded-lg p-1.5 space-y-1' : 'rounded-xl p-2.5 space-y-1.5'
            }`}
          >
            {/* Header Rendering */}
            {headerComp && (
              <div className="overflow-hidden rounded-md">
                {format === 'TEXT' && (
                  <p
                    className={`font-bold text-neutral-900 dark:text-white leading-snug pb-0.5 border-b border-neutral-100 dark:border-neutral-700/50 ${
                      compact ? 'text-[9px]' : 'text-[11px]'
                    }`}
                  >
                    {headerComp.text || 'Header Title'}
                  </p>
                )}

                {format === 'IMAGE' && (
                  <div className="relative aspect-16/10 rounded-md overflow-hidden bg-neutral-200 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                    {isRemoteOrLocalUrl ? (
                      <img
                        src={rawHeaderHandle}
                        alt="Header"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1579203438237-49dcf6133f6a?w=400&auto=format&fit=crop&q=80';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-50 dark:from-neutral-800 dark:to-neutral-900 p-1 text-center">
                        <ImageIcon className={`text-emerald-600 dark:text-emerald-400 mb-0.5 ${compact ? 'w-3.5 h-3.5' : 'w-5 h-5'}`} />
                        <span className={`font-semibold text-emerald-800 dark:text-emerald-300 ${compact ? 'text-[7px]' : 'text-[8.5px]'}`}>
                          Image
                        </span>
                      </div>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 px-0.5 py-0.2 rounded bg-black/60 text-white text-[6.5px] font-medium tracking-wide">
                      Photo
                    </span>
                  </div>
                )}

                {format === 'VIDEO' && (
                  <div className="relative aspect-16/10 rounded-md overflow-hidden bg-neutral-900 flex flex-col items-center justify-center text-white border border-neutral-800">
                    <div className="w-4 h-4 rounded-full bg-emerald-500/80 flex items-center justify-center mb-0.5 shadow-xs">
                      <Video className="w-2.5 h-2.5 text-white ml-0.5" />
                    </div>
                    <span className="text-[7px] font-medium text-neutral-300">Video</span>
                  </div>
                )}

                {format === 'DOCUMENT' && (
                  <div className="p-1 rounded bg-neutral-100 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700 flex items-center space-x-1">
                    <div className="w-4 h-4 rounded bg-red-100 dark:bg-red-950/60 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                      <FileText className="w-2.5 h-2.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[7.5px] font-bold text-neutral-800 dark:text-neutral-200 truncate">
                        Document.pdf
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Body Text */}
            <p
              className={`leading-relaxed text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words ${
                compact ? 'text-[8.5px] line-clamp-4' : 'text-[10px] line-clamp-6'
              }`}
            >
              {getSubstitutedBodyText()}
            </p>

            {/* Footer Text & Timestamp */}
            <div className="pt-0.5 flex items-end justify-between gap-0.5">
              {footerComp?.text ? (
                <p className={`text-neutral-400 dark:text-neutral-500 italic truncate max-w-[70%] ${compact ? 'text-[7px]' : 'text-[8px]'}`}>
                  {footerComp.text}
                </p>
              ) : (
                <div />
              )}
              <div className={`flex items-center space-x-0.5 text-neutral-400 shrink-0 ml-auto ${compact ? 'text-[7px]' : 'text-[8px]'}`}>
                <span>10:45 AM</span>
                <CheckCheck className={`text-sky-500 ${compact ? 'w-2 h-2' : 'w-2.5 h-2.5'}`} />
              </div>
            </div>

            {/* WhatsApp CTA / Quick Reply Buttons */}
            {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
              <div className={`border-t border-neutral-100 dark:border-neutral-700/60 ${compact ? 'pt-1 space-y-0.5' : 'pt-1.5 space-y-1'}`}>
                {buttonsComp.buttons.slice(0, 3).map((btn, idx) => {
                  const bType = (btn.type || 'QUICK_REPLY').toUpperCase();
                  return (
                    <div
                      key={idx}
                      className={`w-full rounded bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center space-x-0.5 transition-colors ${
                        compact ? 'py-0.5 px-1 text-[7px]' : 'py-1 px-1.5 text-[8.5px] rounded-md'
                      }`}
                    >
                      {bType === 'URL' && <ExternalLink className={compact ? 'w-2 h-2 shrink-0' : 'w-2.5 h-2.5 shrink-0'} />}
                      {bType === 'PHONE_NUMBER' && <Phone className={compact ? 'w-2 h-2 shrink-0' : 'w-2.5 h-2.5 shrink-0'} />}
                      {bType === 'QUICK_REPLY' && <CornerDownLeft className={compact ? 'w-2 h-2 shrink-0' : 'w-2.5 h-2.5 shrink-0'} />}
                      <span className="truncate">{btn.text || 'Action Button'}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* WhatsApp Bottom Chat Input Bar Simulator */}
        <div
          className={`bg-[#f0f2f5] dark:bg-[#1f2c34] flex items-center border-t border-neutral-200 dark:border-neutral-700/40 shrink-0 ${
            compact ? 'p-1 space-x-0.5' : 'p-1.5 space-x-1'
          }`}
        >
          <div
            className={`flex-1 bg-white dark:bg-neutral-800 rounded-full text-neutral-400 truncate ${
              compact ? 'px-1.5 py-0.2 text-[6.5px]' : 'px-2 py-0.5 text-[8px]'
            }`}
          >
            Type a message...
          </div>
          <div
            className={`rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0 ${
              compact ? 'w-3 h-3 text-[6px]' : 'w-4 h-4 text-[7px]'
            }`}
          >
            <span>➤</span>
          </div>
        </div>
      </div>
    </div>
  );
};
