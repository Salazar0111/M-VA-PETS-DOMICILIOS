require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT } = require('../prompts/classifier');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function clasificarMensaje(texto) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: texto }],
  });

  const raw = response.content[0].text.trim();
  return JSON.parse(raw);
}

module.exports = { clasificarMensaje };
