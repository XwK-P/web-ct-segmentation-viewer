import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Niivue, DRAG_MODE } from '@niivue/niivue';
import {
  FolderOpen, Layers, Monitor, Box, Settings, X, CheckSquare, ZoomIn, ZoomOut, RotateCcw,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Search, HelpCircle, Camera, Eye, EyeOff, Scissors, Info,
} from 'lucide-react';

type LabelData = {
  name: string;
  file: File;
};

type CaseData = {
  id: string;
  imageFile?: File;
  labelFiles: LabelData[];
};

const DEFAULT_COLORMAPS = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'orange'];

const COLOR_NAME_TO_HEX: Record<string, string> = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  orange: '#ffa500',
};

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [255, 0, 0];
}

const DATATYPE_NAMES: Record<number, string> = {
  2: 'uint8', 4: 'int16', 8: 'int32', 16: 'float32', 64: 'float64',
  256: 'int8', 512: 'uint16', 768: 'uint32',
};

export default function App() {
  const [cases, setCases] = useState<Record<string, CaseData>>({});
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [nv, setNv] = useState<Niivue | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Customization State
  const [activeLabels, setActiveLabels] = useState<string[]>([]);
  const [isLoadingLabels, setIsLoadingLabels] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [labelOpacity, setLabelOpacity] = useState(0.5);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [bgColor, setBgColor] = useState('black');
  const [renderMode, setRenderMode] = useState<'matte' | 'shiny' | 'mip'>('matte');
  const [isRadiologicalConvention, setIsRadiologicalConvention] = useState(true);
  const [sagittalNoseLeft, setSagittalNoseLeft] = useState(true);

  // Current slice type for view-aware mouse config
  const [sliceType, setSliceType] = useState(3); // default multiplanar

  // Window/Level live values
  const [windowMin, setWindowMin] = useState(0);
  const [windowMax, setWindowMax] = useState(0);

  // Phase 1: Collapsible sidebars
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);

  // Phase 1: Search/filter segmentations
  const [labelSearchQuery, setLabelSearchQuery] = useState('');

  // Phase 1: Help modal
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Phase 2: Per-segmentation opacity
  const [labelOpacities, setLabelOpacities] = useState<Record<string, number>>({});

  // Phase 2: Color picker
  const [labelColors, setLabelColors] = useState<Record<string, string>>({});

  // Phase 2: Solo/Isolate
  const [soloLabel, setSoloLabel] = useState<string | null>(null);

  // Phase 3: Clipping planes
  const [clipPlaneEnabled, setClipPlaneEnabled] = useState(false);
  const [clipPlaneDepth, setClipPlaneDepth] = useState(0.5);
  const [clipPlaneAzimuth, setClipPlaneAzimuth] = useState(0);
  const [clipPlaneElevation, setClipPlaneElevation] = useState(0);

  // Phase 3: Metadata display
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);

  // Helper: get effective opacity for a label
  const getLabelOpacity = useCallback((name: string) => {
    return labelOpacities[name] ?? labelOpacity;
  }, [labelOpacities, labelOpacity]);

  // Initialize Niivue
  useEffect(() => {
    if (!canvasRef.current) return;
    const niivue = new Niivue({
      dragAndDropEnabled: false,
      backColor: [0, 0, 0, 1],
      show3Dcrosshair: true,
      isNearestInterpolation: true,
      multiplanarForceRender: true,
      isRadiologicalConvention: true,
      sagittalNoseLeft: true,
      multiplanarLayout: 2,
    });

    // Add custom colormaps for segmentations to ensure consistency with UI
    const customColormaps = {
      yellow: { R: [0, 255], G: [0, 255], B: [0, 0], A: [0, 255], I: [0, 255] },
      cyan: { R: [0, 0], G: [0, 255], B: [0, 255], A: [0, 255], I: [0, 255] },
      magenta: { R: [0, 255], G: [0, 0], B: [0, 255], A: [0, 255], I: [0, 255] },
      orange: { R: [0, 255], G: [0, 165], B: [0, 0], A: [0, 255], I: [0, 255] },
    };

    Object.entries(customColormaps).forEach(([name, cmap]) => {
      if (niivue.addColormap) {
        niivue.addColormap(name, cmap);
      }
    });

    niivue.attachToCanvas(canvasRef.current);

    // Sync W/L display when user drags to change intensity
    niivue.onIntensityChange = (volume) => {
      if (volume && volume.name === '_base_') {
        setWindowMin(Math.round(volume.cal_min ?? 0));
        setWindowMax(Math.round(volume.cal_max ?? 0));
      }
    };

    // Sync slice type state when changed via Niivue internals
    niivue.onSliceTypeChange = (newSliceType: number) => {
      setSliceType(newSliceType);
    };

    setNv(niivue);

    return () => {
      // Cleanup if needed
    };
  }, []);

  // View-aware mouse config: 2D gets crosshair, 3D gets default rotation
  useEffect(() => {
    if (!nv) return;
    if (sliceType === 4) {
      // 3D view: reset to Niivue defaults (left-drag rotates)
      nv.opts.mouseEventConfig = undefined;
    } else {
      // 2D views: left-click=crosshair, shift+drag=pan, right-drag=W/L
      nv.setMouseEventConfig({
        leftButton: { primary: DRAG_MODE.crosshair, withShift: DRAG_MODE.pan },
        rightButton: DRAG_MODE.contrast,
        centerButton: DRAG_MODE.pan,
      });
    }
  }, [nv, sliceType]);

  // Ctrl+scroll zoom for 2D views only (not 3D)
  useEffect(() => {
    if (!nv) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (sliceType === 4) return; // 3D view uses native scroll zoom

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      nv.volScaleMultiplier = Math.min(Math.max(nv.volScaleMultiplier * factor, 0.2), 10);
      nv.drawScene();
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => {
      canvas.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [nv, sliceType]);

  // Clip plane effect
  useEffect(() => {
    if (!nv) return;
    if (clipPlaneEnabled && sliceType === 4) {
      nv.setClipPlane([clipPlaneDepth, clipPlaneAzimuth, clipPlaneElevation]);
    } else {
      nv.setClipPlane([2.1, 0, 0]); // depth > 2.0 disables
    }
  }, [nv, clipPlaneEnabled, clipPlaneDepth, clipPlaneAzimuth, clipPlaneElevation, sliceType]);

  // Zoom helpers
  const zoomIn = useCallback(() => {
    if (!nv) return;
    nv.volScaleMultiplier = Math.min(nv.volScaleMultiplier * 1.2, 10);
    nv.drawScene();
  }, [nv]);

  const zoomOut = useCallback(() => {
    if (!nv) return;
    nv.volScaleMultiplier = Math.max(nv.volScaleMultiplier / 1.2, 0.2);
    nv.drawScene();
  }, [nv]);

  const zoomReset = useCallback(() => {
    if (!nv) return;
    nv.volScaleMultiplier = 1;
    nv.drawScene();
  }, [nv]);

  // Screenshot
  const takeScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nv) return;
    nv.drawScene();
    const link = document.createElement('a');
    link.download = `${selectedCaseId || 'screenshot'}_screenshot.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [nv, selectedCaseId]);

  const handleImagesFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files) as File[];
    const validFiles = files.filter(f => f.name.endsWith('.nii.gz') || f.name.endsWith('.nii'));

    setCases(prev => {
      const newCases = { ...prev };
      validFiles.forEach(file => {
        // Extract case ID, e.g., lung_001.nii.gz -> lung_001
        const id = file.name.replace(/\.nii\.gz$/, '').replace(/\.nii$/, '');
        if (!newCases[id]) {
          newCases[id] = { id, labelFiles: [] };
        }
        newCases[id].imageFile = file;
      });
      return newCases;
    });
  };

  const handleLabelsFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files) as File[];
    const validFiles = files.filter(f => f.name.endsWith('.nii.gz') || f.name.endsWith('.nii'));

    setCases(prev => {
      const newCases = { ...prev };
      validFiles.forEach(file => {
        // Match {CASE_ID}_{LABEL_NAME}.nii.gz
        // We need to find the longest matching case ID
        const matchingCaseId = Object.keys(newCases)
          .sort((a, b) => b.length - a.length)
          .find(id => file.name.startsWith(id + '_'));

        if (matchingCaseId) {
          const labelName = file.name
            .substring(matchingCaseId.length + 1)
            .replace(/\.nii\.gz$/, '')
            .replace(/\.nii$/, '');

          // Check if label already exists
          const existingLabelIndex = newCases[matchingCaseId].labelFiles.findIndex(l => l.name === labelName);
          if (existingLabelIndex >= 0) {
            newCases[matchingCaseId].labelFiles[existingLabelIndex].file = file;
          } else {
            newCases[matchingCaseId].labelFiles.push({ name: labelName, file });
          }
        } else {
          // If no matching case, maybe create a new one? Or just ignore.
          // Let's try to guess the case ID (everything before the last underscore)
          const parts = file.name.replace(/\.nii\.gz$/, '').replace(/\.nii$/, '').split('_');
          if (parts.length > 1) {
            const labelName = parts.pop()!;
            const id = parts.join('_');
            if (!newCases[id]) {
              newCases[id] = { id, labelFiles: [] };
            }
            newCases[id].labelFiles.push({ name: labelName, file });
          }
        }
      });

      // Sort label files alphabetically
      Object.values(newCases).forEach((c: CaseData) => {
        c.labelFiles.sort((a, b) => a.name.localeCompare(b.name));
      });

      return newCases;
    });
  };

  const loadCase = async (caseId: string) => {
    if (!nv) return;
    const caseData = cases[caseId];
    if (!caseData) return;

    setSelectedCaseId(caseId);
    setActiveLabels([]); // Default to visualize none

    // Reset per-case state
    setLabelSearchQuery('');
    setLabelOpacities({});
    setLabelColors({});
    setSoloLabel(null);
    setClipPlaneEnabled(false);

    // Clear existing volumes
    while (nv.volumes.length > 0) {
      nv.removeVolume(nv.volumes[0]);
    }
    while (nv.meshes.length > 0) {
      nv.removeMesh(nv.meshes[0]);
    }
    nv.updateGLVolume();

    try {
      // Load image first
      if (caseData.imageFile) {
        await nv.loadFromFile(caseData.imageFile);
        if (nv.volumes.length > 0) {
          const vol = nv.volumes[0];
          vol.name = '_base_';
          // Ensure cal_min/cal_max are set for proper 3D rendering
          if (vol.robust_min !== undefined && vol.robust_max !== undefined
            && vol.robust_min !== vol.robust_max) {
            vol.cal_min = vol.robust_min;
            vol.cal_max = vol.robust_max;
          }
          setWindowMin(Math.round(vol.cal_min ?? 0));
          setWindowMax(Math.round(vol.cal_max ?? 0));
        }
      }

      // Apply current render mode
      let gradientAmount = 0;
      if (renderMode === 'shiny') gradientAmount = 1;
      else if (renderMode === 'mip') gradientAmount = NaN;
      nv.setVolumeRenderIllumination(gradientAmount);

      nv.updateGLVolume();
    } catch (error) {
      console.error("Error loading files:", error);
      alert("Failed to load files. Check console for details.");
    }
  };

  // Apply colormap to a volume (handles custom colors)
  const applyColormap = (vol: any, labelName: string, originalIndex: number) => {
    if (!nv) return;
    if (labelColors[labelName]) {
      const [r, g, b] = hexToRgb(labelColors[labelName]);
      const cmapName = `custom_${labelName}`;
      nv.addColormap(cmapName, { R: [0, r], G: [0, g], B: [0, b], A: [0, 255], I: [0, 255] });
      nv.setColormap(vol.id, cmapName);
    } else {
      nv.setColormap(vol.id, DEFAULT_COLORMAPS[originalIndex % DEFAULT_COLORMAPS.length]);
    }
  };

  const toggleLabel = async (labelName: string, isChecked: boolean) => {
    if (!nv || !selectedCaseId) return;
    const caseData = cases[selectedCaseId];
    setIsLoadingLabels(true);

    if (isChecked) {
      setActiveLabels(prev => [...prev, labelName]);
      const labelData = caseData.labelFiles.find(l => l.name === labelName);
      if (labelData) {
        await nv.loadFromFile(labelData.file);
        const vol = nv.volumes[nv.volumes.length - 1];
        vol.name = labelName;
        const originalIndex = caseData.labelFiles.findIndex(l => l.name === labelName);
        applyColormap(vol, labelName, originalIndex);
        // Use per-label opacity if set, otherwise global; handle solo
        const effectiveOpacity = soloLabel && soloLabel !== labelName ? 0 : getLabelOpacity(labelName);
        vol.opacity = effectiveOpacity;
        vol.cal_min = 0;
        vol.cal_max = 1;
        nv.updateGLVolume();
      }
    } else {
      setActiveLabels(prev => prev.filter(n => n !== labelName));
      if (soloLabel === labelName) setSoloLabel(null);
      const volToRemove = nv.volumes.find(v => v.name === labelName);
      if (volToRemove) {
        nv.removeVolume(volToRemove);
        nv.updateGLVolume();
      }
    }
    setIsLoadingLabels(false);
  };

  const showAllLabels = async () => {
    if (!nv || !selectedCaseId) return;
    setIsLoadingLabels(true);
    const caseData = cases[selectedCaseId];
    const labelsToAdd = caseData.labelFiles.filter(l => !activeLabels.includes(l.name));

    const newActive = [...activeLabels];
    for (const label of labelsToAdd) {
      await nv.loadFromFile(label.file);
      const vol = nv.volumes[nv.volumes.length - 1];
      vol.name = label.name;
      const originalIndex = caseData.labelFiles.findIndex(l => l.name === label.name);
      applyColormap(vol, label.name, originalIndex);
      vol.opacity = getLabelOpacity(label.name);
      vol.cal_min = 0;
      vol.cal_max = 1;
      newActive.push(label.name);
    }
    setActiveLabels(newActive);
    setSoloLabel(null);
    nv.updateGLVolume();
    setIsLoadingLabels(false);
  };

  const hideAllLabels = () => {
    if (!nv) return;
    const volsToRemove = nv.volumes.filter(v => v.name && v.name !== '_base_');
    volsToRemove.forEach(v => nv.removeVolume(v));
    setActiveLabels([]);
    setSoloLabel(null);
    nv.updateGLVolume();
  };

  // Global opacity change — resets per-label overrides
  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLabelOpacity(val);
    setLabelOpacities({});
    if (nv) {
      nv.volumes.forEach(v => {
        if (v.name && v.name !== '_base_') {
          v.opacity = soloLabel ? (v.name === soloLabel ? val : 0) : val;
        }
      });
      nv.updateGLVolume();
    }
  };

  // Per-label opacity change
  const handleLabelOpacityChange = (labelName: string, val: number) => {
    setLabelOpacities(prev => ({ ...prev, [labelName]: val }));
    if (!nv) return;
    const vol = nv.volumes.find(v => v.name === labelName);
    if (vol) {
      vol.opacity = soloLabel && soloLabel !== labelName ? 0 : val;
      nv.updateGLVolume();
    }
  };

  // Color picker change
  const handleLabelColorChange = (labelName: string, hexColor: string) => {
    setLabelColors(prev => ({ ...prev, [labelName]: hexColor }));
    if (!nv) return;
    const vol = nv.volumes.find(v => v.name === labelName);
    if (vol) {
      const [r, g, b] = hexToRgb(hexColor);
      const cmapName = `custom_${labelName}`;
      nv.addColormap(cmapName, { R: [0, r], G: [0, g], B: [0, b], A: [0, 255], I: [0, 255] });
      nv.setColormap(vol.id, cmapName);
      nv.updateGLVolume();
    }
  };

  // Solo/Isolate toggle
  const toggleSolo = (labelName: string) => {
    if (!nv) return;
    if (soloLabel === labelName) {
      // Un-solo: restore all opacities
      setSoloLabel(null);
      nv.volumes.forEach(v => {
        if (v.name && v.name !== '_base_') {
          v.opacity = getLabelOpacity(v.name);
        }
      });
    } else {
      // Solo this label
      setSoloLabel(labelName);
      nv.volumes.forEach(v => {
        if (v.name && v.name !== '_base_') {
          v.opacity = v.name === labelName ? getLabelOpacity(v.name) : 0;
        }
      });
    }
    nv.updateGLVolume();
  };

  const handleBgColorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setBgColor(val);
    if (nv) {
      if (val === 'black') nv.opts.backColor = [0, 0, 0, 1];
      if (val === 'dark') nv.opts.backColor = [0.2, 0.2, 0.2, 1];
      if (val === 'light') nv.opts.backColor = [0.8, 0.8, 0.8, 1];
      nv.updateGLVolume();
    }
  };

  const handleCrosshairToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setShowCrosshair(val);
    if (nv) {
      nv.opts.show3Dcrosshair = val;
      nv.updateGLVolume();
    }
  };

  const handleRenderModeChange = (mode: 'matte' | 'shiny' | 'mip') => {
    setRenderMode(mode);
    if (nv) {
      let gradientAmount = 0;
      if (mode === 'shiny') gradientAmount = 1;
      else if (mode === 'mip') gradientAmount = NaN;

      nv.setVolumeRenderIllumination(gradientAmount);
      nv.updateGLVolume();
    }
  };

  const setWindowLevel = (min: number, max: number) => {
    if (!nv || nv.volumes.length === 0) return;
    nv.volumes[0].cal_min = min;
    nv.volumes[0].cal_max = max;
    setWindowMin(min);
    setWindowMax(max);
    nv.updateGLVolume();
  };

  // Derive filtered labels
  const currentCase = selectedCaseId ? cases[selectedCaseId] : null;
  const filteredLabels = currentCase
    ? currentCase.labelFiles.filter(l => l.name.toLowerCase().includes(labelSearchQuery.toLowerCase()))
    : [];

  // Get display color for a label (custom or default)
  const getDisplayColor = (labelName: string): string => {
    if (labelColors[labelName]) return labelColors[labelName];
    if (!currentCase) return '#ff0000';
    const idx = currentCase.labelFiles.findIndex(l => l.name === labelName);
    const cmapName = DEFAULT_COLORMAPS[idx % DEFAULT_COLORMAPS.length];
    return COLOR_NAME_TO_HEX[cmapName] || cmapName;
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-300 font-sans overflow-hidden">
      {/* Left Sidebar */}
      {isLeftSidebarCollapsed ? (
        <div className="w-10 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-3 shrink-0">
          <button
            onClick={() => setIsLeftSidebarCollapsed(false)}
            className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              <Monitor className="w-5 h-5 text-indigo-400" />
              CT Viewer
            </h1>
            <button
              onClick={() => setIsLeftSidebarCollapsed(true)}
              className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4 border-b border-zinc-800">
            <div>
              <label className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg cursor-pointer transition-colors text-sm font-medium">
                <FolderOpen className="w-4 h-4" />
                Select Images Folder
                <input
                  type="file"
                  // @ts-ignore - webkitdirectory is non-standard but widely supported
                  webkitdirectory="true"
                  directory="true"
                  multiple
                  className="hidden"
                  onChange={handleImagesFolder}
                />
              </label>
            </div>
            <div>
              <label className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg cursor-pointer transition-colors text-sm font-medium">
                <Layers className="w-4 h-4" />
                Select Labels Folder
                <input
                  type="file"
                  // @ts-ignore
                  webkitdirectory="true"
                  directory="true"
                  multiple
                  className="hidden"
                  onChange={handleLabelsFolder}
                />
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <h2 className="px-2 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Cases</h2>
            <div className="space-y-1">
              {(Object.values(cases) as CaseData[])
                .sort((a, b) => {
                  if (sortOrder === 'asc') return a.id.localeCompare(b.id);
                  return b.id.localeCompare(a.id);
                })
                .map(c => (
                  <button
                    key={c.id}
                    onClick={() => loadCase(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${selectedCaseId === c.id
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'hover:bg-zinc-800 text-zinc-400'
                      }`}
                  >
                    <div className="font-medium truncate">{c.id}</div>
                    <div className="text-xs opacity-60 flex items-center gap-2 mt-1">
                      <span className={c.imageFile ? 'text-emerald-400' : 'text-red-400'}>
                        {c.imageFile ? 'CT' : 'No CT'}
                      </span>
                      <span>&middot;</span>
                      <span>{c.labelFiles.length} labels</span>
                    </div>
                  </button>
                ))}
              {Object.keys(cases).length === 0 && (
                <div className="px-3 py-4 text-sm text-zinc-600 text-center">
                  Select folders to load cases
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-2 space-y-2">
          {/* Row 1: Tools, Views, Settings */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {/* Zoom controls */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={zoomOut}
                  className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={zoomReset}
                  className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                  title="Reset zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={zoomIn}
                  className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              <div className="w-px h-5 bg-zinc-800 mx-1"></div>

              {/* Screenshot */}
              <button
                onClick={takeScreenshot}
                disabled={!selectedCaseId}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                title="Save screenshot"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => { nv?.setSliceType(0); setSliceType(0); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${sliceType === 0 ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/20' : 'bg-zinc-800 hover:bg-zinc-700'}`}
              >
                Axial
              </button>
              <button
                onClick={() => { nv?.setSliceType(1); setSliceType(1); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${sliceType === 1 ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/20' : 'bg-zinc-800 hover:bg-zinc-700'}`}
              >
                Coronal
              </button>
              <button
                onClick={() => { nv?.setSliceType(2); setSliceType(2); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${sliceType === 2 ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/20' : 'bg-zinc-800 hover:bg-zinc-700'}`}
              >
                Sagittal
              </button>
              <button
                onClick={() => { nv?.setSliceType(3); setSliceType(3); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${sliceType === 3 ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/20' : 'bg-zinc-800 hover:bg-zinc-700'}`}
              >
                Multiplanar
              </button>
              <button
                onClick={() => { nv?.setSliceType(4); setSliceType(4); }}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border ${sliceType === 4 ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/20' : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border-indigo-500/20'}`}
              >
                <Box className="w-4 h-4" />
                3D Render
              </button>

              <div className="w-px h-6 bg-zinc-800 mx-1"></div>

              {/* Clip plane toggle (3D only) */}
              {sliceType === 4 && (
                <button
                  onClick={() => setClipPlaneEnabled(!clipPlaneEnabled)}
                  className={`p-1.5 rounded transition-colors ${clipPlaneEnabled ? 'text-indigo-300 bg-indigo-500/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
                  title="Toggle clipping plane"
                >
                  <Scissors className="w-4 h-4" />
                </button>
              )}

              {/* Metadata */}
              <button
                onClick={() => setIsMetadataOpen(true)}
                disabled={!selectedCaseId}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                title="Volume metadata"
              >
                <Info className="w-4 h-4" />
              </button>

              {/* Help */}
              <button
                onClick={() => setIsHelpOpen(true)}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                title="Help & shortcuts"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
            </div>
          </div>

          {/* Clip plane controls */}
          {sliceType === 4 && clipPlaneEnabled && (
            <div className="flex items-center gap-4 py-1 px-1">
              <div className="flex items-center gap-2 flex-1">
                <label className="flex items-center gap-1.5 flex-1">
                  <span className="text-xs text-zinc-500 w-10">Depth</span>
                  <input
                    type="range" min="0" max="1.73" step="0.01"
                    value={clipPlaneDepth}
                    onChange={(e) => setClipPlaneDepth(parseFloat(e.target.value))}
                    className="flex-1 accent-indigo-500"
                  />
                  <span className="text-xs text-zinc-500 w-8 tabular-nums">{clipPlaneDepth.toFixed(2)}</span>
                </label>
                <label className="flex items-center gap-1.5 flex-1">
                  <span className="text-xs text-zinc-500 w-10">Azim</span>
                  <input
                    type="range" min="0" max="360" step="1"
                    value={clipPlaneAzimuth}
                    onChange={(e) => setClipPlaneAzimuth(parseInt(e.target.value))}
                    className="flex-1 accent-indigo-500"
                  />
                  <span className="text-xs text-zinc-500 w-8 tabular-nums">{clipPlaneAzimuth}&deg;</span>
                </label>
                <label className="flex items-center gap-1.5 flex-1">
                  <span className="text-xs text-zinc-500 w-10">Elev</span>
                  <input
                    type="range" min="-90" max="90" step="1"
                    value={clipPlaneElevation}
                    onChange={(e) => setClipPlaneElevation(parseInt(e.target.value))}
                    className="flex-1 accent-indigo-500"
                  />
                  <span className="text-xs text-zinc-500 w-8 tabular-nums">{clipPlaneElevation}&deg;</span>
                </label>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setClipPlaneAzimuth(0); setClipPlaneElevation(0); }} className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors" title="Sagittal clip">Sag</button>
                <button onClick={() => { setClipPlaneAzimuth(90); setClipPlaneElevation(0); }} className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors" title="Coronal clip">Cor</button>
                <button onClick={() => { setClipPlaneAzimuth(0); setClipPlaneElevation(90); }} className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors" title="Axial clip">Axi</button>
              </div>
            </div>
          )}

          {/* Row 2: Window/Level controls */}
          {selectedCaseId && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-zinc-500">W/L:</span>
                <button onClick={() => setWindowLevel(-1000, 1000)} className="px-2 py-1 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded transition-colors">Lung</button>
                <button onClick={() => setWindowLevel(-150, 250)} className="px-2 py-1 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded transition-colors">Soft Tissue</button>
                <button onClick={() => setWindowLevel(100, 500)} className="px-2 py-1 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded transition-colors">Bone</button>
                <button onClick={() => setWindowLevel(0, 80)} className="px-2 py-1 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded transition-colors">Brain</button>
              </div>

              <div className="w-px h-5 bg-zinc-800"></div>

              {/* Manual W/L inputs */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500">Min</span>
                  <input
                    type="number"
                    value={windowMin}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setWindowMin(val);
                      setWindowLevel(val, windowMax);
                    }}
                    className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 tabular-nums"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500">Max</span>
                  <input
                    type="number"
                    value={windowMax}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setWindowMax(val);
                      setWindowLevel(windowMin, val);
                    }}
                    className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 tabular-nums"
                  />
                </label>
                <button
                  onClick={() => {
                    if (!nv || nv.volumes.length === 0) return;
                    const vol = nv.volumes[0];
                    if (vol.robust_min !== undefined && vol.robust_max !== undefined) {
                      setWindowLevel(Math.round(vol.robust_min), Math.round(vol.robust_max));
                    }
                  }}
                  className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                  title="Reset to auto range"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Viewport */}
        <div className="flex-1 relative bg-black">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full outline-none" />

          {!selectedCaseId && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 z-10">
              <div className="text-zinc-500 flex flex-col items-center gap-5 max-w-sm text-center">
                <div className="w-20 h-20 rounded-3xl bg-zinc-900/80 flex items-center justify-center border border-zinc-800 shadow-xl">
                  <Monitor className="w-10 h-10 text-zinc-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-medium text-zinc-200 tracking-tight">No Case Selected</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    Select your CT images and segmentation labels folders from the sidebar to begin viewing.
                  </p>
                </div>

                {Object.keys(cases).length === 0 ? (
                  <div className="flex items-center gap-2 text-xs font-medium text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20 mt-2">
                    <FolderOpen className="w-3.5 h-3.5" />
                    Waiting for folders...
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 mt-2">
                    <Layers className="w-3.5 h-3.5" />
                    Cases loaded. Select one to view.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Labels */}
      {selectedCaseId && cases[selectedCaseId]?.labelFiles.length > 0 && (
        isRightSidebarCollapsed ? (
          <div className="w-10 bg-zinc-900 border-l border-zinc-800 flex flex-col items-center py-3 shrink-0">
            <button
              onClick={() => setIsRightSidebarCollapsed(false)}
              className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
              title="Expand segmentations panel"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="w-64 bg-zinc-900 border-l border-zinc-800 flex flex-col shrink-0">
            <div className="p-4 border-b border-zinc-800 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  Segmentations
                  {isLoadingLabels && <span className="text-xs text-indigo-400 animate-pulse">Loading...</span>}
                </span>
                <button
                  onClick={() => setIsRightSidebarCollapsed(true)}
                  className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                  title="Collapse panel"
                >
                  <PanelRightClose className="w-4 h-4" />
                </button>
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={showAllLabels}
                  disabled={isLoadingLabels}
                  className="flex-1 px-2 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded transition-colors disabled:opacity-50"
                >
                  Show All
                </button>
                <button
                  onClick={hideAllLabels}
                  disabled={isLoadingLabels}
                  className="flex-1 px-2 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded transition-colors disabled:opacity-50"
                >
                  Hide All
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter labels..."
                  value={labelSearchQuery}
                  onChange={(e) => setLabelSearchQuery(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {filteredLabels.map((label) => {
                const displayColor = getDisplayColor(label.name);
                const isActive = activeLabels.includes(label.name);
                const isSoloed = soloLabel === label.name;
                const originalIndex = currentCase!.labelFiles.findIndex(l => l.name === label.name);
                const defaultHex = COLOR_NAME_TO_HEX[DEFAULT_COLORMAPS[originalIndex % DEFAULT_COLORMAPS.length]] || '#ff0000';

                return (
                  <div key={label.name} className={`rounded-md transition-colors ${isActive ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'} ${isLoadingLabels ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex items-center gap-2 px-3 py-2">
                      {/* Checkbox */}
                      <label className="cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={isActive}
                          onChange={(e) => toggleLabel(label.name, e.target.checked)}
                        />
                        <div className={`w-4 h-4 rounded flex items-center justify-center border ${isActive ? 'border-transparent' : 'border-zinc-600'}`} style={{ backgroundColor: isActive ? displayColor : 'transparent' }}>
                          {isActive && <CheckSquare className="w-3 h-3 text-white" />}
                        </div>
                      </label>

                      {/* Color picker (shows as swatch, click opens native picker) */}
                      <div className="relative shrink-0">
                        <input
                          type="color"
                          value={labelColors[label.name] || defaultHex}
                          onChange={(e) => handleLabelColorChange(label.name, e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          title="Change color"
                        />
                        <div className="w-3.5 h-3.5 rounded-sm border border-zinc-600" style={{ backgroundColor: displayColor }}></div>
                      </div>

                      {/* Label name */}
                      <span className={`text-xs font-medium truncate flex-1 ${isActive ? 'text-zinc-200' : 'text-zinc-500'}`} title={label.name}>
                        {label.name}
                      </span>

                      {/* Solo button (only when active) */}
                      {isActive && (
                        <button
                          onClick={() => toggleSolo(label.name)}
                          className={`p-0.5 rounded transition-colors shrink-0 ${isSoloed ? 'text-indigo-300' : 'text-zinc-500 hover:text-zinc-300'}`}
                          title={isSoloed ? 'Show all' : 'Solo this label'}
                        >
                          {isSoloed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>

                    {/* Per-label opacity slider (only when active) */}
                    {isActive && (
                      <div className="flex items-center gap-2 px-3 pb-2">
                        <input
                          type="range"
                          min="0.05" max="1" step="0.05"
                          value={labelOpacities[label.name] ?? labelOpacity}
                          onChange={(e) => handleLabelOpacityChange(label.name, parseFloat(e.target.value))}
                          className="flex-1 accent-indigo-500 h-1"
                        />
                        <span className="text-[10px] text-zinc-500 w-7 text-right tabular-nums">
                          {Math.round((labelOpacities[label.name] ?? labelOpacity) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <Settings className="w-5 h-5 text-zinc-400" />
                Settings
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Axial/Coronal Convention */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Axial/Coronal Convention</label>
                <select
                  value={isRadiologicalConvention ? 'radiological' : 'neurological'}
                  onChange={(e) => {
                    const val = e.target.value === 'radiological';
                    setIsRadiologicalConvention(val);
                    if (nv) {
                      nv.setRadiologicalConvention(val);
                    }
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="radiological">Radiological (patient left &rarr; screen right)</option>
                  <option value="neurological">Neurological (patient left &rarr; screen left)</option>
                </select>
              </div>

              {/* Sagittal Orientation */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Sagittal Orientation</label>
                <select
                  value={sagittalNoseLeft ? 'left' : 'right'}
                  onChange={(e) => {
                    const val = e.target.value === 'left';
                    setSagittalNoseLeft(val);
                    if (nv) {
                      nv.opts.sagittalNoseLeft = val;
                      nv.updateGLVolume();
                    }
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="left">Nose Left</option>
                  <option value="right">Nose Right</option>
                </select>
              </div>

              {/* Case Sorting */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Case Sorting</label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="asc">Alphabetical (A-Z)</option>
                  <option value="desc">Alphabetical (Z-A)</option>
                </select>
              </div>

              {/* Label Opacity (Global) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-zinc-300">Label Opacity (Global)</label>
                  <span className="text-xs text-zinc-500">{Math.round(labelOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={labelOpacity}
                  onChange={handleOpacityChange}
                  className="w-full accent-indigo-500"
                />
                <p className="text-xs text-zinc-600">Changing resets per-label opacity overrides.</p>
              </div>

              {/* Background Color */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Background Color</label>
                <select
                  value={bgColor}
                  onChange={handleBgColorChange}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="black">Black</option>
                  <option value="dark">Dark Gray</option>
                  <option value="light">Light Gray</option>
                </select>
              </div>

              {/* 3D Render Mode */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">3D Render Mode</label>
                <select
                  value={renderMode}
                  onChange={(e) => handleRenderModeChange(e.target.value as any)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="matte">Matte (Standard Volume Rendering)</option>
                  <option value="shiny">Shiny (Matcap Illumination)</option>
                  <option value="mip">MIP (Maximum Intensity Projection)</option>
                </select>
              </div>

              {/* Crosshair Toggle */}
              <div className="flex items-center justify-between pt-2">
                <label className="text-sm font-medium text-zinc-300">Show 3D Crosshair</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={showCrosshair}
                    onChange={handleCrosshairToggle}
                  />
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-zinc-400" />
                Help &amp; Shortcuts
              </h2>
              <button onClick={() => setIsHelpOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">Mouse Controls (2D Views)</h3>
                <div className="space-y-1 text-xs text-zinc-400">
                  <div className="flex justify-between"><span>Left-click</span><span className="text-zinc-500">Set crosshair position</span></div>
                  <div className="flex justify-between"><span>Right-drag</span><span className="text-zinc-500">Adjust window/level</span></div>
                  <div className="flex justify-between"><span>Shift + drag</span><span className="text-zinc-500">Pan image</span></div>
                  <div className="flex justify-between"><span>Ctrl + scroll</span><span className="text-zinc-500">Zoom in/out</span></div>
                  <div className="flex justify-between"><span>Scroll</span><span className="text-zinc-500">Navigate slices</span></div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">Mouse Controls (3D View)</h3>
                <div className="space-y-1 text-xs text-zinc-400">
                  <div className="flex justify-between"><span>Left-drag</span><span className="text-zinc-500">Rotate model</span></div>
                  <div className="flex justify-between"><span>Right-drag</span><span className="text-zinc-500">Adjust window/level</span></div>
                  <div className="flex justify-between"><span>Scroll</span><span className="text-zinc-500">Zoom in/out</span></div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">Toolbar</h3>
                <div className="space-y-1 text-xs text-zinc-400">
                  <div className="flex justify-between"><span>View buttons</span><span className="text-zinc-500">Switch Axial/Coronal/Sagittal/Multi/3D</span></div>
                  <div className="flex justify-between"><span>Zoom +/-/reset</span><span className="text-zinc-500">Zoom controls</span></div>
                  <div className="flex justify-between"><span>W/L presets</span><span className="text-zinc-500">Lung, Soft Tissue, Bone, Brain</span></div>
                  <div className="flex justify-between"><span>Camera icon</span><span className="text-zinc-500">Save screenshot as PNG</span></div>
                  <div className="flex justify-between"><span>Scissors icon</span><span className="text-zinc-500">3D clipping plane (3D view only)</span></div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">Segmentation Panel</h3>
                <div className="space-y-1 text-xs text-zinc-400">
                  <div className="flex justify-between"><span>Checkbox</span><span className="text-zinc-500">Toggle label visibility</span></div>
                  <div className="flex justify-between"><span>Color swatch</span><span className="text-zinc-500">Click to pick custom color</span></div>
                  <div className="flex justify-between"><span>Eye icon</span><span className="text-zinc-500">Solo / isolate a single label</span></div>
                  <div className="flex justify-between"><span>Opacity slider</span><span className="text-zinc-500">Per-label opacity control</span></div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">Tips</h3>
                <ul className="text-xs text-zinc-400 space-y-1 list-disc list-inside">
                  <li>Load CT images folder first, then labels folder</li>
                  <li>Labels match cases by filename prefix</li>
                  <li>Custom W/L values can be entered directly in the toolbar</li>
                  <li>Sidebars can be collapsed for more viewing space</li>
                  <li>Global opacity in Settings resets all per-label overrides</li>
                </ul>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end">
              <button
                onClick={() => setIsHelpOpen(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metadata Modal */}
      {isMetadataOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <Info className="w-5 h-5 text-zinc-400" />
                Volume Metadata
              </h2>
              <button onClick={() => setIsMetadataOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {nv && nv.volumes.length > 0 ? (() => {
                const vol = nv.volumes[0];
                const hdr = vol.hdr as any;
                const dims = hdr?.dims || [];
                const pixDims = hdr?.pixDims || [];
                const dtCode = hdr?.datatypeCode ?? hdr?.datatype;

                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div className="text-zinc-500">Dimensions</div>
                      <div className="text-zinc-200 tabular-nums">
                        {dims[1] || '?'} &times; {dims[2] || '?'} &times; {dims[3] || '?'} voxels
                      </div>

                      <div className="text-zinc-500">Voxel Size</div>
                      <div className="text-zinc-200 tabular-nums">
                        {pixDims[1]?.toFixed(2) || '?'} &times; {pixDims[2]?.toFixed(2) || '?'} &times; {pixDims[3]?.toFixed(2) || '?'} mm
                      </div>

                      <div className="text-zinc-500">Data Type</div>
                      <div className="text-zinc-200">
                        {(dtCode != null && DATATYPE_NAMES[dtCode]) || `Code ${dtCode ?? 'unknown'}`}
                      </div>

                      <div className="text-zinc-500">Bits Per Voxel</div>
                      <div className="text-zinc-200">{hdr?.numBitsPerVoxel ?? hdr?.bitpix ?? '?'}</div>

                      <div className="text-zinc-500">Intensity Range</div>
                      <div className="text-zinc-200 tabular-nums">
                        {vol.global_min?.toFixed(1) ?? '?'} &ndash; {vol.global_max?.toFixed(1) ?? '?'}
                      </div>

                      <div className="text-zinc-500">Window (cal)</div>
                      <div className="text-zinc-200 tabular-nums">
                        {vol.cal_min?.toFixed(1) ?? '?'} &ndash; {vol.cal_max?.toFixed(1) ?? '?'}
                      </div>

                      {hdr?.descrip && (
                        <>
                          <div className="text-zinc-500">Description</div>
                          <div className="text-zinc-200 break-words">{hdr.descrip}</div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <p className="text-sm text-zinc-500">No volume loaded.</p>
              )}
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end">
              <button
                onClick={() => setIsMetadataOpen(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
