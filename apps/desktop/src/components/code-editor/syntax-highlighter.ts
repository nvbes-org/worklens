export type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'type' | 'function' | 'plain';

export interface Token {
  text: string;
  type: TokenType;
}

const KEYWORDS = new Set([
  'fn',
  'let',
  'const',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'loop',
  'match',
  'case',
  'switch',
  'break',
  'continue',
  'import',
  'from',
  'export',
  'default',
  'class',
  'type',
  'interface',
  'pub',
  'struct',
  'enum',
  'impl',
  'trait',
  'async',
  'await',
  'use',
  'mod',
  'mut',
  'self',
  'super',
  'crate',
  'true',
  'false',
  'null',
  'undefined',
  'nil',
  'try',
  'catch',
  'finally',
  'throw',
  'new',
  'in',
  'of',
  'typeof',
  'instanceof',
  'void',
  'as',
  'def',
  'elif',
  'with',
  'yield',
  'lambda',
  'select',
  'where',
  'from',
  'insert',
  'update',
  'delete',
]);

export function detectLanguage(path = ''): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'rs':
      return 'rust';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    case 'toml':
      return 'toml';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    case 'py':
      return 'python';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'shell';
    case 'md':
      return 'markdown';
    case 'sql':
      return 'sql';
    default:
      return 'plain';
  }
}

export function tokenizeLine(line: string, _lang = 'plain'): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    // Single-line comment: // or #
    if (line.slice(i, i + 2) === '//' || line[i] === '#') {
      tokens.push({ text: line.slice(i), type: 'comment' });
      break;
    }

    // Strings
    const char = line[i];
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      let end = i + 1;
      let escaped = false;
      while (end < len) {
        if (!escaped && line[end] === quote) {
          end++;
          break;
        }
        escaped = !escaped && line[end] === '\\';
        end++;
      }
      tokens.push({ text: line.slice(i, end), type: 'string' });
      i = end;
      continue;
    }

    // Numbers
    if (/\d/.test(char) && (i === 0 || !/[a-zA-Z0-9_$]/.test(line[i - 1]))) {
      let end = i + 1;
      while (end < len && /[0-9a-fA-FxX._]/.test(line[end])) {
        end++;
      }
      tokens.push({ text: line.slice(i, end), type: 'number' });
      i = end;
      continue;
    }

    // Identifiers & Keywords
    if (/[a-zA-Z_$]/.test(char)) {
      let end = i + 1;
      while (end < len && /[a-zA-Z0-9_$]/.test(line[end])) {
        end++;
      }
      const word = line.slice(i, end);
      if (KEYWORDS.has(word)) {
        tokens.push({ text: word, type: 'keyword' });
      } else if (/^[A-Z][a-zA-Z0-9_]*$/.test(word)) {
        tokens.push({ text: word, type: 'type' });
      } else if (end < len && line[end] === '(') {
        tokens.push({ text: word, type: 'function' });
      } else {
        tokens.push({ text: word, type: 'plain' });
      }
      i = end;
      continue;
    }

    // Punctuation / whitespace
    tokens.push({ text: char, type: 'plain' });
    i++;
  }

  return tokens;
}

export function tokenClass(type: TokenType): string {
  switch (type) {
    case 'keyword':
      return 'text-purple-600 dark:text-purple-400 font-semibold';
    case 'string':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'comment':
      return 'text-muted-foreground italic opacity-80';
    case 'number':
      return 'text-amber-600 dark:text-amber-400';
    case 'type':
      return 'text-cyan-600 dark:text-cyan-400';
    case 'function':
      return 'text-blue-600 dark:text-blue-400';
    default:
      return 'text-foreground';
  }
}
