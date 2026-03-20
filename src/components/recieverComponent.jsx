import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function Receiver() {
  const { sessionId } = useParams();

  const [status, setStatus] = useState("Connecting...");
  const [fileMeta, setFileMeta] = useState(null);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState("");

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const receivedBuffers = useRef([]);
  const receivedSize = useRef(0);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    if (!sessionId) return;
    console.log("SESSION ID:", sessionId);
    const ws = new WebSocket(`ws://localhost:8080/ws?sessionId=${sessionId}`);
    console.log("ws",ws)
    wsRef.current = ws;

    ws.onopen = () => console.log("WS OPEN");
    ws.onmessage = (msg) => console.log("WS MESSAGE:", msg.data);
    ws.onerror = (e) => console.log("WS ERROR:", e);
    ws.onclose = () => console.log("WS CLOSED");

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;


    // ICE candidates
    pc.onicecandidate = (event) => {
      console.log("1")
      if (event.candidate) {
        ws.send(JSON.stringify({
          type: "candidate",
          candidate: event.candidate,
        }));
      }
    };

    // Receive data channel
    pc.ondatachannel = (event) => {
      console.log("2")

      const channel = event.channel;
      channel.onmessage = (e) => {
        // Handle metadata
        if (typeof e.data === "string") {
          const data = JSON.parse(e.data);
          if (data.type === "meta") {
            setFileMeta(data);
            setStatus("Receiving file...");
          }

          if (data.type === "end") {
            const blob = new Blob(receivedBuffers.current);
            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);
            setStatus("Download ready");
          }

          return;
        }

        // Binary data
        receivedBuffers.current.push(e.data);
        receivedSize.current += e.data.byteLength;

        if (fileMeta?.size) {
          setProgress((receivedSize.current / fileMeta.size) * 100);
        }
      };
    };

    // Handle signaling
    ws.onmessage = async (msg) => {
      console.log("SIGNAL RECEIVED:", msg.data);
      const data = JSON.parse(msg.data);

      if (data.type === "offer") {
        await pc.setRemoteDescription(data.offer);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        ws.send(JSON.stringify({
          type: "answer",
          answer,
        }));
      }

      if (data.type === "candidate") {
        await pc.addIceCandidate(data.candidate);
      }
    };
    console.log("Here running")
    return () => {
      ws.close();
      pc.close();
    };
  }, [sessionId]);

  return (
    <div className="app">
      <div className="card">

        <h2>Receiving File</h2>

        <p>{status}</p>

        {fileMeta && (
          <div>
            <div><strong>{fileMeta.name}</strong></div>
            <div>{formatBytes(fileMeta.size)}</div>

            <div style={{ width: "100%", background: "#222", height: 6, marginTop: 10 }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background: "#4caf50",
                }}
              />
            </div>
          </div>
        )}

        {downloadUrl && (
          <a href={downloadUrl} download={fileMeta?.name}>
            <button style={{ marginTop: 20 }}>
              Download File
            </button>
          </a>
        )}

      </div>
    </div>
  );
}