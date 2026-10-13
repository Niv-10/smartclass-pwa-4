# SmartClass — React Smart Classroom Dashboard

A responsive React + Vite prototype for the Smart Classroom project.

## Run locally

1. Install Node.js (LTS).
2. Extract this ZIP.
3. Open a terminal in the extracted `smart-classroom-app` folder.
4. Run:

   ```bash
   npm install
   npm run dev
   ```

5. Open the local URL printed by Vite (usually `http://localhost:5173`).

To test on your phone, keep your computer and phone on the same Wi-Fi and open the network URL printed by Vite.

## Current prototype

- Simulation mode generates illustrative temperature, humidity and LDR readings.
- AUTO mode: lights turn on when the LDR value is below 2000; fan turns on at 25°C or above; all appliances turn off when the room is empty; projector and smartboard stay off in AUTO mode.
- MANUAL mode enables appliance switches.
- Energy is an estimate based on assumed appliance wattages and elapsed time. It is not a real electrical measurement.
- The ESP32 connection panel is a scaffold for later integration.

## Expected ESP32 web API (to implement in firmware)

`GET /api/status` should return JSON similar to:

```json
{
  "occupied": true,
  "temperature": 27.2,
  "humidity": 61,
  "light": 1430,
  "devices": {
    "lights": true,
    "fan": true,
    "projector": false,
    "smartboard": false
  }
}
```

`POST /api/device` accepts JSON such as:

```json
{ "device": "lights", "state": true }
```

The firmware must implement both endpoints and return suitable JSON/HTTP status codes. If the browser app and ESP32 are on different origins, the ESP32 server must also allow CORS preflight/requests. Direct web-server control generally requires the phone and ESP32 to be reachable on the same local network.

## Before connecting physical hardware

- Update the ESP32 IP/base URL in the app's connection settings.
- Confirm the API paths and JSON match the firmware.
- Check relay active-high/active-low behavior and GPIO assignments.
- Never connect mains-powered appliances to a breadboard. Use properly rated, enclosed hardware and qualified supervision.
