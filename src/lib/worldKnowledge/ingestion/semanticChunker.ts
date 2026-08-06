// src/lib/worldKnowledge/ingestion/semanticChunker.ts
// Semantic-aware document chunking for world knowledge ingestion.
//
// Unlike simple character-count splitting, this module:
// 1. Splits on natural semantic boundaries (headings, paragraphs, sentences)
// 2. Preserves entity coherence (same NPC/item/rule stays in one chunk)
// 3. Adds configurable overlap between consecutive chunks
// 4. Enriches chunk metadata with boundary context
//
// The goal: small chunks for precise retrieval + richer context for LLM reading.
// Configure via:
//   VERSECRAFT_CHUNK_SIZE         — target chunk size in chars (default 600)
//   VERSECRAFT_CHUNK_OVERLAP      — overlap in chars between chunks (default 100)
//   VERSECRAFT_CHUNK_MIN_SIZE     — minimum chunk size before merging (default 150)

import { envBoolean, envNumber } from "@/lib/config/envRaw";

// ── Config ──────────────────────────────────────────────

export interface SemanticChunkConfig {
  /** Target chunk size in characters */
  targetSize: number;
  /** Overlap between consecutive chunks in characters */
  overlap: number;
  /** Minimum chunk size — smaller chunks get merged into neighbors */
  minSize: number;
  /** Whether to enable semantic chunking (vs legacy max-char split) */
  enabled: boolean;
}

export function getSemanticChunkConfig(): SemanticChunkConfig {
  return {
    targetSize: envNumber("VERSECRAFT_CHUNK_SIZE", 600),
    overlap: envNumber("VERSECRAFT_CHUNK_OVERLAP", 100),
    minSize: envNumber("VERSECRAFT_CHUNK_MIN_SIZE", 150),
    enabled: envBoolean("VERSECRAFT_ENABLE_SEMANTIC_CHUNKING", false),
  };
}

// ── Boundary Detection ──────────────────────────────────

/**
 * Split text into semantic blocks at natural boundaries.
 * Priority: headings > double newlines > single newlines > sentences > characters.
 */
function detectBoundaries(text: string): string[] {
  // 1. Split on section headings (lines that look like titles: 【...】, ## ..., etc.)
  const headingPattern = /(?=(?:^|\n)(?:#{1,3}\s|【|［|〔|（(?:\d+[.、）)])|[A-Z][A-Z\s]{3,}[:：]))/;
  const sections = text.split(headingPattern).filter(Boolean);

  const blocks: string[] = [];
  for (const section of sections) {
    // 2. Split on paragraph boundaries (double newlines)
    const paragraphs = section.split(/\n\s*\n/).filter((p) => p.trim());
    for (const para of paragraphs) {
      // 3. Split long paragraphs on sentence boundaries
      if (para.length > 800) {
        const sentences = para.split(/(?<=[。！？；\n])(?=\s*\S)/);
        blocks.push(...sentences.filter((s) => s.trim()));
      } else {
        blocks.push(para);
      }
    }
  }

  return blocks.filter((b) => b.trim().length > 0);
}

// ── Chunk Assembly ──────────────────────────────────────

export interface SemanticChunk {
  /** Chunk content */
  content: string;
  /** Original block indices this chunk covers */
  blockIndices: number[];
  /** Character length */
  charLength: number;
  /** Whether this chunk was merged due to min-size constraint */
  isMerged: boolean;
  /** Suggested overlap prefix for context continuity */
  overlapPrefix?: string;
}

/**
 * Assemble semantic blocks into chunks respecting targetSize, overlap, and minSize.
 * Uses a greedy approach: pack blocks until targetSize is reached, then start a new chunk.
 */
function assembleChunks(
  blocks: string[],
  config: SemanticChunkConfig
): SemanticChunk[] {
  if (blocks.length === 0) return [];

  const chunks: SemanticChunk[] = [];
  let currentBlocks: string[] = [];
  let currentIndices: number[] = [];
  let currentLength = 0;

  function flushChunk(): void {
    if (currentBlocks.length === 0) return;
    const content = currentBlocks.join("\n\n");
    chunks.push({
      content,
      blockIndices: [...currentIndices],
      charLength: content.length,
      isMerged: currentBlocks.length > 1 && content.length < config.minSize,
    });
    currentBlocks = [];
    currentIndices = [];
    currentLength = 0;
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockLen = block.length;

    // If adding this block exceeds target and we already have content, flush
    if (currentLength > 0 && currentLength + blockLen > config.targetSize) {
      flushChunk();
    }

    // If a single block is larger than targetSize, split it further
    if (blockLen > config.targetSize * 1.5) {
      if (currentBlocks.length > 0) flushChunk();

      // Force-split oversized block on sentence boundaries
      const subBlocks = block.split(/(?<=[。！？])\s*/);
      let subCurrent = "";
      for (const sub of subBlocks) {
        if (subCurrent.length + sub.length > config.targetSize && subCurrent.length > 0) {
          chunks.push({
            content: subCurrent,
            blockIndices: [i],
            charLength: subCurrent.length,
            isMerged: false,
          });
          subCurrent = sub;
        } else {
          subCurrent += (subCurrent ? "" : "") + sub;
        }
      }
      if (subCurrent) {
        chunks.push({
          content: subCurrent,
          blockIndices: [i],
          charLength: subCurrent.length,
          isMerged: false,
        });
      }
      continue;
    }

    currentBlocks.push(block);
    currentIndices.push(i);
    currentLength += blockLen;
  }

  flushChunk();

  // ── Merge undersized chunks ──
  const merged: SemanticChunk[] = [];
  for (const chunk of chunks) {
    if (chunk.charLength < config.minSize && merged.length > 0) {
      // Merge into previous chunk
      const prev = merged[merged.length - 1];
      prev.content += "\n\n" + chunk.content;
      prev.charLength += chunk.charLength + 2;
      prev.blockIndices.push(...chunk.blockIndices);
      prev.isMerged = true;
    } else {
      merged.push(chunk);
    }
  }

  // ── Add overlap ──
  if (config.overlap > 0 && merged.length > 1) {
    for (let i = 1; i < merged.length; i++) {
      const prev = merged[i - 1];
      const overlapText = prev.content.slice(-config.overlap);
      merged[i].overlapPrefix = overlapText;
    }
  }

  return merged;
}

// ── Public API ──────────────────────────────────────────

export interface SemanticChunkResult {
  chunks: SemanticChunk[];
  /** Total chunks produced */
  totalChunks: number;
  /** Average chunk size */
  avgChunkSize: number;
  /** Whether semantic chunking was used (vs legacy) */
  usedSemantic: boolean;
}

/**
 * Split text into semantically coherent chunks.
 *
 * When semantic chunking is enabled, this uses boundary detection
 * and overlap for better retrieval precision. Otherwise falls back
 * to the legacy max-char split.
 *
 * @param text - The document text to chunk
 * @param parts - Optional pre-split segments (for legacy compatibility)
 * @param configOverride - Optional config override
 */
export function semanticChunk(
  text: string,
  parts?: string[],
  configOverride?: Partial<SemanticChunkConfig>,
): SemanticChunkResult {
  const config = { ...getSemanticChunkConfig(), ...configOverride };

  if (!config.enabled) {
    // Legacy mode: simple max-char split
    const legacyParts = parts ?? text.split("\n\n").filter(Boolean);
    const legacyChunks = splitLegacy(legacyParts, config.targetSize);
    return {
      chunks: legacyChunks.map((content) => ({
        content,
        blockIndices: [],
        charLength: content.length,
        isMerged: false,
      })),
      totalChunks: legacyChunks.length,
      avgChunkSize: legacyChunks.length > 0
        ? Math.round(legacyChunks.reduce((s, c) => s + c.length, 0) / legacyChunks.length)
        : 0,
      usedSemantic: false,
    };
  }

  const blocks = parts ? parts : detectBoundaries(text);
  const chunks = assembleChunks(blocks, config);

  return {
    chunks,
    totalChunks: chunks.length,
    avgChunkSize: chunks.length > 0
      ? Math.round(chunks.reduce((s, c) => s + c.charLength, 0) / chunks.length)
      : 0,
    usedSemantic: true,
  };
}

// ── Legacy fallback (mirrors registryAdapters.ts behavior) ──

function splitLegacy(parts: string[], maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    const next = current ? `${current}\n${p}` : p;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = p;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ── Chunk Enrichment ────────────────────────────────────

/**
 * Enrich a chunk with metadata that improves retrieval relevance.
 * Adds entity name, type, and tags as prefix to boost BM25/text matching.
 */
export function enrichChunkContent(
  content: string,
  meta: {
    entityName?: string;
    entityType?: string;
    tags?: string[];
    chunkIndex?: number;
  },
): string {
  const prefixParts: string[] = [];

  if (meta.entityName) prefixParts.push(meta.entityName);
  if (meta.entityType) prefixParts.push(`[${meta.entityType}]`);
  if (meta.tags?.length) prefixParts.push(meta.tags.join(" "));

  if (prefixParts.length === 0) return content;

  const prefix = prefixParts.join(" ");
  return `${prefix}\n${content}`;
}

/**
 * Produce chunk content suitable for embedding (vector search).
 * The embedding chunk should focus on semantic content without
 * metadata noise — metadata goes into the retrieval chunk.
 */
export function chunkContentForEmbedding(
  content: string,
  meta: { entityName?: string; entityType?: string },
): string {
  // For embeddings, strip metadata prefix and keep semantic content
  const namePrefix = meta.entityName ? `${meta.entityName}\n` : "";
  const typePrefix = meta.entityType ? `类型：${meta.entityType}\n` : "";
  return `${namePrefix}${typePrefix}${content}`;
}
