import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export type ToastType = 'error' | 'success' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
  duration?: number;
  code?: string;
  details?: unknown;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, 'id'>) => string;
  showError: (title: string, error?: unknown, options?: Partial<ToastItem>) => string;
  showSuccess: (title: string, message?: string, options?: Partial<ToastItem>) => string;
  showWarning: (title: string, message?: string, options?: Partial<ToastItem>) => string;
  showInfo: (title: string, message?: string, options?: Partial<ToastItem>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Parses raw API error structures (e.g. Meta Graph API errors, Express server errors, Network errors)
 * into a clear, descriptive, human-friendly message and optional technical details.
 */
export function formatApiError(rawError: unknown): { title: string; message: string; code?: string; details?: unknown } {
  if (!rawError) {
    return {
      title: 'Action Failed',
      message: 'An unexpected error occurred while communicating with the server.',
    };
  }

  // If already a string
  if (typeof rawError === 'string') {
    return translateKnownMetaError(rawError);
  }

  // If standard Error
  if (rawError instanceof Error) {
    return translateKnownMetaError(rawError.message);
  }

  // If an object with fields (from res.json() or Axios/Fetch)
  if (typeof rawError === 'object') {
    const obj = rawError as Record<string, unknown>;
    const code = (obj.code as string) || (obj.error_subcode ? `SUB_${obj.error_subcode}` : undefined);

    // Meta Graph API error object: { error: { message, type, code, error_subcode, fbtrace_id } }
    if (obj.error && typeof obj.error === 'object') {
      const metaErr = obj.error as Record<string, unknown>;
      const metaMsg = typeof metaErr.message === 'string' ? metaErr.message : JSON.stringify(metaErr);
      const metaCode = metaErr.code ? `Meta Error ${metaErr.code}` : code;
      const formatted = translateKnownMetaError(metaMsg, metaCode);
      return {
        ...formatted,
        code: metaCode,
        details: metaErr,
      };
    }

    // Direct error string property: { error: "Meta authorization failed" }
    if (typeof obj.error === 'string') {
      return translateKnownMetaError(obj.error, code);
    }

    // Direct message property: { message: "Invalid OAuth access token" }
    if (typeof obj.message === 'string') {
      return translateKnownMetaError(obj.message, code);
    }

    // Diagnostics with error array
    if (Array.isArray(obj.errors) && obj.errors.length > 0) {
      return translateKnownMetaError(obj.errors.join(' | '), code);
    }
  }

  return {
    title: 'Request Failed',
    message: 'Could not complete the API request. Please verify your connection and credentials.',
  };
}

function translateKnownMetaError(rawMsg: string, code?: string): { title: string; message: string; code?: string } {
  const lower = rawMsg.toLowerCase();

  if (lower.includes('invalid oauth access token') || lower.includes('session has expired') || lower.includes('authorization failed')) {
    return {
      title: 'Meta Authorization Failed',
      message: 'The Meta System User Access Token has expired or lacks permissions. Please generate a fresh token in Meta Business Manager with whatsapp_business_messaging permissions.',
      code: code || 'OAUTH_INVALID',
    };
  }

  if (lower.includes('unsupported get request') || lower.includes('does not exist')) {
    return {
      title: 'WhatsApp Resource Not Found',
      message: 'The Phone Number ID or WABA ID does not exist in your Meta Business portfolio or is not accessible with this access token.',
      code: code || 'OBJECT_NOT_FOUND',
    };
  }

  if (lower.includes('rate limit') || lower.includes('calls to this api have exceeded')) {
    return {
      title: 'Meta Rate Limit Reached',
      message: 'Meta API request threshold reached. Please wait 1-2 minutes before retrying broadcast or verification calls.',
      code: code || 'RATE_LIMITED',
    };
  }

  if (lower.includes('two-step verification') || lower.includes('pin')) {
    return {
      title: 'Meta PIN Verification Needed',
      message: 'This WhatsApp phone number requires its 6-digit Two-Step Verification PIN to be registered with Meta.',
      code: code || 'PIN_REQUIRED',
    };
  }

  if (lower.includes('failed to fetch') || lower.includes('network error') || lower.includes('networkrequestfailed')) {
    return {
      title: 'Network Communication Error',
      message: 'Unable to reach the server or Meta API. Please check your internet connectivity.',
      code: code || 'NETWORK_ERROR',
    };
  }

  if (lower.includes('missing permission') || lower.includes('permission denied') || lower.includes('whatsapp_business_management')) {
    return {
      title: 'Meta Permissions Missing',
      message: 'Your token is missing required permissions (whatsapp_business_management and whatsapp_business_messaging). Please re-generate token with full permissions in Meta App settings.',
      code: code || 'PERMISSIONS_MISSING',
    };
  }

  if (lower.includes('unexpected token') || lower.includes('is not valid json') || lower.includes('the page c')) {
    return {
      title: 'Server Backend Route Offline',
      message: 'The backend server returned an HTML error page instead of JSON. The server route has now been configured to handle API requests properly. Please try submitting again.',
      code: code || 'SERVER_OFFLINE',
    };
  }

  if (lower.includes('unexpected key') || (lower.includes('param') && lower.includes('template.components'))) {
    return {
      title: 'Template Parameters Formatted',
      message: 'Meta WhatsApp templates only require variable values when sending. Definition fields have been sanitized automatically.',
      code: code || 'TEMPLATE_PAYLOAD_MISMATCH',
    };
  }

  return {
    title: 'API Error',
    message: rawMsg,
    code,
  };
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastItem, 'id'>): string => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const duration = toast.duration ?? (toast.type === 'error' ? 8000 : 5000);

      const newToast: ToastItem = {
        ...toast,
        id,
        duration,
      };

      setToasts((prev) => [newToast, ...prev].slice(0, 5)); // Keep max 5 visible toasts

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast]
  );

  const showError = useCallback(
    (titleOrRaw: string, error?: unknown, options?: Partial<ToastItem>): string => {
      let finalTitle = titleOrRaw;
      let finalMessage = options?.message || '';
      let code = options?.code;
      let details = options?.details;

      if (error) {
        const parsed = formatApiError(error);
        if (titleOrRaw === 'API Error' || !titleOrRaw) {
          finalTitle = parsed.title;
        }
        finalMessage = parsed.message || (typeof error === 'string' ? error : 'Request could not be processed');
        code = code || parsed.code;
        details = details || parsed.details;
      } else if (!finalMessage) {
        const parsed = formatApiError(titleOrRaw);
        finalTitle = parsed.title;
        finalMessage = parsed.message;
        code = code || parsed.code;
      }

      return showToast({
        title: finalTitle,
        message: finalMessage,
        type: 'error',
        code,
        details,
        ...options,
      });
    },
    [showToast]
  );

  const showSuccess = useCallback(
    (title: string, message?: string, options?: Partial<ToastItem>): string => {
      return showToast({
        title,
        message,
        type: 'success',
        ...options,
      });
    },
    [showToast]
  );

  const showWarning = useCallback(
    (title: string, message?: string, options?: Partial<ToastItem>): string => {
      return showToast({
        title,
        message,
        type: 'warning',
        ...options,
      });
    },
    [showToast]
  );

  const showInfo = useCallback(
    (title: string, message?: string, options?: Partial<ToastItem>): string => {
      return showToast({
        title,
        message,
        type: 'info',
        ...options,
      });
    },
    [showToast]
  );

  const value = useMemo(
    () => ({
      toasts,
      showToast,
      showError,
      showSuccess,
      showWarning,
      showInfo,
      removeToast,
      clearToasts,
    }),
    [toasts, showToast, showError, showSuccess, showWarning, showInfo, removeToast, clearToasts]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

/**
 * Toast Container positioned in the top-right viewport
 */
const ToastContainer: React.FC<{
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-[9999] flex flex-col space-y-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onRemove={() => onRemove(toast.id)} />
      ))}
    </div>
  );
};

const ToastCard: React.FC<{
  toast: ToastItem;
  onRemove: () => void;
}> = ({ toast, onRemove }) => {
  const [expanded, setExpanded] = useState(false);

  const styles = {
    error: {
      bg: 'bg-white dark:bg-neutral-900 border-red-200 dark:border-red-900/60 shadow-lg shadow-red-500/10',
      iconBg: 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400',
      title: 'text-red-950 dark:text-red-200 font-semibold',
      body: 'text-neutral-700 dark:text-neutral-300',
      badge: 'bg-red-50 dark:bg-red-950/80 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
      icon: AlertCircle,
    },
    success: {
      bg: 'bg-white dark:bg-neutral-900 border-emerald-200 dark:border-emerald-900/60 shadow-lg shadow-emerald-500/10',
      iconBg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
      title: 'text-emerald-950 dark:text-emerald-200 font-semibold',
      body: 'text-neutral-700 dark:text-neutral-300',
      badge: 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      icon: CheckCircle2,
    },
    warning: {
      bg: 'bg-white dark:bg-neutral-900 border-amber-200 dark:border-amber-900/60 shadow-lg shadow-amber-500/10',
      iconBg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
      title: 'text-amber-950 dark:text-amber-200 font-semibold',
      body: 'text-neutral-700 dark:text-neutral-300',
      badge: 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      icon: AlertTriangle,
    },
    info: {
      bg: 'bg-white dark:bg-neutral-900 border-blue-200 dark:border-blue-900/60 shadow-lg shadow-blue-500/10',
      iconBg: 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400',
      title: 'text-blue-950 dark:text-blue-200 font-semibold',
      body: 'text-neutral-700 dark:text-neutral-300',
      badge: 'bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      icon: Info,
    },
  }[toast.type];

  const IconComponent = styles.icon;

  return (
    <div
      role="alert"
      className={`pointer-events-auto rounded-2xl border p-4 transition-all duration-300 transform translate-y-0 ${styles.bg} backdrop-blur-md`}
    >
      <div className="flex items-start space-x-3">
        <div className={`p-2 rounded-xl shrink-0 ${styles.iconBg}`}>
          <IconComponent className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center space-x-2">
            <h4 className={`text-sm ${styles.title}`}>{toast.title}</h4>
            {toast.code && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${styles.badge}`}>
                {toast.code}
              </span>
            )}
          </div>

          {toast.message && (
            <p className={`text-xs mt-1 leading-relaxed ${styles.body}`}>
              {toast.message}
            </p>
          )}

          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-2 text-xs font-semibold underline hover:no-underline flex items-center space-x-1 cursor-pointer text-emerald-600 dark:text-emerald-400"
            >
              <span>{toast.action.label}</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}

          {toast.details ? (
            <div className="mt-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[11px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 flex items-center space-x-1 cursor-pointer"
              >
                <span>{expanded ? 'Hide Technical Details' : 'View Technical Details'}</span>
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {expanded && (
                <div className="mt-1.5 p-2 rounded-lg bg-neutral-900 text-neutral-200 font-mono text-[10px] overflow-x-auto max-h-36">
                  <pre>{JSON.stringify(toast.details, null, 2)}</pre>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <button
          onClick={onRemove}
          className="shrink-0 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
