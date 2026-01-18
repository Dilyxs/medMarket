import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "o4-mini";

    const systemPrompt = `You are a helpful AI assistant for medmarket. Your role is to help users understand medical market data and images by asking clarifying questions. Since you cannot see images directly, you ask users to describe what they see on screen.

Ask specific questions like:
- "Can you describe what you see on the screen?"
- "What are the main elements or sections visible?"
- "Are there any numbers, charts, or graphs?"
- "What colors or formatting do you notice?"
- "Can you tell me the text or labels you see?"

Be conversational, helpful, and guide them step by step to understand the data better.`;

    const response = await fetch(
      `${endpoint}openai/deployments/${deployment}/chat/completions?api-version=2024-12-01-preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey || "",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          max_completion_tokens: 1000,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Azure API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "I couldn't process that.";
    return NextResponse.json({ content });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Chat error:", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
