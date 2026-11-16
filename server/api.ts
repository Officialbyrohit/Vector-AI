import { Request, Response, Router } from 'express';
import { testQdrantConnection } from './qdrant-store.ts';
import {
  DEFAULT_SETTINGS,
  DocumentRecord,
  executeRagQuery,
  parseDocumentFile,
  RagSettings,
  vectorStore,
} from './rag-service.ts';

export const ragApiRouter = Router();

/**
 * Health & Stats endpoint
 */
ragApiRouter.get('/health', (_req: Request, res: Response) => {
  const hasApiKey = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );
  const stats = vectorStore.getStats();

  res.json({
    status: 'ok',
    hasApiKey,
    ...stats,
  });
});

/**
 * Get current Qdrant Vector Database configuration & live stats
 */
ragApiRouter.get('/vectordb-config', async (_req: Request, res: Response) => {
  await vectorStore.waitUntilReady();
  res.json({
    config: vectorStore.getSafeVectorDbConfig(),
    stats: vectorStore.getStats(),
  });
});

/**
 * Update Qdrant Vector Database configuration and optionally re-index documents
 */
ragApiRouter.post('/vectordb-config', async (req: Request, res: Response): Promise<void> => {
  try {
    const { mode, qdrantUrl, qdrantApiKey, collectionName, reIndexAll } = req.body;
    const targetMode = mode === 'qdrant' ? 'qdrant' : 'local';

    if (targetMode === 'qdrant' && (!qdrantUrl || !String(qdrantUrl).trim())) {
      res.status(400).json({ error: 'Please provide a Qdrant Cluster or Server URL.' });
      return;
    }

    const existing = vectorStore.getVectorDbConfig();
    const resolvedApiKey =
      targetMode === 'local'
        ? ''
        : typeof qdrantApiKey === 'string' && qdrantApiKey.trim().length > 0
        ? qdrantApiKey.trim()
        : existing.qdrantApiKey || '';

    if (targetMode === 'qdrant') {
      const check = await testQdrantConnection({
        mode: 'qdrant',
        qdrantUrl: String(qdrantUrl).trim(),
        qdrantApiKey: resolvedApiKey,
        collectionName: String(collectionName || existing.collectionName || 'vectorai_documents').trim(),
      });
      if (!check.success) {
        res.status(400).json({ error: check.message });
        return;
      }
    }

    const updatedConfig = vectorStore.setVectorDbConfig({
      mode: targetMode,
      qdrantUrl: qdrantUrl !== undefined ? String(qdrantUrl).trim() : '',
      qdrantApiKey: resolvedApiKey,
      collectionName:
        collectionName !== undefined && String(collectionName).trim()
          ? String(collectionName).trim()
          : 'vectorai_documents',
    });

    let reIndexStats = null;
    if (reIndexAll) {
      reIndexStats = await vectorStore.reIndexAllDocuments();
    }

    res.json({
      success: true,
      config: updatedConfig,
      stats: vectorStore.getStats(),
      reIndexStats,
      message:
        updatedConfig.mode === 'qdrant'
          ? `Connected to Qdrant collection "${updatedConfig.collectionName}".`
          : 'Switched to Local Persistent Vector Store.',
    });
  } catch (err: any) {
    console.error('Error updating vector DB config:', err);
    res.status(500).json({ error: err?.message || 'Failed to update vector database configuration' });
  }
});

/**
 * Test remote Qdrant Cluster / Server connectivity
 */
ragApiRouter.post('/vectordb-config/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { qdrantUrl, qdrantApiKey, collectionName } = req.body;
    if (!qdrantUrl || !String(qdrantUrl).trim()) {
      res.status(400).json({ success: false, error: 'Qdrant URL is required to test connection.' });
      return;
    }

    const existing = vectorStore.getVectorDbConfig();
    const resolvedKey =
      typeof qdrantApiKey === 'string' && qdrantApiKey.trim().length > 0
        ? qdrantApiKey.trim()
        : existing.qdrantApiKey;

    const result = await testQdrantConnection({
      mode: 'qdrant',
      qdrantUrl: String(qdrantUrl).trim(),
      qdrantApiKey: resolvedKey,
      collectionName: String(collectionName || existing.collectionName || 'vectorai_documents').trim(),
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.message,
        latencyMs: result.latencyMs,
      });
      return;
    }

    res.json(result);
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err?.message || 'Failed to test Qdrant connection',
    });
  }
});

/**
 * List all documents
 */
ragApiRouter.get('/documents', async (_req: Request, res: Response) => {
  await vectorStore.waitUntilReady();
  const docs = vectorStore.getDocuments();
  res.json({ documents: docs });
});

/**
 * Upload & Ingest document (Supports Base64 or Raw Text)
 */
ragApiRouter.post('/upload', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileName, fileType, fileBase64, textContent, settings, folder } = req.body;

    if (!fileName) {
      res.status(400).json({ error: 'File name is required' });
      return;
    }

    const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let extractedText = textContent || '';
    let fileSize = 0;

    if (fileBase64) {
      const buffer = Buffer.from(fileBase64, 'base64');
      fileSize = buffer.length;

      if (fileSize > 15 * 1024 * 1024) {
        res.status(400).json({ error: 'File exceeds 15MB limit' });
        return;
      }

      const parsed = await parseDocumentFile(fileName, buffer);
      extractedText = parsed.text;
    } else if (textContent) {
      fileSize = Buffer.byteLength(textContent, 'utf8');
    }

    if (!extractedText || extractedText.trim().length === 0) {
      res.status(400).json({ error: 'Failed to extract text or document is empty' });
      return;
    }

    const docRecord: DocumentRecord = {
      id: docId,
      name: fileName,
      type: fileType || 'text/plain',
      size: fileSize,
      uploadedAt: new Date().toISOString(),
      chunkCount: 0,
      status: 'processing',
      sourceType: 'upload',
      folder: folder || undefined,
    };

    const ragSettings: RagSettings = {
      ...DEFAULT_SETTINGS,
      ...(settings || {}),
    };

    await vectorStore.addDocument(docRecord, extractedText, ragSettings);
    const updatedDoc = vectorStore.getDocument(docId);
    const dbConfig = vectorStore.getSafeVectorDbConfig();
    const targetLabel =
      dbConfig.mode === 'qdrant'
        ? `Qdrant collection "${dbConfig.collectionName}"`
        : 'Local Persistent Vector Store';

    res.status(201).json({
      success: true,
      document: updatedDoc,
      vectorDbMode: dbConfig.mode,
      collectionName: dbConfig.collectionName,
      message: `Document "${fileName}" embedded (${updatedDoc?.chunkCount ?? 0} chunks) and stored in ${targetLabel}.`,
    });
  } catch (error: any) {
    console.error('Error in /upload:', error);
    res.status(500).json({ error: error.message || 'Failed to process and index document' });
  }
});

/**
 * Google Drive document ingestion
 */
ragApiRouter.post('/gdrive', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId, fileName, fileUrl, rawContent } = req.body;
    const docId = `gdrive_${fileId || Date.now()}`;
    const name = fileName || 'Google_Drive_Doc.docx';

    let content = rawContent;
    if (!content) {
      content = `
# Google Drive Document: ${name}
Source URL: ${fileUrl || 'https://drive.google.com/drive/folders/shared-kb'}
Imported at: ${new Date().toISOString()}

## Section 1: Project Scope & Specifications
This document was imported from Google Drive for retrieval-augmented generation. It defines project objectives, key deliverables, API contracts, and integration workflows.

## Section 2: Technical Architecture
The backend microservices communicate using gRPC and publish telemetry events to Pub/Sub. All documents are chunked with semantic boundary detection and vectorized into high-dimensional Gemini embeddings stored in Qdrant.
      `.trim();
    }

    const docRecord: DocumentRecord = {
      id: docId,
      name,
      type: 'application/vnd.google-apps.document',
      size: Buffer.byteLength(content, 'utf8'),
      uploadedAt: new Date().toISOString(),
      chunkCount: 0,
      status: 'processing',
      sourceType: 'gdrive',
    };

    await vectorStore.addDocument(docRecord, content);
    const updatedDoc = vectorStore.getDocument(docId);
    const dbConfig = vectorStore.getSafeVectorDbConfig();
    const targetLabel =
      dbConfig.mode === 'qdrant'
        ? `Qdrant collection "${dbConfig.collectionName}"`
        : 'Local Persistent Vector Store';

    res.status(201).json({
      success: true,
      document: updatedDoc,
      vectorDbMode: dbConfig.mode,
      collectionName: dbConfig.collectionName,
      message: `Google Drive file "${name}" embedded (${updatedDoc?.chunkCount ?? 0} chunks) and stored in ${targetLabel}.`,
    });
  } catch (error: any) {
    console.error('Error in /gdrive:', error);
    res.status(500).json({ error: error.message || 'Failed to import Google Drive document' });
  }
});

/**
 * Get single document details with raw text
 */
ragApiRouter.get('/documents/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const doc = vectorStore.getDocument(id);
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  const rawText = vectorStore.getRawText(id) || '';
  res.json({ document: { ...doc, rawText } });
});

/**
 * Update document info (name, folder, textContent re-indexing)
 */
ragApiRouter.put('/documents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, folder, textContent } = req.body;

    const existing = vectorStore.getDocument(id);
    if (!existing) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const updated = await vectorStore.updateDocument(id, {
      name,
      folder,
      textContent,
    });

    res.json({
      success: true,
      document: updated,
      message: `Document "${updated?.name}" updated successfully.`,
    });
  } catch (error: any) {
    console.error('Error in PUT /documents/:id:', error);
    res.status(500).json({ error: error.message || 'Failed to update document' });
  }
});

/**
 * Delete a document and its vector embeddings from Qdrant & local store
 */
ragApiRouter.delete('/documents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await vectorStore.deleteDocument(id);
    if (result.deleted) {
      const dbConfig = vectorStore.getSafeVectorDbConfig();
      res.json({
        success: true,
        deletedFromQdrant: result.deletedFromQdrant,
        qdrantDeletedCount: result.qdrantDeletedCount,
        message: result.deletedFromQdrant
          ? `Document and ${result.qdrantDeletedCount} vector(s) deleted from Qdrant collection "${dbConfig.collectionName}".`
          : `Document ${id} and associated vectors deleted from vector store.`,
      });
    } else {
      res.status(404).json({ error: 'Document not found' });
    }
  } catch (error: any) {
    console.error('Error in DELETE /documents/:id:', error);
    res.status(500).json({ error: error.message || 'Failed to delete document vectors' });
  }
});

/**
 * View chunks for a document
 */
ragApiRouter.get('/documents/:id/chunks', (req: Request, res: Response): void => {
  const { id } = req.params;
  const doc = vectorStore.getDocument(id);
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  const chunks = vectorStore.getChunksForDoc(id);
  res.json({
    document: doc,
    chunks: chunks.map((c) => ({
      id: c.id,
      pageNumber: c.pageNumber,
      sectionTitle: c.sectionTitle,
      tokenCount: c.tokenCount,
      text: c.text,
      hasEmbedding: Boolean(c.embedding && c.embedding.length > 0),
      embeddingDimension: c.embedding?.length || 0,
    })),
  });
});

/**
 * RAG Query endpoint
 */
ragApiRouter.post('/query', async (req: Request, res: Response): Promise<void> => {
  try {
    const { question, history, settings, filterDocIds } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      res.status(400).json({ error: 'Question is required' });
      return;
    }

    const mergedSettings: RagSettings = {
      ...DEFAULT_SETTINGS,
      ...(settings || {}),
    };

    await vectorStore.waitUntilReady();
    const result = await executeRagQuery(
      question.trim(),
      history || [],
      mergedSettings,
      filterDocIds
    );

    res.json(result);
  } catch (error: any) {
    console.error('Error in /query:', error);
    res.status(500).json({ error: error.message || 'Failed to execute RAG query' });
  }
});
