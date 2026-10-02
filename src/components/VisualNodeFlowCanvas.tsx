import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Rocket,
  ListOrdered,
  Mail,
  FileText,
  UserCheck,
  Plus,
  Trash2,
  Edit3,
  Play,
  Copy,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Lock,
  Unlock,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  Smartphone,
  X,
  Sparkles,
  HelpCircle,
  Download,
} from 'lucide-react';
import type { BotFlow, BotStep, BotButton } from '../types/index.ts';

export interface VisualNode {
  id: string;
  type: 'start' | 'question_button' | 'message' | 'media' | 'agent';
  title: string;
  body: string;
  x: number;
  y: number;
  headerText?: string;
  footer?: string;
  buttons?: Array<{ id: string; title: string; targetNodeId?: string }>;
  mediaType?: 'document' | 'image' | 'video' | 'audio';
  mediaUrl?: string;
  mediaFileName?: string;
  targetNodeId?: string; // for linear next step (e.g. from start or message node)
}

export interface VisualConnection {
  id: string;
  fromNodeId: string;
  fromPortId: string; // e.g. 'output' or button id 'btn_...'
  toNodeId: string;
}

interface VisualNodeFlowCanvasProps {
  initialFlow: BotFlow;
  onSaveFlow: (flow: BotFlow) => Promise<void>;
  onTestInSimulator?: (flow: BotFlow) => void;
  onClose?: () => void;
}

export const VisualNodeFlowCanvas: React.FC<VisualNodeFlowCanvasProps> = ({
  initialFlow,
  onSaveFlow,
  onTestInSimulator,
  onClose,
}) => {
  const [flowName, setFlowName] = useState(initialFlow.name || 'CATALOGUE');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isLive, setIsLive] = useState(initialFlow.enabled ?? true);
  const [saving, setSaving] = useState(false);

  // Canvas Pan & Zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 80, y: 120 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isLocked, setIsLocked] = useState(false);

  // Convert BotFlow steps into visual nodes
  const [nodes, setNodes] = useState<VisualNode[]>(() => {
    // If flow has existing steps, map them with intelligent coordinates
    if (initialFlow.steps && initialFlow.steps.length > 0) {
      const mappedNodes: VisualNode[] = [];

      // 1. Always create a Start Trigger node
      mappedNodes.push({
        id: 'node_start',
        type: 'start',
        title: 'Start Trigger',
        body: 'Tap below to add or edit event action.',
        x: 100,
        y: 200,
        targetNodeId: initialFlow.initialStepId || initialFlow.steps[0]?.id,
      });

      // 2. Map steps
      initialFlow.steps.forEach((st, idx) => {
        const col = Math.floor(idx / 2) + 1;
        const row = idx % 2;
        mappedNodes.push({
          id: st.id,
          type:
            st.type === 'interactive_button'
              ? 'question_button'
              : st.type === 'media'
              ? 'media'
              : st.type === 'agent_transfer'
              ? 'agent'
              : 'message',
          title: st.title || `Step ${idx + 1}`,
          body: st.body || '',
          x: 100 + col * 360,
          y: 140 + row * 240,
          headerText: st.headerText,
          footer: st.footer,
          buttons: st.buttons?.map((b) => ({
            id: b.id,
            title: b.title,
            targetNodeId: b.targetStepId,
          })),
          mediaType: st.mediaType || 'document',
          mediaUrl: st.mediaUrl,
          mediaFileName: st.mediaFileName,
          targetNodeId: st.autoNextStepId,
        });
      });

      return mappedNodes;
    }

    // Clean fresh blank canvas for new flow
    return [
      {
        id: 'node_start',
        type: 'start',
        title: 'Start Trigger',
        body: 'Tap below to add or edit event action.',
        x: 120,
        y: 220,
        targetNodeId: 'node_step_1',
      },
      {
        id: 'node_step_1',
        type: 'question_button',
        title: 'Step 1: Greeting',
        body: 'Welcome to our WhatsApp service! Please select an option:',
        x: 480,
        y: 200,
        buttons: [{ id: 'btn_1', title: 'Option 1' }],
      },
    ];
  });

  // Selected node for visual highlight (glowing border) and editing
  const [selectedNodeId, setSelectedNodeId] = useState<string>('node_q1');
  const [editingNode, setEditingNode] = useState<VisualNode | null>(null);

  // Interactive Node Dragging state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Interactive Wire Connecting state
  const [connectingSource, setConnectingSource] = useState<{
    nodeId: string;
    portId: string;
    startX: number;
    startY: number;
  } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Add Node FAB menu
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Build connections list dynamically from nodes
  const connections: VisualConnection[] = [];
  nodes.forEach((n) => {
    // 1. Direct next step (start or message node)
    if (n.targetNodeId && nodes.some((target) => target.id === n.targetNodeId)) {
      connections.push({
        id: `conn_${n.id}_output_${n.targetNodeId}`,
        fromNodeId: n.id,
        fromPortId: 'output',
        toNodeId: n.targetNodeId,
      });
    }

    // 2. Buttons in question_button node
    if (n.buttons) {
      n.buttons.forEach((btn) => {
        if (btn.targetNodeId && nodes.some((target) => target.id === btn.targetNodeId)) {
          connections.push({
            id: `conn_${n.id}_${btn.id}_${btn.targetNodeId}`,
            fromNodeId: n.id,
            fromPortId: btn.id,
            toNodeId: btn.targetNodeId,
          });
        }
      });
    }
  });

  // Handle Canvas Panning
  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    // Only pan if clicking canvas background (not inside a node)
    if ((e.target as HTMLElement).closest('.flow-node')) return;
    if (isLocked) return;

    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMoveCanvas = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }

    if (connectingSource && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const currentX = (e.clientX - rect.left - pan.x) / zoom;
      const currentY = (e.clientY - rect.top - pan.y) / zoom;
      setMousePos({ x: currentX, y: currentY });
    }

    if (draggingNodeId && !isLocked) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const currentX = (e.clientX - rect.left - pan.x) / zoom;
      const currentY = (e.clientY - rect.top - pan.y) / zoom;

      setNodes((prev) =>
        prev.map((n) =>
          n.id === draggingNodeId
            ? { ...n, x: Math.round(currentX - dragOffset.x), y: Math.round(currentY - dragOffset.y) }
            : n
        )
      );
    }
  };

  const handleMouseUpCanvas = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
    if (connectingSource) {
      setConnectingSource(null);
    }
  };

  // Node Drag Start
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (isLocked) return;
    setSelectedNodeId(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentX = (e.clientX - rect.left - pan.x) / zoom;
    const currentY = (e.clientY - rect.top - pan.y) / zoom;

    setDragOffset({
      x: currentX - node.x,
      y: currentY - node.y,
    });
    setDraggingNodeId(nodeId);
  };

  // Connecting Ports
  const handleStartConnection = (e: React.MouseEvent, nodeId: string, portId: string, portX: number, portY: number) => {
    e.stopPropagation();
    setConnectingSource({
      nodeId,
      portId,
      startX: portX,
      startY: portY,
    });
    setMousePos({ x: portX, y: portY });
  };

  const handleEndConnection = (e: React.MouseEvent, targetNodeId: string) => {
    e.stopPropagation();
    if (!connectingSource) return;
    if (connectingSource.nodeId === targetNodeId) {
      setConnectingSource(null);
      return;
    }

    // Connect source port to target node!
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== connectingSource.nodeId) return n;

        // If from button
        if (n.buttons && n.buttons.some((b) => b.id === connectingSource.portId)) {
          return {
            ...n,
            buttons: n.buttons.map((b) =>
              b.id === connectingSource.portId ? { ...b, targetNodeId } : b
            ),
          };
        }

        // Direct output (e.g. from start trigger or message)
        return {
          ...n,
          targetNodeId,
        };
      })
    );

    setConnectingSource(null);
  };

  const handleDeleteConnection = (conn: VisualConnection) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== conn.fromNodeId) return n;
        if (n.buttons) {
          return {
            ...n,
            buttons: n.buttons.map((b) =>
              b.id === conn.fromPortId ? { ...b, targetNodeId: undefined } : b
            ),
          };
        }
        if (n.targetNodeId === conn.toNodeId) {
          return { ...n, targetNodeId: undefined };
        }
        return n;
      })
    );
  };

  // Add Node from Palette
  const handleAddNode = (type: VisualNode['type']) => {
    const newId = `node_${Date.now()}`;
    const titles: Record<string, string> = {
      question_button: 'Question Button',
      message: 'Message',
      media: 'Media / PDF Catalog',
      agent: 'Agent Handover',
    };

    const newNode: VisualNode = {
      id: newId,
      type,
      title: titles[type] || 'New Step',
      body: type === 'question_button' ? 'Select an option below:' : 'Thank you for your message.',
      x: Math.round((-pan.x + 400) / zoom),
      y: Math.round((-pan.y + 300) / zoom),
      buttons:
        type === 'question_button'
          ? [
              { id: `btn_${Date.now()}_1`, title: 'Option 1' },
              { id: `btn_${Date.now()}_2`, title: 'Option 2' },
            ]
          : undefined,
      mediaType: type === 'media' ? 'document' : undefined,
      mediaFileName: type === 'media' ? 'Catalog_Document.pdf' : undefined,
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newId);
    setIsAddMenuOpen(false);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (nodeId === 'node_start') {
      alert('Start Trigger node cannot be deleted.');
      return;
    }
    setNodes((prev) =>
      prev
        .filter((n) => n.id !== nodeId)
        .map((n) => ({
          ...n,
          targetNodeId: n.targetNodeId === nodeId ? undefined : n.targetNodeId,
          buttons: n.buttons?.map((b) =>
            b.targetNodeId === nodeId ? { ...b, targetNodeId: undefined } : b
          ),
        }))
    );
    if (selectedNodeId === nodeId) {
      setSelectedNodeId('node_start');
    }
  };

  // Save Flow to Backend / Firestore
  const handleSaveAndDeploy = async () => {
    setSaving(true);
    try {
      // 1. Find start node and its initial target
      const startNode = nodes.find((n) => n.type === 'start');
      const initialStepId = startNode?.targetNodeId || nodes.find((n) => n.id !== 'node_start')?.id || 'step_1';

      // 2. Map visual nodes back to BotStep[]
      const steps: BotStep[] = nodes
        .filter((n) => n.type !== 'start')
        .map((n) => ({
          id: n.id,
          title: n.title,
          type:
            n.type === 'question_button'
              ? 'interactive_button'
              : n.type === 'media'
              ? 'media'
              : n.type === 'agent'
              ? 'agent_transfer'
              : 'text',
          headerType: n.headerText ? 'text' : 'none',
          headerText: n.headerText,
          body: n.body,
          footer: n.footer,
          buttons: n.buttons?.map((b) => ({
            id: b.id,
            title: b.title,
            action: b.targetNodeId ? 'next_step' : 'assign_agent',
            targetStepId: b.targetNodeId,
          })),
          mediaType: n.mediaType,
          mediaUrl: n.mediaUrl,
          mediaFileName: n.mediaFileName,
          autoNextStepId: n.targetNodeId,
        }));

      const updatedFlow: BotFlow = {
        ...initialFlow,
        name: flowName.trim(),
        initialStepId,
        steps,
        enabled: isLive,
        updatedAt: new Date().toISOString(),
      };

      await onSaveFlow(updatedFlow);
    } finally {
      setSaving(false);
    }
  };

  // Recenter / Fit View
  const handleRecenter = () => {
    setZoom(1);
    setPan({ x: 80, y: 120 });
  };

  // Helper to calculate port coordinates for connection curves
  const getNodePortCoords = (nodeId: string, portId: string, isInput = false) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };

    const nodeWidth = 240;
    if (isInput) {
      return { x: node.x, y: node.y + 40 };
    }

    if (portId === 'output') {
      return { x: node.x + nodeWidth, y: node.y + 40 };
    }

    // Button port
    if (node.buttons) {
      const bIdx = node.buttons.findIndex((b) => b.id === portId);
      const buttonBaseY = node.y + 110 + bIdx * 34;
      return { x: node.x + nodeWidth - 12, y: buttonBaseY };
    }

    return { x: node.x + nodeWidth, y: node.y + 50 };
  };

  return (
    <div className="relative w-full h-[85vh] sm:h-[88vh] bg-[#f8fafc] dark:bg-[#090d16] rounded-3xl border border-neutral-300 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col select-none">
      {/* 1. TOP HEADER TOOLBAR (Matching Reference Image) */}
      <div className="h-16 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 flex items-center justify-between z-20 shrink-0">
        {/* Left: Flow Name Pill & Controls */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 font-bold text-xs shadow-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            {isEditingName ? (
              <input
                type="text"
                autoFocus
                value={flowName}
                onBlur={() => setIsEditingName(false)}
                onChange={(e) => setFlowName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                className="bg-transparent border-b border-emerald-500 text-xs font-bold focus:outline-hidden px-1"
              />
            ) : (
              <span onClick={() => setIsEditingName(true)} className="cursor-pointer">
                {flowName}
              </span>
            )}
            <button
              onClick={() => setIsEditingName(true)}
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-0.5"
            >
              <Edit3 className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                const cloned = prompt('Duplicate Flow as:', `${flowName} Copy`);
                if (cloned) setFlowName(cloned);
              }}
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-0.5"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                if (onTestInSimulator) {
                  const startNode = nodes.find((n) => n.type === 'start');
                  const initialStepId =
                    startNode?.targetNodeId ||
                    nodes.find((n) => n.id !== 'node_start')?.id ||
                    'step_1';
                  const mappedSteps: BotStep[] = nodes
                    .filter((n) => n.type !== 'start')
                    .map((n) => ({
                      id: n.id,
                      title: n.title,
                      type:
                        n.type === 'question_button'
                          ? 'interactive_button'
                          : n.type === 'media'
                          ? 'media'
                          : n.type === 'agent'
                          ? 'agent_transfer'
                          : 'text',
                      headerType: n.headerText ? 'text' : 'none',
                      headerText: n.headerText,
                      body: n.body,
                      footer: n.footer,
                      buttons: n.buttons?.map((b) => ({
                        id: b.id,
                        title: b.title,
                        action: b.targetNodeId ? 'next_step' : 'assign_agent',
                        targetStepId: b.targetNodeId,
                      })),
                      mediaType: n.mediaType,
                      mediaUrl: n.mediaUrl,
                      mediaFileName: n.mediaFileName,
                      autoNextStepId: n.targetNodeId,
                    }));

                  onTestInSimulator({
                    ...initialFlow,
                    name: flowName,
                    initialStepId,
                    steps: mappedSteps,
                  });
                }
              }}
              title="Test Flow Live in Phone Simulator"
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-0.5"
            >
              <Play className="w-3 h-3 fill-current" />
            </button>
          </div>
        </div>

        {/* Right: Set Live Button & Close */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSaveAndDeploy}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-neutral-600 hover:bg-neutral-700 text-white font-semibold text-xs shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{saving ? 'Deploying...' : 'Set Live'}</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. DOTTED GRID CANVAS AREA */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDownCanvas}
        onMouseMove={handleMouseMoveCanvas}
        onMouseUp={handleMouseUpCanvas}
        className="flex-1 w-full h-full relative overflow-hidden cursor-grab active:cursor-grabbing bg-[radial-gradient(#9ca3af_1.2px,transparent_1.2px)] dark:bg-[radial-gradient(#374151_1.2px,transparent_1.2px)] [background-size:24px_24px]"
      >
        {/* Transform Container (Pan & Zoom) */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: '100%',
            height: '100%',
            position: 'absolute',
          }}
        >
          {/* SVG CONNECTION WIRES (Dashed Curves Matching Reference Image) */}
          <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none z-0 overflow-visible">
            {connections.map((conn) => {
              const start = getNodePortCoords(conn.fromNodeId, conn.fromPortId, false);
              const end = getNodePortCoords(conn.toNodeId, 'input', true);

              // Smooth bezier curve control points
              const dx = Math.abs(end.x - start.x) * 0.5;
              const pathData = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;

              return (
                <g key={conn.id} className="cursor-pointer pointer-events-auto">
                  {/* Invisible thicker stroke for easy clicking/hovering */}
                  <path
                    d={pathData}
                    stroke="transparent"
                    strokeWidth={14}
                    fill="none"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete this connection wire?')) {
                        handleDeleteConnection(conn);
                      }
                    }}
                  />
                  {/* Real dashed line */}
                  <path
                    d={pathData}
                    stroke="#9ca3af"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    fill="none"
                    className="hover:stroke-rose-500 transition-colors"
                  />
                </g>
              );
            })}

            {/* Live dragging connection curve */}
            {connectingSource && (
              <path
                d={`M ${connectingSource.startX} ${connectingSource.startY} C ${
                  connectingSource.startX + Math.abs(mousePos.x - connectingSource.startX) * 0.5
                } ${connectingSource.startY}, ${
                  mousePos.x - Math.abs(mousePos.x - connectingSource.startX) * 0.5
                } ${mousePos.y}, ${mousePos.x} ${mousePos.y}`}
                stroke="#10b981"
                strokeWidth={2.5}
                strokeDasharray="4 4"
                fill="none"
              />
            )}
          </svg>

          {/* VISUAL FLOW NODES (Cards matching user's reference) */}
          {nodes.map((node) => {
            const isSelected = selectedNodeId === node.id;

            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                style={{
                  transform: `translate(${node.x}px, ${node.y}px)`,
                  width: '240px',
                }}
                className={`flow-node absolute rounded-2xl bg-white dark:bg-neutral-900 border transition-shadow text-xs shadow-md ${
                  isSelected
                    ? 'border-cyan-400 ring-4 ring-cyan-400/20 shadow-xl'
                    : 'border-neutral-200 dark:border-neutral-800'
                }`}
              >
                {/* Node Header */}
                <div
                  className={`px-3 py-2 rounded-t-2xl border-b flex items-center justify-between ${
                    node.type === 'start'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-300'
                      : node.type === 'question_button'
                      ? 'bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 text-neutral-800 dark:text-neutral-200'
                      : node.type === 'message'
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 text-emerald-900 dark:text-emerald-200'
                      : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 text-indigo-800'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 font-bold">
                    {node.type === 'start' ? (
                      <Rocket className="w-3.5 h-3.5 text-emerald-600" />
                    ) : node.type === 'question_button' ? (
                      <ListOrdered className="w-3.5 h-3.5 text-emerald-600" />
                    ) : node.type === 'media' ? (
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <Mail className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    <span>{node.type === 'question_button' ? 'Question Button' : node.title}</span>
                  </div>

                  {node.type !== 'start' && (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingNode(node);
                        }}
                        className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-0.5"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNode(node.id);
                        }}
                        className="text-neutral-400 hover:text-rose-600 p-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Left Input Connector Dot (except on Start Node) */}
                {node.type !== 'start' && (
                  <div
                    onMouseUp={(e) => handleEndConnection(e, node.id)}
                    className="absolute -left-2.5 top-9 w-5 h-5 rounded-full bg-white dark:bg-neutral-800 border-2 border-emerald-500 hover:scale-125 transition-transform flex items-center justify-center cursor-pointer z-10 shadow-xs"
                    title="Connect input port here"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>
                )}

                {/* Right Output Connector Dot (on Start or Message nodes) */}
                {(node.type === 'start' || node.type === 'message' || node.type === 'media') && (
                  <div
                    onMouseDown={(e) =>
                      handleStartConnection(e, node.id, 'output', node.x + 240, node.y + 40)
                    }
                    className="absolute -right-2.5 top-9 w-5 h-5 rounded-full bg-white dark:bg-neutral-800 border-2 border-emerald-500 hover:scale-125 transition-transform flex items-center justify-center cursor-pointer z-10 shadow-xs"
                    title="Drag or click to connect to next node"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>
                )}

                {/* Node Body Content */}
                <div className="p-3 space-y-2">
                  {node.type === 'start' ? (
                    <div className="space-y-2 text-center py-1">
                      <p className="text-[11px] text-neutral-500">{node.body}</p>
                      <div className="py-1.5 px-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 flex items-center justify-center space-x-1">
                        <Sparkles className="w-3 h-3 text-emerald-500" />
                        <span>⚡ On Event</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Title display */}
                      <div className="text-[10px] text-neutral-400 font-mono">
                        Title : <span className="font-bold text-neutral-700 dark:text-neutral-300">{node.title}</span>
                      </div>

                      {/* Header text or link preview */}
                      {node.headerText && (
                        <div className="text-[10px] font-bold text-neutral-800 dark:text-neutral-200">
                          {node.headerText}
                        </div>
                      )}

                      {/* Message body preview */}
                      <div className="p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 text-[10px] leading-relaxed text-neutral-700 dark:text-neutral-300 max-h-24 overflow-y-auto whitespace-pre-wrap">
                        {node.body}
                      </div>

                      {/* Interactive Buttons (Each with its own output connector dot!) */}
                      {node.type === 'question_button' && node.buttons && (
                        <div className="space-y-1.5 pt-1">
                          {node.buttons.map((btn, bIdx) => (
                            <div
                              key={btn.id}
                              className="relative group py-1.5 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-emerald-500 bg-white dark:bg-neutral-800 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-between shadow-2xs transition-colors"
                            >
                              <span className="truncate pr-4">{btn.title}</span>

                              {/* Button Output Connector Dot */}
                              <div
                                onMouseDown={(e) => {
                                  const btnY = node.y + 110 + bIdx * 34;
                                  handleStartConnection(e, node.id, btn.id, node.x + 228, btnY);
                                }}
                                className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500 hover:scale-125 transition-transform flex items-center justify-center cursor-pointer bg-white shrink-0"
                                title={`Connect "${btn.title}" to target node`}
                              >
                                <div className="w-1 h-1 rounded-full bg-emerald-500" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Media Card view */}
                      {node.type === 'media' && (
                        <div className="p-2 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-[10px] space-y-1">
                          <p className="font-bold text-indigo-700">📄 {node.mediaFileName || 'Catalog.pdf'}</p>
                          <p className="text-neutral-500 truncate">{node.mediaUrl || 'PDF Document'}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. BOTTOM-LEFT VIEW CONTROLS (Matching Reference Image) */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center space-x-1.5 bg-white dark:bg-neutral-900 p-1.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-lg text-neutral-700 dark:text-neutral-300">
        <button
          onClick={handleRecenter}
          title="Fit & Recenter View"
          className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((prev) => Math.min(prev + 0.15, 2.0))}
          title="Zoom In"
          className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleRecenter}
          title="Reset to 100%"
          className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((prev) => Math.max(prev - 0.15, 0.4))}
          title="Zoom Out"
          className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsLocked(!isLocked)}
          title={isLocked ? 'Unlock Canvas' : 'Lock Canvas'}
          className={`p-2 rounded-xl transition-colors cursor-pointer ${
            isLocked ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
        </button>
      </div>

      {/* 4. TOP-RIGHT FLOATING ACTION BUTTON (Green FAB with + Menu) */}
      <div className="absolute top-20 right-6 z-20">
        <button
          onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
          className="w-12 h-12 rounded-full bg-[#00A884] hover:bg-[#008f6f] text-white shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          title="Add New Node to Canvas"
        >
          <Plus className={`w-6 h-6 transition-transform ${isAddMenuOpen ? 'rotate-45' : ''}`} />
        </button>

        {/* Add Node Dropdown Menu */}
        {isAddMenuOpen && (
          <div className="mt-2 w-56 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl p-2 space-y-1 text-xs animate-fadeIn">
            <p className="px-2.5 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              Add Node to Flow
            </p>
            <button
              onClick={() => handleAddNode('question_button')}
              className="w-full p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left font-semibold flex items-center space-x-2 text-neutral-800 dark:text-neutral-200 cursor-pointer"
            >
              <ListOrdered className="w-4 h-4 text-emerald-600" />
              <span>🔘 Question Button</span>
            </button>
            <button
              onClick={() => handleAddNode('message')}
              className="w-full p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left font-semibold flex items-center space-x-2 text-neutral-800 dark:text-neutral-200 cursor-pointer"
            >
              <Mail className="w-4 h-4 text-emerald-600" />
              <span>✉️ Plain Message</span>
            </button>
            <button
              onClick={() => handleAddNode('media')}
              className="w-full p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left font-semibold flex items-center space-x-2 text-neutral-800 dark:text-neutral-200 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>📄 PDF Catalog / Media</span>
            </button>
            <button
              onClick={() => handleAddNode('agent')}
              className="w-full p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left font-semibold flex items-center space-x-2 text-neutral-800 dark:text-neutral-200 cursor-pointer"
            >
              <UserCheck className="w-4 h-4 text-amber-600" />
              <span>👤 Live Agent Handover</span>
            </button>
          </div>
        )}
      </div>

      {/* 5. NODE PROPERTY INSPECTOR MODAL */}
      {editingNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 border-neutral-100 dark:border-neutral-800">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-emerald-600" />
                <span>Edit Node: {editingNode.title}</span>
              </h3>
              <button
                onClick={() => setEditingNode(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  Node Title
                </label>
                <input
                  type="text"
                  value={editingNode.title}
                  onChange={(e) => setEditingNode({ ...editingNode, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-semibold"
                />
              </div>

              {editingNode.type === 'question_button' && (
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                    Header (e.g. LINK)
                  </label>
                  <input
                    type="text"
                    value={editingNode.headerText || ''}
                    onChange={(e) => setEditingNode({ ...editingNode, headerText: e.target.value })}
                    placeholder="e.g. LINK or CATALOGUE"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  WhatsApp Message Body
                </label>
                <textarea
                  rows={4}
                  value={editingNode.body}
                  onChange={(e) => setEditingNode({ ...editingNode, body: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-[11px]"
                />
              </div>

              {/* Edit Buttons */}
              {editingNode.type === 'question_button' && (
                <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      Buttons (Max 3)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const btns = editingNode.buttons || [];
                        if (btns.length >= 3) return alert('Maximum 3 buttons allowed');
                        setEditingNode({
                          ...editingNode,
                          buttons: [
                            ...btns,
                            { id: `btn_${Date.now()}`, title: `Button ${btns.length + 1}` },
                          ],
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-medium cursor-pointer"
                    >
                      + Add Button
                    </button>
                  </div>

                  <div className="space-y-2">
                    {editingNode.buttons?.map((b, idx) => (
                      <div key={b.id} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={b.title}
                          maxLength={20}
                          onChange={(e) => {
                            const updated = [...(editingNode.buttons || [])];
                            updated[idx] = { ...updated[idx], title: e.target.value };
                            setEditingNode({ ...editingNode, buttons: updated });
                          }}
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = editingNode.buttons?.filter((_, i) => i !== idx);
                            setEditingNode({ ...editingNode, buttons: updated });
                          }}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Edit Media URL if media type */}
              {editingNode.type === 'media' && (
                <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <div className="space-y-1">
                    <label className="font-semibold text-neutral-700">PDF File Name</label>
                    <input
                      type="text"
                      value={editingNode.mediaFileName || ''}
                      onChange={(e) => setEditingNode({ ...editingNode, mediaFileName: e.target.value })}
                      placeholder="e.g. Catalog_2026.pdf"
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-neutral-700">PDF URL</label>
                    <input
                      type="url"
                      value={editingNode.mediaUrl || ''}
                      onChange={(e) => setEditingNode({ ...editingNode, mediaUrl: e.target.value })}
                      placeholder="https://example.com/catalog.pdf"
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-[11px]"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setEditingNode(null)}
                className="px-4 py-2 rounded-xl border cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setNodes((prev) =>
                    prev.map((n) => (n.id === editingNode.id ? editingNode : n))
                  );
                  setEditingNode(null);
                }}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-medium cursor-pointer"
              >
                Update Node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
