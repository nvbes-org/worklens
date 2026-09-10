import type { Provenance } from '@worklens/contracts';
import { AlertCircle, ArrowUpRight, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { openUrl } from '../lib/api';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export function PageTitle({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </header>
  );
}
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="my-4 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <AlertCircle className="size-4 shrink-0 mt-0.5" />
      <span>{error instanceof Error ? error.message : String(error)}</span>
    </div>
  );
}
export function Loading() {
  return (
    <div role="status" className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" />
      Collecting source data…
    </div>
  );
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed px-8 py-12 text-center">
      <h3 className="font-medium">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
export function Source({ source }: { source: Provenance }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span
        className={`size-1.5 rounded-full ${source.status === 'available' ? 'bg-emerald-600' : 'bg-amber-500'}`}
      />
      <span>{source.source}</span>
      <Badge variant="outline" className="text-[10px]">
        {source.status}
      </Badge>
      <time>{new Date(source.collectedAt).toLocaleTimeString()}</time>
      {source.detail && <span>{source.detail}</span>}
    </div>
  );
}
export function ExternalLink({ url, children = 'Open on GitHub' }: { url: string; children?: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" onClick={() => void openUrl(url)}>
      {children}
      <ArrowUpRight className="size-3.5" />
    </Button>
  );
}
export function JsonPanel({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[480px] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs leading-6">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
