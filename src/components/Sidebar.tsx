import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileText,
  UploadCloud,
  Plus,
  Trash2,
  MessageSquare,
  Edit3,
  Folder,
  FolderPlus,
  FolderInput,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Check,
  X,
  Database,
} from 'lucide-react';
import { ChatSession, DocumentRecord, VectorDbConfig } from '../types.ts';

interface SidebarProps {
  documents: DocumentRecord[];
  chatSessions: ChatSession[];
  activeSessionId: string;
  selectedDocFilter: string[];
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onNewChat: () => void;
  onOpenUpload: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onDeleteDocument: (id: string) => void;
  onEditDocument: (doc: DocumentRecord) => void;
  onMoveDocument: (docId: string, targetFolder: string) => void;
  onToggleDocFilter: (id: string) => void;
  onSelectAllDocs: () => void;
  customFolders: string[];
  onCreateFolder: (name: string) => void;
  onDeleteFolder?: (folderName: string) => void;
  vectorDbConfig?: VectorDbConfig;
  onOpenVectorDbSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documents,
  chatSessions,
  activeSessionId,
  selectedDocFilter,
  isOpenMobile,
  onCloseMobile,
  onNewChat,
  onOpenUpload,
  onSelectSession,
  onDeleteSession,
  onDeleteDocument,
  onEditDocument,
  onMoveDocument,
  onToggleDocFilter,
  onSelectAllDocs,
  customFolders,
  onCreateFolder,
  onDeleteFolder,
  vectorDbConfig,
  onOpenVectorDbSettings,
}) => {
  // Folder organization mode: 'folders' (categorized) | 'flat' (all files)
  const [organizeMode, setOrganizeMode] = useState<'folders' | 'flat'>('folders');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState('');

  // Move menu popover state
  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const [inlineFolderInputDocId, setInlineFolderInputDocId] = useState<string | null>(null);
  const [inlineNewFolderName, setInlineNewFolderName] = useState('');

  // Drag and drop state
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const moveMenuRef = useRef<HTMLDivElement>(null);

  // Close move menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) {
        setMovingDocId(null);
        setInlineFolderInputDocId(null);
      }
    };
    if (movingDocId) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [movingDocId]);

  const toggleFolderCollapse = (folderKey: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderKey]: !prev[folderKey],
    }));
  };

  const getFileBadge = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return (
          <span className="text-[10px] font-bold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 shrink-0">
            PDF
          </span>
        );
      case 'docx':
      case 'doc':
        return (
          <span className="text-[10px] font-bold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 shrink-0">
            DOC
          </span>
        );
      case 'csv':
        return (
          <span className="text-[10px] font-bold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 shrink-0">
            CSV
          </span>
        );
      case 'md':
        return (
          <span className="text-[10px] font-bold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 shrink-0">
            MD
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-bold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 shrink-0">
            TXT
          </span>
        );
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDefaultFolderForDoc = (doc: DocumentRecord): string => {
    if (doc.folder && doc.folder.trim()) {
      return doc.folder.trim();
    }
    const ext = doc.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return 'PDF Documents';
    if (ext === 'docx' || ext === 'doc') return 'Word Documents';
    if (ext === 'csv' || ext === 'xlsx' || ext === 'json') return 'Spreadsheets & Data';
    if (ext === 'md' || ext === 'txt') return 'Text & Markdown';
    return 'General Files';
  };

  // Grouped documents for folder mode
  const groupedDocs = useMemo<Record<string, DocumentRecord[]>>(() => {
    const groups: Record<string, DocumentRecord[]> = {};

    // 1. Initialize user-created custom folders (even if empty)
    customFolders.forEach((f) => {
      const trimmed = f.trim();
      if (trimmed && !groups[trimmed]) {
        groups[trimmed] = [];
      }
    });

    // 2. Distribute documents into their folders
    documents.forEach((doc) => {
      const folderKey = doc.folder && doc.folder.trim() ? doc.folder.trim() : getDefaultFolderForDoc(doc);
      if (!groups[folderKey]) {
        groups[folderKey] = [];
      }
      groups[folderKey].push(doc);
    });

    return groups;
  }, [documents, customFolders]);

  // List of all folder names available to move files into
  const availableFolderNames = useMemo<string[]>(() => {
    const set = new Set<string>();
    customFolders.forEach((f) => {
      if (f.trim()) set.add(f.trim());
    });
    Object.keys(groupedDocs).forEach((f) => {
      if (f.trim()) set.add(f.trim());
    });
    return Array.from(set);
  }, [customFolders, groupedDocs]);

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderNameInput.trim()) {
      onCreateFolder(newFolderNameInput.trim());
      setNewFolderNameInput('');
      setIsCreatingFolder(false);
      setOrganizeMode('folders');
    }
  };

  const handleInlineNewFolderMove = (docId: string) => {
    if (inlineNewFolderName.trim()) {
      const target = inlineNewFolderName.trim();
      onCreateFolder(target);
      onMoveDocument(docId, target);
      setInlineNewFolderName('');
      setInlineFolderInputDocId(null);
      setMovingDocId(null);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Main Sidebar (Refined Grey Palette) */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 bg-[#0c0c0e] border-r border-zinc-800 flex flex-col transition-transform duration-200 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* App Branding */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-[#111113]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-750 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-4 h-4 text-zinc-300" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white tracking-tight">
                VectorAI
              </h1>
              <p className="text-[11px] text-zinc-400">
                Knowledge Base & RAG
              </p>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="p-3 space-y-2 border-b border-zinc-800/80">
          {/* 1. New Chat Button */}
          <button
            type="button"
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#18181b] hover:bg-[#27272a] text-zinc-200 hover:text-white rounded-xl text-xs font-semibold border border-zinc-800 hover:border-zinc-700 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-zinc-400" />
            <span>New Chat</span>
          </button>

          {/* 2. Upload Document Button */}
          <button
            type="button"
            onClick={onOpenUpload}
            className="w-full flex items-center justify-between px-3.5 py-2.5 bg-zinc-100 hover:bg-white text-black rounded-xl text-xs font-semibold shadow-md transition-all border border-white/20 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <UploadCloud className="w-4 h-4" />
              <span>Upload Document</span>
            </div>
            <span className="text-[10px] bg-zinc-300/80 px-1.5 py-0.5 rounded text-zinc-900 font-medium">
              Multi-Source
            </span>
          </button>
        </div>

        {/* Scrollable Center Content */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
          {/* SECTION: Documents & Folders */}
          <div className="p-3">
            <div className="flex items-center justify-between px-1 mb-2.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Files ({documents.length})
              </span>

              {/* Action controls: + New Folder & View Toggle */}
              <div className="flex items-center gap-1.5">
                {/* 1. Add New Folder Button */}
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder((prev) => !prev)}
                  className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                    isCreatingFolder
                      ? 'bg-zinc-700 border-zinc-500 text-white font-medium'
                      : 'bg-zinc-850 hover:bg-zinc-800 border-zinc-750 text-zinc-300 hover:text-white'
                  }`}
                  title="Create a new folder to organize files"
                >
                  <FolderPlus className="w-3 h-3 text-zinc-400" />
                  <span>+ Folder</span>
                </button>

                {/* 2. Folder vs Flat View Toggle */}
                <button
                  type="button"
                  onClick={() => setOrganizeMode((prev) => (prev === 'folders' ? 'flat' : 'folders'))}
                  className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                    organizeMode === 'folders'
                      ? 'bg-zinc-800 border-zinc-600 text-white font-medium'
                      : 'bg-transparent border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Toggle folder organization view"
                >
                  {organizeMode === 'folders' ? 'Folders' : 'All Files'}
                </button>

                {documents.length > 0 && selectedDocFilter.length > 0 && (
                  <button
                    type="button"
                    onClick={onSelectAllDocs}
                    className="text-[10px] text-zinc-300 hover:text-white font-medium cursor-pointer"
                  >
                    Query All
                  </button>
                )}
              </div>
            </div>

            {/* Folder creation form */}
            {isCreatingFolder && (
              <form onSubmit={handleCreateFolderSubmit} className="mb-3 p-2 bg-[#141416] border border-zinc-700 rounded-xl space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between text-[11px] text-zinc-300 font-medium px-0.5">
                  <span className="flex items-center gap-1.5">
                    <FolderPlus className="w-3 h-3 text-zinc-400" />
                    <span>Create New Folder</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCreatingFolder(false)}
                    className="text-zinc-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newFolderNameInput}
                    onChange={(e) => setNewFolderNameInput(e.target.value)}
                    placeholder="e.g. Research, Contracts, Data"
                    className="flex-1 bg-[#18181b] border border-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-400 placeholder-zinc-500"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!newFolderNameInput.trim()}
                    className="text-xs px-3 py-1.5 bg-white hover:bg-zinc-200 disabled:opacity-50 text-black font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            {documents.length === 0 && customFolders.length === 0 ? (
              <div className="text-center py-6 px-2 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
                <FileText className="w-6 h-6 text-zinc-600 mx-auto mb-1.5" />
                <p className="text-xs text-zinc-400 font-medium">No documents yet</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Click Upload Document to add files
                </p>
              </div>
            ) : organizeMode === 'folders' ? (
              /* FOLDERS VIEW (Movable via Drag & Drop or Move Button) */
              <div className="space-y-2">
                {(Object.entries(groupedDocs) as [string, DocumentRecord[]][]).map(([folderName, docsInFolder], folderIdx) => {
                  if (folderIdx === 0) return null;
                  const isCollapsed = Boolean(collapsedFolders[folderName]);
                  const isDragOver = dragOverFolder === folderName;
                  const isCustom = customFolders.includes(folderName);

                  return (
                    <div
                      key={folderName}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverFolder !== folderName) {
                          setDragOverFolder(folderName);
                        }
                      }}
                      onDragLeave={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                        setDragOverFolder(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const docId = e.dataTransfer.getData('text/plain') || draggedDocId;
                        if (docId) {
                          onMoveDocument(docId, folderName);
                        }
                        setDraggedDocId(null);
                        setDragOverFolder(null);
                      }}
                      className={`border rounded-xl bg-[#141416] transition-all overflow-hidden ${
                        isDragOver
                          ? 'border-zinc-300 ring-2 ring-zinc-400/30 bg-[#1c1c20]'
                          : 'border-zinc-800/80 hover:border-zinc-700/80'
                      }`}
                    >
                      {/* Folder Header / Drop Target */}
                      <div className="flex items-center justify-between p-2 hover:bg-zinc-850/60 transition-colors">
                        <button
                          type="button"
                          onClick={() => toggleFolderCollapse(folderName)}
                          className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          )}
                          <Folder className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="text-xs font-semibold text-zinc-200 truncate">
                            {folderName}
                          </span>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-zinc-400 px-1.5 py-0.5 bg-zinc-800/80 border border-zinc-700/50 rounded font-medium">
                            {docsInFolder.length}
                          </span>
                          {isCustom && onDeleteFolder && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteFolder(folderName);
                              }}
                              className="p-1 text-zinc-500 hover:text-red-400 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                              title={`Delete folder "${folderName}"`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Drop hint when dragging over folder */}
                      {isDragOver && (
                        <div className="px-3 py-1.5 bg-zinc-800/90 text-center text-[11px] text-white font-medium border-t border-zinc-700">
                          Drop to move into "{folderName}"
                        </div>
                      )}

                      {/* Folder Contents */}
                      {!isCollapsed && (
                        <div className="p-1 space-y-1 border-t border-zinc-800/50">
                          {docsInFolder.length === 0 ? (
                            <div className="py-2.5 px-3 text-center text-[11px] text-zinc-500 border border-dashed border-zinc-800/80 rounded-lg bg-zinc-900/30">
                              Empty folder • Drag files here or use Move button
                            </div>
                          ) : (
                            docsInFolder.map((doc) => {
                              const isFiltered =
                                selectedDocFilter.length === 0 || selectedDocFilter.includes(doc.id);
                              const isThisDocMoving = movingDocId === doc.id;

                              return (
                                <div key={doc.id} className="relative">
                                  <div
                                    draggable={true}
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData('text/plain', doc.id);
                                      e.dataTransfer.effectAllowed = 'move';
                                      setDraggedDocId(doc.id);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedDocId(null);
                                      setDragOverFolder(null);
                                    }}
                                    className={`group flex items-center justify-between p-1.5 rounded-lg border text-xs transition-all ${
                                      draggedDocId === doc.id
                                        ? 'opacity-40 border-dashed border-zinc-600 bg-zinc-900'
                                        : isFiltered
                                        ? 'bg-[#18181b] border-zinc-750 text-zinc-200'
                                        : 'bg-transparent border-transparent opacity-60 text-zinc-500 hover:bg-zinc-850'
                                    }`}
                                  >
                                    {/* Drag Handle & Info */}
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                      <span
                                        className="text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing p-0.5 shrink-0"
                                        title="Drag to move to another folder"
                                      >
                                        <GripVertical className="w-3.5 h-3.5" />
                                      </span>

                                      <div
                                        onClick={() => onToggleDocFilter(doc.id)}
                                        className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer pr-1"
                                        title={`Filter scope: ${doc.name}`}
                                      >
                                        {getFileBadge(doc.name)}
                                        <div className="min-w-0 flex-1">
                                          <p className="font-medium text-white truncate text-xs">
                                            {doc.name}
                                          </p>
                                          <p className="text-[10px] text-zinc-400">
                                            {formatSize(doc.size)} • {doc.chunkCount} chunks
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Actions: Move, Edit, Delete */}
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      {/* Move to Folder Button */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMovingDocId((prev) => (prev === doc.id ? null : doc.id));
                                          setInlineFolderInputDocId(null);
                                        }}
                                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                          isThisDocMoving
                                            ? 'bg-zinc-700 text-white'
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                                        }`}
                                        title="Move to another folder"
                                      >
                                        <FolderInput className="w-3.5 h-3.5" />
                                      </button>

                                      {/* Edit Button */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onEditDocument(doc);
                                        }}
                                        className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                                        title="Edit file info / content"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>

                                      {/* Delete Button (Working for all files) */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onDeleteDocument(doc.id);
                                        }}
                                        className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-red-950/20 transition-colors cursor-pointer"
                                        title="Delete document"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Quick "Move to Folder" Dropdown Menu */}
                                  {isThisDocMoving && (
                                    <div
                                      ref={moveMenuRef}
                                      className="absolute right-0 top-full mt-1 z-30 w-56 bg-[#18181b] border border-zinc-700 rounded-xl shadow-2xl p-2 text-xs animate-in fade-in"
                                    >
                                      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-zinc-800 text-[11px] font-semibold text-zinc-300">
                                        <span>Move "{doc.name.slice(0, 15)}..."</span>
                                        <button
                                          type="button"
                                          onClick={() => setMovingDocId(null)}
                                          className="text-zinc-500 hover:text-white"
                                        >
                                          ✕
                                        </button>
                                      </div>

                                      <p className="text-[10px] text-zinc-500 mb-1 px-1">Select folder destination:</p>

                                      <div className="max-h-36 overflow-y-auto space-y-0.5">
                                        {availableFolderNames.map((folderOption) => {
                                          const isCurrent = (doc.folder || getDefaultFolderForDoc(doc)) === folderOption;
                                          return (
                                            <button
                                              key={folderOption}
                                              type="button"
                                              onClick={() => {
                                                onMoveDocument(doc.id, folderOption);
                                                setMovingDocId(null);
                                              }}
                                              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                                                isCurrent
                                                  ? 'bg-zinc-800 text-white font-medium'
                                                  : 'text-zinc-300 hover:bg-zinc-800/60 hover:text-white'
                                              }`}
                                            >
                                              <span className="flex items-center gap-1.5 truncate">
                                                <Folder className="w-3 h-3 text-zinc-400" />
                                                <span className="truncate">{folderOption}</span>
                                              </span>
                                              {isCurrent && <Check className="w-3 h-3 text-zinc-400 shrink-0" />}
                                            </button>
                                          );
                                        })}
                                      </div>

                                      {/* Move to New Folder Option */}
                                      <div className="mt-1.5 pt-1.5 border-t border-zinc-800">
                                        {inlineFolderInputDocId === doc.id ? (
                                          <div className="flex items-center gap-1 mt-1">
                                            <input
                                              type="text"
                                              value={inlineNewFolderName}
                                              onChange={(e) => setInlineNewFolderName(e.target.value)}
                                              placeholder="New folder..."
                                              className="flex-1 bg-black border border-zinc-700 text-white text-xs px-2 py-1 rounded focus:outline-none focus:border-zinc-400"
                                              autoFocus
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleInlineNewFolderMove(doc.id);
                                              }}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleInlineNewFolderMove(doc.id)}
                                              className="px-2 py-1 bg-white text-black font-semibold text-[11px] rounded"
                                            >
                                              Move
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setInlineFolderInputDocId(doc.id)}
                                            className="w-full flex items-center gap-1.5 px-2 py-1 text-zinc-400 hover:text-white text-[11px] rounded hover:bg-zinc-800 cursor-pointer"
                                          >
                                            <FolderPlus className="w-3 h-3" />
                                            <span>+ Move to new folder...</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* FLAT LIST VIEW */
              <div className="space-y-1.5">
                {documents.map((doc) => {
                  const isFiltered =
                    selectedDocFilter.length === 0 || selectedDocFilter.includes(doc.id);
                  const isThisDocMoving = movingDocId === doc.id;

                  return (
                    <div key={doc.id} className="relative">
                      <div
                        className={`group flex items-center justify-between p-2 rounded-xl border text-xs transition-colors ${
                          isFiltered
                            ? 'bg-[#18181b] border-zinc-750 text-zinc-200'
                            : 'bg-transparent border-transparent opacity-60 text-zinc-500 hover:bg-zinc-900/40'
                        }`}
                      >
                        <div
                          onClick={() => onToggleDocFilter(doc.id)}
                          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer pr-1"
                          title={doc.name}
                        >
                          {getFileBadge(doc.name)}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-white truncate text-xs">
                              {doc.name}
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              {doc.folder ? `${doc.folder} • ` : ''}
                              {formatSize(doc.size)} • {doc.chunkCount} chunks
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Move Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMovingDocId((prev) => (prev === doc.id ? null : doc.id));
                              setInlineFolderInputDocId(null);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Move to folder"
                          >
                            <FolderInput className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditDocument(doc);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Edit file info / content"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteDocument(doc.id);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-red-950/20 transition-colors cursor-pointer"
                            title="Delete document and vectors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Move Menu in Flat View */}
                      {isThisDocMoving && (
                        <div
                          ref={moveMenuRef}
                          className="absolute right-0 top-full mt-1 z-30 w-56 bg-[#18181b] border border-zinc-700 rounded-xl shadow-2xl p-2 text-xs animate-in fade-in"
                        >
                          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-zinc-800 text-[11px] font-semibold text-zinc-300">
                            <span>Move to Folder</span>
                            <button
                              type="button"
                              onClick={() => setMovingDocId(null)}
                              className="text-zinc-500 hover:text-white"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="max-h-36 overflow-y-auto space-y-0.5">
                            {availableFolderNames.map((folderOption) => {
                              const isCurrent = doc.folder === folderOption;
                              return (
                                <button
                                  key={folderOption}
                                  type="button"
                                  onClick={() => {
                                    onMoveDocument(doc.id, folderOption);
                                    setMovingDocId(null);
                                  }}
                                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                                    isCurrent
                                      ? 'bg-zinc-800 text-white font-medium'
                                      : 'text-zinc-300 hover:bg-zinc-800/60 hover:text-white'
                                  }`}
                                >
                                  <span className="flex items-center gap-1.5 truncate">
                                    <Folder className="w-3 h-3 text-zinc-400" />
                                    <span className="truncate">{folderOption}</span>
                                  </span>
                                  {isCurrent && <Check className="w-3 h-3 text-zinc-400 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION: Recent Chats */}
          <div className="p-3">
            <div className="px-1 mb-2">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Conversations ({chatSessions.length})
              </span>
            </div>

            <div className="space-y-1">
              {chatSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className={`group flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-zinc-800 border border-zinc-700 text-white font-medium'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <MessageSquare
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isActive ? 'text-white' : 'text-zinc-500'
                        }`}
                      />
                      <span className="truncate">{session.title}</span>
                    </div>

                    {chatSessions.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(session.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded hover:bg-zinc-800 transition-all cursor-pointer"
                        title="Delete chat session"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-zinc-800/80 bg-[#111113] space-y-2">
          {onOpenVectorDbSettings && (
            <button
              type="button"
              onClick={onOpenVectorDbSettings}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#18181b] hover:bg-[#222227] border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
              title="Configure Qdrant Vector Database & inspect Gemini models"
            >
              <span className="flex items-center gap-2 font-medium">
                <Database className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                <span>Qdrant Vector DB</span>
              </span>
              <span className="text-[11px] text-zinc-400 font-mono">
                {vectorDbConfig?.mode === 'qdrant' ? 'Cloud' : 'Local'}
              </span>
            </button>
          )}
          <div className="text-[11px] text-zinc-500 text-center">
            <span>VectorAI · Gemini & Qdrant</span>
          </div>
        </div>
      </aside>
    </>
  );
};
