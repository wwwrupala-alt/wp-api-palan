import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Upload,
  Download,
  Trash2,
  Edit2,
  Tag,
  CheckCircle,
  XCircle,
  Clock,
  X,
  Filter,
  Loader2,
  AlertTriangle,
  CheckSquare,
  Square,
  FileSpreadsheet,
  ClipboardPaste,
  Sparkles,
  ArrowRight,
  FolderPlus,
  Send,
  Eye,
  Check,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeContacts,
  subscribeGroups,
  addContact,
  updateContact,
  deleteContact,
  addGroup,
  deleteGroup,
  updateGroup,
  bulkAddOrUpdateContacts,
} from '../lib/services.ts';
import type { Contact, ContactGroup } from '../types/index.ts';
import { AudienceImportModal } from '../components/AudienceImportModal.tsx';

export const ContactsPage: React.FC = () => {
  const { organization } = useAuth();
  const toast = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Sub-Tab Switcher: 'contacts' (All Contacts table) vs 'groups' (Audience Groups management)
  const [activeView, setActiveView] = useState<'contacts' | 'groups'>('contacts');

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedOptIn, setSelectedOptIn] = useState<string>('all');

  // Groups Search
  const [groupSearch, setGroupSearch] = useState('');

  // Multi-select / Bulk selection
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Single Contact Delete Modal
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [isDeletingContact, setIsDeletingContact] = useState(false);

  // Group Delete Confirmation
  const [groupToDelete, setGroupToDelete] = useState<ContactGroup | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);

  // Group Rename Modal
  const [groupToRename, setGroupToRename] = useState<ContactGroup | null>(null);
  const [renamedGroupName, setRenamedGroupName] = useState('');
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);

  // Advanced Import Modal (Excel with Variables & Quick Copy-Paste)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importModalInitialGroup, setImportModalInitialGroup] = useState<string | null>(null);
  const [importModalMode, setImportModalMode] = useState<'excel' | 'paste'>('excel');

  // Add / Edit Contact Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // Contact Form states
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formOptIn, setFormOptIn] = useState<'opted_in' | 'opted_out' | 'pending'>('opted_in');
  const [formGroups, setFormGroups] = useState<string[]>([]);
  // Custom Variables for this contact: e.g. { var1: 'INV-101', var2: 'Rs. 5000' }
  const [formVariables, setFormVariables] = useState<Array<{ key: string; value: string }>>([]);

  // Create Group Modal
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  // Active variable popover for a contact in table
  const [viewVariablesContact, setViewVariablesContact] = useState<Contact | null>(null);

  // 1. Subscribe to Contacts
  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeContacts(
      organization.id,
      (data) => {
        setContacts(data);
        setLoading(false);
      },
      (err) => {
        toast.showError('Failed to load contacts', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [organization?.id]);

  // 2. Subscribe to Groups
  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeGroups(
      organization.id,
      (data) => setGroups(data),
      (err) => toast.showError('Failed to load audience groups', err)
    );
    return () => unsub();
  }, [organization?.id]);

  // Synchronize dynamic contact counts for each group
  const groupStatsMap = useMemo(() => {
    const map: Record<
      string,
      {
        total: number;
        optedIn: number;
        optedOut: number;
        pending: number;
        customVariables: Set<string>;
      }
    > = {};

    groups.forEach((g) => {
      map[g.name] = {
        total: 0,
        optedIn: 0,
        optedOut: 0,
        pending: 0,
        customVariables: new Set<string>(),
      };
    });

    contacts.forEach((c) => {
      (c.groups || []).forEach((gName) => {
        if (!map[gName]) {
          map[gName] = {
            total: 0,
            optedIn: 0,
            optedOut: 0,
            pending: 0,
            customVariables: new Set<string>(),
          };
        }
        map[gName].total++;
        if (c.optInStatus === 'opted_in') map[gName].optedIn++;
        else if (c.optInStatus === 'opted_out') map[gName].optedOut++;
        else map[gName].pending++;

        if (c.customFields) {
          Object.keys(c.customFields).forEach((k) => map[gName].customVariables.add(k));
        }
      });
    });

    return map;
  }, [groups, contacts]);

  // Handle Form Submit (Add / Edit Single Contact)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    const cleanPhone = formPhone.trim().replace(/\s+/g, '');
    if (!cleanPhone) {
      toast.showWarning('Phone Required', 'Please enter a valid WhatsApp phone number.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Build customFields map from formVariables array
      const customFields: Record<string, string> = {};
      formVariables.forEach(({ key, value }) => {
        if (key.trim() && value.trim()) {
          customFields[key.trim()] = value.trim();
        }
      });

      const contactPayload = {
        name: formName.trim() || cleanPhone,
        phone: cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone.replace(/[^0-9]/g, '')}`,
        ...(formEmail.trim() ? { email: formEmail.trim() } : {}),
        optInStatus: formOptIn,
        groups: formGroups,
        customFields,
      };

      if (editingContact) {
        await updateContact(organization.id, editingContact.id, contactPayload);
        toast.showSuccess('Contact Updated', `Contact "${contactPayload.name}" updated successfully.`);
      } else {
        await addContact(organization.id, contactPayload);
        toast.showSuccess('Contact Added', `Contact "${contactPayload.name}" saved successfully.`);
      }
      resetForm();
    } catch (err) {
      toast.showError('Failed to Save Contact', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormOptIn('opted_in');
    setFormGroups([]);
    setFormVariables([]);
    setEditingContact(null);
    setIsAddOpen(false);
  };

  const handleEditClick = (contact: Contact) => {
    setEditingContact(contact);
    setFormName(contact.name);
    setFormPhone(contact.phone);
    setFormEmail(contact.email || '');
    setFormOptIn(contact.optInStatus);
    setFormGroups(contact.groups || []);

    const varList: Array<{ key: string; value: string }> = [];
    if (contact.customFields) {
      Object.entries(contact.customFields).forEach(([key, value]) => {
        varList.push({ key, value });
      });
    }
    setFormVariables(varList);
    setIsAddOpen(true);
  };

  // Single Contact Delete Action
  const confirmDeleteContact = async () => {
    if (!organization?.id || !contactToDelete) return;
    const targetId = contactToDelete.id;
    const targetName = contactToDelete.name;

    setIsDeletingContact(true);
    setContacts((prev) => prev.filter((c) => c.id !== targetId));
    setSelectedContactIds((prev) => prev.filter((id) => id !== targetId));
    setContactToDelete(null);

    try {
      await deleteContact(organization.id, targetId);
      toast.showSuccess('Contact Deleted', `"${targetName}" was permanently removed.`);
    } catch (err: any) {
      toast.showError('Delete Failed', err);
    } finally {
      setIsDeletingContact(false);
    }
  };

  // Bulk Delete Action
  const confirmBulkDelete = async () => {
    if (!organization?.id || selectedContactIds.length === 0) return;
    const idsToDelete = [...selectedContactIds];
    const count = idsToDelete.length;

    setIsBulkDeleting(true);
    setContacts((prev) => prev.filter((c) => !idsToDelete.includes(c.id)));
    setSelectedContactIds([]);
    setShowBulkDeleteConfirm(false);

    try {
      await Promise.all(idsToDelete.map((id) => deleteContact(organization.id, id)));
      toast.showSuccess('Contacts Deleted', `${count} contacts permanently removed.`);
    } catch (err: any) {
      toast.showError('Bulk Delete Failed', err);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Group Create
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !newGroupName.trim()) return;
    setIsCreatingGroup(true);
    try {
      await addGroup(organization.id, newGroupName.trim(), newGroupDescription.trim());
      toast.showSuccess('Group Created', `Audience Group "${newGroupName.trim()}" created successfully.`);
      setNewGroupName('');
      setNewGroupDescription('');
      setIsCreateGroupModalOpen(false);
    } catch (err: any) {
      toast.showError('Create Group Failed', err);
    } finally {
      setIsCreatingGroup(false);
    }
  };

  // Group Rename Action
  const handleRenameGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !groupToRename || !renamedGroupName.trim()) return;
    const oldName = groupToRename.name;
    const newName = renamedGroupName.trim();

    if (oldName === newName) {
      setGroupToRename(null);
      return;
    }

    setIsRenamingGroup(true);
    try {
      await updateGroup(organization.id, groupToRename.id, { name: newName });

      // Update contacts that had this group assigned
      const contactsToUpdate = contacts.filter((c) => (c.groups || []).includes(oldName));
      if (contactsToUpdate.length > 0) {
        await Promise.all(
          contactsToUpdate.map((c) => {
            const updatedG = (c.groups || []).map((g) => (g === oldName ? newName : g));
            return updateContact(organization.id, c.id, { groups: updatedG });
          })
        );
      }

      if (selectedGroup === oldName) {
        setSelectedGroup(newName);
      }

      toast.showSuccess('Group Renamed', `Renamed "${oldName}" to "${newName}".`);
      setGroupToRename(null);
      setRenamedGroupName('');
    } catch (err: any) {
      toast.showError('Rename Failed', err);
    } finally {
      setIsRenamingGroup(false);
    }
  };

  // Group Delete Action
  const confirmDeleteGroup = async () => {
    if (!organization?.id || !groupToDelete) return;
    const targetGroupId = groupToDelete.id;
    const targetGroupName = groupToDelete.name;

    setIsDeletingGroup(true);
    setGroups((prev) => prev.filter((g) => g.id !== targetGroupId));
    if (selectedGroup === targetGroupName) {
      setSelectedGroup('all');
    }
    setGroupToDelete(null);

    try {
      await deleteGroup(organization.id, targetGroupId);
      toast.showSuccess('Group Deleted', `Audience Group "${targetGroupName}" removed.`);
    } catch (err: any) {
      toast.showError('Delete Group Failed', err);
    } finally {
      setIsDeletingGroup(false);
    }
  };

  // Filter contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        (c.email && c.email.toLowerCase().includes(search.toLowerCase())) ||
        (c.customFields &&
          Object.values(c.customFields).some((val) =>
            String(val).toLowerCase().includes(search.toLowerCase())
          ));

      const matchesGroup =
        selectedGroup === 'all' || (c.groups && c.groups.includes(selectedGroup));

      const matchesOptIn =
        selectedOptIn === 'all' || c.optInStatus === selectedOptIn;

      return matchesSearch && matchesGroup && matchesOptIn;
    });
  }, [contacts, search, selectedGroup, selectedOptIn]);

  // CSV Export with all variables
  const handleExportCsv = (targetGroupFilter?: string) => {
    const listToExport = targetGroupFilter
      ? contacts.filter((c) => (c.groups || []).includes(targetGroupFilter))
      : filteredContacts;

    if (listToExport.length === 0) {
      toast.showWarning('No Contacts', 'No contacts available to export.');
      return;
    }

    // Collect all unique custom field variable keys across the contacts
    const varKeysSet = new Set<string>();
    listToExport.forEach((c) => {
      if (c.customFields) {
        Object.keys(c.customFields).forEach((k) => varKeysSet.add(k));
      }
    });
    const customVarKeys = Array.from(varKeysSet);

    const headers = ['Phone', 'Name', 'Email', 'OptInStatus', 'Groups', ...customVarKeys];
    const rows = [
      headers,
      ...listToExport.map((c) => [
        `"${c.phone}"`,
        `"${(c.name || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${c.optInStatus}"`,
        `"${(c.groups || []).join(';')}"`,
        ...customVarKeys.map((k) => `"${(c.customFields?.[k] || '').replace(/"/g, '""')}"`),
      ]),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const filenameTag = targetGroupFilter ? `group_${targetGroupFilter.replace(/\s+/g, '_')}` : 'all_contacts';
    link.setAttribute('download', `whatsapp_${filenameTag}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.showSuccess('Export Complete', `Exported ${listToExport.length} contacts with all custom variables.`);
  };

  // Toggle selection
  const handleToggleSelectAll = () => {
    if (selectedContactIds.length === filteredContacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(filteredContacts.map((c) => c.id));
    }
  };

  const handleToggleSelectContact = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Open import modal with specific group and mode
  const openImportModal = (groupName?: string, mode: 'excel' | 'paste' = 'excel') => {
    setImportModalInitialGroup(groupName || (groups.length > 0 ? groups[0].name : null));
    setImportModalMode(mode);
    setIsImportModalOpen(true);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center space-x-2">
            <span>Contacts &amp; Audience</span>
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Manage your opted-in WhatsApp audience, audience groups, and Excel contacts with personalized variables.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Copy-Paste Numbers */}
          <button
            onClick={() => openImportModal(selectedGroup !== 'all' ? selectedGroup : undefined, 'paste')}
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
            title="Paste raw numbers directly"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Paste Numbers</span>
          </button>

          {/* Excel / CSV with Variables */}
          <button
            onClick={() => openImportModal(selectedGroup !== 'all' ? selectedGroup : undefined, 'excel')}
            className="px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
            title="Import Excel file with custom variables (var1, var2, etc.)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Import Excel / CSV</span>
          </button>

          {/* Export */}
          <button
            onClick={() => handleExportCsv(selectedGroup !== 'all' ? selectedGroup : undefined)}
            disabled={contacts.length === 0}
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {/* Add Single Contact */}
          <button
            onClick={() => {
              resetForm();
              setIsAddOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>

      {/* Main Sub-Tabs Switcher: "All Contacts" vs "Audience Groups (BAHAR SHOW HO)" */}
      <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-0">
        <div className="flex space-x-1 sm:space-x-3">
          <button
            type="button"
            onClick={() => setActiveView('contacts')}
            className={`pb-3 px-3 sm:px-4 text-xs sm:text-sm font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
              activeView === 'contacts'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>All Contacts</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-mono">
              {contacts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('groups')}
            className={`pb-3 px-3 sm:px-4 text-xs sm:text-sm font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
              activeView === 'groups'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Audience Groups</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-mono font-bold">
              {groups.length}
            </span>
          </button>
        </div>

        {/* View Specific Header Action */}
        {activeView === 'groups' && (
          <button
            type="button"
            onClick={() => setIsCreateGroupModalOpen(true)}
            className="mb-2 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center space-x-1 cursor-pointer shadow-xs transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Create Audience Group</span>
          </button>
        )}
      </div>

      {/* ============================================================= */}
      {/* VIEW A: ALL CONTACTS LIST & DIRECT GROUP CHIPS BAR            */}
      {/* ============================================================= */}
      {activeView === 'contacts' && (
        <div className="space-y-4">
          {/* Prominent Audience Group Filter Chips (BAHAR SHOW HO) */}
          <div className="p-3 rounded-2xl bg-neutral-50/80 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5 text-emerald-600" />
                <span>Audience Groups ({groups.length}):</span>
              </span>

              <button
                type="button"
                onClick={() => setIsCreateGroupModalOpen(true)}
                className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold flex items-center space-x-1 cursor-pointer text-xs"
              >
                <Plus className="w-3 h-3" />
                <span>New Group</span>
              </button>
            </div>

            {/* Scrollable pill buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedGroup('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
                  selectedGroup === 'all'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                }`}
              >
                <span>All Contacts</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  selectedGroup === 'all' ? 'bg-white/20 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                }`}>
                  {contacts.length}
                </span>
              </button>

              {groups.map((g) => {
                const count = groupStatsMap[g.name]?.total || 0;
                const isSelected = selectedGroup === g.name;
                const hasVars = (groupStatsMap[g.name]?.customVariables.size || 0) > 0;

                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGroup(g.name)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                    }`}
                  >
                    <span>{g.name}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                    }`}>
                      {count}
                    </span>
                    {hasVars && (
                      <span title="Has Excel variables">
                        <Sparkles className={`w-3 h-3 ${isSelected ? 'text-amber-200' : 'text-purple-500'}`} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Group Context Action Bar (When a specific group is selected) */}
            {selectedGroup !== 'all' && (
              <div className="pt-2 border-t border-neutral-200/80 dark:border-neutral-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-2 text-neutral-700 dark:text-neutral-300">
                  <span className="font-semibold">
                    Viewing Group: <strong className="text-emerald-700 dark:text-emerald-400">&ldquo;{selectedGroup}&rdquo;</strong> ({filteredContacts.length} contacts)
                  </span>
                  {(groupStatsMap[selectedGroup]?.customVariables.size || 0) > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[10px] font-bold flex items-center space-x-1">
                      <Sparkles className="w-3 h-3" />
                      <span>{groupStatsMap[selectedGroup].customVariables.size} Excel Variables Active</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => openImportModal(selectedGroup, 'paste')}
                    className="px-2.5 py-1 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 hover:bg-neutral-100 text-neutral-800 dark:text-neutral-200 font-semibold text-[11px] cursor-pointer flex items-center space-x-1"
                  >
                    <ClipboardPaste className="w-3 h-3 text-blue-500" />
                    <span>Paste Numbers</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openImportModal(selectedGroup, 'excel')}
                    className="px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 font-semibold text-[11px] cursor-pointer flex items-center space-x-1"
                  >
                    <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                    <span>Import Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedGroup('all')}
                    className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                    title="Clear group filter"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bulk Action Bar (When contacts are checked) */}
          {selectedContactIds.length > 0 && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between text-xs animate-fadeIn">
              <div className="flex items-center space-x-2 text-rose-800 dark:text-rose-300 font-semibold">
                <CheckSquare className="w-4 h-4 text-rose-600" />
                <span>{selectedContactIds.length} contact(s) selected</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setSelectedContactIds([])}
                  className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 font-medium cursor-pointer"
                >
                  Clear Selection
                </button>
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected</span>
                </button>
              </div>
            </div>
          )}

          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search by name, phone (+91...), variables (INV-101)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <select
              value={selectedOptIn}
              onChange={(e) => setSelectedOptIn(e.target.value)}
              className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-hidden cursor-pointer w-full sm:w-auto font-medium"
            >
              <option value="all">All Opt-In Statuses</option>
              <option value="opted_in">Opted In (Ready to message)</option>
              <option value="opted_out">Opted Out</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {/* Contact Table / Empty State */}
          {contacts.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mx-auto">
                <Users className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">No contacts yet.</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Import your customer contacts from an Excel spreadsheet with custom variables or paste numbers directly.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => openImportModal(undefined, 'excel')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer flex items-center space-x-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Import Excel / CSV</span>
                </button>
                <button
                  onClick={() => openImportModal(undefined, 'paste')}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer flex items-center space-x-1.5"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>Paste Numbers</span>
                </button>
                <button
                  onClick={() => setIsAddOpen(true)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  Add Single Contact
                </button>
              </div>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3">
              <p className="text-xs text-neutral-500">No contacts match the current search &amp; filter criteria.</p>
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedGroup('all');
                  setSelectedOptIn('all');
                }}
                className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider font-semibold">
                      <th className="py-3 px-4 w-10">
                        <button
                          type="button"
                          onClick={handleToggleSelectAll}
                          className="cursor-pointer text-neutral-400 hover:text-neutral-600"
                        >
                          {selectedContactIds.length > 0 &&
                          selectedContactIds.length === filteredContacts.length ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Phone Number</th>
                      <th className="py-3 px-4">Audience Groups</th>
                      <th className="py-3 px-4">Template Variables (Excel)</th>
                      <th className="py-3 px-4">Opt-In Status</th>
                      <th className="py-3 px-4">Added</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {filteredContacts.map((c) => {
                      const isSelected = selectedContactIds.includes(c.id);
                      const variableEntries = Object.entries(c.customFields || {});

                      return (
                        <tr
                          key={c.id}
                          className={`hover:bg-neutral-50/70 dark:hover:bg-neutral-800/30 transition-colors ${
                            isSelected ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : ''
                          }`}
                        >
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => handleToggleSelectContact(c.id)}
                              className="cursor-pointer text-neutral-400 hover:text-neutral-600"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2.5">
                              <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
                                {c.name ? c.name.charAt(0).toUpperCase() : '#'}
                              </div>
                              <div>
                                <p className="font-semibold text-neutral-900 dark:text-white">{c.name}</p>
                                {c.email && <p className="text-[11px] text-neutral-500">{c.email}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-neutral-700 dark:text-neutral-300 font-semibold">
                            {c.phone}
                          </td>
                          <td className="py-3 px-4">
                            {c.groups && c.groups.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {c.groups.map((g) => (
                                  <span
                                    key={g}
                                    onClick={() => setSelectedGroup(g)}
                                    className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 cursor-pointer transition-colors"
                                  >
                                    {g}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-neutral-400 text-[11px]">&mdash;</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {variableEntries.length > 0 ? (
                              <div className="flex flex-wrap gap-1 items-center">
                                {variableEntries.slice(0, 2).map(([k, v]) => (
                                  <span
                                    key={k}
                                    className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-mono text-[10px]"
                                    title={`${k}: ${v}`}
                                  >
                                    {k}: <strong>{v}</strong>
                                  </span>
                                ))}
                                {variableEntries.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => setViewVariablesContact(c)}
                                    className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] text-neutral-600 dark:text-neutral-400 font-bold hover:underline cursor-pointer"
                                  >
                                    +{variableEntries.length - 2} more
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-neutral-400 text-[11px]">&mdash;</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                                c.optInStatus === 'opted_in'
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                                  : c.optInStatus === 'opted_out'
                                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400'
                                  : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {c.optInStatus === 'opted_in' ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : c.optInStatus === 'opted_out' ? (
                                <XCircle className="w-3 h-3" />
                              ) : (
                                <Clock className="w-3 h-3" />
                              )}
                              <span>{c.optInStatus.replace('_', ' ')}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-neutral-500 text-[11px]">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                onClick={() => handleEditClick(c)}
                                title="Edit Contact & Variables"
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setContactToDelete(c)}
                                title="Delete Contact"
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* VIEW B: AUDIENCE GROUPS DEDICATED CARDS (BAHAR SHOW HO)        */}
      {/* ============================================================= */}
      {activeView === 'groups' && (
        <div className="space-y-4">
          {/* Search Groups bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search audience groups..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => openImportModal(undefined, 'excel')}
                className="px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 transition-colors flex items-center space-x-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Import Excel to Group</span>
              </button>

              <button
                type="button"
                onClick={() => openImportModal(undefined, 'paste')}
                className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 transition-colors flex items-center space-x-1.5 cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-blue-600" />
                <span>Paste Numbers to Group</span>
              </button>
            </div>
          </div>

          {/* Groups Grid */}
          {groups.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mx-auto">
                <Tag className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                  No Audience Groups Yet
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Organize your customers into groups (e.g., VIP Clients, Gujarat Retailers, Leads) to send personalized broadcasts.
                </p>
              </div>
              <button
                onClick={() => setIsCreateGroupModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                + Create Your First Group
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups
                .filter((g) => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
                .map((g) => {
                  const stats = groupStatsMap[g.name] || {
                    total: 0,
                    optedIn: 0,
                    optedOut: 0,
                    pending: 0,
                    customVariables: new Set<string>(),
                  };
                  const varCount = stats.customVariables.size;

                  return (
                    <div
                      key={g.id}
                      className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3.5 shadow-xs hover:border-neutral-300 dark:hover:border-neutral-700 transition-all flex flex-col justify-between"
                    >
                      {/* Card Header */}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                              <Tag className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-sm text-neutral-900 dark:text-white truncate">
                                {g.name}
                              </h4>
                              <p className="text-[10px] text-neutral-400">
                                Created {new Date(g.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setGroupToRename(g);
                                setRenamedGroupName(g.name);
                              }}
                              title="Rename Group"
                              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setGroupToDelete(g)}
                              title="Delete Group"
                              className="p-1 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {g.description && (
                          <p className="text-[11px] text-neutral-500 line-clamp-2">
                            {g.description}
                          </p>
                        )}
                      </div>

                      {/* Metrics Pill Grid */}
                      <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 text-center">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Total</p>
                          <p className="font-bold text-xs font-mono text-neutral-900 dark:text-white mt-0.5">
                            {stats.total}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">Opted-In</p>
                          <p className="font-bold text-xs font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {stats.optedIn}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Pending</p>
                          <p className="font-bold text-xs font-mono text-neutral-500 mt-0.5">
                            {stats.pending + stats.optedOut}
                          </p>
                        </div>
                      </div>

                      {/* Variables indicator badge */}
                      {varCount > 0 ? (
                        <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 flex items-center justify-between text-[11px] text-purple-900 dark:text-purple-200">
                          <span className="flex items-center space-x-1.5 font-semibold">
                            <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                            <span>{varCount} Excel Variables Active</span>
                          </span>
                          <span className="font-mono text-[10px] text-purple-600 dark:text-purple-400">
                            {Array.from(stats.customVariables).slice(0, 3).join(', ')}
                            {varCount > 3 ? '...' : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="p-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800 text-[10px] text-neutral-400 text-center">
                          Standard contacts (No custom Excel variables)
                        </div>
                      )}

                      {/* Action Buttons on Card */}
                      <div className="pt-1 border-t border-neutral-100 dark:border-neutral-800 space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => openImportModal(g.name, 'paste')}
                            className="px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <ClipboardPaste className="w-3 h-3 text-blue-500" />
                            <span>Paste Numbers</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openImportModal(g.name, 'excel')}
                            className="px-2.5 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                            <span>Import Excel</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedGroup(g.name);
                              setActiveView('contacts');
                            }}
                            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View {stats.total} Contacts</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleExportCsv(g.name)}
                            disabled={stats.total === 0}
                            className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 flex items-center space-x-1 cursor-pointer disabled:opacity-40"
                          >
                            <Download className="w-3 h-3" />
                            <span>Export CSV</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* MODALS & DIALOGS                                              */}
      {/* ============================================================= */}

      {/* 1. ADVANCED AUDIENCE IMPORT MODAL (Excel with Variables & Paste) */}
      <AudienceImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        organizationId={organization?.id || ''}
        groups={groups}
        allContacts={contacts}
        initialGroupId={importModalInitialGroup}
        initialMode={importModalMode}
      />

      {/* 2. CREATE AUDIENCE GROUP MODAL */}
      {isCreateGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-bold text-base text-neutral-900 dark:text-white flex items-center space-x-2">
                <FolderPlus className="w-5 h-5 text-emerald-600" />
                <span>Create New Audience Group</span>
              </h3>
              <button
                onClick={() => setIsCreateGroupModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-3.5">
              <div className="space-y-1">
                <label className="font-bold text-neutral-700 dark:text-neutral-300">
                  Group Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP Clients, Diwali Promo, Ahmedabad Leads"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-700 dark:text-neutral-300">
                  Description / Purpose (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. High value recurring customers for festival discounts"
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateGroupModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingGroup || !newGroupName.trim()}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isCreatingGroup ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. RENAME AUDIENCE GROUP MODAL */}
      {groupToRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-sm w-full shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-bold text-base text-neutral-900 dark:text-white flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-emerald-600" />
                <span>Rename Audience Group</span>
              </h3>
              <button
                onClick={() => setGroupToRename(null)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRenameGroup} className="space-y-3.5">
              <div className="space-y-1">
                <label className="font-bold text-neutral-700 dark:text-neutral-300">
                  New Group Name
                </label>
                <input
                  type="text"
                  required
                  value={renamedGroupName}
                  onChange={(e) => setRenamedGroupName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  autoFocus
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setGroupToRename(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRenamingGroup || !renamedGroupName.trim()}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isRenamingGroup ? 'Updating...' : 'Save Name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. ADD / EDIT CONTACT MODAL (With Variables Support) */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-bold text-neutral-900 dark:text-white text-base">
                {editingContact ? 'Edit Contact & Custom Variables' : 'Add New Contact'}
              </h3>
              <button onClick={resetForm} className="text-neutral-400 hover:text-neutral-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-neutral-700 dark:text-neutral-300">
                    Contact Name / Company <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-neutral-700 dark:text-neutral-300">
                    WhatsApp Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. +919974428034"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-neutral-700 dark:text-neutral-300">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. rahul@example.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-neutral-700 dark:text-neutral-300">
                    WhatsApp Consent (Opt-In Status)
                  </label>
                  <select
                    value={formOptIn}
                    onChange={(e) => setFormOptIn(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-medium cursor-pointer"
                  >
                    <option value="opted_in">Opted In (Ready to message)</option>
                    <option value="pending">Pending Verification</option>
                    <option value="opted_out">Opted Out (Do not message)</option>
                  </select>
                </div>
              </div>

              {/* Group Assignment */}
              <div className="space-y-1.5">
                <label className="font-bold text-neutral-700 dark:text-neutral-300">
                  Assign to Audience Groups
                </label>
                {groups.length === 0 ? (
                  <p className="text-[11px] text-neutral-400 italic">No audience groups created yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2.5 border border-neutral-200 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800/40">
                    {groups.map((g) => {
                      const isChecked = formGroups.includes(g.name);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setFormGroups((prev) =>
                              isChecked ? prev.filter((item) => item !== g.name) : [...prev, g.name]
                            );
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                            isChecked
                              ? 'bg-emerald-100 dark:bg-emerald-950 border-emerald-500 text-emerald-800 dark:text-emerald-300'
                              : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {isChecked && '✓ '}
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Custom Variables for WhatsApp Message Placeholders (var1, var2...) */}
              <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span className="font-bold text-neutral-800 dark:text-neutral-200">
                      Custom Template Variables (Excel / WhatsApp Placeholders)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextNum = formVariables.length + 1;
                      setFormVariables([...formVariables, { key: `var${nextNum}`, value: '' }]);
                    }}
                    className="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                  >
                    + Add Variable
                  </button>
                </div>

                <p className="text-[10px] text-neutral-400">
                  Variables are used in campaigns to dynamically replace <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code> with customer data (e.g. Invoice No, Due Date, Amount).
                </p>

                {formVariables.length === 0 ? (
                  <p className="text-[11px] text-neutral-400 italic py-1">No custom variables added.</p>
                ) : (
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {formVariables.map((vItem, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <input
                          type="text"
                          placeholder="Key (e.g. var1, amount)"
                          value={vItem.key}
                          onChange={(e) => {
                            const updated = [...formVariables];
                            updated[idx].key = e.target.value;
                            setFormVariables(updated);
                          }}
                          className="w-1/3 px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-[11px]"
                        />
                        <input
                          type="text"
                          placeholder="Value (e.g. Rs. 5,000, 25-Oct)"
                          value={vItem.value}
                          onChange={(e) => {
                            const updated = [...formVariables];
                            updated[idx].value = e.target.value;
                            setFormVariables(updated);
                          }}
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={() => setFormVariables(formVariables.filter((_, i) => i !== idx))}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 cursor-pointer font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingContact ? 'Update Contact' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. POPUP VIEW ALL VARIABLES FOR A CONTACT */}
      {viewVariablesContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                  Variables for {viewVariablesContact.name}
                </h3>
                <p className="text-[11px] font-mono text-neutral-400">{viewVariablesContact.phone}</p>
              </div>
              <button
                onClick={() => setViewVariablesContact(null)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {Object.entries(viewVariablesContact.customFields || {}).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 text-xs"
                >
                  <span className="font-mono text-purple-700 dark:text-purple-300 font-bold">{k}</span>
                  <span className="text-neutral-800 dark:text-neutral-200 font-semibold">{v}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setViewVariablesContact(null)}
              className="w-full py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 font-bold cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* 6. SINGLE CONTACT DELETE CONFIRMATION */}
      {contactToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-xs">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white">Delete Contact?</h3>
              <p className="text-neutral-500 leading-relaxed">
                Permanently delete <strong>"{contactToDelete.name}"</strong> ({contactToDelete.phone})? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setContactToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingContact}
                onClick={confirmDeleteContact}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isDeletingContact ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. BULK CONTACTS DELETE CONFIRMATION */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-xs">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                Delete {selectedContactIds.length} Selected Contacts?
              </h3>
              <p className="text-neutral-500 leading-relaxed">
                Permanently delete all {selectedContactIds.length} selected contacts from your WhatsApp audience?
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isBulkDeleting}
                onClick={confirmBulkDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isBulkDeleting ? 'Deleting...' : 'Delete All Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. AUDIENCE GROUP DELETE CONFIRMATION */}
      {groupToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-xs">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                Delete Audience Group?
              </h3>
              <p className="text-neutral-500 leading-relaxed">
                Delete group <strong>"{groupToDelete.name}"</strong>? Contacts assigned to this group will remain in your address book.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setGroupToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingGroup}
                onClick={confirmDeleteGroup}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isDeletingGroup ? 'Deleting...' : 'Yes, Delete Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
