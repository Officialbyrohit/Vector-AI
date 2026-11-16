import React, { useState } from 'react';
import {
  X,
  FileText,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileCode,
} from 'lucide-react';
import { SourceCitation } from '../types.ts';

interface CitationModalProps {
  isOpen: boolean;
  citation: SourceCitation | null;
  citationsList?: SourceCitation[];
  currentIndex?: number;
  onClose: () => void;
  onNavigateCitation?: (newIndex: number) => void;
}

export const CitationModal: React.FC<CitationModalProps> = ({
  isOpen,
  citation,
  citationsList = [],
  currentIndex = 0,
  onClose,
  onNavigateCitation,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !citation) return null;

  const totalCitations = citationsList.length;
  const hasNav = totalCitations > 1 && onNavigateCitation;

  const copySnippet = () => {
    if (!citation.textSnippet) return;
    navigator.clipboard.writeText(citation.textSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getDocIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'csv') return <FileSpreadsheet className="w-4 h-4 text-zinc-400" />;
    if (ext === 'md' || ext === 'json') return <FileCode className="w-4 h-4 text-zinc-400" />;
    return <FileText className="w-4 h-4 text-zinc-400" />;
  };

  const matchPercent = Math.min(100, Math.round(citation.score * 100));

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-xl bg-[#141416] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#19191d]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
              {getDocIcon(citation.documentName)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono tabular-nums">
                <span className="text-zinc-200 font-semibold">Source [{currentIndex + 1}]</span>
                {totalCitations > 1 && <span>of {totalCitations}</span>}
              </div>
              <h3 className="text-sm font-semibold text-white truncate max-w-md">
                {citation.documentName}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {hasNav && (
              <div className="flex items-center gap-1 mr-1.5 pr-1.5 border-r border-zinc-800">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => onNavigateCitation(currentIndex - 1)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
                  title="Previous citation"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={currentIndex >= totalCitations - 1}
                  onClick={() => onNavigateCitation(currentIndex + 1)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
                  title="Next citation"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Clean Unboxed Metadata Line */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 tabular-nums">
            {citation.pageNumber ? <span>Page {citation.pageNumber}</span> : null}
            {citation.pageNumber && citation.sectionTitle ? <span aria-hidden="true">·</span> : null}
            {citation.sectionTitle ? (
              <span className="truncate max-w-xs">{citation.sectionTitle}</span>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>{matchPercent}% relevance</span>
          </div>

          {/* Quoted Text Excerpt */}
          <div className="p-4 bg-[#0d0d0f] border border-zinc-800 rounded-xl">
            <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">
              "{citation.textSnippet}"
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-end gap-2 bg-[#19191d]">
          <button
            type="button"
            onClick={copySnippet}
            className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-xl border border-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Excerpt'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-zinc-200 text-black text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
