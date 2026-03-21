import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getIceServers } from "../utils/api";

const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL;

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
    if (!sessionId) return;

    let ws;
    let pc;

    const init = async () => {
      console.log("SESSION ID:", sessionId);

      // ✅ 1. Get ICE servers FIRST
      const iceServers = await getIceServers();

      // ✅ 2. Create PeerConnection FIRST
      pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        console.log("ICE STATE:", pc.iceConnectionState);
      };

      // ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "candidate",
            candidate: event.candidate,
          }));
        }
      };

      // Data channel
      pc.ondatachannel = (event) => {
        console.log("DATA CHANNEL RECEIVED ✅");

        const channel = event.channel;

        channel.onmessage = (e) => {
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

          receivedBuffers.current.push(e.data);
          receivedSize.current += e.data.byteLength;

          if (fileMeta?.size) {
            setProgress((receivedSize.current / fileMeta.size) * 100);
          }
        };
      };

      // ✅ 3. THEN create WebSocket
      ws = new WebSocket(`${wsBaseUrl}/ws?sessionId=${sessionId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WS OPEN (receiver)");
      };

      // signaling
      ws.onmessage = async (msg) => {
        console.log("SIGNAL RECEIVED:", msg.data);

        const data = JSON.parse(msg.data);

        if (data.type === "offer") {
          console.log("OFFER RECEIVED ✅");

          await pc.setRemoteDescription(data.offer);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          ws.send(JSON.stringify({
            type: "answer",
            answer,
          }));
        }

        if (data.type === "candidate") {
          try {
            await pc.addIceCandidate(data.candidate);
          } catch (e) {
            console.log("ICE ERROR", e);
          }
        }
      };
    };

    init();

    // ✅ CLEANUP FIXED
    return () => {
      console.log("CLEANUP");

      if (ws) ws.close();
      if (pc) pc.close();
    };

  }, [sessionId]);

return (
  <div className="receiver-app">
    <div className="receiver-card">

      <h2 className="receiver-title">Receiving File</h2>
      <p className="receiver-status">{status}</p>

      {fileMeta && (
        <div className="file-info-box">
          <div className="file-name">{fileMeta.name}</div>
          <div className="file-size">{formatBytes(fileMeta.size)}</div>

          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="progress-text">
            {Math.round(progress)}%
          </div>
        </div>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download={fileMeta?.name}
          className="download-link"
        >
          <button className="download-btn">
            ⬇ Download File
          </button>
        </a>
      )}

    </div>
  </div>
  )

}