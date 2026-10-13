
import { useCallback, useEffect, useRef, useState } from "react";
import mqtt from "mqtt";

const MQTT_URL = "wss://broker.emqx.io:8084/mqtt";
const TELEMETRY_TOPIC = "smartclassroom/telemetry";
const COMMAND_TOPIC = "smartclassroom/commands";

export function useSmartClassroomMqtt() {
  const clientRef = useRef(null);

  const [connection, setConnection] = useState("disconnected");
  const [sensorData, setSensorData] = useState({
    motion: 0,
    ldr: null,
    temperature: null,
    humidity: null,
    light: false,
    fan: false,
    projector: false,
    smartboard: false,
    autoLight: false,
  });

  useEffect(() => {
    const client = mqtt.connect(MQTT_URL, {
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      clean: true,
    });

    clientRef.current = client;

    client.on("connect", () => {
      setConnection("connected");
      client.subscribe(TELEMETRY_TOPIC);
    });

    client.on("reconnect", () => setConnection("connecting"));
    client.on("offline", () => setConnection("disconnected"));
    client.on("close", () => setConnection("disconnected"));

    client.on("error", (error) => {
      console.error("MQTT error:", error.message);
    });

    client.on("message", (topic, message) => {
      if (topic !== TELEMETRY_TOPIC) return;

      try {
        const data = JSON.parse(message.toString());
        setSensorData((previous) => ({ ...previous, ...data }));
      } catch (error) {
        console.error("Invalid MQTT message:", error);
      }
    });

    return () => {
      clientRef.current = null;
      client.end(true);
    };
  }, []);

  const sendCommand = useCallback((command) => {
    const client = clientRef.current;

    if (!client?.connected) {
      console.error("MQTT is not connected");
      return false;
    }

    client.publish(
      COMMAND_TOPIC,
      JSON.stringify(command),
      { qos: 0 },
      (error) => {
        if (error) console.error("Publish failed:", error);
      }
    );

    return true;
  }, []);

  return { connection, sensorData, sendCommand };
}
