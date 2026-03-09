import { 
  PlusCircle, 
  Circle, 
  GitCommitHorizontal, 
  Cylinder, 
  ArrowRightCircle, 
  Trash2, 
  RotateCcw, 
  Download, 
  Save, 
  Upload, 
  MousePointer2,
  Settings2,
  ListVideo
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useNetworkStore } from '@/lib/store';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
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
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export function Toolbar({ onExport, onSave, onLoad }: { onExport: (fileName?: string) => void, onSave: () => void, onLoad: () => void }) {
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
    setProjectNameError,
  } = useNetworkStore();

  const [localParams, setLocalParams] = useState(computationalParams);
  const [selectedElementId, setSelectedElementId] = useState<string>("");
  const [selectedVars, setSelectedVars] = useState<string[]>([]);
  const [requestType, setRequestType] = useState<"HISTORY" | "PLOT" | "SPREADSHEET">("HISTORY");

  const handleAddRequest = () => {
    if (!selectedElementId || selectedVars.length === 0) return;
    
    const node = nodes.find(n => n.id === selectedElementId);
    const edge = edges.find(e => e.id === selectedElementId);
    const type = node ? 'node' : 'edge';

    addOutputRequest({
      elementId: selectedElementId,
      elementType: type,
      requestType: requestType,
      variables: selectedVars
    });
    setSelectedElementId("");
    setSelectedVars([]);
  };

  const availableVars = ["Q", "HEAD", "ELEV", "VEL", "PRESS", "PIEZHEAD"];

  const tools = [
    { label: 'Reservoir', icon: Cylinder, action: () => addNode('reservoir', { x: 100, y: 100 }), color: 'text-blue-600' },
    { label: 'Node', icon: Circle, action: () => addNode('node', { x: 150, y: 150 }), color: 'text-blue-500' },
    { label: 'Junction', icon: GitCommitHorizontal, action: () => addNode('junction', { x: 200, y: 150 }), color: 'text-red-500' },
    { label: 'Surge Tank', icon: PlusCircle, action: () => addNode('surgeTank', { x: 250, y: 100 }), color: 'text-orange-600' },
    { label: 'Flow BC', icon: ArrowRightCircle, action: () => addNode('flowBoundary', { x: 50, y: 150 }), color: 'text-green-600' },
  ];

  const handleRunWhamo = async (fileName?: string) => {
    try {
      // 1. Generate INP content from current state
      const { generateInpFile } = await import('@/lib/inp-generator');
      const inpContent = generateInpFile(nodes, edges, false);

      // 2. Send to backend
      const response = await fetch("/api/run-whamo", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inpContent })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "WHAMO simulation failed.");
      }

      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const downloadName = (projectName && projectName !== "Untitled Network") ? projectName : "network";
      link.download = `${downloadName}.out`;
      link.click();
    } catch (error: any) {
      console.error("WHAMO Error:", error);
      alert(error.message);
    }
  };

  const handleExport = () => {
    if (!projectName.trim()) {
      setProjectNameError("Please enter a file name");
      return;
    }
    onExport(projectName);
  };

  const handleOutGenerate = () => {
    if (!projectName.trim()) {
      setProjectNameError("Please enter a file name");
      return;
    }
    handleRunWhamo(projectName);
  };

  return (
    <div className="h-16 border-b border-border bg-card px-4 flex items-center justify-between shadow-sm z-10 relative">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border/50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 data-[active=true]:bg-accent">
                <MousePointer2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Select / Move</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8 mx-2" />

        <div className="flex items-center gap-1">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-9">
                <ListVideo className="w-4 h-4" />
                Output Request
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle>Configure Output Requests</DialogTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const types: ("HISTORY" | "PLOT" | "SPREADSHEET")[] = ["HISTORY", "PLOT", "SPREADSHEET"];
                      const variables = ["Q", "HEAD", "ELEV", "VEL", "PRESS", "PIEZHEAD"];
                      
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
                    data-testid="button-select-all-requests-toolbar"
                  >
                    Select All
                  </Button>
                </div>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Select Element</Label>
                  <Select value={selectedElementId} onValueChange={setSelectedElementId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select element..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_" disabled>Nodes</SelectItem>
                      {nodes
                        .filter(n => !outputRequests.some(req => req.elementId === n.id && req.requestType === requestType))
                        .map(n => (
                          <SelectItem key={n.id} value={n.id}>
                            {n.data.label || String(n.data.nodeNumber)}
                          </SelectItem>
                        ))}
                      <SelectItem value="__" disabled>Conduits</SelectItem>
                      {edges
                        .filter(e => !outputRequests.some(req => req.elementId === e.id && req.requestType === requestType))
                        .map(e => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.data?.label || `Edge ${e.id}`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Request Type</Label>
                  <Select value={requestType} onValueChange={(v: any) => {
                    setRequestType(v);
                    setSelectedElementId("");
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HISTORY">HISTORY</SelectItem>
                      <SelectItem value="PLOT">PLOT</SelectItem>
                      <SelectItem value="SPREADSHEET">SPREADSHEET</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Variables</Label>
                  <div className="flex flex-wrap gap-4">
                    {availableVars.map(v => (
                      <div key={v} className="flex items-center gap-2">
                        <Checkbox 
                          id={`toolbar-var-${v}`} 
                          checked={selectedVars.includes(v)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedVars([...selectedVars, v]);
                            else setSelectedVars(selectedVars.filter(sv => sv !== v));
                          }}
                        />
                        <Label htmlFor={`toolbar-var-${v}`}>{v}</Label>
                      </div>
                    ))}
                  </div>
                </div>
                <Button onClick={handleAddRequest}>Add Request</Button>
                
                <Separator />
                
                <div className="max-h-[200px] overflow-auto">
                  <Label className="mb-2 block">Current Requests ({requestType})</Label>
                  {[...outputRequests]
                    .filter(req => req.requestType === requestType)
                    .sort((a, b) => {
                      const elA = nodes.find(n => n.id === a.elementId) || edges.find(e => e.id === a.elementId);
                      const elB = nodes.find(n => n.id === b.elementId) || edges.find(e => e.id === b.elementId);
                      
                      const getSortKey = (el) => {
                        if (!el) return "zzzz";
                        if (el.data?.nodeNumber !== undefined) return `node-${String(el.data.nodeNumber).padStart(10, '0')}`;
                        return `edge-${el.data?.label || el.id}`;
                      };
                      
                      return getSortKey(elA).localeCompare(getSortKey(elB), undefined, { numeric: true });
                    })
                    .map(req => {
                    const el = nodes.find(n => n.id === req.elementId) || edges.find(e => e.id === req.elementId);
                    const displayLabel = el?.data?.label || String(el?.data?.nodeNumber || req.elementId);
                    return (
                      <div key={`${req.id}-${req.requestType}`} className="flex items-center justify-between text-sm py-1 border-b">
                        <span>{displayLabel} ({req.requestType}): {req.variables.join(', ')}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeOutputRequest(req.id)}>
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
              <Button variant="outline" size="sm" className="gap-2 h-9">
                <Settings2 className="w-4 h-4" />
                COMPUTATIONAL PARAMETERS
              </Button>
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
                      id="includeAccutest" 
                      checked={computationalParams.includeAccutest !== false}
                      onCheckedChange={(checked) => updateComputationalParams({ includeAccutest: !!checked })}
                    />
                    <Label htmlFor="includeAccutest" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Include ACCUTEST in .INP
                    </Label>
                  </div>

                  <div className="space-y-2 opacity-100 data-[disabled=true]:opacity-50 transition-opacity" data-disabled={computationalParams.includeAccutest === false}>
                    <Label htmlFor="accutest">ACCUTEST Mode</Label>
                    <Select 
                      disabled={computationalParams.includeAccutest === false}
                      value={computationalParams.accutest || 'NONE'} 
                      onValueChange={(v: any) => updateComputationalParams({ accutest: v })}
                    >
                      <SelectTrigger id="accutest">
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
        </div>

        <Separator orientation="vertical" className="h-8 mx-2" />

        <div className="flex items-center gap-1">
          {tools.map((tool) => (
            <Tooltip key={tool.label}>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={tool.action}
                  className="gap-2 h-9 px-3 hover:bg-muted/50 transition-colors"
                >
                  <tool.icon className={`w-4 h-4 ${tool.color}`} />
                  <span className="hidden xl:inline">{tool.label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add {tool.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={clearNetwork} className="text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear Canvas</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-8 mx-2" />

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" onClick={onLoad}>
                <Upload className="w-4 h-4 mr-2" />
                Open
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open Project</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" onClick={onSave}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save Project</TooltipContent>
          </Tooltip>

          <Button onClick={handleExport} className="ml-2 shadow-lg shadow-primary/20" data-testid="button-generate-inp">
            <Download className="w-4 h-4 mr-2" />
            Generate .INP
          </Button>

          <Button 
            onClick={handleOutGenerate} 
            variant="outline" 
            className="ml-2 border-primary text-primary hover:bg-primary/10"
            data-testid="button-generate-out"
          >
            <Download className="w-4 h-4 mr-2" />
            Generate .OUT
          </Button>
        </div>
      </div>
    </div>
  );
}
