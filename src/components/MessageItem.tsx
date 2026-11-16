import React, { useState } from 'react';
import {
  FileText,
  User,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Folder,
  Quote,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Message, SourceCitation } from '../types.ts';
import { MarkdownView } from './MarkdownView.tsx';
import { CitationModal } from './CitationModal.tsx';

interface MessageItemProps {
  message: Message;
  onFeedback: (messageId: string, feedback: 'like' | 'dislike') => void;
  onSelectFileToEdit?: (fileId: string) => void;
  onCitationClick?: (citation: SourceCitation) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onFeedback,
  onSelectFileToEdit,
  onCitationClick,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);
  const [expandedSnippetId, setExpandedSnippetId] = useState<string | null>(null);
  const [isCitationsOpen, setIsCitationsOpen] = useState(false);
  const [activeModalCitation, setActiveModalCitation] = useState<{
    citation: SourceCitation;
    index: number;
  } | null>(null);

  const isUser = message.role === 'user';
  const sources = message.sources || [];

  const copyText = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copySnippet = (text: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedSnippetId(id);
    setTimeout(() => setCopiedSnippetId(null), 2000);
  };

  const toggleSnippet = (chunkId: string) => {
    setExpandedSnippetId((prev) => (prev === chunkId ? null : chunkId));
  };

  const openCitationModal = (src: SourceCitation, index: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveModalCitation({ citation: src, index });
    if (onCitationClick) {
      onCitationClick(src);
    }
  };

  // Clicking an inline [1] opens the clean citation modal directly
  const handleInlineCitationClick = (index: number) => {
    if (sources[index]) {
      openCitationModal(sources[index], index);
    }
  };

  const timeString = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const getFileBadge = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    const label =
      ext === 'pdf'
        ? 'PDF'
        : ext === 'docx' || ext === 'doc'
        ? 'DOC'
        : ext === 'csv'
        ? 'CSV'
        : ext === 'md'
        ? 'MD'
        : 'TXT';
    return (
      <span className="text-[10px] font-mono font-semibold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 shrink-0">
        {label}
      </span>
    );
  };

  // USER MESSAGE (Right aligned)
  if (isUser) {
    return (
      <div id={`message-${message.id}`} className="w-full flex justify-end items-end gap-2.5 my-2">
        <div className="max-w-[85%] sm:max-w-[75%] md:max-w-[65%]">
          <div className="text-[11px] text-zinc-500 text-right mb-1 mr-1 tabular-nums">
            <span>You</span> · <span>{timeString}</span>
          </div>

          <div className="bg-[#202025] border border-zinc-700/70 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 transition-colors">
            <p className="whitespace-pre-wrap leading-relaxed text-[14.5px] font-normal break-words text-zinc-100">
              {message.content}
            </p>
          </div>
        </div>

        <div
          className="w-7 h-7 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center shrink-0 mb-0.5"
          title="You"
        >
          <User className="w-3.5 h-3.5 text-zinc-200" />
        </div>
      </div>
    );
  }

  // AI RESPONSE (Left aligned)
  return (
    <>
      <div id={`message-${message.id}`} className="w-full flex justify-start items-start gap-3 my-2">
        <div
          className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 text-white flex items-center justify-center shrink-0 mt-0.5"
          title="VectorAI"
        >
          <FileText className="w-4 h-4 text-zinc-300" />
        </div>

        <div className="flex-1 max-w-[95%] sm:max-w-[90%] md:max-w-[85%] bg-[#121215] border border-zinc-800/90 rounded-2xl rounded-tl-sm p-4 sm:p-5">
          {/* Minimal Header */}
          <div className="flex items-center gap-2 mb-3 text-xs">
            <span className="font-semibold text-white">VectorAI</span>
            <span className="text-zinc-600" aria-hidden="true">·</span>
            <span className="text-[11px] text-zinc-500 tabular-nums">{timeString}</span>
          </div>

          {/* Simple Answer Content with Inline Clickable Citations */}
          <div className="text-zinc-100">
            <MarkdownView
              content={message.content}
              citations={sources}
              onCitationClick={handleInlineCitationClick}
            />
          </div>

          {/* Selectable File Options when user runs /edit */}
          {message.selectableFiles && message.selectableFiles.length > 0 && (
            <div className="mt-4 p-3.5 bg-[#17171a] border border-zinc-800 rounded-xl space-y-2.5">
              <p className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
                <span>Select a file to update its name, folder, or content:</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {message.selectableFiles.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => onSelectFileToEdit && onSelectFileToEdit(file.id)}
                    className="flex items-center justify-between p-2.5 bg-[#1f1f23] hover:bg-[#28282e] border border-zinc-800 hover:border-zinc-700 rounded-xl text-left transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {getFileBadge(file.name)}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-white truncate">{file.name}</p>
                        <p className="text-[10px] text-zinc-400 flex items-center gap-1 mt-0.5 tabular-nums">
                          {file.folder ? (
                            <>
                              <Folder className="w-2.5 h-2.5" />
                              <span>{file.folder}</span>
                              <span aria-hidden="true">·</span>
                            </>
                          ) : null}
                          <span>{file.chunkCount} chunks</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-zinc-300 group-hover:text-white shrink-0 ml-2">
                      Edit
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Single Clean "Citations" Dropdown */}
          {sources.length > 0 && (
            <div className="mt-3.5 pt-2.5 border-t border-zinc-800/70 text-xs">
              <button
                type="button"
                onClick={() => setIsCitationsOpen(!isCitationsOpen)}
                className="inline-flex items-center gap-1.5 py-1 px-1.5 -ml-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer select-none text-xs font-medium"
                aria-expanded={isCitationsOpen}
              >
                <Quote className="w-3.5 h-3.5 text-zinc-400" />
                <span>Citations ({sources.length})</span>
                {isCitationsOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                )}
              </button>

              {isCitationsOpen && (
                <div className="mt-2 space-y-2 animate-in fade-in duration-100">
                  {sources.map((src, idx) => {
                    const citationNumber = idx + 1;
                    const isExpanded = expandedSnippetId === src.chunkId;
                    const matchPercent = Math.min(100, Math.round(src.score * 100));

                    return (
                      <div key={src.chunkId || idx}>
                        <div className="flex items-baseline gap-2 flex-wrap text-[13px] leading-relaxed">
                          <button
                            type="button"
                            onClick={() => toggleSnippet(src.chunkId)}
                            className="font-mono text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer shrink-0 transition-colors"
                          >
                            [{citationNumber}]
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleSnippet(src.chunkId)}
                            className="font-medium text-zinc-300 hover:text-white underline underline-offset-4 decoration-zinc-600 hover:decoration-white cursor-pointer transition-colors text-left"
                          >
                            {src.documentName}
                          </button>

                          {(src.pageNumber || src.sectionTitle) && (
                            <span className="text-zinc-500 text-xs">
                              {src.pageNumber ? `Page ${src.pageNumber}` : ''}
                              {src.pageNumber && src.sectionTitle ? ' · ' : ''}
                              {src.sectionTitle || ''}
                            </span>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="mt-1.5 mb-2 ml-5 p-3 border border-zinc-800 bg-zinc-900/50 rounded-xl animate-in fade-in duration-100">
                            <p className="text-xs leading-relaxed text-zinc-300">
                              "{src.textSnippet}"
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-500 tabular-nums">
                              <span>{matchPercent}% match</span>
                              <span aria-hidden="true">·</span>
                              <button
                                type="button"
                                onClick={(e) => copySnippet(src.textSnippet, src.chunkId, e)}
                                className="hover:text-zinc-200 cursor-pointer flex items-center gap-1 transition-colors"
                              >
                                {copiedSnippetId === src.chunkId ? (
                                  <>
                                    <Check className="w-3 h-3 text-zinc-300" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                              <span aria-hidden="true">·</span>
                              <button
                                type="button"
                                onClick={(e) => openCitationModal(src, idx, e)}
                                className="hover:text-zinc-200 underline underline-offset-2 cursor-pointer transition-colors"
                              >
                                Full source
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Clean Action Row */}
          <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-zinc-800/60 text-zinc-400 text-xs">
            <button
              type="button"
              onClick={copyText}
              className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
              title="Copy response"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-zinc-200" />
                  <span className="text-zinc-200">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <div className="w-px h-3 bg-zinc-800" />

            <button
              type="button"
              onClick={() => onFeedback(message.id, 'like')}
              className={`p-1 rounded hover:text-white transition-colors cursor-pointer ${
                message.feedback === 'like' ? 'text-white' : ''
              }`}
              title="Helpful"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onFeedback(message.id, 'dislike')}
              className={`p-1 rounded hover:text-white transition-colors cursor-pointer ${
                message.feedback === 'dislike' ? 'text-zinc-200' : ''
              }`}
              title="Not helpful"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Citation Detail Modal */}
      {activeModalCitation && (
        <CitationModal
          isOpen={Boolean(activeModalCitation)}
          citation={activeModalCitation.citation}
          citationsList={sources}
          currentIndex={activeModalCitation.index}
          onClose={() => setActiveModalCitation(null)}
          onNavigateCitation={(newIdx) => {
            if (newIdx >= 0 && newIdx < sources.length) {
              setActiveModalCitation({
                citation: sources[newIdx],
                index: newIdx,
              });
            }
          }}
        />
      )}
    </>
  );
};
