import { useEffect, useRef, useState } from "react";
import "./App.css";
const API = "https://aura-skincare-ai-voice-agent-cbgn.onrender.com";
const initialMessages = [
  {
    role: "assistant",
    text: "Hello! 🌊 Welcome to Aura Skincare. I can help with your orders, delivery updates, and skincare questions. How can I help you today?",
  },
];
function Icon({ name }) {
  const icons = {
    dashboard: "⌂",
    orders: "▤",
    agent: "◉",
    login: "↪",
    register: "＋",
    logout: "⇥",
    send: "➤",
    search: "⌕",
  };
  return <span className="nav-icon">{icons[name] || "•"}</span>;
}
function App() {
  const [page, setPage] = useState("Dashboard");
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const callActiveRef = useRef(false);
  const recognitionRef = useRef(null);
  const pendingGreetingRef = useRef("");

  // Voice-call state and post-call transcript/summary.
  const [callActive, setCallActive] = useState(false);
  const [callState, setCallState] = useState("Idle");
  const [callTranscript, setCallTranscript] = useState([]);
  const [callSummary, setCallSummary] = useState(null);
  const [callStartedAt, setCallStartedAt] = useState(null);
  // Damaged product photo upload
  const [damagePhoto, setDamagePhoto] = useState(null);
  const [damagePreview, setDamagePreview] = useState("");
  const [damageOrderId, setDamageOrderId] = useState("");
  const [damageDescription, setDamageDescription] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  // Demo-only authentication
  const [currentUser, setCurrentUser] = useState(null);
  const [demoUsers, setDemoUsers] = useState([]);
  const [authMessage, setAuthMessage] = useState("");
  useEffect(() => {
    loadOrders();
  }, []);
  useEffect(() => {
    if (!damagePhoto) {
      setDamagePreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(damagePhoto);
    setDamagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [damagePhoto]);
  async function loadOrders() {
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const response = await fetch(`${API}/orders`);
      if (!response.ok) {
        throw new Error("Could not load orders.");
      }
      const data = await response.json();
      const list = Array.isArray(data)
        ? data
        : data.orders || data.data || [];
      setOrders(Array.isArray(list) ? list : []);
    } catch {
      setOrdersError(
        "Unable to load orders. Make sure your FastAPI backend is running."
      );
    } finally {
      setOrdersLoading(false);
    }
  }
  function getOrderId(order) {
    return order.order_id || order.id || order.orderId || "N/A";
  }
  function getProduct(order) {
    return (
      order.product ||
      order.product_name ||
      order.productName ||
      order.item ||
      "Skincare product"
    );
  }
  function getStatus(order) {
    return (
      order.status ||
      order.order_status ||
      order.delivery_status ||
      "Processing"
    );
  }
  function getCustomer(order) {
    return order.customer_name || order.customer || order.name || "Customer";
  }
  function getDelivery(order) {
    return (
      order.expected_delivery ||
      order.delivery_date ||
      order.estimated_delivery ||
      order.estimatedDelivery ||
      "Not available"
    );
  }
  function speak(text, isCall = callActiveRef.current) {
    if (!voiceEnabled || !("speechSynthesis" in window)) {
      if (isCall && callActiveRef.current) startListening(true);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 1;
    utterance.pitch = 1;

    if (isCall) setCallState("Speaking");
    utterance.onend = () => {
      if (isCall && callActiveRef.current) {
        setCallState("Listening");
        startListening(true);
      }
    };
    utterance.onerror = () => {
      if (isCall && callActiveRef.current) {
        setCallState("Listening");
        startListening(true);
      }
    };
    window.speechSynthesis.speak(utterance);
  }

  function startCall() {
    if (callActiveRef.current) return;
    const startedAt = new Date().toISOString();
    const greeting =
      "Hello! I'm Aria from Aura Skincare. How can I help you today?";

    callActiveRef.current = true;
    setCallActive(true);
    setCallState("Speaking");
    setCallStartedAt(startedAt);
    setCallSummary(null);
    setError("");
    setCallTranscript([
      {
        role: "assistant",
        text: greeting,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    // Start recognition directly from the button click so Chrome can request microphone permission.
    pendingGreetingRef.current = greeting;
    startListening(true);
  }

  function endCall() {
    callActiveRef.current = false;
    setCallActive(false);
    setCallState("Idle");
    setListening(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (_) {
        // Recognition may already have stopped.
      }
      recognitionRef.current = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();

    const transcript = [...callTranscript];
    const userMessages = transcript
      .filter((item) => item.role === "user")
      .map((item) => item.text);
    const combinedText = transcript.map((item) => item.text).join(" ");
    const orderMatch = combinedText.match(/\bORD-\d+\b/i);
    const allUserText = userMessages.join(" ").toLowerCase();

    let intent = "general_support";
    if (/order|deliver|tracking|shipment/.test(allUserText)) intent = "shipping";
    else if (/cancel/.test(allUserText)) intent = "cancellation";
    else if (/return|refund/.test(allUserText)) intent = "returns";
    else if (/damage|defect|broken/.test(allUserText)) intent = "damaged_product";
    else if (/skin|serum|sunscreen|moisturizer|cleanser/.test(allUserText)) intent = "skincare";

    setCallSummary({
      customer_intent: intent,
      order_id: orderMatch ? orderMatch[0].toUpperCase() : null,
      resolution_status: userMessages.length ? "Conversation completed" : "No customer query received",
      call_summary: userMessages.length
        ? userMessages.join(" | ")
        : "The call ended without a customer query.",
      started_at: callStartedAt,
      ended_at: new Date().toISOString(),
      transcript,
    });
  }

  async function sendMessage(messageOverride) {
    const text = (messageOverride ?? input).trim();
    if (!text || loading) return;
    const history = messages.map((item) => ({
      role: item.role,
      text: item.text,
    }));
    setMessages((previous) => [...previous, { role: "user", text }]);
    if (callActive) {
      setCallState("Thinking");
      setCallTranscript((previous) => [
        ...previous,
        { role: "user", text, timestamp: new Date().toLocaleTimeString() },
      ]);
    }
    setInput("");
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/support/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.detail || data.answer || "The AI could not respond."
        );
      }
      const answer =
        data.answer || "I'm sorry, I couldn't find an answer to that.";
      setMessages((previous) => [
        ...previous,
        { role: "assistant", text: answer },
      ]);
      if (callActive) {
        setCallTranscript((previous) => [
          ...previous,
          { role: "assistant", text: answer, timestamp: new Date().toLocaleTimeString() },
        ]);
      }

      speak(answer);

    } catch (err) {
      setError(
        err.message ||
          "I couldn't connect to the AI service. Check that your backend is running."
      );
      if (callActive) setCallState("Listening");
    } finally {
      setLoading(false);
    }

  }
  async function uploadDamagePhoto(event) {
    event.preventDefault();
    if (!damagePhoto) {
      setPhotoError("Please select a product photo first.");
      return;
    }
    if (damagePhoto.size > 5 * 1024 * 1024) {
      setPhotoError("The photo must be 5 MB or smaller.");
      return;
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(damagePhoto.type)) {
      setPhotoError("Please select a JPG, PNG, or WEBP image.");
      return;
    }
    setUploadingPhoto(true);
    setPhotoError("");
    setPhotoMessage("");
    try {
      const formData = new FormData();
      formData.append("photo", damagePhoto);
      if (damageOrderId.trim()) {
        formData.append("order_id", damageOrderId.trim());
      }
      if (damageDescription.trim()) {
        formData.append("description", damageDescription.trim());
      }
      const response = await fetch(`${API}/support/damaged-photo`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : data.message || "Photo upload failed.";
        throw new Error(detail);
      }
      setPhotoMessage(
        data.message || "Your product photo was uploaded successfully."
      );
      setDamagePhoto(null);
      setDamageOrderId("");
      setDamageDescription("");
    } catch (err) {
      setPhotoError(
        err.message ||
          "Could not upload the photo. Check your backend connection."
      );
    } finally {
      setUploadingPhoto(false);
    }
  }
  // Speech recognition often hears "ORD-101" as "ord one oh one" or "order 101".
  // Normalize common spoken versions before sending them to the backend.
  function normalizeSpokenOrderIds(value) {
    const digitWords = {
      zero: "0", oh: "0", o: "0",
      one: "1", won: "1",
      two: "2", to: "2", too: "2",
      three: "3", four: "4", for: "4",
      five: "5", six: "6", seven: "7", eight: "8", ate: "8", nine: "9",
    };

    let text = String(value || "");

    // Convert spoken digit groups, e.g. "ORD one zero one" or "order one oh one".
    text = text.replace(
      /\b(?:o\s*r\s*d|ord|order)\s+((?:(?:zero|oh|o|one|won|two|to|too|three|four|for|five|six|seven|eight|ate|nine)\s+){2,}(?:zero|oh|o|one|won|two|to|too|three|four|for|five|six|seven|eight|ate|nine))\b/gi,
      (match, spokenDigits) => {
        const digits = spokenDigits.trim().toLowerCase().split(/\s+/).map((word) => digitWords[word]).join("");
        return digits.length === 3 ? `ORD-${digits}` : match;
      }
    );

    // Normalize common text transcriptions: "ORD 101", "ord-101", "order 101".
    text = text.replace(/\b(?:o\s*r\s*d|ord|order)\s*[- ]?\s*(\d{3})\b/gi, "ORD-$1");
    return text;
  }

  function startListening(forCall = callActiveRef.current) {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(
        "Voice calling is not supported by this browser. Please use the latest Google Chrome on your laptop."
      );
      setCallState("Idle");
      if (forCall) {
        callActiveRef.current = false;
        setCallActive(false);
      }
      return;
    }

    if (recognitionRef.current && listening) return;

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    // Use one spoken turn at a time, then Aria replies and starts listening again.
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setError("");
      if (callActiveRef.current) setCallState("Listening");

      // Once Chrome grants/starts microphone access, stop the initial listener,
      // greet the customer, then reopen listening after Aria finishes speaking.
      if (pendingGreetingRef.current) {
        const greeting = pendingGreetingRef.current;
        pendingGreetingRef.current = "";
        try { recognition.stop(); } catch (_) {}
        speak(greeting, true);
      }
    };

    recognition.onend = () => {
      setListening(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError(
          "Microphone permission is blocked. In Chrome, click the site icon beside the address bar → Site settings → Microphone → Allow, then reload this page and click Start Call again. Also check Windows Settings → Privacy & security → Microphone."
        );
        setCallState("Idle");
        callActiveRef.current = false;
        setCallActive(false);
      } else if (event.error === "no-speech") {
        setError("I couldn't hear speech. Please speak clearly and try again.");
        if (callActiveRef.current) setCallState("Listening");
      } else if (event.error !== "aborted") {
        setError(`Microphone error: ${event.error}. Please try again.`);
        if (callActiveRef.current) setCallState("Listening");
      }
    };

    recognition.onresult = (event) => {
      const rawTranscript = event.results[event.resultIndex][0].transcript.trim();
      const transcript = normalizeSpokenOrderIds(rawTranscript);
      if (!transcript) return;
      if (callActiveRef.current || forCall) {
        try { recognition.stop(); } catch (_) {}
        sendMessage(transcript);
      } else {
        setInput(transcript);
      }
    };

    try {
      recognition.start();
    } catch (err) {
      setListening(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setError("Could not start the microphone. Check Chrome microphone permission and try again.");
    }
  }
  function handleRegister(event) {
    event.preventDefault();
    setAuthMessage("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    if (demoUsers.some((user) => user.email === email)) {
      setAuthMessage("An account with this email already exists in this demo.");
      return;
    }
    setDemoUsers((previous) => [...previous, { name, email, password }]);
    setCurrentUser({ name, email });
    setAuthMessage("Demo account created successfully.");
    setPage("Dashboard");
  }
  function handleLogin(event) {
    event.preventDefault();
    setAuthMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const user = demoUsers.find(
      (item) => item.email === email && item.password === password
    );
    if (!user) {
      setAuthMessage(
        "Demo account not found. Register in this session first. Real backend authentication is not connected yet."
      );
      return;
    }
    setCurrentUser({ name: user.name, email: user.email });
    setPage("Dashboard");
  }
  function logout() {
    setCurrentUser(null);
    setPage("Login");
    setAuthMessage("");
  }
  const filteredOrders = orders.filter((order) => {
    const searchText = [
      getOrderId(order),
      getProduct(order),
      getStatus(order),
      getCustomer(order),
    ]
      .join(" ")
      .toLowerCase();
    return searchText.includes(search.toLowerCase());
  });
  const deliveredCount = orders.filter((order) =>
    getStatus(order).toLowerCase().includes("deliver")
  ).length;
  const activeCount = Math.max(orders.length - deliveredCount, 0);
  function renderDashboard() {
    return (
      <>
        <div className="welcome-banner">
          <div>
            <p className="eyebrow">YOUR PERSONAL SKINCARE ASSISTANT</p>
            <h2>A little care goes a long way.</h2>
            <p>
              Manage your orders and get friendly help from your Aura AI agent.
            </p>
            <button
              className="primary-btn"
              onClick={() => setPage("AI Voice Agent")}
            >
              Talk to Aura <span>↗</span>
            </button>
          </div>
          <div className="banner-art" aria-hidden="true">
            <div className="art-circle">
              <span>✿</span>
            </div>
            <span className="art-wave">〰</span>
          </div>
        </div>
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR OVERVIEW</p>
            <h2>Dashboard</h2>
          </div>
          <button className="outline-btn" onClick={loadOrders}>
            ↻ Refresh orders
          </button>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📦</div>
            <p>Total orders</p>
            <h3>{orders.length}</h3>
            <span>Orders in your system</span>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🌊</div>
            <p>In progress</p>
            <h3>{activeCount}</h3>
            <span>Not yet delivered</span>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✓</div>
            <p>Delivered</p>
            <h3>{deliveredCount}</h3>
            <span>Delivery status recorded</span>
          </div>
        </div>
        <div className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h3>Recent orders</h3>
              <p>Your latest order information</p>
            </div>
            <button className="text-btn" onClick={() => setPage("Order List")}>
              View all orders →
            </button>
          </div>
          {ordersLoading ? (
            <p className="empty-state">Loading orders…</p>
          ) : ordersError ? (
            <p className="error-text">{ordersError}</p>
          ) : orders.length === 0 ? (
            <p className="empty-state">
              No orders found. Check that your backend has sample orders.
            </p>
          ) : (
            <div className="recent-orders">
              {orders.slice(0, 4).map((order, index) => (
                <div className="recent-order" key={getOrderId(order) + index}>
                  <div className="product-avatar">✿</div>
                  <div className="recent-order-info">
                    <strong>{getProduct(order)}</strong>
                    <span>{getOrderId(order)}</span>
                  </div>
                  <span className="status-pill">{getStatus(order)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }
  function renderOrders() {
    return (
      <>
        <div className="section-heading">
          <div>
            <p className="eyebrow">ORDER MANAGEMENT</p>
            <h2>Order list</h2>
            <p className="muted">View order details and delivery progress.</p>
          </div>
          <button className="outline-btn" onClick={loadOrders}>
            ↻ Refresh
          </button>
        </div>
        <div className="panel">
          <div className="order-toolbar">
            <div className="search-box">
              <Icon name="search" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by order, product or status…"
              />
            </div>
            <span className="order-count">
              {filteredOrders.length} orders
            </span>
          </div>
          {ordersLoading ? (
            <p className="empty-state">Loading your orders…</p>
          ) : ordersError ? (
            <div className="empty-state">
              <p className="error-text">{ordersError}</p>
              <button className="primary-btn" onClick={loadOrders}>
                Try again
              </button>
            </div>
          ) : filteredOrders.length === 0 ? (
            <p className="empty-state">
              No matching orders found. Try another search.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Product</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Expected delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order, index) => (
                    <tr key={getOrderId(order) + index}>
                      <td className="order-id">{getOrderId(order)}</td>
                      <td>
                        <div className="table-product">
                          <span className="tiny-product">✿</span>
                          {getProduct(order)}
                        </div>
                      </td>
                      <td>{getCustomer(order)}</td>
                      <td>
                        <span className="status-pill">{getStatus(order)}</span>
                      </td>
                      <td>{getDelivery(order)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }
  function downloadCallSummary() {
    if (!callSummary) return;

    const report = {
      customer_intent: callSummary.customer_intent,
      order_id: callSummary.order_id,
      resolution_status: callSummary.resolution_status,
      call_summary: callSummary.call_summary,
      started_at: callSummary.started_at,
      ended_at: callSummary.ended_at,
      transcript: callSummary.transcript || [],
    };

    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `aura-call-summary-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderChat() {
    return (
      <>
        <div className="section-heading">
          <div>
            <p className="eyebrow">HERE FOR YOU, DAY OR NIGHT</p>
            <h2>Aura AI assistant</h2>
            <p className="muted">
              Ask about an order or get help with skincare products.
            </p>
          </div>
          <button
            className={`outline-btn ${voiceEnabled ? "voice-on" : ""}`}
            onClick={() => setVoiceEnabled((previous) => !previous)}
          >
            {voiceEnabled ? "🔊 Voice on" : "🔇 Voice off"}
          </button>
        </div>
        <div className="call-control-panel">
          <div className="call-control-copy">
            <p className="eyebrow">VOICE SUPPORT</p>
            <h3>Aria — Aura Skincare Assistant</h3>
            <p>Start a call and speak naturally. Allow microphone access when Chrome asks.</p>
            <p className="voice-state-line" role="status" aria-live="polite">
              <span className={`voice-state-dot state-dot-${String(callActive && callState === "Speaking" ? "Speaking" : loading && callActive ? "Thinking" : listening && callActive ? "Listening" : callState).toLowerCase().replace(/\s+/g, "-")}`} />
              Status: <strong className={`call-state state-${String(callActive && callState === "Speaking" ? "Speaking" : loading && callActive ? "Thinking" : listening && callActive ? "Listening" : callState).toLowerCase().replace(/\s+/g, "-")}`}>{loading && callActive ? "Thinking" : listening && callActive ? "Listening" : callState}</strong>
            </p>
          </div>
          <div className="call-buttons">
            <button type="button" className="primary-btn" onClick={startCall} disabled={callActive}>
              ▶ Start Call
            </button>
            <button type="button" className="outline-btn" onClick={endCall} disabled={!callActive}>
              ■ End Call
            </button>
          </div>
        </div>

        <div className="test-orders-panel">
          <div className="test-orders-heading">
            <div>
              <h3>Test Orders Helper</h3>
              <p>Use these sample orders to test Aria’s order lookup and support policies.</p>
            </div>
            <span className="test-orders-badge">3 sample orders</span>
          </div>
          <div className="test-orders-grid">
            <article className="test-order-card">
              <div className="test-order-top"><strong>ORD-101</strong><span className="test-status status-out">Out for Delivery</span></div>
              <p><strong>Customer:</strong> Priya Sharma</p>
              <p><strong>Product:</strong> Vitamin C Serum (30ml)</p>
              <p><strong>Amount:</strong> ₹699</p>
              <p><strong>Courier:</strong> BlueDart · BD-982103</p>
              <p><strong>Expected:</strong> Today by 6 PM</p>
              <button type="button" className="outline-btn test-order-action" onClick={() => sendMessage("Where is my order ORD-101?")} disabled={loading}>Test this order</button>
            </article>
            <article className="test-order-card">
              <div className="test-order-top"><strong>ORD-102</strong><span className="test-status status-delivered">Delivered</span></div>
              <p><strong>Customer:</strong> Rahul Verma</p>
              <p><strong>Product:</strong> Hydrating Sunscreen SPF 50</p>
              <p><strong>Amount:</strong> ₹499</p>
              <p><strong>Courier:</strong> Delhivery · DL-441029</p>
              <p><strong>Delivered:</strong> 14 days ago</p>
              <button type="button" className="outline-btn test-order-action" onClick={() => sendMessage("Can I return order ORD-102?")} disabled={loading}>Test return policy</button>
            </article>
            <article className="test-order-card">
              <div className="test-order-top"><strong>ORD-103</strong><span className="test-status status-processing">Processing</span></div>
              <p><strong>Customer:</strong> Ananya Patel</p>
              <p><strong>Product:</strong> Green Tea Face Wash + Toner</p>
              <p><strong>Amount:</strong> ₹850</p>
              <p><strong>Order placed:</strong> 3 hours ago</p>
              <p><strong>Cancellation:</strong> Eligible while processing</p>
              <button type="button" className="outline-btn test-order-action" onClick={() => sendMessage("Please cancel my order ORD-103")} disabled={loading}>Test cancellation</button>
            </article>
          </div>
        </div>

        <div className="chat-panel">
          <div className="chat-top">
            <div className="assistant-avatar">✿</div>
            <div>
              <strong>Aura</strong>
              <span>
                <i className="online-dot" /> AI skincare support
              </span>
            </div>
            <span className="powered-label">GROQ AI</span>
          </div>
          <div className="chat-messages">
            {messages.map((message, index) => (
              <div
                className={`message-row ${
                  message.role === "user" ? "user-row" : ""
                }`}
                key={index}
              >
                {message.role === "assistant" && (
                  <div className="message-avatar">✿</div>
                )}
                <div
                  className={`message-bubble ${
                    message.role === "user" ? "user-bubble" : ""
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="message-row">
                <div className="message-avatar">✿</div>
                <div className="message-bubble typing">Aura is thinking…</div>
              </div>
            )}
          </div>
          {error && <p className="error-text chat-error">{error}</p>}
          <div className="suggestions">
            {[
              "Where is my order ORD-101?",
              "What is your return policy?",
              "Help me choose a skincare product",
            ].map((suggestion) => (
              <button
                className="suggestion-chip"
                key={suggestion}
                onClick={() => sendMessage(suggestion)}
                disabled={loading}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <form
            className="chat-input-area"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Aura anything…"
              aria-label="Message Aura"
            />
            <button
              type="button"
              className={`mic-btn ${listening ? "listening" : ""}`}
              onClick={startListening}
              title="Speak your message"
              aria-label="Speak your message"
            >
              🎙
            </button>
            <button
              type="submit"
              className="send-btn"
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              ➤
            </button>
          </form>
          {/* Damaged product photo upload */}
          <div className="damage-upload-panel">
            <div className="damage-upload-heading">
              <span className="damage-upload-icon">📷</span>
              <div>
                <h3>Report a damaged product</h3>
                <p>
                  Upload a photo so your support team can review your report.
                </p>
              </div>
            </div>
            <form
              onSubmit={uploadDamagePhoto}
              className="damage-upload-form"
            >
              <label htmlFor="damage-order-id">Order ID (optional)</label>
              <input
                id="damage-order-id"
                type="text"
                value={damageOrderId}
                onChange={(event) => setDamageOrderId(event.target.value)}
                placeholder="e.g. ORD-101"
                disabled={uploadingPhoto}
              />
              <label htmlFor="damage-description">
                Describe the problem (optional)
              </label>
              <textarea
                id="damage-description"
                value={damageDescription}
                onChange={(event) => setDamageDescription(event.target.value)}
                placeholder="Tell us what is damaged or missing…"
                rows={3}
                disabled={uploadingPhoto}
              />
              <label htmlFor="damage-photo-input">Product photo</label>
              <input
                id="damage-photo-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingPhoto}
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setPhotoMessage("");
                  setPhotoError("");
                  if (file && file.size > 5 * 1024 * 1024) {
                    setDamagePhoto(null);
                    event.target.value = "";
                    setPhotoError("The photo must be 5 MB or smaller.");
                    return;
                  }
                  setDamagePhoto(file);
                }}
              />
              {damagePreview && damagePhoto && (
                <div className="damage-photo-preview">
                  <img src={damagePreview} alt="Selected product" />
                  <div>
                    <strong>{damagePhoto.name}</strong>
                    <p>{(damagePhoto.size / 1024).toFixed(1)} KB</p>
                    <button
                      type="button"
                      className="text-btn"
                      disabled={uploadingPhoto}
                      onClick={() => {
                        setDamagePhoto(null);
                        setPhotoMessage("");
                        setPhotoError("");
                        const fileInput = document.getElementById(
                          "damage-photo-input"
                        );
                        if (fileInput) fileInput.value = "";
                      }}
                    >
                      Remove photo
                    </button>
                  </div>
                </div>
              )}
              {photoError && (
                <p className="error-text" role="alert">
                  {photoError}
                </p>
              )}
              {photoMessage && (
                <p className="photo-success" role="status">
                  {photoMessage}
                </p>
              )}
              <button
                type="submit"
                className="primary-btn damage-upload-button"
                disabled={uploadingPhoto || !damagePhoto}
              >
                {uploadingPhoto ? "Uploading photo…" : "Upload product photo"}
              </button>
            </form>
          </div>
          <p className="chat-disclaimer">
            Aura provides general skincare information, not medical diagnosis.
          </p>
        </div>

        {callSummary && (
          <div className="panel call-summary-panel">
            <div className="panel-heading">
              <div>
                <h3>Call Transcript & Summary</h3>
                <p>Your conversation in chronological order.</p>
              </div>
              <div className="summary-actions">
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => navigator.clipboard?.writeText(JSON.stringify({
                    customer_intent: callSummary.customer_intent,
                    order_id: callSummary.order_id,
                    resolution_status: callSummary.resolution_status,
                    call_summary: callSummary.call_summary,
                    started_at: callSummary.started_at,
                    ended_at: callSummary.ended_at,
                  }, null, 2))}
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={downloadCallSummary}
                >
                  Download JSON Summary
                </button>
              </div>
            </div>
            <div className="call-transcript">
              {callSummary.transcript.map((item, index) => (
                <p key={`${item.timestamp}-${index}`}>
                  <strong>{item.role === "user" ? "Customer" : "Aria"}:</strong>{" "}
                  {item.text} <small>{item.timestamp}</small>
                </p>
              ))}
            </div>
            <h4>Structured JSON summary</h4>
            <pre className="json-summary">{JSON.stringify({
              customer_intent: callSummary.customer_intent,
              order_id: callSummary.order_id,
              resolution_status: callSummary.resolution_status,
              call_summary: callSummary.call_summary,
              started_at: callSummary.started_at,
              ended_at: callSummary.ended_at,
            }, null, 2)}</pre>
          </div>
        )}
      </>
    );
  }
  function renderAuth(register) {
    return (
      <div className="auth-layout">
        <div className="auth-decoration">
          <div className="auth-flower">✿</div>
          <p className="eyebrow">WELCOME TO AURA</p>
          <h2>Your skincare journey, with a little more care.</h2>
          <p>
            A calm place to manage your orders and connect with your skincare
            assistant.
          </p>
          <div className="auth-wave">〰 〰 〰</div>
        </div>
        <div className="auth-form-side">
          <form
            className="auth-form"
            onSubmit={register ? handleRegister : handleLogin}
          >
            <div className="auth-logo">✿</div>
            <p className="eyebrow">{register ? "JOIN AURA" : "WELCOME BACK"}</p>
            <h2>{register ? "Create your account" : "Sign in to Aura"}</h2>
            <p className="muted">
              {register
                ? "Create an account to get started."
                : "Enter your details to continue."}
            </p>
            {register && (
              <label>
                Full name
                <input
                  name="name"
                  type="text"
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                placeholder="Enter your password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={6}
                required
              />
            </label>
            {authMessage && (
              <p className="auth-message" role="status">
                {authMessage}
              </p>
            )}
            <button className="primary-btn auth-submit" type="submit">
              {register ? "Create account" : "Sign in"} <span>→</span>
            </button>
            <p className="auth-switch">
              {register ? "Already have an account?" : "New to Aura?"}{" "}
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setAuthMessage("");
                  setPage(register ? "Login" : "Register");
                }}
              >
                {register ? "Sign in" : "Create account"}
              </button>
            </p>
            <p className="demo-note">
              Prototype authentication only. Connect secure backend auth before
              using real customer accounts.
            </p>
          </form>
        </div>
      </div>
    );
  }
  const navItems = [
    { label: "Dashboard", icon: "dashboard" },
    { label: "Order List", icon: "orders" },
    { label: "AI Voice Agent", icon: "agent" },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage("Dashboard")}>
          <span className="brand-mark">✿</span>
          <span className="brand-name">
            <strong>AURA</strong>
            <small>SKINCARE STUDIO</small>
          </span>
        </button>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`nav-item ${page === item.label ? "active" : ""}`}
              onClick={() => setPage(item.label)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.label === "Order List" && orders.length > 0 && (
                <span className="nav-count">{orders.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-wave">〰</div>
          <p>Care that feels like you.</p>
          <span>YOUR SKIN, YOUR STORY.</span>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="crumb-separator">/</span>
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="topbar-dot" />
            <span className="topbar-status">AI service</span>
            <div className="profile-avatar">
              {currentUser ? currentUser.name.charAt(0).toUpperCase() : "G"}
            </div>
            <div className="profile-copy">
              <strong>{currentUser ? currentUser.name : "Guest"}</strong>
              <span>{currentUser ? currentUser.email : "Welcome to Aura"}</span>
            </div>
          </div>
        </header>
        <div className="page-content">
          {page === "Dashboard" && renderDashboard()}
          {page === "Order List" && renderOrders()}
          {page === "AI Voice Agent" && renderChat()}
          {page === "Login" && renderAuth(false)}
          {page === "Register" && renderAuth(true)}
        </div>
        <footer className="app-footer">
          <span>✿ AURA SKINCARE</span>
          <span>Made with care, for your everyday glow.</span>
        </footer>
      </main>
    </div>
  );
}
export default App;
