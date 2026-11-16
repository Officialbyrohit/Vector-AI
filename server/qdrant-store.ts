/**
 * Modular Qdrant Vector Database Layer
 * Supports both:
 * 1. Local Persistent Qdrant-compatible Vector Store (disk snapshot in .rag-data/qdrant-local.json)
 * 2. Remote Qdrant Cloud / Self-hosted Qdrant Server via @qdrant/js-client-rest
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { QdrantClient } from '@qdrant/js-client-rest';

export type VectorDbMode = 'local' | 'qdrant';

export interface VectorDbConfig {
  mode: VectorDbMode;
  qdrantUrl: string;
  qdrantApiKey?: string;
  collectionName: string;
}

export interface SafeVectorDbConfig {
  mode: VectorDbMode;
  qdrantUrl: string;
  collectionName: string;
  hasQdrantApiKey: boolean;
}

export interface StoredChunkPoint {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber?: number;
  sectionTitle?: string;
  text: string;
  tokenCount: number;
  embedding?: number[];
  createdAt: string;
}

export interface StoredDocumentRecord {
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
}

export interface LocalSnapshot {
  config: VectorDbConfig;
  documents: StoredDocumentRecord[];
  rawTexts: Record<string, string>;
  chunks: StoredChunkPoint[];
}

export interface QdrantTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
  collectionsCount?: number;
  collectionExists?: boolean;
  pointsCount?: number;
  vectorSize?: number;
}

const DATA_DIR = path.resolve(process.cwd(), '.rag-data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'qdrant-local.json');

/**
 * Converts an arbitrary string chunk ID into a deterministic valid UUID for Qdrant point IDs
 */
export function chunkIdToUuid(chunkId: string): string {
  const hash = crypto.createHash('sha256').update(chunkId).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

/**
 * Cosine similarity between two numeric vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Load persisted local vector snapshot if present
 */
export function loadLocalSnapshot(): LocalSnapshot | null {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf-8');
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as LocalSnapshot;
    if (!parsed || !Array.isArray(parsed.documents) || !Array.isArray(parsed.chunks)) {
      return null;
    }
    return parsed;
  } catch (err) {
    console.info('[VectorDB] Starting fresh local vector store (no valid snapshot found).');
    return null;
  }
}

/**
 * Persist local vector store snapshot atomically to disk
 */
export function saveLocalSnapshot(snapshot: LocalSnapshot): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${SNAPSHOT_FILE}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot), 'utf-8');
    fs.renameSync(tmpPath, SNAPSHOT_FILE);
  } catch (err: any) {
    console.error('[VectorDB] Failed to persist local snapshot:', err?.message || err);
  }
}

/**
 * Sanitize VectorDbConfig so API keys are never exposed in responses
 */
export function toSafeVectorDbConfig(config: VectorDbConfig): SafeVectorDbConfig {
  return {
    mode: config.mode,
    qdrantUrl: config.qdrantUrl,
    collectionName: config.collectionName || 'vectorai_documents',
    hasQdrantApiKey: Boolean(config.qdrantApiKey && config.qdrantApiKey.trim().length > 0),
  };
}

const indexedCollections = new Set<string>();

/**
 * Create a Qdrant REST Client for remote Qdrant Cloud / Self-hosted server
 */
function createQdrantClient(config: VectorDbConfig): QdrantClient {
  const url = (config.qdrantUrl || '').trim();
  if (!url) {
    throw new Error('Qdrant URL is required when Qdrant Cloud / Server mode is active.');
  }
  return new QdrantClient({
    url,
    apiKey: config.qdrantApiKey?.trim() || undefined,
    timeout: 8000,
    checkCompatibility: false,
  });
}

/**
 * Ensure keyword payload index exists on documentId for filtered search & deletion
 */
async function ensurePayloadIndex(
  client: QdrantClient,
  collectionName: string,
  qdrantUrl: string
): Promise<void> {
  const cacheKey = `${qdrantUrl.trim()}::${collectionName}`;
  if (indexedCollections.has(cacheKey)) return;

  try {
    await client.createPayloadIndex(collectionName, {
      field_name: 'documentId',
      field_schema: 'keyword',
      wait: true,
    });
    indexedCollections.add(cacheKey);
  } catch (err: any) {
    const msg = String(err?.message || err?.data?.status?.error || '').toLowerCase();
    if (msg.includes('already exists') || msg.includes('exists')) {
      indexedCollections.add(cacheKey);
    } else {
      console.warn(`[Qdrant] Could not verify payload index on "${collectionName}":`, err?.message || err);
    }
  }
}

/**
 * Ensure target Qdrant collection exists with matching vector size and payload index
 */
export async function ensureQdrantCollection(
  config: VectorDbConfig,
  vectorSize: number
): Promise<void> {
  const client = createQdrantClient(config);
  const collectionName = (config.collectionName || 'vectorai_documents').trim();

  const existing = await client.getCollections();
  const found = existing.collections.some((c) => c.name === collectionName);

  if (!found) {
    await client.createCollection(collectionName, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine',
      },
    });
  } else {
    const info = await client.getCollection(collectionName);
    const vectorsConfig: any = info.config?.params?.vectors;
    const configuredSize =
      typeof vectorsConfig?.size === 'number'
        ? vectorsConfig.size
        : typeof vectorsConfig?.default?.size === 'number'
        ? vectorsConfig.default.size
        : typeof vectorsConfig?.['']?.size === 'number'
        ? vectorsConfig[''].size
        : undefined;

    if (configuredSize && configuredSize !== vectorSize) {
      throw new Error(
        `Qdrant collection "${collectionName}" expects ${configuredSize}-dim vectors, ` +
          `but Gemini Embedding produced ${vectorSize}-dim vectors. Use a new collection name or recreate the collection.`
      );
    }
  }

  await ensurePayloadIndex(client, collectionName, config.qdrantUrl);
}

/**
 * Upsert document chunk points into remote Qdrant collection
 */
export async function upsertPointsToQdrant(
  config: VectorDbConfig,
  chunks: StoredChunkPoint[],
  docMetaMap?: Record<string, StoredDocumentRecord>
): Promise<number> {
  const validChunks = chunks.filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0);
  if (validChunks.length === 0) return 0;

  const vectorSize = validChunks[0].embedding!.length;
  await ensureQdrantCollection(config, vectorSize);

  const client = createQdrantClient(config);
  const collectionName = (config.collectionName || 'vectorai_documents').trim();

  const points = validChunks.map((chunk) => {
    const docMeta = docMetaMap?.[chunk.documentId];
    return {
      id: chunkIdToUuid(chunk.id),
      vector: chunk.embedding!,
      payload: {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentName: docMeta?.name || chunk.documentName,
        documentType: docMeta?.type || 'text/plain',
        documentSize: docMeta?.size ?? Buffer.byteLength(chunk.text, 'utf8'),
        uploadedAt: docMeta?.uploadedAt || chunk.createdAt,
        sourceType: docMeta?.sourceType || 'upload',
        folder: docMeta?.folder ?? null,
        pageNumber: chunk.pageNumber ?? null,
        sectionTitle: chunk.sectionTitle ?? 'General',
        tokenCount: chunk.tokenCount,
        text: chunk.text,
        createdAt: chunk.createdAt,
      },
    };
  });

  // Batch upserts in slices of 64 to keep payload sizes safe
  const BATCH_SIZE = 64;
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await client.upsert(collectionName, {
      wait: true,
      points: batch,
    });
  }

  return points.length;
}

/**
 * Delete all vector points associated with a documentId from remote Qdrant and verify removal
 */
export async function deleteDocumentPointsFromQdrant(
  config: VectorDbConfig,
  documentId: string
): Promise<{ deletedCount: number; remainingCount: number }> {
  const client = createQdrantClient(config);
  const collectionName = (config.collectionName || 'vectorai_documents').trim();

  const existing = await client.getCollections();
  if (!existing.collections.some((c) => c.name === collectionName)) {
    return { deletedCount: 0, remainingCount: 0 };
  }

  await ensurePayloadIndex(client, collectionName, config.qdrantUrl);

  const docFilter = {
    must: [
      {
        key: 'documentId',
        match: {
          value: documentId,
        },
      },
    ],
  };

  let beforeCount = 0;
  try {
    const preCount = await client.count(collectionName, {
      exact: true,
      filter: docFilter,
    });
    beforeCount = preCount.count ?? 0;
  } catch {
    // Proceed directly to delete even if pre-count fails
  }

  await client.delete(collectionName, {
    wait: true,
    filter: docFilter,
  });

  const postCount = await client.count(collectionName, {
    exact: true,
    filter: docFilter,
  });
  const remainingCount = postCount.count ?? 0;

  if (remainingCount > 0) {
    throw new Error(
      `Qdrant deletion incomplete for document "${documentId}": ${remainingCount} vectors still remain.`
    );
  }

  return { deletedCount: beforeCount, remainingCount };
}

/**
 * Load documents and chunk metadata currently stored in remote Qdrant collection
 */
export async function loadDocumentsFromQdrant(
  config: VectorDbConfig
): Promise<{ documents: StoredDocumentRecord[]; chunks: StoredChunkPoint[] }> {
  const client = createQdrantClient(config);
  const collectionName = (config.collectionName || 'vectorai_documents').trim();

  const existing = await client.getCollections();
  if (!existing.collections.some((c) => c.name === collectionName)) {
    return { documents: [], chunks: [] };
  }

  const docMap = new Map<string, StoredDocumentRecord>();
  const chunks: StoredChunkPoint[] = [];
  let offset: string | number | Record<string, unknown> | null | undefined = undefined;

  do {
    const res = await client.scroll(collectionName, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: false,
    });

    for (const pt of res.points || []) {
      const p: any = pt.payload || {};
      const docId = p.documentId ? String(p.documentId) : '';
      const text = p.text ? String(p.text) : '';
      if (!docId || !text) continue;

      const chunk: StoredChunkPoint = {
        id: String(p.chunkId || pt.id),
        documentId: docId,
        documentName: String(p.documentName || 'Uploaded Document'),
        pageNumber: typeof p.pageNumber === 'number' ? p.pageNumber : undefined,
        sectionTitle: p.sectionTitle ? String(p.sectionTitle) : undefined,
        text,
        tokenCount: typeof p.tokenCount === 'number' ? p.tokenCount : Math.round(text.length / 4),
        createdAt: String(p.createdAt || new Date().toISOString()),
      };
      chunks.push(chunk);

      const existingDoc = docMap.get(docId);
      if (!existingDoc) {
        docMap.set(docId, {
          id: docId,
          name: chunk.documentName,
          type: String(p.documentType || 'text/plain'),
          size: typeof p.documentSize === 'number' ? p.documentSize : Buffer.byteLength(text, 'utf8'),
          uploadedAt: String(p.uploadedAt || chunk.createdAt),
          chunkCount: 1,
          status: 'ready',
          sourceType: (p.sourceType === 'gdrive' || p.sourceType === 'sample' ? p.sourceType : 'upload'),
          folder: p.folder ? String(p.folder) : undefined,
        });
      } else {
        existingDoc.chunkCount += 1;
      }
    }

    offset = res.next_page_offset;
  } while (offset !== null && offset !== undefined);

  return {
    documents: Array.from(docMap.values()),
    chunks,
  };
}

/**
 * Semantic vector search against remote Qdrant collection with optional documentId scoping
 */
export async function searchQdrantPoints(
  config: VectorDbConfig,
  queryVector: number[],
  limit: number,
  filterDocIds?: string[]
): Promise<{ chunk: StoredChunkPoint; score: number }[]> {
  const client = createQdrantClient(config);
  const collectionName = (config.collectionName || 'vectorai_documents').trim();

  const existing = await client.getCollections();
  if (!existing.collections.some((c) => c.name === collectionName)) {
    return [];
  }

  if (filterDocIds && filterDocIds.length > 0) {
    await ensurePayloadIndex(client, collectionName, config.qdrantUrl);
  }

  const filter =
    filterDocIds && filterDocIds.length > 0
      ? {
          must: [
            {
              key: 'documentId',
              match: {
                any: filterDocIds,
              },
            },
          ],
        }
      : undefined;

  const queryRes = await client.query(collectionName, {
    query: queryVector,
    limit,
    with_payload: true,
    filter,
  });

  const hits = queryRes.points || [];

  return hits
    .map((hit) => {
      const p: any = hit.payload || {};
      const chunk: StoredChunkPoint = {
        id: String(p.chunkId || hit.id),
        documentId: String(p.documentId || ''),
        documentName: String(p.documentName || 'Unknown Document'),
        pageNumber: typeof p.pageNumber === 'number' ? p.pageNumber : undefined,
        sectionTitle: p.sectionTitle ? String(p.sectionTitle) : undefined,
        text: String(p.text || ''),
        tokenCount: typeof p.tokenCount === 'number' ? p.tokenCount : 0,
        createdAt: String(p.createdAt || new Date().toISOString()),
      };
      return {
        chunk,
        score: typeof hit.score === 'number' ? hit.score : 0,
      };
    })
    .filter((item) => item.chunk.text.length > 0);
}

/**
 * Test connectivity to a Qdrant Cloud or self-hosted Qdrant server
 */
export async function testQdrantConnection(config: VectorDbConfig): Promise<QdrantTestResult> {
  const start = Date.now();
  try {
    const client = createQdrantClient(config);
    const collectionName = (config.collectionName || 'vectorai_documents').trim();

    const collectionsRes = await client.getCollections();
    const collections = collectionsRes.collections || [];
    const exists = collections.some((c) => c.name === collectionName);

    let pointsCount: number | undefined;
    let vectorSize: number | undefined;

    if (exists) {
      const info = await client.getCollection(collectionName);
      pointsCount = info.points_count ?? 0;
      const vectorsConfig: any = info.config?.params?.vectors;
      vectorSize =
        typeof vectorsConfig?.size === 'number'
          ? vectorsConfig.size
          : typeof vectorsConfig?.default?.size === 'number'
          ? vectorsConfig.default.size
          : typeof vectorsConfig?.['']?.size === 'number'
          ? vectorsConfig[''].size
          : undefined;
    }

    const latencyMs = Date.now() - start;
    return {
      success: true,
      latencyMs,
      collectionsCount: collections.length,
      collectionExists: exists,
      pointsCount,
      vectorSize,
      message: exists
        ? `Connected to Qdrant in ${latencyMs}ms. Collection "${collectionName}" is ready (${pointsCount ?? 0} vectors).`
        : `Connected to Qdrant in ${latencyMs}ms. Collection "${collectionName}" will be auto-created on first upload or sync.`,
    };
  } catch (err: any) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      message: err?.message || 'Failed to connect to Qdrant cluster.',
    };
  }
}
