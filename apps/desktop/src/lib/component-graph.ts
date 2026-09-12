import type { Edge, Graph, Project } from '@worklens/contracts';

export type ComponentProject = Project & { members: Project[] };
const priority = (project: Project) => {
  const rank = ['nx', 'cargo', 'pnpm', 'npm'].indexOf(project.ecosystem);
  return rank < 0 ? 4 : rank;
};

/** Project the engine's component identities without losing the original tool records. */
export function componentGraph(graph?: Graph) {
  const originals = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const aliases = new Map<string, string>();
  const nodes: ComponentProject[] = [];
  for (const group of graph?.components ?? []) {
    const members = group.memberIds
      .map((id) => originals.get(id))
      .filter((node): node is Project => Boolean(node));
    members.sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id));
    const primary = members[0];
    if (!primary) continue;
    for (const member of members) aliases.set(member.id, group.id);
    nodes.push({
      ...primary,
      id: group.id,
      members,
      features: [...new Set(members.flatMap((member) => member.features))],
    });
  }
  for (const node of originals.values()) {
    if (!aliases.has(node.id)) {
      aliases.set(node.id, node.id);
      nodes.push({ ...node, members: [node] });
    }
  }
  nodes.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const connections = new Map<string, Edge>();
  for (const edge of graph?.edges ?? []) {
    const source = aliases.get(edge.source);
    const target = aliases.get(edge.target);
    if (!source || !target || source === target) continue;
    const key = JSON.stringify([source, target]);
    const origin = `${edge.kind} · ${edge.evidence} · ${edge.origin}`;
    const previous = connections.get(key);
    if (previous) {
      previous.origin = [...new Set([...previous.origin.split('\n'), origin])].join('\n');
      if (edge.evidence === 'observed' || (edge.evidence === 'declared' && previous.evidence === 'candidate'))
        previous.evidence = edge.evidence;
    } else connections.set(key, { ...edge, source, target, origin });
  }
  return { nodes, edges: [...connections.values()], sources: graph?.sources ?? [], components: [] };
}

export function ecosystems(project: ComponentProject) {
  return [...new Set(project.members.map((member) => member.ecosystem))];
}
