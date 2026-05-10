
export const getGeminiResponse = async (messages: any[], imageBase64?: string) => {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, imageBase64 })
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "AI service failed");
  }

  const data = await res.json();
  return {
    text: data.text,
    functionCalls: data.functionCalls
  };
};
