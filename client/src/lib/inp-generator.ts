import { WhamoNode, WhamoEdge, useNetworkStore } from './store';
import { saveAs } from 'file-saver';

export function generateInpFile(nodes: WhamoNode[], edges: WhamoEdge[], autoDownload: boolean | string = true) {
  const state = useNetworkStore.getState();
  const globalUnit = state.globalUnit;
  const lines: string[] = [];

  const SI_TO_FPS = {
    length: 3.28084, // m to ft
    diameter: 39.3701, // m to in
    elevation: 3.28084, // m to ft
    celerity: 3.28084, // m/s to ft/s
    area: 10.7639, // m2 to ft2
    flow: 35.3147, // m3/s to ft3/s
  };

  const toFPS = (value: number | undefined, currentUnit: 'SI' | 'FPS', type: keyof typeof SI_TO_FPS): string => {
    if (value === undefined) return '';
    // If current unit is FPS, value is already in FPS
    // If current unit is SI, we convert it to FPS for the .inp file
    if (currentUnit === 'FPS') return value.toString();
    const factor = SI_TO_FPS[type] || 1;
    return (value * factor).toString();
  };

  // Helper to add line
  const add = (str: string) => lines.push(str);
  const addComment = (comment?: string) => {
    if (comment) {
      add(`c ${comment}`);
    }
  };

  const addL = (str: string) => lines.push(str);
  
  addL('c Project Name');
  addL('C  SYSTEM CONNECTIVITY');
  addL('');
  addL('SYSTEM');
  addL('');

  // Connectivity section
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  const connectivityLines: string[] = [];
  const nodeIdsWithSpecialElements = new Set<string>();

  function traverse(nodeId: string) {
    if (visitedNodes.has(nodeId)) return;
    visitedNodes.add(nodeId);

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const actualNodeId = node.data.nodeNumber?.toString() || node.id;

    // Elements AT this node
    if (node.type === 'reservoir' || node.type === 'surgeTank' || node.type === 'flowBoundary') {
      connectivityLines.push(`ELEM ${node.data.label} AT ${actualNodeId}`);
      nodeIdsWithSpecialElements.add(actualNodeId);
    }

    // Outgoing edges
    const outgoingEdges = edges.filter(e => e.source === nodeId);
    
    if (outgoingEdges.length > 0) {
      if (node.type === 'junction' || outgoingEdges.length > 1) {
        connectivityLines.push('');
        connectivityLines.push(`JUNCTION AT ${actualNodeId}`);
        connectivityLines.push('');
        nodeIdsWithSpecialElements.add(actualNodeId);
      }

      outgoingEdges.forEach(edge => {
        if (visitedEdges.has(edge.id)) return;
        visitedEdges.add(edge.id);
        
        const toNode = nodes.find(n => n.id === edge.target);
        const toId = toNode?.data.nodeNumber?.toString() || toNode?.id || edge.target;
        const fromId = actualNodeId;

        connectivityLines.push(`ELEM ${edge.data?.label || edge.id} LINK ${fromId} ${toId}`);
        traverse(edge.target);
      });
    }
  }

  // Start traversal from all nodes that have no incoming edges (potential sources)
  const sourceNodes = nodes.filter(n => !edges.some(e => e.target === n.id));
  if (sourceNodes.length > 0) {
    sourceNodes.forEach(s => traverse(s.id));
  } else if (nodes.length > 0) {
    // If it's a cycle or something weird, just start from the first node
    traverse(nodes[0].id);
  }

  // Handle any remaining unvisited nodes to ensure full connectivity is captured
  nodes.forEach(n => {
    if (!visitedNodes.has(n.id)) {
      traverse(n.id);
    }
  });

  connectivityLines.forEach(line => addL(line));

  // NODE Selection Algorithm
  const nodesToInclude = new Set<string>();

  // Parse connectivity to identify chains and transitions
  const elementLinks: { id: string, from: string, to: string, type?: string }[] = [];
  const nodeConnections: Record<string, { incoming: string[], outgoing: string[] }> = {};

  connectivityLines.forEach(line => {
    const linkMatch = line.match(/^ELEM\s+(\S+)\s+LINK\s+(\S+)\s+(\S+)/);
    if (linkMatch) {
      const elementId = linkMatch[1];
      const from = linkMatch[2];
      const to = linkMatch[3];

      elementLinks.push({ id: elementId, from, to });

      if (!nodeConnections[from]) nodeConnections[from] = { incoming: [], outgoing: [] };
      if (!nodeConnections[to]) nodeConnections[to] = { incoming: [], outgoing: [] };

      nodeConnections[from].outgoing.push(elementId);
      nodeConnections[to].incoming.push(elementId);
    }
  });

  // Keep track of branch patterns to identify parallel branches
  // A pattern is defined by the sequence of element IDs from a junction to a terminal node
  const branchPatterns = new Set<string>();

  const allNodeIds = Array.from(new Set([
    ...nodes.map(n => n.data.nodeNumber?.toString() || n.id),
    ...Array.from(nodeIdsWithSpecialElements)
  ]));

  allNodeIds.forEach(nodeId => {
    const connections = nodeConnections[nodeId] || { incoming: [], outgoing: [] };
    const hasSpecial = nodeIdsWithSpecialElements.has(nodeId);

    // RULE 1: ALWAYS INCLUDE - Nodes with Special Elements
    if (hasSpecial) {
      nodesToInclude.add(nodeId);
      return;
    }

    // RULE 2: SKIP - Intermediate Nodes in SAME element chain
    // Skip if EXACTLY one incoming and one outgoing, and they share the SAME element ID
    // Disabled: Include each and every node instead of skipping them
    /* 
    if (connections.incoming.length === 1 && connections.outgoing.length === 1 &&
        connections.incoming[0] === connections.outgoing[0]) {
      return;
    }
    */

    // Include all other nodes
    nodesToInclude.add(nodeId);
  });

  addL('');
  const sortedNodeIds = Array.from(nodesToInclude).sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });

  sortedNodeIds.forEach(id => {
    const node = nodes.find(n => (n.data.nodeNumber?.toString() || n.id) === id);
    if (node && node.data.elevation !== undefined) {
      const unit = node.data.unit || globalUnit;
      const elev = toFPS(Number(node.data.elevation), unit, 'elevation');
      addL(`NODE ${id} ELEV ${elev}`);
    }
  });

  addL('');
  addL('FINISH');
  addL('');
  addL('C ELEMENT PROPERTIES');
  addL('');

  // Properties Section
  const exportedConduitLabels = new Set<string>();
  const exportedReservoirLabels = new Set<string>();

  nodes.filter(n => n.type === 'reservoir').forEach(n => {
    const unit = n.data.unit || globalUnit;
    const label = n.data.label;
    if (exportedReservoirLabels.has(label)) return;
    exportedReservoirLabels.add(label);

    addComment(n.data.comment);
    addL('RESERVOIR');
    addL(` ID ${label}`);
    addL(` ELEV ${toFPS(Number(n.data.reservoirElevation || 0), unit, 'elevation')}`);
    addL(' FINISH');
    addL('');
  });

  edges.filter(e => e.data?.type === 'conduit').forEach(e => {
    const d = e.data;
    if (!d) return;
    
    const unit = d.unit || globalUnit;
    const label = d.label || e.id;
    if (exportedConduitLabels.has(label)) return;
    exportedConduitLabels.add(label);

    addComment(d.comment);
    addL('CONDUIT');
    addL(` ID ${label}`);
    
    if (d.variable) {
      addL(' VARIABLE');
      if (d.distance !== undefined) addL(` DISTANCE ${toFPS(Number(d.distance), unit, 'length')}`);
      if (d.area !== undefined) addL(` AREA ${toFPS(Number(d.area), unit, 'area')}`);
      if (d.d !== undefined) addL(` D ${toFPS(Number(d.d), unit, 'diameter')}`);
      if (d.a !== undefined) addL(` A ${toFPS(Number(d.a), unit, 'area')}`);
    }

    addL(` LENGTH ${toFPS(Number(d.length), unit, 'length')}`);
    if (!d.variable) {
      addL(` DIAM ${toFPS(Number(d.diameter), unit, 'diameter')}`);
    }
    addL(` CELERITY ${toFPS(Number(d.celerity), unit, 'celerity')}`);
    addL(` FRICTION ${d.friction}`);
    
    if (d.hasAddedLoss) {
      addL(' ADDEDLOSS');
      addL(`     CPLUS ${d.cplus || 0}`);
      addL(`     CMINUS ${d.cminus || 0}`);
    }
    
    if (d.numSegments !== undefined && d.includeNumSegments !== false) {
      addL(` NUMSEG ${d.numSegments}`);
    }
    addL('FINISH');
    addL('');
  });

  edges.filter(e => e.data?.type === 'dummy').forEach(e => {
    const d = e.data;
    if (!d) return;
    const unit = d.unit || globalUnit;
    addComment(d.comment);
    
    const diamValue = parseFloat(String(d.diameter));
    const hasValidDiameter = d.diameter !== undefined && d.diameter !== null && d.diameter !== '' && !isNaN(diamValue) && diamValue !== 0;

    if (!hasValidDiameter) {
      addL(`CONDUIT ID ${d.label || e.id} DUMMY`);
    } else {
      addL(`CONDUIT ID ${d.label || e.id} `);
      addL(' DUMMY ');
      addL(` DIAMETER ${toFPS(Number(d.diameter), unit, 'diameter')}`);
    }

    if (d.hasAddedLoss) {
      addL(' ADDEDLOSS ');
      addL(` CPLUS ${d.cplus || 0}`);
      addL(` CMINUS ${d.cminus || 0}`);
    }
    addL('FINISH');
    addL('');
  });

  const exportedSurgeTankLabels = new Set<string>();
  nodes.filter(n => n.type === 'surgeTank' || n.data?.type_st).forEach(n => {
    const d = n.data;
    if (!d) return;
    const label = d.label;
    if (exportedSurgeTankLabels.has(label)) return;
    exportedSurgeTankLabels.add(label);

    const unit = d.unit || globalUnit;
    addComment(d.comment);
    addL('SURGETANK');
    addL(` ID ${label} ${d.type_st || 'SIMPLE'}`);
    addL(` ELTOP ${toFPS(Number(d.tankTop), unit, 'elevation')}`);
    addL(` ELBOTTOM ${toFPS(Number(d.tankBottom), unit, 'elevation')}`);

    if (d.type_st === 'AIRTANK' || d.type_st === 'DIFFERENTIAL') {
      if (d.initialWaterLevel !== undefined) {
        addL(` HTANK ${toFPS(Number(d.initialWaterLevel), unit, 'elevation')}`);
      }
    }

    if (d.type_st === 'DIFFERENTIAL') {
      if (d.riserDiameter !== undefined) {
        addL(` RISERDIAM ${toFPS(Number(d.riserDiameter), unit, 'diameter')}`);
      }
      if (d.riserTop !== undefined) {
        addL(` RISERTOP ${toFPS(Number(d.riserTop), unit, 'elevation')}`);
      }
    }
    
    if (d.hasShape && d.shape && Array.isArray(d.shape) && d.shape.length > 0) {
      addL(' SHAPE');
      d.shape.forEach((pair: any) => {
        addL(`   E  ${toFPS(Number(pair.e), unit, 'elevation')}`);
        addL(`   A  ${toFPS(Number(pair.a), unit, 'area')}`);
      });
    } else if (d.diameter !== undefined) {
      addL(` DIAM ${toFPS(Number(d.diameter), unit, 'diameter')}`);
    }

    addL(` CELERITY ${toFPS(Number(d.celerity), unit, 'celerity')}`);
    addL(` FRICTION ${d.friction}`);

    if (d.hasAddedLoss) {
      addL(' ADDEDLOSS');
      addL(`     CPLUS ${d.cplus || 0}`);
      addL(`     CMINUS ${d.cminus || 0}`);
    }

    addL('FINISH');
    addL('');
  });

  nodes.filter(n => n.type === 'flowBoundary').forEach(n => {
    const d = n.data;
    if (!d) return;
    addComment(d.comment);
    addL(`FLOWBC ID ${d.label} QSCHEDULE ${d.scheduleNumber} FINISH`);
  });

  addL('');
  addL('');
  addL('SCHEDULE');
  
  const flowBoundaries = nodes.filter(n => n.type === 'flowBoundary');
  flowBoundaries.forEach(n => {
    const d = n.data;
    const unit = d.unit || globalUnit;
    let schedule = '';
    if (d.schedulePoints && Array.isArray(d.schedulePoints) && d.schedulePoints.length > 0) {
      schedule = d.schedulePoints.map((p: any) => `T ${p.time} Q ${toFPS(Number(p.flow), unit, 'flow')}`).join(' ');
    } else {
      schedule = 'T 0 Q 3000 T 20 Q 0 T 3000 Q 0';
    }
    addL(` QSCHEDULE ${d.scheduleNumber} ${schedule}`);
  });
  
  addL('');
  addL('FINISH');
  addL('');
  addL('');
  addL('C OUTPUT REQUEST');
  addL('');

  const requestsByType = state.outputRequests.reduce((acc, req) => {
    if (!acc[req.requestType]) acc[req.requestType] = [];
    acc[req.requestType].push(req);
    return acc;
  }, {} as Record<string, typeof state.outputRequests>);

  const requestTypes = Object.keys(requestsByType);

  if (requestTypes.length > 0) {
    requestTypes.forEach(type => {
      addL(type);
      requestsByType[type].forEach(req => {
        const element = req.elementType === 'node' 
          ? nodes.find(n => n.id === req.elementId)
          : edges.find(e => e.id === req.elementId);
        
        const isSurgeTank = req.elementType === 'node' && element?.data?.type === 'surgeTank';
        const label = isSurgeTank 
          ? (element?.data?.label || element?.id || req.elementId)
          : (element?.data?.nodeNumber || element?.data?.label || element?.id || req.elementId);
        const typeStr = isSurgeTank ? 'ELEM' : 'NODE';
        addL(` ${typeStr} ${label} ${req.variables.join(' ')}`);
      });
      addL(' FINISH');
      addL('');
    });

    if (requestTypes.length > 1) {
      addL(' DISPLAY');
      addL('  ALL');
      addL(' FINISH');
      addL('');
    }
  } else {
    addL('HISTORY');
    addL(' NODE 2 Q HEAD');
    addL(' ELEM ST Q ELEV');
    addL(' FINISH');
  }
  addL('');
  addL('');
  addL('C COMPUTATIONAL PARAMETERS');
  addL('CONTROL');
  const cp = state.computationalParams;
  cp.stages.forEach(stage => {
    addL(` DTCOMP ${stage.dtcomp} DTOUT ${stage.dtout} TMAX ${stage.tmax}`);
  });
  if (cp.includeAccutest !== false && cp.accutest && cp.accutest !== 'NONE') {
    addL(` ACCUTEST ${cp.accutest}`);
  }
  addL('FINISH');
  addL('');
  addL('C EXECUTION CONTROL');
  addL('GO');
  addL('GOODBYE');

  if (autoDownload) {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    // If autoDownload is a boolean true, we don't trigger download here
    // as it's handled by the caller with potentially more files.
    // If it's a string, it's the filename.
    if (typeof autoDownload === 'string') {
      saveAs(blob, `${autoDownload}.inp`);
    }
  }
  return lines.join('\n');
}
