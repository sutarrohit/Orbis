// Probe: load /sign-up via CDP, count navigations/reloads + console errors for N seconds.
const HOST = "http://localhost:9222";
const URL = "http://localhost:3000/sign-up";
const WATCH_MS = 8000;

const newTab = await fetch(`${HOST}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })
  .then((r) => r.json())
  .catch(async () => {
    // older chrome wants GET
    return fetch(`${HOST}/json/new?${encodeURIComponent("about:blank")}`).then((r) => r.json());
  });

const ws = new WebSocket(newTab.webSocketDebuggerUrl);
let id = 0;
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));

let navCount = 0;
let loadCount = 0;
const consoleErrors = [];
const navUrls = [];
const allConsole = [];
const schedNav = [];
const wsFrames = [];

ws.addEventListener("open", () => {
  send("Page.enable");
  send("Runtime.enable");
  send("Log.enable");
  send("Network.enable");
  send("Page.navigate", { url: URL });
});

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === "Page.frameStartedLoading") navCount++;
  if (msg.method === "Page.frameNavigated" && msg.params?.frame?.parentId === undefined) {
    navUrls.push(msg.params.frame.url);
  }
  if (msg.method === "Page.loadEventFired") loadCount++;
  if (msg.method === "Network.webSocketFrameReceived") {
    const p = msg.params.response?.payloadData || "";
    if (p && p.length < 2000) wsFrames.push("RECV: " + p);
  }
  if (msg.method === "Network.webSocketCreated") wsFrames.push("WS-OPEN: " + msg.params.url);
  if (msg.method === "Page.frameScheduledNavigation") schedNav.push(msg.params.reason + " -> " + msg.params.url);
  if (msg.method === "Page.frameRequestedNavigation") schedNav.push("requested:" + msg.params.reason + " -> " + msg.params.url);
  if (msg.method === "Runtime.consoleAPICalled") {
    const txt = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
    allConsole.push(msg.params.type + ": " + txt);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
  }
  if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push("EXC: " + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text));
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    consoleErrors.push("LOG: " + msg.params.entry.text);
  }
});

await new Promise((res) => setTimeout(res, WATCH_MS));

console.log(JSON.stringify({
  windowSeconds: WATCH_MS / 1000,
  frameStartedLoading: navCount,
  loadEventFired: loadCount,
  topNavigations: navUrls.slice(0, 12),
  totalTopNavigations: navUrls.length,
  consoleErrors: consoleErrors.slice(0, 20),
  totalConsoleErrors: consoleErrors.length,
  scheduledNavigations: schedNav.slice(0, 15),
  uniqueConsole: [...new Set(allConsole)].slice(0, 40),
  wsFrames: [...new Set(wsFrames)].slice(0, 25),
}, null, 2));
ws.close();
process.exit(0);
