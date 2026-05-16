/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Send, 
  User, 
  MessageCircle, 
  ArrowLeft, 
  MoreVertical, 
  Phone, 
  Video, 
  Paperclip,
  Check,
  CheckCheck,
  Wallet,
  ArrowRightLeft,
  Smartphone,
  History,
  Lock,
  X,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  Download,
  Search,
  Mic,
  Camera,
  Plus,
  Image as ImageIcon,
  Fingerprint
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toPng } from "html-to-image";
import { Receipt } from "./components/Receipt";
import { Statement } from "./components/Statement";
import { useReactToPrint } from "react-to-print";
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from './lib/firebase';
import { GoogleGenAI, Type } from "@google/genai";
import { registerBiometric, authenticateBiometric, isBiometricSupported } from "./lib/biometrics";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: string;
  status: "sent" | "delivered" | "read";
  type?: "text" | "action";
  action?: any;
}

interface UserData {
  id: string;
  phone: string;
  wallet_balance: number;
  fullname: string;
  email?: string;
  dob?: string;
  bvn?: string;
  address?: string;
  state?: string;
  virtual_bank: string;
  virtual_account: string;
  virtual_account_name: string;
  kyc_completed: boolean;
  kyc_step: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Welcome to Waviego! Your Bank in your Chat. 🌊🚀\n\nI am your AI banking assistant. How can I help you today?",
      sender: "ai",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: "read"
    }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [downloadingReceipt, setDownloadingReceipt] = useState<any>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [selectedTxDetail, setSelectedTxDetail] = useState<any | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showStatement, setShowStatement] = useState(false);
  const statementRef = useRef<HTMLDivElement>(null);
  
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [isFunding, setIsFunding] = useState(false);
  
  // KYC State
  const [kycStep, setKycStep] = useState<string>("init");
  const [kycPhone, setKycPhone] = useState("");
  const [kycOtp, setKycOtp] = useState("");
  const [kycFullname, setKycFullname] = useState("");
  const [kycEmail, setKycEmail] = useState("");
  const [kycDob, setKycDob] = useState("");
  const [kycIdType, setKycIdType] = useState<string>("BVN");
  const [kycIdNumber, setKycIdNumber] = useState("");
  const [kycAddress, setKycAddress] = useState("");
  const [kycState, setKycState] = useState("");
  const [kycPin, setKycPin] = useState("");
  const [kycLoading, setKycLoading] = useState(false);
  const [kycError, setKycError] = useState("");
  const [kycDemoOtp, setKycDemoOtp] = useState<string | null>(null);
  const [isLogin, setIsLogin] = useState(false);
  const [apiStatus, setApiStatus] = useState({ gemini: false, monnify: false, paystack: false, twilio: false });
  const [showSettings, setShowSettings] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [isBiometricEnrolling, setIsBiometricEnrolling] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    fetchUserData();
    fetchApiStatus();
    setBiometricSupported(isBiometricSupported());

    // Initialize Web Speech API
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput(transcript);
          setIsRecording(false);
        };

        recognitionRef.current.onerror = () => {
          setIsRecording(false);
        };

        recognitionRef.current.onend = () => {
          setIsRecording(false);
        };
      }
    }
  }, []);

  const startRecording = () => {
    if (recognitionRef.current) {
      setIsRecording(true);
      recognitionRef.current.start();
    } else {
      alert("Speech recognition is not supported in this browser.");
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const safeFetch = async (path: string, options: RequestInit & { throwOnError?: boolean } = {}) => {
    const { throwOnError = true, ...fetchOptions } = options;
    try {
      console.log(`[Fetch] Requesting: ${path}`, fetchOptions.method || 'GET');
      
      const config: RequestInit = {
        ...fetchOptions,
        credentials: fetchOptions.credentials || 'same-origin'
      };

      const res = await fetch(path, config);
      console.log(`[Fetch] Response ${res.status} for ${path}`);
      
      if (!res.ok && throwOnError) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
           const errData = await res.json();
           throw new Error(errData.error || errData.message || `Status ${res.status}`);
        } else {
           const text = await res.text();
           throw new Error(`Server Error: ${res.status} - ${text.slice(0, 50)}`);
        }
      }

      return res;
    } catch (err: any) {
      if (throwOnError) {
        console.error(`[Fetch] Critical error for ${path}:`, err);
        const errorMsg = err.message || "Network request failed";
        const diagnosticErr = new Error(errorMsg);
        (diagnosticErr as any).path = path;
        (diagnosticErr as any).diagnostic = err.stack || JSON.stringify(err);
        throw diagnosticErr;
      }
      // If we don't throw, we return a mock response that looks like a fetch error
      return {
        ok: false,
        status: 0,
        json: async () => ({ error: err.message }),
        text: async () => err.message
      } as any;
    }
  };

  const fetchUserData = async () => {
    console.log("[App] Fetching user data...");
    try {
      const res = await safeFetch("/api/user", { throwOnError: false });
      if (res.status === 401 || res.status === 404 || !res.ok) {
        console.log("[App] User not found, unauthorized or server error:", res.status);
        setUserData(null);
        setKycStep("init");
        return;
      }
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        console.log("[App] User data received:", data.phone);
        setUserData(data);
        if (!data.kyc_completed) {
          setKycStep(data.kyc_step || "phone_input");
          if (data.phone) setKycPhone(data.phone);
          if (data.fullname) setKycFullname(data.fullname);
          if (data.email) setKycEmail(data.email);
          if (data.dob) setKycDob(data.dob);
          if (data.address) setKycAddress(data.address);
          if (data.state) setKycState(data.state);
        } else {
          setKycStep("completed");
        }
      } else {
        console.warn("[App] Received non-JSON response for user data");
        setUserData(null);
        setKycStep("init");
      }
    } catch (err) {
      console.error("[App] Failed to fetch user data", err);
    }
  };

  const logout = async () => {
    try {
      await safeFetch("/api/logout", { method: "POST" });
      setUserData(null);
      setKycStep("init");
      setMessages([{
        id: "1",
        text: "Welcome to Waviego! Your Bank in your Chat. 🌊🚀\n\nI am your AI banking assistant. How can I help you today?",
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: "read"
      }]);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const fetchApiStatus = async () => {
    try {
      const res = await safeFetch("/api/status");
      const data = await res.json();
      setApiStatus(data);
    } catch (err) {
      console.error("Failed to fetch API status", err);
    }
  };

  const cleanPhone = (p: any) => {
    if (typeof p !== 'string') return '';
    return p.replace(/\D/g, '');
  };

  const startKyc = async () => {
    const cleanedPhone = cleanPhone(kycPhone);
    if (!cleanedPhone || cleanedPhone.length < 5) {
      setKycError("Please enter a valid phone number (at least 5 digits)");
      return;
    }
    setKycLoading(true);
    setKycError("");
    try {
      console.log("[KYC] Starting onboarding for:", cleanedPhone);
      const res = await safeFetch("/api/kyc/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanedPhone })
      });
      const data = await res.json();
      console.log("[KYC] Start successful, next step:", data.step);
      setKycStep(data.step);
      if (data.demo_otp) {
        setKycDemoOtp(data.demo_otp);
      } else {
        setKycDemoOtp(null);
      }
    } catch (err: any) {
      console.error("[KYC] Start error:", err);
      setKycError(err.message || "Failed to start KYC. Please try again.");
    } finally {
      setKycLoading(false);
    }
  };

  const verifyOtp = async () => {
    const cleanedPhone = cleanPhone(kycPhone);
    console.log("[KYC] Verifying OTP for:", cleanedPhone);
    setKycLoading(true);
    setKycError("");
    try {
      const res = await safeFetch("/api/kyc/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanedPhone, otp: kycOtp })
      });
      const data = await res.json();
      if (res.ok) {
        console.log("[KYC] OTP verified. Step:", data.step);
        await fetchUserData(); // Sync state and confirm session
        setKycStep(data.step);
      } else {
        console.error("[KYC] OTP Verification failed:", data.error);
        setKycError(data.error || "Invalid OTP");
      }
    } catch (err) {
      console.error("[KYC] OTP Network error", err);
      setKycError("Verification failed. Please try again.");
    } finally {
      setKycLoading(false);
    }
  };

  const savePersonalInfo = async () => {
    console.log("[KYC] Saving personal info...", { kycFullname, kycEmail, kycDob });
    setKycLoading(true);
    setKycError("");
    try {
      const res = await safeFetch("/api/kyc/personal-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone(kycPhone), fullname: kycFullname, email: kycEmail, dob: kycDob })
      });
      const data = await res.json();
      if (res.ok) {
        console.log("[KYC] Personal info saved. Next step:", data.step);
        await fetchUserData();
        setKycStep(data.step);
      } else {
        console.error("[KYC] Save failed:", data.error);
        setKycError(data.error || "Failed to save information");
      }
    } catch (err) {
      console.error("[KYC] Network error saving personal info", err);
      setKycError("Network error. Please check your connection.");
    } finally {
      setKycLoading(false);
    }
  };

  const verifyIdentity = async () => {
    console.log("[KYC] Verifying identity...", { idType: kycIdType, idNumber: kycIdNumber });
    setKycLoading(true);
    setKycError("");
    try {
      const res = await safeFetch("/api/kyc/verify-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone(kycPhone), idType: kycIdType, idNumber: kycIdNumber })
      });
      const data = await res.json();
      if (res.ok) {
        console.log("[KYC] Identity verified. Next step:", data.step);
        await fetchUserData();
        setKycStep(data.step);
        if (data.verified_name) setKycFullname(data.verified_name);
      } else {
        console.error("[KYC] Identity fail:", data.error);
        setKycError(data.error || "Identity verification failed");
      }
    } catch (err) {
      console.error("[KYC] Identity Network error", err);
      setKycError("Identity verification failed. Please check connection.");
    } finally {
      setKycLoading(false);
    }
  };

  const saveAddress = async () => {
    setKycLoading(true);
    setKycError("");
    try {
      const res = await safeFetch("/api/kyc/address-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone(kycPhone), address: kycAddress, state: kycState })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchUserData();
        setKycStep(data.step);
      } else {
        setKycError(data.error);
      }
    } catch (err) {
      setKycError("Failed to save address");
    } finally {
      setKycLoading(false);
    }
  };

  const finalizeKyc = async () => {
    setKycLoading(true);
    setKycError("");
    try {
      const res = await safeFetch("/api/kyc/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone(kycPhone), pin: kycPin })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchUserData();
        setKycStep("completed");
      } else {
        setKycError(data.error);
      }
    } catch (err) {
      setKycError("Failed to set PIN");
    } finally {
      setKycLoading(false);
    }
  };

  const handleBiometricEnroll = async () => {
    if (!userData) return;
    setIsBiometricEnrolling(true);
    setKycError("");
    try {
      const { credentialId, publicKey } = await registerBiometric(userData.fullname);
      const res = await safeFetch("/api/biometric/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, publicKey })
      });
      const data = await res.json();
      if (res.ok) {
        setUserData(prev => prev ? { ...prev, biometricSet: true, biometricCredentialId: credentialId } : null);
        alert("Face ID / Fingerprint enrolled successfully!");
      } else {
        alert(data.error || "Enrollment failed");
      }
    } catch (err: any) {
      console.error("Biometric enrollment error:", err);
      // alert(err.message || "Failed to enroll biometrics. Ensure you are on a secure connection.");
      // For demo purposes, we can simulate if WebAuthn fails due to environment
      if (err.message.includes("not supported") || err.message.includes("failed to create")) {
         alert("Biometrics not supported in this preview environment. In a real browser, this would trigger Face ID / Touch ID.");
      } else {
         alert("Biometric failed: " + err.message);
      }
    } finally {
      setIsBiometricEnrolling(false);
    }
  };

  const handleBiometricAuth = async () => {
    if (!userData?.biometricCredentialId) {
      setError("Biometrics not set up");
      return;
    }
    setError("");
    try {
      const credentialId = await authenticateBiometric(userData.biometricCredentialId);
      
      // Execute action with biometric flag
      const path = pendingAction.actionType === "transfer" ? "/api/transfer" : "/api/vtu";
      const res = await safeFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pendingAction, isBiometric: true, credentialId })
      });

      const result = await res.json();

      if (res.ok) {
        setShowPinModal(false);
        setPin("");
        const completedAction = { ...pendingAction, ...result.transaction };
        setPendingAction(null);
        setError("");
        fetchUserData();
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: `✅ ${result.message}! Your new balance is ₦${result.balance.toLocaleString()}.`,
          sender: "ai",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: "read",
          type: "action",
          action: completedAction
        }]);
      } else {
        setError(result.error || "Biometric authorization failed");
      }
    } catch (err: any) {
      console.error("Biometric auth error:", err);
      setError(err.message || "Face ID / Fingerprint failed");
      // Fallback hint
      if (err.message.includes("not supported")) {
        setError("Biometrics not available in this environment. Use PIN.");
      }
    }
  };

  const handlePaystackPayment = () => {
    if (!fundAmount || Number(fundAmount) < 100) {
      alert("Please enter a valid amount (Min ₦100)");
      return;
    }

    const publicKey = (import.meta as any).env.VITE_PAYSTACK_PUBLIC_KEY;
    if (!publicKey) {
      alert("Paystack is not configured. Please add VITE_PAYSTACK_PUBLIC_KEY to your settings.");
      return;
    }

    if (!(window as any).PaystackPop) {
      alert("Payment gateway script failed to load. Please check your internet connection and refresh.");
      return;
    }

    setIsFunding(true);

    const handler = (window as any).PaystackPop.setup({
      key: publicKey,
      email: userData?.email || "customer@waviego.africa",
      amount: Number(fundAmount) * 100, // Amount in kobo
      currency: "NGN",
      ref: `WVG_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      callback: async (response: any) => {
        console.log("Paystack Payment Successful:", response);
        try {
          const verifyRes = await safeFetch("/api/paystack/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: response.reference })
          });
          const data = await verifyRes.json();
          if (verifyRes.ok) {
            setUserData(prev => prev ? { ...prev, wallet_balance: data.balance } : null);
            setShowFundModal(false);
            setFundAmount("");
            alert("Payment Successful! Your wallet has been credited.");
            fetchTransactions();
          } else {
            alert("Payment verification failed: " + data.error);
          }
        } catch (err) {
          alert("Error verifying payment");
        } finally {
          setIsFunding(false);
        }
      },
      onClose: () => {
        setIsFunding(false);
        console.log("Paystack Window Closed");
      }
    });

    handler.openIframe();
  };

  const fetchTransactions = async () => {
    try {
      const res = await safeFetch("/api/transactions");
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      console.error("Failed to fetch transactions", err);
    }
  };

  const handlePrintStatement = useReactToPrint({
    contentRef: statementRef,
    documentTitle: `Statement_${userData?.fullname || 'Customer'}_${new Date().toLocaleDateString()}`
  });

  const handleSendMessage = async () => {
    if (!input.trim() && !selectedImage) return;

    const currentInput = input;
    const currentImage = selectedImage;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: currentInput || (currentImage ? "Uploaded an image for processing..." : ""),
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: "sent"
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setSelectedImage(null);
    setIsTyping(true);
    setError("");

    try {
      console.log("[AI] Initializing Gemini on frontend...");
      const ai = new GoogleGenAI({ apiKey: (process as any).env.GEMINI_API_KEY });
      const modelName = "gemini-3-flash-preview";

      const SYSTEM_PROMPT = `
        You are Waviego Africa (by Antigravity), a helpful AI banking assistant.
        Goal: Help users manage money, transfers, bills, and insights.
        Mood: Professional, warm, African tone.
        Security: NEVER share PIN.
        Operations: get_balance, send_money, buy_airtime, get_recent_transactions.
      `;

      const personalizedPrompt = `${SYSTEM_PROMPT}
        Current User: ${userData?.fullname || "Unknown"}
        Current Balance: ₦${(userData?.wallet_balance || 0).toLocaleString()}
        User Phone: ${userData?.phone || "Unknown"}
        
        Instructions:
        - If the user provides a phone number and an amount, or asks to send money, immediately trigger 'send_money'.
        - If the user asks to buy airtime/data, immediately trigger 'buy_airtime'.
        - If the user asks "how much do I have" or "balance", trigger 'get_balance'.
        - ALWAYS call the appropriate tool instead of just talking when a transaction is implied.
        - If information is missing, ask for it.
        - Be helpful, quick, and secure.
      `;

      const history = messages.map(m => ({
        role: m.sender === "user" ? "user" : "model",
        parts: [{ text: m.text }]
      }));

      const newUserParts: any[] = [{ text: currentInput || "Analyze this image for banking details." }];
      if (currentImage) {
        newUserParts.push({
          inlineData: {
            mimeType: "image/png",
            data: currentImage.split(',')[1]
          }
        });
      }

      const contents = [...history, { role: "user", parts: newUserParts }];

      const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: personalizedPrompt,
          tools: [{
            functionDeclarations: [
              {
                name: "get_balance",
                description: "Get the current balance of the user's wallet",
                parameters: { type: Type.OBJECT as any, properties: {} },
              },
              {
                name: "send_money",
                description: "Send money to another person or bank account.",
                parameters: {
                  type: Type.OBJECT as any,
                  properties: {
                    amount: { type: Type.NUMBER as any, description: "The amount of money to send in NGN" },
                    recipient: { type: Type.STRING as any, description: "The name, phone number or account number of the recipient" },
                  },
                  required: ["amount", "recipient"],
                },
              },
              {
                name: "buy_airtime",
                description: "Buy airtime or data for a phone number.",
                parameters: {
                  type: Type.OBJECT as any,
                  properties: {
                    amount: { type: Type.NUMBER as any, description: "The amount in NGN" },
                    phone: { type: Type.STRING as any, description: "The target phone number" },
                    network: { type: Type.STRING as any, description: "The mobile network (MTN, Airtel, Glo, 9mobile)" },
                    type: { type: Type.STRING as any, enum: ["airtime", "data"], description: "Whether to buy airtime or a data bundle" },
                  },
                  required: ["amount", "phone", "network", "type"],
                },
              },
              {
                name: "get_recent_transactions",
                description: "Show a list of the most recent transactions.",
                parameters: { type: Type.OBJECT as any, properties: {} },
              }
            ]
          }]
        }
      });

      const aiText = response.text || "I'm processing that for you...";
      const functionCalls = response.functionCalls;

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: aiText,
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: "read"
      };

      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        handleFunctionCall(call, aiMsg);
      } else {
        setMessages(prev => [...prev, aiMsg]);
        setIsTyping(false);
      }

    } catch (err: any) {
      console.error("Gemini Error:", err);
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `Error: ${err.message || "I'm having trouble connecting right now. Please check your settings or try again."}`,
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: "read"
      }]);
    }
  };


  const handleFunctionCall = (call: any, aiMsg: Message) => {
    setIsTyping(false);
    
    if (call.name === "get_balance") {
      aiMsg.text = `Your current balance is ₦${userData?.wallet_balance.toLocaleString()}.`;
      setMessages(prev => [...prev, aiMsg]);
    } else if (call.name === "send_money") {
      aiMsg.text = `Understood. You want to send ₦${call.args.amount.toLocaleString()} to ${call.args.recipient}. Please enter your transaction PIN to authorize this transfer.`;
      setMessages(prev => [...prev, aiMsg]);
      setPendingAction({ actionType: "transfer", ...call.args });
      setTimeout(() => setShowPinModal(true), 1000);
    } else if (call.name === "buy_airtime") {
      aiMsg.text = `Confirmed. buying ₦${call.args.amount.toLocaleString()} ${call.args.type} for ${call.args.phone} (${call.args.network}). Please enter your PIN to complete this.`;
      setMessages(prev => [...prev, aiMsg]);
      setPendingAction({ actionType: "vtu", ...call.args });
      setTimeout(() => setShowPinModal(true), 1000);
    } else if (call.name === "get_recent_transactions") {
      fetchTransactions();
      setShowHistory(true);
      aiMsg.text = "Here are your recent transactions.";
      setMessages(prev => [...prev, aiMsg]);
    } else {
      setMessages(prev => [...prev, aiMsg]);
    }
  };

  const executeAction = async () => {
    if (!pin) {
      setError("Please enter your PIN");
      return;
    }

    try {
      const path = pendingAction.actionType === "transfer" ? "/api/transfer" : "/api/vtu";
      const res = await safeFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pendingAction, pin })
      });

      const result = await res.json();

      if (res.ok) {
        setShowPinModal(false);
        setPin("");
        const completedAction = { ...pendingAction, ...result.transaction };
        setPendingAction(null);
        setError("");
        fetchUserData();
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: `✅ ${result.message}! Your new balance is ₦${result.balance.toLocaleString()}.`,
          sender: "ai",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: "read",
          type: "action",
          action: completedAction
        }]);
      } else {
        setError(result.error || "Transaction failed");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }
  };

  const handleDownloadReceipt = async (action: any) => {
    setDownloadingReceipt(action);
    
    // Wait for render
    setTimeout(async () => {
      if (receiptRef.current) {
        try {
          const dataUrl = await toPng(receiptRef.current, { cacheBust: true, pixelRatio: 2 });
          const link = document.createElement('a');
          link.download = `Waviego-Receipt-${action.id || Date.now()}.png`;
          link.href = dataUrl;
          link.click();
          setDownloadingReceipt(null);
        } catch (err) {
          console.error("Failed to generate receipt", err);
          setDownloadingReceipt(null);
        }
      }
    }, 100);
  };

  return (
    <div className="flex flex-col h-screen bg-white font-sans overflow-hidden text-black">
      {/* Background Decorative Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-yellow/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-black/[0.02] rounded-full blur-[120px]" />
      </div>

      {!userData?.kyc_completed && kycStep !== "completed" ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 z-10 relative perspective-[1000px]">
          <motion.div 
            initial={{ opacity: 0, y: 40, rotateX: 15 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            whileHover={{ rotateX: 2, rotateY: 2, scale: 1.01 }}
            className="w-full max-w-md glass p-8 rounded-[2.5rem] border border-black/[0.05] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.1)] transition-shadow duration-500"
          >
            <div className="flex flex-col items-center mb-8">
              <div className="w-24 h-24 rounded-[2.5rem] bg-white flex items-center justify-center border border-black/5 shadow-3d overflow-hidden p-2">
                <img src="/logo.svg" alt="Waviego Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
              </div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-yellow-dark/80 mt-4">Your Bank in your Chat</p>
            </div>

            <h2 className="text-3xl font-display font-bold text-center mb-2 tracking-tight text-black">
              {isLogin ? "Welcome Back" : "Waviego Onboarding"}
            </h2>
            <p className="text-center text-black/40 text-[10px] mb-10 uppercase tracking-[0.2em] font-black">
              {isLogin ? "Secure Vault Access" : "AI-Powered Banking Setup"}
            </p>

            {(kycStep === "init" || kycStep === "phone_input") && (
              <div className="space-y-6">
                <p className="text-center text-black/60 text-sm mb-4 leading-relaxed px-4">
                  {isLogin 
                    ? "Enter your registered phone number to access your Waviego account."
                    : "To start using Waviego Africa, we need to verify your identity and set up your secure banking environment."
                  }
                </p>
                <div>
                  <label className="text-[10px] font-black uppercase text-yellow-dark mb-2 block tracking-widest pl-1">Phone Number</label>
                  <input 
                    type="text"
                    value={kycPhone}
                    onChange={(e) => setKycPhone(e.target.value)}
                    placeholder="e.g. 0800 000 0000"
                    className="w-full bg-black/[0.03] border border-black/[0.05] rounded-2xl py-4 px-6 text-black outline-none focus:border-yellow/50 transition-all font-mono"
                  />
                </div>
                <button 
                  onClick={startKyc}
                  disabled={kycLoading || !kycPhone}
                  className="w-full py-5 bg-yellow text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-yellow/20 disabled:opacity-50"
                >
                  {kycLoading ? "Authorizing..." : (isLogin ? "Sign In" : "Get Started")}
                </button>
                
                <div className="flex flex-col items-center justify-center pt-8 border-t border-black/5">
                  <button 
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-[10px] font-black uppercase tracking-widest text-black/40 hover:text-black transition-colors"
                  >
                    {isLogin ? "Need a new account? Register" : "Already have an account? Login"}
                  </button>
                </div>
              </div>
            )}

            {kycStep === "otp_verification" && (
              <div className="space-y-6">
                 <div>
                  <label className="text-[10px] font-black uppercase text-yellow-dark mb-2 block">Enter 4-Digit OTP</label>
                  <input 
                    type="text"
                    value={kycOtp}
                    onChange={(e) => setKycOtp(e.target.value)}
                    placeholder="0000"
                    maxLength={4}
                    className="w-full bg-black/[0.03] border border-black/[0.05] rounded-2xl py-4 px-6 text-black text-center text-2xl font-mono tracking-widest outline-none focus:border-yellow/50 transition-all"
                  />
                  {kycDemoOtp ? (
                    <div className="mt-4 p-3 rounded-xl bg-orange-500/5 border border-orange-500/10 text-center">
                      <p className="text-[10px] font-black uppercase text-orange-600 tracking-widest mb-1">Demo Mode OTP</p>
                      <p className="text-xl font-mono font-bold text-black tracking-[0.5em]">{kycDemoOtp}</p>
                      <p className="text-[9px] text-black/40 mt-1">Configure Twilio keys for real WhatsApp SMS</p>
                    </div>
                  ) : (
                    <div className="mt-4 p-3 rounded-xl bg-yellow/10 border border-yellow/20 text-center">
                      <p className="text-[10px] font-black uppercase text-yellow-dark tracking-widest mb-1">OTP SENT</p>
                      <p className="text-[11px] text-black/60">Check your phone for the verification code.</p>
                    </div>
                  )}
                </div>
                <button 
                  onClick={verifyOtp}
                  disabled={kycLoading || kycOtp.length < 4}
                  className="w-full py-5 bg-yellow text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-yellow/20 disabled:opacity-50"
                >
                  {kycLoading ? "Verifying..." : "Confirm OTP"}
                </button>
              </div>
            )}

            {kycStep === "personal_info" && (
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-yellow-dark mb-2 block">Full Legal Name</label>
                  <input 
                    type="text"
                    value={kycFullname}
                    onChange={(e) => setKycFullname(e.target.value)}
                    placeholder="John Doe"
                    className="w-full bg-black/[0.03] border border-black/[0.05] rounded-2xl py-4 px-6 text-black outline-none focus:border-yellow/50 transition-all mb-4"
                  />
                  <label className="text-[10px] font-black uppercase text-yellow-dark mb-2 block">Email Address</label>
                  <input 
                    type="email"
                    value={kycEmail}
                    onChange={(e) => setKycEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full bg-black/[0.03] border border-black/[0.05] rounded-2xl py-4 px-6 text-black outline-none focus:border-yellow/50 transition-all mb-4"
                  />
                  <label className="text-[10px] font-black uppercase text-yellow-dark mb-2 block">Date of Birth</label>
                  <input 
                    type="date"
                    value={kycDob}
                    onChange={(e) => setKycDob(e.target.value)}
                    className="w-full bg-black/[0.03] border border-black/[0.05] rounded-2xl py-4 px-6 text-black outline-none focus:border-yellow/50 transition-all"
                  />
                </div>
                <button 
                  onClick={savePersonalInfo}
                  disabled={kycLoading || !kycFullname || !kycEmail || !kycDob}
                  className="w-full py-5 bg-yellow text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-yellow/20 disabled:opacity-50"
                >
                  {kycLoading ? "Saving..." : "Continue"}
                </button>
              </div>
            )}

            {kycStep === "identity_verification" && (
              <div className="space-y-6">
                <div>
                  <p className="text-[11px] text-black/50 mb-6 text-center">Verify your identity with your Bank Verification Number (BVN) or National Identity Number (NIN).</p>
                  
                  <label className="text-[10px] font-black uppercase text-yellow-dark mb-2 block">Select ID Type</label>
                  <div className="flex gap-2 mb-6">
                    {["BVN", "NIN"].map((type) => (
                      <button
                        key={type}
                        onClick={() => setKycIdType(type)}
                        className={`flex-1 py-3 rounded-xl border font-bold text-[10px] uppercase tracking-widest transition-all ${
                          kycIdType === type 
                            ? "bg-yellow/20 border-yellow text-yellow-dark shadow-[0_0_20px_rgba(255,217,61,0.15)]" 
                            : "bg-black/[0.03] border-black/[0.05] text-black/40 hover:border-black/20"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  <label className="text-[10px] font-black uppercase text-yellow-dark mb-2 block">{kycIdType} (11 Digits)</label>
                  <input 
                    type="text"
                    value={kycIdNumber}
                    onChange={(e) => setKycIdNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="00000000000"
                    maxLength={11}
                    className="w-full bg-black/[0.03] border border-black/[0.05] rounded-2xl py-4 px-6 text-black font-mono text-center text-xl tracking-widest outline-none focus:border-yellow/50 transition-all"
                  />
                </div>
                <button 
                  onClick={verifyIdentity}
                  disabled={kycLoading || kycIdNumber.length !== 11}
                  className="w-full py-5 bg-yellow text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-yellow/20 disabled:opacity-50"
                >
                  {kycLoading ? "Verifying..." : `Verify ${kycIdType}`}
                </button>
              </div>
            )}

            {kycStep === "address_verification" && (
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-yellow-dark mb-2 block">Residential Address</label>
                  <textarea 
                    value={kycAddress}
                    onChange={(e) => setKycAddress(e.target.value)}
                    placeholder="123 Waviego Way, Lekki"
                    rows={2}
                    className="w-full bg-black/[0.03] border border-black/[0.05] rounded-2xl py-4 px-6 text-black outline-none focus:border-yellow/50 transition-all mb-4 resize-none"
                  />
                  <label className="text-[10px] font-black uppercase text-yellow-dark mb-2 block">State</label>
                  <select 
                    value={kycState}
                    onChange={(e) => setKycState(e.target.value)}
                    className="w-full bg-black/[0.03] border border-black/[0.05] rounded-2xl py-4 px-6 text-black outline-none focus:border-yellow/50 transition-all font-bold"
                  >
                    <option value="" className="bg-white text-black">Select State</option>
                    <option value="Abia">Abia</option>
                    <option value="Adamawa">Adamawa</option>
                    <option value="Akwa Ibom">Akwa Ibom</option>
                    <option value="Anambra">Anambra</option>
                    <option value="Bauchi">Bauchi</option>
                    <option value="Bayelsa">Bayelsa</option>
                    <option value="Benue">Benue</option>
                    <option value="Borno">Borno</option>
                    <option value="Cross River">Cross River</option>
                    <option value="Delta">Delta</option>
                    <option value="Ebonyi">Ebonyi</option>
                    <option value="Edo">Edo</option>
                    <option value="Ekiti">Ekiti</option>
                    <option value="Enugu">Enugu</option>
                    <option value="FCT (Abuja)">FCT (Abuja)</option>
                    <option value="Gombe">Gombe</option>
                    <option value="Imo">Imo</option>
                    <option value="Jigawa">Jigawa</option>
                    <option value="Kaduna">Kaduna</option>
                    <option value="Kano">Kano</option>
                    <option value="Katsina">Katsina</option>
                    <option value="Kebbi">Kebbi</option>
                    <option value="Kogi">Kogi</option>
                    <option value="Kwara">Kwara</option>
                    <option value="Lagos">Lagos</option>
                    <option value="Nasarawa">Nasarawa</option>
                    <option value="Niger">Niger</option>
                    <option value="Ogun">Ogun</option>
                    <option value="Ondo">Ondo</option>
                    <option value="Osun">Osun</option>
                    <option value="Oyo">Oyo</option>
                    <option value="Plateau">Plateau</option>
                    <option value="Rivers">Rivers</option>
                    <option value="Sokoto">Sokoto</option>
                    <option value="Taraba">Taraba</option>
                    <option value="Yobe">Yobe</option>
                    <option value="Zamfara">Zamfara</option>
                  </select>
                </div>
                <button 
                  onClick={saveAddress}
                  disabled={kycLoading || !kycAddress || !kycState}
                  className="w-full py-5 bg-yellow text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-yellow/20 disabled:opacity-50"
                >
                  {kycLoading ? "Saving Address..." : "Continue"}
                </button>
              </div>
            )}

            {kycStep === "pin_creation" && (
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-yellow-dark mb-2 block">Set Transaction PIN</label>
                  <input 
                    type="password"
                    value={kycPin}
                    onChange={(e) => setKycPin(e.target.value)}
                    placeholder="****"
                    maxLength={4}
                    className="w-full bg-black/[0.03] border border-black/[0.05] rounded-2xl py-4 px-6 text-black text-center text-3xl tracking-[0.5em] outline-none focus:border-yellow/50 transition-all"
                  />
                  <p className="mt-2 text-[10px] text-black/40 text-center uppercase tracking-wider font-bold">This will be used for all transfers</p>
                </div>
                <button 
                  onClick={finalizeKyc}
                  disabled={kycLoading || kycPin.length < 4}
                  className="w-full py-5 bg-yellow text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-yellow/20 disabled:opacity-50"
                >
                  {kycLoading ? "Finalizing..." : "Complete Setup"}
                </button>
              </div>
            )}

            {kycError && (
              <p className="mt-6 text-rose-500 text-[10px] font-bold text-center uppercase tracking-widest">{kycError}</p>
            )}

            {kycStep !== "init" && (
              <div className="mt-10 flex items-center justify-center gap-3 opacity-30">
                {[ "Phone", "OTP", "Info", "ID", "Addr", "PIN" ].map((step, idx) => {
                  const stepMapping = ["phone_input", "otp_verification", "personal_info", "identity_verification", "address_verification", "pin_creation"];
                  const currentIdx = stepMapping.indexOf(kycStep);
                  const isActive = idx <= currentIdx;
                  return (
                    <React.Fragment key={step}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-yellow' : 'bg-black/10'}`} />
                    {idx < 5 && <div className={`w-6 h-[1px] ${idx < currentIdx ? 'bg-yellow' : 'bg-black/5'}`} />}
                  </React.Fragment>
                  )
                })}
              </div>
            )}
          </motion.div>
        </div>
      ) : (
        <>
          {/* Header - Glassmorphic */}
      <header className="glass border-b border-black/[0.05] p-4 flex items-center justify-between z-20 sticky top-0 shadow-lg shadow-black/[0.02]">
        <div className="flex items-center gap-3">
          <motion.div 
            whileHover={{ scale: 1.1, rotate: 5 }}
            animate={{ 
              y: [0, -4, 0],
              rotate: [0, 2, 0, -2, 0]
            }}
            transition={{ 
              duration: 4, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
            className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center border border-black/5 shadow-3d overflow-hidden p-1"
          >
            <img src="/logo.svg" alt="Waviego Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </motion.div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-black leading-none">Waviego</h1>
            <p className="text-[7px] font-black uppercase tracking-[0.1em] text-black/50 mt-1">Your Bank in your Chat</p>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1 h-1 rounded-full bg-yellow animate-pulse" />
              <p className="text-[8px] uppercase font-bold tracking-widest text-yellow-dark">AI Active</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-8 text-[11px] font-bold uppercase tracking-widest text-black/40">
            <span className="hover:text-black cursor-pointer transition-colors">Security</span>
            <span className="hover:text-black cursor-pointer transition-colors">Insurance</span>
            <span className="hover:text-black cursor-pointer transition-colors">Insights</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSettings(true)}
              className="w-10 h-10 rounded-full glass border border-black/5 flex items-center justify-center hover:bg-black/5 transition-colors"
            >
              <User className="w-5 h-5 text-black/70" />
            </button>
            <button 
              onClick={() => {
                alert("Waviego Platform v1.2.0\nSecurity: AES-256 Enabled\nNetwork: Mainnet");
              }}
              className="lg:hidden w-10 h-10 rounded-full glass border border-black/5 flex items-center justify-center hover:bg-black/5 transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-black/70" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Sidebar - Bento Style */}
        <aside className="hidden lg:flex flex-col w-80 border-r border-black/[0.05] p-6 space-y-6 overflow-y-auto custom-scrollbar bg-black/[0.01]">
          <div className="space-y-1">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-dark">Dashboard</h2>
            <p className="text-2xl font-serif italic text-black/80">Your Assets</p>
          </div>
          
          <div className="space-y-4">
            {/* Balance Card 3D */}
            <motion.div 
              whileHover={{ y: -8, rotateX: 5, rotateY: -5, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="p-5 rounded-[2rem] bg-black text-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] relative group/bal overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-yellow/10 rounded-full blur-3xl -mr-10 -mt-10" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] uppercase font-black text-white/40 tracking-widest text-nowrap">Available Balance</p>
                  <button 
                    onClick={() => setShowFundModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow/10 border border-yellow/20 hover:bg-yellow/20 transition-all"
                  >
                    <Plus className="w-3 h-3 text-yellow" />
                    <span className="text-[9px] font-black text-yellow">FUND</span>
                  </button>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold opacity-30">₦</span>
                  <p className="text-3xl font-mono tracking-tighter text-white font-bold">{userData?.wallet_balance.toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2 mt-4">
                   <div className="px-2 py-1 rounded-md bg-yellow/10 border border-yellow/20 text-[9px] font-bold text-yellow">
                     +12.5% EARNINGS
                   </div>
                </div>
              </div>
            </motion.div>

            {/* Virtual Account Bento */}
            <motion.div 
              whileHover={{ y: -4, scale: 1.02 }}
              onClick={() => setShowFundModal(true)}
              className="p-5 rounded-[2.5rem] bg-black/[0.03] border border-black/[0.05] shadow-[0_10px_30px_rgba(0,0,0,0.02)] cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] uppercase font-black text-black/30 tracking-tight">Deposit Account</p>
                <div className="w-6 h-6 rounded-lg bg-yellow/10 flex items-center justify-center border border-yellow/20">
                   <ArrowDownLeft className="w-3 h-3 text-yellow-dark" />
                </div>
              </div>
              <p className="text-lg font-mono tracking-wider text-black/90 mb-1 leading-none group-hover:text-yellow-dark transition-colors">{userData?.virtual_account}</p>
              <p className="text-[9px] font-bold text-black/30 uppercase tracking-widest">{userData?.virtual_bank || "Generating..."}</p>
              <p className="mt-4 text-[9px] font-bold text-black/20 uppercase tracking-widest leading-tight">{userData?.virtual_account_name}</p>
            </motion.div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Wallet, label: "Balance", cmd: "Check my balance" },
                { icon: ArrowRightLeft, label: "Transfer", cmd: "Send money" },
                { icon: Smartphone, label: "VTU", cmd: "Buy airtime or data" },
                { icon: History, label: "Ledger", action: () => { fetchTransactions(); setShowHistory(true); } }
              ].map((item, idx) => (
                <motion.button 
                  key={idx}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => item.action ? item.action() : setInput(item.cmd || "")}
                  className="flex flex-col items-center justify-center p-4 bg-black/[0.03] border border-black/[0.05] rounded-[1.5rem] hover:bg-yellow hover:border-yellow transition-all group"
                >
                  <item.icon className="w-6 h-6 mb-2 group-hover:text-black text-yellow-dark transition-colors" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-black/40 group-hover:text-black">{item.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
          
          <div className="mt-auto p-5 rounded-[2rem] border border-black/[0.05] bg-black/[0.02]">
             <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]" />
                <p className="text-[10px] font-black text-black/30">SECURITY STATUS</p>
             </div>
             <p className="text-[11px] text-black/60 leading-relaxed font-bold">AES-256 Active</p>
             
             <div className="mt-4 p-3 rounded-2xl bg-black/5 border border-black/5">
                <p className="text-[9px] font-black text-black/30 uppercase tracking-widest mb-2">Services</p>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${apiStatus.gemini ? 'bg-yellow shadow-[0_0_8px_rgba(255,217,61,0.3)]' : 'bg-rose-500'}`} />
                    <span className="text-[8px] font-bold text-black/40 uppercase">AI CORE</span>
                  </div>
                </div>
             </div>
          </div>
          <button 
            onClick={logout}
            className="w-full py-3 border border-black/[0.05] rounded-xl text-[9px] font-black uppercase tracking-widest text-black/30 hover:text-rose-500 hover:border-rose-500 hover:bg-rose-500/5 transition-all mt-4"
          >
            Logout / New Registration
          </button>
        </aside>

        {/* Chat Area - 3D Neumorphic Bumps */}
        <main className="flex-1 flex flex-col relative bg-transparent overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-32">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  key={m.id}
                  className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[80%] flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}>
                  <div 
                      className={`p-4 rounded-[1.5rem] shadow-[0_10px_30px_rgba(0,0,0,0.05)] relative transition-all ${
                        m.sender === "user" 
                          ? "bg-yellow text-black rounded-tr-none border border-yellow shadow-xl shadow-yellow/10 font-bold" 
                          : "bg-white text-black rounded-tl-none border border-black/5"
                      }`}
                    >
                      <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{m.text}</p>
                      
                      {m.type === "action" && (
                        <motion.button 
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleDownloadReceipt(m.action)}
                          className="mt-4 w-full py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Vault Receipt
                        </motion.button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 px-2">
                      <span className="text-[9px] font-bold opacity-30 tracking-tight">{m.timestamp}</span>
                      {m.sender === "user" && (
                        <div className="flex">
                           <CheckCheck className={`w-3.5 h-3.5 ${m.status === 'read' ? 'text-yellow-dark' : 'text-black/20'}`} />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="bg-black/5 p-4 rounded-[1.5rem] flex gap-1.5 border border-black/5">
                  <motion.div animate={{ opacity: [0.4, 1, 0.4], y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.2 }} className="w-2 h-2 bg-yellow rounded-full" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4], y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="w-2 h-2 bg-yellow rounded-full" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4], y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }} className="w-2 h-2 bg-yellow rounded-full" />
                </div>
              </motion.div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Floating Input Area */}
          <div className="absolute bottom-6 left-6 right-6 z-20">
            <AnimatePresence>
              {selectedImage && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mb-4 ml-4"
                >
                  <div className="relative inline-block">
                    <img src={selectedImage} alt="Preview" className="w-20 h-20 object-cover rounded-xl border-2 border-yellow shadow-lg" />
                    <button 
                      onClick={() => setSelectedImage(null)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-rose-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="max-w-3xl mx-auto glass border border-black/5 shadow-2xl shadow-black/5 rounded-[2.5rem] p-2 flex items-center gap-2">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                className="hidden" 
              />
              
              <div className="flex-1 flex items-center px-4">
                 <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder={isRecording ? "Listening..." : "Message or use voice..."}
                  disabled={isRecording}
                  className="flex-1 bg-transparent border-none outline-none text-sm py-3 text-black placeholder:text-black/30"
                />
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-black/40 hover:text-black transition-colors"
                >
                  <Camera className="w-5 h-5" />
                </button>
                <motion.button 
                  animate={isRecording ? { scale: [1, 1.2, 1], backgroundColor: "rgba(225,29,72,0.1)" } : {}}
                  transition={isRecording ? { repeat: Infinity, duration: 1.5 } : {}}
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isRecording ? 'text-rose-500' : 'text-black/40 hover:text-black'}`}
                >
                  <Mic className="w-5 h-5" />
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleSendMessage}
                  className="bg-yellow hover:bg-yellow-dark w-12 h-12 rounded-full flex items-center justify-center text-black shadow-[0_0_15px_rgba(255,217,61,0.2)] shrink-0"
                >
                  <Send className="w-5 h-5 ml-0.5" />
                </motion.button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* PIN Modal */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 40, rotateX: 10 }}
              animate={{ scale: 1, y: 0, rotateX: 0 }}
              className="glass w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl border border-black/5"
            >
              <div className="bg-black p-8 text-white text-center">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                  <Lock className="w-8 h-8 text-yellow" />
                </div>
                <h3 className="text-2xl font-display font-bold mb-1">Verify Identity</h3>
                <p className="text-white/40 text-[10px] uppercase tracking-[0.3em] font-black">Secure Vault Access</p>
              </div>
              
              <div className="p-8">
                <p className="text-center text-black/50 text-xs mb-8 font-medium">
                  Authorizing <span className="text-black font-bold uppercase">{pendingAction?.actionType}</span> for <span className="text-black font-bold">₦{pendingAction?.amount.toLocaleString()}</span>
                </p>
                
                <div className="flex justify-center gap-4 mb-10">
                  {[1,2,3,4].map((_, i) => (
                    <motion.div 
                      key={i} 
                      animate={pin.length > i ? { scale: [1, 1.2, 1], backgroundColor: "#FFD93D" } : {}}
                      className={`w-3.5 h-3.5 rounded-full border-2 border-black/10 ${pin.length > i ? 'bg-yellow border-yellow' : 'bg-transparent'}`} 
                    />
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-4 mb-8">
                  {[1,2,3,4,5,6,7,8,9, 'C', 0, 'Del'].map((val) => (
                    <motion.button
                      key={val}
                      whileHover={{ scale: 1.05, backgroundColor: "rgba(0,0,0,0.03)" }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        if (val === 'C') setPin("");
                        else if (val === 'Del') setPin(prev => prev.slice(0, -1));
                        else if (pin.length < 4) setPin(prev => prev + val);
                      }}
                      className="h-16 bg-black/[0.03] rounded-2xl flex items-center justify-center font-mono font-bold text-xl text-black border border-black/5 active:bg-black/10 transition-colors"
                    >
                      {val === 'Del' ? <X className="w-5 h-5 opacity-40" /> : val}
                    </motion.button>
                  ))}
                  
                  {/* Biometric Trigger in Pad */}
                  {biometricSupported && userData?.biometricSet && (
                    <motion.button
                      whileHover={{ scale: 1.05, backgroundColor: "rgba(255, 217, 61, 0.1)" }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleBiometricAuth}
                      className="h-16 bg-yellow/10 rounded-2xl flex items-center justify-center text-black border border-yellow/20"
                    >
                      <Fingerprint className="w-8 h-8" />
                    </motion.button>
                  )}
                </div>

                {error && <p className="text-rose-500 text-[10px] font-bold text-center mb-6 uppercase tracking-wider">{error}</p>}

                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setShowPinModal(false);
                      setPin("");
                      setError("");
                    }}
                    className="flex-1 py-4 font-bold text-black/40 hover:text-black transition-colors text-xs uppercase tracking-widest"
                  >
                    Abort
                  </button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={executeAction}
                    className="flex-1 py-4 font-black uppercase tracking-widest text-[10px] text-black bg-yellow rounded-2xl shadow-[0_10px_20px_rgba(255,217,61,0.2)]"
                  >
                    Confirm
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xl p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 40 }}
              className="glass w-full max-w-md rounded-[3rem] overflow-hidden border border-black/5 shadow-2xl relative"
            >
              <div className="p-8 pb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-dark mb-1">Vault Control</p>
                  <h2 className="text-3xl font-serif italic text-black/80">Settings</h2>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-12 h-12 bg-black/[0.03] hover:bg-black/[0.08] rounded-full flex items-center justify-center text-black transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-8">
                {/* Profile Section */}
                <div className="flex items-center gap-6 p-6 bg-black/[0.03] backdrop-blur-md rounded-[2.5rem] border border-black/[0.05]">
                  <div className="w-16 h-16 rounded-2xl bg-yellow flex items-center justify-center text-black font-black text-2xl shadow-lg shadow-yellow/20">
                    {userData?.fullname?.[0] || "U"}
                  </div>
                  <div>
                    <h3 className="font-bold text-black text-lg leading-tight">{userData?.fullname}</h3>
                    <p className="text-[10px] uppercase font-black tracking-widest text-black/40 mt-1">{userData?.phone}</p>
                  </div>
                </div>

                {/* Biometric Toggle */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-black/80">Biometric Authentication</h4>
                      <p className="text-[10px] text-black/40 mt-1 uppercase tracking-tight">FACE ID / FINGERPRINT AUTHORIZATION</p>
                    </div>
                    {biometricSupported ? (
                      <motion.button
                        layout
                        onClick={handleBiometricEnroll}
                        disabled={isBiometricEnrolling}
                        className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 ${userData?.biometricSet ? 'bg-yellow' : 'bg-black/10'}`}
                      >
                        <motion.div 
                          layout
                          className={`w-6 h-6 rounded-full bg-white shadow-lg flex items-center justify-center ${userData?.biometricSet ? 'ml-auto' : ''}`}
                        >
                          {isBiometricEnrolling ? (
                            <div className="w-3 h-3 border-2 border-yellow border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Fingerprint className={`w-3.5 h-3.5 ${userData?.biometricSet ? 'text-black' : 'text-gray-400'}`} />
                          )}
                        </motion.div>
                      </motion.button>
                    ) : (
                      <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest">NOT SUPPORTED</p>
                    )}
                  </div>
                  
                  {userData?.biometricSet && (
                    <div className="p-4 bg-yellow/5 border border-yellow/10 rounded-2xl">
                      <p className="text-[10px] text-yellow-dark leading-relaxed font-bold uppercase tracking-tight">
                        Biometric auth is active. You can now authorize transfers with your device security.
                      </p>
                    </div>
                  )}
                </div>

                {/* Account Actions */}
                <div className="space-y-3">
                   <button 
                    onClick={() => {
                      if(confirm("Are you sure you want to log out?")) logout();
                    }}
                    className="w-full py-5 bg-black/[0.03] hover:bg-rose-500/10 border border-black/[0.05] hover:border-rose-500/30 text-rose-500 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all"
                  >
                    Terminate Session
                  </button>
                  <p className="text-center text-[9px] text-black/20 font-black uppercase tracking-[0.2em] mt-4">Waviego Africa | Secure Banking Protocol</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Slide-over */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col border-l border-black/5"
            >
              <div className="p-8 pb-4 flex items-center justify-between">
                <div className="flex-1">
                   <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-dark mb-1">Audit Log</h2>
                  <p className="text-3xl font-serif italic text-black/80">Transactions</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowStatement(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl font-black uppercase tracking-widest text-[9px] hover:bg-black/80 transition-all shadow-lg"
                  >
                    <Download className="w-3 h-3" />
                    Statement
                  </button>
                  <button onClick={() => {
                    setShowHistory(false);
                    setHistorySearch("");
                  }} className="w-12 h-12 bg-black/[0.03] rounded-full flex items-center justify-center text-black hover:bg-black/10 transition-all">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="px-8 pb-6">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center opacity-30 group-focus-within:opacity-100 transition-opacity">
                    <Search className="w-4 h-4 text-black" />
                  </div>
                  <input 
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Filter records..."
                    className="w-full bg-black/[0.03] border border-black/5 rounded-2xl py-4 pl-12 pr-4 text-sm text-black outline-none focus:border-yellow transition-all font-bold"
                  />
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {transactions.filter(tx => {
                  const query = historySearch.toLowerCase();
                  return (
                    (tx.recipient?.toLowerCase() || "").includes(query) ||
                    (tx.phone?.toLowerCase() || "").includes(query) ||
                    (tx.amount.toString().includes(query)) ||
                    (new Date(tx.created_at).toLocaleString().toLowerCase().includes(query)) ||
                    (tx.itemType?.toLowerCase() || "").includes(query)
                  );
                }).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-black/10">
                    <History className="w-16 h-16 mb-4 opacity-10" />
                    <p className="text-xs uppercase font-black tracking-widest">No active records</p>
                  </div>
                ) : (
                  transactions.filter(tx => {
                    const query = historySearch.toLowerCase();
                    return (
                      (tx.recipient?.toLowerCase() || "").includes(query) ||
                      (tx.phone?.toLowerCase() || "").includes(query) ||
                      (tx.amount.toString().includes(query)) ||
                      (new Date(tx.created_at).toLocaleString().toLowerCase().includes(query)) ||
                      (tx.itemType?.toLowerCase() || "").includes(query)
                    );
                  }).map((tx) => (
                    <motion.div 
                      layout
                      key={tx.id} 
                      onClick={() => setSelectedTxDetail(tx)}
                      className="group p-5 bg-black/[0.02] rounded-[2.5rem] border border-black/5 hover:border-yellow/40 cursor-pointer shadow-sm hover:shadow-xl hover:shadow-yellow/5 transition-all relative overflow-hidden"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border border-black/5 ${
                          tx.type === 'transfer' ? 'bg-orange-500/5 text-orange-500' : 'bg-blue-500/5 text-blue-500'
                        }`}>
                          {tx.type === 'transfer' ? <ArrowUpRight className="w-6 h-6" /> : <Smartphone className="w-6 h-6" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-bold text-sm text-black/80 truncate pr-2 capitalize">{tx.type === 'vtu' ? `${tx.itemType}` : 'Transfer'}</h4>
                            <p className="font-mono text-sm font-bold text-black shrink-0">₦{tx.amount.toLocaleString()}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black text-black/20 truncate uppercase tracking-tight">
                              {tx.type === 'transfer' ? `To: ${tx.recipient}` : `${tx.network} - ${tx.phone}`}
                            </p>
                            <p className="text-[9px] font-mono text-black/20 font-bold">{new Date(tx.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              <div className="p-8 bg-black/[0.01] border-t border-black/5">
                <button 
                  onClick={() => {
                    setShowHistory(false);
                    setHistorySearch("");
                  }}
                  className="w-full py-5 bg-yellow text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-yellow-dark transition-colors shadow-xl shadow-yellow/20"
                >
                  Exit Archive
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Funding Modal */}
      <AnimatePresence>
        {showFundModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col border border-black/5"
            >
              <div className="p-8 pb-4 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-dark">Fund Account</p>
                <button 
                  onClick={() => setShowFundModal(false)}
                  className="w-10 h-10 bg-black/[0.03] rounded-full flex items-center justify-center text-black hover:bg-black/10 transition-all font-bold"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 pt-4">
                <div className="mb-6">
                  <label className="text-[10px] font-black uppercase text-black/30 mb-2 block tracking-widest text-center">Amount (₦)</label>
                  <input 
                    type="number"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="5000"
                    className="w-full bg-black/[0.03] border border-black/5 rounded-2xl py-5 px-6 text-black text-center text-3xl font-bold outline-none focus:border-yellow transition-all"
                  />
                </div>

                <button 
                  onClick={handlePaystackPayment}
                  disabled={isFunding || !fundAmount}
                  className="w-full py-5 bg-yellow text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-yellow/20 mb-8 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isFunding ? "Processing..." : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      SECURE FUNDING
                    </>
                  )}
                </button>

                <div className="flex items-center gap-4 mb-8 opacity-10">
                  <div className="h-[1px] flex-1 bg-black" />
                  <span className="text-[9px] font-black uppercase tracking-widest">BANK TRANSFER</span>
                  <div className="h-[1px] flex-1 bg-black" />
                </div>

                <div className="mb-8 flex flex-col items-center bg-black/[0.03] border border-black/5 rounded-3xl p-6 relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-20 h-20 bg-yellow/20 blur-[40px] -mr-10 -mt-10" />
                   <p className="text-[10px] font-black uppercase tracking-widest text-yellow-dark mb-6 font-mono">Reserved Account</p>
                   
                   <div className="w-full space-y-6">
                      <div className="flex flex-col items-center">
                         <span className="text-[9px] font-black text-black/20 uppercase tracking-widest mb-1">Bank Name</span>
                         <span className="text-sm font-bold text-black uppercase tracking-tight">{userData?.virtual_bank || "Bank Loading..."}</span>
                      </div>
                      
                      <div className="flex flex-col items-center relative py-4 group">
                         <span className="text-[9px] font-black text-black/20 uppercase tracking-widest mb-2">Account Number</span>
                         <div className="flex items-center gap-3">
                           <span className="text-3xl font-mono font-bold text-black tracking-widest leading-none outline-none">
                             {userData?.virtual_account || ".........."}
                           </span>
                           <button 
                             onClick={() => {
                               if (userData?.virtual_account) {
                                 navigator.clipboard.writeText(userData.virtual_account);
                                 alert("Account number copied!");
                               }
                             }}
                             className="p-2 glass rounded-lg text-black hover:bg-yellow transition-colors"
                           >
                              <Check className="w-4 h-4" />
                           </button>
                         </div>
                      </div>

                      <div className="flex flex-col items-center">
                         <span className="text-[9px] font-black text-black/20 uppercase tracking-widest mb-1">Account Holder</span>
                         <span className="text-xs font-bold text-black/60 tracking-wider uppercase">{userData?.virtual_account_name || userData?.fullname}</span>
                      </div>
                   </div>
                </div>

                <div className="bg-black/[0.03] border border-black/5 rounded-2xl p-5 space-y-3 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-yellow/20 flex items-center justify-center mt-0.5 shrink-0">
                       <CheckCheck className="w-3 h-3 text-yellow-dark" />
                    </div>
                    <p className="text-[11px] text-black/60 leading-relaxed font-bold">Protocol Active: Wallet will be credited automatically.</p>
                  </div>
                </div>

                <button 
                  onClick={() => setShowFundModal(false)}
                  className="w-full py-5 bg-black text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl hover:bg-yellow hover:text-black transition-all"
                >
                  Confirm & Go Back
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Statement Modal */}
      <AnimatePresence>
        {showStatement && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] overflow-y-auto bg-black/60 backdrop-blur-xl flex items-start justify-center p-4 md:p-12 font-sans"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-white w-full max-w-5xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col min-h-[90vh]"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10">
                <div>
                  <h3 className="text-2xl font-serif italic text-black/80">Statement of Account</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Preview Mode</p>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => handlePrintStatement()}
                    className="flex items-center gap-2 px-8 py-4 bg-yellow text-black rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-yellow-dark transition-all shadow-xl shadow-yellow/20"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                  <button 
                    onClick={() => setShowStatement(false)}
                    className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-black hover:bg-slate-200 transition-all"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-slate-50 p-4 md:p-8">
                <div className="shadow-2xl shadow-black/5 bg-white">
                   <Statement 
                    ref={statementRef}
                    transactions={transactions}
                    userData={userData}
                   />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction Detail Modal */}
      <AnimatePresence>
        {selectedTxDetail && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col border border-black/5"
            >
              <div className="p-8 pb-4 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-dark">Receipt Details</p>
                <button 
                  onClick={() => setSelectedTxDetail(null)}
                  className="w-10 h-10 bg-black/[0.03] rounded-full flex items-center justify-center text-black"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8">
                <div className="flex flex-col items-center mb-10">
                  <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center mb-6 shadow-xl border border-black/5 ${
                    selectedTxDetail.type === 'transfer' ? 'bg-orange-500/5 text-orange-500' : 'bg-blue-500/5 text-blue-500'
                  }`}>
                    {selectedTxDetail.type === 'transfer' ? <ArrowUpRight className="w-10 h-10" /> : <Smartphone className="w-10 h-10" />}
                  </div>
                  <h2 className="text-4xl font-mono tracking-tighter text-black font-bold leading-none mb-2">₦{selectedTxDetail.amount.toLocaleString()}</h2>
                  <p className="text-[10px] font-black uppercase tracking-widest text-black/30">Total Value Settled</p>
                </div>

                <div className="space-y-6 mb-10">
                  {[
                    { label: "Operation", val: selectedTxDetail.type === 'vtu' ? `${selectedTxDetail.itemType} Purchase` : 'Fund Transfer', highlight: true },
                    { label: "Ref ID", val: selectedTxDetail.id, mono: true },
                    { label: "Timestamp", val: new Date(selectedTxDetail.created_at).toLocaleString() },
                    ...(selectedTxDetail.recipient ? [{ label: "Beneficiary", val: selectedTxDetail.recipient, highlight: true }] : []),
                    ...(selectedTxDetail.network ? [
                      { label: "Network", val: selectedTxDetail.network },
                      { label: "Target", val: selectedTxDetail.phone }
                    ] : [])
                  ].map((item, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-black/20">{item.label}</span>
                      <span className={`text-sm ${item.highlight ? 'text-black font-bold' : 'text-black/60'} ${item.mono ? 'font-mono text-xs' : ''}`}>
                        {item.val}
                      </span>
                    </div>
                  ))}
                </div>

                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleDownloadReceipt(selectedTxDetail)}
                  className="w-full py-5 bg-black text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 shadow-xl shadow-yellow/20"
                >
                  <Download className="w-4 h-4" />
                  Generate Proof of Settlement
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden Receipt for Capturing */}
      <div className="fixed -left-[1000px] top-0 overflow-hidden pointer-events-none">
        {downloadingReceipt && (
          <Receipt 
            ref={receiptRef}
            type={downloadingReceipt.type}
            amount={downloadingReceipt.amount}
            recipient={downloadingReceipt.recipient}
            phone={downloadingReceipt.phone}
            network={downloadingReceipt.network}
            itemType={downloadingReceipt.itemType}
            balance={userData?.wallet_balance}
            timestamp={new Date(downloadingReceipt.created_at || Date.now()).toLocaleString()}
            reference={downloadingReceipt.id || 'REF-PENDING'}
            userName={userData?.fullname || 'Customer'}
          />
        )}
      </div>
    </>
  )}
    </div>
  );
}
