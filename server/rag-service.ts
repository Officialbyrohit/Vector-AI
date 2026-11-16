/**
 * Core RAG (Retrieval-Augmented Generation) Service
 * Implements document parsing, intelligent chunking, Gemini Embedding 2 vectorization,
 * Qdrant vector storage (local persistent store + remote Qdrant Cloud REST adapter),
 * hybrid semantic+lexical reranking, and grounded response synthesis with Gemini 4 Flash.
 */
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import mammoth from 'mammoth';
import {
  cosineSimilarity,
  deleteDocumentPointsFromQdrant,
  loadDocumentsFromQdrant,
  loadLocalSnapshot,
  SafeVectorDbConfig,
  saveLocalSnapshot,
  searchQdrantPoints,
  StoredChunkPoint,
  StoredDocumentRecord,
  toSafeVectorDbConfig,
  upsertPointsToQdrant,
  VectorDbConfig,
} from './qdrant-store.ts';

dotenv.config();

export type DocumentChunk = StoredChunkPoint;
export type DocumentRecord = StoredDocumentRecord;

export interface RagSettings {
  chunkSize: number; // approximate tokens (1 token ≈ 4 chars)
  chunkOverlap: number; // approximate tokens
  topK: number; // number of chunks to retrieve
  similarityThreshold: number; // 0.0 to 1.0
  hybridSearch: boolean; // combine dense vector + BM25 lexical matching
}

export interface SourceCitation {
  chunkId: string;
  documentName: string;
  pageNumber?: number;
  sectionTitle?: string;
  score: number;
  textSnippet: string;
}

export interface QueryResult {
  answer: string;
  sources: SourceCitation[];
  pipelineStages: {
    name: string;
    durationMs: number;
    detail: string;
  }[];
  stats: {
    totalChunksSearched: number;
    chunksRetrieved: number;
    highestScore: number;
    executionTimeMs: number;
  };
}

export const DEFAULT_SETTINGS: RagSettings = {
  chunkSize: 500,
  chunkOverlap: 75,
  topK: 4,
  similarityThreshold: 0.2,
  hybridSearch: true,
};

export const EMBEDDING_MODELS = [
  'gemini-embedding-2',
  'gemini-embedding-2-preview',
  'gemini-embedding-001',
] as const;

export const RESPONSE_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
] as const;

let activeEmbeddingModelName: string = EMBEDDING_MODELS[0];
let activeResponseModelName: string = RESPONSE_MODELS[0];
let activeVectorDimension = 3072;

// Initialize Gemini Client with required telemetry header
let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

/**
 * Intelligent text chunking
 * Splits by headings, paragraphs, and sentences while respecting token limits and overlap
 */
export function chunkText(
  text: string,
  docId: string,
  docName: string,
  chunkSizeTokens = 500,
  chunkOverlapTokens = 75
): DocumentChunk[] {
  const maxChars = chunkSizeTokens * 4;
  const overlapChars = chunkOverlapTokens * 4;

  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00A0]+/g, ' ')
    .trim();

  if (!cleanText) return [];

  const blocks = cleanText.split(/\n{2,}/);
  const chunks: DocumentChunk[] = [];
  let currentChunkText = '';
  let currentSection = 'General';
  let chunkIndex = 1;
  let estimatedPage = 1;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(/^(#{1,6}\s+|[A-Z0-9\s.:_-]{3,60}\n)/);
    if (headingMatch) {
      currentSection = trimmed.split('\n')[0].replace(/^#+\s*/, '').trim();
    }

    const pageMatch = trimmed.match(/(?:page|--- page)\s+(\d+)/i);
    if (pageMatch) {
      estimatedPage = parseInt(pageMatch[1], 10);
    }

    if (currentChunkText.length + trimmed.length > maxChars && currentChunkText.length > 0) {
      const tokenCount = Math.round(currentChunkText.length / 4);
      chunks.push({
        id: `${docId}_chunk_${chunkIndex++}`,
        documentId: docId,
        documentName: docName,
        pageNumber: estimatedPage,
        sectionTitle: currentSection,
        text: currentChunkText.trim(),
        tokenCount,
        createdAt: new Date().toISOString(),
      });

      const overlapStart = Math.max(0, currentChunkText.length - overlapChars);
      const overlapText = currentChunkText.slice(overlapStart);
      currentChunkText = overlapText + '\n\n' + trimmed;

      if (chunks.length % 3 === 0) {
        estimatedPage++;
      }
    } else {
      currentChunkText = currentChunkText ? `${currentChunkText}\n\n${trimmed}` : trimmed;
    }
  }

  if (currentChunkText.trim()) {
    const tokenCount = Math.round(currentChunkText.length / 4);
    chunks.push({
      id: `${docId}_chunk_${chunkIndex}`,
      documentId: docId,
      documentName: docName,
      pageNumber: estimatedPage,
      sectionTitle: currentSection,
      text: currentChunkText.trim(),
      tokenCount,
      createdAt: new Date().toISOString(),
    });
  }

  return chunks;
}

/**
 * Fallback semantic subword hash vector (768 dimensions)
 * Guarantees resilience if Gemini quota or API key is temporarily unavailable
 */
function generateFallbackEmbedding(text: string): number[] {
  const dim = 768;
  const vector = new Array(dim).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);

  if (words.length === 0) return vector;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 5381;
    for (let c = 0; c < word.length; c++) {
      hash = (hash << 5) + hash + word.charCodeAt(c);
      hash = hash & hash;
    }
    const idx = Math.abs(hash) % dim;
    const weight = 1.0 + Math.min(5, word.length) * 0.2;
    vector[idx] += weight;

    if (i < words.length - 1) {
      const bigram = word + '_' + words[i + 1];
      let bHash = 31;
      for (let c = 0; c < bigram.length; c++) {
        bHash = (bHash * 33) ^ bigram.charCodeAt(c);
      }
      const bIdx = Math.abs(bHash) % dim;
      vector[bIdx] += 1.5;
    }
  }

  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vector[i] = vector[i] / norm;
    }
  }

  return vector;
}

/**
 * Generates vector embedding for text using Gemini Embedding 2 (with model alias fallback)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const ai = getGemini();
  if (ai) {
    for (const model of EMBEDDING_MODELS) {
      try {
        const response = await ai.models.embedContent({
          model,
          contents: text.slice(0, 8000),
        });

        const values =
          (response as any)?.embeddings?.[0]?.values || (response as any)?.embedding?.values;
        if (Array.isArray(values) && values.length > 0) {
          activeEmbeddingModelName = model;
          activeVectorDimension = values.length;
          return values;
        }
      } catch (err: any) {
        const isLast = model === EMBEDDING_MODELS[EMBEDDING_MODELS.length - 1];
        if (isLast) {
          console.info(`[RAG] Gemini embedding fallback triggered (${model}):`, err?.message || err);
        }
      }
    }
  }
  activeVectorDimension = 768;
  return generateFallbackEmbedding(text);
}

/**
 * Keyword overlap / BM25 style lexical score
 */
function keywordRelevance(query: string, text: string): number {
  const queryWords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (queryWords.length === 0) return 0;

  const targetText = text.toLowerCase();
  let matches = 0;
  for (const word of queryWords) {
    if (targetText.includes(word)) {
      matches += 1;
    }
  }
  return matches / queryWords.length;
}

/**
 * Modular Vector Store backed by Qdrant (local persistent store + optional Qdrant Cloud cluster)
 */
export class VectorStore {
  private documents: Map<string, DocumentRecord> = new Map();
  private chunks: Map<string, DocumentChunk> = new Map();
  private rawTexts: Map<string, string> = new Map();
  private config: VectorDbConfig;
  private readyPromise: Promise<void> = Promise.resolve();

  constructor() {
    const envUrl = (process.env.QDRANT_URL || '').trim();
    const envApiKey = (process.env.QDRANT_API_KEY || '').trim();
    const envCollection = (process.env.QDRANT_COLLECTION || 'vectorai_documents').trim();

    this.config = {
      mode: envUrl ? 'qdrant' : 'local',
      qdrantUrl: envUrl,
      qdrantApiKey: envApiKey,
      collectionName: envCollection || 'vectorai_documents',
    };

    const snapshot = loadLocalSnapshot();
    if (snapshot) {
      let switchedFromLocalToEnvQdrant = false;
      if (snapshot.config) {
        const useEnvQdrant = !snapshot.config.qdrantUrl && Boolean(envUrl);
        switchedFromLocalToEnvQdrant = useEnvQdrant;
        this.config = {
          mode: useEnvQdrant ? 'qdrant' : snapshot.config.mode || this.config.mode,
          qdrantUrl: snapshot.config.qdrantUrl || envUrl,
          qdrantApiKey: snapshot.config.qdrantApiKey || envApiKey,
          collectionName: snapshot.config.collectionName || this.config.collectionName,
        };
      }
      for (const doc of snapshot.documents) {
        this.documents.set(doc.id, doc);
      }
      for (const [docId, rawText] of Object.entries(snapshot.rawTexts || {})) {
        this.rawTexts.set(docId, rawText);
      }
      for (const chunk of snapshot.chunks) {
        this.chunks.set(chunk.id, chunk);
        if (chunk.embedding && chunk.embedding.length > 0) {
          activeVectorDimension = chunk.embedding.length;
        }
      }

      if (switchedFromLocalToEnvQdrant && this.documents.size > 0) {
        this.readyPromise = this.syncSnapshotToQdrant().catch((err) => {
          console.error('[VectorDB] Startup Qdrant sync warning:', err?.message || err);
        });
      }
    } else if (this.config.mode === 'qdrant' && this.config.qdrantUrl) {
      this.readyPromise = this.hydrateFromQdrantOrSeed().catch((err) => {
        console.error('[VectorDB] Startup Qdrant hydration failed, seeding defaults:', err?.message || err);
        this.seedDefaultKnowledgeBase();
      });
    } else {
      this.seedDefaultKnowledgeBase();
    }
  }

  public async waitUntilReady(): Promise<void> {
    await this.readyPromise;
  }

  private async hydrateFromQdrantOrSeed(): Promise<void> {
    const remote = await loadDocumentsFromQdrant(this.config);
    if (remote.documents.length > 0) {
      for (const doc of remote.documents) {
        this.documents.set(doc.id, doc);
      }
      for (const chunk of remote.chunks) {
        this.chunks.set(chunk.id, chunk);
      }
      this.persist();
      console.info(
        `[VectorDB] Restored ${remote.documents.length} documents (${remote.chunks.length} chunks) from Qdrant "${this.config.collectionName}".`
      );
    } else {
      this.seedDefaultKnowledgeBase();
    }
  }

  private async syncSnapshotToQdrant(): Promise<void> {
    const docs = Array.from(this.documents.values());
    const docMetaMap = Object.fromEntries(docs.map((d) => [d.id, d]));
    const allChunks = Array.from(this.chunks.values());
    if (allChunks.length > 0) {
      await upsertPointsToQdrant(this.config, allChunks, docMetaMap);
      this.persist();
    }
  }

  private persist(): void {
    saveLocalSnapshot({
      config: this.config,
      documents: Array.from(this.documents.values()),
      rawTexts: Object.fromEntries(this.rawTexts.entries()),
      chunks: Array.from(this.chunks.values()),
    });
  }

  public getVectorDbConfig(): VectorDbConfig {
    return { ...this.config };
  }

  public getSafeVectorDbConfig(): SafeVectorDbConfig {
    return toSafeVectorDbConfig(this.config);
  }

  public setVectorDbConfig(updates: Partial<VectorDbConfig>): SafeVectorDbConfig {
    this.config = {
      mode: updates.mode || this.config.mode,
      qdrantUrl: updates.qdrantUrl !== undefined ? updates.qdrantUrl.trim() : this.config.qdrantUrl,
      qdrantApiKey:
        updates.qdrantApiKey !== undefined
          ? updates.qdrantApiKey.trim()
          : this.config.qdrantApiKey,
      collectionName:
        updates.collectionName !== undefined && updates.collectionName.trim()
          ? updates.collectionName.trim()
          : this.config.collectionName || 'vectorai_documents',
    };
    this.persist();
    return toSafeVectorDbConfig(this.config);
  }

  public getStats() {
    return {
      mode: this.config.mode,
      collectionName: this.config.collectionName,
      totalDocuments: this.documents.size,
      totalChunks: this.chunks.size,
      vectorDimension: activeVectorDimension,
      embeddingModel: activeEmbeddingModelName,
      chatModel: activeResponseModelName,
    };
  }

  public getDocuments(): DocumentRecord[] {
    return Array.from(this.documents.values());
  }

  public getDocument(id: string): DocumentRecord | undefined {
    return this.documents.get(id);
  }

  public getRawText(id: string): string | undefined {
    return this.rawTexts.get(id);
  }

  public getChunksForDoc(docId: string): DocumentChunk[] {
    return Array.from(this.chunks.values()).filter((c) => c.documentId === docId);
  }

  public getAllChunks(): DocumentChunk[] {
    return Array.from(this.chunks.values());
  }

  public async addDocument(
    doc: DocumentRecord,
    rawText: string,
    settings = DEFAULT_SETTINGS
  ): Promise<void> {
    this.documents.set(doc.id, { ...doc, status: 'processing' });
    this.rawTexts.set(doc.id, rawText);

    try {
      const generatedChunks = chunkText(
        rawText,
        doc.id,
        doc.name,
        settings.chunkSize,
        settings.chunkOverlap
      );

      if (generatedChunks.length === 0) {
        throw new Error('No text chunks could be generated from this file.');
      }

      await Promise.all(
        generatedChunks.map(async (chunk) => {
          chunk.embedding = await getEmbedding(chunk.text);
        })
      );

      const readyDoc: DocumentRecord = {
        ...doc,
        chunkCount: generatedChunks.length,
        status: 'ready',
      };

      if (this.config.mode === 'qdrant' && this.config.qdrantUrl) {
        await upsertPointsToQdrant(this.config, generatedChunks, {
          [doc.id]: readyDoc,
        });
      }

      for (const chunk of generatedChunks) {
        this.chunks.set(chunk.id, chunk);
      }
      this.documents.set(doc.id, readyDoc);
      this.persist();
    } catch (err: any) {
      for (const [chunkId, chunk] of this.chunks.entries()) {
        if (chunk.documentId === doc.id) {
          this.chunks.delete(chunkId);
        }
      }
      this.rawTexts.delete(doc.id);
      this.documents.delete(doc.id);
      this.persist();
      throw err;
    }
  }

  public async reIndexAllDocuments(): Promise<{
    reIndexedDocs: number;
    reIndexedChunks: number;
    mode: string;
  }> {
    const docs = Array.from(this.documents.values());
    let totalChunks = 0;

    for (const doc of docs) {
      const docChunks = this.getChunksForDoc(doc.id);
      await Promise.all(
        docChunks.map(async (chunk) => {
          chunk.embedding = await getEmbedding(chunk.text);
          this.chunks.set(chunk.id, chunk);
        })
      );
      const updatedDoc: DocumentRecord = {
        ...doc,
        chunkCount: docChunks.length,
        status: 'ready',
      };
      this.documents.set(doc.id, updatedDoc);

      if (this.config.mode === 'qdrant' && this.config.qdrantUrl) {
        await upsertPointsToQdrant(this.config, docChunks, { [doc.id]: updatedDoc });
      }
      totalChunks += docChunks.length;
    }

    this.persist();
    return {
      reIndexedDocs: docs.length,
      reIndexedChunks: totalChunks,
      mode: this.config.mode,
    };
  }

  public async updateDocument(
    docId: string,
    updates: { name?: string; folder?: string; textContent?: string },
    settings = DEFAULT_SETTINGS
  ): Promise<DocumentRecord | undefined> {
    const existing = this.documents.get(docId);
    if (!existing) return undefined;

    const updatedDoc: DocumentRecord = {
      ...existing,
      name: updates.name ? updates.name.trim() : existing.name,
      folder: updates.folder !== undefined ? updates.folder : existing.folder,
    };

    if (updates.textContent !== undefined && updates.textContent.trim().length > 0) {
      this.rawTexts.set(docId, updates.textContent);

      for (const [chunkId, chunk] of this.chunks.entries()) {
        if (chunk.documentId === docId) {
          this.chunks.delete(chunkId);
        }
      }

      if (this.config.mode === 'qdrant' && this.config.qdrantUrl) {
        await deleteDocumentPointsFromQdrant(this.config, docId);
      }

      const generatedChunks = chunkText(
        updates.textContent,
        updatedDoc.id,
        updatedDoc.name,
        settings.chunkSize,
        settings.chunkOverlap
      );

      await Promise.all(
        generatedChunks.map(async (chunk) => {
          chunk.embedding = await getEmbedding(chunk.text);
          this.chunks.set(chunk.id, chunk);
        })
      );

      updatedDoc.chunkCount = generatedChunks.length;
      updatedDoc.size = Buffer.byteLength(updates.textContent, 'utf8');
      updatedDoc.status = 'ready';

      if (this.config.mode === 'qdrant' && this.config.qdrantUrl) {
        await upsertPointsToQdrant(this.config, generatedChunks, {
          [updatedDoc.id]: updatedDoc,
        });
      }
    } else {
      const updatedChunks: DocumentChunk[] = [];
      for (const chunk of this.chunks.values()) {
        if (chunk.documentId === docId) {
          chunk.documentName = updatedDoc.name;
          updatedChunks.push(chunk);
        }
      }
      if (this.config.mode === 'qdrant' && this.config.qdrantUrl && updatedChunks.length > 0) {
        await upsertPointsToQdrant(this.config, updatedChunks, {
          [updatedDoc.id]: updatedDoc,
        });
      }
    }

    this.documents.set(docId, updatedDoc);
    this.persist();
    return updatedDoc;
  }

  public async deleteDocument(
    docId: string
  ): Promise<{ deleted: boolean; deletedFromQdrant: boolean; qdrantDeletedCount: number }> {
    const existing = this.documents.get(docId);
    if (!existing) {
      return { deleted: false, deletedFromQdrant: false, qdrantDeletedCount: 0 };
    }

    let deletedFromQdrant = false;
    let qdrantDeletedCount = 0;

    if (this.config.mode === 'qdrant' && this.config.qdrantUrl) {
      const qdrantResult = await deleteDocumentPointsFromQdrant(this.config, docId);
      deletedFromQdrant = true;
      qdrantDeletedCount = qdrantResult.deletedCount;
    }

    for (const [chunkId, chunk] of this.chunks.entries()) {
      if (chunk.documentId === docId) {
        this.chunks.delete(chunkId);
      }
    }

    this.rawTexts.delete(docId);
    this.documents.delete(docId);
    this.persist();
    return { deleted: true, deletedFromQdrant, qdrantDeletedCount };
  }

  /**
   * Search vector store (remote Qdrant Cloud when active, or local persistent cosine index)
   * with optional hybrid lexical reranking and documentId filtering.
   */
  public async search(
    query: string,
    topK = 4,
    threshold = 0.2,
    filterDocIds?: string[],
    hybrid = true
  ): Promise<{ chunk: DocumentChunk; score: number }[]> {
    const queryEmbedding = await getEmbedding(query);

    let candidates: { chunk: DocumentChunk; vectorScore: number }[] = [];

    if (this.config.mode === 'qdrant' && this.config.qdrantUrl) {
      const qdrantHits = await searchQdrantPoints(
        this.config,
        queryEmbedding,
        Math.max(topK * 3, 12),
        filterDocIds
      );
      candidates = qdrantHits.map((hit) => ({
        chunk: hit.chunk,
        vectorScore: hit.score,
      }));
    } else {
      const allChunks = Array.from(this.chunks.values()).filter((c) => {
        if (filterDocIds && filterDocIds.length > 0) {
          return filterDocIds.includes(c.documentId);
        }
        return true;
      });

      if (allChunks.length === 0) return [];

      candidates = allChunks.map((chunk) => ({
        chunk,
        vectorScore: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0,
      }));
    }

    const scored = candidates.map(({ chunk, vectorScore }) => {
      let finalScore = vectorScore;
      if (hybrid) {
        const lexicalScore = keywordRelevance(query, chunk.text);
        finalScore = vectorScore * 0.75 + lexicalScore * 0.25;
      }
      return { chunk, score: finalScore };
    });

    return scored
      .filter((item) => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Seed starter documents once when no local snapshot exists
   */
  private seedDefaultKnowledgeBase() {
    const sampleDoc1: DocumentRecord = {
      id: 'doc_credit_risk_arch',
      name: 'credit_risk_prediction_system.pdf',
      type: 'application/pdf',
      size: 42800,
      uploadedAt: new Date().toISOString(),
      chunkCount: 0,
      status: 'ready',
      sourceType: 'sample',
    };

    const doc1Content = `
# Credit-Risk Prediction System: Architecture & Model Specification

## Section 1: Executive Overview
The Credit-Risk Prediction System is an enterprise-grade financial analytics platform developed to evaluate consumer and small business loan applications. It provides real-time probability of default (PD), loss given default (LGD), and exposure at default (EAD) scoring. The primary goal is reducing portfolio default rates by 23% while maintaining approval velocities under 150 milliseconds.

--- Page 1 ---
## Section 2: Core Architecture & Data Storage
The application utilizes PostgreSQL for relational data storage and Qdrant for high-speed vector similarity search.
Application services are containerized on Google Cloud Run and managed via Kubernetes.
For primary transaction storage:
- PostgreSQL 16 on Google Cloud SQL manages loan applications, customer profiles, and credit bureau feeds.
- Redis 7.2 serves as the sub-millisecond feature store cache for online feature retrieval.
- Object storage (Google Cloud Storage) holds raw contract PDFs, financial statements, and model training artifacts.

--- Page 2 ---
## Section 3: Machine Learning Datasets & Pipeline
The predictive engine is trained on:
1. Lending Club Loan Dataset (2018-2024 historical portfolio comprising 1.8M amortized loans).
2. German Credit Dataset for algorithmic fairness calibration and disparate impact auditing.
3. Internal Core Banking ledger transactions (synthetic financial behavior logs spanning 500K accounts).
Features engineered include Debt-to-Income (DTI), revolving line utilization, payment delinquency history (30/60/90 days past due), and cashflow stability indices calculated over rolling 90-day windows.

--- Page 3 ---
## Section 4: Model Architecture & Algorithms
The production pipeline deploys an ensemble architecture:
- Primary Tier: LightGBM gradient boosted trees optimized using Optuna Bayesian hyperparameter search.
- Secondary Tier: TabNet deep neural network providing explicit feature mask interpretability.
- Explainability Layer: SHAP (SHapley Additive exPlanations) values computed for every inference to provide applicants with transparent adverse action notices adhering to ECOA (Equal Credit Opportunity Act) standards.

--- Page 4 ---
## Section 5: Security & Compliance Guardrails
All sensitive Personally Identifiable Information (PII) is encrypted at rest using AES-256 and in transit via TLS 1.3.
Access controls follow the Principle of Least Privilege (PoLP) with role-based access control (RBAC). Model audits are conducted bi-weekly to monitor demographic parity and equalized odds metrics across all applicant cohorts.
`;

    const sampleDoc2: DocumentRecord = {
      id: 'doc_gdrive_cloud_roadmap',
      name: 'Google_Drive_AI_Infrastructure_Roadmap.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 31200,
      uploadedAt: new Date().toISOString(),
      chunkCount: 0,
      status: 'ready',
      sourceType: 'gdrive',
    };

    const doc2Content = `
# Google Drive Enterprise Sync & AI Infrastructure Roadmap 2026

## Section 1: Google Drive Sync Integration
The Google Drive Sync Connector synchronizes team knowledge bases directly from designated shared folders.
Key capabilities:
- Automatic webhook subscriptions via Google Drive Push Notifications API.
- Support for automated conversion of Google Docs, Google Sheets, and Google Slides into structured markdown before chunking.
- Incremental delta indexing using page tokens to prevent re-processing unchanged documents.

--- Page 1 ---
## Section 2: Embedding Generation & Qdrant Storage Specifications
All ingested document chunks are embedded using Google's Gemini Embedding 2 model and indexed in Qdrant:
- Embedding Model: 'gemini-embedding-2' (3072-dimensional float vectors).
- Vector Database: Qdrant with Cosine similarity distance and documentId payload filtering.
- Response Synthesis: 'gemini-4-hydrogen' (Gemini 4 Flash) for fast, grounded answers.

--- Page 2 ---
## Section 3: Retrieval-Augmented Generation Guidelines
When serving user queries:
1. Strict grounding: The model MUST only cite facts explicitly present in the retrieved chunks.
2. If the user asks for unavailable information, the system returns: "I couldn't find enough information in the uploaded documents to answer that question."
3. Source citations must list the exact document name, page number, and section title for verifiable auditability.
`;

    this.addDocument(sampleDoc1, doc1Content, DEFAULT_SETTINGS).catch((e) =>
      console.error('Error seeding sample doc 1:', e)
    );
    this.addDocument(sampleDoc2, doc2Content, DEFAULT_SETTINGS).catch((e) =>
      console.error('Error seeding sample doc 2:', e)
    );
  }
}

export const vectorStore = new VectorStore();

/**
 * Parse text from uploaded files (PDF, DOCX, TXT, CSV, MD)
 */
export async function parseDocumentFile(
  fileName: string,
  buffer: Buffer
): Promise<{ text: string; pageCount?: number }> {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  if (extension === 'txt' || extension === 'md' || extension === 'csv' || extension === 'json') {
    return { text: buffer.toString('utf-8') };
  }

  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value };
  }

  if (extension === 'pdf') {
    try {
      const pdfParseModule = (await import('pdf-parse')) as any;
      if (typeof pdfParseModule.PDFParse === 'function') {
        const parser = new pdfParseModule.PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          return {
            text: result.text || '',
            pageCount: result.total || result.pages?.length || 1,
          };
        } finally {
          await parser.destroy().catch(() => {});
        }
      } else if (typeof pdfParseModule.default === 'function') {
        const data = await pdfParseModule.default(buffer);
        return {
          text: data.text,
          pageCount: data.numpages,
        };
      } else if (typeof pdfParseModule === 'function') {
        const data = await pdfParseModule(buffer);
        return {
          text: data.text,
          pageCount: data.numpages,
        };
      }
    } catch (err) {
      console.info('pdf-parse fallback used:', err);
      const str = buffer.toString('binary');
      const textMatches = str.match(/\(([^)]+)\)\s*Tj/g) || [];
      const extracted = textMatches
        .map((m) => m.replace(/^\(/, '').replace(/\)\s*Tj$/, ''))
        .join(' ');
      return { text: extracted || 'PDF content parsed with text extraction fallback.' };
    }
  }

  return { text: buffer.toString('utf-8') };
}

/**
 * Extractive fallback when Gemini generation is unreachable
 */
function synthesizeHeuristicAnswer(
  question: string,
  retrieved: { chunk: DocumentChunk; score: number }[]
): string {
  const stopWords = new Set([
    'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how',
    'does', 'the', 'and', 'for', 'are', 'this', 'that', 'with', 'from',
    'tell', 'about', 'is', 'was', 'were', 'been', 'being', 'have', 'has',
    'had', 'having', 'do', 'did', 'doing', 'can', 'could', 'should', 'would',
    'may', 'might', 'must', 'will', 'shall', 'system', 'project', 'document',
    'documents', 'file', 'files', 'please', 'explain', 'mention', 'detail', 'details',
  ]);

  const queryTerms = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  const matchedSentences: {
    text: string;
    score: number;
    docIdx: number;
  }[] = [];

  for (let i = 0; i < retrieved.length; i++) {
    const { chunk, score: retrievalScore } = retrieved[i];
    const chunkRankWeight = 1.0 / (i + 1);

    const cleanedText = chunk.text
      .replace(/^#+.*$/gm, '')
      .replace(/^---.*$/gm, '')
      .replace(/\s+/g, ' ')
      .trim();

    const rawSentences = cleanedText
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && !s.startsWith('#') && !s.startsWith('---'));

    for (const sent of rawSentences) {
      const lowerSent = sent.toLowerCase();
      let matchCount = 0;
      for (const term of queryTerms) {
        if (lowerSent.includes(term)) matchCount += 2;
      }
      if (matchCount > 0) {
        matchedSentences.push({
          text: sent,
          score: (matchCount + retrievalScore * 3) * chunkRankWeight,
          docIdx: i + 1,
        });
      }
    }
  }

  matchedSentences.sort((a, b) => b.score - a.score);

  if (matchedSentences.length === 0) {
    return "I couldn't find enough information in the uploaded documents to answer that question.";
  }

  const seen = new Set<string>();
  const topItems: { text: string; docIdx: number }[] = [];
  for (const item of matchedSentences) {
    if (!seen.has(item.text) && topItems.length < 3) {
      seen.add(item.text);
      topItems.push({ text: item.text, docIdx: item.docIdx });
    }
  }

  return topItems
    .map((item) => `${item.text.replace(/^\s*[-*•]\s*/, '').trim()} [${item.docIdx}]`)
    .join('\n\n');
}

/**
 * Synthesizes an intelligent, grounded answer using Gemini 4 Flash (gemini-4-hydrogen)
 */
async function generateGroundedAnswer(
  question: string,
  retrieved: { chunk: DocumentChunk; score: number }[],
  chatHistory: { role: string; content: string }[] = []
): Promise<string> {
  const contextText = retrieved
    .map(
      (r, idx) =>
        `--- Document [${idx + 1}]: "${r.chunk.documentName}" (Section: "${
          r.chunk.sectionTitle || 'General'
        }", Page: ${r.chunk.pageNumber || 1}) ---\n${r.chunk.text}`
    )
    .join('\n\n');

  const systemInstruction = `You are an expert RAG (Retrieval-Augmented Generation) document assistant.

Your task is to read and deeply understand the retrieved document content, then answer the user's specific question directly, concisely, and accurately based on that content.

CORE GUIDELINES:
1. DIRECT & COMPREHENSIVE ANSWER:
   - Provide the direct answer to the question in your very first sentence with clear, confident synthesis.
   - Do NOT simply output the raw content or copy text snippets from the file.
   - Explain the relevant facts, architecture, methodologies, or data clearly in your own words.
   - If the user asks for a specific fact, definition, step, comparison, architecture, or dataset, pinpoint it and state it clearly.
   - Use bullet points where appropriate to make multi-part explanations easy to digest.

2. STRICT DOCUMENT GROUNDING & HONESTY:
   - Only use facts and information that are directly stated in or clearly supported by the retrieved document context.
   - Do NOT make up information or rely on unverified outside knowledge.
   - If the uploaded document context does not contain enough information to answer the question, clearly state:
     "I couldn't find enough information in the uploaded documents to answer that question."

3. FORMATTING & INLINE CITATIONS:
   - Use clean Markdown with bolding for key concepts and terms.
   - Insert inline bracketed citation numbers like [1] or [2] directly after the statements or facts derived from Document [1], Document [2], etc.
   - Keep the answer clean, elegant, and directly readable.`;

  let historyContext = '';
  if (chatHistory && chatHistory.length > 0) {
    const recent = chatHistory.slice(-4);
    historyContext =
      'Recent Conversation Context:\n' +
      recent
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 160)}`)
        .join('\n') +
      '\n\n';
  }

  const prompt = `${historyContext}Retrieved Document Context:
${contextText}

User Question:
${question}

Instructions:
Read and understand the retrieved document content above. Provide a direct, well-structured, and accurate answer to the user's question, including inline citation markers like [1] or [2] where appropriate. Formulate a clear, helpful response explaining the relevant findings.`;

  const ai = getGemini();
  if (ai) {
    for (const model of RESPONSE_MODELS) {
      try {
        const config =
          model === 'gemini-4-hydrogen'
            ? { systemInstruction }
            : { systemInstruction, temperature: 0.2 };

        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config,
        });
        if (response && response.text && response.text.trim().length > 0) {
          activeResponseModelName = model;
          return response.text.trim();
        }
      } catch (err: any) {
        const isLast = model === RESPONSE_MODELS[RESPONSE_MODELS.length - 1];
        if (isLast) {
          console.info(`[RAG] Response model ${model} failed:`, err?.message || err);
        }
        const isQuota = err?.message?.includes('Quota exceeded') || err?.message?.includes('429');
        if (!isQuota) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    }
  }

  return synthesizeHeuristicAnswer(question, retrieved);
}

/**
 * Execute full RAG Query Pipeline
 */
export async function executeRagQuery(
  question: string,
  chatHistory: { role: 'user' | 'assistant'; content: string }[] = [],
  settings: RagSettings = DEFAULT_SETTINGS,
  filterDocIds?: string[]
): Promise<QueryResult> {
  const startTime = Date.now();
  const stages: QueryResult['pipelineStages'] = [];

  // Stage 1: Question analysis & conversational contextualization
  const stage1Start = Date.now();
  let contextualQuery = question;
  if (chatHistory.length > 0) {
    const lastAssistantMsg = chatHistory[chatHistory.length - 1];
    const lastUserMsg = chatHistory[chatHistory.length - 2];
    if (/\b(it|this|that|they|them|its|their|the system|the project)\b/i.test(question)) {
      contextualQuery = `${question} (in context of: ${lastUserMsg ? lastUserMsg.content : ''} -> ${
        lastAssistantMsg ? lastAssistantMsg.content.slice(0, 100) : ''
      })`;
    }
  }
  stages.push({
    name: 'Query Contextualization',
    durationMs: Date.now() - stage1Start,
    detail: `Query: "${contextualQuery.slice(0, 80)}..."`,
  });

  // Stage 2: Qdrant Vector Search & Hybrid Reranking
  const stage2Start = Date.now();
  const retrieved = await vectorStore.search(
    contextualQuery,
    settings.topK,
    settings.similarityThreshold,
    filterDocIds,
    settings.hybridSearch
  );
  stages.push({
    name: 'Qdrant Vector & Lexical Search',
    durationMs: Date.now() - stage2Start,
    detail: `Retrieved ${retrieved.length} relevant chunks (threshold >= ${settings.similarityThreshold})`,
  });

  const totalChunks = vectorStore.getAllChunks().length;
  const highestScore = retrieved.length > 0 ? retrieved[0].score : 0;

  if (retrieved.length === 0 || highestScore < settings.similarityThreshold) {
    stages.push({
      name: 'Hallucination Prevention Guardrail',
      durationMs: 2,
      detail: 'Confidence score below threshold; triggered fallback safeguard',
    });

    return {
      answer: "I couldn't find enough information in the uploaded documents to answer that question.",
      sources: [],
      pipelineStages: stages,
      stats: {
        totalChunksSearched: totalChunks,
        chunksRetrieved: 0,
        highestScore,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  // Stage 3: Source Citations Preparation
  const stage3Start = Date.now();
  const sources: SourceCitation[] = retrieved.map(({ chunk, score }) => ({
    chunkId: chunk.id,
    documentName: chunk.documentName,
    pageNumber: chunk.pageNumber,
    sectionTitle: chunk.sectionTitle,
    score: Math.round(score * 100) / 100,
    textSnippet: chunk.text.slice(0, 240) + (chunk.text.length > 240 ? '...' : ''),
  }));
  stages.push({
    name: 'Source Citations & Reranking',
    durationMs: Date.now() - stage3Start,
    detail: `${sources.length} sources formatted with page numbers and sections`,
  });

  // Stage 4: LLM Answer Synthesis using Gemini 4 Flash
  const stage4Start = Date.now();
  const answerText = await generateGroundedAnswer(question, retrieved, chatHistory);

  stages.push({
    name: 'Answer Synthesis',
    durationMs: Date.now() - stage4Start,
    detail: `Answer generated via ${activeResponseModelName} (${answerText.length} chars)`,
  });

  return {
    answer: answerText,
    sources,
    pipelineStages: stages,
    stats: {
      totalChunksSearched: totalChunks,
      chunksRetrieved: retrieved.length,
      highestScore,
      executionTimeMs: Date.now() - startTime,
    },
  };
}
