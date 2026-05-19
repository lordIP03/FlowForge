import { Activity, Box, Droplets, FileUp, Gauge, Layers3, Rotate3D, Waves, Wind } from "lucide-react";
import { ChangeEvent, useMemo, useState } from "react";
import { FlowViewport, FlowSettings, GeometryStats } from "./components/FlowViewport";

const defaultStats: GeometryStats = {
  fileName: "NACA concept wing",
  vertices: 642,
  faces: 1280,
  bounds: "5.20 x 0.64 x 1.28 m",
  volumeEstimate: "0.92 m3",
  status: "Procedural preview",
};

const initialSettings: FlowSettings = {
  fluidType: "air",
  flowSpeed: 42,
  angleOfAttack: 6,
  density: 62,
  particleCount: 1300,
  turbulence: 38,
  wireframe: false,
  sectionCut: false,
  pressureMap: true,
  modelRotationX: 0,
  modelRotationY: 0,
  modelRotationZ: 0,
};

export function App() {
  const [settings, setSettings] = useState<FlowSettings>(initialSettings);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [stats, setStats] = useState<GeometryStats>(defaultStats);
  const [uploadMessage, setUploadMessage] = useState("Drop STL or OBJ geometry to replace the reference wing.");

  const metrics = useMemo(() => {
    const speedFactor = settings.flowSpeed / 50;
    const angle = Math.abs(settings.angleOfAttack);
    const fluidFactor = settings.fluidType === "water" ? 1.24 : 1;
    const turbulenceFactor = 1 + settings.turbulence / 240;

    return {
      drag: (0.19 * speedFactor * turbulenceFactor * fluidFactor + angle * 0.006).toFixed(3),
      lift: (0.42 + settings.angleOfAttack * 0.052 - settings.turbulence * 0.0018).toFixed(3),
      pressure: `${Math.round(64 * speedFactor * fluidFactor + angle * 4)} kPa`,
      velocity: `${settings.flowSpeed.toFixed(0)} m/s`,
      turbulence: `${settings.turbulence.toFixed(0)}%`,
    };
  }, [settings]);

  const updateSetting = <K extends keyof FlowSettings>(key: K, value: FlowSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const handleFile = (file?: File) => {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "step" || extension === "stp" || extension === "iges" || extension === "igs") {
      setUploadMessage("STEP and IGES are queued for backend OpenCascade conversion. MVP preview currently supports STL and OBJ.");
      return;
    }

    if (extension !== "stl" && extension !== "obj") {
      setUploadMessage("Unsupported file type. Upload STL, OBJ, STEP, or IGES geometry.");
      return;
    }

    setModelFile(file);
    setStats((current) => ({
      ...current,
      fileName: file.name,
      status: "Loaded client-side",
    }));
    setUploadMessage(`${file.name} loaded into the viewport.`);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
    event.target.value = "";
  };

  return (
    <main
      className="min-h-screen bg-forge-bg text-slate-100"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        handleFile(event.dataTransfer.files?.[0]);
      }}
    >
      <div className="app-grid">
        <aside className="left-rail">
          <div className="brand-lockup">
            <div className="brand-mark">
              <Waves size={22} />
            </div>
            <div>
              <p className="brand-name">FlowForge</p>
              <p className="brand-subtitle">visual simulation lab</p>
            </div>
          </div>

          <label className="upload-zone">
            <input type="file" accept=".stl,.obj,.step,.stp,.iges,.igs" onChange={onFileChange} />
            <FileUp size={24} />
            <span>Upload CAD</span>
            <small>STL, OBJ, STEP, IGES</small>
          </label>

          <div className="mode-toggle" role="group" aria-label="Fluid mode">
            <button className={settings.fluidType === "air" ? "active" : ""} onClick={() => updateSetting("fluidType", "air")}>
              <Wind size={17} /> Air
            </button>
            <button className={settings.fluidType === "water" ? "active" : ""} onClick={() => updateSetting("fluidType", "water")}>
              <Droplets size={17} /> Water
            </button>
          </div>

          {/* FLOW SETTINGS */}
          <div className="control-section">
            <span className="control-section-title">Flow Settings</span>
            <ControlSlider label="Flow speed" value={settings.flowSpeed} min={5} max={120} unit="m/s" onChange={(value) => updateSetting("flowSpeed", value)} />
            <ControlSlider label="Angle of attack" value={settings.angleOfAttack} min={-18} max={18} unit="deg" onChange={(value) => updateSetting("angleOfAttack", value)} />
          </div>

          {/* MODEL ROTATION - Only show if custom model uploaded */}
          {modelFile && (
            <div className="control-section">
              <span className="control-section-title">Model Rotation</span>
              <ControlSlider label="Rotate X" value={settings.modelRotationX} min={-180} max={180} unit="deg" onChange={(value) => updateSetting("modelRotationX", value)} />
              <ControlSlider label="Rotate Y" value={settings.modelRotationY} min={-180} max={180} unit="deg" onChange={(value) => updateSetting("modelRotationY", value)} />
              <ControlSlider label="Rotate Z" value={settings.modelRotationZ} min={-180} max={180} unit="deg" onChange={(value) => updateSetting("modelRotationZ", value)} />
            </div>
          )}

          {/* FIELD SETTINGS */}
          <div className="control-section">
            <span className="control-section-title">Field Settings</span>
            <ControlSlider label="Field density" value={settings.density} min={20} max={100} unit="%" onChange={(value) => updateSetting("density", value)} />
            <ControlSlider label="Particles" value={settings.particleCount} min={300} max={3200} unit="" onChange={(value) => updateSetting("particleCount", value)} />
            <ControlSlider label="Turbulence" value={settings.turbulence} min={0} max={100} unit="%" onChange={(value) => updateSetting("turbulence", value)} />
          </div>

          {/* VISUALIZATION */}
          <div className="control-section">
            <span className="control-section-title">Visualization</span>
            <div className="switch-grid">
              <Toggle label="Wireframe" icon={<Layers3 size={16} />} checked={settings.wireframe} onChange={(value) => updateSetting("wireframe", value)} />
              <Toggle label="Section" icon={<Box size={16} />} checked={settings.sectionCut} onChange={(value) => updateSetting("sectionCut", value)} />
              <Toggle label="Pressure" icon={<Gauge size={16} />} checked={settings.pressureMap} onChange={(value) => updateSetting("pressureMap", value)} />
            </div>
          </div>
        </aside>

        <section className="viewport-shell">
          <div className="top-bar">
            <div>
              <p className="eyebrow">Approximate visualization MVP</p>
              <h1>Interactive aerodynamic and hydrodynamic flow analysis</h1>
            </div>
            <div className="status-pill">
              <Activity size={16} />
              GPU viewport live
            </div>
          </div>

          <FlowViewport settings={settings} modelFile={modelFile} onStats={setStats} />

          <div className="viewport-footer">
            <span>{uploadMessage}</span>
            <span><Rotate3D size={15} /> Orbit, pan, zoom enabled</span>
          </div>
        </section>

        <aside className="right-panel">
          <Panel title="Geometry">
            <StatRow label="Model" value={stats.fileName} />
            <StatRow label="Vertices" value={stats.vertices.toLocaleString()} />
            <StatRow label="Faces" value={stats.faces.toLocaleString()} />
            <StatRow label="Bounds" value={stats.bounds} />
            <StatRow label="Volume est." value={stats.volumeEstimate} />
            <StatRow label="Topology" value={stats.status} />
          </Panel>

          <Panel title="Live Metrics">
            <Metric label="Drag coefficient" value={metrics.drag} tone="cyan" />
            <Metric label="Lift coefficient" value={metrics.lift} tone="green" />
            <Metric label="Pressure peak" value={metrics.pressure} tone="amber" />
            <Metric label="Flow velocity" value={metrics.velocity} tone="cyan" />
            <Metric label="Turbulence intensity" value={metrics.turbulence} tone="red" />
          </Panel>

          <Panel title="Roadmap">
            <div className="roadmap">
              <span>OpenFOAM bridge</span>
              <span>AI mesh optimization</span>
              <span>Cloud CFD history</span>
              <span>Collaborative labs</span>
            </div>
          </Panel>
        </aside>
      </div>
    </main>
  );
}

function ControlSlider({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="control">
      <span>
        {label}
        <strong>{Math.round(value)}{unit ? ` ${unit}` : ""}</strong>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Toggle({ label, icon, checked, onChange }: { label: string; icon: React.ReactNode; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className={`toggle ${checked ? "active" : ""}`} onClick={() => onChange(!checked)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "cyan" | "green" | "amber" | "red" }) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
