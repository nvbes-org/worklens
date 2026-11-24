import { useQuery } from '@tanstack/react-query';
import type { FolderSizeEntry, FolderSizeReport } from '@worklens/contracts';
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  Folder,
  FolderOpen,
  HardDrive,
  Layers,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { query } from '../lib/api';
import { useSession } from '../lib/session';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';

export function formatBytes(bytes: number | bigint): string {
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (!n || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const val = n / 1024 ** i;
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export function FolderSizesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { repo } = useSession();
  const [includeHidden, setIncludeHidden] = useState(true);
  const [filter, setFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'tree' | 'files' | 'dirs'>('tree');

  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ['folder_sizes', repo?.path, includeHidden],
    queryFn: () =>
      query<FolderSizeReport>('folder_sizes', repo?.path, {
        subpath: '',
        maxDepth: 5,
        includeHidden,
      }),
    enabled: Boolean(repo?.path && open),
  });

  const totalBytes = Number(data?.total_bytes ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-3 border-b">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HardDrive className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">Folder Sizes & Storage</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Ultra-fast concurrent disk inspection for {repo?.name ?? 'repository'}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setIncludeHidden((prev) => !prev)}
              >
                {includeHidden ? 'Hide dotfiles' : 'Show dotfiles'}
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                className="size-7"
                disabled={isFetching}
                onClick={() => void refetch()}
                title="Rescan storage"
              >
                <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {data && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 text-xs">
              <Badge variant="secondary" className="font-mono text-xs font-semibold px-2.5 py-0.5">
                Total: {formatBytes(data.total_bytes)}
              </Badge>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                <strong className="text-foreground">{Number(data.total_files).toLocaleString()}</strong> files
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                <strong className="text-foreground">{Number(data.total_dirs).toLocaleString()}</strong>{' '}
                folders
              </span>
              <span className="text-muted-foreground">·</span>
              <Badge
                variant="outline"
                className="gap-1 text-emerald-600 dark:text-emerald-400 font-mono py-0"
              >
                <Zap className="size-3" />
                {Number(data.duration_ms)}ms
              </Badge>
            </div>
          )}
        </DialogHeader>

        {isPending ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <RefreshCw className="size-6 animate-spin text-primary" />
            <p className="text-sm">Calculating folder sizes across repository...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center text-rose-500 text-sm">
            Failed to inspect sizes: {String(error)}
          </div>
        ) : !data ? null : (
          <div className="flex flex-col flex-1 min-h-0 pt-3 gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter by name..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'tree' | 'files' | 'dirs')}>
                <TabsList variant="segmented">
                  <TabsTrigger value="tree" className="text-xs gap-1.5">
                    <Layers className="size-3.5" />
                    Tree
                  </TabsTrigger>
                  <TabsTrigger value="files" className="text-xs gap-1.5">
                    <File className="size-3.5" />
                    Top Files
                  </TabsTrigger>
                  <TabsTrigger value="dirs" className="text-xs gap-1.5">
                    <Folder className="size-3.5" />
                    Top Folders
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-2 text-xs">
              {activeTab === 'tree' && (
                <div className="space-y-0.5">
                  <TreeNode
                    node={data.tree}
                    totalBytes={totalBytes}
                    depth={0}
                    filter={filter.toLowerCase()}
                    defaultOpen={true}
                  />
                </div>
              )}

              {activeTab === 'files' && (
                <RankingList
                  items={data.top_largest_files}
                  totalBytes={totalBytes}
                  filter={filter.toLowerCase()}
                  isFile
                />
              )}

              {activeTab === 'dirs' && (
                <RankingList
                  items={data.top_largest_dirs}
                  totalBytes={totalBytes}
                  filter={filter.toLowerCase()}
                  isFile={false}
                />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TreeNode({
  node,
  totalBytes,
  depth,
  filter,
  defaultOpen,
}: {
  node: FolderSizeEntry;
  totalBytes: number;
  depth: number;
  filter: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen && depth <= 1);
  const size = Number(node.size_bytes);
  const percentage = totalBytes > 0 ? (size / totalBytes) * 100 : 0;
  const hasChildren = Boolean(node.children && node.children.length > 0);

  const matchesSelf =
    !filter || node.name.toLowerCase().includes(filter) || node.path.toLowerCase().includes(filter);

  const filteredChildren = useMemo(() => {
    if (!node.children) return [];
    if (!filter) return node.children;
    return node.children.filter(
      (c) =>
        c.name.toLowerCase().includes(filter) ||
        c.path.toLowerCase().includes(filter) ||
        c.children?.some((sub) => sub.name.toLowerCase().includes(filter)),
    );
  }, [node.children, filter]);

  if (filter && !matchesSelf && filteredChildren.length === 0) {
    return null;
  }

  const isExpanded = filter ? true : open;

  return (
    <div className="select-none">
      <button
        type="button"
        className={`group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/60 transition-colors cursor-pointer w-full text-left font-normal border-0 bg-transparent ${
          depth === 0 ? 'font-semibold bg-accent/30' : ''
        }`}
        style={{ paddingLeft: `${Math.max(8, depth * 16)}px` }}
        onClick={() => hasChildren && setOpen(!open)}
      >
        <span className="size-4 shrink-0 text-muted-foreground flex items-center justify-center">
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )
          ) : (
            <span className="size-1 rounded-full bg-border" />
          )}
        </span>

        {node.is_dir ? (
          isExpanded ? (
            <FolderOpen className="size-3.5 text-amber-500 shrink-0" />
          ) : (
            <Folder className="size-3.5 text-amber-500 shrink-0" />
          )
        ) : (
          <FileCode className="size-3.5 text-blue-500 shrink-0" />
        )}

        <span className="truncate font-mono text-[12px] flex-1">
          {node.name || '.'}
          {node.is_dir && node.file_count > 0 && (
            <span className="ml-2 font-sans text-[11px] text-muted-foreground font-normal">
              ({Number(node.file_count)} files)
            </span>
          )}
        </span>

        <div className="flex items-center gap-3 shrink-0 ml-auto">
          <div className="w-20 bg-muted/60 h-1.5 rounded-full overflow-hidden hidden sm:block">
            <div
              className={`h-full rounded-full transition-all ${
                percentage > 30 ? 'bg-rose-500' : percentage > 10 ? 'bg-amber-500' : 'bg-primary'
              }`}
              style={{ width: `${Math.min(100, Math.max(1, percentage))}%` }}
            />
          </div>
          <span className="w-12 text-right font-mono text-[11px] text-muted-foreground">
            {percentage >= 0.1 ? `${percentage.toFixed(1)}%` : '<0.1%'}
          </span>
          <span className="w-18 text-right font-mono font-medium text-[12px]">
            {formatBytes(node.size_bytes)}
          </span>
        </div>
      </button>

      {isExpanded && hasChildren && (
        <div className="space-y-0.5">
          {filteredChildren.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              totalBytes={totalBytes}
              depth={depth + 1}
              filter={filter}
              defaultOpen={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RankingList({
  items,
  totalBytes,
  filter,
  isFile,
}: {
  items: FolderSizeEntry[];
  totalBytes: number;
  filter: string;
  isFile: boolean;
}) {
  const filtered = useMemo(() => {
    if (!filter) return items;
    return items.filter(
      (item) => item.name.toLowerCase().includes(filter) || item.path.toLowerCase().includes(filter),
    );
  }, [items, filter]);

  if (filtered.length === 0) {
    return <div className="py-8 text-center text-muted-foreground">No items match your filter.</div>;
  }

  return (
    <div className="divide-y divide-border/40">
      {filtered.map((item, index) => {
        const size = Number(item.size_bytes);
        const percentage = totalBytes > 0 ? (size / totalBytes) * 100 : 0;
        return (
          <div key={item.path} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/40">
            <span className="w-6 font-mono text-[11px] text-muted-foreground text-center">#{index + 1}</span>
            {isFile ? (
              <FileCode className="size-3.5 text-blue-500 shrink-0" />
            ) : (
              <Folder className="size-3.5 text-amber-500 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[12px] truncate font-medium text-foreground">{item.name}</p>
              <p className="font-mono text-[11px] truncate text-muted-foreground">{item.path}</p>
            </div>
            {!isFile && item.file_count > 0 && (
              <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">
                {Number(item.file_count)} files
              </span>
            )}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-20 bg-muted/60 h-1.5 rounded-full overflow-hidden hidden sm:block">
                <div
                  className={`h-full rounded-full transition-all ${
                    percentage > 30 ? 'bg-rose-500' : percentage > 10 ? 'bg-amber-500' : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(1, percentage))}%` }}
                />
              </div>
              <span className="w-12 text-right font-mono text-[11px] text-muted-foreground">
                {percentage >= 0.1 ? `${percentage.toFixed(1)}%` : '<0.1%'}
              </span>
              <span className="w-18 text-right font-mono font-semibold text-[12px]">
                {formatBytes(item.size_bytes)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
