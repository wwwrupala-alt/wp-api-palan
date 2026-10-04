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
  Check,
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
  Link2,
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
  buttons?: Array<{ id: string; title: string; targetNodeId?: string; targetNodeIds?: string[] }>;
  mediaType?: 'document' | 'image' | 'video' | 'audio';
  mediaUrl?: string;
  mediaFileName?: string;
  targetNodeId?: string; // for linear next step (e.g. from start or message node)
  targetNodeIds?: string[]; // for multiple next steps
}

export interface VisualConnection {
  id: string;
  fromNodeId: string;
  fromPortId: string; // e.g. 'output' or button id 'btn_...'
  toNodeId: string;
}

export interface ButtonPalette {
  name: string;
  stroke: string;
  border: string;
  borderLeft: string;
  bg: string;
  text: string;
  badgeBg: string;
  dotBg: string;
}

export const BUTTON_PALETTES: ButtonPalette[] = [
  {
    name: 'purple',
    stroke: '#8b5cf6',
    border: 'border-purple-300 dark:border-purple-700',
    borderLeft: 'border-l-purple-500',
    bg: 'bg-purple-50/60 dark:bg-purple-950/30',
    text: 'text-purple-700 dark:text-purple-300',
    badgeBg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border-purple-300 dark:border-purple-700',
    dotBg: 'bg-purple-500 border-purple-600',
  },
  {
    name: 'blue',
    stroke: '#0284c7',
    border: 'border-sky-300 dark:border-sky-700',
    borderLeft: 'border-l-sky-500',
    bg: 'bg-sky-50/60 dark:bg-sky-950/30',
    text: 'text-sky-700 dark:text-sky-300',
    badgeBg: 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200 border-sky-300 dark:border-sky-700',
    dotBg: 'bg-sky-500 border-sky-600',
  },
  {
    name: 'amber',
    stroke: '#ea580c',
    border: 'border-amber-300 dark:border-amber-700',
    borderLeft: 'border-l-amber-500',
    bg: 'bg-amber-50/60 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-300',
    badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border-amber-300 dark:border-amber-700',
    dotBg: 'bg-amber-500 border-amber-600',
  },
  {
    name: 'rose',
    stroke: '#e11d48',
    border: 'border-rose-300 dark:border-rose-700',
    borderLeft: 'border-l-rose-500',
    bg: 'bg-rose-50/60 dark:bg-rose-950/30',
    text: 'text-rose-700 dark:text-rose-300',
    badgeBg: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 border-rose-300 dark:border-rose-700',
    dotBg: 'bg-rose-500 border-rose-600',
  },
  {
    name: 'teal',
    stroke: '#0d9488',
    border: 'border-teal-300 dark:border-teal-700',
    borderLeft: 'border-l-teal-500',
    bg: 'bg-teal-50/60 dark:bg-teal-950/30',
    text: 'text-teal-700 dark:text-teal-300',
    badgeBg: 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200 border-teal-300 dark:border-teal-700',
    dotBg: 'bg-teal-500 border-teal-600',
  },
];

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
            targetNodeIds: b.targetStepIds || (b.targetStepId ? [b.targetStepId] : []),
          })),
          mediaType: st.mediaType || 'document',
          mediaUrl: st.mediaUrl,
          mediaFileName: st.mediaFileName,
          targetNodeId: st.autoNextStepId,
          targetNodeIds: st.autoNextStepIds || (st.autoNextStepId ? [st.autoNextStepId] : []),
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

  // Quick Multi-Node link popover on Question Button card
  const [openButtonLinkPopover, setOpenButtonLinkPopover] = useState<{ nodeId: string; buttonId: string } | null>(null);

  // Hover highlighting for interactive connection tracing
  const [hoveredButtonKey, setHoveredButtonKey] = useState<{ nodeId: string; buttonId: string } | null>(null);
  const [hoveredConnId, setHoveredConnId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Build connections list dynamically from nodes (supports ONE BUTTON TO MULTIPLE NODES)
  const connections: VisualConnection[] = [];
  nodes.forEach((n) => {
    // 1. Direct next step (start or message node)
    const nodeTargets = n.targetNodeIds || (n.targetNodeId ? [n.targetNodeId] : []);
    nodeTargets.forEach((targetId) => {
      if (nodes.some((target) => target.id === targetId)) {
        connections.push({
          id: `conn_${n.id}_output_${targetId}`,
          fromNodeId: n.id,
          fromPortId: 'output',
          toNodeId: targetId,
        });
      }
    });

    // 2. Buttons in question_button node (ONE BUTTON CAN CONNECT TO MULTIPLE NODES!)
    if (n.buttons) {
      n.buttons.forEach((btn) => {
        const btnTargets = btn.targetNodeIds || (btn.targetNodeId ? [btn.targetNodeId] : []);
        btnTargets.forEach((targetId) => {
          if (nodes.some((target) => target.id === targetId)) {
            connections.push({
              id: `conn_${n.id}_${btn.id}_${targetId}`,
              fromNodeId: n.id,
              fromPortId: btn.id,
              toNodeId: targetId,
            });
          }
        });
      });
    }
  });

  // Mobile Touch & Pinch Zoom Refs
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // PC Mouse Wheel Zoom Listener (passive: false for reliable e.preventDefault())
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      setZoom((prev) => {
        const next = Math.min(2.5, Math.max(0.3, prev * factor));
        return parseFloat(next.toFixed(2));
      });
    };

    el.addEventListener('wheel', onWheelHandler, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheelHandler);
    };
  }, []);

  // Handle Canvas Panning (Desktop Mouse)
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

  // Mobile Touch Handlers (Pinch-to-zoom & single finger panning)
  const handleTouchStartCanvas = (e: React.TouchEvent) => {
    if (isLocked) return;
    if ((e.target as HTMLElement).closest('.flow-node')) return;

    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoom;
    } else if (e.touches.length === 1) {
      touchStartPosRef.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      };
    }
  };

  const handleTouchMoveCanvas = (e: React.TouchEvent) => {
    if (isLocked) return;

    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = currentDist / touchStartDistRef.current;
      const nextZoom = Math.min(2.5, Math.max(0.3, touchStartZoomRef.current * ratio));
      setZoom(parseFloat(nextZoom.toFixed(2)));
    } else if (e.touches.length === 1 && touchStartPosRef.current) {
      setPan({
        x: e.touches[0].clientX - touchStartPosRef.current.x,
        y: e.touches[0].clientY - touchStartPosRef.current.y,
      });
    }

    if (draggingNodeId && !isLocked && e.touches.length === 1 && containerRef.current) {
      const touch = e.touches[0];
      const rect = containerRef.current.getBoundingClientRect();
      const currentX = (touch.clientX - rect.left - pan.x) / zoom;
      const currentY = (touch.clientY - rect.top - pan.y) / zoom;

      setNodes((prev) =>
        prev.map((n) =>
          n.id === draggingNodeId
            ? { ...n, x: Math.round(currentX - dragOffset.x), y: Math.round(currentY - dragOffset.y) }
            : n
        )
      );
    }
  };

  const handleTouchEndCanvas = () => {
    touchStartDistRef.current = null;
    touchStartPosRef.current = null;
    setDraggingNodeId(null);
  };

  // Node Drag & Click to open Right-Side Editor (Desktop Mouse)
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Open Right-Side Node Editor automatically when clicking any node
    if (node.type !== 'start') {
      setEditingNode(node);
    }

    if (isLocked || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentX = (e.clientX - rect.left - pan.x) / zoom;
    const currentY = (e.clientY - rect.top - pan.y) / zoom;

    setDragOffset({
      x: currentX - node.x,
      y: currentY - node.y,
    });
    setDraggingNodeId(nodeId);
  };

  // Node Touch Start (Mobile)
  const handleNodeTouchStart = (e: React.TouchEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Open Right-Side Node Editor automatically when tapping any node
    if (node.type !== 'start') {
      setEditingNode(node);
    }

    if (isLocked || !containerRef.current || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = (touch.clientX - rect.left - pan.x) / zoom;
    const currentY = (touch.clientY - rect.top - pan.y) / zoom;

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

  const handleEndConnection = (e: React.MouseEvent | React.TouchEvent, targetNodeId: string) => {
    e.stopPropagation();
    if (!connectingSource) return;
    if (connectingSource.nodeId === targetNodeId) {
      setConnectingSource(null);
      return;
    }

    // Connect source port to target node (supports ONE BUTTON TO MULTIPLE NODES!)
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== connectingSource.nodeId) return n;

        // If from button (supports connecting to multiple target nodes)
        if (n.buttons && n.buttons.some((b) => b.id === connectingSource.portId)) {
          return {
            ...n,
            buttons: n.buttons.map((b) => {
              if (b.id !== connectingSource.portId) return b;
              const prevTargets = b.targetNodeIds || (b.targetNodeId ? [b.targetNodeId] : []);
              const newTargets = prevTargets.includes(targetNodeId) ? prevTargets : [...prevTargets, targetNodeId];
              return {
                ...b,
                targetNodeId: newTargets[0],
                targetNodeIds: newTargets,
              };
            }),
          };
        }

        // Direct output (e.g. from start trigger or message)
        const prevTargets = n.targetNodeIds || (n.targetNodeId ? [n.targetNodeId] : []);
        const newTargets = prevTargets.includes(targetNodeId) ? prevTargets : [...prevTargets, targetNodeId];
        return {
          ...n,
          targetNodeId: newTargets[0],
          targetNodeIds: newTargets,
        };
      })
    );

    // Keep editingNode in sync if open
    if (editingNode && editingNode.id === connectingSource.nodeId) {
      setEditingNode((prevEditing) => {
        if (!prevEditing) return null;
        if (prevEditing.buttons && prevEditing.buttons.some((b) => b.id === connectingSource.portId)) {
          return {
            ...prevEditing,
            buttons: prevEditing.buttons.map((b) => {
              if (b.id !== connectingSource.portId) return b;
              const prevTargets = b.targetNodeIds || (b.targetNodeId ? [b.targetNodeId] : []);
              const newTargets = prevTargets.includes(targetNodeId) ? prevTargets : [...prevTargets, targetNodeId];
              return {
                ...b,
                targetNodeId: newTargets[0],
                targetNodeIds: newTargets,
              };
            }),
          };
        }
        return prevEditing;
      });
    }

    setConnectingSource(null);
  };

  const handleDeleteConnection = (conn: VisualConnection) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== conn.fromNodeId) return n;
        if (n.buttons) {
          return {
            ...n,
            buttons: n.buttons.map((b) => {
              if (b.id !== conn.fromPortId) return b;
              const prevTargets = b.targetNodeIds || (b.targetNodeId ? [b.targetNodeId] : []);
              const newTargets = prevTargets.filter((id) => id !== conn.toNodeId);
              return {
                ...b,
                targetNodeId: newTargets[0] || undefined,
                targetNodeIds: newTargets,
              };
            }),
          };
        }
        const prevTargets = n.targetNodeIds || (n.targetNodeId ? [n.targetNodeId] : []);
        const newTargets = prevTargets.filter((id) => id !== conn.toNodeId);
        return {
          ...n,
          targetNodeId: newTargets[0] || undefined,
          targetNodeIds: newTargets,
        };
      })
    );

    if (editingNode && editingNode.id === conn.fromNodeId && editingNode.buttons) {
      setEditingNode((prev) => {
        if (!prev || !prev.buttons) return prev;
        return {
          ...prev,
          buttons: prev.buttons.map((b) => {
            if (b.id !== conn.fromPortId) return b;
            const prevTargets = b.targetNodeIds || (b.targetNodeId ? [b.targetNodeId] : []);
            const newTargets = prevTargets.filter((id) => id !== conn.toNodeId);
            return {
              ...b,
              targetNodeId: newTargets[0] || undefined,
              targetNodeIds: newTargets,
            };
          }),
        };
      });
    }
  };

  // Toggle connection between a button and a target node (supports multi-linking)
  const toggleButtonTargetNode = (sourceNodeId: string, buttonId: string, targetNodeId: string) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== sourceNodeId || !n.buttons) return n;
        return {
          ...n,
          buttons: n.buttons.map((b) => {
            if (b.id !== buttonId) return b;
            const currentTargets = b.targetNodeIds || (b.targetNodeId ? [b.targetNodeId] : []);
            const newTargets = currentTargets.includes(targetNodeId)
              ? currentTargets.filter((id) => id !== targetNodeId)
              : [...currentTargets, targetNodeId];
            return {
              ...b,
              targetNodeId: newTargets[0] || undefined,
              targetNodeIds: newTargets,
            };
          }),
        };
      })
    );

    if (editingNode && editingNode.id === sourceNodeId && editingNode.buttons) {
      setEditingNode((prev) => {
        if (!prev || !prev.buttons) return prev;
        return {
          ...prev,
          buttons: prev.buttons.map((b) => {
            if (b.id !== buttonId) return b;
            const currentTargets = b.targetNodeIds || (b.targetNodeId ? [b.targetNodeId] : []);
            const newTargets = currentTargets.includes(targetNodeId)
              ? currentTargets.filter((id) => id !== targetNodeId)
              : [...currentTargets, targetNodeId];
            return {
              ...b,
              targetNodeId: newTargets[0] || undefined,
              targetNodeIds: newTargets,
            };
          }),
        };
      });
    }
  };

  // Bulk set target nodes for a button
  const setButtonTargetNodes = (sourceNodeId: string, buttonId: string, targetNodeIds: string[]) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== sourceNodeId || !n.buttons) return n;
        return {
          ...n,
          buttons: n.buttons.map((b) => {
            if (b.id !== buttonId) return b;
            return {
              ...b,
              targetNodeId: targetNodeIds[0] || undefined,
              targetNodeIds,
            };
          }),
        };
      })
    );

    if (editingNode && editingNode.id === sourceNodeId && editingNode.buttons) {
      setEditingNode((prev) => {
        if (!prev || !prev.buttons) return prev;
        return {
          ...prev,
          buttons: prev.buttons.map((b) => {
            if (b.id !== buttonId) return b;
            return {
              ...b,
              targetNodeId: targetNodeIds[0] || undefined,
              targetNodeIds,
            };
          }),
        };
      });
    }
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
      return;
    }
    setNodes((prev) =>
      prev
        .filter((n) => n.id !== nodeId)
        .map((n) => {
          const newTargetIds = (n.targetNodeIds || []).filter((id) => id !== nodeId);
          return {
            ...n,
            targetNodeId: n.targetNodeId === nodeId ? newTargetIds[0] || undefined : n.targetNodeId,
            targetNodeIds: newTargetIds,
            buttons: n.buttons?.map((b) => {
              const bTargets = (b.targetNodeIds || (b.targetNodeId ? [b.targetNodeId] : [])).filter((id) => id !== nodeId);
              return {
                ...b,
                targetNodeId: bTargets[0] || undefined,
                targetNodeIds: bTargets,
              };
            }),
          };
        })
    );
    if (selectedNodeId === nodeId) {
      setSelectedNodeId('node_start');
    }
    if (editingNode?.id === nodeId) {
      setEditingNode(null);
    }
  };

  // Duplicate / Copy a Node
  const handleDuplicateNode = (nodeId: string) => {
    const source = nodes.find((n) => n.id === nodeId);
    if (!source || source.type === 'start') return;

    const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const clonedButtons = source.buttons?.map((b, i) => ({
      ...b,
      id: `btn_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 5)}`,
      targetNodeId: undefined, // New duplicate node starts with unconnected buttons
    }));

    const newNode: VisualNode = {
      ...source,
      id: newId,
      title: `${source.title} (Copy)`,
      x: source.x + 35,
      y: source.y + 35,
      buttons: clonedButtons,
      targetNodeId: undefined,
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newId);
    setEditingNode(newNode);
  };

  // Live real-time node update helper
  const updateEditingNode = (patch: Partial<VisualNode>) => {
    if (!editingNode) return;
    const updated = { ...editingNode, ...patch };
    setEditingNode(updated);
    setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
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
          buttons: n.buttons?.map((b) => {
            const targets = b.targetNodeIds || (b.targetNodeId ? [b.targetNodeId] : []);
            return {
              id: b.id,
              title: b.title,
              action: targets.length > 0 ? 'next_step' : 'none',
              targetStepId: targets[0],
              targetStepIds: targets,
            };
          }),
          mediaType: n.mediaType,
          mediaUrl: n.mediaUrl,
          mediaFileName: n.mediaFileName,
          autoNextStepId: (n.targetNodeIds || (n.targetNodeId ? [n.targetNodeId] : []))[0],
          autoNextStepIds: n.targetNodeIds || (n.targetNodeId ? [n.targetNodeId] : []),
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
      return { x: node.x, y: node.y + 36 };
    }

    if (portId === 'output') {
      return { x: node.x + nodeWidth, y: node.y + 36 };
    }

    // Button port
    if (node.buttons) {
      const bIdx = node.buttons.findIndex((b) => b.id === portId);
      if (bIdx === -1) return { x: node.x + nodeWidth - 12, y: node.y + 110 };
      const hasIncoming = connections.some((c) => c.toNodeId === node.id);
      let topY = 36; // header height
      if (hasIncoming) topY += 26; // incoming badges bar
      topY += 12; // padding top
      topY += 16; // title text
      if (node.headerText) topY += 16;
      const bodyLines = Math.min(3, Math.max(1, (node.body || '').split('\n').length));
      topY += 22 + bodyLines * 14; // body container
      topY += 6; // space-y
      topY += bIdx * 35 + 17; // center of this button
      return { x: node.x + nodeWidth - 12, y: node.y + topY };
    }

    return { x: node.x + nodeWidth, y: node.y + 40 };
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
                      buttons: n.buttons?.map((b) => {
                        const targets = b.targetNodeIds || (b.targetNodeId ? [b.targetNodeId] : []);
                        return {
                          id: b.id,
                          title: b.title,
                          action: targets.length > 0 ? 'next_step' : 'none',
                          targetStepId: targets[0],
                          targetStepIds: targets,
                        };
                      }),
                      mediaType: n.mediaType,
                      mediaUrl: n.mediaUrl,
                      mediaFileName: n.mediaFileName,
                      autoNextStepId: (n.targetNodeIds || (n.targetNodeId ? [n.targetNodeId] : []))[0],
                      autoNextStepIds: n.targetNodeIds || (n.targetNodeId ? [n.targetNodeId] : []),
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

      {/* Active Connecting Indicator Banner */}
      {connectingSource && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-emerald-600 text-white px-4 py-2 rounded-2xl shadow-xl flex items-center space-x-3 text-xs font-bold animate-bounce">
          <span>🔗 Click or drop on ANY step card to connect (connects to multiple steps!)</span>
          <button
            type="button"
            onClick={() => setConnectingSource(null)}
            className="p-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. DOTTED GRID CANVAS AREA */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDownCanvas}
        onMouseMove={handleMouseMoveCanvas}
        onMouseUp={handleMouseUpCanvas}
        onTouchStart={handleTouchStartCanvas}
        onTouchMove={handleTouchMoveCanvas}
        onTouchEnd={handleTouchEndCanvas}
        className="flex-1 w-full h-full relative overflow-hidden cursor-grab active:cursor-grabbing bg-[radial-gradient(#9ca3af_1.2px,transparent_1.2px)] dark:bg-[radial-gradient(#374151_1.2px,transparent_1.2px)] [background-size:24px_24px] touch-none"
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
          {/* SVG CONNECTION WIRES (Color-Coded with Directional Arrowheads & Midpoint Pill Tags) */}
          <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none z-0 overflow-visible">
            <defs>
              {BUTTON_PALETTES.map((pal) => (
                <marker
                  key={pal.name}
                  id={`arrow-${pal.name}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={pal.stroke} />
                </marker>
              ))}
              <marker
                id="arrow-default"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#10b981" />
              </marker>
            </defs>

            {connections.map((conn) => {
              const start = getNodePortCoords(conn.fromNodeId, conn.fromPortId, false);
              const end = getNodePortCoords(conn.toNodeId, 'input', true);

              // Source and target information for clear tracing
              const sourceNode = nodes.find((n) => n.id === conn.fromNodeId);
              const targetNode = nodes.find((n) => n.id === conn.toNodeId);
              const button = sourceNode?.buttons?.find((b) => b.id === conn.fromPortId);
              const buttonIdx = sourceNode?.buttons?.findIndex((b) => b.id === conn.fromPortId) ?? 0;
              const palette =
                conn.fromPortId === 'output'
                  ? { name: 'default', stroke: '#10b981' }
                  : BUTTON_PALETTES[Math.max(0, buttonIdx) % BUTTON_PALETTES.length];

              const isHighlighted =
                (hoveredButtonKey &&
                  hoveredButtonKey.nodeId === conn.fromNodeId &&
                  hoveredButtonKey.buttonId === conn.fromPortId) ||
                hoveredConnId === conn.id;

              const isDimmed =
                (hoveredButtonKey || hoveredConnId) && !isHighlighted;

              // Smooth bezier curve control points
              const dx = Math.abs(end.x - start.x) * 0.5;
              const pathData = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
              const midX = (start.x + end.x) / 2;
              const midY = (start.y + end.y) / 2;

              return (
                <g
                  key={conn.id}
                  className={`cursor-pointer pointer-events-auto transition-opacity duration-200 ${
                    isDimmed ? 'opacity-20' : 'opacity-100'
                  }`}
                  onMouseEnter={() => setHoveredConnId(conn.id)}
                  onMouseLeave={() => setHoveredConnId(null)}
                >
                  {/* Invisible thicker stroke for easy clicking/hovering */}
                  <path
                    d={pathData}
                    stroke="transparent"
                    strokeWidth={18}
                    fill="none"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConnection(conn);
                    }}
                  />
                  {/* Real colored dashed wire with arrowhead marker */}
                  <path
                    d={pathData}
                    stroke={palette.stroke}
                    strokeWidth={isHighlighted ? 4 : 2.5}
                    strokeDasharray={isHighlighted ? '6 3' : '5 4'}
                    fill="none"
                    markerEnd={
                      palette.name === 'default'
                        ? 'url(#arrow-default)'
                        : `url(#arrow-${palette.name})`
                    }
                    className="transition-all duration-150"
                  />
                  {/* Mid-point Label Chip directly on the Wire */}
                  <foreignObject
                    x={midX - 100}
                    y={midY - 16}
                    width={200}
                    height={32}
                    className="overflow-visible pointer-events-auto"
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConnection(conn);
                      }}
                      className={`flex items-center justify-between px-2.5 py-1 rounded-full border-2 shadow-lg text-[9.5px] font-bold transition-all cursor-pointer backdrop-blur-md ${
                        isHighlighted
                          ? 'scale-110 ring-4 ring-emerald-500/50 bg-white dark:bg-neutral-900'
                          : 'bg-white/95 dark:bg-neutral-900/95 hover:scale-105'
                      }`}
                      style={{
                        borderColor: palette.stroke,
                        color: palette.stroke,
                      }}
                      title={`Wire: Button "${button?.title || sourceNode?.title}" ➔ Step "${targetNode?.title}". Click × to disconnect.`}
                    >
                      <span className="truncate max-w-[150px] select-none flex items-center space-x-1">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: palette.stroke }} />
                        <span className="truncate">
                          {button?.title ? `"${button.title}"` : sourceNode?.title} ➔ {targetNode?.title}
                        </span>
                      </span>
                      <span
                        className="w-4 h-4 ml-1 rounded-full bg-rose-500/15 text-rose-600 hover:bg-rose-500 hover:text-white flex items-center justify-center text-[10px] shrink-0 font-black transition-colors"
                        title="Disconnect wire"
                      >
                        ×
                      </span>
                    </div>
                  </foreignObject>
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
            const isConnectTarget =
              connectingSource &&
              connectingSource.nodeId !== node.id &&
              node.type !== 'start';

            return (
              <div
                key={node.id}
                onMouseDown={(e) => {
                  if (connectingSource) {
                    handleEndConnection(e, node.id);
                    return;
                  }
                  handleNodeMouseDown(e, node.id);
                }}
                onMouseUp={(e) => {
                  if (connectingSource) {
                    handleEndConnection(e, node.id);
                  }
                }}
                onTouchStart={(e) => {
                  if (connectingSource) {
                    handleEndConnection(e, node.id);
                    return;
                  }
                  handleNodeTouchStart(e, node.id);
                }}
                onClick={(e) => {
                  if (connectingSource) {
                    handleEndConnection(e, node.id);
                    return;
                  }
                  setSelectedNodeId(node.id);
                  if (node.type !== 'start') {
                    setEditingNode(node);
                  }
                }}
                style={{
                  transform: `translate(${node.x}px, ${node.y}px)`,
                  width: '240px',
                }}
                className={`flow-node absolute rounded-2xl bg-white dark:bg-neutral-900 border transition-all text-xs shadow-md cursor-pointer select-none ${
                  isConnectTarget
                    ? 'border-emerald-500 ring-4 ring-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/20 animate-pulse'
                    : isSelected
                    ? 'border-emerald-500 ring-4 ring-emerald-500/25 shadow-xl'
                    : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
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

                  {isConnectTarget ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-600 text-white animate-bounce">
                      Link Here
                    </span>
                  ) : node.type !== 'start' ? (
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateNode(node.id);
                        }}
                        title="Copy / Duplicate Node"
                        className="text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNodeId(node.id);
                          setEditingNode(node);
                        }}
                        title="Edit Node (Right Panel)"
                        className="text-neutral-400 hover:text-cyan-600 dark:hover:text-cyan-400 p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNode(node.id);
                        }}
                        title="Delete Node"
                        className="text-neutral-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* Incoming Connections Bar (Clearly shows WHICH button is connected to this node!) */}
                {(() => {
                  const incomingConns = connections.filter((c) => c.toNodeId === node.id);
                  if (incomingConns.length === 0) return null;
                  return (
                    <div className="px-2.5 py-1 bg-neutral-100/90 dark:bg-neutral-800/90 border-b border-neutral-200 dark:border-neutral-700/60 flex items-center space-x-1 overflow-x-auto text-[9px]">
                      <span className="text-neutral-500 dark:text-neutral-400 font-bold shrink-0 text-[8px] uppercase tracking-wider">
                        From:
                      </span>
                      {incomingConns.map((c) => {
                        const sNode = nodes.find((n) => n.id === c.fromNodeId);
                        const sBtn = sNode?.buttons?.find((b) => b.id === c.fromPortId);
                        const bIdx = sNode?.buttons?.findIndex((b) => b.id === c.fromPortId) ?? 0;
                        const pal =
                          c.fromPortId === 'output'
                            ? { badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
                            : BUTTON_PALETTES[Math.max(0, bIdx) % BUTTON_PALETTES.length];

                        return (
                          <span
                            key={c.id}
                            onMouseEnter={() => setHoveredConnId(c.id)}
                            onMouseLeave={() => setHoveredConnId(null)}
                            className={`px-1.5 py-0.5 rounded-md font-bold border shrink-0 flex items-center space-x-0.5 cursor-pointer shadow-2xs ${pal.badgeBg}`}
                            title={`Triggered by button "${sBtn?.title || 'Next'}" from "${sNode?.title}"`}
                          >
                            <span>🔘</span>
                            <span className="truncate max-w-[85px]">{sBtn?.title || sNode?.title}</span>
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}

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

                      {/* Interactive Buttons (Each with its own output connector dot - SUPPORTS MULTIPLE TARGET NODES!) */}
                      {node.type === 'question_button' && node.buttons && (
                        <div className="space-y-1.5 pt-1">
                          {node.buttons.map((btn, bIdx) => {
                            const connCount = btn.targetNodeIds?.length || (btn.targetNodeId ? 1 : 0);
                            const targetNodes = (btn.targetNodeIds || (btn.targetNodeId ? [btn.targetNodeId] : []))
                              .map((id) => nodes.find((n) => n.id === id))
                              .filter(Boolean) as VisualNode[];

                            const pal = BUTTON_PALETTES[bIdx % BUTTON_PALETTES.length];
                            const isPopoverOpen =
                              openButtonLinkPopover?.nodeId === node.id &&
                              openButtonLinkPopover?.buttonId === btn.id;

                            const isButtonHovered =
                              hoveredButtonKey?.nodeId === node.id &&
                              hoveredButtonKey?.buttonId === btn.id;

                            return (
                              <div
                                key={btn.id}
                                onMouseEnter={() => setHoveredButtonKey({ nodeId: node.id, buttonId: btn.id })}
                                onMouseLeave={() => setHoveredButtonKey(null)}
                                className={`relative group py-1.5 px-2.5 rounded-xl border border-l-4 ${pal.borderLeft} bg-white dark:bg-neutral-800 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-between shadow-2xs transition-all ${
                                  isButtonHovered
                                    ? 'ring-2 ring-emerald-500 shadow-md scale-[1.01]'
                                    : 'hover:border-neutral-400'
                                }`}
                              >
                                <span className="truncate pr-1.5 font-bold flex items-center space-x-1">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: pal.stroke }}
                                  />
                                  <span className="truncate">{btn.title}</span>
                                </span>

                                <div className="flex items-center space-x-1 shrink-0">
                                  {/* Multi-Node link pill/button with target node title display */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenButtonLinkPopover(
                                        isPopoverOpen ? null : { nodeId: node.id, buttonId: btn.id }
                                      );
                                    }}
                                    className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold border transition-colors cursor-pointer flex items-center space-x-0.5 ${
                                      connCount > 0
                                        ? `${pal.badgeBg}`
                                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 border-neutral-200 dark:border-neutral-700'
                                    }`}
                                    title={
                                      connCount === 0
                                        ? 'Click to connect this button to target nodes'
                                        : `Connected to: ${targetNodes.map((t) => t.title).join(', ')}. Click to edit.`
                                    }
                                  >
                                    <span>➔</span>
                                    <span className="truncate max-w-[85px]">
                                      {connCount === 0
                                        ? '+ Node'
                                        : connCount === 1
                                        ? targetNodes[0]?.title || '1 Node'
                                        : `${connCount} Nodes`}
                                    </span>
                                  </button>

                                  {/* Button Output Connector Dot */}
                                  <div
                                    onMouseDown={(e) => {
                                      const portCoords = getNodePortCoords(node.id, btn.id);
                                      handleStartConnection(e, node.id, btn.id, portCoords.x, portCoords.y);
                                    }}
                                    className="w-3.5 h-3.5 rounded-full border-2 hover:scale-125 transition-transform flex items-center justify-center cursor-pointer shrink-0"
                                    style={{
                                      borderColor: pal.stroke,
                                      backgroundColor: connCount > 0 ? pal.stroke : '#ffffff',
                                    }}
                                    title={`Drag wire to connect "${btn.title}" to target node (multiple connections allowed)`}
                                  >
                                    <div
                                      className="w-1 h-1 rounded-full"
                                      style={{
                                        backgroundColor: connCount > 0 ? '#ffffff' : pal.stroke,
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Quick Multi-Node Selector Popover on the Button */}
                                {isPopoverOpen && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 top-8 w-64 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-2xl shadow-2xl p-3 z-50 animate-fadeIn text-left cursor-default"
                                  >
                                    <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-neutral-200 dark:border-neutral-800">
                                      <div>
                                        <p className="text-[10px] font-bold text-neutral-800 dark:text-neutral-200 truncate max-w-[150px]">
                                          Button: "{btn.title}"
                                        </p>
                                        <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                          {connCount} node{connCount === 1 ? '' : 's'} connected
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setOpenButtonLinkPopover(null)}
                                        className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg cursor-pointer"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    <p className="text-[9px] text-neutral-500 mb-1.5">
                                      Select multiple nodes to trigger when customer clicks this button:
                                    </p>

                                    <div className="max-h-44 overflow-y-auto space-y-1">
                                      {nodes
                                        .filter((n) => n.id !== node.id && n.id !== 'node_start')
                                        .map((targetN) => {
                                          const isConnected = (btn.targetNodeIds || (btn.targetNodeId ? [btn.targetNodeId] : [])).includes(targetN.id);
                                          return (
                                            <button
                                              key={targetN.id}
                                              type="button"
                                              onClick={() => toggleButtonTargetNode(node.id, btn.id, targetN.id)}
                                              className={`w-full p-1.5 rounded-lg text-[10px] flex items-center justify-between transition-colors cursor-pointer border ${
                                                isConnected
                                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 font-bold'
                                                  : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-emerald-400'
                                              }`}
                                            >
                                              <div className="flex items-center space-x-1.5 truncate">
                                                <span className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[9px] font-black ${
                                                  isConnected ? 'bg-emerald-600 text-white' : 'border border-neutral-300 dark:border-neutral-600'
                                                }`}>
                                                  {isConnected ? '✓' : ''}
                                                </span>
                                                <span className="truncate">{targetN.title}</span>
                                              </div>
                                              <span className="text-[9px] text-neutral-400 shrink-0 capitalize">
                                                {targetN.type === 'question_button' ? 'Buttons' : targetN.type}
                                              </span>
                                            </button>
                                          );
                                        })}
                                      {nodes.filter((n) => n.id !== node.id && n.id !== 'node_start').length === 0 && (
                                        <p className="text-[10px] text-neutral-400 italic text-center py-2">
                                          No other steps yet. Add more nodes using the green + button!
                                        </p>
                                      )}
                                    </div>

                                    <div className="pt-2 mt-2 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
                                      <button
                                        type="button"
                                        onClick={() => setOpenButtonLinkPopover(null)}
                                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 cursor-pointer"
                                      >
                                        Done
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
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
      <div className="absolute bottom-4 left-4 z-20 flex items-center space-x-1.5 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xs p-1.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-lg text-neutral-700 dark:text-neutral-300">
        <button
          onClick={handleRecenter}
          title="Fit & Recenter View"
          className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((prev) => Math.min(parseFloat((prev + 0.15).toFixed(2)), 2.5))}
          title="Zoom In (or Mouse Wheel Up)"
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
          onClick={() => setZoom((prev) => Math.max(parseFloat((prev - 0.15).toFixed(2)), 0.3))}
          title="Zoom Out (or Mouse Wheel Down)"
          className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
        <span className="px-2 font-mono text-[11px] font-bold text-neutral-800 dark:text-neutral-200 select-none">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setIsLocked(!isLocked)}
          title={isLocked ? 'Unlock Canvas' : 'Lock Canvas'}
          className={`p-2 rounded-xl transition-colors cursor-pointer ${
            isLocked ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
        </button>
        <span className="text-[10px] text-neutral-400 pl-1 pr-1.5 hidden md:inline select-none">
          🖱️ Wheel | 📱 Pinch
        </span>
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

      {/* 5. RIGHT-SIDE NODE EDITOR DRAWER */}
      {editingNode && (
        <aside
          className="absolute right-0 top-0 bottom-0 w-full sm:w-[380px] md:w-[420px] bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl z-40 flex flex-col transition-all duration-200"
        >
          {/* Drawer Header */}
          <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/90 dark:bg-neutral-800/50 backdrop-blur-xs">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
                <Edit3 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-white truncate">
                  {editingNode.title || 'Edit Node'}
                </h3>
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                  Right-Side Node Editor
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1 shrink-0">
              <button
                type="button"
                onClick={() => handleDuplicateNode(editingNode.id)}
                title="Duplicate this Node"
                className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 hover:text-emerald-600 transition-colors cursor-pointer"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDeleteNode(editingNode.id);
                  setEditingNode(null);
                }}
                title="Delete this Node"
                className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/40 text-neutral-500 hover:text-rose-600 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setEditingNode(null)}
                title="Close Editor"
                className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer ml-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Drawer Body - Scrollable */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {/* Real-time sync feedback note */}
            <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Edits are synced to canvas in real-time.</span>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                Node Title
              </label>
              <input
                type="text"
                value={editingNode.title}
                onChange={(e) => updateEditingNode({ title: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {editingNode.type === 'question_button' && (
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  Header (Optional)
                </label>
                <input
                  type="text"
                  value={editingNode.headerText || ''}
                  onChange={(e) => updateEditingNode({ headerText: e.target.value })}
                  placeholder="e.g. LINK or CATALOGUE"
                  className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                WhatsApp Message Body
              </label>
              <textarea
                rows={5}
                value={editingNode.body}
                onChange={(e) => updateEditingNode({ body: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-sans text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                placeholder="Type WhatsApp message content..."
              />
            </div>

            {/* Interactive Buttons */}
            {editingNode.type === 'question_button' && (
              <div className="space-y-2.5 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    Interactive Buttons ({editingNode.buttons?.length || 0}/3)
                  </span>
                  {(editingNode.buttons?.length || 0) < 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        const btns = editingNode.buttons || [];
                        const updated = [
                          ...btns,
                          { id: `btn_${Date.now()}_${btns.length + 1}`, title: `Button ${btns.length + 1}` },
                        ];
                        updateEditingNode({ buttons: updated });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer transition-colors shadow-xs"
                    >
                      + Add Button
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {editingNode.buttons?.map((b, idx) => {
                    const linkedTargetIds = b.targetNodeIds || (b.targetNodeId ? [b.targetNodeId] : []);
                    const availableNodes = nodes.filter((n) => n.id !== editingNode.id && n.id !== 'node_start');
                    const pal = BUTTON_PALETTES[idx % BUTTON_PALETTES.length];

                    return (
                      <div key={b.id} className={`p-3 rounded-2xl border border-l-4 ${pal.borderLeft} border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 space-y-2.5`}>
                        <div className="flex items-center space-x-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: pal.stroke }}
                            title={`Button color: ${pal.name}`}
                          />
                          <span className="text-neutral-400 font-mono text-[10px] w-4">{idx + 1}.</span>
                          <input
                            type="text"
                            value={b.title}
                            maxLength={20}
                            onChange={(e) => {
                              const updated = [...(editingNode.buttons || [])];
                              updated[idx] = { ...updated[idx], title: e.target.value };
                              updateEditingNode({ buttons: updated });
                            }}
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-semibold text-xs focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = editingNode.buttons?.filter((_, i) => i !== idx);
                              updateEditingNode({ buttons: updated });
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer transition-colors"
                            title="Delete button"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* List of currently connected target nodes */}
                        {linkedTargetIds.length > 0 && (
                          <div className="pl-6 space-y-1">
                            <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                              Currently Triggers:
                            </span>
                            <div className="space-y-1">
                              {linkedTargetIds.map((targetId) => {
                                const targetN = nodes.find((n) => n.id === targetId);
                                if (!targetN) return null;
                                return (
                                  <div
                                    key={targetId}
                                    className={`flex items-center justify-between px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-2xs ${pal.badgeBg}`}
                                  >
                                    <span className="truncate">
                                      ➔ Triggers: "{targetN.title}"
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => toggleButtonTargetNode(editingNode.id, b.id, targetId)}
                                      className="text-rose-500 hover:text-rose-700 ml-1.5 p-0.5 rounded-sm hover:bg-rose-100 cursor-pointer font-black text-xs"
                                      title="Disconnect from this node"
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Multi-Node Linking selector for this button */}
                        <div className="pl-6 space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-neutral-700 dark:text-neutral-300 font-bold flex items-center space-x-1">
                              <span>🔗 Connect Nodes:</span>
                              <span
                                className="font-extrabold px-1.5 py-0.2 rounded-full text-[10px]"
                                style={{ color: pal.stroke }}
                              >
                                ({linkedTargetIds.length} connected)
                              </span>
                            </span>
                            {availableNodes.length > 0 && (
                              <div className="flex items-center space-x-2 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setButtonTargetNodes(editingNode.id, b.id, availableNodes.map((n) => n.id));
                                  }}
                                  className="text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer font-semibold"
                                >
                                  Select All
                                </button>
                                <span className="text-neutral-300 dark:text-neutral-600">|</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setButtonTargetNodes(editingNode.id, b.id, []);
                                  }}
                                  className="text-neutral-400 hover:text-rose-500 cursor-pointer font-semibold"
                                >
                                  Clear
                                </button>
                              </div>
                            )}
                          </div>

                          <p className="text-[10px] text-neutral-500 leading-tight">
                            Select multiple nodes below. Customer clicking "{b.title}" will trigger all selected nodes.
                          </p>

                          {availableNodes.length === 0 ? (
                            <p className="text-[10px] text-neutral-400 italic">No other steps yet. Add more steps to link.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                              {availableNodes.map((targetNode) => {
                                const isLinked = linkedTargetIds.includes(targetNode.id);
                                return (
                                  <button
                                    key={targetNode.id}
                                    type="button"
                                    onClick={() => toggleButtonTargetNode(editingNode.id, b.id, targetNode.id)}
                                    className={`px-2 py-1.5 rounded-xl text-[10px] font-semibold border transition-all cursor-pointer flex items-center justify-between space-x-1 text-left ${
                                      isLinked
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-bold'
                                        : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-emerald-400'
                                    }`}
                                  >
                                    <div className="flex items-center space-x-1.5 truncate">
                                      <span className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[9px] font-bold ${
                                        isLinked ? 'bg-white text-emerald-700' : 'border border-neutral-300 dark:border-neutral-600 text-transparent'
                                      }`}>
                                        ✓
                                      </span>
                                      <span className="truncate">{targetNode.title}</span>
                                    </div>
                                    <span className={`text-[9px] opacity-75 shrink-0 capitalize ${isLinked ? 'text-emerald-100' : 'text-neutral-400'}`}>
                                      {targetNode.type === 'question_button' ? 'btn' : targetNode.type}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Media URL if media node */}
            {editingNode.type === 'media' && (
              <div className="space-y-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                <div className="space-y-1.5">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300">File Name</label>
                  <input
                    type="text"
                    value={editingNode.mediaFileName || ''}
                    onChange={(e) => updateEditingNode({ mediaFileName: e.target.value })}
                    placeholder="e.g. Catalog_2026.pdf"
                    className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300">File Download URL</label>
                  <input
                    type="url"
                    value={editingNode.mediaUrl || ''}
                    onChange={(e) => updateEditingNode({ mediaUrl: e.target.value })}
                    placeholder="https://example.com/catalog.pdf"
                    className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-mono text-[11px]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/90 dark:bg-neutral-800/50 flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setEditingNode(null)}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center space-x-2 shadow-md shadow-emerald-600/20 cursor-pointer transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Done / Close Editor</span>
            </button>
          </div>
        </aside>
      )}
    </div>
  );
};
