import type { ReactNode } from 'react';

export function ViewHeading({
  section,
  title,
  description,
  children,
}: {
  section: string;
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="view-heading">
      <p className="mb-3 text-xs font-medium text-muted-foreground">{section}</p>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-[-0.035em] leading-tight">{title}</h1>
          <div className="mt-2 text-[13px] text-muted-foreground">{description}</div>
        </div>
        {children}
      </div>
    </header>
  );
}
