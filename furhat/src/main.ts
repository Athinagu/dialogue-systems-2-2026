
import { setup, createActor, fromPromise, assign } from "xstate";
import WebSocket from "ws";

const FURHAT_URL = "ws://127.0.0.1:9000/v1/events";

// shared WebSocket connection for the dialogue
const socket = new WebSocket(FURHAT_URL);

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }

socket.once("open", () => {
  console.log("Connected to Furhat!");

  // strting user detection
  socket.send(JSON.stringify({
    type: "request.users.start"
  }));

  // attending to the closest detected user
  socket.send(JSON.stringify({
    type: "request.attend.user",
    user_id: "closest"
  }));

  console.log("User tracking requested");
  resolve();
});

    socket.once("error", reject);
  });
}

function fhLED(color: string): void {
  if (socket.readyState !== WebSocket.OPEN) {
    console.error("Cannot set LED: Furhat is disconnected");
    return;
  }

  socket.send(JSON.stringify({
    type: "request.led.set",
    color
  }));
}

function fhGesture(name: string): void {
  if (socket.readyState !== WebSocket.OPEN) {
    console.error("Cannot perform gesture: Furhat disconnected");
    return;
  }

  socket.send(JSON.stringify({
    type: "request.gesture.start",
    name: name,
    intensity: 1,
    duration: 1
  }));

  console.log("Gesture requested:", name);
}

function happyGreeting(): void {
  fhGesture("Smile");
  fhGesture("BrowRaise");
}

// part A requirement 6
async function surpriseWithSound(): Promise<void> {
  fhGesture("Surprise");
  await fhSay("Oh!");
}

// Furhat speaking and waiting until speech finishes
function fhSay(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Speech timed out"));
    }, 30000);

    function cleanup() {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("close", onClose);
    }

    function onClose() {
      cleanup();
      reject(new Error("Furhat disconnected"));
    }

    function onMessage(data: WebSocket.RawData) {
      try {
        const event = JSON.parse(data.toString());

        if (event.type === "response.speak.end") {
          cleanup();
          resolve();
        }
      } catch (error) {
        console.error("Invalid Furhat message:", error);
      }
    }

    socket.on("message", onMessage);
    socket.once("close", onClose);

    socket.send(JSON.stringify({
      type: "request.speak.text",
      text
    }));
  });
}

// listening and return the recognized words
function fhListen(): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Listening timed out"));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("close", onClose);
    }

    function onClose() {
      cleanup();
      reject(new Error("Furhat disconnected"));
    }

    function onMessage(data: WebSocket.RawData) {
      try {
        const event = JSON.parse(data.toString());

        if (event.type === "response.hear.end") {
          cleanup();
          resolve(event.text ?? "");
        }
      } catch (error) {
        console.error("Invalid Furhat message:", error);
      }
    }

    socket.on("message", onMessage);
    socket.once("close", onClose);

    socket.send(JSON.stringify({
      type: "request.listen.start",
      partial: false,
      stop_no_speech: true,
      stop_user_end: true
    }));
  });
}

const dmMachine = setup({
  types: {
    context: {} as { userText: string }
  },

  actors: {
    connect: fromPromise(async () => connect()),

    speak: fromPromise(async () => {
      await fhSay("Hello! How are you today?");
    }),

    listen: fromPromise(async () => {
      return await fhListen();
    }),

    respond: fromPromise<void, { text: string }>(
      async ({ input }) => {
        await fhSay(`You said: ${input.text}`);
        await surpriseWithSound();
      }
    )
  }
}).createMachine({
  id: "furhatDialogue",
  initial: "Connecting",

  context: {
    userText: ""
  },

  states: {
    Connecting: {
      invoke: {
        src: "connect",
        onDone: "Speak",
        onError: "Fail"
      }
    },

    Speak: {
      entry: () => fhLED("#0000FF"),
      invoke: {
        src: "speak",
        onDone: "Listen",
        onError: "Fail"
      }
    },

    Listen: {
      entry: () => fhLED("#00FF00"),
      invoke: {
        src: "listen",

        onDone: {
          target: "Respond",
          actions: assign({
            userText: ({ event }) => event.output
          })
        },

        onError: {
          target: "Fail",
          actions: ({ event }) => console.error(event.error)
        }
      }
    },
    
    Respond: {
      entry: () => {
        fhLED("#0000FF");
        happyGreeting();
      },
      invoke: {
        src: "respond",
        input: ({ context }) => ({
          text: context.userText
        }),
        onDone: "Finished",
        onError: "Fail"
      }
    },

    Finished: {
      entry: () => fhLED("#FFFFFF"),
      type: "final"
    },

    Fail: {
      entry: () => console.error("Dialogue failed")
    }
  }
});

const actor = createActor(dmMachine);

actor.subscribe((snapshot) => {
  console.log("Current state:", snapshot.value);
  console.log("Recognized text:", snapshot.context.userText);

  if (snapshot.status === "done") {
    socket.close();
  }
});

actor.start();
