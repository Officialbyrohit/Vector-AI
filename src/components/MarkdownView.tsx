import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { SourceCitation } from '../types.ts';

interface MarkdownViewProps {
  content: string;
  citations?: SourceCitation[];
  onCitationClick?: (index: number) => void;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  content,
  citations = [],
  onCitationClick,
}) => {
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);

  const copyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 2000);
  };

  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="text-zinc-200 leading-relaxed text-[14.5px] space-y-2.5">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3).trim().split('\n');
          const firstLine = lines[0]?.trim() || '';
          const hasLang = /^[a-zA-Z0-9_-]{1,20}$/.test(firstLine);
          const language = hasLang ? firstLine : 'text';
          const code = hasLang ? lines.slice(1).join('\n') : lines.join('\n');

          return (
            <div
              key={index}
              className="my-2.5 rounded-xl overflow-hidden border border-zinc-800 bg-[#161618] text-zinc-100 font-mono text-xs"
            >
              <div className="flex items-center justify-between px-3.5 py-2 bg-[#1c1c20] border-b border-zinc-800 text-[11px] text-zinc-400">
                <span className="text-zinc-300 font-mono">{language}</span>
                <button
                  type="button"
                  onClick={() => copyCode(code, index)}
                  className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer text-zinc-400"
                >
                  {copiedCodeIdx === index ? (
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
              </div>
              <pre className="p-3.5 overflow-x-auto text-zinc-200">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        const blocks = part.split(/\n{2,}/);
        return (
          <React.Fragment key={index}>
            {blocks.map((block, bIdx) => {
              const trimmed = block.trim();
              if (!trimmed) return null;

              if (trimmed.startsWith('#### ')) {
                return (
                  <h4 key={bIdx} className="text-sm font-semibold text-white mt-3 mb-1">
                    {renderInline(trimmed.slice(5), citations, onCitationClick)}
                  </h4>
                );
              }
              if (trimmed.startsWith('### ')) {
                return (
                  <h3 key={bIdx} className="text-[15px] font-semibold text-white mt-3.5 mb-1">
                    {renderInline(trimmed.slice(4), citations, onCitationClick)}
                  </h3>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h2 key={bIdx} className="text-base font-semibold text-white mt-4 mb-1.5">
                    {renderInline(trimmed.slice(3), citations, onCitationClick)}
                  </h2>
                );
              }
              if (trimmed.startsWith('# ')) {
                return (
                  <h1 key={bIdx} className="text-lg font-bold text-white mt-4 mb-1.5">
                    {renderInline(trimmed.slice(2), citations, onCitationClick)}
                  </h1>
                );
              }

              if (trimmed.startsWith('> ')) {
                return (
                  <blockquote
                    key={bIdx}
                    className="border border-zinc-800 px-3.5 py-2.5 text-zinc-300 bg-zinc-900/50 rounded-xl my-2"
                  >
                    {renderInline(trimmed.slice(2), citations, onCitationClick)}
                  </blockquote>
                );
              }

              // Support mixed lines (e.g., an intro sentence followed directly by bullets)
              const lines = trimmed.split('\n');
              const segments: Array<{ type: 'bullet' | 'number' | 'text'; items: string[] }> = [];

              for (const line of lines) {
                const isBullet = /^\s*[-*•]\s+/.test(line);
                const isNumber = /^\s*\d+\.\s+/.test(line);
                const type: 'bullet' | 'number' | 'text' = isBullet
                  ? 'bullet'
                  : isNumber
                  ? 'number'
                  : 'text';
                const last = segments[segments.length - 1];
                if (last && last.type === type) {
                  last.items.push(line);
                } else {
                  segments.push({ type, items: [line] });
                }
              }

              return (
                <div key={bIdx} className="space-y-2">
                  {segments.map((seg, sIdx) => {
                    if (seg.type === 'bullet') {
                      return (
                        <ul key={sIdx} className="list-disc list-outside ml-4 space-y-1.5">
                          {seg.items.map((l, lIdx) => (
                            <li key={lIdx} className="text-zinc-200 pl-0.5">
                              {renderInline(l.replace(/^\s*[-*•]\s+/, ''), citations, onCitationClick)}
                            </li>
                          ))}
                        </ul>
                      );
                    }
                    if (seg.type === 'number') {
                      return (
                        <ol key={sIdx} className="list-decimal list-outside ml-4 space-y-1.5">
                          {seg.items.map((l, lIdx) => (
                            <li key={lIdx} className="text-zinc-200 pl-0.5">
                              {renderInline(l.replace(/^\s*\d+\.\s+/, ''), citations, onCitationClick)}
                            </li>
                          ))}
                        </ol>
                      );
                    }
                    return (
                      <p key={sIdx} className="text-zinc-200">
                        {seg.items.map((l, lIdx) => (
                          <React.Fragment key={lIdx}>
                            {renderInline(l, citations, onCitationClick)}
                            {lIdx < seg.items.length - 1 && <br />}
                          </React.Fragment>
                        ))}
                      </p>
                    );
                  })}
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
};

function renderInline(
  text: string,
  citations?: SourceCitation[],
  onCitationClick?: (index: number) => void,
  depth = 0
): React.ReactNode {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[\d+(?:\s*,\s*\d+)*\])/g);

  return tokens.map((token, i) => {
    if (!token) return null;

    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {depth < 2 ? renderInline(token.slice(2, -2), citations, onCitationClick, depth + 1) : token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-[#222226] text-zinc-200 font-mono text-[12px] border border-zinc-800"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <em key={i} className="italic text-zinc-300">
          {depth < 2 ? renderInline(token.slice(1, -1), citations, onCitationClick, depth + 1) : token.slice(1, -1)}
        </em>
      );
    }

    const citationMatch = token.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
    if (citationMatch) {
      const numbers = citationMatch[1]
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 1);

      return (
        <span key={i} className="inline-flex items-baseline gap-0.5 mx-0.5">
          {numbers.map((num, nIdx) => {
            const citeIndex = num - 1;
            const cite = citations && citations[citeIndex];
            if (!cite) {
              return (
                <span key={nIdx} className="text-[11px] font-mono text-zinc-400">
                  [{num}]
                </span>
              );
            }
            const title = `[${num}] ${cite.documentName}${cite.pageNumber ? ` · Page ${cite.pageNumber}` : ''}`;

            return (
              <button
                key={nIdx}
                type="button"
                onClick={() => onCitationClick && onCitationClick(citeIndex)}
                className="inline-flex items-center text-[11px] font-mono font-semibold text-zinc-300 hover:text-white underline underline-offset-2 decoration-zinc-500 hover:decoration-white cursor-pointer px-1 rounded hover:bg-zinc-800 transition-colors"
                title={title}
              >
                [{num}]
              </button>
            );
          })}
        </span>
      );
    }

    return token;
  });
}
