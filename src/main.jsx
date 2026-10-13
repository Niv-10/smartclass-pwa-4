import React, { useEffect, useMemo, useState } from "react";

import { createRoot } from "react-dom/client";

import {

  Activity, AirVent, BookOpen, Check, ChevronDown, CircleHelp, Cloud,

  CloudOff, Cpu, Fan, Lightbulb, Monitor, Power, RefreshCw, Settings2,

  ShieldCheck, Signal, Thermometer, Users, Wifi, Zap

} from "lucide-react";

import "./styles.css";



const initialDevices = [

  { id: "lights", name: "Classroom lights", detail: "Ceiling LED bulbs", icon: Lightbulb, on: true, watts: 36 },

  { id: "fan", name: "Fan", detail: "DC rotor fan", icon: Fan, on: true, watts: 24 },

  { id: "projector", name: "Projector", detail: "Presentation equipment", icon: Monitor, on: false, watts: 180 },

  { id: "smartboard", name: "Smartboard", detail: "Interactive display", icon: BookOpen, on: false, watts: 120 }

];



function App() {

  const [mode, setMode] = useState("AUTO");

  const [devices, setDevices] = useState(initialDevices);

  const [connectionMode, setConnectionMode] = useState("simulation");

  const [espUrl, setEspUrl] = useState("http\://192.168.4.1");

  const [settingsOpen, setSettingsOpen] = useState(false);

  const [connected, setConnected] = useState(false);

  const [sensor, setSensor] = useState({ occupied: true, temperature: 27.2, humidity: 61, light: 1430, pir: 1 });

  const [randomSimulation, setRandomSimulation] = useState(false);

  const [lastUpdate, setLastUpdate] = useState(new Date());

  const [runtimeSeconds, setRuntimeSeconds] = useState(0);

  const [notice, setNotice] = useState("Simulation mode is active. No physical ESP32 is connected.");

  const [energyWh, setEnergyWh] = useState(0);



  const totalPower = useMemo(

    () => devices.reduce((sum, d) => sum + (d.on ? d.watts : 0), 0),

    [devices]

  );



  // Simulation data is intentionally labeled as simulated. AUTO mode applies the sensor rules.

  useEffect(() => {

    if (connectionMode !== "simulation" || !randomSimulation) return;

    const timer = setInterval(() => {

      setSensor(prev => {

        const temperature = Math.max(22, Math.min(33, prev.temperature + (Math.random() - 0.48) * 0.35));

        const light = Math.max(300, Math.min(3600, prev.light + Math.round((Math.random() - 0.5) * 180)));

        return { ...prev, temperature: Number(temperature.toFixed(1)), humidity: Math.max(35, Math.min(80, Math.round(prev.humidity + (Math.random() - 0.5) * 2))), light, pir: prev.occupied ? 1 : 0 };

      });

      setLastUpdate(new Date());

    }, 3000);

    return () => clearInterval(timer);

  }, [connectionMode, randomSimulation]);



  useEffect(() => {

    const timer = setInterval(() => {

      setRuntimeSeconds(s => s + 1);

      setEnergyWh(v => v + totalPower / 3600);

    }, 1000);

    return () => clearInterval(timer);

  }, [totalPower]);



  useEffect(() => {
    // In hardware mode, the ESP32 is the source of truth for appliance states.
    if (mode !== "AUTO" || connectionMode === "hardware") return;

    const occupied = sensor.occupied;
    setDevices(prev => prev.map(d => {
      if (!occupied) return { ...d, on: false };
      if (d.id === "lights") return { ...d, on: sensor.light < 2000 };
      if (d.id === "fan") return { ...d, on: sensor.temperature >= 25 };
      if (d.id === "projector" || d.id === "smartboard") return { ...d, on: false };
      return d;
    }));
  }, [mode, connectionMode, sensor.occupied, sensor.light, sensor.temperature]);



  async function connectEsp() {
    const root = espUrl.trim().replace(/\/+$/, "");
    if (!root) {
      setNotice("Enter the ESP32 web-server address first.");
      return;
    }

    setNotice("Trying to reach ESP32…");
    try {
      const response = await fetch(`${root}/api/status`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      setSensor(prev => ({
        ...prev,
        temperature: data.temperature != null ? Number(data.temperature) : prev.temperature,
        humidity: data.humidity != null ? Number(data.humidity) : prev.humidity,
        // ESP32 uses "ldr" for the sensor reading; "light" is the relay state.
        light: data.ldr != null ? Number(data.ldr) : prev.light,
        occupied: data.occupied != null
          ? Boolean(data.occupied)
          : data.motion != null ? Number(data.motion) === 1 : prev.occupied,
        pir: data.motion != null ? Number(data.motion) : prev.pir
      }));

      if (data.devices) {
        setDevices(prev => prev.map(d => ({
          ...d,
          on: data.devices[d.id] != null ? Boolean(data.devices[d.id]) : d.on
        })));
      }

      setConnected(true);
      setConnectionMode("hardware");
      setLastUpdate(new Date());
      setNotice("Connected to ESP32. Live sensor updates enabled.");

      // Keep the ESP32's automatic-lighting mode aligned with the dashboard.
      if (mode === "AUTO") {
        await fetch(`${root}/api/auto-light`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true })
        });
      }
    } catch (error) {
      setConnected(false);
      setNotice(`Connection failed: ${error.message}. Check ESP32 Wi-Fi, URL and API.`);
    }
  }

  // Poll the ESP32 continuously while hardware mode is active.
  useEffect(() => {
    if (connectionMode !== "hardware") return;

    let cancelled = false;
    const root = espUrl.trim().replace(/\/+$/, "");

    const refreshHardware = async () => {
      try {
        const response = await fetch(`${root}/api/status`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (cancelled) return;

        setSensor(prev => ({
          ...prev,
          temperature: data.temperature != null ? Number(data.temperature) : prev.temperature,
          humidity: data.humidity != null ? Number(data.humidity) : prev.humidity,
          light: data.ldr != null ? Number(data.ldr) : prev.light,
          occupied: data.occupied != null
            ? Boolean(data.occupied)
            : data.motion != null ? Number(data.motion) === 1 : prev.occupied,
          pir: data.motion != null ? Number(data.motion) : prev.pir
        }));

        if (data.devices) {
          setDevices(prev => prev.map(d => ({
            ...d,
            on: data.devices[d.id] != null ? Boolean(data.devices[d.id]) : d.on
          })));
        }
        setLastUpdate(new Date());
        setConnected(true);
      } catch (error) {
        if (!cancelled) {
          setConnected(false);
          setNotice(`Live update failed: ${error.message}`);
        }
      }
    };

    refreshHardware();
    const timer = setInterval(refreshHardware, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connectionMode, espUrl]);

  async function sendDeviceCommand(id, on) {

    if (connectionMode === "hardware") {

      const root = espUrl.trim().replace(/\/+$/, "");

      try {

        const response = await fetch(`${root}/api/device`, {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ device: id, state: on })

        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        setNotice(`${id} command sent to ESP32.`);

      } catch (error) {

        setNotice(`Command failed: ${error.message}`);

        return;

      }

    }

    setDevices(prev => prev.map(d => d.id === id ? { ...d, on } : d));

  }



  async function toggleMode(nextMode) {
    setMode(nextMode);

    if (connectionMode === "hardware") {
      const root = espUrl.trim().replace(/\/+$/, "");
      try {
        const response = await fetch(`${root}/api/auto-light`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: nextMode === "AUTO" })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setNotice(nextMode === "AUTO"
          ? "AUTO mode enabled on ESP32. Lights follow motion and ambient light."
          : "MANUAL mode enabled. Use appliance switches below.");
      } catch (error) {
        setNotice(`Could not change ESP32 mode: ${error.message}`);
      }
    } else if (nextMode === "AUTO") {
      setNotice("Automatic simulation enabled. Lights and fan follow simulated sensors.");
    } else {
      setNotice("Manual mode enabled. Use the appliance switches below.");
    }
  }

  function resetSimulation() {

    setConnectionMode("simulation");

    setConnected(false);

    setMode("AUTO");

    setSensor({ occupied: true, temperature: 27.2, humidity: 61, light: 1430, pir: 1 });

    setDevices(initialDevices);

    setEnergyWh(0);

    setRuntimeSeconds(0);

    setLastUpdate(new Date());

    setNotice("Simulation reset. No physical ESP32 is connected.");

  }



  const fmtTime = lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const energyLabel = energyWh >= 1000 ? `${(energyWh / 1000).toFixed(3)} kWh` : `${energyWh.toFixed(2)} Wh`;



  return (

    <div className="app-shell">

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-icon"><Cpu size={22} /></div>

          <div><strong>SmartClass</strong><span>IoT CONTROL</span></div>

        </div>

        <div className="side-label">WORKSPACE</div>

        <div className="nav-item active"><Activity size={18} /> Overview</div>

        <div className="nav-item"><Power size={18} /> Appliances <span className="nav-count">4</span></div>

        <div className="nav-item"><Zap size={18} /> Energy</div>

        <div className="nav-item"><Settings2 size={18} /> Settings</div>

        <div className="sidebar-bottom">

          <div className="side-status"><span className={`status-dot ${connected ? "green" : "blue"}`} /><div><b>{connected ? "ESP32 connected" : "Simulation active"}</b><small>{connected ? "Hardware mode" : "Demo data"}</small></div></div>

          <div className="version">SMART CLASSROOM · v1.0</div>

        </div>

      </aside>



      <main className="main-content">

        <header className="topbar">

          <div className="mobile-brand"><div className="brand-icon"><Cpu size={20} /></div><strong>SmartClass</strong></div>

          <div className="breadcrumb">Workspace <span>/</span> <b>Overview</b></div>

          <div className="top-actions">

            <span className={`connection-pill ${connected ? "connected" : ""}`}><span className="status-dot" />{connected ? "ESP32 connected" : "Simulated data"}</span>

            <button className="icon-button" onClick={() => setSettingsOpen(v => !v)} aria-label="Connection settings"><Settings2 size={18} /></button>

          </div>

        </header>



        {settingsOpen && <section className="connection-panel">

          <div className="connection-panel-title"><div><h3>Device connection</h3><p>Connect later to the ESP32 web server on the same Wi-Fi network.</p></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><ChevronDown size={18}/></button></div>

          <div className="connection-row">

            <label htmlFor="esp-url">ESP32 base URL</label>

            <input id="esp-url" value={espUrl} onChange={e => setEspUrl(e.target.value)} placeholder="http\://192.168.4.1" />

            <button className="primary-button" onClick={connectEsp}><Wifi size={16}/> Connect</button>

          </div>

          <p className="small-note">Expected endpoints: <code>GET /api/status</code> and <code>POST /api/device</code>. Your ESP32 firmware must implement these routes and allow browser CORS requests.</p>

        </section>}



        <section className="welcome-row">

          <div><div className="eyebrow"><span className="eyebrow-line" /> CLASSROOM MANAGEMENT</div><h1>Good evening, <span>Admin.</span></h1><p className="subheading">Monitor your classroom environment and manage appliances in real time.</p></div>

          <div className="date-chip"><Activity size={16}/><span>Updated {fmtTime}</span><button onClick={() => { setLastUpdate(new Date()); setNotice("Dashboard refreshed."); }} aria-label="Refresh"><RefreshCw size={14}/></button></div>

        </section>



        <section className="hero-dashboard">

          <article className="hero-room-card">

            <div className="hero-card-top"><span className="hero-kicker">LIVE CLASSROOM</span><span className="hero-room-id">ROOM 204</span></div>

            <div className="room-illustration" aria-hidden="true">

              <div className="room-window"></div><div className="room-board"><span>SMART</span><span>CLASS</span></div>

              <div className="room-desk desk-one"></div><div className="room-desk desk-two"></div><div className="room-desk desk-three"></div>

              <div className="room-person"><span></span></div>

            </div>

            <div className="hero-room-bottom"><div><h2>{sensor.occupied ? "Classroom is active" : "Classroom is empty"}</h2><p>{sensor.occupied ? "Motion detected by the PIR sensor" : "No motion detected right now"}</p></div><span className={`hero-status ${sensor.occupied ? "is-occupied" : ""}`}><i/> {sensor.occupied ? "OCCUPIED" : "EMPTY"}</span></div>

          </article>

          <article className="hero-activity-card">

            <div className="hero-kicker">APPLIANCE ACTIVITY</div>

            <div className="activity-ring" style={{"--activity": `${devices.filter(d => d.on).length / devices.length * 100}%`}}><div><strong>{devices.filter(d => d.on).length}<small>/ {devices.length}</small></strong><span>ACTIVE</span></div></div>

            <h3>Classroom systems</h3><p>{devices.filter(d => d.on).length === 1 ? "1 appliance is" : `${devices.filter(d => d.on).length} appliances are`} currently switched on</p>

            <div className="activity-legend"><span><i className="legend-on"/> Running</span><span><i className="legend-off"/> Standby</span></div>

          </article>

          <article className="hero-quick-panel">

            <div className="hero-quick-heading"><div><span className="hero-kicker">QUICK OVERVIEW</span><h3>Device status</h3></div><span className="quick-live"><i/> LIVE</span></div>

            {devices.map(device => { const Icon = device.icon; return <div className="quick-device" key={`quick-${device.id}`}><span className={`quick-device-icon ${device.on ? "running" : ""}`}><Icon size={17}/></span><span className="quick-device-name">{device.name}</span><span className={`quick-state ${device.on ? "running" : ""}`}>{device.on ? "ON" : "OFF"}</span></div>; })}

            <div className="quick-panel-footer"><span className={`status-dot ${connected ? "green" : "blue"}`}/>{connected ? "ESP32 connected" : "Demo simulation"}</div>

          </article>

        </section>



        <section className="stats-grid">

          <article className="stat-card">

            <div className="stat-top"><span>CLASSROOM STATUS</span><div className="stat-icon blue"><Users size={19}/></div></div>

            <div className="stat-value">{sensor.occupied ? "Occupied" : "Empty"}</div>

            <div className="stat-foot"><span className={`status-dot ${sensor.occupied ? "green" : "muted"}`}/>{sensor.occupied ? "Motion detected" : "No occupancy detected"}</div>

          </article>

          <article className="stat-card">

            <div className="stat-top"><span>TEMPERATURE</span><div className="stat-icon orange"><Thermometer size={19}/></div></div>

            <div className="stat-value">{sensor.temperature.toFixed(1)}<small>°C</small></div>

            <div className="stat-foot"><span className="mini-tag">{sensor.temperature >= 25 ? "Fan threshold reached" : "Below fan threshold"}</span></div>

          </article>

          <article className="stat-card">

            <div className="stat-top"><span>HUMIDITY</span><div className="stat-icon purple"><AirVent size={19}/></div></div>

            <div className="stat-value">{sensor.humidity}<small>%</small></div>

            <div className="stat-foot"><span className="neutral-text">DHT sensor reading</span></div>

          </article>

          <article className="stat-card">

            <div className="stat-top"><span>EST. ENERGY USED</span><div className="stat-icon yellow"><Zap size={19}/></div></div>

            <div className="stat-value">{energyLabel}</div>

            <div className="stat-foot"><span className="neutral-text">{totalPower} W estimated active load</span></div>

          </article>

        </section>



        {connectionMode === "simulation" && <section className="panel sim-controls">

          <div className="panel-header">

            <div><h2>Simulation controls</h2><p>Change sensor inputs and test the automatic rules yourself.</p></div>

            <button className={`sim-live-button ${randomSimulation ? "active" : ""}`} onClick={() => setRandomSimulation(v => !v)}>

              <Activity size={15}/>{randomSimulation ? "Random data: ON" : "Manual test: ON"}

            </button>

          </div>

          <div className="sim-control-grid">

            <div className="sim-control">

              <div className="sim-control-title"><label htmlFor="sim-temp">Temperature</label><b>{sensor.temperature.toFixed(1)} °C</b></div>

              <input id="sim-temp" type="range" min="18" max="40" step="0.5" value={sensor.temperature} onChange={e => setSensor(s => ({...s, temperature: Number(e.target.value)}))} disabled={randomSimulation}/>

              <div className="range-labels"><span>18°C</span><span>40°C</span></div>

            </div>

            <div className="sim-control">

              <div className="sim-control-title"><label htmlFor="sim-light">Ambient light (LDR)</label><b>{sensor.light}</b></div>

              <input id="sim-light" type="range" min="0" max="4095" step="50" value={sensor.light} onChange={e => setSensor(s => ({...s, light: Number(e.target.value)}))} disabled={randomSimulation}/>

              <div className="range-labels"><span>Dark · 0</span><span>Bright · 4095</span></div>

            </div>

            <div className="sim-control">

              <div className="sim-control-title"><label htmlFor="sim-humidity">Humidity</label><b>{sensor.humidity}%</b></div>

              <input id="sim-humidity" type="range" min="20" max="90" value={sensor.humidity} onChange={e => setSensor(s => ({...s, humidity: Number(e.target.value)}))} disabled={randomSimulation}/>

              <div className="range-labels"><span>20%</span><span>90%</span></div>

            </div>

            <div className="sim-control occupancy-control">

              <div><label>Classroom occupancy</label><p>{sensor.occupied ? "Motion detected — classroom occupied" : "No motion — classroom empty"}</p></div>

              <button className={`occupancy-button ${sensor.occupied ? "occupied" : ""}`} onClick={() => setSensor(s => ({...s, occupied: !s.occupied, pir: s.occupied ? 0 : 1}))} disabled={randomSimulation}>

                <Users size={15}/>{sensor.occupied ? "Set empty" : "Set occupied"}

              </button>

            </div>

          </div>

          <div className="sim-hint"><ShieldCheck size={15}/> In AUTO mode, test: temperature ≥ 25°C turns the fan on; LDR below 2000 turns lights on; empty classroom turns all appliances off.</div>

        </section>}



        <section className="content-grid">

          <article className="panel appliances-panel">

            <div className="panel-header"><div><h2>Appliance control</h2><p>Manage connected classroom equipment</p></div><span className="count-badge">{devices.filter(d => d.on).length} / {devices.length} ON</span></div>

            <div className="mode-switch-wrap">

              <div className="mode-label"><span className="mode-icon"><Settings2 size={17}/></span><div><b>Control mode</b><small>{mode === "AUTO" ? "Sensors manage appliances automatically" : "You control each appliance manually"}</small></div></div>

              <div className="segmented"><button className={mode === "AUTO" ? "selected" : ""} onClick={() => toggleMode("AUTO")}>AUTO</button><button className={mode === "MANUAL" ? "selected" : ""} onClick={() => toggleMode("MANUAL")}>MANUAL</button></div>

            </div>

            <div className="device-list">

              {devices.map(device => {

                const Icon = device.icon;

                return <div className="device-row" key={device.id}>

                  <div className={`device-icon ${device.on ? "is-on" : ""}`}><Icon size={21}/></div>

                  <div className="device-info"><b>{device.name}</b><small>{device.detail} · {device.watts} W assumed</small></div>

                  <div className={`device-state ${device.on ? "on" : ""}`}>{device.on ? "ON" : "OFF"}</div>

                  <button className={`toggle ${device.on ? "checked" : ""}`} role="switch" aria-checked={device.on} aria-label={`Toggle ${device.name}`} disabled={mode === "AUTO"} onClick={() => sendDeviceCommand(device.id, !device.on)}><span/></button>

                </div>;

              })}

            </div>

            <div className="panel-footer"><ShieldCheck size={16}/><span>{mode === "AUTO" ? "Automatic rules: lights turn on when dark; fan turns on at 25°C; all appliances turn off when the room is empty." : "Manual override is active. Appliance switches are enabled."}</span></div>

          </article>



          <div className="right-column">

            <article className="panel environment-panel">

              <div className="panel-header"><div><h2>Environment</h2><p>Live sensor overview</p></div><span className="live-indicator"><span/>LIVE</span></div>

              <div className="sensor-line"><div className="sensor-symbol yellow"><Lightbulb size={17}/></div><div className="sensor-label"><b>Ambient light</b><small>LDR · ADC value</small></div><strong>{sensor.light}<small> / 4095</small></strong></div>

              <div className="meter"><span style={{width: `${Math.min(100, sensor.light / 4095 * 100)}%`}}/></div>

              <div className="sensor-line"><div className="sensor-symbol green"><Activity size={17}/></div><div className="sensor-label"><b>Motion sensor</b><small>HC-SR501 PIR</small></div><strong className={sensor.occupied ? "text-green" : "text-muted"}>{sensor.occupied ? "DETECTED" : "CLEAR"}</strong></div>

              <div className="sensor-line"><div className="sensor-symbol blue"><Thermometer size={17}/></div><div className="sensor-label"><b>Climate sensor</b><small>Temperature + humidity</small></div><strong>ONLINE</strong></div>

              <div className="environment-bottom"><span><span className="status-dot green"/> Sensors operational</span><span>Updated {fmtTime}</span></div>

            </article>

            <article className="panel energy-panel">

              <div className="panel-header"><div><h2>Energy snapshot</h2><p>Estimated from assumed appliance wattage</p></div><div className="energy-icon"><Zap size={18}/></div></div>

              <div className="energy-number">{energyLabel}</div>

              <div className="energy-sub">Since this session started</div>

              <div className="energy-divider"/>

              <div className="energy-breakdown"><span>Active appliances</span><b>{devices.filter(d => d.on).length}</b></div>

              <div className="energy-breakdown"><span>Estimated load</span><b>{totalPower} W</b></div>

              <div className="energy-breakdown"><span>Session runtime</span><b>{Math.floor(runtimeSeconds / 60)}m {runtimeSeconds % 60}s</b></div>

            </article>

          </div>

        </section>



        <footer className="page-footer"><div><span className="footer-logo"><Cpu size={15}/></span><b>SmartClass</b><span>Smart Classroom Energy Management</span></div><div><span className="status-dot green"/>{connectionMode === "simulation" ? "Simulation mode · values are illustrative" : connected ? "Connected to ESP32" : "Hardware connection not verified"}</div></footer>

        {notice && <div className="toast" role="status"><span className="toast-dot"/>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}

      </main>

    </div>

  );

}



createRoot(document.getElementById("root")).render(<App />);