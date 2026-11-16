import React, { useState, useEffect, useMemo } from 'react';
import {
  ChatSession,
  DocumentRecord,
  Message,
  SelectableFileOption,
  VectorDbConfig,
  VectorDbStats,
} from './types.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { ChatArea } from './components/ChatArea.tsx';
import { UnifiedUploadModal } from './components/UnifiedUploadModal.tsx';
import { EditDocumentModal } from './components/EditDocumentModal.tsx';
import { DeleteConfirmModal } from './components/DeleteConfirmModal.tsx';
import { VectorDbSettingsModal } from './components/VectorDbSettingsModal.tsx';
import { UploadCloud } from 'lucide-react';

const STORAGE_KEY_SESSIONS = 'rag_chat_sessions_v2';
const STORAGE_KEY_FOLDERS = 'rag_custom_folders_v1';

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [selectedDocFilter, setSelectedDocFilter] = useState<string[]>([]);
  const [customFolders, setCustomFolders] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [activeStage, setActiveStage] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Single Unified Upload Modal
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  // Edit Document Modal
  const [editingDoc, setEditingDoc] = useState<DocumentRecord | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Delete Document Confirmation Modal State
  const [docToDelete, setDocToDelete] = useState<DocumentRecord | null>(null);
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);

  // Qdrant Vector Database Modal State
  const [isVectorDbModalOpen, setIsVectorDbModalOpen] = useState(false);
  const [vectorDbConfig, setVectorDbConfig] = useState<VectorDbConfig>({
    mode: 'local',
    qdrantUrl: '',
    collectionName: 'vectorai_documents',
    hasQdrantApiKey: false,
  });
  const [vectorDbStats, setVectorDbStats] = useState<VectorDbStats | null>(null);

  // Load Sessions from LocalStorage
  useEffect(() => {
    try {
      const savedSessions = localStorage.getItem(STORAGE_KEY_SESSIONS);
      if (savedSessions) {
        const parsed = JSON.parse(savedSessions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChatSessions(parsed);
          setActiveSessionId(parsed[0].id);
        } else {
          initDefaultSession();
        }
      } else {
        initDefaultSession();
      }

      const savedFolders = localStorage.getItem(STORAGE_KEY_FOLDERS);
      if (savedFolders) {
        const parsedFolders = JSON.parse(savedFolders);
        if (Array.isArray(parsedFolders)) {
          setCustomFolders(parsedFolders);
        }
      }
    } catch (e) {
      console.error('Failed to load initial data from storage', e);
      initDefaultSession();
    }
  }, []);

  // Load Vector Database Config & Stats from Backend
  const fetchVectorDbConfig = async () => {
    try {
      const res = await fetch('/api/rag/vectordb-config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) setVectorDbConfig(data.config);
        if (data.stats) setVectorDbStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load vector database config:', err);
    }
  };

  useEffect(() => {
    fetchVectorDbConfig();
  }, []);

  const initDefaultSession = () => {
    const initialSession: ChatSession = {
      id: `session_${Date.now()}`,
      title: 'Document Q&A',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    setChatSessions([initialSession]);
    setActiveSessionId(initialSession.id);
  };

  // Save Sessions to LocalStorage
  useEffect(() => {
    if (chatSessions.length > 0) {
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(chatSessions));
    }
  }, [chatSessions]);

  // Save Custom Folders to LocalStorage
  useEffect(() => {
    if (customFolders.length > 0) {
      localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(customFolders));
    }
  }, [customFolders]);

  // Fetch Documents from server API
  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/rag/documents');
      if (res.ok) {
        const data = await res.json();
        if (data.documents) {
          setDocuments(data.documents);
        }
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const activeSession =
    chatSessions.find((s) => s.id === activeSessionId) || chatSessions[0];

  // All combined folders
  const allFolders = useMemo(() => {
    const fromDocs = documents.map((d) => d.folder).filter(Boolean) as string[];
    const combined = Array.from(new Set([...fromDocs, ...customFolders]));
    return combined;
  }, [documents, customFolders]);

  // Create New Chat Session
  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: `session_${Date.now()}`,
      title: 'New Conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    setChatSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setIsMobileMenuOpen(false);
  };

  // Delete Session
  const handleDeleteSession = (sessionId: string) => {
    setChatSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId);
      if (filtered.length === 0) {
        const fresh: ChatSession = {
          id: `session_${Date.now()}`,
          title: 'New Conversation',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
        };
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === sessionId) {
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  // Request Delete Document (triggers in-app modal without window.confirm)
  const handleRequestDeleteDocument = (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    if (doc) {
      setDocToDelete(doc);
    }
  };

  // Confirm Delete Document from modal
  const handleConfirmDeleteDocument = async () => {
    if (!docToDelete) return;
    setIsDeletingDoc(true);
    const docId = docToDelete.id;
    const docName = docToDelete.name;

    try {
      const res = await fetch(`/api/rag/documents/${docId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        setSelectedDocFilter((prev) => prev.filter((id) => id !== docId));
        setDocToDelete(null);
        fetchVectorDbConfig();

        if (activeSession) {
          const dbSuffix = data.deletedFromQdrant
            ? ` and removed from Qdrant collection "${vectorDbConfig.collectionName}"`
            : ' from the vector database';
          const deleteNotice: Message = {
            id: `msg_${Date.now()}_assistant_del_confirm`,
            role: 'assistant',
            content: `Document **${docName}** and its vector embeddings have been deleted${dbSuffix}.`,
            timestamp: new Date().toISOString(),
          };

          setChatSessions((prev) =>
            prev.map((s) =>
              s.id === activeSession.id
                ? {
                    ...s,
                    updatedAt: new Date().toISOString(),
                    messages: [...s.messages, deleteNotice],
                  }
                : s
            )
          );
        }
      } else {
        setDocToDelete(null);
        if (activeSession) {
          const errNotice: Message = {
            id: `msg_${Date.now()}_assistant_del_error`,
            role: 'assistant',
            content: `Failed to delete **${docName}**: ${data.error || 'Could not remove vectors from the database.'}`,
            timestamp: new Date().toISOString(),
          };
          setChatSessions((prev) =>
            prev.map((s) =>
              s.id === activeSession.id
                ? { ...s, updatedAt: new Date().toISOString(), messages: [...s.messages, errNotice] }
                : s
            )
          );
        }
      }
    } catch (err: any) {
      console.error('Failed to delete document:', err);
      setDocToDelete(null);
      if (activeSession) {
        const errNotice: Message = {
          id: `msg_${Date.now()}_assistant_del_error`,
          role: 'assistant',
          content: `Failed to delete **${docName}**: ${err?.message || 'Network error while removing vectors.'}`,
          timestamp: new Date().toISOString(),
        };
        setChatSessions((prev) =>
          prev.map((s) =>
            s.id === activeSession.id
              ? { ...s, updatedAt: new Date().toISOString(), messages: [...s.messages, errNotice] }
              : s
          )
        );
      }
    } finally {
      setIsDeletingDoc(false);
    }
  };

  // Move Document between folders
  const handleMoveDocument = async (docId: string, targetFolder: string) => {
    const trimmedFolder = targetFolder.trim();

    // Optimistic UI update
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, folder: trimmedFolder } : d))
    );

    if (trimmedFolder && !customFolders.includes(trimmedFolder)) {
      setCustomFolders((prev) => [...prev, trimmedFolder]);
    }

    try {
      const res = await fetch(`/api/rag/documents/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: trimmedFolder }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.document) {
          setDocuments((prev) =>
            prev.map((d) => (d.id === docId ? { ...d, ...data.document } : d))
          );
        }
      }
    } catch (err) {
      console.error('Failed to move document:', err);
      fetchDocuments();
    }
  };

  // Delete Custom Folder
  const handleDeleteFolder = (folderName: string) => {
    setCustomFolders((prev) => prev.filter((f) => f !== folderName));
    setDocuments((prev) =>
      prev.map((d) => (d.folder === folderName ? { ...d, folder: '' } : d))
    );
  };

  // Open Edit Modal for a Document
  const handleOpenEditDocument = (doc: DocumentRecord) => {
    setEditingDoc(doc);
    setIsEditModalOpen(true);
  };

  const handleSelectFileToEdit = (fileId: string) => {
    const doc = documents.find((d) => d.id === fileId);
    if (doc) {
      handleOpenEditDocument(doc);
    }
  };

  // When a document is saved via Edit modal
  const handleDocumentSaved = (updatedDoc: DocumentRecord) => {
    fetchDocuments();

    if (updatedDoc.folder && !customFolders.includes(updatedDoc.folder)) {
      setCustomFolders((prev) => [...prev, updatedDoc.folder!]);
    }

    // Append confirmation in chat
    if (activeSession) {
      const confirmMessage: Message = {
        id: `msg_${Date.now()}_assistant_edit_confirm`,
        role: 'assistant',
        content: `File **${updatedDoc.name}** has been updated and re-indexed into the vector knowledge base.`,
        timestamp: new Date().toISOString(),
      };

      setChatSessions((prev) =>
        prev.map((s) => {
          if (s.id === activeSession.id) {
            return {
              ...s,
              updatedAt: new Date().toISOString(),
              messages: [...s.messages, confirmMessage],
            };
          }
          return s;
        })
      );
    }
  };

  // Create custom folder
  const handleCreateFolder = (name: string) => {
    if (!name.trim()) return;
    const trimmed = name.trim();
    if (!customFolders.includes(trimmed)) {
      setCustomFolders((prev) => [...prev, trimmed]);
    }
  };

  // Toggle Document Filter Scope
  const handleToggleDocFilter = (docId: string) => {
    setSelectedDocFilter((prev) => {
      if (prev.includes(docId)) {
        return prev.filter((id) => id !== docId);
      } else {
        return [...prev, docId];
      }
    });
  };

  const handleSelectAllDocs = () => {
    setSelectedDocFilter([]);
  };

  // Send Message through RAG pipeline or handle /edit command
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !activeSession) return;

    const trimmedText = text.trim();

    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: trimmedText,
      timestamp: new Date().toISOString(),
    };

    // Auto-update conversation title on first message
    const isFirst = activeSession.messages.length === 0;
    const newTitle = isFirst
      ? trimmedText.length > 36
        ? `${trimmedText.slice(0, 36)}...`
        : trimmedText
      : activeSession.title;

    // Handle /edit command
    if (trimmedText.toLowerCase().startsWith('/edit')) {
      const rest = trimmedText.slice(5).trim();

      // Check if user specified a document name after /edit
      if (rest.length > 0) {
        const matched = documents.find(
          (d) => d.name.toLowerCase().includes(rest.toLowerCase()) || d.id === rest
        );
        if (matched) {
          const assistantMessage: Message = {
            id: `msg_${Date.now()}_assistant_edit`,
            role: 'assistant',
            content: `Opening editor for **${matched.name}**...`,
            timestamp: new Date().toISOString(),
          };

          setChatSessions((prev) =>
            prev.map((s) => {
              if (s.id === activeSession.id) {
                return {
                  ...s,
                  title: newTitle,
                  updatedAt: new Date().toISOString(),
                  messages: [...s.messages, userMessage, assistantMessage],
                };
              }
              return s;
            })
          );
          handleOpenEditDocument(matched);
          return;
        }
      }

      // No specific file specified or not found: ask which file to edit
      const selectableFiles: SelectableFileOption[] = documents.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        chunkCount: d.chunkCount,
        folder: d.folder,
      }));

      const assistantMessage: Message = {
        id: `msg_${Date.now()}_assistant_edit_prompt`,
        role: 'assistant',
        content:
          documents.length === 0
            ? "You don't have any uploaded documents yet. Please upload a document first to view or edit its information."
            : 'Which file would you like to edit? Select one from your knowledge base below to update its name, folder, or indexed content:',
        timestamp: new Date().toISOString(),
        isEditFilePrompt: documents.length > 0,
        selectableFiles: documents.length > 0 ? selectableFiles : undefined,
      };

      setChatSessions((prev) =>
        prev.map((s) => {
          if (s.id === activeSession.id) {
            return {
              ...s,
              title: newTitle,
              updatedAt: new Date().toISOString(),
              messages: [...s.messages, userMessage, assistantMessage],
            };
          }
          return s;
        })
      );
      return;
    }

    // Standard RAG Query
    setChatSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeSession.id) {
          return {
            ...s,
            title: newTitle,
            updatedAt: new Date().toISOString(),
            messages: [...s.messages, userMessage],
          };
        }
        return s;
      })
    );

    setIsLoading(true);
    setActiveStage('Searching knowledge base & retrieving relevant sections...');

    try {
      const history = activeSession.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmedText,
          history,
          filterDocIds: selectedDocFilter.length > 0 ? selectedDocFilter : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get answer from documents');
      }

      const assistantMessage: Message = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: data.answer,
        timestamp: new Date().toISOString(),
        sources: data.sources || [],
      };

      setChatSessions((prev) =>
        prev.map((s) => {
          if (s.id === activeSession.id) {
            return {
              ...s,
              updatedAt: new Date().toISOString(),
              messages: [...s.messages, assistantMessage],
            };
          }
          return s;
        })
      );
    } catch (err: any) {
      console.error('Query error:', err);
      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: `Error retrieving answer: ${
          err.message || 'An unexpected error occurred while searching documents.'
        }`,
        timestamp: new Date().toISOString(),
      };

      setChatSessions((prev) =>
        prev.map((s) => {
          if (s.id === activeSession.id) {
            return {
              ...s,
              messages: [...s.messages, errorMessage],
            };
          }
          return s;
        })
      );
    } finally {
      setIsLoading(false);
      setActiveStage('');
    }
  };

  // Feedback on message
  const handleFeedback = (messageId: string, feedback: 'like' | 'dislike') => {
    if (!activeSession) return;
    setChatSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeSession.id) {
          return {
            ...s,
            messages: s.messages.map((m) => {
              if (m.id === messageId) {
                return { ...m, feedback };
              }
              return m;
            }),
          };
        }
        return s;
      })
    );
  };

  // Clear Chat in active session
  const handleClearChat = () => {
    if (!activeSession) return;
    setChatSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeSession.id) {
          return {
            ...s,
            messages: [],
            updatedAt: new Date().toISOString(),
          };
        }
        return s;
      })
    );
  };

  // Global Drag and Drop support
  const handleGlobalDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      setIsGlobalDragging(true);
    }
  };

  const handleGlobalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleGlobalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      e.clientX <= 0 ||
      e.clientY <= 0 ||
      e.clientX >= window.innerWidth ||
      e.clientY >= window.innerHeight
    ) {
      setIsGlobalDragging(false);
    }
  };

  const handleGlobalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsGlobalDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setDroppedFile(e.dataTransfer.files[0]);
      setIsUploadOpen(true);
    }
  };

  return (
    <div
      onDragEnter={handleGlobalDragEnter}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
      className="flex h-screen w-screen overflow-hidden bg-black text-white font-sans antialiased relative"
    >
      {/* Global Drag-and-Drop Overlay (Monochrome & Grey) */}
      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-black/85 border-4 border-dashed border-zinc-500 flex flex-col items-center justify-center p-6 backdrop-blur-xs">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 text-white flex items-center justify-center mb-4 shadow-xl border border-zinc-700">
            <UploadCloud className="w-8 h-8 animate-bounce" />
          </div>
          <h3 className="text-xl font-bold text-white mb-1">
            Drop document to add to knowledge base
          </h3>
          <p className="text-sm text-zinc-400">
            Supports PDF, DOCX, TXT, CSV, or Markdown
          </p>
        </div>
      )}

      {/* 1. Left Sidebar: Grey & Monochrome Theme with Folder Support & Edit Action */}
      <Sidebar
        documents={documents}
        chatSessions={chatSessions}
        activeSessionId={activeSession?.id || ''}
        selectedDocFilter={selectedDocFilter}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onNewChat={handleNewChat}
        onOpenUpload={() => {
          setDroppedFile(null);
          setIsUploadOpen(true);
        }}
        onSelectSession={(id) => {
          setActiveSessionId(id);
          setIsMobileMenuOpen(false);
        }}
        onDeleteSession={handleDeleteSession}
        onDeleteDocument={handleRequestDeleteDocument}
        onEditDocument={handleOpenEditDocument}
        onMoveDocument={handleMoveDocument}
        onDeleteFolder={handleDeleteFolder}
        onToggleDocFilter={handleToggleDocFilter}
        onSelectAllDocs={handleSelectAllDocs}
        customFolders={customFolders}
        onCreateFolder={handleCreateFolder}
        vectorDbConfig={vectorDbConfig}
        onOpenVectorDbSettings={() => {
          fetchVectorDbConfig();
          setIsVectorDbModalOpen(true);
        }}
      />

      {/* 2. Main Chat Area: Simple, Clean, Mic Voice Input & /edit support */}
      <ChatArea
        messages={activeSession?.messages || []}
        sessionTitle={activeSession?.title || 'VectorAI'}
        documents={documents}
        selectedDocFilter={selectedDocFilter}
        isLoading={isLoading}
        activeStage={activeStage}
        onSendMessage={handleSendMessage}
        onCitationClick={() => {}}
        onFeedback={handleFeedback}
        onClearChat={handleClearChat}
        onOpenUpload={() => {
          setDroppedFile(null);
          setIsUploadOpen(true);
        }}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        onSelectFileToEdit={handleSelectFileToEdit}
        vectorDbConfig={vectorDbConfig}
        onOpenVectorDbSettings={() => {
          fetchVectorDbConfig();
          setIsVectorDbModalOpen(true);
        }}
      />

      {/* 3. Unified Upload Modal */}
      <UnifiedUploadModal
        isOpen={isUploadOpen}
        initialFile={droppedFile}
        folders={allFolders}
        onClose={() => {
          setIsUploadOpen(false);
          setDroppedFile(null);
        }}
        onUploadSuccess={() => {
          fetchDocuments();
          fetchVectorDbConfig();
        }}
      />

      {/* 4. Edit Document Modal (Name, Folder, Text Content) */}
      <EditDocumentModal
        isOpen={isEditModalOpen}
        document={editingDoc}
        existingFolders={allFolders}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingDoc(null);
        }}
        onSaved={handleDocumentSaved}
        onDelete={handleRequestDeleteDocument}
      />

      {/* 5. In-App Delete Confirmation Modal (Works for all files) */}
      <DeleteConfirmModal
        isOpen={Boolean(docToDelete)}
        docName={docToDelete?.name || ''}
        chunkCount={docToDelete?.chunkCount}
        isDeleting={isDeletingDoc}
        onConfirm={handleConfirmDeleteDocument}
        onCancel={() => setDocToDelete(null)}
      />

      {/* 6. Qdrant Vector Database & Gemini Pipeline Modal */}
      <VectorDbSettingsModal
        isOpen={isVectorDbModalOpen}
        initialConfig={vectorDbConfig}
        stats={vectorDbStats}
        onClose={() => setIsVectorDbModalOpen(false)}
        onConfigUpdated={(updatedConfig, updatedStats) => {
          setVectorDbConfig(updatedConfig);
          if (updatedStats) setVectorDbStats(updatedStats);
          fetchDocuments();
        }}
      />
    </div>
  );
}
