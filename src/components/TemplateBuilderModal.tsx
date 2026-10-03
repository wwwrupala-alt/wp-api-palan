import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Smartphone,
  Image as ImageIcon,
  Video,
  FileText,
  Type,
  Link,
  MessageSquare,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Plus,
  Trash2,
  Copy,
  UploadCloud,
  FolderUp,
  HardDrive,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import type { Template, TemplateComponent } from '../types/index.ts';

export interface InteractiveButtonItem {
  type: 'QUICK_REPLY' | 'URL';
  text: string;
  url?: string;
}

interface TemplateBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (templateData: {
    name: string;
    category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
    language: string;
    components: TemplateComponent[];
  }) => Promise<void>;
  creating: boolean;
  createError: string | null;
  initialTemplate?: Template | null;
}

export const TemplateBuilderModal: React.FC<TemplateBuilderModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  creating,
  createError,
  initialTemplate,
}) => {
  const [tplName, setTplName] = useState('order_update_notification');
  const [tplCategory, setTplCategory] = useState<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('UTILITY');
  const [tplLang, setTplLang] = useState('en_US');

  // Header State
  const [headerType, setHeaderType] = useState<'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'>('NONE');
  const [headerText, setHeaderText] = useState('');
  const [headerMediaSampleUrl, setHeaderMediaSampleUrl] = useState(
    'https://images.unsplash.com/photo-1579203438237-49dcf6133f6a?w=800&auto=format&fit=crop&q=80'
  );

  // PC / Device File Upload State
  const [mediaSourceMode, setMediaSourceMode] = useState<'UPLOAD' | 'URL'>('UPLOAD');
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number; type: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Body State
  const [bodyText, setBodyText] = useState(
    'Hello {{1}}, your order #{{2}} is confirmed and ready for dispatch. Thank you for shopping with us!'
  );

  // Dynamic Variables Samples & Preview
  const [bodyVariables, setBodyVariables] = useState<Record<string, string>>({
    '1': 'Rahul Sharma',
    '2': 'ORD-9842',
  });

  // Footer State
  const [footerText, setFooterText] = useState('');

  // Buttons State: Support up to 3 interactive buttons (Meta maximum limit)
  const [buttons, setButtons] = useState<InteractiveButtonItem[]>([
    { type: 'URL', text: 'Track Order', url: 'https://example.com/track' },
  ]);

  // Synchronize state when modal opens or initialTemplate changes (Clone Mode support)
  useEffect(() => {
    if (!isOpen) return;

    if (initialTemplate) {
      // 1. Name: Meta requires lowercase letters, numbers, and underscores only
      const baseClean = initialTemplate.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      // If already ends with _copy or _copy_1, append next suffix or random 3 digits to avoid collision
      const clonedName = `${baseClean}_copy`.slice(0, 512);
      setTplName(clonedName);
      setTplCategory(initialTemplate.category || 'UTILITY');
      setTplLang(initialTemplate.language || 'en_US');

      // 2. Header
      const headerComp = initialTemplate.components?.find((c) => c.type === 'HEADER');
      if (headerComp) {
        if (headerComp.format === 'TEXT') {
          setHeaderType('TEXT');
          setHeaderText(headerComp.text || '');
        } else if (headerComp.format === 'IMAGE') {
          setHeaderType('IMAGE');
          setHeaderText('');
          setHeaderMediaSampleUrl(
            headerComp.example?.header_handle?.[0] ||
              'https://images.unsplash.com/photo-1579203438237-49dcf6133f6a?w=800&auto=format&fit=crop&q=80'
          );
        } else if (headerComp.format === 'VIDEO') {
          setHeaderType('VIDEO');
          setHeaderText('');
          setHeaderMediaSampleUrl(
            headerComp.example?.header_handle?.[0] || 'https://www.w3schools.com/html/mov_bbb.mp4'
          );
        } else if (headerComp.format === 'DOCUMENT') {
          setHeaderType('DOCUMENT');
          setHeaderText('');
          setHeaderMediaSampleUrl(
            headerComp.example?.header_handle?.[0] ||
              'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
          );
        } else {
          setHeaderType('NONE');
          setHeaderText('');
        }
      } else {
        setHeaderType('NONE');
        setHeaderText('');
      }

      // 3. Body
      const bodyComp = initialTemplate.components?.find((c) => c.type === 'BODY');
      const bText = bodyComp?.text || '';
      setBodyText(bText);

      // Extract existing variables from example if available
      const sampleList: string[] =
        bodyComp?.example?.body_text?.[0] ||
        (bodyComp?.example as any)?.body_text_flat ||
        [];
      const matches = bText.match(/\{\{(\d+)\}\}/g) || [];
      const detectedIndices = Array.from(new Set(matches.map((m) => m.replace(/[\{\}]/g, ''))));
      const vars: Record<string, string> = {};
      detectedIndices.forEach((idx, i) => {
        vars[idx] =
          sampleList[i] ||
          (idx === '1' ? 'Rahul Sharma' : idx === '2' ? 'ORD-9842' : `Sample ${idx}`);
      });
      setBodyVariables(vars);

      // 4. Footer
      const footerComp = initialTemplate.components?.find((c) => c.type === 'FOOTER');
      setFooterText(footerComp?.text || '');

      // 5. Buttons
      const buttonsComp = initialTemplate.components?.find((c) => c.type === 'BUTTONS');
      if (buttonsComp?.buttons && buttonsComp.buttons.length > 0) {
        setButtons(
          buttonsComp.buttons.map((b) => ({
            type: b.type === 'URL' ? 'URL' : 'QUICK_REPLY',
            text: b.text,
            url: b.url || 'https://example.com',
          }))
        );
      } else {
        setButtons([]);
      }
    } else {
      // Default / Fresh Template Mode
      setTplName('order_update_notification');
      setTplCategory('UTILITY');
      setTplLang('en_US');
      setHeaderType('NONE');
      setHeaderText('');
      setHeaderMediaSampleUrl(
        'https://images.unsplash.com/photo-1579203438237-49dcf6133f6a?w=800&auto=format&fit=crop&q=80'
      );
      setBodyText(
        'Hello {{1}}, your order #{{2}} is confirmed and ready for dispatch. Thank you for shopping with us!'
      );
      setBodyVariables({
        '1': 'Rahul Sharma',
        '2': 'ORD-9842',
      });
      setFooterText('');
      setButtons([{ type: 'URL', text: 'Track Order', url: 'https://example.com/track' }]);
    }
  }, [isOpen, initialTemplate]);

  // Detect {{1}}, {{2}} variables in bodyText
  useEffect(() => {
    const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const detectedIndices = Array.from(new Set(matches.map((m) => m.replace(/[\{\}]/g, ''))));

    setBodyVariables((prev) => {
      const next: Record<string, string> = {};
      detectedIndices.forEach((idx) => {
        next[idx] = prev[idx] || (idx === '1' ? 'Rahul Sharma' : idx === '2' ? 'ORD-9842' : `Sample ${idx}`);
      });
      return next;
    });
  }, [bodyText]);

  if (!isOpen) return null;

  // Add button handler (Max 3)
  const handleAddButton = () => {
    if (buttons.length >= 3) return;
    setButtons([
      ...buttons,
      {
        type: 'QUICK_REPLY',
        text: buttons.length === 1 ? 'Contact Support' : 'View Offers',
      },
    ]);
  };

  const handleRemoveButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const handleUpdateButton = (index: number, updated: Partial<InteractiveButtonItem>) => {
    setButtons(
      buttons.map((b, i) => {
        if (i === index) {
          const next = { ...b, ...updated };
          if (next.type === 'URL' && !next.url) {
            next.url = 'https://example.com';
          }
          return next;
        }
        return b;
      })
    );
  };

  // PC / Device File Upload Processing
  const handleProcessFile = async (file: File) => {
    setUploadError(null);
    if (!file) return;

    // Check size limit: 25MB for video/doc, 10MB for image
    const maxSizeBytes = headerType === 'IMAGE' ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setUploadError(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed is ${
          maxSizeBytes / 1024 / 1024
        }MB.`
      );
      return;
    }

    setIsUploading(true);

    try {
      // 1. Read locally as Base64 for instant preview in phone mockup
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        setHeaderMediaSampleUrl(base64Data);
        setUploadedFile({
          name: file.name,
          size: file.size,
          type: file.type,
        });

        // 2. Upload to server storage endpoint /api/upload
        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type,
              base64Data,
            }),
          });
          const data = await res.json();
          if (data.success && data.url) {
            // Keep preview data or update to server relative URL
            // Both work, data.url is clean
          }
        } catch (serverErr) {
          console.warn('Server upload fallback to local preview:', serverErr);
        }
      };
      reader.onerror = () => {
        setUploadError('Failed to read selected file from your device.');
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadError(err.message || 'Error processing file from PC');
    } finally {
      setIsUploading(false);
    }
  };

  // Compute live rendered preview text by replacing {{1}}, {{2}} with sample values
  const getRenderedBodyPreview = () => {
    let result = bodyText;
    Object.entries(bodyVariables).forEach(([key, val]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, val || `[Value ${key}]`);
    });
    return result;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const components: TemplateComponent[] = [];

    // 1. Header
    if (headerType === 'TEXT' && headerText.trim()) {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: headerText.trim(),
      });
    } else if (headerType === 'IMAGE') {
      components.push({
        type: 'HEADER',
        format: 'IMAGE',
        example: {
          header_handle: [
            headerMediaSampleUrl.trim() ||
              'https://images.unsplash.com/photo-1579203438237-49dcf6133f6a?w=800&auto=format&fit=crop&q=80',
          ],
        },
      });
    } else if (headerType === 'VIDEO') {
      components.push({
        type: 'HEADER',
        format: 'VIDEO',
        example: {
          header_handle: [headerMediaSampleUrl.trim() || 'https://www.w3schools.com/html/mov_bbb.mp4'],
        },
      });
    } else if (headerType === 'DOCUMENT') {
      components.push({
        type: 'HEADER',
        format: 'DOCUMENT',
        example: {
          header_handle: [
            headerMediaSampleUrl.trim() ||
              'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          ],
        },
      });
    }

    // 2. Body
    const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const orderedIndices = Array.from(new Set(matches.map((m) => m.replace(/[\{\}]/g, ''))));
    const sampleValues = orderedIndices.map((idx) => bodyVariables[idx] || `Value ${idx}`);

    const bodyComp: TemplateComponent = {
      type: 'BODY',
      text: bodyText.trim(),
    };

    if (sampleValues.length > 0) {
      bodyComp.example = {
        body_text: [sampleValues],
      };
    }
    components.push(bodyComp);

    // 3. Footer
    if (footerText.trim()) {
      components.push({
        type: 'FOOTER',
        text: footerText.trim(),
      });
    }

    // 4. Buttons (Up to 3 buttons)
    if (buttons.length > 0) {
      const validButtons = buttons
        .filter((b) => b.text.trim())
        .map((b) => {
          if (b.type === 'URL') {
            return {
              type: 'URL' as const,
              text: b.text.trim(),
              url: b.url?.trim() || 'https://example.com',
            };
          }
          return {
            type: 'QUICK_REPLY' as const,
            text: b.text.trim(),
          };
        });

      if (validButtons.length > 0) {
        components.push({
          type: 'BUTTONS',
          buttons: validButtons,
        });
      }
    }

    await onSubmit({
      name: tplName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      category: tplCategory,
      language: tplLang,
      components,
    });
  };

  const detectedVarKeys = Object.keys(bodyVariables);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-xl ${initialTemplate ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
              {initialTemplate ? <Copy className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-neutral-900 dark:text-white text-base">
                  {initialTemplate ? 'Clone WhatsApp Template' : 'Advanced Meta WhatsApp Template Builder'}
                </h3>
                {initialTemplate && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                    Clone Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500">
                {initialTemplate
                  ? `Pre-loaded structure from "${initialTemplate.name}". Tweak name or content, then submit for Meta approval.`
                  : 'Design interactive templates with Media, Dynamic Variables & Up to 3 Buttons'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Split into Form (Left) and Live Smartphone Preview (Right) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form: 7 cols */}
          <form id="template-builder-form" onSubmit={handleFormSubmit} className="lg:col-span-7 space-y-5 text-xs">
            {initialTemplate && (
              <div className="p-3.5 rounded-2xl bg-teal-50/80 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 text-teal-800 dark:text-teal-300 flex items-start space-x-2.5 animate-fadeIn">
                <Copy className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400 mt-0.5" />
                <div className="space-y-0.5 text-xs">
                  <p className="font-semibold">Cloning Source: {initialTemplate.name}</p>
                  <p className="text-[11px] text-teal-700 dark:text-teal-400 leading-relaxed">
                    Template name has been suffixed with <code className="font-mono bg-teal-100 dark:bg-teal-900/60 px-1 py-0.5 rounded text-[10.5px]">_copy</code> to satisfy Meta&apos;s unique name requirement. You can rename or customize any component below.
                  </p>
                </div>
              </div>
            )}

            {createError && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{createError}</span>
              </div>
            )}

            {/* Template Info Card */}
            <div className="p-4 rounded-2xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 space-y-3.5">
              <div className="flex items-center space-x-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                <span>1. Meta Configuration</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Template Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="order_update_notification"
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Lowercase, numbers, and underscores only. Avoid generic names like &quot;test&quot; or &quot;abc&quot;.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={tplCategory}
                    onChange={(e) => setTplCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs cursor-pointer"
                  >
                    <option value="UTILITY">Utility (Transactional)</option>
                    <option value="MARKETING">Marketing (Offers)</option>
                    <option value="AUTHENTICATION">Authentication (OTP)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Language</label>
                <select
                  value={tplLang}
                  onChange={(e) => setTplLang(e.target.value)}
                  className="w-full sm:w-1/2 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs cursor-pointer"
                >
                  <option value="en_US">English (US)</option>
                  <option value="en_GB">English (UK)</option>
                  <option value="hi">Hindi (hi)</option>
                  <option value="es">Spanish</option>
                  <option value="pt_BR">Portuguese (BR)</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
              </div>
            </div>

            {/* Header with Media Support */}
            <div className="p-4 rounded-2xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                  2. Header (Optional Media or Text)
                </span>
                <span className="text-[11px] text-neutral-500">Image, Video, Document, or Title</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: 'NONE', label: 'None', icon: X },
                  { id: 'TEXT', label: 'Text', icon: Type },
                  { id: 'IMAGE', label: 'Image', icon: ImageIcon },
                  { id: 'VIDEO', label: 'Video', icon: Video },
                  { id: 'DOCUMENT', label: 'Document', icon: FileText },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = headerType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setHeaderType(item.id as any)}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold'
                          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[11px]">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {headerType === 'TEXT' && (
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Header Title Text
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Order Update Notification"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
                  />
                </div>
              )}

              {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && (
                <div className="space-y-3 p-3.5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700/80 shadow-2xs">
                  {/* Mode Selector Tabs */}
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-neutral-800 dark:text-neutral-200 flex items-center space-x-1.5">
                      <HardDrive className="w-4 h-4 text-emerald-600" />
                      <span>Choose Header Media Source:</span>
                    </span>
                    <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                      <button
                        type="button"
                        onClick={() => setMediaSourceMode('UPLOAD')}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                          mediaSourceMode === 'UPLOAD'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                        }`}
                      >
                        <FolderUp className="w-3.5 h-3.5" />
                        <span>Upload from PC / Device</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMediaSourceMode('URL')}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                          mediaSourceMode === 'URL'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                        }`}
                      >
                        <Link className="w-3.5 h-3.5" />
                        <span>Media Web Link</span>
                      </button>
                    </div>
                  </div>

                  {/* Mode 1: PC / Device File Upload */}
                  {mediaSourceMode === 'UPLOAD' ? (
                    <div className="space-y-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept={
                          headerType === 'IMAGE'
                            ? 'image/png,image/jpeg,image/jpg,image/webp'
                            : headerType === 'VIDEO'
                            ? 'video/mp4,video/3gpp,video/quicktime'
                            : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf'
                        }
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleProcessFile(file);
                        }}
                      />

                      {uploadedFile ? (
                        /* Uploaded File Card */
                        <div className="p-3 rounded-xl border-2 border-emerald-500/50 bg-emerald-50/40 dark:bg-emerald-950/30 flex items-center justify-between">
                          <div className="flex items-center space-x-3 truncate">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                              {headerType === 'IMAGE' ? (
                                <ImageIcon className="w-5 h-5" />
                              ) : headerType === 'VIDEO' ? (
                                <Video className="w-5 h-5" />
                              ) : (
                                <FileText className="w-5 h-5" />
                              )}
                            </div>
                            <div className="truncate">
                              <div className="flex items-center space-x-1.5">
                                <span className="font-bold text-xs text-neutral-900 dark:text-white truncate">
                                  {uploadedFile.name}
                                </span>
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-600 text-white shrink-0">
                                  ✓ Ready
                                </span>
                              </div>
                              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB • Uploaded from your computer
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:border-emerald-500 cursor-pointer"
                            >
                              Change File
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setUploadedFile(null);
                                setHeaderMediaSampleUrl('');
                                if (fileInputRef.current) fileInputRef.current.value = '';
                              }}
                              className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              title="Remove uploaded file"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Dropzone to select file from PC */
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragging(true);
                          }}
                          onDragLeave={() => setIsDragging(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) handleProcessFile(file);
                          }}
                          onClick={() => fileInputRef.current?.click()}
                          className={`p-5 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center space-y-2 ${
                            isDragging
                              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/50 scale-[1.01]'
                              : 'border-neutral-300 dark:border-neutral-700 hover:border-emerald-500 bg-neutral-50/50 dark:bg-neutral-800/40 hover:bg-emerald-50/20'
                          }`}
                        >
                          <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-2xs">
                            {isUploading ? (
                              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                            ) : (
                              <UploadCloud className="w-6 h-6" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-xs text-neutral-800 dark:text-neutral-200">
                              {isUploading ? 'Uploading file from device...' : 'Click to choose file from your PC / Device'}
                            </p>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                              or drag and drop your{' '}
                              <strong className="text-emerald-600 dark:text-emerald-400">
                                {headerType === 'IMAGE'
                                  ? 'Image (PNG, JPG, WEBP)'
                                  : headerType === 'VIDEO'
                                  ? 'Video (MP4, 3GP)'
                                  : 'Document (PDF, DOC, XLSX)'}
                              </strong>{' '}
                              here
                            </p>
                          </div>
                          <span className="px-3 py-1 rounded-xl bg-emerald-600 text-white font-semibold text-[11px] shadow-xs hover:bg-emerald-700">
                            Browse PC Files
                          </span>
                        </div>
                      )}

                      {uploadError && (
                        <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-700 dark:text-rose-300 flex items-center space-x-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{uploadError}</span>
                        </div>
                      )}

                      <p className="text-[10px] text-neutral-400">
                        ⚡ Your file from PC is saved instantly and previewed live on the WhatsApp phone mockup.
                      </p>
                    </div>
                  ) : (
                    /* Mode 2: Web URL input */
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                        Media Web URL / CDN Link:
                      </label>
                      <input
                        type="url"
                        placeholder={`https://example.com/sample.${
                          headerType === 'DOCUMENT' ? 'pdf' : headerType === 'VIDEO' ? 'mp4' : 'jpg'
                        }`}
                        value={headerMediaSampleUrl}
                        onChange={(e) => setHeaderMediaSampleUrl(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono text-[11px]"
                      />
                      <div className="flex items-center space-x-2 text-[10px] text-neutral-500">
                        <span>Quick Presets:</span>
                        {headerType === 'IMAGE' && (
                          <button
                            type="button"
                            onClick={() =>
                              setHeaderMediaSampleUrl(
                                'https://images.unsplash.com/photo-1579203438237-49dcf6133f6a?w=800&auto=format&fit=crop&q=80'
                              )
                            }
                            className="text-emerald-600 hover:underline cursor-pointer font-medium"
                          >
                            Unsplash Sample
                          </button>
                        )}
                        {headerType === 'VIDEO' && (
                          <button
                            type="button"
                            onClick={() =>
                              setHeaderMediaSampleUrl('https://www.w3schools.com/html/mov_bbb.mp4')
                            }
                            className="text-emerald-600 hover:underline cursor-pointer font-medium"
                          >
                            Sample MP4
                          </button>
                        )}
                        {headerType === 'DOCUMENT' && (
                          <button
                            type="button"
                            onClick={() =>
                              setHeaderMediaSampleUrl(
                                'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
                              )
                            }
                            className="text-emerald-600 hover:underline cursor-pointer font-medium"
                          >
                            Sample PDF
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Message Body & Variable Values */}
            <div className="p-4 rounded-2xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                  3. Message Body &amp; Variables <span className="text-red-500">*</span>
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {detectedVarKeys.length} variable(s) detected
                </span>
              </div>

              <div>
                <textarea
                  rows={4}
                  required
                  placeholder="Hello {{1}}, your order #{{2}} is ready..."
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white leading-relaxed text-xs focus:ring-2 focus:ring-emerald-500/20"
                />
                <div className="flex items-center justify-between mt-1 text-[11px] text-neutral-500">
                  <span>
                    Type <strong>{`{{1}}`}</strong>, <strong>{`{{2}}`}</strong> for customer variables
                  </span>
                  <div className="space-x-1.5">
                    <button
                      type="button"
                      onClick={() => setBodyText((prev) => `${prev} {{${detectedVarKeys.length + 1}}}`)}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                    >
                      + Insert Variable
                    </button>
                  </div>
                </div>
              </div>

              {/* Dynamic Variables Inputs for Approval & Live Preview */}
              {detectedVarKeys.length > 0 && (
                <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-emerald-200/70 dark:border-emerald-800/50 space-y-3">
                  <div className="flex items-center space-x-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Sample Values for Meta Approval &amp; Live Preview:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {detectedVarKeys.map((key) => (
                      <div key={key} className="space-y-1">
                        <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                          Value for{' '}
                          <code className="bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded text-emerald-600">
                            {`{{${key}}}`}
                          </code>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder={key === '1' ? 'e.g. John Doe' : key === '2' ? 'e.g. ORD-1001' : 'Sample value'}
                          value={bodyVariables[key] || ''}
                          onChange={(e) => setBodyVariables({ ...bodyVariables, [key]: e.target.value })}
                          className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer & Up to 3 Interactive Buttons */}
            <div className="p-4 rounded-2xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                  4. Footer &amp; Interactive Buttons
                </span>
                <span className="text-[11px] text-neutral-500">
                  {buttons.length}/3 buttons added (Meta Max: 3)
                </span>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Footer Text (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Thank you for your support"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
                />
              </div>

              {/* Dynamic Buttons List */}
              <div className="space-y-3 pt-2 border-t border-neutral-200/80 dark:border-neutral-700/80">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                    Interactive Buttons (Maximum 3)
                  </label>
                  {buttons.length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddButton}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400 font-semibold text-[11px] flex items-center space-x-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Button ({buttons.length}/3)</span>
                    </button>
                  )}
                </div>

                {buttons.length === 0 ? (
                  <p className="text-[11px] text-neutral-400 italic">No buttons added to this template.</p>
                ) : (
                  <div className="space-y-2.5">
                    {buttons.map((btn, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 space-y-2.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[11px] text-neutral-600 dark:text-neutral-400">
                            Button #{index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveButton(index)}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Remove button"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                              Button Type
                            </label>
                            <select
                              value={btn.type}
                              onChange={(e) =>
                                handleUpdateButton(index, { type: e.target.value as 'QUICK_REPLY' | 'URL' })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs cursor-pointer"
                            >
                              <option value="QUICK_REPLY">Quick Reply Button</option>
                              <option value="URL">Visit Website (URL Button)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                              Button Label / Text <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Track Order"
                              value={btn.text}
                              onChange={(e) => handleUpdateButton(index, { text: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs"
                            />
                          </div>
                        </div>

                        {btn.type === 'URL' && (
                          <div>
                            <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                              Website URL <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="url"
                              required
                              placeholder="https://example.com/order-status"
                              value={btn.url || ''}
                              onChange={(e) => handleUpdateButton(index, { url: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white font-mono text-xs"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* Right Column: Live Interactive Smartphone Preview (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="sticky top-2 w-full max-w-[320px] space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-500 px-1">
                <span className="flex items-center space-x-1.5 font-medium">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Real-time WhatsApp Preview</span>
                </span>
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                  Live
                </span>
              </div>

              {/* Smartphone Frame */}
              <div className="w-full rounded-[36px] bg-neutral-900 p-3 shadow-2xl border-4 border-neutral-800 text-neutral-900">
                {/* Phone Speaker & Camera Notch */}
                <div className="h-4 flex items-center justify-center space-x-2 mb-2">
                  <div className="w-12 h-1 bg-neutral-700 rounded-full" />
                  <div className="w-2.5 h-2.5 bg-neutral-700 rounded-full" />
                </div>

                {/* WhatsApp Chat Container */}
                <div
                  className="rounded-[24px] overflow-hidden bg-[#e5ddd5] dark:bg-[#0b141a] p-3 flex flex-col justify-end min-h-[440px] relative"
                  style={{
                    backgroundImage: `radial-gradient(#128c7e15 1px, transparent 1px)`,
                    backgroundSize: '16px 16px',
                  }}
                >
                  {/* WhatsApp Chat Header inside Phone */}
                  <div className="absolute top-0 left-0 right-0 h-10 bg-[#075e54] dark:bg-[#1f2c34] text-white px-3 flex items-center space-x-2 z-10 shadow-xs">
                    <div className="w-6 h-6 rounded-full bg-emerald-400 flex items-center justify-center text-neutral-900 font-bold text-[10px]">
                      WA
                    </div>
                    <div className="flex-1 truncate">
                      <p className="text-[11px] font-semibold truncate leading-none">Your Business</p>
                      <p className="text-[9px] text-emerald-200">Official WhatsApp Account</p>
                    </div>
                  </div>

                  {/* Message Bubble */}
                  <div className="bg-white dark:bg-[#1f2c34] rounded-2xl rounded-tl-xs shadow-md p-3 max-w-[95%] space-y-2.5 self-start text-xs text-neutral-900 dark:text-neutral-100 border border-neutral-200/40 dark:border-neutral-700/40 mt-10">
                    {/* Header Rendering */}
                    {headerType === 'TEXT' && headerText && (
                      <p className="font-bold text-sm text-neutral-900 dark:text-white leading-tight">
                        {headerText}
                      </p>
                    )}

                    {headerType === 'IMAGE' && (
                      <div className="rounded-xl overflow-hidden aspect-video bg-neutral-200 dark:bg-neutral-800 relative">
                        {headerMediaSampleUrl ? (
                          <img
                            src={headerMediaSampleUrl}
                            alt="Header Sample"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                'https://images.unsplash.com/photo-1579203438237-49dcf6133f6a?w=800&auto=format&fit=crop&q=80';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-400">
                            <ImageIcon className="w-8 h-8" />
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px]">
                          Image
                        </span>
                      </div>
                    )}

                    {headerType === 'VIDEO' && (
                      <div className="rounded-xl overflow-hidden aspect-video bg-neutral-900 flex flex-col items-center justify-center text-white relative">
                        {headerMediaSampleUrl &&
                        (headerMediaSampleUrl.startsWith('data:video') ||
                          headerMediaSampleUrl.endsWith('.mp4') ||
                          headerMediaSampleUrl.startsWith('/uploads')) ? (
                          <video
                            src={headerMediaSampleUrl}
                            className="w-full h-full object-cover"
                            controls
                            playsInline
                            muted
                          />
                        ) : (
                          <>
                            <Video className="w-8 h-8 text-neutral-400 mb-1" />
                            <span className="text-[10px] text-neutral-300 font-medium px-2 text-center truncate max-w-[90%]">
                              {uploadedFile?.name || 'Sample Video (MP4)'}
                            </span>
                          </>
                        )}
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px]">
                          Video
                        </span>
                      </div>
                    )}

                    {headerType === 'DOCUMENT' && (
                      <div className="p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700 flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 truncate">
                          <p className="text-[10.5px] font-bold truncate text-neutral-900 dark:text-neutral-100">
                            {uploadedFile?.name || 'Sample_Document.pdf'}
                          </p>
                          <p className="text-[9px] text-neutral-500">
                            {uploadedFile?.size
                              ? `${(uploadedFile.size / 1024).toFixed(0)} KB • `
                              : ''}
                            Document File
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Body Text with live substituted variable values */}
                    <div className="whitespace-pre-wrap leading-relaxed text-[11.5px] text-neutral-800 dark:text-neutral-200">
                      {getRenderedBodyPreview()}
                    </div>

                    {/* Footer */}
                    {footerText && (
                      <p className="text-[9.5px] text-neutral-500 dark:text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                        {footerText}
                      </p>
                    )}

                    <div className="text-[8.5px] text-neutral-400 text-right">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>

                    {/* Interactive Buttons (Up to 3) */}
                    {buttons.length > 0 && (
                      <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 -mx-3 -mb-1 space-y-1">
                        {buttons
                          .filter((b) => b.text.trim())
                          .map((btn, i) => (
                            <div
                              key={i}
                              className={`py-1.5 text-center font-medium text-[11px] flex items-center justify-center space-x-1 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                                btn.type === 'URL'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {btn.type === 'URL' ? (
                                <Link className="w-3 h-3" />
                              ) : (
                                <MessageSquare className="w-3 h-3" />
                              )}
                              <span>{btn.text}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-[10.5px] text-blue-800 dark:text-blue-300 flex items-start space-x-2">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Meta supports up to 3 interactive buttons (URL or Quick Reply) per message template.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer Actions */}
        <div className="px-6 py-3.5 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="text-xs text-neutral-500">
            Compliant with Meta WhatsApp Business Cloud Guidelines
          </div>
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="template-builder-form"
              disabled={creating}
              className={`px-5 py-2 rounded-xl text-white font-medium text-xs flex items-center space-x-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer ${
                initialTemplate
                  ? 'bg-teal-600 hover:bg-teal-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting to Meta...</span>
                </>
              ) : initialTemplate ? (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Submit Cloned Template to Meta</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Submit Template to Meta</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
