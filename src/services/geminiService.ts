import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

export const SYSTEM_PROMPT = `
You are Waviego Africa, a helpful AI banking assistant on WhatsApp.
Your goal is to help users manage their money, send transfers, pay bills, and get financial insights.

CONTEXT:
- You receive text messages, voice transcriptions, or images (photos of bills, account numbers, etc.).
- If an image is provided, analyze it to extract relevant banking information (like account numbers, names, amounts).

GUIDELINES:
- Be friendly, conversational, and helpful.
- Africa tone: Use professional yet warm language suitable for a Nigerian/African audience.
- Security: NEVER share the user's PIN. If an action requires a PIN, tell the user you are ready and then prompt them for their PIN.
- Intents: You can help with:
  1. Checking balance
  2. Sending money
  3. Buying airtime/data
  4. Viewing transaction history
  5. General financial advice

If the user wants to perform a transaction (send money or buy airtime), confirm the details first.
Once confirmed, you return the intent and specific parameters via function calls.

If asked about yourself: You are Waviego Africa, your bank in your chat.
`;

export const getGeminiResponse = async (messages: any[], imageBase64?: string) => {
  let contents = [...messages];
  
  if (imageBase64) {
    // If there's an image, we append it to the last message if it's from the user
    // or create a new message with it.
    const lastMsg = contents[contents.length - 1];
    if (lastMsg && lastMsg.role === "user") {
      lastMsg.parts.push({
        inlineData: {
          mimeType: "image/png", // Defaulting to png, can be refined
          data: imageBase64
        }
      });
    }
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
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

  return response;
};
