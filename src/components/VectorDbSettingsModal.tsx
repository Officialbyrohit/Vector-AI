import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import { VectorDbConfig, VectorDbMode, VectorDbStats } from '../types.ts';

interface VectorDbSettingsModalProps {
  isOpen: boolean;
  initialConfig: VectorDbConfig;
  stats: VectorDbStats | null;
  onClose: () => void;
  onConfigUpdated: (newConfig: VectorDbConfig, newStats?: VectorDbStats) => void;
}

export const VectorDbSettingsModal: React.FC<VectorDbSettingsModalProps> = ({
  isOpen,
  initialConfig,
  stats,
  onClose,
  onConfigUpdated,
}) => {
  const [mode, setMode] = useState<VectorDbMode>(initialConfig.mode || 'local');
  const [qdrantUrl, setQdrantUrl] = useState(initialConfig.qdrantUrl || '');
  const [collectionName, setCollectionName] = useState(
    initialConfig.collectionName || 'vectorai_documents'
  );
  const [qdrantApiKey, setQdrantApiKey] = useState('');
  const [reIndexAll, setReIndexAll] = useState(true);

  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    pointsCount?: number;
    vectorSize?: number;
  } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialConfig.mode || 'local');
      setQdrantUrl(initialConfig.qdrantUrl || '');
      setCollectionName(initialConfig.collectionName || 'vectorai_documents');
      setQdrantApiKey('');
      setTestResult(null);
      setSaveMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen, initialConfig]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!qdrantUrl.trim()) {
      setErrorMessage('Please enter your Qdrant Cluster or Server URL first.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/rag/vectordb-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qdrantUrl: qdrantUrl.trim(),
          qdrantApiKey: qdrantApiKey.trim() || undefined,
          collectionName: collectionName.trim() || 'vectorai_documents',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTestResult({
          success: false,
          message: data.error || 'Failed to connect to Qdrant.',
        });
      } else {
        setTestResult({
          success: true,
          message: data.message,
          latencyMs: data.latencyMs,
          pointsCount: data.pointsCount,
          vectorSize: data.vectorSize,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Network error while testing Qdrant connection.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSaveMessage(null);

    if (mode === 'qdrant' && !qdrantUrl.trim()) {
      setErrorMessage('Please provide a valid Qdrant Cluster URL.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/rag/vectordb-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          qdrantUrl: qdrantUrl.trim(),
          qdrantApiKey: qdrantApiKey.trim() || undefined,
          collectionName: collectionName.trim() || 'vectorai_documents',
          reIndexAll,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update vector database configuration');
      }

      onConfigUpdated(data.config, data.stats);
      const syncNote = data.reIndexStats
        ? ` Indexed ${data.reIndexStats.reIndexedChunks} vectors across ${data.reIndexStats.reIndexedDocs} documents.`
        : '';
      setSaveMessage(`${data.message}${syncNote}`);

      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save Qdrant configuration');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#141416] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#19191d]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white">
              <Database className="w-4 h-4 text-zinc-200" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Qdrant Vector Database & Gemini Pipeline
              </h3>
              <p className="text-[11px] text-zinc-400">
                Manage vector storage and inspect active Gemini embedding & response models
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Active Models & Store Telemetry Summary (Clean tabular grid) */}
          <div className="border-b border-zinc-800/80 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-[11px] text-zinc-500">Embedding Model</p>
                <p className="font-mono text-zinc-200 mt-0.5 truncate" title={stats?.embeddingModel}>
                  {stats?.embeddingModel || 'gemini-embedding-2'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Response Model</p>
                <p className="font-mono text-zinc-200 mt-0.5 truncate" title={stats?.chatModel}>
                  {stats?.chatModel || 'gemini-4-hydrogen'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Indexed Vectors</p>
                <p className="font-mono tabular-nums text-zinc-200 mt-0.5">
                  {stats?.totalChunks ?? 0} chunks · {stats?.totalDocuments ?? 0} docs
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Vector Dimension</p>
                <p className="font-mono tabular-nums text-zinc-200 mt-0.5">
                  {stats?.vectorDimension ?? 3072}-dim Cosine
                </p>
              </div>
            </div>
          </div>

          {/* Storage Mode Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-zinc-300">
              Select Vector Storage Backend
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setMode('local')}
                className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-start gap-3 ${
                  mode === 'local'
                    ? 'bg-zinc-800/90 border-zinc-500 text-white'
                    : 'bg-[#18181b] border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <HardDrive className="w-4 h-4 mt-0.5 shrink-0 text-zinc-200" />
                <div>
                  <div className="text-xs font-semibold text-white">Local Persistent Store</div>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                    Disk-persisted Cosine vector index with zero external setup required.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('qdrant')}
                className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-start gap-3 ${
                  mode === 'qdrant'
                    ? 'bg-zinc-800/90 border-zinc-500 text-white'
                    : 'bg-[#18181b] border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <Database className="w-4 h-4 mt-0.5 shrink-0 text-zinc-200" />
                <div>
                  <div className="text-xs font-semibold text-white">Qdrant Cloud / Server</div>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                    Connect a remote Qdrant Cloud cluster or self-hosted Qdrant REST instance.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Qdrant Cloud Fields */}
          {mode === 'qdrant' && (
            <div className="space-y-4 pt-3 border-t border-zinc-800/80 animate-in fade-in duration-150">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Qdrant Cluster / Server URL <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={qdrantUrl}
                    onChange={(e) => setQdrantUrl(e.target.value)}
                    placeholder="https://your-cluster-id.us-east4-0.gcp.cloud.qdrant.io:6333"
                    className="flex-1 bg-[#0e0e10] border border-zinc-800 focus:border-zinc-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || !qdrantUrl.trim()}
                    className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded-xl text-xs font-medium border border-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {isTesting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span>Test Connection</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Collection Name
                  </label>
                  <input
                    type="text"
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                    placeholder="vectorai_documents"
                    className="w-full bg-[#0e0e10] border border-zinc-800 focus:border-zinc-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Qdrant Cluster Key {initialConfig.hasQdrantApiKey ? '(Saved)' : '(Optional)'}
                  </label>
                  <input
                    type="password"
                    value={qdrantApiKey}
                    onChange={(e) => setQdrantApiKey(e.target.value)}
                    placeholder={
                      initialConfig.hasQdrantApiKey
                        ? 'Leave blank to keep saved key'
                        : 'Optional for Qdrant Cloud'
                    }
                    className="w-full bg-[#0e0e10] border border-zinc-800 focus:border-zinc-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                    testResult.success
                      ? 'bg-zinc-900/90 border-zinc-600 text-zinc-200'
                      : 'bg-red-950/30 border-red-900/60 text-red-300'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="font-medium leading-relaxed break-words">{testResult.message}</p>
                    {testResult.success && typeof testResult.vectorSize === 'number' && (
                      <p className="text-[11px] text-zinc-400 font-mono tabular-nums">
                        Collection size: {testResult.vectorSize}-dim · Points:{' '}
                        {testResult.pointsCount ?? 0}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Re-index existing documents toggle */}
          <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={reIndexAll}
              onChange={(e) => setReIndexAll(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-900 text-white focus:ring-0"
            />
            <div className="text-xs text-zinc-300 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
              <span>Sync and re-index all documents into active vector store on save</span>
            </div>
          </label>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-900/60 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveMessage && (
            <div className="p-3 rounded-xl bg-zinc-800/90 border border-zinc-600 text-xs text-zinc-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{saveMessage}</span>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-50 text-black text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save & Apply</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
