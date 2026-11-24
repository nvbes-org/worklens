import type { WindowInstance } from '../window-manager/types';
import { AuroraTerminalContent } from './aurora-terminal-content';
import { AuroraTerminalProvider, useOptionalAuroraTerminalContext } from './terminal-context';

export function AuroraTerminalWindow({ instance }: { instance: WindowInstance }) {
  const existingContext = useOptionalAuroraTerminalContext();

  if (existingContext) {
    return <AuroraTerminalContent />;
  }

  return (
    <AuroraTerminalProvider instance={instance}>
      <AuroraTerminalContent />
    </AuroraTerminalProvider>
  );
}
