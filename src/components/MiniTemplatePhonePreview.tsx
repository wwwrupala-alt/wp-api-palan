import React from 'react';
import {
  ImageIcon,
  Video,
  FileText,
  ExternalLink,
  Phone,
  CornerDownLeft,
  CheckCheck,
  Check,
  Clock,
  AlertTriangle,
  ShieldCheck,
  ArrowLeft,
  MoreVertical,
  Smile,
  Paperclip,
  Camera,
  Mic,
} from 'lucide-react';
import type { Template } from '../types/index.ts';

interface MiniTemplatePhonePreviewProps {
  template: Template;
  businessName?: string;
  className?: string;
  compact?: boolean;
  size?: 'compact' | 'medium' | 'large';
  customVariables?: Record<string, string>;
  customMediaUrl?: string;
  recipientName?: string;
  messageTimestamp?: string;
  deliveryStatus?: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | string;
  highlightVariables?: boolean;
}

export const MiniTemplatePhonePreview: React.FC<MiniTemplatePhonePreviewProps> = ({
  template,
  businessName = 'Verified Business',
  className = '',
  compact = false,
  size,
  customVariables,
  customMediaUrl,
  recipientName,
  messageTimestamp,
  deliveryStatus = 'read',
  highlightVariables = false,
}) => {
  const effectiveSize = size || (compact ? 'compact' : 'medium');
  const isLarge = effectiveSize === 'large';
  const isCompact = effectiveSize === 'compact';

  const headerComp = template.components?.find((c) => c.type === 'HEADER');
  const bodyComp = template.components?.find((c) => c.type === 'BODY');
  const footerComp = template.components?.find((c) => c.type === 'FOOTER');
  const buttonsComp = template.components?.find((c) => c.type === 'BUTTONS');

  // Format header media preview URL
  const format = (headerComp?.format || 'TEXT').toUpperCase();
  const rawHeaderHandle =
    customMediaUrl ||
    customVariables?.header_media_url ||
    customVariables?.headerMediaUrl ||
    headerComp?.example?.header_handle?.[0] ||
    (headerComp as any)?.mediaSampleUrl ||
    (headerComp as any)?.exampleUrl ||
    '';

  const isRemoteOrLocalUrl =
    typeof rawHeaderHandle === 'string' &&
    rawHeaderHandle.trim() !== '' &&
    !rawHeaderHandle.startsWith('4:') &&
    (rawHeaderHandle.startsWith('http') ||
      rawHeaderHandle.startsWith('/uploads/') ||
      rawHeaderHandle.startsWith('blob:') ||
      rawHeaderHandle.startsWith('data:'));

  // Substitute {{1}}, {{2}} in header text
  const getSubstitutedHeaderText = () => {
    let text = headerComp?.text || 'Header Title';
    if (customVariables) {
      text = text.replace(/\{\{(\d+)\}\}/g, (match, p1) => {
        const val =
          customVariables[`header_${p1}`] ||
          customVariables[p1] ||
          customVariables[`{{${p1}}}`];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val);
        }
        return match;
      });
    }
    return text;
  };

  // Substitute {{1}}, {{2}} in body text with custom variables, recipient name, or fallback examples
  const getVariableValue = (p1: string, idx: number, sampleList: string[], defaultSamples: string[]) => {
    // 1. If {{1}} and recipientName is provided and no body_1 override
    if (p1 === '1' && recipientName && (!customVariables || !customVariables['body_1'])) {
      return recipientName;
    }

    // 2. Prioritize user custom variables passed from campaign or recipient
    if (customVariables) {
      const val =
        customVariables[p1] ||
        customVariables[`body_${p1}`] ||
        customVariables[`{{${p1}}}`] ||
        customVariables[String(parseInt(p1, 10))];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val);
      }
    }

    // 3. Fallback to template examples or sensible defaults
    return sampleList[idx] || defaultSamples[idx % defaultSamples.length] || `Param ${p1}`;
  };

  const renderBodyContent = () => {
    if (!bodyComp?.text) return 'Hello, thank you for contacting us!';
    const rawText = bodyComp.text;

    const sampleList: string[] =
      bodyComp.example?.body_text?.[0] ||
      (bodyComp.example as any)?.body_text_flat ||
      [];
    const defaultSamples = ['Rahul', 'ORD-9842', 'Tomorrow', 'Track Order', '50% OFF'];

    if (!highlightVariables) {
      // Plain text replacement
      return rawText.replace(/\{\{(\d+)\}\}/g, (match, p1) => {
        const idx = parseInt(p1, 10) - 1;
        return getVariableValue(p1, idx, sampleList, defaultSamples);
      });
    }

    // With variable highlights: split by regex and render spans
    const parts = rawText.split(/(\{\{\d+\}\})/g);
    return parts.map((part, pIdx) => {
      const match = part.match(/^\{\{(\d+)\}\}$/);
      if (match) {
        const p1 = match[1];
        const idx = parseInt(p1, 10) - 1;
        const val = getVariableValue(p1, idx, sampleList, defaultSamples);
        return (
          <span
            key={pIdx}
            title={`Variable {{${p1}}}: "${val}"`}
            className="inline-block px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-300/60 dark:border-emerald-700/60 mx-0.5 transition-colors"
          >
            {val}
          </span>
        );
      }
      return <span key={pIdx}>{part}</span>;
    });
  };

  // Format display time
  const formattedTime = () => {
    if (messageTimestamp) {
      try {
        const d = new Date(messageTimestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return messageTimestamp;
      }
    }
    return '10:45 AM';
  };

  return (
    <div
      className={`shrink-0 bg-neutral-900 dark:bg-neutral-950 shadow-xl border-neutral-800 dark:border-neutral-700 text-neutral-900 select-none flex flex-col transition-all ${
        isLarge
          ? `w-full max-w-[340px] rounded-[36px] p-2.5 border-[4px] shadow-2xl ${className}`
          : isCompact
          ? `w-[145px] sm:w-[155px] rounded-[20px] p-1.5 border-2 ${className}`
          : `w-full max-w-[220px] rounded-[28px] p-2 border-[3px] shadow-lg ${className}`
      }`}
    >
      {/* Phone Top Notch / Speaker Grill & Camera */}
      <div
        className={`flex items-center justify-center space-x-1 shrink-0 ${
          isLarge ? 'h-3.5 mb-2 space-x-2' : isCompact ? 'h-2 mb-1' : 'h-3 mb-1.5 space-x-1.5'
        }`}
      >
        <div
          className={`bg-neutral-700 dark:bg-neutral-800 rounded-full ${
            isLarge ? 'w-12 h-1' : isCompact ? 'w-5 h-0.5' : 'w-8 h-1'
          }`}
        />
        <div
          className={`bg-neutral-700 dark:bg-neutral-800 rounded-full ${
            isLarge ? 'w-2 h-2' : isCompact ? 'w-1 h-1' : 'w-1.5 h-1.5'
          }`}
        />
      </div>

      {/* Screen Container */}
      <div
        className={`overflow-hidden bg-[#efeae2] dark:bg-[#0b141b] flex flex-col justify-between relative border border-neutral-800/20 shadow-inner ${
          isLarge
            ? 'rounded-[24px] min-h-[460px]'
            : isCompact
            ? 'rounded-[14px] min-h-[210px]'
            : 'rounded-[20px] min-h-[300px]'
        }`}
        style={{
          backgroundImage: 'radial-gradient(#128c7e14 1px, transparent 1px)',
          backgroundSize: isLarge ? '14px 14px' : isCompact ? '8px 8px' : '12px 12px',
        }}
      >
        {/* WhatsApp Chat Top Header Bar */}
        <div
          className={`bg-[#075e54] dark:bg-[#1f2c34] text-white flex items-center justify-between z-10 shadow-xs shrink-0 ${
            isLarge ? 'px-3 py-2 space-x-2' : isCompact ? 'px-1.5 py-1 space-x-1' : 'px-2.5 py-1.5 space-x-1.5'
          }`}
        >
          <div className="flex items-center space-x-1.5 min-w-0">
            {isLarge && <ArrowLeft className="w-4 h-4 text-white/90 shrink-0 mr-0.5" />}
            <div
              className={`rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold shrink-0 ring-1 ring-white/30 ${
                isLarge ? 'w-7 h-7 text-xs shadow-xs' : isCompact ? 'w-4 h-4 text-[7.5px]' : 'w-5 h-5 text-[9px]'
              }`}
            >
              {businessName.slice(0, 2).toUpperCase() || 'WA'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1">
                <p
                  className={`font-semibold truncate leading-tight ${
                    isLarge ? 'text-xs' : isCompact ? 'text-[8.5px]' : 'text-[10px]'
                  }`}
                >
                  {businessName}
                </p>
                <ShieldCheck
                  className={`text-emerald-300 shrink-0 ${
                    isLarge ? 'w-3.5 h-3.5' : isCompact ? 'w-2 h-2' : 'w-2.5 h-2.5'
                  }`}
                />
              </div>
              <p
                className={`text-emerald-100/80 leading-none truncate ${
                  isLarge ? 'text-[9.5px]' : isCompact ? 'text-[6.5px]' : 'text-[7.5px]'
                }`}
              >
                Official WhatsApp
              </p>
            </div>
          </div>

          {isLarge && (
            <div className="flex items-center space-x-2.5 text-white/90 shrink-0">
              <Video className="w-4 h-4" />
              <Phone className="w-3.5 h-3.5" />
              <MoreVertical className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* WhatsApp Chat Message Area */}
        <div
          className={`flex-1 flex flex-col justify-start overflow-y-auto ${
            isLarge ? 'p-3 space-y-2.5' : isCompact ? 'p-1.5 space-y-1' : 'p-2 space-y-2'
          }`}
        >
          {/* Date pill */}
          <div className="flex justify-center my-0.5">
            <span
              className={`px-2 py-0.5 rounded-md bg-white/80 dark:bg-neutral-800/80 text-neutral-500 dark:text-neutral-400 font-medium uppercase shadow-2xs ${
                isLarge ? 'text-[10px]' : isCompact ? 'text-[6.5px]' : 'text-[8px]'
              }`}
            >
              Today
            </span>
          </div>

          {/* Chat Bubble with WhatsApp drop-shadow */}
          <div
            className={`bg-white dark:bg-[#1f2c34] rounded-tl-xs shadow-xs max-w-full text-neutral-900 dark:text-neutral-100 border border-neutral-200/60 dark:border-neutral-700/60 relative ${
              isLarge
                ? 'rounded-2xl p-3 space-y-2'
                : isCompact
                ? 'rounded-lg p-1.5 space-y-1'
                : 'rounded-xl p-2.5 space-y-1.5'
            }`}
          >
            {/* Header Rendering */}
            {headerComp && (
              <div className="overflow-hidden rounded-md">
                {format === 'TEXT' && (
                  <p
                    className={`font-bold text-neutral-900 dark:text-white leading-snug pb-1 border-b border-neutral-100 dark:border-neutral-700/50 ${
                      isLarge ? 'text-xs' : isCompact ? 'text-[9px]' : 'text-[11px]'
                    }`}
                  >
                    {getSubstitutedHeaderText()}
                  </p>
                )}

                {format === 'IMAGE' && (
                  <div
                    className={`relative rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/60 dark:border-neutral-700 ${
                      isLarge ? 'h-44 sm:h-48' : 'aspect-16/10'
                    }`}
                  >
                    {isRemoteOrLocalUrl ? (
                      <img
                        src={rawHeaderHandle}
                        alt="Header attachment"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1579203438237-49dcf6133f6a?w=400&auto=format&fit=crop&q=80';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-50 dark:from-neutral-800 dark:to-neutral-900 p-2 text-center">
                        <ImageIcon
                          className={`text-emerald-600 dark:text-emerald-400 mb-1 ${
                            isLarge ? 'w-8 h-8' : isCompact ? 'w-3.5 h-3.5' : 'w-5 h-5'
                          }`}
                        />
                        <span
                          className={`font-semibold text-emerald-800 dark:text-emerald-300 ${
                            isLarge ? 'text-xs' : isCompact ? 'text-[7px]' : 'text-[8.5px]'
                          }`}
                        >
                          Template Image Attachment
                        </span>
                      </div>
                    )}
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[8px] font-medium tracking-wide">
                      Photo
                    </span>
                  </div>
                )}

                {format === 'VIDEO' && (
                  <div
                    className={`relative rounded-xl overflow-hidden bg-neutral-900 flex flex-col items-center justify-center text-white border border-neutral-800 ${
                      isLarge ? 'h-40' : 'aspect-16/10'
                    }`}
                  >
                    <div
                      className={`rounded-full bg-emerald-500/90 flex items-center justify-center shadow-xs ${
                        isLarge ? 'w-10 h-10 mb-1' : 'w-4 h-4 mb-0.5'
                      }`}
                    >
                      <Video className={`text-white ml-0.5 ${isLarge ? 'w-5 h-5' : 'w-2.5 h-2.5'}`} />
                    </div>
                    <span className={`font-medium text-neutral-300 ${isLarge ? 'text-xs' : 'text-[7px]'}`}>
                      Video Attachment
                    </span>
                  </div>
                )}

                {format === 'DOCUMENT' && (
                  <div
                    className={`rounded-xl bg-neutral-100 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700 flex items-center ${
                      isLarge ? 'p-2.5 space-x-2' : 'p-1 space-x-1'
                    }`}
                  >
                    <div
                      className={`rounded-lg bg-red-100 dark:bg-red-950/60 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0 ${
                        isLarge ? 'w-8 h-8' : 'w-4 h-4'
                      }`}
                    >
                      <FileText className={isLarge ? 'w-4 h-4' : 'w-2.5 h-2.5'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-bold text-neutral-800 dark:text-neutral-200 truncate ${
                          isLarge ? 'text-xs' : 'text-[7.5px]'
                        }`}
                      >
                        Document.pdf
                      </p>
                      {isLarge && <p className="text-[10px] text-neutral-400">1 page &bull; PDF</p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Body Text with Variable Substitution */}
            <div
              className={`leading-relaxed text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words ${
                isLarge
                  ? 'text-xs'
                  : isCompact
                  ? 'text-[8.5px] line-clamp-4'
                  : 'text-[10px] line-clamp-6'
              }`}
            >
              {renderBodyContent()}
            </div>

            {/* Footer Text & Timestamp */}
            <div className="pt-1 flex items-end justify-between gap-1">
              {footerComp?.text ? (
                <p
                  className={`text-neutral-400 dark:text-neutral-500 italic truncate max-w-[70%] ${
                    isLarge ? 'text-[10px]' : isCompact ? 'text-[7px]' : 'text-[8px]'
                  }`}
                >
                  {footerComp.text}
                </p>
              ) : (
                <div />
              )}
              <div
                className={`flex items-center space-x-1 text-neutral-400 shrink-0 ml-auto ${
                  isLarge ? 'text-[10px]' : isCompact ? 'text-[7px]' : 'text-[8px]'
                }`}
              >
                <span>{formattedTime()}</span>
                {deliveryStatus === 'read' && (
                  <CheckCheck className={`text-sky-500 ${isLarge ? 'w-3.5 h-3.5' : isCompact ? 'w-2 h-2' : 'w-2.5 h-2.5'}`} />
                )}
                {deliveryStatus === 'delivered' && (
                  <CheckCheck className={`text-neutral-400 ${isLarge ? 'w-3.5 h-3.5' : isCompact ? 'w-2 h-2' : 'w-2.5 h-2.5'}`} />
                )}
                {deliveryStatus === 'sent' && (
                  <Check className={`text-neutral-400 ${isLarge ? 'w-3.5 h-3.5' : isCompact ? 'w-2 h-2' : 'w-2.5 h-2.5'}`} />
                )}
                {deliveryStatus === 'queued' && (
                  <Clock className={`text-neutral-400 ${isLarge ? 'w-3 h-3' : 'w-2 h-2'}`} />
                )}
                {deliveryStatus === 'failed' && (
                  <AlertTriangle className={`text-red-500 ${isLarge ? 'w-3 h-3' : 'w-2 h-2'}`} />
                )}
              </div>
            </div>

            {/* WhatsApp CTA / Quick Reply Buttons */}
            {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
              <div
                className={`border-t border-neutral-100 dark:border-neutral-700/60 ${
                  isLarge ? 'pt-2 space-y-1.5' : isCompact ? 'pt-1 space-y-0.5' : 'pt-1.5 space-y-1'
                }`}
              >
                {buttonsComp.buttons.slice(0, 3).map((btn, idx) => {
                  const bType = (btn.type || 'QUICK_REPLY').toUpperCase();
                  return (
                    <div
                      key={idx}
                      className={`w-full rounded bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center space-x-1 transition-colors ${
                        isLarge
                          ? 'py-2 px-3 text-xs rounded-xl shadow-2xs'
                          : isCompact
                          ? 'py-0.5 px-1 text-[7px]'
                          : 'py-1 px-1.5 text-[8.5px] rounded-md'
                      }`}
                    >
                      {bType === 'URL' && (
                        <ExternalLink
                          className={isLarge ? 'w-3.5 h-3.5 shrink-0' : isCompact ? 'w-2 h-2 shrink-0' : 'w-2.5 h-2.5 shrink-0'}
                        />
                      )}
                      {bType === 'PHONE_NUMBER' && (
                        <Phone
                          className={isLarge ? 'w-3.5 h-3.5 shrink-0' : isCompact ? 'w-2 h-2 shrink-0' : 'w-2.5 h-2.5 shrink-0'}
                        />
                      )}
                      {bType === 'QUICK_REPLY' && (
                        <CornerDownLeft
                          className={isLarge ? 'w-3.5 h-3.5 shrink-0' : isCompact ? 'w-2 h-2 shrink-0' : 'w-2.5 h-2.5 shrink-0'}
                        />
                      )}
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
            isLarge ? 'p-2 space-x-2' : isCompact ? 'p-1 space-x-0.5' : 'p-1.5 space-x-1'
          }`}
        >
          {isLarge && <Smile className="w-5 h-5 text-neutral-500 shrink-0" />}
          <div
            className={`flex-1 bg-white dark:bg-neutral-800 rounded-full text-neutral-400 truncate ${
              isLarge ? 'px-3 py-1.5 text-xs' : isCompact ? 'px-1.5 py-0.2 text-[6.5px]' : 'px-2 py-0.5 text-[8px]'
            }`}
          >
            Message
          </div>
          {isLarge && <Paperclip className="w-4 h-4 text-neutral-500 shrink-0" />}
          {isLarge && <Camera className="w-4 h-4 text-neutral-500 shrink-0" />}
          <div
            className={`rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0 ${
              isLarge ? 'w-8 h-8 text-sm shadow-xs' : isCompact ? 'w-3 h-3 text-[6px]' : 'w-4 h-4 text-[7px]'
            }`}
          >
            {isLarge ? <Mic className="w-4 h-4" /> : <span>➤</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
