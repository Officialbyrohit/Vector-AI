import React, { useState, useEffect } from 'react';
import { X, Save, FileText, Folder, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { DocumentRecord } from '../types.ts';

interface EditDocumentModalProps {
  isOpen: boolean;
  document: DocumentRecord | null;
  existingFolders: string[];
  onClose: () => void;
  onSaved: (updatedDoc: DocumentRecord) => void;
  onDelete?: (id: string) => void;
}

export const EditDocumentModal: React.FC<EditDocumentModalProps> = ({
  isOpen,
  document,
  existingFolders,
  onClose,
  onSaved,
  onDelete,
}) => {
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [isNewFolder, setIsNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [textContent, setTextContent] = useState('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (document && isOpen) {
      setName(document.name);
      setFolder(document.folder || '');
      setIsNewFolder(false);
      setNewFolderName('');
      setErrorMessage(null);
      setSuccessMessage(null);

      // Fetch full details with raw text
      setIsLoadingContent(true);
      fetch(`/api/rag/documents/${document.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.document && data.document.rawText !== undefined) {
            setTextContent(data.document.rawText);
          } else {
            setTextContent('');
          }
        })
        .catch((err) => {
          console.error('Failed to fetch document content:', err);
          setTextContent('');
        })
        .finally(() => {
          setIsLoadingContent(false);
        });
    }
  }, [document, isOpen]);

  if (!isOpen || !document) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Document name cannot be empty.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const finalFolder = isNewFolder ? newFolderName.trim() : folder;

    try {
      const res = await fetch(`/api/rag/documents/${document.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          folder: finalFolder,
          textContent: textContent,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update document.');
      }

      setSuccessMessage('Document updated and re-indexed successfully.');
      setTimeout(() => {
        onSaved(data.document);
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Save error:', err);
      setErrorMessage(err.message || 'An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div
        className="w-full max-w-2xl bg-[#121212] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-[#161616]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Edit Document Information</h2>
              <p className="text-xs text-zinc-400">
                Update document metadata, folder organization, and indexed content.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-xl text-zinc-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-zinc-300" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Document Name */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              File Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#18181b] border border-zinc-700 focus:border-zinc-400 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none transition-colors"
              placeholder="e.g. project_requirements.pdf"
              required
            />
          </div>

          {/* Folder Assignment */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Folder Organization
            </label>
            {!isNewFolder ? (
              <div className="flex gap-2">
                <select
                  value={folder}
                  onChange={(e) => {
                    if (e.target.value === '__NEW__') {
                      setIsNewFolder(true);
                      setNewFolderName('');
                    } else {
                      setFolder(e.target.value);
                    }
                  }}
                  className="flex-1 bg-[#18181b] border border-zinc-700 focus:border-zinc-400 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors"
                >
                  <option value="">No Folder (Root)</option>
                  {existingFolders.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                  <option value="__NEW__">+ Create New Folder...</option>
                </select>
                <button
                  type="button"
                  onClick={() => setIsNewFolder(true)}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium border border-zinc-700 transition-colors"
                >
                  + New Folder
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Enter new folder name..."
                  className="flex-1 bg-[#18181b] border border-zinc-700 focus:border-zinc-400 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none transition-colors"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setIsNewFolder(false)}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs transition-colors border border-zinc-700"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Text Content */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Document Content / Notes
              </label>
              <span className="text-[11px] text-zinc-500">
                Updating content automatically re-chunks and re-embeds vectors
              </span>
            </div>
            {isLoadingContent ? (
              <div className="h-44 bg-[#18181b] border border-zinc-800 rounded-xl flex items-center justify-center text-xs text-zinc-500 gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                <span>Loading document text...</span>
              </div>
            ) : (
              <textarea
                rows={8}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Document text content for vector indexing..."
                className="w-full bg-[#18181b] border border-zinc-700 focus:border-zinc-400 rounded-xl p-3 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none font-mono resize-y leading-relaxed transition-colors"
              />
            )}
          </div>

          <div className="text-[11px] text-zinc-500">
            Document ID: <code className="text-zinc-400">{document.id}</code> • Chunks:{' '}
            {document.chunkCount} • Size: {(document.size / 1024).toFixed(1)} KB
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
            {onDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete(document.id);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-zinc-400 hover:text-red-400 hover:bg-red-950/20 border border-transparent hover:border-red-900/30 rounded-xl text-xs font-medium transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete File</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-transparent hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-medium transition-colors border border-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2 bg-white hover:bg-zinc-200 text-black rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving & Re-indexing...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
