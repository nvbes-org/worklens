import type { ComponentProject } from './component-graph';

export const componentCategories = {
  service: 'Services',
  lib: 'Libraries',
  ci: 'CI',
  tool: 'Tools',
  module: 'Other',
};

/** Infer a component role from its declarations and repository location. */
export function componentCategory(project: ComponentProject): keyof typeof componentCategories {
  const paths = project.members.map((member) => member.root.toLowerCase().split('/'));
  const has = (...segments: string[]) => paths.some((parts) => parts.some((part) => segments.includes(part)));
  if (has('.github', '.gitlab', '.circleci', 'ci', 'workflows')) return 'ci';
  if (has('tools', 'tooling', 'scripts', 'generators')) return 'tool';
  if (has('libs', 'lib', 'libraries', 'packages', 'crates')) return 'lib';
  if (
    has('apps', 'services') ||
    project.members.some((member) => ['app', 'application', 'service'].includes(member.kind))
  )
    return 'service';
  if (project.members.some((member) => ['lib', 'library', 'crate', 'package'].includes(member.kind)))
    return 'lib';
  return 'module';
}
