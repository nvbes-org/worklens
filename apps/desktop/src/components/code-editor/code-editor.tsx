import { useQuery } from '@tanstack/react-query';
import type { FilePayload } from '@worklens/contracts';
import { Check, FileCode, Plus, Save, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { ErrorNotice, Loading } from '../common';
import { Button } from '../ui/button';
import { FuzzyFileFinder } from './fuzzy-file-finder';
import { detectLanguage } from './syntax-highlighter';

export function CodeEditor({
  initialPath,
  onClose,
  onViewDiff,
}: {
  initialPath?: string;
  onClose?: () => void;
  onViewDiff?: (path: string) => void;
}) {
  const { repo } = useSession();
  const git = useGit();
  const [currentPath, setCurrentPath] = useState(initialPath ?? '');
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const fileQuery = useQuery({
    queryKey: ['file_read', repo?.path, currentPath],
    queryFn: () => query<FilePayload>('file_read', repo?.path, { path: currentPath }),
    enabled: Boolean(repo && currentPath),
  });

  useEffect(() => {
    if (fileQuery.data) {
      setContent(fileQuery.data.content);
      setSavedContent(fileQuery.data.content);
      setStatusMsg(null);
    }
  }, [fileQuery.data]);

  useEffect(() => {
    if (initialPath && initialPath !== currentPath) {
      setCurrentPath(initialPath);
    }
  }, [initialPath, currentPath]);

  const isDirty = content !== savedContent;
  const lines = content.split('\n');
  const language = detectLanguage(currentPath);

  async function handleSave() {
    if (!repo || !currentPath || !isDirty) return;
    setIsSaving(true);
    setStatusMsg(null);
    try {
      await query('file_write', repo.path, { path: currentPath, content });
      setSavedContent(content);
      await git.refetch();
      const time = new Date().toLocaleTimeString();
      setStatusMsg(`Saved at ${time}`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStage() {
    if (!repo || !currentPath) return;
    try {
      if (isDirty) {
        await handleSave();
      }
      await query('git_action', repo.path, { action: 'stage_file', path: currentPath });
      await git.refetch();
      setStatusMsg('File staged successfully');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    }
  }

  // Keyboard shortcut for Cmd/Ctrl + S
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function handleScroll() {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  function updateCursor() {
    if (!textareaRef.current) return;
    const text = textareaRef.current.value.slice(0, textareaRef.current.selectionStart);
    const line = text.split('\n').length;
    const col = (text.split('\n').pop()?.length ?? 0) + 1;
    setCursorPos({ line, col });
  }

  return (
    <div className="flex flex-col h-full bg-card border rounded-xl overflow-hidden font-mono text-xs">
      {/* Editor Header */}
      <header className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="size-4 shrink-0 text-muted-foreground" />
          <button
            type="button"
            onClick={() => setFinderOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-background border hover:bg-accent text-foreground transition-colors cursor-pointer"
            title="Click or press ⌘P to switch file"
          >
            <span className="font-semibold truncate">{currentPath || 'Select or open a file...'}</span>
            <Search className="size-3 text-muted-foreground ml-1" />
          </button>
          {isDirty && (
            <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-sans font-medium">
              Modified
            </span>
          )}
          <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5 uppercase">
            {language}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {statusMsg && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 mr-2">
              <Check className="size-3 text-emerald-500" />
              {statusMsg}
            </span>
          )}
          {onViewDiff && currentPath && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onViewDiff(currentPath)}
              title="Compare with Git index / HEAD"
            >
              Diff
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void handleStage()}
            title="Save and stage this file into Git index"
          >
            <Plus className="size-3 mr-1" />
            Stage
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs"
            disabled={!isDirty || isSaving}
            onClick={() => void handleSave()}
            title="Save changes to disk (⌘S)"
          >
            <Save className="size-3 mr-1" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground rounded cursor-pointer"
              title="Close editor"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>

      {/* Editor Body */}
      <div className="flex-1 min-h-0 relative flex">
        {!currentPath ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <FileCode className="size-12 mb-3 opacity-40" />
            <p className="text-sm font-medium mb-1">No file opened in editor</p>
            <p className="text-xs mb-4">Use fuzzy file search to jump directly to any repository file.</p>
            <Button variant="outline" size="sm" onClick={() => setFinderOpen(true)}>
              <Search className="size-3.5 mr-1.5" />
              Open File (⌘P)
            </Button>
          </div>
        ) : fileQuery.isPending ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <Loading />
          </div>
        ) : fileQuery.isError ? (
          <div className="p-4">
            <ErrorNotice error={fileQuery.error} />
          </div>
        ) : (
          <div className="flex-1 flex min-h-0 overflow-hidden relative">
            {/* Gutter Line Numbers */}
            <div
              ref={gutterRef}
              className="w-12 shrink-0 py-3 pr-2.5 text-right select-none text-[11px] text-muted-foreground/50 border-r bg-muted/20 overflow-hidden leading-5 font-mono"
            >
              {lines.map((_, idx) => (
                <div key={idx}>{idx + 1}</div>
              ))}
            </div>

            {/* Editable Text Area */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onScroll={handleScroll}
              onKeyUp={updateCursor}
              onClick={updateCursor}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const start = e.currentTarget.selectionStart;
                  const end = e.currentTarget.selectionEnd;
                  const newContent = `${content.substring(0, start)}  ${content.substring(end)}`;
                  setContent(newContent);
                  setTimeout(() => {
                    if (textareaRef.current) {
                      textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
                    }
                  }, 0);
                }
              }}
              spellCheck={false}
              className="flex-1 p-3 bg-transparent resize-none outline-none leading-5 text-xs font-mono text-foreground whitespace-pre overflow-auto"
            />
          </div>
        )}
      </div>

      {/* Editor Status Bar */}
      <footer className="flex items-center justify-between px-3 py-1.5 border-t bg-muted/30 text-[11px] text-muted-foreground select-none">
        <div className="flex items-center gap-3">
          <span>
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
          <span>{lines.length} lines</span>
          <span>{new Blob([content]).size} bytes</span>
        </div>
        <div className="flex items-center gap-2">
          <span>UTF-8</span>
          <span>LF</span>
          <span>Spaces: 2</span>
        </div>
      </footer>

      {/* Fuzzy file finder modal */}
      <FuzzyFileFinder
        open={finderOpen}
        onOpenChange={setFinderOpen}
        onSelectFile={(path) => setCurrentPath(path)}
      />
    </div>
  );
}
