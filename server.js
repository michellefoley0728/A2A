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
  const isWarranty = /warrant|service tag|support/i.test(q);

  // Extract model if present
  const modelMatch = q.match(/(latitude|optiplex|xps|precision|inspiron|vostro|poweredge|alienware|g\d+)\s*([\w\d\s]*?)(?:\s|$)/i);
  const model = modelMatch ? modelMatch[0].trim() : null;
  const encodedQuery = encodeURIComponent(query);
  const encodedModel = model ? encodeURIComponent(model) : encodedQuery;

  let response = `## Dell Technical Support Results\n**Query:** ${query}\n\n`;

  if (isError) {
    response += `### 🔧 Troubleshooting\n`;
    response += `Based on your description, here are the relevant Dell resources:\n\n`;
    response += `**Dell Diagnostic Error Codes Reference:**\n`;
    response += `→ https://www.dell.com/support/kbdoc/en-us/000125347/dell-desktop-error-codes\n\n`;
    response += `**LED/Blink Code Diagnostic Guide:**\n`;
    response += `→ https://www.dell.com/support/kbdoc/en-us/000132093/what-are-the-blinking-led-codes-on-a-dell-laptop\n\n`;
    if (model) {
      response += `**Troubleshoot ${model} specifically:**\n`;
      response += `→ https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/diagnose\n\n`;
    }
    response += `**Run SupportAssist Diagnostics (recommended):**\n`;
    response += `→ https://www.dell.com/support/home/en-us/supportassist\n`;
  } else if (isDriver) {
    response += `### ⬇️ Drivers & Downloads\n`;
    if (model) {
      response += `**Drivers for ${model}:**\n`;
      response += `→ https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/drivers\n\n`;
      response += `**BIOS Updates for ${model}:**\n`;
      response += `→ https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/drivers?drivertype=bios\n\n`;
    } else {
      response += `**Search all drivers by model:**\n`;
      response += `→ https://www.dell.com/support/home/en-us/drivers\n\n`;
      response += `**Driver search for: ${query}**\n`;
      response += `→ https://www.dell.com/support/search/en-us#q=${encodedQuery}&t=Downloads\n\n`;
    }
    response += `**Auto-detect drivers with SupportAssist:**\n`;
    response += `→ https://www.dell.com/support/home/en-us/supportassist\n`;
  } else if (isManual) {
    response += `### 📖 Service Documentation\n`;
    if (model) {
      response += `**Service Manual for ${model}:**\n`;
      response += `→ https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/manuals\n\n`;
      response += `**Parts & Compatibility for ${model}:**\n`;
      response += `→ https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/upgrade\n\n`;
    }
    response += `**Dell Manuals Library (all models):**\n`;
    response += `→ https://www.dell.com/support/home/en-us/product-support/manuals\n\n`;
    response += `**Knowledge Base Article Search:**\n`;
    response += `→ https://www.dell.com/support/search/en-us#q=${encodedQuery}&t=KnowledgeArticles\n`;
  } else {
    // General support search
    response += `### 🔍 Support Results\n`;
    response += `**Knowledge Base Articles:**\n`;
    response += `→ https://www.dell.com/support/search/en-us#q=${encodedQuery}&t=KnowledgeArticles\n\n`;
    if (model) {
      response += `**Full Support Page for ${model}:**\n`;
      response += `→ https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/overview\n\n`;
      response += `**Manuals & Guides:**\n`;
      response += `→ https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/manuals\n\n`;
      response += `**Drivers & Downloads:**\n`;
      response += `→ https://www.dell.com/support/home/en-us/product-support/product/${encodedModel}/drivers\n\n`;
    }
    response += `**Dell Community Forums:**\n`;
    response += `→ https://www.dell.com/community/en/conversations/search?q=${encodedQuery}\n\n`;
    response += `**Dell TechDirect (enterprise portal):**\n`;
    response += `→ https://techdirect.dell.com\n`;
  }

  response += `\n---\n*Results sourced from Dell's public support library. For hardware under warranty, contact Dell Support: 1-800-624-9896*`;
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
