
import WebSocket from "ws";

const url = "ws://127.0.0.1:9000/v1/events";

// Paste your local Realtime API key here.
// Never commit this file with a real key.
const authKey = process.env.FURHAT_API_KEY ?? "";

const socket = new WebSocket(url, {
  headers: authKey ? { Authorization: `Bearer ${authKey}` } : {},
});

socket.on("open", () => {
  console.log("Connected to Furhat!");

  socket.send(JSON.stringify({
    type: "request.speak.text",
    text: "Hello from TypeScript! I am ready for Lab 3."
  }));

  console.log("Speech request sent!");
});

socket.on("message", (data) => {
  console.log("Furhat response:", data.toString());
});

socket.on("error", (error) => {
  console.error("Connection error:", error.message);
});

socket.on("close", (code, reason) => {
  console.log("Connection closed:", code, reason.toString());
});
