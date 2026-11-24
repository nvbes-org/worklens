import { ManagedWindow } from './managed-window';
import { useWindowManager } from './window-context';

export function WindowManagerLayer() {
  const { instances } = useWindowManager();

  const floatingWindows = instances.filter(
    (inst) => inst.dockMode === 'floating' && inst.state === 'visible',
  );

  if (floatingWindows.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="window-manager-floating-layer"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {floatingWindows.map((inst) => (
        <div key={inst.id} className="pointer-events-auto">
          <ManagedWindow instance={inst} />
        </div>
      ))}
    </div>
  );
}
