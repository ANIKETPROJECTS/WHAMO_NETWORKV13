import { WhamoNode, WhamoEdge } from './store';

export interface ValidationError {
  id: string;
  message: string;
  type: 'error' | 'warning';
}

export function validateNetwork(nodes: WhamoNode[], edges: WhamoEdge[]): { errors: ValidationError[], warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const addError = (id: string, message: string) => errors.push({ id, message, type: 'error' });
  const addWarning = (id: string, message: string) => warnings.push({ id, message, type: 'warning' });

  // 1. General Network Rules
  const reservoirs = nodes.filter(n => n.type === 'reservoir');
  if (reservoirs.length === 0) {
    addError('network', 'The network must contain at least one Reservoir acting as a source.');
  }

  // ID Uniqueness (except pipes)
  const idCounts = new Map<string, number>();
  nodes.forEach(n => {
    const label = n.data.label;
    idCounts.set(label, (idCounts.get(label) || 0) + 1);
  });
  nodes.forEach(n => {
    if (n.type !== 'node' && n.type !== 'junction') { // Based on rules, only pipes can have duplicates, but specifically non-pipe elements must be unique
      if ((idCounts.get(n.data.label) || 0) > 1) {
        addError(n.id, `Duplicate ID detected: ${n.type} ${n.data.label} appears multiple times.`);
      }
    }
  });

  // 2. Connectivity & Topology
  const adjacency = new Map<string, string[]>();
  nodes.forEach(n => adjacency.set(n.id, []));
  edges.forEach(e => {
    adjacency.get(e.source)?.push(e.target);
    adjacency.get(e.target)?.push(e.source);
  });

  // Check for floating elements
  nodes.forEach(n => {
    const connections = adjacency.get(n.id) || [];
    if (connections.length === 0) {
      addError(n.id, `${n.data.label || n.id} is not connected to the network.`);
    }
  });

  // Fully connected check (from first reservoir)
  if (reservoirs.length > 0) {
    const visited = new Set<string>();
    const queue = [reservoirs[0].id];
    visited.add(reservoirs[0].id);
    
    let head = 0;
    while(head < queue.length) {
      const current = queue[head++];
      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    
    nodes.forEach(n => {
      if (!visited.has(n.id)) {
        addError(n.id, `${n.data.label || n.id} is not reachable from the reservoir.`);
      }
    });
  }

  // 3. Element Specific Validation
  nodes.forEach(n => {
    const d = n.data;
    const connections = adjacency.get(n.id) || [];

    if (n.type === 'reservoir') {
      if (connections.length !== 1) {
        addError(n.id, `Reservoir ${d.label} must connect to exactly one pipe.`);
      }
      if (d.reservoirElevation === undefined || d.reservoirElevation === '') {
        addError(n.id, `Reservoir ${d.label} missing elevation value.`);
      }
    }

    if (n.type === 'surgeTank') {
      if (connections.length !== 1) {
        addError(n.id, `Surge Tank ${d.label} must connect to exactly one node.`);
      }
      if (d.tankTop === undefined || d.tankBottom === undefined || d.tankTop === '' || d.tankBottom === '') {
        addError(n.id, `Surge Tank ${d.label} missing required elevation parameters.`);
      } else if (Number(d.tankTop) <= Number(d.tankBottom)) {
        addError(n.id, `Surge Tank ${d.label} Top Elevation must be greater than Bottom Elevation.`);
      }
      if (!d.hasShape && (d.diameter === undefined || d.diameter === '')) {
        addError(n.id, `Surge Tank ${d.label} missing Diameter.`);
      }
      if (d.celerity === undefined || d.celerity === '') addError(n.id, `Surge Tank ${d.label} missing Celerity.`);
      if (d.friction === undefined || d.friction === '') addError(n.id, `Surge Tank ${d.label} missing Friction.`);
    }

    if (n.type === 'flowBoundary') {
      if (connections.length !== 1) {
        addError(n.id, `Flow Boundary ${d.label} must connect to exactly one node.`);
      }
      if (d.scheduleNumber === undefined) {
        addError(n.id, `Flow Boundary ${d.label} missing Q-Schedule.`);
      }
    }

    if (n.type === 'node' || n.type === 'junction') {
      const isBoundary = nodes.some(other => 
        (other.type === 'reservoir' || other.type === 'flowBoundary') && 
        adjacency.get(other.id)?.includes(n.id)
      );
      if (connections.length < 2 && !isBoundary) {
        addWarning(n.id, `Node ${d.label} has fewer than 2 connections and is not a boundary.`);
      }
    }
  });

  edges.forEach(e => {
    const d = e.data;
    if (d?.type === 'conduit') {
      if (d.length === undefined || d.length === '') addError(e.id, `Conduit ${d.label} missing required parameter: Length`);
      if (!d.variable && (d.diameter === undefined || d.diameter === '')) addError(e.id, `Conduit ${d.label} missing required parameter: Diameter`);
      if (d.celerity === undefined || d.celerity === '') addError(e.id, `Conduit ${d.label} missing required parameter: Celerity`);
      if (d.friction === undefined || d.friction === '') addError(e.id, `Conduit ${d.label} missing required parameter: Friction`);

      if (Number(d.length) < 1) addWarning(e.id, `Pipe ${d.label} has very short length detected.`);
      if (Number(d.friction) > 0.1) addWarning(e.id, `Pipe ${d.label} friction value unusually high.`);
    }
  });

  return { errors, warnings };
}
