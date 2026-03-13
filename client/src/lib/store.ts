import { create } from 'zustand';
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import { NodeType, LinkType } from '@shared/schema';

export type UnitSystem = 'SI' | 'FPS';

// Define base data structures for our specific engineering domain
interface UnitCache {
  FPS?: Record<string, any>;
  SI?: Record<string, any>;
}

interface NodeData extends Record<string, unknown> {
  label: string;
  type: NodeType;
  unit?: UnitSystem;
  elevation?: number | string;
  reservoirElevation?: number | string;
  nodeNumber?: number;
  comment?: string;
  // Specific properties
  topElevation?: number | string;
  bottomElevation?: number | string;
  diameter?: number | string;
  celerity?: number | string;
  friction?: number | string;
  scheduleNumber?: number;
  schedulePoints?: { time: number; flow: number | string }[];
  tankTop?: number | string;
  tankBottom?: number | string;
  shape?: { e: number | string; a: number | string }[];
  mode?: 'fixed' | 'schedule';
  hScheduleNumber?: number;
  _unitCache?: UnitCache;
}

interface EdgeData extends Record<string, unknown> {
  label: string;
  type: LinkType;
  unit?: UnitSystem;
  length?: number | string;
  diameter?: number | string;
  celerity?: number | string;
  friction?: number | string;
  numSegments?: number;
  cplus?: number | string;
  cminus?: number | string;
  hasAddedLoss?: boolean;
  comment?: string;
  variable?: boolean;
  distance?: number | string;
  area?: number | string;
  d?: number | string;
  a?: number | string;
  _unitCache?: UnitCache;
}

export type WhamoNode = Node<NodeData>;
export type WhamoEdge = Edge<EdgeData>;

export interface TimeStage {
  dtcomp: number;
  dtout: number;
  tmax: number;
}

export interface ComputationalParameters {
  stages: TimeStage[];
  accutest: 'FULL' | 'PARTIAL' | 'NONE';
  includeAccutest?: boolean;
}

interface OutputRequest {
  id: string; // Internal ID for the request
  elementId: string; // ID of the node or edge
  elementType: 'node' | 'edge';
  isElement?: boolean; // For nodes, distinguish between Node and Element (e.g. Surge Tank)
  requestType: 'HISTORY' | 'PLOT' | 'SPREADSHEET';
  variables: string[]; // e.g., ['Q', 'HEAD', 'ELEV']
}

interface NetworkState {
  nodes: WhamoNode[];
  edges: WhamoEdge[];
  hSchedules: { number: number; points: { time: number; head: number | string }[] }[];
  selectedElementId: string | null;
  selectedElementType: 'node' | 'edge' | null;
  computationalParams: ComputationalParameters;
  outputRequests: OutputRequest[];
  isLocked: boolean;
  projectName: string;
  projectNameError: string | null;
  loadedFileHandle: FileSystemFileHandle | null;
  globalUnit: UnitSystem;
  nodeSelectionSet: Set<string>;
  history: {
    past: Partial<NetworkState>[];
    future: Partial<NetworkState>[];
  };

  // Actions
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: NodeType, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  updateEdgeData: (id: string, data: Partial<EdgeData>) => void;
  deleteElement: (id: string, type: 'node' | 'edge') => void;
  selectElement: (id: string | null, type: 'node' | 'edge' | null) => void;
  loadNetwork: (nodes: WhamoNode[], edges: WhamoEdge[], params?: ComputationalParameters, requests?: OutputRequest[], projectName?: string, fileHandle?: FileSystemFileHandle) => void;
  clearNetwork: () => void;
  autoSelectOutputRequests: () => void;
  updateComputationalParams: (params: Partial<ComputationalParameters>) => void;
  addOutputRequest: (request: Omit<OutputRequest, 'id'>) => void;
  removeOutputRequest: (id: string) => void;
  toggleLock: () => void;
  setProjectName: (name: string) => void;
  setProjectNameError: (error: string | null) => void;
  setLoadedFileHandle: (handle: FileSystemFileHandle | null) => void;
  setGlobalUnit: (unit: UnitSystem) => void;
  updateHSchedule: (number: number, points: { time: number; head: number | string }[]) => void;
  addHSchedule: (number: number) => void;
  toggleNodeSelection: (nodeId: string) => void;
  setAllNodesSelected: (selected: boolean) => void;
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
}

let idCounter = 1;
const getId = () => `${idCounter++}`;

export const useNetworkStore = create<NetworkState>((set, get) => ({
  nodes: [],
  edges: [],
  hSchedules: [],
  selectedElementId: null,
  selectedElementType: null,
  computationalParams: {
    stages: [{
      dtcomp: 0.01,
      dtout: 0.1,
      tmax: 500.0,
    }],
    accutest: 'NONE',
    includeAccutest: true,
  },
  outputRequests: [],
  isLocked: false,
  projectName: "Untitled Network",
  projectNameError: null,
  loadedFileHandle: null,
  globalUnit: 'FPS',
  nodeSelectionSet: new Set(),
  history: {
    past: [],
    future: [],
  },

  setGlobalUnit: (unit: UnitSystem) => {
    get().saveToHistory();
    const state = get();
    const oldUnit = state.globalUnit;
    
    if (oldUnit === unit) return;

    const SI_TO_FPS = {
      length: 3.28084,
      diameter: 3.28084,
      elevation: 3.28084,
      celerity: 3.28084,
      area: 10.7639,
      flow: 35.3147,
    };

    const convertValue = (value: number | string, from: UnitSystem, to: UnitSystem, type: keyof typeof SI_TO_FPS) => {
      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(numValue)) return value;
      if (from === to) return numValue;
      const factor = SI_TO_FPS[type] || 1;
      const result = to === 'FPS' ? numValue * factor : numValue / factor;
      return parseFloat(result.toFixed(8));
    };

    const fieldMapping: Record<string, keyof typeof SI_TO_FPS> = {
      length: 'length',
      diameter: 'diameter',
      elevation: 'elevation',
      reservoirElevation: 'elevation',
      tankTop: 'elevation',
      tankBottom: 'elevation',
      topElevation: 'elevation',
      bottomElevation: 'elevation',
      distance: 'length',
      celerity: 'celerity',
      area: 'area',
      initialWaterLevel: 'elevation',
      riserDiameter: 'diameter',
      riserTop: 'elevation'
    };

    const cacheableFields = Object.keys(fieldMapping);

    // Convert all nodes
    const newNodes = state.nodes.map(node => {
      const dataUpdate: any = {};
      const nodeUnit = node.data?.unit || oldUnit;
      if (nodeUnit === unit) {
        if (node.data?.unit) dataUpdate.unit = undefined;
        return Object.keys(dataUpdate).length > 0
          ? { ...node, data: { ...node.data, ...dataUpdate } }
          : node;
      }

      // Save current values into cache for oldUnit
      const existingCache: UnitCache = (node.data?._unitCache as UnitCache) || {};
      const savedForOldUnit: Record<string, any> = {};
      cacheableFields.forEach(key => {
        const val = (node.data as any)?.[key];
        if (val !== undefined && val !== null && val !== '') {
          savedForOldUnit[key] = val;
        }
      });
      if (node.data?.schedulePoints) {
        savedForOldUnit.schedulePoints = JSON.parse(JSON.stringify(node.data.schedulePoints));
      }
      const newCache: UnitCache = {
        ...existingCache,
        [nodeUnit]: { ...(existingCache[nodeUnit] || {}), ...savedForOldUnit },
      };

      // For each convertible field: use cached value if defined, otherwise math-convert.
      const cachedTarget: Record<string, any> = newCache[unit] || {};
      Object.entries(node.data || {}).forEach(([key, value]) => {
        if (!fieldMapping[key]) return;
        const cachedVal = cachedTarget[key];
        if (cachedVal !== undefined) {
          dataUpdate[key] = cachedVal;
        } else if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value)))) {
          dataUpdate[key] = convertValue(value as any, nodeUnit, unit, fieldMapping[key]);
        }
      });

      // Handle schedulePoints
      if (node.data?.schedulePoints) {
        if (cachedTarget.schedulePoints) {
          dataUpdate.schedulePoints = cachedTarget.schedulePoints;
        } else {
          dataUpdate.schedulePoints = (node.data.schedulePoints as any[]).map(p => ({
            ...p,
            flow: convertValue(p.flow, nodeUnit, unit, 'flow')
          }));
        }
      }

      if (node.data?.unit) dataUpdate.unit = undefined;
      dataUpdate._unitCache = newCache;

      return { ...node, data: { ...node.data, ...dataUpdate } };
    });

    // Convert all edges
    const newEdges = state.edges.map(edge => {
      const dataUpdate: any = {};
      const edgeUnit = edge.data?.unit || oldUnit;
      if (edgeUnit === unit) {
        if (edge.data?.unit) dataUpdate.unit = undefined;
        return Object.keys(dataUpdate).length > 0
          ? { ...edge, data: { ...edge.data, ...dataUpdate } }
          : edge;
      }

      // Save current values into cache for oldUnit
      const existingCache: UnitCache = (edge.data?._unitCache as UnitCache) || {};
      const savedForOldUnit: Record<string, any> = {};
      cacheableFields.forEach(key => {
        const val = (edge.data as any)?.[key];
        if (val !== undefined && val !== null && val !== '') {
          savedForOldUnit[key] = val;
        }
      });
      const newCache: UnitCache = {
        ...existingCache,
        [edgeUnit]: { ...(existingCache[edgeUnit] || {}), ...savedForOldUnit },
      };

      // For each convertible field: use cached value if defined, otherwise math-convert.
      const cachedTarget: Record<string, any> = newCache[unit] || {};
      Object.entries(edge.data || {}).forEach(([key, value]) => {
        if (!fieldMapping[key]) return;
        const cachedVal = cachedTarget[key];
        if (cachedVal !== undefined) {
          dataUpdate[key] = cachedVal;
        } else if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value)))) {
          dataUpdate[key] = convertValue(value as any, edgeUnit, unit, fieldMapping[key]);
        }
      });

      if (edge.data?.unit) dataUpdate.unit = undefined;
      dataUpdate._unitCache = newCache;

      return { ...edge, data: { ...edge.data, ...dataUpdate } };
    });

    set({ 
      globalUnit: unit,
      nodes: newNodes as WhamoNode[],
      edges: newEdges as WhamoEdge[]
    });
  },

  onNodesChange: (changes: NodeChange[]) => {
    // Only save to history for non-position changes (like deletions or specific types of updates)
    // To avoid bloating history with every drag movement
    const hasSignificantChange = changes.some(c => c.type === 'remove' || c.type === 'add');
    if (hasSignificantChange) get().saveToHistory();

    set({
      nodes: applyNodeChanges(changes, get().nodes as any) as WhamoNode[],
    });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    const hasSignificantChange = changes.some(c => c.type === 'remove' || c.type === 'add');
    if (hasSignificantChange) get().saveToHistory();

    const updatedEdges = applyEdgeChanges(changes, get().edges as any) as WhamoEdge[];
    set({ edges: updatedEdges });

    // Auto-downgrade junctions back to plain nodes when they drop to ≤2 connections
    if (changes.some(c => c.type === 'remove')) {
      const currentNodes = get().nodes;
      const nodeIdsToDowngrade: string[] = [];

      for (const n of currentNodes) {
        if (n.type !== 'junction') continue;
        const degree = updatedEdges.filter(
          e => e.source === n.id || e.target === n.id
        ).length;
        if (degree <= 2) nodeIdsToDowngrade.push(n.id);
      }

      if (nodeIdsToDowngrade.length > 0) {
        set({
          nodes: currentNodes.map(n =>
            nodeIdsToDowngrade.includes(n.id)
              ? {
                  ...n,
                  type: 'node' as NodeType,
                  data: { ...n.data, type: 'node' as NodeType },
                }
              : n
          ),
        });
      }
    }
  },

  onConnect: (connection: Connection) => {
    get().saveToHistory();
    const id = getId();
    const edges = get().edges;
    const conduitCount = edges.filter(e => e.data?.type === 'conduit').length;
    const connectionLabel = `C${conduitCount + 1}`;

    set({
      edges: addEdge(
        {
          ...connection,
          id,
          type: 'connection',
          style: { stroke: '#3b82f6', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#3b82f6',
          },
          data: { 
            label: connectionLabel, 
            type: 'conduit', 
            length: 1000, 
            diameter: 0.5, 
            celerity: 1000, 
            friction: 0.02, 
            numSegments: 1 
          }
        },
        get().edges
      ),
    });

    // Auto-upgrade plain nodes to junctions when they gain more than 2 connections
    {
      const currentEdges = get().edges;
      const currentNodes = get().nodes;
      const nodeIdsToUpgrade: string[] = [];

      for (const n of currentNodes) {
        if (n.type !== 'node') continue;
        const degree = currentEdges.filter(
          e => e.source === n.id || e.target === n.id
        ).length;
        if (degree > 2) nodeIdsToUpgrade.push(n.id);
      }

      if (nodeIdsToUpgrade.length > 0) {
        set({
          nodes: currentNodes.map(n =>
            nodeIdsToUpgrade.includes(n.id)
              ? {
                  ...n,
                  type: 'junction' as NodeType,
                  data: { ...n.data, type: 'junction' as NodeType },
                }
              : n
          ),
        });
      }
    }

    // Auto-select output requests for the new edge
    const availableVars = ["Q", "HEAD", "ELEV", "VEL", "PRESS", "PIEZHEAD"];
    const requestTypes: ("HISTORY" | "PLOT" | "SPREADSHEET")[] = ["HISTORY", "PLOT", "SPREADSHEET"];
    const newRequests: OutputRequest[] = requestTypes.map(reqType => ({
      id: `req-${Date.now()}-${Math.random()}`,
      elementId: id,
      elementType: 'edge',
      requestType: reqType,
      variables: [...availableVars]
    }));
    
    set({ outputRequests: [...get().outputRequests, ...newRequests] });
  },

  addNode: (type, position) => {
    get().saveToHistory();
    const id = getId();
    let initialData: NodeData = { label: '', type };

    // Compute nodeNumber independently from the internal id so it stays sequential
    // regardless of how many edges or other elements have been created.
    const nodeNumber = get().nodes.filter(n => n.data?.nodeNumber !== undefined).length + 1;

    switch (type) {
      case 'reservoir':
        initialData = { ...initialData, label: 'HW', nodeNumber, elevation: 100, reservoirElevation: 100 };
        break;
      case 'node':
        initialData = { ...initialData, label: `Node ${nodeNumber}`, nodeNumber, elevation: 50 };
        break;
      case 'junction':
        initialData = { ...initialData, label: `Node ${nodeNumber}`, nodeNumber, elevation: 50 };
        break;
      case 'surgeTank':
        initialData = { ...initialData, label: 'ST', nodeNumber, topElevation: 120, bottomElevation: 80, diameter: 5, celerity: 1000, friction: 0.01 };
        break;
      case 'flowBoundary':
        initialData = { ...initialData, label: `FB${id}`, nodeNumber, scheduleNumber: 1 };
        break;
    }

    const newNode: WhamoNode = {
      id,
      type,
      position,
      data: initialData,
    };

    set({ nodes: [...get().nodes, newNode] });
    
    // Auto-select output requests for the new node
    const availableVars = ["Q", "HEAD", "ELEV", "VEL", "PRESS", "PIEZHEAD"];
    const requestTypes: ("HISTORY" | "PLOT" | "SPREADSHEET")[] = ["HISTORY", "PLOT", "SPREADSHEET"];
    const newRequests: OutputRequest[] = [];
    
    requestTypes.forEach(reqType => {
      // Add Node request
      newRequests.push({
        id: `req-${Date.now()}-${Math.random()}`,
        elementId: id,
        elementType: 'node',
        isElement: false,
        requestType: reqType,
        variables: [...availableVars]
      });

      // If it's a surge tank, also add the Element request
      if (type === 'surgeTank') {
        newRequests.push({
          id: `req-${Date.now()}-${Math.random()}`,
          elementId: id,
          elementType: 'node',
          isElement: true,
          requestType: reqType,
          variables: [...availableVars]
        });
      }
    });
    
    set({ outputRequests: [...get().outputRequests, ...newRequests] });
  },

  updateNodeData: (id, data) => {
    get().saveToHistory();
    set({
      nodes: get().nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } as WhamoNode : node
      ),
    });
  },

  updateEdgeData: (id, data) => {
    get().saveToHistory();
    set({
      edges: get().edges.map((edge) => {
        if (edge.id === id) {
          const oldType = edge.data?.type;
          const newType = data.type || oldType;
          let label = data.label || edge.data?.label || "";

          // If type changed, recalculate label
          if (data.type && data.type !== oldType) {
            const sameTypeEdges = get().edges.filter(e => e.data?.type === data.type && e.id !== id);
            const prefix = data.type === 'conduit' ? 'C' : 'D';
            label = `${prefix}${sameTypeEdges.length + 1}`;
          }

          const newData = { ...edge.data, ...data, label };
          let style = edge.style;
          let markerEnd = edge.markerEnd;

          if (newType === 'conduit') {
            style = { stroke: '#3b82f6', strokeWidth: 2 };
            markerEnd = { type: MarkerType.ArrowClosed, color: '#3b82f6' };
          } else if (newType === 'dummy') {
            style = { stroke: '#94a3b8', strokeWidth: 2, strokeDasharray: '5,5' };
            markerEnd = { type: MarkerType.ArrowClosed, color: '#94a3b8' };
          }

          return { 
            ...edge, 
            data: newData as EdgeData,
            style,
            markerEnd: markerEnd as any
          };
        }
        return edge;
      }),
    });
  },

  deleteElement: (id, type) => {
    get().saveToHistory();
    const state = get();
    if (type === 'node') {
      const remainingNodes = state.nodes.filter(n => n.id !== id);
      const remainingEdges = state.edges.filter(e => e.source !== id && e.target !== id);
      
      set({ 
        nodes: remainingNodes, 
        edges: remainingEdges,
        selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
        selectedElementType: state.selectedElementId === id ? null : state.selectedElementType
      });
    } else {
      set({ 
        edges: state.edges.filter(e => e.id !== id),
        selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
        selectedElementType: state.selectedElementId === id ? null : state.selectedElementType
      });
    }
  },

  selectElement: (id, type) => {
    set({ selectedElementId: id, selectedElementType: type });
  },

  loadNetwork: (nodes, edges, params, requests, projectName, fileHandle) => {
    const maxId = Math.max(
      ...nodes.map(n => parseInt(n.id) || 0),
      ...edges.map(e => parseInt(e.id) || 0),
      0
    );
    idCounter = maxId + 1;
    
    // Flatten variableData for conduits if it exists
    const processedEdges = edges.map(edge => {
      if (edge.data?.variableData) {
        const { variableData, ...restData } = edge.data;
        return {
          ...edge,
          data: {
            ...restData,
            ...variableData,
            variable: true // Ensure variable flag is set
          }
        };
      }
      return edge;
    });
    
    // Convert all nodes
    const processedNodes = nodes.map(node => {
      // If the node is a reservoir and has schedulePoints in its data,
      // but they aren't in the global hSchedules yet, we should extract them.
      if (node.type === 'reservoir' && node.data?.mode === 'schedule' && node.data?.schedulePoints) {
        const schedNum = node.data.hScheduleNumber || 1;
        const points = node.data.schedulePoints as { time: number; head: number | string }[];
        
        // We'll update hSchedules later in the set() call, 
        // but for now we just ensure the node data is consistent.
      }
      return node;
    });

    // Extract hSchedules from nodes if they exist there (legacy or specific export format)
    const extractedHSchedules = [...((params as any)?.hSchedules || (params as any)?.content?.hSchedules || (params as any)?.content?.params?.hSchedules || [])];
    
    nodes.forEach(node => {
      if (node.type === 'reservoir' && node.data?.mode === 'schedule' && node.data?.schedulePoints) {
        const num = node.data.hScheduleNumber || 1;
        if (!extractedHSchedules.find(s => s.number === num)) {
          extractedHSchedules.push({
            number: num,
            points: node.data.schedulePoints
          });
        }
      }
    });
    
    set({ 
      nodes: processedNodes, 
      edges: processedEdges, 
      hSchedules: extractedHSchedules,
      computationalParams: params || get().computationalParams,
      outputRequests: requests || [],
      projectName: projectName || get().projectName,
      loadedFileHandle: fileHandle || null,
      selectedElementId: null, 
      selectedElementType: null 
    });

    if (!requests || requests.length === 0) {
      get().autoSelectOutputRequests();
    }
  },

  clearNetwork: () => {
    get().saveToHistory();
    set({ 
      nodes: [], 
      edges: [], 
      hSchedules: [],
      selectedElementId: null, 
      selectedElementType: null, 
      outputRequests: [],
      projectName: "Untitled Network",
      loadedFileHandle: null
    });
    idCounter = 1;
    get().autoSelectOutputRequests();
  },

  autoSelectOutputRequests: () => {
    const { nodes, edges } = get();
    const availableVars = ["Q", "HEAD", "ELEV", "VEL", "PRESS", "PIEZHEAD"];
    const requestTypes: ("HISTORY" | "PLOT" | "SPREADSHEET")[] = ["HISTORY", "PLOT", "SPREADSHEET"];
    
    const newRequests: OutputRequest[] = [];
    
    nodes.forEach(node => {
      requestTypes.forEach(reqType => {
        newRequests.push({
          id: `req-${Date.now()}-${Math.random()}`,
          elementId: node.id,
          elementType: 'node',
          requestType: reqType,
          variables: [...availableVars]
        });
      });
    });

    edges.forEach(edge => {
      requestTypes.forEach(reqType => {
        newRequests.push({
          id: `req-${Date.now()}-${Math.random()}`,
          elementId: edge.id,
          elementType: 'edge',
          requestType: reqType,
          variables: [...availableVars]
        });
      });
    });

    set({ outputRequests: newRequests });
  },

  updateComputationalParams: (params) => {
    get().saveToHistory();
    set({ computationalParams: { ...get().computationalParams, ...params } });
  },

  updateHSchedule: (number, points) => {
    get().saveToHistory();
    const { hSchedules } = get();
    const existingIndex = hSchedules.findIndex(s => s.number === number);
    if (existingIndex >= 0) {
      const newSchedules = [...hSchedules];
      newSchedules[existingIndex] = { number, points };
      set({ hSchedules: newSchedules });
    } else {
      set({ hSchedules: [...hSchedules, { number, points }] });
    }
  },

  addHSchedule: (number) => {
    get().saveToHistory();
    const { hSchedules } = get();
    if (!hSchedules.find(s => s.number === number)) {
      set({ hSchedules: [...hSchedules, { number, points: [] }] });
    }
  },

  toggleNodeSelection: (nodeId: string) => {
    const newSet = new Set(get().nodeSelectionSet);
    if (newSet.has(nodeId)) {
      newSet.delete(nodeId);
    } else {
      newSet.add(nodeId);
    }
    set({ nodeSelectionSet: newSet });
  },

  setAllNodesSelected: (selected: boolean) => {
    if (selected) {
      const nodeIds = new Set(get().nodes.map(n => (n.data.nodeNumber?.toString() || n.id)));
      set({ nodeSelectionSet: nodeIds });
    } else {
      set({ nodeSelectionSet: new Set() });
    }
  },

  addOutputRequest: (request) => {
    get().saveToHistory();
    const id = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    set({ outputRequests: [...get().outputRequests, { ...request, id }] });
  },

  removeOutputRequest: (id) => {
    get().saveToHistory();
    set({ outputRequests: get().outputRequests.filter(r => r.id !== id) });
  },

  toggleLock: () => {
    set({ isLocked: !get().isLocked });
  },

  setProjectName: (name: string) => {
    set({ projectName: name, projectNameError: name.trim() === "" ? "Please enter a file name" : null });
  },

  setProjectNameError: (error: string | null) => {
    set({ projectNameError: error });
  },

  setLoadedFileHandle: (handle: FileSystemFileHandle | null) => {
    set({ loadedFileHandle: handle });
  },

  saveToHistory: () => {
    const { nodes, edges, hSchedules, computationalParams, outputRequests, history } = get();
    const currentState = JSON.parse(JSON.stringify({ nodes, edges, hSchedules, computationalParams, outputRequests }));
    set({
      history: {
        past: [currentState, ...history.past].slice(0, 50),
        future: [],
      },
    });
  },

  undo: () => {
    const { nodes, edges, computationalParams, outputRequests, history } = get();
    if (history.past.length === 0) return;

    const previous = history.past[0];
    const newPast = history.past.slice(1);
    const currentState = { nodes, edges, computationalParams, outputRequests };

    set({
      ...previous,
      history: {
        past: newPast,
        future: [currentState, ...history.future],
      },
    });
  },

  redo: () => {
    const { nodes, edges, computationalParams, outputRequests, history } = get();
    if (history.future.length === 0) return;

    const next = history.future[0];
    const newFuture = history.future.slice(1);
    const currentState = { nodes, edges, computationalParams, outputRequests };

    set({
      ...next,
      history: {
        past: [currentState, ...history.past],
        future: newFuture,
      },
    });
  },
}));
