import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse } from "@google/genai";

const getBalance: FunctionDeclaration = {
  name: "get_balance",
  description: "Get the current balance of the user's wallet",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

const sendMoney: FunctionDeclaration = {
  name: "send_money",
  description: "Send money to another person or bank account.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      amount: {
        type: Type.NUMBER,
        description: "The amount of money to send in NGN",
      },
      recipient: {
        type: Type.STRING,
        description: "The name, phone number or account number of the recipient",
      },
    },
    required: ["amount", "recipient"],
  },
};

const buyAirtime: FunctionDeclaration = {
  name: "buy_airtime",
  description: "Buy airtime or data for a phone number.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      amount: {
        type: Type.NUMBER,
        description: "The amount in NGN",
      },
      phone: {
        type: Type.STRING,
        description: "The target phone number",
      },
      network: {
        type: Type.STRING,
        description: "The mobile network (MTN, Airtel, Glo, 9mobile)",
      },
      type: {
        type: Type.STRING,
        enum: ["airtime", "data"],
        description: "Whether to buy airtime or a data bundle",
      },
    },
    required: ["amount", "phone", "network", "type"],
  },
};

const getRecentTransactions: FunctionDeclaration = {
  name: "get_recent_transactions",
  description: "Show a list of the most recent transactions.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const getGeminiResponse = async (history: any[], userContext?: { fullname?: string, balance?: number, phone?: string }, imageBase64?: string) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured. Please check Settings > Secrets.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = "gemini-3-flash-preview";

  const SYSTEM_PROMPT = `
    You are Waviego Africa (by Antigravity), a helpful AI banking assistant.
    Goal: Help users manage money, transfers, bills, and insights.
    Mood: Professional, warm, African tone.
    Security: NEVER share PIN.
    Operations: get_balance, send_money, buy_airtime, get_recent_transactions.
  `;

  const personalizedPrompt = `${SYSTEM_PROMPT}
    Current User: ${userContext?.fullname || "Unknown"}
    Current Balance: ₦${(userContext?.balance || 0).toLocaleString()}
    User Phone: ${userContext?.phone || "Unknown"}
    
    Instructions:
    - If the user provides a phone number and an amount, or asks to send money, immediately trigger 'send_money'.
    - If the user asks to buy airtime/data, immediately trigger 'buy_airtime'.
    - If the user asks "how much do I have" or "balance", trigger 'get_balance'.
    - ALWAYS call the appropriate tool instead of just talking when a transaction is implied.
    - If information is missing, ask for it.
    - Be helpful, quick, and secure.
  `;

  let contents = [...history];
  
  if (imageBase64) {
     // Find the last user message and attach image content to it
     const reversedHistory = [...contents].reverse();
     const lastUserMsgIndex = contents.length - 1 - reversedHistory.findIndex(m => m.role === "user");
     
     if (lastUserMsgIndex >= 0) {
        if (!contents[lastUserMsgIndex].parts) contents[lastUserMsgIndex].parts = [];
        contents[lastUserMsgIndex].parts.push({
          inlineData: {
            mimeType: "image/png",
            data: imageBase64
          }
        });
     }
  }

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelName,
      contents: contents,
      config: {
        systemInstruction: personalizedPrompt,
        tools: [
          {
            functionDeclarations: [
              getBalance,
              sendMoney,
              buyAirtime,
              getRecentTransactions,
            ],
          },
        ],
      },
    });

    return {
      text: response.text,
      functionCalls: response.functionCalls,
    };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
