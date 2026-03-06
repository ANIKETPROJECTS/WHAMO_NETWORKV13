import { useCallback, useRef, useState, useEffect } from 'react';
import { 
  PlusCircle, 
  Circle, 
  GitCommitHorizontal, 
  Cylinder, 
  ArrowRightCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  NodeChange,
  EdgeChange,
  Connection,
  Edge,
  Node,
  useReactFlow,
  ReactFlowProvider,
  ControlButton
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { cn } from '@/lib/utils';
import { useNetworkStore, WhamoNode, WhamoEdge } from '@/lib/store';
import { ReservoirNode, SimpleNode, JunctionNode, SurgeTankNode, FlowBoundaryNode } from '@/components/NetworkNode';
import { ConnectionEdge } from '@/components/ConnectionEdge';
import { PropertiesPanel } from '@/components/PropertiesPanel';
import { Header } from '@/components/Header';
import { generateInpFile } from '@/lib/inp-generator';
import { generateSystemDiagram } from '@/lib/diagram-generator';
import { parseInpFile } from '@/lib/inp-parser';
import { saveAs } from 'file-saver';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { 
  Download, 
  X, 
  Maximize2, 
  Minimize2, 
  Tag, 
  EyeOff, 
  Info, 
  ChevronDown, 
  ChevronUp,
  Layout
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { ValidationModal } from '@/components/ValidationModal';
import { validateNetwork, ValidationError } from '@/lib/validator';

const nodeTypes = {
  reservoir: ReservoirNode,
  node: SimpleNode,
  junction: JunctionNode,
  surgeTank: SurgeTankNode,
  flowBoundary: FlowBoundaryNode,
};

const edgeTypes = {
  connection: ConnectionEdge,
};

function DesignerInner() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  // We connect local ReactFlow state to our global Zustand store for properties panel sync
  const { 
    nodes, 
    edges, 
    projectName,
    computationalParams,
    outputRequests,
    onNodesChange: storeOnNodesChange, 
    onEdgesChange: storeOnEdgesChange,
    onConnect: storeOnConnect, 
    selectElement, 
    loadNetwork,
    clearNetwork,
    deleteElement,
    selectedElementId,
    selectedElementType,
    isLocked,
    toggleLock,
    undo,
    redo,
    loadedFileHandle
  } = useNetworkStore();

  const handleSave = async () => {
    const data = { 
      projectName,
      nodes, 
      edges,
      computationalParams,
      outputRequests
    };

    try {
      if (loadedFileHandle && 'showSaveFilePicker' in window) {
        // We have a file handle and supporting browser, try to save directly
        // Permission check
        const options = {
          mode: 'readwrite',
        };
        
        // Verify permission if needed
        if (await (loadedFileHandle as any).queryPermission(options) !== 'granted') {
          if (await (loadedFileHandle as any).requestPermission(options) !== 'granted') {
            throw new Error("Permission denied");
          }
        }

        const writable = await (loadedFileHandle as any).createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        toast({ title: "Project Saved", description: `Changes saved to ${projectName}.` });
        return;
      }
    } catch (err) {
      console.warn("Direct save failed, falling back to download:", err);
    }

    // Fallback to traditional download if no handle or direct save fails
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const fileName = `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'network'}.json`;
    saveAs(blob, fileName);
    toast({ title: "Project Downloaded", description: "Network topology saved as JSON file." });
  };

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isLocked) return;
      storeOnNodesChange(changes);
    },
    [storeOnNodesChange, isLocked]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (isLocked) return;
      storeOnEdgesChange(changes);
    },
    [storeOnEdgesChange, isLocked]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (isLocked) return;
      if (params.source === params.target) {
        toast({
          variant: "destructive",
          title: "Invalid Connection",
          description: "An element cannot be connected to itself.",
        });
        return;
      }
      storeOnConnect(params);
    },
    [storeOnConnect, toast, isLocked]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    selectElement(node.id, 'node');
  }, [selectElement]);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    selectElement(edge.id, 'edge');
  }, [selectElement]);

  const onSelectionChange = useCallback(({ nodes, edges }: { nodes: WhamoNode[], edges: WhamoEdge[] }) => {
    if (nodes.length > 0) {
      selectElement(nodes[0].id, 'node');
    } else if (edges.length > 0) {
      selectElement(edges[0].id, 'edge');
    } else {
      selectElement(null, null);
    }
  }, [selectElement]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if user is typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Keyboard shortcuts for zoom and view
      if (event.key === '+' || event.key === '=') {
        zoomIn();
      } else if (event.key === '-' || event.key === '_') {
        zoomOut();
      } else if (event.key.toLowerCase() === 'f') {
        fitView();
      } else if (event.key === 'F11') {
        event.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(console.error);
        } else {
          document.exitFullscreen().catch(console.error);
        }
      } else if (event.key.toLowerCase() === 'z' && (event.metaKey || event.ctrlKey)) {
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        event.preventDefault();
      } else if (event.key.toLowerCase() === 'y' && (event.metaKey || event.ctrlKey)) {
        redo();
        event.preventDefault();
      } else if (event.key.toLowerCase() === 's' && (event.metaKey || event.ctrlKey)) {
        handleSave();
        event.preventDefault();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && 
          selectedElementId && 
          selectedElementType) {
        deleteElement(selectedElementId, selectedElementType);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteElement, selectedElementId, selectedElementType, zoomIn, zoomOut, fitView, toggleLock, undo, redo, handleSave]);

  const handleLoadClick = async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'WHAMO Projects',
              accept: {
                'application/json': ['.json'],
                'text/plain': ['.inp']
              }
            }
          ]
        });

        const file = await handle.getFile();
        const content = await file.text();
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.json')) {
          const json = JSON.parse(content);
          if (json.nodes && json.edges) {
            const loadedProjectName = json.projectName || file.name.replace(/\.json$/i, '');
            loadNetwork(json.nodes, json.edges, json.computationalParams, json.outputRequests, loadedProjectName, handle);
            setProjectState("active");
            toast({ title: "Project Loaded", description: `Network topology "${loadedProjectName}" restored from JSON.` });
          } else {
            throw new Error("Invalid JSON format");
          }
        } else if (fileName.endsWith('.inp')) {
          const { nodes, edges } = parseInpFile(content);
          if (nodes.length > 0) {
            const loadedProjectName = file.name.replace(/\.inp$/i, '');
            loadNetwork(nodes, edges, undefined, undefined, loadedProjectName, handle);
            setProjectState("active");
            toast({ title: "Project Loaded", description: `Network topology "${loadedProjectName}" restored from .inp file.` });
          } else {
            throw new Error("No valid network elements found in .inp file");
          }
        }
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error("Native load failed, falling back to hidden input", err);
      }
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const fileName = file.name.toLowerCase();

      try {
        if (fileName.endsWith('.json')) {
          const json = JSON.parse(content);
          if (json.nodes && json.edges) {
            // Use project name from file or fallback to filename
            const loadedProjectName = json.projectName || file.name.replace(/\.json$/i, '');
            loadNetwork(json.nodes, json.edges, json.computationalParams, json.outputRequests, loadedProjectName);
            setProjectState("active");
            toast({ title: "Project Loaded", description: `Network topology "${loadedProjectName}" restored from JSON.` });
          } else {
            throw new Error("Invalid JSON format");
          }
        } else if (fileName.endsWith('.inp')) {
          const { nodes, edges } = parseInpFile(content);
          if (nodes.length > 0) {
            const loadedProjectName = file.name.replace(/\.inp$/i, '');
            loadNetwork(nodes, edges, undefined, undefined, loadedProjectName);
            setProjectState("active");
            toast({ title: "Project Loaded", description: `Network topology "${loadedProjectName}" restored from .inp file.` });
          } else {
            throw new Error("No valid network elements found in .inp file");
          }
        } else {
          throw new Error("Unsupported file type");
        }
      } catch (err) {
        toast({ variant: "destructive", title: "Load Failed", description: err instanceof Error ? err.message : "Invalid file." });
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const handleGenerateInp = async (force: boolean | any = false) => {
    if (force !== true) {
      const results = validateNetwork(nodes as WhamoNode[], edges as WhamoEdge[]);
      if (results.errors.length > 0 || results.warnings.length > 0) {
        setValidationData(results);
        return;
      }
    }
    try {
      // Pass false to prevent internal download, we handle it here
      const inpContent = generateInpFile(nodes as WhamoNode[], edges as WhamoEdge[], false);
      
      // Generate system diagram
      const diagramHtml = generateSystemDiagram(nodes, edges);
      const diagramBlob = new Blob([diagramHtml], { type: 'text/html' });
      saveAs(diagramBlob, `system_diagram_${Date.now()}.html`);

      // Download the .inp file with the project name
      const blob = new Blob([inpContent], { type: "text/plain" });
      const downloadName = (projectName && projectName !== "Untitled Network") ? projectName : "network";
      saveAs(blob, `${downloadName}.inp`);
      
      toast({ title: "Files Generated", description: "WHAMO input file and System Diagram downloaded successfully." });
    } catch (err) {
      toast({ variant: "destructive", title: "Generation Failed", description: "Could not generate files. Check connections." });
    }
  };

  const [projectState, setProjectState] = useState<"empty" | "active">("empty");
  const [isGeneratingOut, setIsGeneratingOut] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [diagramSvg, setDiagramSvg] = useState<string | null>(null);
  const [showShortcutConsole, setShowShortcutConsole] = useState(false);
  const [showGrid, setShowGrid] = useState(true);

  useEffect(() => {
    const handleToggleGrid = () => setShowGrid((prev) => !prev);
    window.addEventListener('toggle-grid', handleToggleGrid);
    return () => window.removeEventListener('toggle-grid', handleToggleGrid);
  }, []);

  const handleNewProject = () => {
    clearNetwork();
  const [validationData, setValidationData] = useState<{ errors: ValidationError[], warnings: ValidationError[] } | null>(null);
    setProjectState("active");
  };

  const handleOpenProject = () => {
    handleLoadClick();
  };

  const [showDiagram, setShowDiagram] = useState(false);

  useEffect(() => {
    if (showDiagram) {
      const svg = generateSystemDiagram(nodes, edges, { showLabels });
      setDiagramSvg(svg);
    }
  }, [nodes, edges, showDiagram, showLabels]);

  const downloadImage = async () => {
    const element = document.getElementById('system-diagram-container');
    if (!element) return;
    
    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `system_diagram_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      toast({ variant: "destructive", title: "Download Failed", description: "Could not generate image." });
    }
  };

  const handleGenerateOut = async () => {
    // Create file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.inp';
    
    // Handle file selection
    fileInput.onchange = async (e: any) => {
      const file = e.target.files[0];
      
      if (!file) return;
      
      // Validate file extension
      if (!file.name.endsWith('.inp')) {
        toast({
          variant: "destructive",
          title: "Invalid file",
          description: "Please select a valid .inp file"
        });
        return;
      }
      
      // Show loading state
      setIsGeneratingOut(true);
      
      try {
        // Create form data
        const formData = new FormData();
        formData.append('inpFile', file);
        
        // Call API
        const response = await fetch('/api/generate-out', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error('Failed to generate OUT file');
        }
        
        // Get the blob
        const blob = await response.blob();
        
        // Trigger download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const downloadName = (projectName && projectName !== "Untitled Network") ? projectName : "network";
        a.download = `${downloadName}_output.out`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        // Show success message
        toast({
          title: "Success",
          description: "OUT file generated successfully!"
        });
        
      } catch (error: any) {
        console.error('Error:', error);
        toast({
          variant: "destructive",
          title: "Generation Failed",
          description: error.message || "Failed to generate OUT file. Please try again."
        });
      } finally {
        setIsGeneratingOut(false);
      }
    };
    
    // Trigger file picker
    fileInput.click();
  };

  useEffect(() => {
    const handleToggleConsole = () => setShowShortcutConsole((prev: boolean) => !prev);
    window.addEventListener('toggle-shortcut-console', handleToggleConsole);
    return () => window.removeEventListener('toggle-shortcut-console', handleToggleConsole);
  }, []);

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background text-foreground relative">
      <ValidationModal 
        isOpen={!!validationData}
        onClose={() => setValidationData(null)}
        onGenerate={() => {
          handleGenerateInp(true);
          setValidationData(null);
        }}
        errors={validationData?.errors || []}
        warnings={validationData?.warnings || []}
      />
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".json,.inp" 
        className="hidden" 
      />

      {/* Top Bar (Header) */}
      <Header 
        onExport={handleGenerateInp} 
        onGenerateOut={handleGenerateOut}
        isGeneratingOut={isGeneratingOut}
        onSave={handleSave} 
        onLoad={handleLoadClick} 
        onShowDiagram={() => {
          const svg = generateSystemDiagram(nodes, edges, { showLabels });
          setDiagramSvg(svg);
          setShowDiagram(true);
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {projectState === "empty" && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="flex gap-12 pointer-events-auto">
              {/* New Project Card */}
              <div 
                className="w-[320px] bg-white rounded-xl shadow-lg border border-slate-200 p-8 flex flex-col items-center text-center cursor-pointer hover:shadow-xl transition-all duration-200 group"
                onClick={handleNewProject}
              >
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  <PlusCircle className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-3">New Project</h2>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Start a new hydraulic network analysis project from scratch
                </p>
              </div>

              {/* Open Project Card */}
              <div 
                className="w-[320px] bg-white rounded-xl shadow-lg border border-slate-200 p-8 flex flex-col items-center text-center cursor-pointer hover:shadow-xl transition-all duration-200 group"
                onClick={handleOpenProject}
              >
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  <Download className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-3">Open Project</h2>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Continue working on an existing project or import files
                </p>
              </div>
            </div>
          </div>
        )}
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel defaultSize={75} minSize={isMaximized ? 0 : 30} className={cn(isMaximized && "hidden")}>
            <div className="flex h-full w-full overflow-hidden relative">
              {/* Canvas Area */}
              <div className="flex-1 relative h-full bg-slate-50 transition-all duration-300">
                <ReactFlow
                  nodes={nodes as any}
                  edges={edges as any}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodeClick={onNodeClick}
                  onEdgeClick={onEdgeClick}
                  onSelectionChange={onSelectionChange as any}
                  fitView
                  minZoom={0.05}
                  maxZoom={4}
                  className="bg-slate-50"
                  proOptions={{ hideAttribution: true }}
                  nodesDraggable={!isLocked}
                  nodesConnectable={!isLocked}
                  elementsSelectable={true}
                >
                  <Background color="#94a3b8" gap={20} size={1} className={cn(!showGrid && "opacity-0")} />
                  <Controls className="!bg-white !shadow-xl !border-border">
                  </Controls>
                </ReactFlow>
                
                {isLocked && (
                  <div className="absolute top-4 right-4 bg-orange-100 text-orange-800 px-3 py-1 rounded-md text-sm font-medium border border-orange-200 shadow-sm z-50 flex items-center gap-2">
                    <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                    Network Locked
                  </div>
                )}
              </div>

              {/* Properties Panel (Sidebar) */}
              <div 
                className={cn(
                  "h-full border-l border-border bg-card shadow-2xl z-20 flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
                  selectedElementId ? "w-[350px] opacity-100 visible" : "w-0 opacity-0 invisible"
                )}
              >
                <div className="w-[350px] h-full">
                  {selectedElementId && <PropertiesPanel />}
                </div>
              </div>
            </div>
          </ResizablePanel>
          
          {showDiagram && (
            <>
              <ResizableHandle withHandle className={cn(isMaximized && "hidden")} />
              <ResizablePanel defaultSize={25} minSize={isMaximized ? 100 : 10} className={cn(isMaximized && "flex-1")}>
                <div className="h-full w-full bg-background overflow-hidden flex flex-col relative">
                  <div className="flex items-center justify-between p-3 border-b bg-card">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">System Diagram Console</h3>
                      </div>
                      
                      {/* Integrated Legend */}
                      <div className="flex items-center gap-4 border-l pl-6">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-3 bg-[#3498db] border border-[#2980b9] rounded-sm" />
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">Reservoir</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-5 bg-[#f39c12] border border-[#e67e22] rounded-sm" />
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">Surge Tank</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-[#e74c3c] border border-[#c0392b] rounded-full" />
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">Node/Junction</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-[2px] bg-[#3498db]" />
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">Conduit</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn("h-8 gap-2", !showLabels && "bg-muted")}
                        onClick={() => setShowLabels(!showLabels)}
                      >
                        {showLabels ? <Tag className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span className="text-xs uppercase tracking-wide font-semibold">{showLabels ? "Hide Labels" : "Show Labels"}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-2"
                        onClick={downloadImage}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="text-xs uppercase tracking-wide font-semibold">Export PNG</span>
                      </Button>
                      <div className="w-px h-4 bg-border mx-1" />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setShowDiagram(false);
                          setIsMaximized(false);
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-auto bg-slate-100/50 relative">
                    <TransformWrapper
                      initialScale={1}
                      minScale={0.1}
                      maxScale={4}
                      centerOnInit={false}
                      limitToBounds={false}
                    >
                      <TransformComponent
                        wrapperStyle={{
                          width: "100%",
                          height: "100%",
                        }}
                        contentStyle={{
                          width: "max-content",
                          height: "max-content",
                          padding: "100px",
                        }}
                      >
                        <div 
                          id="system-diagram-container"
                          className="bg-white shadow-2xl rounded-2xl border border-slate-200 p-20"
                          style={{ 
                            width: "max-content", 
                            height: "max-content",
                            minWidth: "1200px",
                            minHeight: "800px"
                          }}
                          dangerouslySetInnerHTML={{ __html: diagramSvg || '' }} 
                        />
                      </TransformComponent>
                    </TransformWrapper>
                  </div>

                  {/* Absolute positioning for controls */}
                  <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-10">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-10 w-10 rounded-full shadow-lg border border-border/50 bg-background/80 backdrop-blur-sm"
                      onClick={() => setIsMaximized(!isMaximized)}
                    >
                      {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* Full Screen Shortcut Console Overlay */}
      {showShortcutConsole && (
        <div className="absolute inset-x-0 bottom-0 z-[100] bg-slate-900/95 text-white p-4 animate-in slide-in-from-bottom duration-300 backdrop-blur-md border-t border-slate-700">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-slate-700 rounded text-xs font-mono">F11</span>
                <span className="text-sm text-slate-300">Toggle Fullscreen</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-slate-700 rounded text-xs font-mono">Ctrl + S</span>
                <span className="text-sm text-slate-300">Save Project</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-slate-700 rounded text-xs font-mono">Ctrl + Z</span>
                <span className="text-sm text-slate-300">Undo</span>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-slate-400 hover:text-white"
              onClick={() => setShowShortcutConsole(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Designer() {
  return (
    <ReactFlowProvider>
      <DesignerInner />
    </ReactFlowProvider>
  );
}
