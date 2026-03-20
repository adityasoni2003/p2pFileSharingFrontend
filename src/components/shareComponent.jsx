import { useState, useRef, useCallback } from "react";
import { createSession } from "../utils/api";

const QR_API = (url) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&bgcolor=0a0a0a&color=f0e6d3&margin=12`;


function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function ShareThat() {
  const [state, setState] = useState("idle"); // idle | connecting | sending | done
  const [file, setFile] = useState(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);

  const fileInputRef = useRef();
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const channelRef = useRef(null);

  const handleFile = useCallback(async (f) => {
    if (!f) return;

    setFile(f);
    setState("connecting");

    try {
      const sessionId = await createSession();
      console.log("Generated Session ID",sessionId)
      const url = `http://localhost:5173/receive/${sessionId}`;
      setShareUrl(url);

      // 🔌 WebSocket
      const ws = new WebSocket(`ws://localhost:8080/ws?sessionId=${sessionId}`);
      wsRef.current = ws;

      // 🌐 WebRTC
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      const channel = pc.createDataChannel("file");
      channelRef.current = channel;

      // ICE
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
      };

      // Receive signaling
      ws.onmessage = async (msg) => {
        const data = JSON.parse(msg.data);

        console.log("SENDER GOT:", data);

        if (data.type === "ready") {
          console.log("BOTH CONNECTED → sending offer");

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          ws.send(JSON.stringify({
            type: "offer",
            offer
          }));
        }

        if (data.type === "answer") {
          console.log("ANSWER RECEIVED");

          await pc.setRemoteDescription(data.answer);
        }

        if (data.type === "candidate") {
          await pc.addIceCandidate(data.candidate);
        }
      };

      // Create offer
      ws.onopen = () => {
        console.log("WS OPEN (SENDER)");

        setTimeout(async () => {
          console.log("SENDING OFFER 🚀");

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          ws.send(JSON.stringify({
            type: "offer",
            offer
          }));
        }, 15000); 
      };

      // When channel opens → send file
      channel.onopen = () => {
        sendFile(f, channel);
      };

    } catch (err) {
      console.error(err);
      setState("idle");
    }
  }, []);

  function sendFile(file, channel) {
    const chunkSize = 16 * 1024;
    let offset = 0;

    // Send metadata first
    channel.send(JSON.stringify({
      type: "meta",
      name: file.name,
      size: file.size,
    }));

    const reader = new FileReader();

    reader.onload = (e) => {
      channel.send(e.target.result);
      offset += e.target.result.byteLength;

      setProgress((offset / file.size) * 100);

      if (offset < file.size) {
        readSlice(offset);
      } else {
        channel.send(JSON.stringify({ type: "end" }));
        setState("done");
      }
    };

    const readSlice = (o) => {
      const slice = file.slice(o, o + chunkSize);
      reader.readAsArrayBuffer(slice);
    };

    readSlice(0);
  }
  const onInputChange = (e) => handleFile(e.target.files?.[0]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setState("idle");
    setFile(null);
    setShareUrl("");
    setCopied(false);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="app">
    <div className="noise" />
    <div className="glow" />

    <div className="card">
        <div className="header">
        <div className="logo-mark">
            <svg viewBox="0 0 20 20" fill="none">
            <path d="M10 2L14 7H11V13H9V7H6L10 2Z" fill="white" />
            <path d="M4 15H16V17H4V15Z" fill="white" opacity="0.7" />
            </svg>
        </div>
        <span className="logo-text">Share<span>That</span></span>
        <span className="tagline">Instant file sharing</span>
        </div>

        <div className="body">
        {state === "idle" && (
            <div
            className={`dropzone${dragOver ? " over" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            >
            <div className="drop-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 3L17 9H14V16H10V9H7L12 3Z" fill="#e8703a" />
                <path d="M5 19H19V21H5V19Z" fill="#666" />
                </svg>
            </div>
            <div>
                <div className="drop-title">Drop your file here</div>
                <div className="drop-sub">or click to browse from your device<br />Any file type · Up to 2 GB</div>
            </div>
            <button className="browse-btn" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                Browse files
            </button>
            <input ref={fileInputRef} type="file" onChange={onInputChange} />
            </div>
        )}

        {state === "uploading" && (
            <div className="upload-state">
            <div className="file-row">
                <div className="file-icon">📄</div>
                <div className="file-info">
                <div className="file-name">{file?.name}</div>
                <div className="file-size">{formatBytes(file?.size ?? 0)}</div>
                </div>
            </div>
            <div className="progress-wrap">
                <div className="progress-label">
                <span>Uploading…</span>
                <span>{Math.round(progress)}%</span>
                </div>
                <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
            </div>
            <div className="dots">
                <div className="dot" /> <div className="dot" /> <div className="dot" />
            </div>
            </div>
        )}

        {shareUrl && (
            <div className="done-state">
            <div className="success-badge">
                <span className="success-dot" />
                Link ready — scan or copy
            </div>

            <div className="qr-wrap">
                <div className="qr-frame">
                <span />
                <img src={QR_API(shareUrl)} alt="QR Code" width={180} height={180} />
                </div>
                <span className="qr-hint">Scan with any camera app</span>
            </div>

            <div className="url-box">
                <input className="url-text" readOnly value={shareUrl} />
                <button className={`copy-btn${copied ? " copied" : ""}`} onClick={copyUrl}>
                {copied ? "✓ Copied" : "Copy"}
                </button>
            </div>

            <button className="share-again" onClick={reset}>
                ↑ Share another file
            </button>
            </div>
        )}
        </div>

        <div className="footer-note">
        Files are encrypted in transit · Sharing stops if tab closes
        </div>
    </div>
    </div>

  );
}