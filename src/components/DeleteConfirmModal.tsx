import React from 'react';
import { Trash2, X, AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  docName: string;
  chunkCount?: number;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  docName,
  chunkCount,
  isDeleting,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div
        className="w-full max-w-md bg-[#141416] border border-zinc-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-950/30 border border-red-900/40 flex items-center justify-center text-red-400">
            <Trash2 className="w-5 h-5" />
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="p-1 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <h3 id="delete-dialog-title" className="text-base font-semibold text-white mb-2">
          Delete Document
        </h3>

        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
          Are you sure you want to delete <span className="text-white font-medium break-all">"{docName}"</span>?
          {chunkCount !== undefined && chunkCount > 0 && (
            <span className="block mt-1 text-xs text-zinc-500">
              This will remove the file and all {chunkCount} associated vector embeddings from the knowledge base.
            </span>
          )}
        </p>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Document</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
