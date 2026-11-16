export interface DocumentRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  chunkCount: number;
  status: 'processing' | 'ready' | 'error';
  errorMessage?: string;
  sourceType: 'upload' | 'gdrive' | 'sample';
  folder?: string;
  rawText?: string;
}

export interface DocumentChunk {
  id: string;
  pageNumber?: number;
  sectionTitle?: string;
  tokenCount: number;
  text: string;
  hasEmbedding: boolean;
  embeddingDimension?: number;
}

export interface SourceCitation {
  chunkId: string;
  documentName: string;
  pageNumber?: number;
  sectionTitle?: string;
  score: number;
  textSnippet: string;
}

export interface PipelineStage {
  name: string;
  durationMs: number;
  detail: string;
}

export interface SelectableFileOption {
  id: string;
  name: string;
  type: string;
  chunkCount: number;
  folder?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: SourceCitation[];
  pipelineStages?: PipelineStage[];
  stats?: {
    totalChunksSearched: number;
    chunksRetrieved: number;
    highestScore: number;
    executionTimeMs: number;
  };
  feedback?: 'like' | 'dislike';
  isEditFilePrompt?: boolean;
  selectableFiles?: SelectableFileOption[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export type VectorDbMode = 'local' | 'qdrant';

export interface VectorDbConfig {
  mode: VectorDbMode;
  qdrantUrl: string;
  collectionName: string;
  hasQdrantApiKey?: boolean;
}

export interface VectorDbStats {
  mode: VectorDbMode;
  collectionName: string;
  totalDocuments: number;
  totalChunks: number;
  vectorDimension: number;
  embeddingModel: string;
  chatModel: string;
}

export interface RagSettings {
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  similarityThreshold: number;
  hybridSearch: boolean;
}
