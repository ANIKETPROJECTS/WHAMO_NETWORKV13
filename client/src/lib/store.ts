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
interface NodeData extends Record<string, unknown> {
  label: string;
  type: NodeType;
  unit?: UnitSystem;
  elevation?: number;
  reservoirElevation?: number;
  nodeNumber?: number;
  comment?: string;
  // Specific properties
  topElevation?: number;
  bottomElevation?: number;
  diameter?: number;
  celerity?: number;
  friction?: number;
  scheduleNumber?: number;
  schedulePoints?: { time: number; flow: number }[];
  tankTop?: number;
  tankBottom?: number;
  shape?: { e: number; a: number }[];
}

interface EdgeData extends Record<string, unknown> {
  label: string;
  type: LinkType;
  unit?: UnitSystem;
  length?: number;
  diameter?: number;
  celerity?: number;
  friction?: number;
  numSegments?: number;
  cplus?: number;
  cminus?: number;
  hasAddedLoss?: boolean;
  comment?: string;
  variable?: boolean;
  distance?: number;
  area?: number;
  d?: number;
  a?: number;
}

export type WhamoNode = Node<NodeData>;
export type WhamoEdge = Edge<EdgeData>;

interface ComputationalParameters {
  dtcomp: number;
  dtout: number;
  tmax: number;
}

interface OutputRequest {
  id: string; // Internal ID for the request
  elementId: string; // ID of the node or edge
  elementType: 'node' | 'edge';
  requestType: 'HISTORY' | 'PLOT' | 'SPREADSHEET';
  variables: string[]; // e.g., ['Q', 'HEAD', 'ELEV']
}

interface NetworkState {
  nodes: WhamoNode[];
  edges: WhamoEdge[];
  selectedElementId: string | null;
  selectedElementType: 'node' | 'edge' | null;
  computationalParams: ComputationalParameters;
  outputRequests: OutputRequest[];
  isLocked: boolean;
  projectName: string;
  projectNameError: string | null;
  loadedFileHandle: FileSystemFileHandle | null;
  globalUnit: UnitSystem;
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
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
}

let idCounter = 1;
const getId = () => `${idCounter++}`;

export const useNetworkStore = create<NetworkState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedElementId: null,
  selectedElementType: null,
  computationalParams: {
    dtcomp: 0.01,
    dtout: 0.1,
    tmax: 500.0,
  },
  outputRequests: [],
  isLocked: false,
  projectName: "Untitled Network",
  projectNameError: null,
  loadedFileHandle: null,
  globalUnit: 'FPS',
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

    const convertValue = (value: number, from: UnitSystem, to: UnitSystem, type: keyof typeof SI_TO_FPS) => {
      if (from === to) return value;
      const factor = SI_TO_FPS[type] || 1;
      return to === 'FPS' ? value * factor : value / factor;
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
      area: 'area'
    };

    // Convert all nodes
    const newNodes = state.nodes.map(node => {
      if (node.data?.unit) return node; // Skip elements with local override

      const dataUpdate: any = {};
      Object.entries(node.data || {}).forEach(([key, value]) => {
        if (typeof value === 'number' && fieldMapping[key]) {
          dataUpdate[key] = Number(convertValue(value, oldUnit, unit, fieldMapping[key]).toFixed(4));
        }
      });

      if (node.data?.schedulePoints) {
        dataUpdate.schedulePoints = (node.data.schedulePoints as any[]).map(p => ({
          ...p,
          flow: Number(convertValue(p.flow, oldUnit, unit, 'flow').toFixed(4))
        }));
      }

      return Object.keys(dataUpdate).length > 0 
        ? { ...node, data: { ...node.data, ...dataUpdate } } 
        : node;
    });

    // Convert all edges
    const newEdges = state.edges.map(edge => {
      if (edge.data?.unit) return edge; // Skip elements with local override

      const dataUpdate: any = {};
      Object.entries(edge.data || {}).forEach(([key, value]) => {
        if (typeof value === 'number' && fieldMapping[key]) {
          dataUpdate[key] = Number(convertValue(value, oldUnit, unit, fieldMapping[key]).toFixed(4));
        }
      });

      return Object.keys(dataUpdate).length > 0 
        ? { ...edge, data: { ...edge.data, ...dataUpdate } } 
        : edge;
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

    set({
      edges: applyEdgeChanges(changes, get().edges as any) as WhamoEdge[],
    });
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

    // Common node number logic for all physical nodes
    const nodeTypesWithNumbers: NodeType[] = ['reservoir', 'node', 'junction', 'surgeTank', 'flowBoundary'];
    let nodeNumber = parseInt(id);

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
    const newRequests: OutputRequest[] = requestTypes.map(reqType => ({
      id: `req-${Date.now()}-${Math.random()}`,
      elementId: id,
      elementType: 'node',
      requestType: reqType,
      variables: [...availableVars]
    }));
    
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
    
    set({ 
      nodes, 
      edges: processedEdges, 
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
    const { nodes, edges, computationalParams, outputRequests, history } = get();
    const currentState = { nodes, edges, computationalParams, outputRequests };
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
