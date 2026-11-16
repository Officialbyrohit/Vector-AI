import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileText,
  Folder,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  Loader2,
  ChevronRight,
} from 'lucide-react';

interface UnifiedUploadModalProps {
  isOpen: boolean;
  initialFile?: File | null;
  folders?: string[];
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const UnifiedUploadModal: React.FC<UnifiedUploadModalProps> = ({
  isOpen,
  initialFile,
  folders = [],
  onClose,
  onUploadSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'computer' | 'gdrive' | 'text'>('computer');

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile || null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [customFolderInput, setCustomFolderInput] = useState<string>('');

  // Google Drive State
  const [gdriveUrl, setGdriveUrl] = useState('');

  // Text State
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');

  // Status
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (initialFile) {
      setSelectedFile(initialFile);
      setActiveTab('computer');
    }
  }, [initialFile]);

  if (!isOpen) return null;

  const resetState = () => {
    setSelectedFile(null);
    setGdriveUrl('');
    setTextTitle('');
    setTextContent('');
    setSelectedFolder('');
    setCustomFolderInput('');
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsProcessing(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const getEffectiveFolder = () => {
    if (selectedFolder === '__NEW__') {
      return customFolderInput.trim() || undefined;
    }
    return selectedFolder || undefined;
  };

  // Drag handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setErrorMessage(null);
    const validExtensions = ['.pdf', '.docx', '.txt', '.csv', '.md', '.json'];
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      setErrorMessage(
        'Supported formats: PDF, DOCX, TXT, CSV, or Markdown. Please select a valid document.'
      );
      setSelectedFile(null);
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 25MB limit.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  // Upload handler for Computer file
  const handleUploadFile = async () => {
    if (!selectedFile) {
      setErrorMessage('Please select a file to upload.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Read file as Base64 for reliable transmission
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          const base64 = res.split(',')[1] || res;
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(selectedFile);
      const fileBase64 = await base64Promise;

      const res = await fetch('/api/rag/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileType: selectedFile.type || 'application/octet-stream',
          fileBase64,
          folder: getEffectiveFolder(),
          settings: {
            chunkSize: 500,
            chunkOverlap: 75,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to process document');
      }

      setSuccessMessage(data.message || `"${selectedFile.name}" was successfully indexed.`);
      setTimeout(() => {
        onUploadSuccess();
        handleClose();
      }, 850);
    } catch (err: any) {
      console.error('Upload error:', err);
      setErrorMessage(err.message || 'Failed to upload document');
    } finally {
      setIsProcessing(false);
    }
  };

  // Google Drive sample presets
  const drivePresets = [
    {
      id: 'gdrive_risk_policy',
      title: 'Credit Risk Guidelines & Underwriting Policy.docx',
      desc: 'Credit risk underwriting standards, score thresholds (620+), DTI limits (43%), and Basel III capital buffers.',
      content: `
# Fintech Credit Risk Guidelines & Underwriting Policy
Source: Google Drive / Credit Risk & Compliance / Policy Docs

## Section 1: Scope & Underwriting Eligibility
This policy governs credit assessment for personal loans ($1,000 - $50,000) and revolving credit lines.
Applicants must have:
- Minimum credit score of 620
- Debt-to-Income (DTI) ratio below 43%
- Minimum verifiable employment history of 12 months.

## Section 2: Basel III Capital Buffer Allocations
The institution maintains a Tier 1 common equity ratio of 11.5%, exceeding statutory requirements by 250 basis points. Risk-weighted assets (RWA) are updated daily from the transactional ledger.

## Section 3: Adverse Action Compliance (ECOA & FCRA)
When an application is declined or approved with counter-offers, an automated Notice of Adverse Action must be dispatched within 3 business days, disclosing key principal credit bureau factors and score attribution.
      `.trim(),
    },
    {
      id: 'gdrive_infra_spec',
      title: 'Multi-Region High Availability Specification.pdf',
      desc: 'Architecture specifications for 99.99% uptime failover, Spanner synchronization, and vector caching.',
      content: `
# Multi-Region Cloud Infrastructure Specification
Source: Google Drive / Engineering Specs / High Availability.pdf

## Section 1: Region Distribution & Failover Topologies
Workloads are deployed across asia-east1, us-central1, and europe-west4.
Traffic is routed via Cloud Load Balancing with GEO-proximity and automated health-check failover under 3 seconds.

## Section 2: Vector Cache Invalidation Strategy
To guarantee cache consistency across distributed replicas:
- Embeddings are tagged with content hash SHA-256.
- Redis cluster invalidation notices are broadcast via Pub/Sub topics.
- Cold document archives are stored in Google Cloud Storage multi-region buckets with versioning enabled.
      `.trim(),
    },
    {
      id: 'gdrive_sla_agreement',
      title: 'Enterprise Master Service Level Agreement (SLA).pdf',
      desc: 'Legal definitions of service availability, latency guarantees, and breach financial credits.',
      content: `
# Enterprise Master Service Agreement & SLA
Source: Google Drive / Legal & Contracts / Vendor SLA.pdf

## Section 1: Service Level Guarantees
Vendor guarantees a monthly uptime of 99.95% for core API services.
Scheduled maintenance shall not exceed 4 hours per calendar month and must occur on Sunday mornings between 01:00 and 05:00 UTC.

## Section 2: Financial Credits for Service Breaches
If monthly uptime drops below 99.95%, Customer is entitled to service credits:
- 99.0% to 99.94%: 10% credit of monthly recurring fee
- 95.0% to 98.99%: 25% credit
- Below 95.0%: 50% credit and immediate contract termination clause.
      `.trim(),
    },
  ];

  // Import from Google Drive
  const handleImportGDrive = async (presetId?: string) => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      let fileName = 'Google_Drive_Document.docx';
      let content = '';

      if (presetId) {
        const preset = drivePresets.find((p) => p.id === presetId);
        if (!preset) throw new Error('Preset not found');
        fileName = preset.title;
        content = preset.content;
      } else {
        if (!gdriveUrl.trim()) {
          throw new Error('Please enter a Google Drive link or select a file below.');
        }
        fileName = `Drive_Document_${Date.now().toString().slice(-4)}.docx`;
        content = `
# Imported Document from Google Drive
Source URL: ${gdriveUrl.trim()}
Imported Date: ${new Date().toISOString()}

## Section 1: Document Overview
This document was imported from Google Drive to provide knowledge base context for document retrieval and answering.

## Section 2: Operational Specifications
The system ingests text chunks, creates semantic embeddings, and indexes them in the vector database for immediate retrieval.
        `.trim();
      }

      const res = await fetch('/api/rag/gdrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          fileUrl: gdriveUrl.trim() || undefined,
          rawContent: content,
          folder: getEffectiveFolder(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import Google Drive document');
      }

      setSuccessMessage(data.message || `"${fileName}" was imported and indexed.`);
      setTimeout(() => {
        onUploadSuccess();
        handleClose();
      }, 850);
    } catch (err: any) {
      console.error('GDrive import error:', err);
      setErrorMessage(err.message || 'Failed to import from Google Drive');
    } finally {
      setIsProcessing(false);
    }
  };

  // Upload Raw Text
  const handleUploadText = async () => {
    if (!textContent.trim()) {
      setErrorMessage('Please enter document text to index.');
      return;
    }

    const title = textTitle.trim() || `Document_${new Date().toISOString().slice(0, 10)}.txt`;

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/rag/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: title.endsWith('.txt') ? title : `${title}.txt`,
          fileType: 'text/plain',
          textContent: textContent.trim(),
          folder: getEffectiveFolder(),
          settings: {
            chunkSize: 500,
            chunkOverlap: 75,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to index text');
      }

      setSuccessMessage(data.message || `"${title}" was successfully indexed.`);
      setTimeout(() => {
        onUploadSuccess();
        handleClose();
      }, 850);
    } catch (err: any) {
      console.error('Text upload error:', err);
      setErrorMessage(err.message || 'Failed to index text');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div
        className="w-full max-w-2xl bg-[#121214] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-[#161618]">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Upload Document</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Add files to your knowledge base to ask questions about their content.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multi-Option Tabs */}
        <div className="flex border-b border-zinc-800 bg-[#0e0e10] px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('computer');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'computer'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload from Computer</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('gdrive');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'gdrive'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Folder className="w-4 h-4" />
            <span>Google Drive</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('text');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'text'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Paste Text</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Status Banners */}
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 p-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-zinc-200">
              <CheckCircle2 className="w-4 h-4 text-zinc-300 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Folder Assignment Selector */}
          <div className="p-3 bg-[#18181b] border border-zinc-800 rounded-xl">
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Organize into Folder (Optional)
            </label>
            <div className="flex gap-2">
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="flex-1 bg-[#121214] border border-zinc-700 focus:border-zinc-400 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="">Auto / No Folder</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
                <option value="__NEW__">+ Create New Folder...</option>
              </select>
              {selectedFolder === '__NEW__' && (
                <input
                  type="text"
                  placeholder="New folder name..."
                  value={customFolderInput}
                  onChange={(e) => setCustomFolderInput(e.target.value)}
                  className="flex-1 bg-[#121214] border border-zinc-700 focus:border-zinc-400 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                />
              )}
            </div>
          </div>

          {/* TAB 1: UPLOAD FROM COMPUTER */}
          {activeTab === 'computer' && (
            <div className="space-y-4">
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-white bg-zinc-800/40'
                    : selectedFile
                    ? 'border-zinc-600 bg-zinc-900/40'
                    : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/30 bg-black/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.docx,.txt,.csv,.md,.json"
                  className="hidden"
                />

                <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center mx-auto mb-3">
                  <UploadCloud className="w-6 h-6" />
                </div>

                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white">{selectedFile.name}</p>
                    <p className="text-xs text-zinc-400">
                      {(selectedFile.size / 1024).toFixed(1)} KB • Ready to index
                    </p>
                    <p className="text-xs text-zinc-400 mt-2 font-medium">
                      Click or drag another file to replace
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-white">
                      Drag and drop your document here, or{' '}
                      <span className="text-white underline underline-offset-2">browse files</span>
                    </p>
                    <p className="text-xs text-zinc-400">
                      Supports PDF, DOCX, TXT, CSV, or Markdown (up to 25MB)
                    </p>
                  </div>
                )}
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between p-3.5 bg-[#18181b] border border-zinc-800 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {(selectedFile.size / 1024).toFixed(1)} KB • Automatic chunking & vectorization
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="text-xs text-zinc-400 hover:text-red-400 p-1 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GOOGLE DRIVE */}
          {activeTab === 'gdrive' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300">
                  Google Drive Document or Folder Link
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                    <input
                      type="url"
                      placeholder="https://drive.google.com/file/d/.../view"
                      value={gdriveUrl}
                      onChange={(e) => setGdriveUrl(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-black border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleImportGDrive()}
                    disabled={isProcessing || !gdriveUrl.trim()}
                    className="px-4 py-2.5 bg-white hover:bg-zinc-200 disabled:opacity-50 text-black rounded-xl text-xs font-medium transition-colors shrink-0 cursor-pointer"
                  >
                    Import Link
                  </button>
                </div>
              </div>

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-800"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#121214] px-2 text-zinc-500">
                    Or select from sample Drive documents
                  </span>
                </div>
              </div>

              {/* Sample GDrive Files */}
              <div className="space-y-2">
                {drivePresets.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => handleImportGDrive(preset.id)}
                    className="flex items-center justify-between p-3.5 bg-[#18181b] hover:bg-[#202024] border border-zinc-800 hover:border-zinc-700 rounded-xl cursor-pointer transition-all group"
                  >
                    <div className="flex items-start gap-3 min-w-0 pr-3">
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center shrink-0 mt-0.5">
                        <Folder className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-white group-hover:text-zinc-200 truncate">
                          {preset.title}
                        </h4>
                        <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                          {preset.desc}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isProcessing}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 text-xs font-medium shrink-0 flex items-center gap-1 group-hover:bg-white group-hover:text-black transition-colors"
                    >
                      <span>Import</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: PASTE TEXT */}
          {activeTab === 'text' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                  Document Title
                </label>
                <input
                  type="text"
                  placeholder="e.g., Q3 Financial Report.txt"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-black border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                  Document Content
                </label>
                <textarea
                  rows={8}
                  placeholder="Paste documentation, specifications, or notes here..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  className="w-full px-3 py-2.5 bg-black border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800/80 bg-[#161618]">
          <p className="text-xs text-zinc-400">
            Files are automatically parsed, chunked, and vectorized into the database.
          </p>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {activeTab === 'computer' && (
              <button
                type="button"
                onClick={handleUploadFile}
                disabled={isProcessing || !selectedFile}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-medium bg-white hover:bg-zinc-200 disabled:opacity-50 text-black transition-all shadow-xs cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Document...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload & Index</span>
                  </>
                )}
              </button>
            )}

            {activeTab === 'text' && (
              <button
                type="button"
                onClick={handleUploadText}
                disabled={isProcessing || !textContent.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-medium bg-white hover:bg-zinc-200 disabled:opacity-50 text-black transition-all shadow-xs cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Indexing Text...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5" />
                    <span>Save & Index</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
