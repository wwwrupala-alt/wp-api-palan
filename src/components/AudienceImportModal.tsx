import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  ClipboardPaste,
  FileSpreadsheet,
  Users,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Download,
  Plus,
  Trash2,
  Sparkles,
  ArrowRight,
  Loader2,
  Tag,
  Check,
  Search,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Contact, ContactGroup } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import { bulkAddOrUpdateContacts, addGroup } from '../lib/services.ts';

interface AudienceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  groups: ContactGroup[];
  allContacts: Contact[];
  initialGroupId?: string | null;
  initialMode?: 'paste' | 'excel';
  onSuccess?: () => void;
}

export const AudienceImportModal: React.FC<AudienceImportModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  groups,
  allContacts,
  initialGroupId,
  initialMode = 'excel',
  onSuccess,
}) => {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'excel' | 'paste' | 'existing'>(
    initialMode === 'paste' ? 'paste' : 'excel'
  );

  // Target Group Selection or Creation
  const [targetGroupName, setTargetGroupName] = useState<string>(
    initialGroupId || (groups.length > 0 ? groups[0].name : '')
  );
  const [createNewGroupMode, setCreateNewGroupMode] = useState(false);
  const [newGroupInput, setNewGroupInput] = useState('');

  // Default Country Code
  const [defaultCountryCode, setDefaultCountryCode] = useState('+91');

  // Opt-in Status
  const [importOptIn, setImportOptIn] = useState<'opted_in' | 'pending' | 'opted_out'>('opted_in');

  // Loading / Processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);

  // -------------------------------------------------------------
  // TAB 1: EXCEL / CSV IMPORT STATE
  // -------------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  // Column Mapping
  const [phoneCol, setPhoneCol] = useState<string>('');
  const [nameCol, setNameCol] = useState<string>('');
  const [emailCol, setEmailCol] = useState<string>('');
  // Mapping of other columns to variable keys: { "InvoiceNo": "var1", "Amount": "var2" }
  const [variableMappings, setVariableMappings] = useState<Record<string, string>>({});

  // -------------------------------------------------------------
  // TAB 2: MANUAL COPY-PASTE STATE
  // -------------------------------------------------------------
  const [pasteText, setPasteText] = useState('');

  // -------------------------------------------------------------
  // TAB 3: EXISTING CONTACTS PICKER STATE
  // -------------------------------------------------------------
  const [existingSearch, setExistingSearch] = useState('');
  const [selectedExistingIds, setSelectedExistingIds] = useState<string[]>([]);

  // Sync initial target group if changed
  React.useEffect(() => {
    if (initialGroupId) {
      setTargetGroupName(initialGroupId);
    } else if (groups.length > 0 && !targetGroupName) {
      setTargetGroupName(groups[0].name);
    }
  }, [initialGroupId, groups]);

  // -------------------------------------------------------------
  // EXCEL PARSING LOGIC (Using SheetJS)
  // -------------------------------------------------------------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseSpreadsheet(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) parseSpreadsheet(file);
  };

  const parseSpreadsheet = async (file: File) => {
    setSelectedFile(file);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      setSheetNames(workbook.SheetNames);
      const firstSheet = workbook.SheetNames[0];
      setSelectedSheet(firstSheet);
      processSheet(workbook, firstSheet);
    } catch (err: any) {
      toast.showError('File Read Error', err?.message || 'Could not parse spreadsheet file.');
    }
  };

  const processSheet = (workbook: XLSX.WorkBook, sheetName: string) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;

    // Convert sheet to json array of objects
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    if (!jsonData || jsonData.length === 0) {
      toast.showWarning('Empty Sheet', 'No data rows found in this sheet.');
      setRawRows([]);
      setHeaders([]);
      return;
    }

    setRawRows(jsonData);
    const discoveredHeaders = Object.keys(jsonData[0] || {});
    setHeaders(discoveredHeaders);

    // Auto-detect columns intelligently
    let detectedPhone = '';
    let detectedName = '';
    let detectedEmail = '';
    const initialVarMap: Record<string, string> = {};
    let varCounter = 1;

    for (const h of discoveredHeaders) {
      const cleanH = h.toLowerCase().trim();
      if (!detectedPhone && (cleanH.includes('phone') || cleanH.includes('mobile') || cleanH.includes('contact') || cleanH.includes('whatsapp') || cleanH.includes('cell') || cleanH.includes('tel') || cleanH === 'no' || cleanH === 'number')) {
        detectedPhone = h;
      } else if (!detectedName && (cleanH.includes('name') || cleanH.includes('customer') || cleanH.includes('client') || cleanH.includes('user'))) {
        detectedName = h;
      } else if (!detectedEmail && (cleanH.includes('email') || cleanH.includes('mail'))) {
        detectedEmail = h;
      } else {
        // Auto-assign as variable
        initialVarMap[h] = `var${varCounter}`;
        varCounter++;
      }
    }

    setPhoneCol(detectedPhone || discoveredHeaders[0] || '');
    setNameCol(detectedName || '');
    setEmailCol(detectedEmail || '');
    setVariableMappings(initialVarMap);
  };

  // Preview Parsed Excel Rows
  const parsedExcelRows = useMemo(() => {
    if (!phoneCol || rawRows.length === 0) return [];

    return rawRows.slice(0, 5).map((row) => {
      let rawPhone = String(row[phoneCol] || '').trim();
      let digits = rawPhone.replace(/[^0-9]/g, '');
      if (digits.length === 10 && defaultCountryCode) {
        digits = `${defaultCountryCode.replace(/[^0-9]/g, '')}${digits}`;
      }

      const nameVal = nameCol ? String(row[nameCol] || '').trim() : '';
      const emailVal = emailCol ? String(row[emailCol] || '').trim() : '';

      const customVars: Record<string, string> = {};
      Object.entries(variableMappings).forEach(([colHeader, varKey]) => {
        if (row[colHeader] !== undefined && row[colHeader] !== null && String(row[colHeader]).trim()) {
          customVars[varKey] = String(row[colHeader]).trim();
        }
      });

      return {
        phone: digits ? `+${digits}` : rawPhone,
        isValid: digits.length >= 10 && digits.length <= 15,
        name: nameVal || (digits ? `+${digits}` : 'Contact'),
        email: emailVal,
        variables: customVars,
      };
    });
  }, [rawRows, phoneCol, nameCol, emailCol, variableMappings, defaultCountryCode]);

  // -------------------------------------------------------------
  // PARSE MANUAL PASTE TEXT
  // -------------------------------------------------------------
  const parsedPastedContacts = useMemo(() => {
    if (!pasteText.trim()) return [];
    const lines = pasteText.split(/\r?\n/);
    const result: Array<{
      phone: string;
      name: string;
      isValid: boolean;
      variables: Record<string, string>;
    }> = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Handle CSV or tab-separated row: Phone, Name, Var1, Var2...
      // Or Phone: Name
      const parts = trimmed.includes('\t')
        ? trimmed.split('\t').map((p) => p.trim())
        : trimmed.includes(',')
        ? trimmed.split(',').map((p) => p.trim())
        : trimmed.includes(':')
        ? trimmed.split(':').map((p) => p.trim()).reverse() // "Rahul: 9974428034" -> [9974428034, Rahul]
        : [trimmed];

      let rawPhone = parts[0] || '';
      let name = parts[1] || '';

      // If user swapped name & phone e.g. "Rahul, 9876543210"
      if (/[a-zA-Z]/.test(rawPhone) && !/[a-zA-Z]/.test(name) && name.length >= 7) {
        const temp = rawPhone;
        rawPhone = name;
        name = temp;
      }

      let digits = rawPhone.replace(/[^0-9]/g, '');
      if (digits.length === 10 && defaultCountryCode) {
        digits = `${defaultCountryCode.replace(/[^0-9]/g, '')}${digits}`;
      }

      const isValid = digits.length >= 10 && digits.length <= 15;
      const formattedPhone = digits ? `+${digits}` : rawPhone;

      if (digits && seen.has(digits)) continue; // skip duplicates
      if (digits) seen.add(digits);

      // Remaining parts are variables: var1, var2, var3...
      const vars: Record<string, string> = {};
      const extraParts = parts.slice(2);
      extraParts.forEach((val, idx) => {
        if (val) {
          vars[`var${idx + 1}`] = val;
        }
      });

      result.push({
        phone: formattedPhone,
        name: name || formattedPhone,
        isValid,
        variables: vars,
      });
    }

    return result;
  }, [pasteText, defaultCountryCode]);

  // -------------------------------------------------------------
  // DOWNLOAD SAMPLE SPREADSHEET
  // -------------------------------------------------------------
  const handleDownloadSample = () => {
    const sampleData = [
      {
        Phone: '919876543210',
        Name: 'Rahul Sharma',
        Email: 'rahul@example.com',
        InvoiceNo: 'INV-2026-101',
        Amount: 'Rs. 4,500',
        DueDate: '28-Oct-2026',
        City: 'Ahmedabad',
      },
      {
        Phone: '919876543211',
        Name: 'Priya Patel',
        Email: 'priya@example.com',
        InvoiceNo: 'INV-2026-102',
        Amount: 'Rs. 12,000',
        DueDate: '30-Oct-2026',
        City: 'Surat',
      },
      {
        Phone: '919876543212',
        Name: 'Anil Kumar',
        Email: 'anil@example.com',
        InvoiceNo: 'INV-2026-103',
        Amount: 'Rs. 7,850',
        DueDate: '02-Nov-2026',
        City: 'Mumbai',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'AudienceData');
    XLSX.writeFile(workbook, 'sample_whatsapp_audience_with_variables.xlsx');
    toast.showSuccess('Sample Downloaded', 'Sample Excel template with custom variables downloaded.');
  };

  // -------------------------------------------------------------
  // SUBMIT IMPORT TO FIRESTORE
  // -------------------------------------------------------------
  const handleExecuteImport = async () => {
    if (!organizationId) return;

    // Resolve target group
    let finalGroup = targetGroupName.trim();
    if (createNewGroupMode) {
      if (!newGroupInput.trim()) {
        toast.showWarning('Group Name Required', 'Please enter a name for the new audience group.');
        return;
      }
      finalGroup = newGroupInput.trim();
      await addGroup(organizationId, finalGroup);
      setTargetGroupName(finalGroup);
      setCreateNewGroupMode(false);
    }

    if (!finalGroup) {
      toast.showWarning('Audience Group Required', 'Please select or create an audience group for these numbers.');
      return;
    }

    setIsProcessing(true);
    setProgressMsg('Preparing contacts with custom variables...');

    try {
      const contactsToImport: Array<{
        name: string;
        phone: string;
        email?: string;
        groups: string[];
        customFields: Record<string, string>;
        optInStatus: 'opted_in' | 'pending' | 'opted_out';
      }> = [];

      if (activeTab === 'excel') {
        if (!phoneCol || rawRows.length === 0) {
          throw new Error('Please upload an Excel/CSV file with a valid Phone Number column.');
        }

        setProgressMsg(`Processing ${rawRows.length} Excel rows...`);

        for (const row of rawRows) {
          let rawPhone = String(row[phoneCol] || '').trim();
          let digits = rawPhone.replace(/[^0-9]/g, '');
          if (digits.length === 10 && defaultCountryCode) {
            digits = `${defaultCountryCode.replace(/[^0-9]/g, '')}${digits}`;
          }

          if (digits.length < 10 || digits.length > 15) continue; // Skip invalid numbers

          const nameVal = nameCol ? String(row[nameCol] || '').trim() : '';
          const emailVal = emailCol ? String(row[emailCol] || '').trim() : '';

          const customVars: Record<string, string> = {};
          // Copy all mapped variables
          Object.entries(variableMappings).forEach(([colHeader, varKey]) => {
            if (row[colHeader] !== undefined && row[colHeader] !== null && String(row[colHeader]).trim()) {
              const val = String(row[colHeader]).trim();
              customVars[varKey] = val;
              // Also keep column header as fallback
              customVars[colHeader.toLowerCase().replace(/[^a-z0-9_]/g, '_')] = val;
            }
          });

          // If no var1 was mapped and name is available, map name as var1
          if (!customVars.var1 && nameVal) {
            customVars.var1 = nameVal;
          }

          contactsToImport.push({
            name: nameVal || `+${digits}`,
            phone: `+${digits}`,
            ...(emailVal ? { email: emailVal } : {}),
            groups: [finalGroup],
            customFields: customVars,
            optInStatus: importOptIn,
          });
        }
      } else if (activeTab === 'paste') {
        const validPasted = parsedPastedContacts.filter((c) => c.isValid);
        if (validPasted.length === 0) {
          throw new Error('No valid phone numbers found in the pasted text.');
        }

        setProgressMsg(`Processing ${validPasted.length} pasted contacts...`);

        for (const item of validPasted) {
          contactsToImport.push({
            name: item.name,
            phone: item.phone,
            groups: [finalGroup],
            customFields: item.variables,
            optInStatus: importOptIn,
          });
        }
      } else if (activeTab === 'existing') {
        if (selectedExistingIds.length === 0) {
          throw new Error('Please select at least one contact to add to the group.');
        }

        setProgressMsg(`Adding ${selectedExistingIds.length} existing contacts to ${finalGroup}...`);

        const selectedList = allContacts.filter((c) => selectedExistingIds.includes(c.id));
        for (const item of selectedList) {
          contactsToImport.push({
            name: item.name,
            phone: item.phone,
            ...(item.email ? { email: item.email } : {}),
            groups: Array.from(new Set([...(item.groups || []), finalGroup])),
            customFields: item.customFields || {},
            optInStatus: item.optInStatus,
          });
        }
      }

      if (contactsToImport.length === 0) {
        throw new Error('No valid contacts to import.');
      }

      setProgressMsg(`Saving ${contactsToImport.length} contacts to database...`);
      const res = await bulkAddOrUpdateContacts(organizationId, contactsToImport);

      toast.showSuccess(
        'Audience Group Updated!',
        `Successfully added/updated ${contactsToImport.length} contacts in group "${finalGroup}" (${res.added} new, ${res.updated} updated).`
      );

      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.showError('Import Failed', err?.message || 'Could not import contacts into audience group.');
    } finally {
      setIsProcessing(false);
      setProgressMsg(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/70 dark:bg-neutral-800/40 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                Audience Group Import &amp; Bulk Add
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Import contacts via Excel spreadsheet with custom template variables or quick copy-paste numbers.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 sm:px-6 pt-3 bg-neutral-50/40 dark:bg-neutral-800/20 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('excel')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'excel'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>📊 Excel / CSV with Variables</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'paste'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>📋 Quick Copy-Paste Numbers</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('existing')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'existing'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>👥 Pick from Existing ({allContacts.length})</span>
            </button>
          </div>
        </div>

        {/* Body Container */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {/* Target Group & Settings Section */}
          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/80 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Target Audience Group */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-neutral-800 dark:text-neutral-200 flex items-center space-x-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Target Audience Group</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setCreateNewGroupMode(!createNewGroupMode)}
                    className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    {createNewGroupMode ? '← Pick Existing' : '+ New Group'}
                  </button>
                </div>

                {createNewGroupMode ? (
                  <input
                    type="text"
                    required
                    value={newGroupInput}
                    onChange={(e) => setNewGroupInput(e.target.value)}
                    placeholder="e.g. VIP Clients, Diwali Promo, Leads 2026"
                    className="w-full px-3 py-2 rounded-xl border border-emerald-400 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium"
                    autoFocus
                  />
                ) : (
                  <select
                    value={targetGroupName}
                    onChange={(e) => setTargetGroupName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium cursor-pointer"
                  >
                    {groups.length === 0 && <option value="">No groups created yet</option>}
                    {groups.map((g) => (
                      <option key={g.id} value={g.name}>
                        {g.name} ({g.contactCount || 0} contacts)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Default Country Code & Opt-in Consent */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="font-bold text-neutral-800 dark:text-neutral-200">
                    Default Country Code
                  </label>
                  <input
                    type="text"
                    value={defaultCountryCode}
                    onChange={(e) => setDefaultCountryCode(e.target.value)}
                    placeholder="+91"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-center text-neutral-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-neutral-800 dark:text-neutral-200">
                    WhatsApp Consent
                  </label>
                  <select
                    value={importOptIn}
                    onChange={(e) => setImportOptIn(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium cursor-pointer"
                  >
                    <option value="opted_in">Opted-in (Ready)</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* TAB 1: EXCEL / CSV IMPORT */}
          {activeTab === 'excel' && (
            <div className="space-y-4">
              {/* Dropzone & Sample Download */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-neutral-900 dark:text-white text-xs">
                    Upload Spreadsheet File (.xlsx, .xls, .csv)
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    Supports columns like Phone, Name, Invoice, Amount, Due Date, or any custom variables!
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px] flex items-center space-x-1.5 hover:bg-emerald-100 transition-colors cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Sample Excel</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center space-y-2 text-center ${
                  selectedFile
                    ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-neutral-300 dark:border-neutral-700 hover:border-emerald-500 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 flex items-center justify-center">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>

                {selectedFile ? (
                  <div className="space-y-0.5">
                    <p className="font-bold text-neutral-900 dark:text-white text-xs">
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </p>
                    <p className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                      ✓ {rawRows.length} rows loaded successfully! Click to choose another file.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <p className="font-bold text-neutral-900 dark:text-white text-xs">
                      Drag &amp; Drop Excel / CSV file here, or click to browse
                    </p>
                    <p className="text-[11px] text-neutral-400">
                      Standard Microsoft Excel (.xlsx), older Excel (.xls), and CSV files supported.
                    </p>
                  </div>
                )}
              </div>

              {/* Sheet & Column Mapping Section */}
              {rawRows.length > 0 && headers.length > 0 && (
                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700 space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 pb-2.5">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <h4 className="font-bold text-neutral-900 dark:text-white text-xs">
                        Smart Column &amp; Variables Mapping
                      </h4>
                    </div>
                    {sheetNames.length > 1 && (
                      <div className="flex items-center space-x-1.5 text-[11px]">
                        <span>Sheet:</span>
                        <select
                          value={selectedSheet}
                          onChange={(e) => {
                            setSelectedSheet(e.target.value);
                            if (selectedFile) {
                              // re-parse sheet
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                const wb = XLSX.read(evt.target?.result, { type: 'binary' });
                                processSheet(wb, e.target.value);
                              };
                              reader.readAsBinaryString(selectedFile);
                            }
                          }}
                          className="px-2 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                        >
                          {sheetNames.map((sn) => (
                            <option key={sn} value={sn}>
                              {sn}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="font-bold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1">
                        <span>Phone Number Column</span>
                        <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={phoneCol}
                        onChange={(e) => setPhoneCol(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-500 bg-white dark:bg-neutral-800 text-xs font-semibold"
                      >
                        <option value="">Select phone column</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-neutral-700 dark:text-neutral-300">
                        Contact Name Column
                      </label>
                      <select
                        value={nameCol}
                        onChange={(e) => setNameCol(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                      >
                        <option value="">(Optional - None)</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-neutral-700 dark:text-neutral-300">
                        Email Column
                      </label>
                      <select
                        value={emailCol}
                        onChange={(e) => setEmailCol(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                      >
                        <option value="">(Optional - None)</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Dynamic Template Variables Mapping */}
                  <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-neutral-700 dark:text-neutral-300 text-[11px] uppercase tracking-wider">
                        Template Variable Placeholders ({'{{1}}'}, {'{{2}}'}, {'{{3}}'}...)
                      </p>
                      <span className="text-[10px] text-neutral-500">
                        Automatically substitutes customer data in broadcast messages
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {headers
                        .filter((h) => h !== phoneCol && h !== nameCol && h !== emailCol)
                        .map((h, idx) => (
                          <div
                            key={h}
                            className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-xs"
                          >
                            <span className="font-medium text-neutral-800 dark:text-neutral-200 truncate mr-2">
                              Excel: <strong>{h}</strong>
                            </span>
                            <div className="flex items-center space-x-1.5 shrink-0">
                              <span className="text-neutral-400">→</span>
                              <select
                                value={variableMappings[h] || `var${idx + 1}`}
                                onChange={(e) =>
                                  setVariableMappings({
                                    ...variableMappings,
                                    [h]: e.target.value,
                                  })
                                }
                                className="px-2 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400"
                              >
                                <option value="var1">var1 ({"{{1}}"})</option>
                                <option value="var2">var2 ({"{{2}}"})</option>
                                <option value="var3">var3 ({"{{3}}"})</option>
                                <option value="var4">var4 ({"{{4}}"})</option>
                                <option value="var5">var5 ({"{{5}}"})</option>
                                <option value="custom">Custom Field</option>
                              </select>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Live Parsed Preview Table */}
                  <div className="space-y-1.5 pt-2">
                    <p className="font-bold text-neutral-700 dark:text-neutral-300 text-[11px]">
                      Live Data Preview (First 5 Rows):
                    </p>
                    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-x-auto bg-white dark:bg-neutral-900">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-500">
                            <th className="py-2 px-3">Phone</th>
                            <th className="py-2 px-3">Name</th>
                            <th className="py-2 px-3">Mapped Variables</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                          {parsedExcelRows.map((r, i) => (
                            <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                              <td className="py-2 px-3 font-mono">
                                <span className={r.isValid ? 'text-emerald-600 font-semibold' : 'text-red-500'}>
                                  {r.phone}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-neutral-700 dark:text-neutral-300">
                                {r.name}
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(r.variables).map(([k, v]) => (
                                    <span
                                      key={k}
                                      className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-mono text-[10px]"
                                    >
                                      {k}: <strong>{v}</strong>
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MANUAL COPY-PASTE */}
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-neutral-900 dark:text-white text-xs">
                    Paste WhatsApp Mobile Numbers
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    Paste raw numbers line-by-line, comma separated, or Excel table columns.
                  </p>
                </div>

                <div className="text-[11px] font-semibold text-neutral-500">
                  Detected: <strong className="text-emerald-600 font-mono">{parsedPastedContacts.filter((c) => c.isValid).length}</strong> valid numbers
                </div>
              </div>

              <textarea
                rows={8}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={`Example formats supported:
9876543210
+91 99744 28034
Rahul Sharma, 9876543210
919974428034, Vijay Laxtone, INV-101, Rs. 5000
Amit Patel: 9876543211`}
                className="w-full p-3.5 rounded-2xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />

              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center space-x-3 text-neutral-600 dark:text-neutral-400">
                  <span>Total Lines: <strong>{parsedPastedContacts.length}</strong></span>
                  <span>•</span>
                  <span>Duplicates: <strong>Filtered automatically</strong></span>
                  <span>•</span>
                  <span>Format: <strong>Phone [, Name, Var1, Var2...]</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: EXISTING CONTACTS PICKER */}
          {activeTab === 'existing' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={existingSearch}
                    onChange={(e) => setExistingSearch(e.target.value)}
                    placeholder="Search existing contacts by name or phone..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (selectedExistingIds.length === allContacts.length) {
                      setSelectedExistingIds([]);
                    } else {
                      setSelectedExistingIds(allContacts.map((c) => c.id));
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-semibold text-[11px] cursor-pointer shrink-0"
                >
                  {selectedExistingIds.length === allContacts.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-2xl border border-neutral-200 dark:border-neutral-700 divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900">
                {allContacts
                  .filter((c) => {
                    if (!existingSearch.trim()) return true;
                    return (
                      c.name.toLowerCase().includes(existingSearch.toLowerCase()) ||
                      c.phone.includes(existingSearch)
                    );
                  })
                  .map((c) => {
                    const isChecked = selectedExistingIds.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedExistingIds((prev) =>
                            isChecked ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                          );
                        }}
                        className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                          isChecked ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent div
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <div>
                            <p className="font-semibold text-neutral-900 dark:text-white text-xs">{c.name}</p>
                            <p className="text-[11px] font-mono text-neutral-500">{c.phone}</p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          {(c.groups || []).map((g) => (
                            <span
                              key={g}
                              className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] text-neutral-600 dark:text-neutral-300"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>

              <p className="text-[11px] text-neutral-500">
                Selected <strong>{selectedExistingIds.length}</strong> contacts to be added to group <strong>"{targetGroupName}"</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/60 dark:bg-neutral-800/30 shrink-0">
          <div className="text-[11px] text-neutral-500">
            {progressMsg && (
              <span className="flex items-center space-x-1.5 text-emerald-600 font-semibold animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{progressMsg}</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 font-semibold text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={isProcessing}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    Import to &ldquo;{createNewGroupMode ? newGroupInput || 'New Group' : targetGroupName}&rdquo;
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
