import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  UploadCloud,
  FileText,
  RotateCcw,
  Menu,
  Loader2,
  Mic,
  MicOff,
  Database,
} from 'lucide-react';
import { Message, SourceCitation, DocumentRecord, VectorDbConfig } from '../types.ts';
import { MessageItem } from './MessageItem.tsx';

interface ChatAreaProps {
  messages: Message[];
  sessionTitle: string;
  documents: DocumentRecord[];
  selectedDocFilter: string[];
  isLoading: boolean;
  activeStage: string;
  onSendMessage: (text: string) => void;
  onCitationClick: (citation: SourceCitation) => void;
  onFeedback: (messageId: string, feedback: 'like' | 'dislike') => void;
  onClearChat: () => void;
  onOpenUpload: () => void;
  onToggleMobileMenu: () => void;
  onSelectFileToEdit?: (fileId: string) => void;
  vectorDbConfig?: VectorDbConfig;
  onOpenVectorDbSettings?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  sessionTitle,
  documents,
  selectedDocFilter,
  isLoading,
  activeStage,
  onSendMessage,
  onCitationClick,
  onFeedback,
  onClearChat,
  onOpenUpload,
  onToggleMobileMenu,
  onSelectFileToEdit,
  vectorDbConfig,
  onOpenVectorDbSettings,
}) => {
  const [inputPrompt, setInputPrompt] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = () => {
    setSpeechError(null);
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechError('Microphone speech recognition is not supported in this browser.');
      setTimeout(() => setSpeechError(null), 4000);
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        if (event.results && event.results[0] && event.results[0][0]) {
          const transcript = event.results[0][0].transcript;
          setInputPrompt((prev) => {
            const prefix = prev.trim() ? `${prev.trim()} ` : '';
            return `${prefix}${transcript}`;
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setSpeechError('Microphone permission was denied. Please allow microphone access.');
        } else {
          setSpeechError(`Speech error: ${event.error}`);
        }
        setTimeout(() => setSpeechError(null), 4000);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
      setSpeechError('Could not start microphone voice input.');
      setTimeout(() => setSpeechError(null), 4000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!inputPrompt.trim() || isLoading) return;
    onSendMessage(inputPrompt.trim());
    setInputPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputPrompt(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const activeDocsCount =
    selectedDocFilter.length > 0 ? selectedDocFilter.length : documents.length;

  return (
    <main className="flex-1 flex flex-col h-full bg-black relative min-w-0">
      {/* Top Header (Grey & Monochrome) */}
      <header className="h-14 border-b border-zinc-800 bg-[#0c0c0e] px-4 md:px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
            title="Toggle Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate max-w-xs md:max-w-md">
              {sessionTitle}
            </h2>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span>
                {activeDocsCount === 0
                  ? 'No documents loaded'
                  : `${activeDocsCount} document${activeDocsCount === 1 ? '' : 's'} in scope`}
              </span>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearChat}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap"
              title="Clear conversation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Messages Container */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        {messages.length === 0 ? (
          /* Empty / Welcome State */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto my-auto">
            <h2 className="text-2xl font-semibold text-white tracking-tight">
              VectorAI
            </h2>

            {documents.length > 0 ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {[
                  'Summarize the uploaded documents',
                  'What are the key topics covered?',
                  'What architecture or tools are mentioned?',
                ].map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => onSendMessage(starter)}
                    className="px-3 py-1.5 rounded-xl bg-[#141416] hover:bg-[#1c1c20] border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-6 p-4 bg-[#141416] border border-zinc-800 rounded-xl text-left w-full max-w-md">
                <p className="text-xs font-medium text-zinc-200 mb-1">
                  No documents loaded yet
                </p>
                <p className="text-xs text-zinc-400 mb-3">
                  Upload a PDF, DOCX, TXT, CSV, or Markdown file to start asking questions.
                </p>
                <button
                  type="button"
                  onClick={onOpenUpload}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-white hover:bg-zinc-200 text-black rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload Your First Document</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Messages Stream */
          <div className="flex-1 p-4 sm:p-6 md:p-8 space-y-4 max-w-5xl mx-auto w-full">
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                onFeedback={onFeedback}
                onSelectFileToEdit={onSelectFileToEdit}
                onCitationClick={onCitationClick}
              />
            ))}

            {/* Loading Indicator - Aligned to Left Side (AI Response) */}
            {isLoading && (
              <div className="w-full flex justify-start items-start gap-3 my-2 animate-in fade-in duration-150">
                <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-750 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <FileText className="w-4 h-4 text-zinc-300" />
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[#121215] border border-zinc-800/90 p-4">
                  <div className="flex items-center gap-2 mb-2 text-xs">
                    <span className="font-semibold text-white">VectorAI</span>
                    <span className="text-zinc-600" aria-hidden="true">·</span>
                    <span className="text-[11px] text-zinc-500">Searching...</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-zinc-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                    <span>
                      {activeStage || 'Searching knowledge base & synthesizing answer...'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area (Grey, Simple, with Microphone Speech-to-Text) */}
      <div className="p-4 md:p-6 bg-black border-t border-zinc-900 shrink-0">
        <div className="max-w-4xl mx-auto">
          {speechError && (
            <div className="mb-2 text-center text-xs text-red-400 bg-red-950/40 border border-red-900/50 py-1.5 px-3 rounded-xl">
              {speechError}
            </div>
          )}

          <div
            className={`relative flex items-end bg-[#141416] border rounded-2xl p-2 transition-all shadow-lg ${
              isListening
                ? 'border-zinc-400 ring-2 ring-zinc-500/20'
                : 'border-zinc-800 focus-within:border-zinc-500'
            }`}
          >
            {/* Multi-Option Upload Button in Input */}
            <button
              type="button"
              onClick={onOpenUpload}
              className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Upload document (Computer, Google Drive, Text)"
            >
              <UploadCloud className="w-5 h-5" />
            </button>

            {/* Main Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputPrompt}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder={
                isListening
                  ? 'Listening to voice... speak now'
                  : documents.length === 0
                  ? 'Upload documents or type /edit to manage files...'
                  : 'Ask a question or type /edit to update files...'
              }
              className="flex-1 max-h-44 bg-transparent text-white text-sm px-3 py-2 focus:outline-none resize-none placeholder-zinc-500 leading-relaxed font-sans"
            />

            <div className="flex items-center gap-1 shrink-0">
              {/* Voice / Mic Button */}
              <button
                type="button"
                onClick={toggleListening}
                className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                  isListening
                    ? 'bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
                title={isListening ? 'Stop listening' : 'Voice input (Mic)'}
              >
                {isListening ? (
                  <MicOff className="w-4 h-4 text-red-400" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              {/* Send Button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!inputPrompt.trim() || isLoading}
                className="p-2.5 bg-white hover:bg-zinc-200 disabled:opacity-40 disabled:hover:bg-white text-black rounded-xl transition-colors shrink-0 cursor-pointer shadow-xs"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 text-center mt-2 font-normal">
            Grounding strictly on uploaded documents. Type <code className="text-zinc-300">/edit</code> to edit document info.
          </p>
        </div>
      </div>
    </main>
  );
};
