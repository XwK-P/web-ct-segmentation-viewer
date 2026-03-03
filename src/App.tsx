import React, { useState, useEffect, useRef } from 'react';
import { Niivue } from '@niivue/niivue';
import { FolderOpen, Layers, Monitor, Box, Settings, X, CheckSquare } from 'lucide-react';

type LabelData = {
  name: string;
  file: File;
};

type CaseData = {
  id: string;
  imageFile?: File;
  labelFiles: LabelData[];
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

  // Initialize Niivue
  useEffect(() => {
    if (!canvasRef.current) return;
    const niivue = new Niivue({
      dragAndDropEnabled: false,
      backColor: [0, 0, 0, 1],
      show3Dcrosshair: true,
      isNearestInterpolation: true,
      multiplanarForceRender: true,
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
    setNv(niivue);
    
    return () => {
      // Cleanup if needed
    };
  }, []);

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
          nv.volumes[0].name = '_base_';
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
        const colormaps = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'orange'];
        const originalIndex = caseData.labelFiles.findIndex(l => l.name === labelName);
        nv.setColormap(vol.id, colormaps[originalIndex % colormaps.length]);
        vol.opacity = labelOpacity;
        vol.cal_min = 0;
        vol.cal_max = 1;
        nv.updateGLVolume();
      }
    } else {
      setActiveLabels(prev => prev.filter(n => n !== labelName));
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
      const colormaps = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'orange'];
      const originalIndex = caseData.labelFiles.findIndex(l => l.name === label.name);
      nv.setColormap(vol.id, colormaps[originalIndex % colormaps.length]);
      vol.opacity = labelOpacity;
      vol.cal_min = 0;
      vol.cal_max = 1;
      newActive.push(label.name);
    }
    setActiveLabels(newActive);
    nv.updateGLVolume();
    setIsLoadingLabels(false);
  };

  const hideAllLabels = () => {
    if (!nv) return;
    const volsToRemove = nv.volumes.filter(v => v.name && v.name !== '_base_');
    volsToRemove.forEach(v => nv.removeVolume(v));
    setActiveLabels([]);
    nv.updateGLVolume();
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLabelOpacity(val);
    if (nv) {
      nv.volumes.forEach(v => {
        if (v.name && v.name !== '_base_') {
          v.opacity = val;
        }
      });
      nv.updateGLVolume();
    }
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
    nv.updateGLVolume();
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-300 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-indigo-400" />
            CT Viewer
          </h1>
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
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedCaseId === c.id 
                    ? 'bg-indigo-500/20 text-indigo-300' 
                    : 'hover:bg-zinc-800 text-zinc-400'
                }`}
              >
                <div className="font-medium truncate">{c.id}</div>
                <div className="text-xs opacity-60 flex items-center gap-2 mt-1">
                  <span className={c.imageFile ? 'text-emerald-400' : 'text-red-400'}>
                    {c.imageFile ? 'CT' : 'No CT'}
                  </span>
                  <span>•</span>
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-400 mr-2">W/L Presets:</span>
            <button onClick={() => setWindowLevel(-1000, 1000)} className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors">Lung</button>
            <button onClick={() => setWindowLevel(-150, 250)} className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors">Soft Tissue</button>
            <button onClick={() => setWindowLevel(300, 1500)} className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors">Bone</button>
            <button onClick={() => setWindowLevel(0, 80)} className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors">Brain</button>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => nv?.setSliceType(0)}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
            >
              Axial
            </button>
            <button 
              onClick={() => nv?.setSliceType(1)}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
            >
              Coronal
            </button>
            <button 
              onClick={() => nv?.setSliceType(2)}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
            >
              Sagittal
            </button>
            <button 
              onClick={() => nv?.setSliceType(3)}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
            >
              Multiplanar
            </button>
            <button 
              onClick={() => nv?.setSliceType(4)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded-md transition-colors border border-indigo-500/20"
            >
              <Box className="w-4 h-4" />
              3D Render
            </button>
            <div className="w-px h-6 bg-zinc-800 mx-1"></div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>

        {/* Viewport */}
        <div className="flex-1 relative bg-black">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full outline-none" />
          
          {selectedCaseId && (
            <div className="absolute bottom-4 left-4 pointer-events-none text-xs text-zinc-500 bg-black/50 px-2 py-1 rounded">
              Right-click and drag to adjust Window/Level manually
            </div>
          )}

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
        <div className="w-64 bg-zinc-900 border-l border-zinc-800 flex flex-col">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center justify-between">
              Segmentations
              {isLoadingLabels && <span className="text-xs text-indigo-400 animate-pulse">Loading...</span>}
            </h2>
            <div className="flex gap-2 mt-3">
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
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {cases[selectedCaseId].labelFiles.map((label, idx) => {
              const colormaps = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'orange'];
              const color = colormaps[idx % colormaps.length];
              const isActive = activeLabels.includes(label.name);
              
              return (
                <label 
                  key={label.name} 
                  className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                    isActive ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                  } ${isLoadingLabels ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <input 
                    type="checkbox" 
                    className="hidden"
                    checked={isActive}
                    onChange={(e) => toggleLabel(label.name, e.target.checked)}
                  />
                  <div className={`w-4 h-4 rounded flex items-center justify-center border ${isActive ? 'border-transparent' : 'border-zinc-600'}`} style={{ backgroundColor: isActive ? color : 'transparent' }}>
                    {isActive && <CheckSquare className="w-3 h-3 text-white" />}
                  </div>
                  <span className={`text-xs font-medium truncate ${isActive ? 'text-zinc-200' : 'text-zinc-500'}`} title={label.name}>
                    {label.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
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

              {/* Label Opacity */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-zinc-300">Label Opacity</label>
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
    </div>
  );
}
