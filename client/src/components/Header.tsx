import {
  AlertCircle,
  Maximize2,
  Layout,
  File,
  Edit2,
  PlusCircle,
  Settings2,
  Folder,
  Download,
  FilePlus,
  FolderOpen,
  Save,
  Share2,
  DownloadCloud,
  Type,
  Eraser,
  Trash2,
  Undo2,
  Redo2,
  Scissors,
  Copy,
  Clipboard,
  MousePointer2,
  Cylinder,
  Circle,
  GitCommitHorizontal,
  ArrowRightCircle,
  ListVideo,
  Info,
  ExternalLink,
  CheckSquare,
} from "lucide-react";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { Button } from "@/components/ui/button";
import { useNetworkStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { generateSystemDiagramSVG } from "@/lib/diagram-generator";
import folderIcon from "@assets/open-folder_1770356038145.png";

interface HeaderProps {
  onExport: (fileName?: string) => void;
  onGenerateOut: (fileName?: string) => void;
  isGeneratingOut: boolean;
  onSave: () => void;
  onLoad: () => void;
  onShowDiagram?: () => void;
}

export function Header({
  onExport,
  onGenerateOut,
  isGeneratingOut,
  onSave,
  onLoad,
  onShowDiagram,
}: HeaderProps) {
  const { toast } = useToast();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);
  const {
    addNode,
    clearNetwork,
    nodes,
    edges,
    computationalParams,
    updateComputationalParams,
    outputRequests,
    addOutputRequest,
    removeOutputRequest,
    projectName,
    setProjectName,
    projectNameError,
    setProjectNameError,
    undo,
    redo,
    history,
    loadedFileHandle,
    globalUnit,
    setGlobalUnit
  } = useNetworkStore();

  const [localParams, setLocalParams] = useState(computationalParams);
  const [selectedElementId, setSelectedElementId] = useState<string>("");
  const [selectedVars, setSelectedVars] = useState<string[]>([]);
  const [requestType, setRequestType] = useState<
    "HISTORY" | "PLOT" | "SPREADSHEET"
  >("HISTORY");

  useEffect(() => {
    setLocalParams(computationalParams);
  }, [computationalParams]);

  const handleAddRequest = () => {
    if (!selectedElementId || selectedVars.length === 0) return;

    const node = nodes.find((n) => n.id === selectedElementId);
    const type = node ? "node" : "edge";

    addOutputRequest({
      elementId: selectedElementId,
      elementType: type,
      requestType: requestType,
      variables: selectedVars,
    });
    setSelectedElementId("");
    setSelectedVars([]);
    toast({
      title: "Request Added",
      description: "Output request added successfully.",
    });
  };

  const availableVars = ["Q", "HEAD", "ELEV", "VEL", "PRESS", "PIEZHEAD"];

  const handleGenerateOutDirectly = async (fileName?: string) => {
    try {
      // 1. Generate INP content from current state
      const { generateInpFile } = await import("@/lib/inp-generator");
      const inpContent = generateInpFile(nodes, edges, false);

      // 2. Send to backend to run WHAMO
      const response = await fetch("/api/run-whamo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inpContent }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "WHAMO simulation failed.");
      }

      const data = await response.json();
      
      // Handle both array and object formats for maximum compatibility
      const filesToDownload = Array.isArray(data.files) 
        ? data.files 
        : Object.entries(data.files || {}).map(([key, content]) => ({
            name: `network.${key}`,
            content: content as string,
            type: "text/plain"
          }));

      if (filesToDownload.length === 0) {
        throw new Error("No output files received from server");
      }

      filesToDownload.forEach((file: { name: string; content: string; type?: string }) => {
        const byteCharacters = atob(file.content);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: file.type || "text/plain" });
        
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const downloadName = (projectName && projectName !== "Untitled Network") ? projectName : "network";
        const extension = file.name.split('.').pop();
        link.download = `${downloadName}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      });

      toast({
        title: "Success",
        description: "WHAMO output files generated and downloaded.",
      });
    } catch (error: any) {
      console.error("WHAMO Error:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleExport = () => {
    if (!projectName.trim() || projectName === "Untitled Network") {
      setProjectNameError("Please enter a file name");
      toast({
        title: "Validation Error",
        description: "Please enter a specific project name before downloading.",
        variant: "destructive",
      });
      return;
    }
    onExport(projectName);
  };

  const handleOutGenerate = () => {
    if (!projectName.trim() || projectName === "Untitled Network") {
      setProjectNameError("Please enter a file name");
      toast({
        title: "Validation Error",
        description: "Please enter a specific project name before generating .OUT.",
        variant: "destructive",
      });
      return;
    }
    handleGenerateOutDirectly(projectName);
  };

  return (
    <div className="flex flex-col border-b bg-background">
      {/* Top Row: Icon and Project Name */}
      <div className="flex items-center gap-3 px-4 py-1.5 relative">
        <img
          src={folderIcon}
          alt="Folder"
          className="w-10 h-10 object-contain"
        />
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 h-7">
            <input
              className={`text-lg font-normal leading-tight text-black bg-transparent border focus:ring-1 focus:ring-[#1a73e8] px-1 -ml-1 rounded cursor-text outline-none hover:bg-[#f1f3f4] ${projectNameError ? 'border-destructive ring-1 ring-destructive' : 'border-transparent'}`}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name..."
            />
            {projectNameError && (
              <div className="flex items-center gap-1 text-[10px] text-yellow-600 font-medium ml-2 bg-yellow-50 px-2 py-0.5 rounded border border-yellow-200">
                <AlertCircle className="w-3 h-3 text-destructive" />
                {projectNameError}
              </div>
            )}
          </div>
          <Menubar className="border-none bg-transparent shadow-none h-auto p-0 min-h-0">
            <MenubarMenu>
              <MenubarTrigger className="text-[14px] font-normal h-7 text-black hover:bg-[#f1f3f4] data-[state=open]:bg-[#f1f3f4] px-2 rounded cursor-default">
                File
              </MenubarTrigger>
              <MenubarContent>
                <MenubarItem
                  onClick={() => {
                    clearNetwork();
                    useNetworkStore.getState().autoSelectOutputRequests();
                  }}
                  className="gap-2"
                >
                  <FilePlus className="w-4 h-4" /> New
                </MenubarItem>
                <MenubarItem onClick={onLoad} className="gap-2">
                  <FolderOpen className="w-4 h-4" /> Open
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={onSave} className="gap-2">
                  <Save className="w-4 h-4" /> {loadedFileHandle ? 'Save' : 'Save (Download)'}
                </MenubarItem>
                <MenubarItem
                  onClick={() =>
                    toast({
                      title: "Share",
                      description: "Sharing feature coming soon.",
                    })
                  }
                  className="gap-2"
                >
                  <Share2 className="w-4 h-4" /> Share
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem
                  onClick={() => {
                    clearNetwork();
                  }}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <Eraser className="w-4 h-4" /> Clear Canvas
                </MenubarItem>
                <MenubarItem
                  onClick={() => {
                    clearNetwork();
                    setProjectName("Untitled Network");
                  }}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4" /> Delete Project
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger className="text-[14px] font-normal h-7 text-black hover:bg-[#f1f3f4] data-[state=open]:bg-[#f1f3f4] px-2 rounded cursor-default">
                Edit
              </MenubarTrigger>
              <MenubarContent>
                <MenubarItem
                  onClick={undo}
                  disabled={history.past.length === 0}
                  className="gap-2"
                >
                  <Undo2 className="w-4 h-4" /> Undo{" "}
                  <MenubarShortcut>Ctrl+Z</MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  onClick={redo}
                  disabled={history.future.length === 0}
                  className="gap-2"
                >
                  <Redo2 className="w-4 h-4" /> Redo{" "}
                  <MenubarShortcut>Ctrl+Y</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem
                  onClick={() =>
                    toast({ description: "Cut feature coming soon." })
                  }
                  className="gap-2"
                >
                  <Scissors className="w-4 h-4" /> Cut{" "}
                  <MenubarShortcut>⌘X</MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  onClick={() =>
                    toast({ description: "Copy feature coming soon." })
                  }
                  className="gap-2"
                >
                  <Scissors className="w-4 h-4 opacity-0 absolute" />{" "}
                  {/* Placeholder for Copy icon if needed or just use Copy */}
                  <Copy className="w-4 h-4" /> Copy{" "}
                  <MenubarShortcut>⌘C</MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  onClick={() =>
                    toast({ description: "Paste feature coming soon." })
                  }
                  className="gap-2"
                >
                  <Clipboard className="w-4 h-4" /> Paste{" "}
                  <MenubarShortcut>⌘V</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem
                  onClick={() =>
                    toast({ description: "Select All feature coming soon." })
                  }
                >
                  Select All <MenubarShortcut>⌘A</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger className="text-[14px] font-normal h-7 text-black hover:bg-[#f1f3f4] data-[state=open]:bg-[#f1f3f4] px-2 rounded cursor-default">
                View
              </MenubarTrigger>
              <MenubarContent>
                <MenubarItem 
                  onClick={() => {
                    if (!document.fullscreenElement) {
                      document.documentElement.requestFullscreen().catch(err => {
                        toast({
                          title: "Error",
                          description: `Error attempting to enable full-screen mode: ${err.message}`,
                          variant: "destructive",
                        });
                      });
                    } else {
                      document.exitFullscreen();
                    }
                  }}
                  className="gap-2"
                >
                  <Maximize2 className="w-4 h-4" /> {isFullscreen ? "Exit Full Screen" : "Full Screen"}
                  <MenubarShortcut>F11</MenubarShortcut>
                </MenubarItem>
                <MenubarItem 
                  onClick={() => {
                    const event = new CustomEvent('toggle-grid');
                    window.dispatchEvent(event);
                  }}
                  className="gap-2"
                >
                  <Layout className="w-4 h-4" /> Show Grid
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger className="text-[14px] font-normal h-7 text-black hover:bg-[#f1f3f4] data-[state=open]:bg-[#f1f3f4] px-2 rounded cursor-default">
                Insert
              </MenubarTrigger>
              <MenubarContent>
                <MenubarItem
                  onClick={() => addNode("reservoir", { x: 100, y: 100 })}
                  className="gap-2"
                >
                  <Cylinder className="w-4 h-4 text-blue-600" /> Reservoir
                </MenubarItem>
                <MenubarItem
                  onClick={() => addNode("node", { x: 150, y: 150 })}
                  className="gap-2"
                >
                  <Circle className="w-4 h-4 text-slate-600" /> Node
                </MenubarItem>
                <MenubarItem
                  onClick={() => addNode("junction", { x: 200, y: 150 })}
                  className="gap-2"
                >
                  <GitCommitHorizontal className="w-4 h-4 text-red-600" />{" "}
                  Junction
                </MenubarItem>
                <MenubarItem
                  onClick={() => addNode("surgeTank", { x: 250, y: 100 })}
                  className="gap-2"
                >
                  <PlusCircle className="w-4 h-4 text-orange-600" /> Surge Tank
                </MenubarItem>
                <MenubarItem
                  onClick={() => addNode("flowBoundary", { x: 50, y: 150 })}
                  className="gap-2"
                >
                  <ArrowRightCircle className="w-4 h-4 text-green-600" /> Flow
                  BC
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger className="text-[14px] font-normal h-7 text-black hover:bg-[#f1f3f4] data-[state=open]:bg-[#f1f3f4] px-2 rounded cursor-default">
                Configuration
              </MenubarTrigger>
              <MenubarContent>
                <MenubarItem 
                  className="flex items-center justify-between"
                  onClick={() => setGlobalUnit('SI')}
                >
                  SI (Metric) {globalUnit === 'SI' && <Settings2 className="w-3 h-3 ml-2" />}
                </MenubarItem>
                <MenubarItem 
                  className="flex items-center justify-between"
                  onClick={() => setGlobalUnit('FPS')}
                >
                  FPS (Imperial) {globalUnit === 'FPS' && <Settings2 className="w-3 h-3 ml-2" />}
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger className="text-[14px] font-normal h-7 text-black hover:bg-[#f1f3f4] data-[state=open]:bg-[#f1f3f4] px-2 rounded cursor-default">
                Tools
              </MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={onShowDiagram} className="gap-2">
                  <Layout className="w-4 h-4" /> System Diagram Console
                </MenubarItem>
                <MenubarItem
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".inp";
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (!file) return;
                      const content = await file.text();
                      try {
                        const response = await fetch(
                          "/api/run-external-whamo",
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              inpContent: content,
                              fileName: file.name,
                            }),
                          },
                        );
                        if (!response.ok)
                          throw new Error("Failed to generate WHAMO files");
                        
                        const data = await response.json();
                        
                        // Handle both array and object formats
                        const filesToDownload = Array.isArray(data.files) 
                          ? data.files 
                          : Object.entries(data.files || {}).map(([key, content]) => ({
                              name: file.name.replace(".inp", `.${key}`),
                              content: content as string,
                              type: "text/plain"
                            }));

                        if (filesToDownload.length === 0) {
                          throw new Error("No output files received from server");
                        }

                        filesToDownload.forEach((file: { name: string; content: string; type?: string }) => {
                          const byteCharacters = atob(file.content);
                          const byteNumbers = new Array(byteCharacters.length);
                          for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                          }
                          const byteArray = new Uint8Array(byteNumbers);
                          const blob = new Blob([byteArray], { type: file.type || "text/plain" });
                          
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = file.name;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          window.URL.revokeObjectURL(url);
                        });
                      } catch (err) {
                        toast({
                          title: "Error",
                          description:
                            "Failed to generate .OUT file from external .INP",
                          variant: "destructive",
                        });
                      }
                    };
                    input.click();
                  }}
                  className="gap-2"
                >
                  <ExternalLink className="w-4 h-4" /> Generate external .out
                  file
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={() => {
                  const event = new CustomEvent('toggleNodeSelection');
                  window.dispatchEvent(event);
                }} className="gap-2">
                  <CheckSquare className="w-4 h-4" /> Node Selection
                </MenubarItem>
                <MenubarSeparator />
                <Dialog>
                  <DialogTrigger asChild>
                    <MenubarItem
                      onSelect={(e) => e.preventDefault()}
                      className="gap-2"
                    >
                      <ListVideo className="w-4 h-4" /> Output Requests
                    </MenubarItem>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <div className="flex items-center justify-between">
                        <DialogTitle>Configure Output Requests</DialogTitle>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // Elements to select: nodes (excluding special types if any) and edges
                            // Types mentioned: node, conduit (edge), dummypipe (edge), other (edge)
                            // The user wants All History, Plot and Spreadsheet
                            const types: ("HISTORY" | "PLOT" | "SPREADSHEET")[] = ["HISTORY", "PLOT", "SPREADSHEET"];
                            const variables = ["Q", "HEAD", "ELEV", "VEL", "PRESS", "PIEZHEAD"];
                            
                            // Add requests for all nodes
                            nodes.forEach(node => {
                              types.forEach(type => {
                                const exists = outputRequests.some(req => 
                                  req.elementId === node.id && 
                                  req.requestType === type
                                );
                                if (!exists) {
                                  addOutputRequest({
                                    elementId: node.id,
                                    elementType: "node",
                                    requestType: type,
                                    variables: [...variables]
                                  });
                                }
                              });
                            });
                            
                            // Add requests for all edges
                            edges.forEach(edge => {
                              types.forEach(type => {
                                const exists = outputRequests.some(req => 
                                  req.elementId === edge.id && 
                                  req.requestType === type
                                );
                                if (!exists) {
                                  addOutputRequest({
                                    elementId: edge.id,
                                    elementType: "edge",
                                    requestType: type,
                                    variables: [...variables]
                                  });
                                }
                              });
                            });
                          }}
                        >
                          Select All
                        </Button>
                      </div>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>Select Element</Label>
                        <Select
                          value={selectedElementId}
                          onValueChange={setSelectedElementId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select element..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_" disabled>
                              Nodes
                            </SelectItem>
                            {nodes
                              .filter(
                                (n) =>
                                  !outputRequests.some(
                                    (req) =>
                                      req.elementId === n.id &&
                                      req.requestType === requestType,
                                  ),
                              )
                              .map((n) => (
                                <SelectItem key={n.id} value={n.id}>
                                  {n.data.label || String(n.data.nodeNumber)}
                                </SelectItem>
                              ))}
                            <SelectItem value="__" disabled>
                              Conduits
                            </SelectItem>
                            {edges
                              .filter(
                                (e) =>
                                  !outputRequests.some(
                                    (req) =>
                                      req.elementId === e.id &&
                                      req.requestType === requestType,
                                  ),
                              )
                              .map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.data?.label || `Edge ${e.id}`}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Request Type</Label>
                        <Select
                          value={requestType}
                          onValueChange={(v: any) => setRequestType(v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="HISTORY">HISTORY</SelectItem>
                            <SelectItem value="PLOT">PLOT</SelectItem>
                            <SelectItem value="SPREADSHEET">
                              SPREADSHEET
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Variables</Label>
                        <div className="flex flex-wrap gap-4">
                          {availableVars.map((v) => (
                            <div key={v} className="flex items-center gap-2">
                              <Checkbox
                                id={`header-var-${v}`}
                                checked={selectedVars.includes(v)}
                                onCheckedChange={(checked) => {
                                  if (checked)
                                    setSelectedVars([...selectedVars, v]);
                                  else
                                    setSelectedVars(
                                      selectedVars.filter((sv) => sv !== v),
                                    );
                                }}
                              />
                              <Label htmlFor={`header-var-${v}`}>{v}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <Button onClick={handleAddRequest}>Add Request</Button>

                      <Separator />

                      <div className="max-h-[200px] overflow-auto">
                        <Label className="mb-2 block">Current Requests ({requestType})</Label>
                        {[...outputRequests]
                          .filter((req) => req.requestType === requestType)
                          .sort((a, b) => {
                            const elA = nodes.find((n) => n.id === a.elementId) || edges.find((e) => e.id === a.elementId);
                            const elB = nodes.find((n) => n.id === b.elementId) || edges.find((e) => e.id === b.elementId);
                            
                            const getSortKey = (el) => {
                              if (!el) return "zzzz";
                              if (el.data?.nodeNumber !== undefined) return `node-${String(el.data.nodeNumber).padStart(10, '0')}`;
                              return `edge-${el.data?.label || el.id}`;
                            };
                            
                            return getSortKey(elA).localeCompare(getSortKey(elB), undefined, { numeric: true });
                          })
                          .map((req) => {
                          const el =
                            nodes.find((n) => n.id === req.elementId) ||
                            edges.find((e) => e.id === req.elementId);
                          const displayLabel = el?.data?.label || String(
                            el?.data?.nodeNumber ||
                              req.elementId,
                          );
                          return (
                            <div
                              key={`${req.id}-${req.requestType}`}
                              className="flex items-center justify-between text-sm py-1 border-b"
                            >
                              <span>
                                {displayLabel} ({req.requestType}): {req.variables.join(", ")}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => removeOutputRequest(req.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger asChild>
                    <MenubarItem
                      onSelect={(e) => e.preventDefault()}
                      className="gap-2"
                    >
                      <Settings2 className="w-4 h-4" /> Computation Parameters
                    </MenubarItem>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Computational Parameters</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold">Time Stages</Label>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8"
                            onClick={() => {
                              const newStages = [...computationalParams.stages, { dtcomp: 0.01, dtout: 0.1, tmax: 100 }];
                              updateComputationalParams({ stages: newStages });
                            }}
                          >
                            Add Stage
                          </Button>
                        </div>
                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                          {computationalParams.stages.map((stage, index) => (
                            <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 border rounded-md bg-muted/20 relative group">
                              <div className="col-span-3 space-y-1">
                                <Label className="text-[10px]">DTCOMP</Label>
                                <Input 
                                  type="number" 
                                  step="0.001"
                                  className="h-8 text-xs"
                                  value={stage.dtcomp}
                                  onChange={e => {
                                    const newStages = [...computationalParams.stages];
                                    newStages[index] = { ...stage, dtcomp: parseFloat(e.target.value) || 0 };
                                    updateComputationalParams({ stages: newStages });
                                  }}
                                />
                              </div>
                              <div className="col-span-3 space-y-1">
                                <Label className="text-[10px]">DTOUT</Label>
                                <Input 
                                  type="number" 
                                  step="0.01"
                                  className="h-8 text-xs"
                                  value={stage.dtout}
                                  onChange={e => {
                                    const newStages = [...computationalParams.stages];
                                    newStages[index] = { ...stage, dtout: parseFloat(e.target.value) || 0 };
                                    updateComputationalParams({ stages: newStages });
                                  }}
                                />
                              </div>
                              <div className="col-span-4 space-y-1">
                                <Label className="text-[10px]">TMAX</Label>
                                <Input 
                                  type="number" 
                                  className="h-8 text-xs"
                                  value={stage.tmax}
                                  onChange={e => {
                                    const newStages = [...computationalParams.stages];
                                    newStages[index] = { ...stage, tmax: parseFloat(e.target.value) || 0 };
                                    updateComputationalParams({ stages: newStages });
                                  }}
                                />
                              </div>
                              <div className="col-span-2 pb-0.5">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                  disabled={computationalParams.stages.length === 1}
                                  onClick={() => {
                                    const newStages = computationalParams.stages.filter((_, i) => i !== index);
                                    updateComputationalParams({ stages: newStages });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="includeAccutest-header" 
                            checked={computationalParams.includeAccutest !== false}
                            onCheckedChange={(checked) => updateComputationalParams({ includeAccutest: !!checked })}
                          />
                          <Label htmlFor="includeAccutest-header" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Include ACCUTEST in .INP
                          </Label>
                        </div>

                        <div className="space-y-2 opacity-100 data-[disabled=true]:opacity-50 transition-opacity" data-disabled={computationalParams.includeAccutest === false}>
                          <Label htmlFor="accutest-header">ACCUTEST Mode</Label>
                          <Select 
                            disabled={computationalParams.includeAccutest === false}
                            value={computationalParams.accutest || 'NONE'} 
                            onValueChange={(v: any) => updateComputationalParams({ accutest: v })}
                          >
                            <SelectTrigger id="accutest-header">
                              <SelectValue placeholder="Select accuracy mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="FULL">FULL (High Accuracy)</SelectItem>
                              <SelectItem value="PARTIAL">PARTIAL (Moderate)</SelectItem>
                              <SelectItem value="NONE">NONE (No Checking)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger className="text-[14px] font-normal h-7 text-black hover:bg-[#f1f3f4] data-[state=open]:bg-[#f1f3f4] px-2 rounded cursor-default">
                Help
              </MenubarTrigger>
              <MenubarContent>
                <Dialog open={showHelp} onOpenChange={setShowHelp}>
                  <DialogTrigger asChild>
                    <MenubarItem onSelect={(e) => e.preventDefault()} className="gap-2">
                      <Info className="w-4 h-4" /> Help Content
                    </MenubarItem>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto text-black">
                    <DialogHeader>
                      <DialogTitle>How to use this Software</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <section>
                        <h4 className="font-semibold text-lg">Introduction</h4>
                        <p className="text-sm text-muted-foreground">This hydraulic transient analysis software allows you to design and simulate water networks, analyzing pressure surges and flow changes over time.</p>
                      </section>
                      <section>
                        <h4 className="font-semibold text-base">Designing your Network</h4>
                        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                          <li>Use the **Insert** menu or Toolbar to add Reservoirs, Nodes, Junctions, Surge Tanks, and Flow Boundaries.</li>
                          <li>Click and drag from a blue dot on one node to another to create a **Conduit** (pipe).</li>
                          <li>Double-click on any element to edit its properties (Elevation, Length, Diameter, etc.) in the sidebar.</li>
                        </ul>
                      </section>
                      <section>
                        <h4 className="font-semibold text-base">Simulation & Output</h4>
                        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                          <li>Set your simulation time and steps in **Tools &gt; Computation Parameters**.</li>
                          <li>Configure which variables you want to track in **Tools &gt; Output Requests**.</li>
                          <li>Use **Generate .INP** to get the input file or **Generate .OUT** to run the simulation and get results.</li>
                        </ul>
                      </section>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => setShowHelp(false)}>Close</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <MenubarItem
                  onClick={() => {
                    const event = new CustomEvent('toggle-shortcut-console');
                    window.dispatchEvent(event);
                  }}
                  className="gap-2"
                >
                  <Layout className="w-4 h-4" /> Shortcuts
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </div>

        {/* Center Header Project Name */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <h1 className="text-xl font-semibold text-gray-800 tracking-tight">
            Hydraulic transient analysis software
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-2 pr-4">
          <Button
            variant="default"
            size="sm"
            onClick={handleExport}
            className="h-9 px-6 rounded-full bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium shadow-sm transition-all"
            data-testid="button-generate-inp"
          >
            <Download className="w-4 h-4 mr-2" />
            Generate .INP
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleOutGenerate}
            disabled={isGeneratingOut}
            className="h-9 px-6 rounded-full border-[#1a73e8] text-[#1a73e8] hover:bg-[#1a73e8]/10 font-medium shadow-sm transition-all"
            data-testid="button-generate-out"
          >
            <Download className="w-4 h-4 mr-2" />
            {isGeneratingOut ? "Processing..." : "Generate .OUT"}
          </Button>
        </div>
      </div>
    </div>
  );
}
