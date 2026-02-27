import { Handle, Position, NodeProps } from '@xyflow/react';
import { clsx } from 'clsx';
import { memo } from 'react';
import reservoirImg from '@/assets/reservoir.png';
import tankImg from '@/assets/tank.png';
import { TooltipWrapper, DataList } from './TooltipWrapper';
import { useNetworkStore } from '@/lib/store';

// Common handle styles
const HandleStyle = "w-2 h-2 bg-primary border border-white opacity-0 group-hover:opacity-100 transition-opacity";

// Reservoir Node
export const ReservoirNode = memo(({ id, data, selected }: NodeProps) => {
  const node = useNetworkStore(state => state.nodes.find(n => n.id === id));
  const displayData = node ? node.data : data;

  return (
    <TooltipWrapper content={<DataList data={displayData} title="Reservoir Properties" />}>
      <div className={clsx(
        "w-[50px] h-[50px] transition-all group relative flex items-center justify-center",
      )}>
        <Handle type="target" id="t-top" position={Position.Top} className={HandleStyle} />
        <Handle type="source" id="s-top" position={Position.Top} className={HandleStyle} />
        <Handle type="target" id="t-bottom" position={Position.Bottom} className={HandleStyle} />
        <Handle type="source" id="s-bottom" position={Position.Bottom} className={HandleStyle} />
        <Handle type="target" id="t-left" position={Position.Left} className={HandleStyle} />
        <Handle type="source" id="s-left" position={Position.Left} className={HandleStyle} />
        <Handle type="target" id="t-right" position={Position.Right} className={HandleStyle} />
        <Handle type="source" id="s-right" position={Position.Right} className={HandleStyle} />
        
        <img 
          src={reservoirImg} 
          alt="Reservoir" 
          className={clsx(
            "w-full h-full object-contain transition-all",
            selected ? "drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" : ""
          )} 
        />
        
        <div className="absolute -top-6 text-[10px] font-bold text-blue-900 bg-white/80 px-1 rounded border border-blue-200 shadow-sm whitespace-nowrap">
          {data.label as React.ReactNode}
        </div>
      </div>
    </TooltipWrapper>
  );
});

// Basic Node (Simple Node)
export const SimpleNode = memo(({ id, data, selected }: NodeProps) => {
  const node = useNetworkStore(state => state.nodes.find(n => n.id === id));
  const displayData = node ? node.data : data;

  return (
    <TooltipWrapper content={<DataList data={displayData} title="Node Properties" />}>
      <div className={clsx(
        "w-6 h-6 rounded-full border-2 shadow-sm flex items-center justify-center transition-all relative group bg-white",
        selected ? "border-blue-600 ring-2 ring-blue-600/20" : "border-blue-500"
      )}>
        <div className="w-4 h-4 rounded-full border border-blue-400 bg-white flex items-center justify-center">
          <span className="text-[8px] font-bold text-blue-600">N{data.nodeNumber as React.ReactNode}</span>
        </div>

        <Handle type="target" id="t-top" position={Position.Top} className={HandleStyle} />
        <Handle type="source" id="s-top" position={Position.Top} className={HandleStyle} />
        <Handle type="target" id="t-bottom" position={Position.Bottom} className={HandleStyle} />
        <Handle type="source" id="s-bottom" position={Position.Bottom} className={HandleStyle} />
        <Handle type="target" id="t-left" position={Position.Left} className={HandleStyle} />
        <Handle type="source" id="s-left" position={Position.Left} className={HandleStyle} />
        <Handle type="target" id="t-right" position={Position.Right} className={HandleStyle} />
        <Handle type="source" id="s-right" position={Position.Right} className={HandleStyle} />
      </div>
    </TooltipWrapper>
  );
});

// Junction Node
export const JunctionNode = memo(({ id, data, selected }: NodeProps) => {
  const node = useNetworkStore(state => state.nodes.find(n => n.id === id));
  const displayData = node ? node.data : data;

  return (
    <TooltipWrapper content={<DataList data={displayData} title="Junction Properties" />}>
      <div className={clsx(
        "w-6 h-6 rounded-full border-2 shadow-sm flex items-center justify-center transition-all relative group bg-white",
        selected ? "border-red-600 ring-2 ring-red-600/20" : "border-red-500"
      )}>
        <div className="w-4 h-4 rounded-full border border-red-400 bg-white flex items-center justify-center">
          <span className="text-[8px] font-bold text-red-600">J{data.nodeNumber as React.ReactNode}</span>
        </div>

        <Handle type="target" id="t-top" position={Position.Top} className={clsx(HandleStyle, "!bg-red-500")} />
        <Handle type="source" id="s-top" position={Position.Top} className={clsx(HandleStyle, "!bg-red-500")} />
        <Handle type="target" id="t-bottom" position={Position.Bottom} className={clsx(HandleStyle, "!bg-red-500")} />
        <Handle type="source" id="s-bottom" position={Position.Bottom} className={clsx(HandleStyle, "!bg-red-500")} />
        <Handle type="target" id="t-left" position={Position.Left} className={clsx(HandleStyle, "!bg-red-500")} />
        <Handle type="source" id="s-left" position={Position.Left} className={clsx(HandleStyle, "!bg-red-500")} />
        <Handle type="target" id="t-right" position={Position.Right} className={clsx(HandleStyle, "!bg-red-500")} />
        <Handle type="source" id="s-right" position={Position.Right} className={clsx(HandleStyle, "!bg-red-500")} />
      </div>
    </TooltipWrapper>
  );
});

// Surge Tank
export const SurgeTankNode = memo(({ id, data, selected }: NodeProps) => {
  const node = useNetworkStore(state => state.nodes.find(n => n.id === id));
  const displayData = node ? node.data : data;

  return (
    <TooltipWrapper content={<DataList data={displayData} title="Surge Tank Properties" />}>
      <div className={clsx(
        "w-[50px] h-[50px] transition-all group relative flex items-center justify-center",
      )}>
        <Handle type="target" id="t-top" position={Position.Top} className={clsx(HandleStyle, "!bg-orange-500")} />
        <Handle type="source" id="s-top" position={Position.Top} className={clsx(HandleStyle, "!bg-orange-500")} />
        <Handle type="target" id="t-bottom" position={Position.Bottom} className={clsx(HandleStyle, "!bg-orange-500")} />
        <Handle type="source" id="s-bottom" position={Position.Bottom} className={clsx(HandleStyle, "!bg-orange-500")} />
        <Handle type="target" id="t-left" position={Position.Left} className={clsx(HandleStyle, "!bg-orange-500")} />
        <Handle type="source" id="s-left" position={Position.Left} className={clsx(HandleStyle, "!bg-orange-500")} />
        <Handle type="target" id="t-right" position={Position.Right} className={clsx(HandleStyle, "!bg-orange-500")} />
        <Handle type="source" id="s-right" position={Position.Right} className={clsx(HandleStyle, "!bg-orange-500")} />
        
        <img 
          src={tankImg} 
          alt="Surge Tank" 
          className={clsx(
            "w-full h-full object-contain transition-all",
            selected ? "drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]" : ""
          )} 
        />
        
        <div className="absolute -top-6 text-[10px] font-bold text-orange-900 bg-white/80 px-1 rounded border border-orange-200 shadow-sm whitespace-nowrap">
          {data.label as React.ReactNode}
        </div>
      </div>
    </TooltipWrapper>
  );
});

// Flow Boundary
export const FlowBoundaryNode = memo(({ id, data, selected }: NodeProps) => {
  const node = useNetworkStore(state => state.nodes.find(n => n.id === id));
  const displayData = node ? node.data : data;

  return (
    <TooltipWrapper content={<DataList data={displayData} title="Flow Boundary Properties" />}>
      <div className={clsx(
        "p-2 rounded border shadow-sm flex items-center gap-2 transition-all bg-green-50 group",
        selected ? "border-green-500 ring-1 ring-green-500/30" : "border-green-400"
      )}>
        <Handle type="target" id="t-top" position={Position.Top} className={clsx(HandleStyle, "!bg-green-500")} />
        <Handle type="source" id="s-top" position={Position.Top} className={clsx(HandleStyle, "!bg-green-500")} />
        <Handle type="target" id="t-bottom" position={Position.Bottom} className={clsx(HandleStyle, "!bg-green-500")} />
        <Handle type="source" id="s-bottom" position={Position.Bottom} className={clsx(HandleStyle, "!bg-green-500")} />
        <Handle type="target" id="t-left" position={Position.Left} className={clsx(HandleStyle, "!bg-green-500")} />
        <Handle type="source" id="s-left" position={Position.Left} className={clsx(HandleStyle, "!bg-green-500")} />
        <Handle type="target" id="t-right" position={Position.Right} className={clsx(HandleStyle, "!bg-green-500")} />
        <Handle type="source" id="s-right" position={Position.Right} className={clsx(HandleStyle, "!bg-green-500")} />
        <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-green-600 border-b-[6px] border-b-transparent"></div>
        <div>
          <div className="text-xs font-bold text-green-800">{data.label as React.ReactNode}</div>
          <div className="text-[10px] text-green-600">Q-Sched: {data.scheduleNumber as React.ReactNode}</div>
        </div>
      </div>
    </TooltipWrapper>
  );
});
