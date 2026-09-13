import type { ComponentProject } from './component-graph';

export const componentCategories = {
  service: 'Services',
  lib: 'Libraries',
  ci: 'CI',
  tool: 'Tools',
  package: 'Packages',
  dependency: 'Dependencies / vendors',
  module: 'Other',
};

/** Infer a component role from its declarations and repository location. */
export function componentCategory(project: ComponentProject): keyof typeof componentCategories {
  if (project.external) return 'dependency';
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
  if (project.members.some((member) => ['lib', 'library', 'crate'].includes(member.kind))) return 'lib';
  if (project.members.some((member) => member.kind === 'package')) return 'package';
  return 'module';
}
