/**
 * Positioned YAML loader (M2.2). Parses an MFS file into plain data while
 * keeping every node's source range, so validator findings can point at
 * file:line:col — including paths produced by zod issues.
 */

import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  type Document,
  type Node,
} from 'yaml';

export interface SourcePos {
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly col: number;
}

export interface YamlParseIssue {
  readonly message: string;
  readonly pos: SourcePos;
}

export type Path = readonly (string | number)[];

export interface LoadedYaml {
  /** Plain-data document (aliases resolved), or undefined on parse failure. */
  readonly value: unknown;
  /** Syntax errors, empty when the document parsed. */
  readonly issues: readonly YamlParseIssue[];
  /**
   * Source position for the node at `path` (e.g. ['scenes', 0, 'id']).
   * Falls back to the deepest existing ancestor, then to 1:1.
   */
  readonly locate: (path: Path) => SourcePos;
}

export function loadYaml(text: string): LoadedYaml {
  const lineCounter = new LineCounter();
  const doc: Document = parseDocument(text, { lineCounter, keepSourceTokens: true });

  const posOfOffset = (offset: number): SourcePos => {
    const { line, col } = lineCounter.linePos(offset);
    return { line, col };
  };

  const issues: YamlParseIssue[] = doc.errors.map((err) => ({
    message: err.message.split('\n')[0] ?? err.message,
    pos: posOfOffset(err.pos[0] ?? 0),
  }));

  const nodeAt = (path: Path): Node | null => {
    let node: unknown = doc.contents;
    let deepest: Node | null = (doc.contents as Node) ?? null;
    for (const key of path) {
      if (isAlias(node)) node = node.resolve(doc);
      let next: unknown = null;
      if (isMap(node)) {
        const pair = node.items.find((p) => isScalar(p.key) && p.key.value === key);
        next = pair?.value ?? null;
      } else if (isSeq(node) && typeof key === 'number') {
        next = node.items[key] ?? null;
      }
      if (!next) return deepest;
      node = next;
      deepest = next as Node;
    }
    return deepest;
  };

  const locate = (path: Path): SourcePos => {
    const node = nodeAt(path);
    const offset = node?.range?.[0];
    return offset === undefined ? { line: 1, col: 1 } : posOfOffset(offset);
  };

  return {
    value: issues.length > 0 ? undefined : doc.toJS(),
    issues,
    locate,
  };
}
