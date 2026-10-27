import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

/**
 * Enterprise Node.js Express Server for AI Gantt Generator
 * Compatible with Google Cloud Run, Container Engines, and local environments.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Google Cloud Run automatically injects PORT (defaults to 8080 or 3000 in dev)
const PORT = process.env.PORT || 3000;

// Security & Parsing Middleware
app.use(express.json({ limit: '10mb' }));

/**
 * Health Check Endpoints
 * Used by Google Cloud Run liveness and readiness probes.
 */
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ai-gantt-generator',
    version: '1.0.0'
  });
});

/**
 * API Route: /api/chat
 * Handles conversational project planning and automated Gantt chart generation via Gemini 2.5/Flash.
 */
app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[AUTH_ERROR] GEMINI_API_KEY environment variable is missing.');
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server. Please provide it via GCP Secret Manager or environment variables.'
      });
    }

    const { messages, chartContext } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request: "messages" array is required.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Format conversation history for Gemini API
    const contents = messages.map(m => {
      if (m.role === 'user') {
        return { role: 'user', parts: [{ text: m.text || '' }] };
      } else if (m.role === 'assistant') {
        if (m.toolCall) {
          return { role: 'model', parts: [{ functionCall: { name: m.toolCall.name, args: m.toolCall.args } }] };
        } else {
          return { role: 'model', parts: [{ text: m.text || '' }] };
        }
      } else if (m.role === 'tool') {
        return { role: 'user', parts: [{ functionResponse: { name: m.toolName, response: m.response } }] };
      }
      return null;
    }).filter(Boolean);

    const today = new Date().toISOString().split('T')[0];
    const systemInstruction = `You are the Gantt generation Model. Today's date is ${today}. Help the user plan out a project timeline and generate a Gantt chart.
You can propose a timeline first, or if you have enough information (or if the user explicitly asks for it), directly call the "update_gantt_chart" tool to generate the chart on their screen.
If the user asks you to modify the existing chart, you can view the current chart context provided and then call the tool with the updated tasks.
Current Chart Context: ${JSON.stringify(chartContext || {})}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction,
        tools: [{
          functionDeclarations: [{
            name: 'update_gantt_chart',
            description: 'Update the Gantt chart with a new or modified list of tasks. Replaces the current chart completely.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                projectName: { type: Type.STRING },
                tasks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING, description: 'Format: T1, T2, etc.' },
                      name: { type: Type.STRING },
                      startDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
                      endDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
                      owner: { type: Type.STRING },
                      dependencies: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Array of task IDs this task depends on' },
                      isMilestone: { type: Type.BOOLEAN },
                      progress: { type: Type.INTEGER, description: '0 to 100' },
                      color: { type: Type.STRING, description: 'Hex color e.g., #e60000, #333333, #4a4a4a, #666666, #990000' }
                    },
                    required: ['id', 'name', 'startDate', 'endDate', 'owner', 'dependencies', 'isMilestone', 'progress', 'color']
                  }
                }
              },
              required: ['projectName', 'tasks']
            }
          }]
        }]
      }
    });

    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      res.json({
        role: 'assistant',
        toolCall: {
          name: call.name,
          args: call.args
        }
      });
    } else {
      res.json({
        role: 'assistant',
        text: response.text || ''
      });
    }
  } catch (error) {
    console.error('[API_ERROR] Error in /api/chat:', error);
    res.status(500).json({ error: 'Failed to generate response', details: error.message });
  }
});

/**
 * Static Asset Delivery
 * Serves index.html, static logos, and client files.
 */
app.use(express.static(__dirname));

// Client SPA fallback
app.get('*all', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server binding to 0.0.0.0 for container ingress
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] AI Gantt Generator running on port ${PORT}`);
});

/**
 * Graceful Shutdown Handlers for Google Cloud Run container lifecycle
 */
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] SIGTERM received. Closing HTTP server gracefully...');
  server.close(() => {
    console.log('[SHUTDOWN] HTTP server closed cleanly.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[SHUTDOWN] SIGINT received. Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
