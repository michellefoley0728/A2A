// Dell Technical Support A2A Agent
// Deploy to Glitch.com — paste this entire file as server.js
// Then set your Agent Card URL in ServiceNow to: https://YOUR-PROJECT.glitch.me/.well-known/agent.json

const express = require('express');
const https = require('https');
const app = express();
app.use(express.json());

// ── CORS (ServiceNow needs this) ──────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, A2A-Version');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── AGENT CARD (A2A Discovery) ────────────────────────────────────────────────
// ServiceNow reads this to understand what the agent can do
const AGENT_BASE_URL = 'https://a2a-production-8589.up.railway.app';


const agentCard = {
  name: "Dell Technical Support Agent",
  description: "Searches Dell's public knowledge base, manuals, drivers, and troubleshooting guides for any Dell product. Provide a model name, service tag, error code, or symptom and this agent returns relevant technical documentation and resolution steps.",
  url: `${AGENT_BASE_URL}/a2a`,
  provider: {
    name: "ServiceNow A2A Demo",
    url: AGENT_BASE_URL
  },
  version: "1.0.0",
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false
  },
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
  skills: [
    {
      id: "dell-driver-lookup",
      name: "Driver & BIOS Lookup",
      description: "Find drivers, BIOS updates, and firmware for a Dell model or service tag",
      examples: [
        "Find latest BIOS for Dell Latitude 5540",
        "Drivers for Dell OptiPlex 7090",
        "Firmware update for Dell PowerEdge R750"
      ],
      inputModes: ["text"],
      outputModes: ["text"]
    },
    {
      id: "dell-troubleshoot",
      name: "Troubleshooting Guide",
      description: "Find troubleshooting steps for Dell hardware issues, error codes, and symptoms",
      examples: [
        "Dell laptop won't boot, 4 amber blinks",
        "OptiPlex showing error code 2000-0142",
        "Dell monitor flickering on HDMI"
      ],
      inputModes: ["text"],
      outputModes: ["text"]
    },
    {
      id: "dell-manual",
      name: "Service Manual & Documentation",
      description: "Retrieve service manuals, setup guides, and technical specifications",
      examples: [
        "Service manual for Dell XPS 15 9530",
        "Memory specs for Precision 5680",
        "How to replace battery in Latitude 7440"
      ],
      inputModes: ["text"],
      outputModes: ["text"]
    }
  ]
};

// GET /.well-known/agent.json  — required by A2A spec
app.get('/.well-known/agent.json', (req, res) => {
  res.json(agentCard);
});

// Also support the ServiceNow v1 path format
app.get('/.well-known/agent-card.json', (req, res) => {
  res.json(agentCard);
});

// ── DELL SEARCH HELPER ────────────────────────────────────────────────────────
function searchDell(query) {
  return new Promise((resolve, reject) => {
    // Dell's public support search API
    const encodedQuery = encodeURIComponent(query);
    const options = {
      hostname: 'www.dell.com',
      path: `/support/search/en-us#q=${encodedQuery}&t=All&sort=relevance&layout=table&numberOfResults=5`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; A2A-Agent/1.0)',
        'Accept': 'application/json, text/html'
      },
      timeout: 8000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// Build structured Dell support response using known URL patterns
function buildDellResponse(query) {
  const q = query.toLowerCase();
 
  // Detect intent
  const isDriver = /driver|bios|firmware|update|download/i.test(q);
  const isError = /error|code|\d{4}-\d{4}|blink|beep|amber|white/i.test(q);
  const isManual = /manual|guide|replace|install|spec|memory|ram|battery|disassembl/i.test(q);
 
  // Extract model if present
  const modelMatch = q.match(/(latitude|optiplex|xps|precision|inspiron|vostro|poweredge|alienware|g\d+)\s*([\w\d\s]*?)(?:\s|$)/i);
  const model = modelMatch ? modelMatch[0].trim() : null;
  const encodedQuery = encodeURIComponent(query);
  const encodedModel = model ? encodeURIComponent(model) : encodedQuery;
  const modelLabel = model ? model.charAt(0).toUpperCase() + model.slice(1) : 'this Dell device';
 
  let response = `DELL SUPPORT FINDINGS — ${query}\n\n`;
 
  if (isError) {
    response += `RECOMMENDED ACTIONS:\n`;
    response += `1. Run the built-in Dell SupportAssist diagnostics tool first — this will identify the specific failing component automatically.\n`;
    response += `2. Check the LED/blink pattern against Dell's diagnostic code guide — each pattern maps to a specific hardware fault (RAM, GPU, CPU, or storage).\n`;
    if (q.includes('amber') || q.includes('blink')) {
      response += `3. Amber blink codes on Dell laptops typically indicate a hardware component failure before POST. Common causes: failed RAM stick, GPU fault, or battery/power issue. Try reseating RAM first.\n`;
    } else if (q.includes('2000')) {
      response += `3. Error 2000-xxxx codes are storage diagnostic failures. The hard drive or SSD is likely failing. Back up data immediately and run a full disk diagnostic from SupportAssist.\n`;
    } else if (q.includes('kernel') || q.includes('blue screen') || q.includes('bsod')) {
      response += `3. KERNEL_SECURITY_CHECK_FAILURE is most commonly caused by outdated or corrupt drivers, especially after a Windows Update. Boot into Safe Mode and roll back recent driver updates, or run the Dell driver update tool.\n`;
    } else {
      response += `3. Cross-reference the specific error code with Dell's diagnostic reference to identify the affected component before ordering parts.\n`;
    }
    response += `4. If the device is under warranty, Dell can dispatch a technician or send a replacement part at no cost.\n`;
    response += `\nREFERENCE LINKS:\n`;
    response += `- Diagnostic error codes: https://www.dell.com/support/kbdoc/en-us/000125347/dell-desktop-error-codes\n`;
    response += `- LED/blink code guide: https://www.dell.com/support/kbdoc/en-us/000132093/what-are-the-blinking-led-codes-on-a-dell-laptop\n`;
    if (model) response += `- Run diagnostics for ${modelLabel}: https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/diagnose\n`;
    response += `- SupportAssist download: https://www.dell.com/support/home/en-us/supportassist\n`;
 
  } else if (isDriver) {
    response += `RECOMMENDED ACTIONS:\n`;
    response += `1. Download and run Dell SupportAssist — it will auto-detect the device and show all missing or outdated drivers in one view.\n`;
    if (model) {
      response += `2. For a manual update, go directly to the ${modelLabel} driver page and filter by BIOS or the specific driver category needed.\n`;
      response += `3. Always update BIOS last, after all other drivers are current. Ensure the device is plugged into AC power before starting a BIOS update.\n`;
    } else {
      response += `2. If SupportAssist is not available, search drivers by service tag (found on the bottom of the device) for exact model match.\n`;
      response += `3. Always update BIOS last. Ensure the device is plugged into AC power before starting a BIOS update.\n`;
    }
    response += `4. Restart the device after each driver update before installing the next.\n`;
    response += `\nREFERENCE LINKS:\n`;
    if (model) {
      response += `- ${modelLabel} drivers page: https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/drivers\n`;
      response += `- ${modelLabel} BIOS updates: https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/drivers?drivertype=bios\n`;
    }
    response += `- SupportAssist (auto-detect): https://www.dell.com/support/home/en-us/supportassist\n`;
 
  } else if (isManual) {
    response += `RECOMMENDED ACTIONS:\n`;
    if (model) {
      response += `1. Download the official Dell service manual for the ${modelLabel} before starting any hardware work — it includes torque specs, cable routing, and part removal order.\n`;
      response += `2. Check the parts compatibility page to verify the correct replacement part number before ordering.\n`;
    } else {
      response += `1. Locate the service manual using the device service tag (label on the bottom of the device) for an exact model match.\n`;
      response += `2. Verify replacement part numbers against the Dell parts compatibility list before ordering.\n`;
    }
    response += `3. Dell service manuals are available as free PDFs — no account required.\n`;
    response += `\nREFERENCE LINKS:\n`;
    if (model) {
      response += `- ${modelLabel} service manual: https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/manuals\n`;
      response += `- ${modelLabel} parts & compatibility: https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/upgrade\n`;
    }
    response += `- Dell manuals library: https://www.dell.com/support/home/en-us/product-support/manuals\n`;
 
  } else {
    response += `RECOMMENDED ACTIONS:\n`;
    response += `1. Search Dell's knowledge base for articles matching this issue — filter by product model for most relevant results.\n`;
    if (model) {
      response += `2. Visit the ${modelLabel} support page for a full overview of available documentation, drivers, and diagnostics.\n`;
    }
    response += `3. If the issue is not resolved by documentation, run SupportAssist diagnostics to get a hardware health report.\n`;
    response += `4. For warranty support or hardware replacement, contact Dell Support with the device service tag ready.\n`;
    response += `\nREFERENCE LINKS:\n`;
    response += `- Knowledge base search: https://www.dell.com/support/search/en-us#q=${encodedQuery}&t=KnowledgeArticles\n`;
    if (model) {
      response += `- ${modelLabel} support overview: https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/overview\n`;
      response += `- ${modelLabel} drivers: https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/drivers\n`;
    }
    response += `- Dell community forums: https://www.dell.com/community/en/conversations/search?q=${encodedQuery}\n`;
  }
 
  response += `\nFor warranty service or hardware repair, contact Dell Support: 1-800-624-9896 (have service tag ready)`;
  return response;
}

// ── A2A MESSAGE ENDPOINT ──────────────────────────────────────────────────────
// ServiceNow POSTs here to invoke the agent
app.post('/a2a', async (req, res) => {
  const { id, method, params } = req.body || {};

  // Handle jsonrpc envelope
  if (!method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: id || null,
      error: { code: -32600, message: 'Invalid request: missing method' }
    });
  }

  if (method === 'message/send') {
    const message = params?.message;
    const parts = message?.parts || [];
    const textPart = parts.find(p => p.kind === 'text' || p.type === 'text');
    const query = textPart?.text || '';

    if (!query) {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          kind: 'task',
          id: `task-${Date.now()}`,
          contextId: message?.contextId || `ctx-${Date.now()}`,
          status: { state: 'completed', timestamp: new Date().toISOString() },
          artifacts: [{
            artifactId: `art-${Date.now()}`,
            name: 'response',
            parts: [{ kind: 'text', text: 'Please provide a Dell model, service tag, error code, or describe your issue.' }]
          }]
        }
      });
    }

    try {
      const responseText = buildDellResponse(query);

      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          kind: 'task',
          id: `task-${Date.now()}`,
          contextId: message?.contextId || `ctx-${Date.now()}`,
          status: { state: 'completed', timestamp: new Date().toISOString() },
          artifacts: [{
            artifactId: `art-${Date.now()}`,
            name: 'dell_support_results',
            parts: [{ kind: 'text', text: responseText }]
          }]
        }
      });
    } catch (err) {
      return res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: `Agent error: ${err.message}` }
      });
    }
  }

  // tasks/get — return not found for unknown task IDs
  if (method === 'tasks/get') {
    return res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32001, message: 'Task not found (stateless agent)' }
    });
  }

  return res.json({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  });
});

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    agent: agentCard.name,
    agentCard: `${AGENT_BASE_URL}/.well-known/agent.json`,
    a2aEndpoint: `${AGENT_BASE_URL}/a2a`,
    version: agentCard.version
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Dell A2A Agent running on port ${PORT}`);
  console.log(`Agent Card: ${AGENT_BASE_URL}/.well-known/agent.json`);
});
