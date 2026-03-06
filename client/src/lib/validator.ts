import { WhamoNode, WhamoEdge } from './store';

export interface ValidationError {
  id: string;
  message: string;
  type: 'error' | 'warning';
  elementLabel?: string;
  elementType?: string;
}

export function validateNetwork(nodes: WhamoNode[], edges: WhamoEdge[]): { errors: ValidationError[], warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const addError = (id: string, message: string, elementLabel?: string, elementType?: string) => 
    errors.push({ id, message, type: 'error', elementLabel, elementType });
  const addWarning = (id: string, message: string, elementLabel?: string, elementType?: string) => 
    warnings.push({ id, message, type: 'warning', elementLabel, elementType });

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
    if (n.type !== 'node' && n.type !== 'junction') { 
      if ((idCounts.get(n.data.label) || 0) > 1) {
        addError(n.id, `Duplicate ID detected: ${n.type} ${n.data.label} appears multiple times.`, n.data.label, n.type);
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
      addError(n.id, `${n.data.label || n.id} is not connected to the network.`, n.data.label, n.type);
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
        addError(n.id, `${n.data.label || n.id} is not reachable from the reservoir.`, n.data.label, n.type);
      }
    });
  }

  // 3. Element Specific Validation
  nodes.forEach(n => {
    const d = n.data;
    const connections = adjacency.get(n.id) || [];

    if (n.type === 'reservoir') {
      if (connections.length !== 1) {
        addError(n.id, `Reservoir ${d.label} must connect to exactly one pipe.`, d.label, n.type);
      }
      
      // Check if it connects to another reservoir
      const targetNodeIds = edges
        .filter(e => e.source === n.id || e.target === n.id)
        .map(e => e.source === n.id ? e.target : e.source);
      
      targetNodeIds.forEach(targetId => {
        const targetNode = nodes.find(node => node.id === targetId);
        if (targetId === n.id) return; // Should already be handled by "connected to itself" check
        if (targetNode?.type === 'reservoir') {
          addError(n.id, `Reservoir ${d.label} cannot connect directly to another Reservoir (${targetNode.data.label}).`, d.label, n.type);
        }
      });

      if (d.reservoirElevation === undefined || d.reservoirElevation === '') {
        addError(n.id, `Reservoir ${d.label} missing elevation value.`, d.label, n.type);
      }
    }

    if (n.type === 'surgeTank') {
      if (connections.length !== 1) {
        addError(n.id, `Surge Tank ${d.label} must connect to exactly one node.`, d.label, n.type);
      }
      if (d.tankTop === undefined || d.tankBottom === undefined || d.tankTop === '' || d.tankBottom === '') {
        addError(n.id, `Surge Tank ${d.label} missing required elevation parameters.`, d.label, n.type);
      } else if (Number(d.tankTop) <= Number(d.tankBottom)) {
        addError(n.id, `Surge Tank ${d.label} Top Elevation must be greater than Bottom Elevation.`, d.label, n.type);
      }
      if (!d.hasShape && (d.diameter === undefined || d.diameter === '')) {
        addError(n.id, `Surge Tank ${d.label} missing Diameter.`, d.label, n.type);
      }
      if (d.celerity === undefined || d.celerity === '') addError(n.id, `Surge Tank ${d.label} missing Celerity.`, d.label, n.type);
      if (d.friction === undefined || d.friction === '') addError(n.id, `Surge Tank ${d.label} missing Friction.`, d.label, n.type);
    }

    if (n.type === 'flowBoundary') {
      if (connections.length !== 1) {
        addError(n.id, `Flow Boundary ${d.label} must connect to exactly one node.`, d.label, n.type);
      }
      if (d.scheduleNumber === undefined) {
        addError(n.id, `Flow Boundary ${d.label} missing Q-Schedule.`, d.label, n.type);
      }
    }

    if (n.type === 'node' || n.type === 'junction') {
      const isBoundary = nodes.some(other => 
        (other.type === 'reservoir' || other.type === 'flowBoundary') && 
        adjacency.get(other.id)?.includes(n.id)
      );

      // Dead end detection: 
      // A node/junction is a dead end if it has only 1 connection and it's not connected to a boundary.
      // Boundaries (Reservoir, Flow Boundary) are allowed to have 1 connection.
      if (connections.length === 1 && !isBoundary) {
        addError(n.id, `Dead end detected: ${n.type} ${d.label} has no continuation or boundary condition.`, d.label, n.type);
      } else if (connections.length < 2 && !isBoundary) {
        addWarning(n.id, `Node ${d.label} has fewer than 2 connections and is not a boundary.`, d.label, n.type);
      }
    }
  });

  edges.forEach(e => {
    const d = e.data;
    if (d?.type === 'conduit') {
      if (d.length === undefined || d.length === '') addError(e.id, `Conduit ${d.label} missing required parameter: Length`, d.label, d.type);
      if (!d.variable && (d.diameter === undefined || d.diameter === '')) addError(e.id, `Conduit ${d.label} missing required parameter: Diameter`, d.label, d.type);
      if (d.celerity === undefined || d.celerity === '') addError(e.id, `Conduit ${d.label} missing required parameter: Celerity`, d.label, d.type);
      if (d.friction === undefined || d.friction === '') addError(e.id, `Conduit ${d.label} missing required parameter: Friction`, d.label, d.type);

      if (Number(d.length) < 1) addWarning(e.id, `Pipe ${d.label} has very short length detected.`, d.label, d.type);
      if (Number(d.friction) > 0.1) addWarning(e.id, `Pipe ${d.label} friction value unusually high.`, d.label, d.type);
    }
  });

  return { errors, warnings };
}
