"use client"
import React, { useState, useEffect, useRef } from 'react';

interface Message {
  username: string;
  message: string;
}

const ChatComponent: React.FC = () => {
  const [username, setUsername] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("Disconnected");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  // messagesEndRef is used for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Helper: Scroll to bottom ---
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const connectToChat = () => {
    if (!username.trim()) return;

    const userId = Math.floor(Math.random() * 100000);
    const url = `ws://localhost:8080/chat?id=${userId}&username=${username}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setStatus("Connected");
      setIsLoggedIn(true);
      wsRef.current = ws;
    };

    ws.onmessage = (event) => {
      try {
        const parsedData: Message = JSON.parse(event.data);
        setMessages((prev) => [...prev, parsedData]);
      } catch (err) {
        console.error("Failed to parse message:", err);
      }
    };

    ws.onclose = () => {
      setStatus("Disconnected");
      setIsLoggedIn(false);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      setStatus("Error");
    };
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const sendMessage = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!inputVal.trim()) return;

    const msgPayload = {
      message: inputVal,
      username: username 
    };

    wsRef.current.send(JSON.stringify(msgPayload));
    setInputVal(""); // Clear input
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  if (!isLoggedIn) {
    return (
      <div style={styles.container}>
        <div style={styles.loginBox}>
          <h2 style={{ marginBottom: '1rem' }}>Join Chat</h2>
          <input
            type="text"
            placeholder="Enter Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
          />
          <button onClick={connectToChat} style={styles.button}>
            Join
          </button>
        </div>
      </div>
    );
  }

  // --- Render: Chat Interface ---
  return (
    <div style={styles.container}>
      <div style={styles.chatWrapper}>
        {/* Header */}
        <div style={styles.header}>
          <h3>Live Chat</h3>
          <span style={styles.statusDot(status === "Connected")} />
        </div>

        {/* Message List */}
        <div style={styles.messageList}>
          {messages.map((msg, idx) => {
            const isMe = msg.username === username;
            return (
              <div
                key={idx}
                style={{
                  ...styles.messageRow,
                  justifyContent: isMe ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={isMe ? styles.myBubble : styles.otherBubble}>
                  <div style={styles.username}>{msg.username}</div>
                  <div>{msg.message}</div>
                </div>
              </div>
            );
          })}
          {/* Invisible element to scroll to */}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div style={styles.inputArea}>
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            style={styles.chatInput}
          />
          <button onClick={sendMessage} style={styles.sendButton}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Basic Inline Styles (Dark Mode) ---
const styles: { [key: string]: any } = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    fontFamily: 'Arial, sans-serif',
  },
  loginBox: {
    padding: '2rem',
    backgroundColor: '#2a2a2a',
    borderRadius: '8px',
    textAlign: 'center',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
  },
  chatWrapper: {
    width: '400px',
    height: '600px',
    backgroundColor: '#2a2a2a',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
  },
  header: {
    padding: '1rem',
    backgroundColor: '#333',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #444',
  },
  statusDot: (isConnected: boolean) => ({
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: isConnected ? '#4caf50' : '#f44336',
  }),
  messageList: {
    flex: 1,
    padding: '1rem',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  messageRow: {
    display: 'flex',
    width: '100%',
  },
  myBubble: {
    backgroundColor: '#007bff',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '12px 12px 0 12px',
    maxWidth: '70%',
    wordBreak: 'break-word',
  },
  otherBubble: {
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    padding: '8px 12px',
    borderRadius: '12px 12px 12px 0',
    maxWidth: '70%',
    wordBreak: 'break-word',
  },
  username: {
    fontSize: '0.75rem',
    fontWeight: 'bold',
    marginBottom: '2px',
    opacity: 0.8,
  },
  inputArea: {
    padding: '1rem',
    borderTop: '1px solid #444',
    display: 'flex',
    gap: '0.5rem',
  },
  input: {
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #555',
    backgroundColor: '#333',
    color: 'white',
    marginRight: '0.5rem',
  },
  chatInput: {
    flex: 1,
    padding: '0.8rem',
    borderRadius: '20px',
    border: 'none',
    backgroundColor: '#404040',
    color: 'white',
    outline: 'none',
  },
  button: {
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#007bff',
    color: 'white',
    cursor: 'pointer',
  },
  sendButton: {
    padding: '0 1.2rem',
    borderRadius: '20px',
    border: 'none',
    backgroundColor: '#007bff',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
};

export default ChatComponent;use client";
