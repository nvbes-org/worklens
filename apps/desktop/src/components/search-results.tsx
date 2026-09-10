import { Link } from '@tanstack/react-router';
import { list, openSource, record, str } from '../lib/api';
import { useSession } from '../lib/session';
import { Button } from './ui/button';

export function SearchResults({ value }: { value: unknown }) {
  const data = record(value);
  const { repo } = useSession();
  return (
    <div className="divide-y rounded-lg border bg-white">
      <p className="p-3 text-xs text-muted-foreground">{str(data.scope)}</p>
      {[
        { key: 'projects', view: 'architecture' },
        { key: 'agents', view: 'agents' },
        { key: 'documents', view: 'documents' },
      ].flatMap((group) =>
        list(data[group.key]).map((item) => (
          <div
            key={str(item.id) || str(item.path)}
            className="flex items-center justify-between gap-3 p-3 text-sm"
          >
            <Link to="/$view" params={{ view: group.view }}>
              {str(item.name) || str(item.objective) || str(item.path)}
              <span className="ml-3 text-xs text-muted-foreground">{group.key}</span>
            </Link>
            {group.key === 'documents' && repo && (
              <Button size="sm" variant="ghost" onClick={() => void openSource(repo.path, str(item.path))}>
                Reveal source
              </Button>
            )}
          </div>
        )),
      )}
    </div>
  );
}
