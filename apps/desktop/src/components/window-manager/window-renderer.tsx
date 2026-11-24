import type { ReactNode } from 'react';
import { AuroraTerminalWindow } from '../terminal';
import { ProcessesPage } from '../../pages/processes';
import { SampleWindowContent } from './sample-window-content';
import type { WindowInstance } from './types';

export function renderWindowContent(
  instance: WindowInstance,
  customRenderers: Map<string, (instance: WindowInstance) => ReactNode>,
): ReactNode {
  if (instance.rendererId === 'aurora-terminal') {
    return <AuroraTerminalWindow instance={instance} />;
  }
  if (instance.rendererId === 'process-manager') {
    return <ProcessesPage />;
  }
  if (instance.rendererId) {
    const renderer = customRenderers.get(instance.rendererId);
    if (renderer) return renderer(instance);
  }
  return <SampleWindowContent instance={instance} />;
}
