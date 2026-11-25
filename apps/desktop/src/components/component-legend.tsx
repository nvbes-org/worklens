import { componentCategories } from '../lib/component-category';

export function ComponentLegend() {
  return (
    <fieldset className="architecture-legend" aria-label="Component categories">
      {Object.entries(componentCategories).map(([category, label]) => (
        <span key={category}>
          <i className={`component-${category}`} />
          {label}
        </span>
      ))}
      <span className="ml-auto">Module → dependency</span>
    </fieldset>
  );
}
