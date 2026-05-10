import express from "express";
import cookieParser from "cookie-parser";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import twilio from "twilio";
import axios from "axios";
import crypto from "crypto";
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  deleteDoc, 
  serverTimestamp
} from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

config();

// Initialize Firebase Client SDK to bypass IAM issues
const app = initializeApp(firebaseConfig);
const db_client = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Shim to make client SDK look like Admin SDK for easier migration
const db = {
  collection: (colPath: string) => {
    let q: any = collection(db_client, colPath);
    const collectionWrap = (queryRef: any) => ({
      orderBy: (field: string, direction: "asc" | "desc" = "asc") => {
        return collectionWrap(query(queryRef, orderBy(field, direction)));
      },
      limit: (n: number) => {
        return collectionWrap(query(queryRef, limit(n)));
      },
      get: async () => {
        const s = await getDocs(queryRef);
        return {
          docs: s.docs.map(d => ({
            id: d.id,
            data: () => d.data()
          }))
        };
      },
      add: (data: any) => addDoc(queryRef, data),
      doc: (docId: string) => {
        if (!docId) {
          throw new Error(`Invalid document ID for collection ${colPath}`);
        }
        const docRef = doc(db_client, colPath, docId);
        return {
          get: async () => {
            const s = await getDoc(docRef);
            return {
              exists: s.exists(),
              data: () => s.data()
            };
          },
          set: (data: any) => setDoc(docRef, data),
          update: (data: any) => updateDoc(docRef, data),
          delete: () => deleteDoc(docRef),
          collection: (subColPath: string) => {
            let subQ: any = collection(db_client, colPath, docId, subColPath);
            const subCollectionWrap = (subQueryRef: any) => ({
              orderBy: (field: string, direction: "asc" | "desc" = "asc") => {
                return subCollectionWrap(query(subQueryRef, orderBy(field, direction)));
              },
              limit: (n: number) => {
                return subCollectionWrap(query(subQueryRef, limit(n)));
              },
              get: async () => {
                const s = await getDocs(subQueryRef);
                return {
                  docs: s.docs.map(d => ({
                    id: d.id,
                    data: () => d.data()
                  }))
                };
              },
              add: (data: any) => addDoc(subQueryRef, data)
            });
            return subCollectionWrap(subQ);
          }
        };
      }
    });
    return collectionWrap(q);
  }
} as any;

const catchAsync = (fn: any) => (req: any, res: any, next: any) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
    console.error("Route Error:", err);
    res.status(500).json({ 
      error: "Internal Server Error", 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let twilioClient: any = null;

function getTwilioClient() {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } catch (err) {
      console.error("Failed to initialize Twilio client", err);
    }
  }
  return twilioClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cookieParser());
  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));

  // API Routes
  const getUserId = (req: any) => req.cookies.user_id || "default_user";

  const setOTP = async (phone: string, code: string) => {
    await db.collection("otps").doc(phone).set({
      code,
      createdAt: serverTimestamp()
    });
  };

  const verifyOTP = async (phone: string, code: string) => {
    const doc = await db.collection("otps").doc(phone).get();
    if (!doc.exists) return false;
    const data = doc.data();
    if (data?.code === code) {
      await db.collection("otps").doc(phone).delete();
      return true;
    }
    return false;
  };

  // API Routes
  app.get("/api/user", catchAsync(async (req: any, res: any) => {
    const userId = getUserId(req);
    console.log(`[API] Fetching user: ${userId}`);
    const userDoc = await db.collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      if (userId === "default_user") {
        // Sample user for demo landing
        return res.json({
          id: "u_sample",
          phone: "2348000000000",
          wallet_balance: 150000,
          pin: "0000",
          fullname: "Sample User",
          virtual_bank: "Waviego Bank",
          virtual_account: "8228819570",
          virtual_account_name: "WAVIEGO/SAMPLE USER",
          kyc_completed: true,
          kyc_step: "completed"
        });
      }
      return res.status(404).json({ error: "User not found" });
    }
    res.json(userDoc.data());
  }));

  app.post("/api/logout", (req: any, res: any) => {
    res.clearCookie("user_id");
    res.json({ message: "Logged out" });
  });

  // API Status Check
  app.get("/api/status", catchAsync(async (req: any, res: any) => {
    res.json({
      gemini: !!process.env.GEMINI_API_KEY,
      monnify: !!process.env.MONNIFY_SECRET_KEY && !!process.env.MONNIFY_API_KEY,
      paystack: !!process.env.PAYSTACK_SECRET_KEY && !!process.env.VITE_PAYSTACK_PUBLIC_KEY,
      twilio: !!process.env.TWILIO_AUTH_TOKEN,
      firebase: true
    });
  }));

  // Monnify Helpers
  const getMonnifyToken = async () => {
    const apiKey = process.env.VITE_MONNIFY_API_KEY;
    const secretKey = process.env.MONNIFY_SECRET_KEY;
    const baseUrl = process.env.MONNIFY_API_BASE_URL || 'https://sandbox.monnify.com';
    if (!apiKey || !secretKey) return null;

    const base64Auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
    try {
      const response = await axios.post(
        `${baseUrl}/api/v1/auth/login`,
        {},
        { headers: { Authorization: `Basic ${base64Auth}` } }
      );
      return response.data.responseBody.accessToken;
    } catch (err) {
      console.error("Monnify Auth Error:", err.response?.data || err.message);
      return null;
    }
  };

  const createMonnifyAccount = async (fullname: string, email: string, reference: string) => {
    const token = await getMonnifyToken();
    if (!token) return null;

    const baseUrl = process.env.MONNIFY_API_BASE_URL || 'https://sandbox.monnify.com';

    try {
      const response = await axios.post(
        `${baseUrl}/api/v2/bank-transfer/reserved-accounts`,
        {
          accountReference: `${reference}_${Date.now()}`,
          accountName: fullname,
          currencyCode: "NGN",
          contractCode: process.env.MONNIFY_CONTRACT_CODE,
          customerEmail: email || `${reference}@waviego.com`,
          customerName: fullname,
          getAllAvailableBanks: true
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data.responseBody.accounts[0]; // Take first bank
    } catch (err: any) {
      console.error("Monnify Account Creation Error:", JSON.stringify(err.response?.data || err.message, null, 2));
      return null;
    }
  };

  // KYC Endpoints
  app.post("/api/kyc/start", catchAsync(async (req: any, res: any) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required" });
    
    const userId = `user_${phone.replace(/\+/g, '')}`;
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      const userData = {
        id: "u" + Date.now(),
        phone,
        wallet_balance: 0,
        fullname: "",
        email: "",
        dob: "",
        address: "",
        state: "",
        bvn: "",
        virtual_account: "",
        kyc_completed: false,
        kyc_step: "otp_verification",
        updatedAt: serverTimestamp()
      };
      await userRef.set(userData);
    }
    
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    await setOTP(phone, otp);

    const client = getTwilioClient();
    const twilioEnabled = !!(client && process.env.TWILIO_PHONE_NUMBER);

    if (twilioEnabled) {
      const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
      console.log(`[Twilio] Attempting to send OTP ${otp} to ${formattedPhone}`);
      try {
        const message = await client.messages.create({
          body: `Your Waviego verification code is: ${otp}. Do not share this with anyone.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: formattedPhone
        });
        console.log(`[Twilio] SMS sent: ${message.sid}`);
      } catch (err: any) {
        console.error(`[Twilio] Error:`, err.message || err);
        console.log(`[Demo Mode Fallback] OTP for ${phone}: ${otp}`);
        // Return OTP in response for demo fallback
        return res.json({ message: "OTP sent (Fallback)", step: "otp_verification", demo_otp: otp });
      }
    } else {
      console.log(`[Demo Mode] No Twilio credentials. OTP for ${phone}: ${otp}`);
    }
    
    res.json({ message: "OTP sent", step: "otp_verification", demo_otp: otp });
  }));

  app.post("/api/kyc/verify-otp", catchAsync(async (req: any, res: any) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP required" });
    const verified = await verifyOTP(phone, otp);
    if (verified) {
      const userId = `user_${phone.replace(/\+/g, '')}`;
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();
      
      // Migrate from default_user if they started there, or create new
      const oldUserId = getUserId(req);
      const oldUserDoc = await db.collection("users").doc(oldUserId).get();
      
      let finalData = oldUserDoc.exists ? oldUserDoc.data() : { phone };
      finalData = { 
        ...finalData, 
        phone, 
        kyc_step: "personal_info",
        updatedAt: serverTimestamp() 
      };

      await userRef.set(finalData);
      
      // Set session cookie
      res.cookie("user_id", userId, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
      
      return res.json({ message: "OTP verified", step: "personal_info" });
    }
    res.status(400).json({ error: "Invalid OTP" });
  }));

  app.post("/api/kyc/personal-info", catchAsync(async (req: any, res: any) => {
    const { phone, fullname, email, dob } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });
    const userRef = db.collection("users").doc(getUserId(req));
    const userDoc = await userRef.get();
    if (userDoc.exists && userDoc.data()?.phone === phone && userDoc.data()?.kyc_step === "personal_info") {
      await userRef.update({
        fullname,
        email,
        dob,
        kyc_step: "identity_verification",
        updatedAt: serverTimestamp()
      });
      return res.json({ message: "Personal info saved", step: "identity_verification" });
    }
    res.status(400).json({ error: "Invalid state" });
  }));

  // Identity Verification Service (Real Paystack + Mock Fallback)
  async function verifyIdentityWithExternalProvider(idType: string, idNumber: string) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    
    // If we have a real secret key, we call Paystack
    if (secretKey && !idNumber.startsWith("000")) {
      try {
        console.log(`[Paystack] Verifying ${idType}: ${idNumber}`);
        
        let endpoint = "";

        if (idType === "BVN") {
          // Paystack BVN Resolution
          endpoint = `https://api.paystack.co/bank/resolve_bvn/${idNumber}`;
        } else if (idType === "NIN") {
          // Paystack NIN Resolution (Note: This endpoint accessibility varies by account type/region)
          endpoint = `https://api.paystack.co/identity/nin/${idNumber}`;
        }

        if (endpoint) {
          const response = await axios.get(endpoint, {
            headers: { 
              Authorization: `Bearer ${secretKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000 // 15s timeout for identity services
          });

          if (response.data.status) {
            const data = response.data.data;
            let verifiedName = "Verified User";

            if (data.first_name || data.last_name) {
              verifiedName = `${data.first_name || ""} ${data.last_name || ""}`.trim();
            } else if (data.account_name) {
              verifiedName = data.account_name;
            } else if (data.name) {
              verifiedName = data.name;
            }

            return { 
              success: true, 
              name: verifiedName,
              raw: data,
              provider: "Paystack"
            };
          }
        }
      } catch (err: any) {
        console.error(`[Paystack Error] ${idType}:`, err.response?.data || err.message);
        
        // Handle specific Paystack errors
        const paystackError = err.response?.data;
        if (paystackError && !paystackError.status) {
          // If the service is known but the ID is wrong
          if (err.response?.status === 400 || err.response?.status === 404) {
             throw new Error(paystackError.message || `The provided ${idType} is invalid or was not found.`);
          }
        }
        
        // In production, we don't fallback to dummy names easily if the service is alive but returning errors
        if (process.env.NODE_ENV === "production" && err.response?.status !== 401) {
          throw new Error(`Verification service error: ${err.message}`);
        }
      }
    }

    // High-fidelity Simulation for Demo (Always used if PAYSTACK_SECRET_KEY is missing or ID starts with 000)
    if (process.env.NODE_ENV === "production" && !secretKey) {
        throw new Error("Payment gateway configuration is missing. Contact support.");
    }

    console.log(`[Demo] Using mock verification fallback for ${idType}`);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (idNumber.startsWith("999")) {
          reject(new Error(`The provided ${idType} is invalid or was not found (Demo Error).`));
        } else {
          resolve({ 
            success: true, 
            name: "John Verified Doe",
            provider: "Waviego Demo Cloud" 
          });
        }
      }, 2000);
    });
  }

  app.post("/api/kyc/verify-identity", catchAsync(async (req: any, res: any) => {
    const { phone, idType, idNumber } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });
    const userRef = db.collection("users").doc(getUserId(req));
    const userDoc = await userRef.get();
    
    if (userDoc.exists && userDoc.data()?.phone === phone && userDoc.data()?.kyc_step === "identity_verification") {
      // Basic Validation
      if (!idNumber || idNumber.length !== 11) {
        return res.status(400).json({ error: `Invalid ${idType || 'ID'} length. Must be 11 digits.` });
      }

      console.log(`[KYC] Initiating ${idType} check for: ${idNumber}`);
      const result: any = await verifyIdentityWithExternalProvider(idType, idNumber);
      
      await userRef.update({
        bvn: idNumber,
        kyc_id_type: idType,
        fullname: result.name, // Auto-update to verified name
        kyc_step: "address_verification",
        updatedAt: serverTimestamp()
      });
      
      return res.json({ 
        message: `${idType} verified successfully`, 
        step: "address_verification",
        verified_name: result.name 
      });
    }
    res.status(400).json({ error: "Session expired or invalid state. Please restart KYC." });
  }));

  app.post("/api/kyc/address-verification", catchAsync(async (req: any, res: any) => {
    const { phone, address, state } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });
    const userRef = db.collection("users").doc(getUserId(req));
    const userDoc = await userRef.get();
    if (userDoc.exists && userDoc.data()?.phone === phone && userDoc.data()?.kyc_step === "address_verification") {
      await userRef.update({
        address,
        state,
        kyc_step: "pin_creation",
        updatedAt: serverTimestamp()
      });
      return res.json({ message: "Address verified", step: "pin_creation" });
    }
    res.status(400).json({ error: "Invalid state" });
  }));

  app.post("/api/kyc/set-pin", catchAsync(async (req: any, res: any) => {
    const { phone, pin } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });
    const userRef = db.collection("users").doc(getUserId(req));
    const userDoc = await userRef.get();
    const user = userDoc.data();
    if (userDoc.exists && user?.phone === phone && user?.kyc_step === "pin_creation") {
      let virtual_account = "";
      let virtual_bank = "";
      let virtual_account_name = "";
      
      // Try real Monnify creation
      const monnifyAcct = await createMonnifyAccount(user?.fullname || "Waviego User", `${user?.id}@waviego.com`, user?.id);
      if (monnifyAcct) {
        virtual_account = monnifyAcct.accountNumber;
        virtual_bank = monnifyAcct.bankName;
        virtual_account_name = monnifyAcct.accountName;
      } else {
        // Fallback for demo
        virtual_account = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
        virtual_bank = "Waviego Bank (Demo)";
        virtual_account_name = user?.fullname || "Waviego User";
      }

      const updatedData = {
        pin,
        kyc_completed: true,
        kyc_step: "completed",
        wallet_balance: 1000, // Welcome bonus
        virtual_account,
        virtual_bank,
        virtual_account_name,
        updatedAt: serverTimestamp()
      };

      await userRef.update(updatedData);
      return res.json({ message: "KYC completed. Account activated.", user: { ...user, ...updatedData } });
    }
    res.status(400).json({ error: "Invalid state" });
  }));

  app.post("/api/kyc/reset", catchAsync(async (req: any, res: any) => {
    const defaultUser = {
      id: "u1",
      phone: "2348000000000",
      wallet_balance: 50000,
      pin: "1234",
      fullname: "John Doe",
      email: "john@example.com",
      dob: "1990-01-01",
      bvn: "12345678901",
      address: "123 Waviego Way",
      state: "Lagos",
      virtual_bank: "Waviego Bank (Demo)",
      virtual_account: "0123456789",
      virtual_account_name: "John Doe",
      kyc_completed: false, // Set to false to trigger onboarding
      kyc_step: "init",
      updatedAt: serverTimestamp()
    };
    await db.collection("users").doc(getUserId(req)).set(defaultUser);
    res.json({ message: "KYC reset for demo", user: defaultUser });
  }));

  app.post("/api/transfer", catchAsync(async (req: any, res: any) => {
    const { amount, recipient, pin } = req.body;
    const userRef = db.collection("users").doc(getUserId(req));
    const userDoc = await userRef.get();
    const user = userDoc.data();

    if (!userDoc.exists || pin !== user?.pin) {
      return res.status(403).json({ error: "Invalid PIN" });
    }

    if (amount > user?.wallet_balance) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const newBalance = user?.wallet_balance - amount;
    const tx = {
      type: "transfer",
      amount,
      recipient,
      status: "success",
      created_at: new Date().toISOString(),
    };
    
    await userRef.update({ wallet_balance: newBalance, updatedAt: serverTimestamp() });
    await userRef.collection("transactions").add(tx);

    res.json({ message: "Transfer successful", transaction: tx, balance: newBalance });
  }));

  app.post("/api/vtu", catchAsync(async (req: any, res: any) => {
    const { amount, network, phone, type, pin } = req.body;
    const userRef = db.collection("users").doc(getUserId(req));
    const userDoc = await userRef.get();
    const user = userDoc.data();

    if (!userDoc.exists || pin !== user?.pin) {
      return res.status(403).json({ error: "Invalid PIN" });
    }

    if (amount > user?.wallet_balance) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const newBalance = user?.wallet_balance - amount;
    const tx = {
      type: "vtu",
      amount,
      network,
      phone,
      itemType: type, // 'airtime' or 'data'
      status: "success",
      created_at: new Date().toISOString(),
    };
    
    await userRef.update({ wallet_balance: newBalance, updatedAt: serverTimestamp() });
    await userRef.collection("transactions").add(tx);

    res.json({ message: `${type} purchase successful`, transaction: tx, balance: newBalance });
  }));

  app.post("/api/fund", catchAsync(async (req: any, res: any) => {
    const { amount } = req.body;
    const userRef = db.collection("users").doc(getUserId(req));
    const userDoc = await userRef.get();
    const user = userDoc.data();

    if (!userDoc.exists || !amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });

    const newBalance = user?.wallet_balance + Number(amount);
    const tx = {
      type: "deposit",
      amount,
      recipient: "Self",
      status: "success",
      created_at: new Date().toISOString(),
    };
    
    await userRef.update({ wallet_balance: newBalance, updatedAt: serverTimestamp() });
    await userRef.collection("transactions").add(tx);

    res.json({ message: "Account funded successfully", transaction: tx, balance: newBalance });
  }));

  app.get("/api/transactions", catchAsync(async (req: any, res: any) => {
    const txs = await db.collection("users").doc(getUserId(req)).collection("transactions").orderBy("created_at", "desc").limit(50).get();
    const transactions = txs.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    res.json(transactions);
  }));

  app.post("/api/paystack/verify", catchAsync(async (req: any, res: any) => {
    const { reference } = req.body;
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    
    if (!secretKey) return res.status(500).json({ error: "Paystack not configured" });
    if (!reference) return res.status(400).json({ error: "Reference required" });

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );

    const data = response.data.data;

    if (data.status === "success") {
      const amount = data.amount / 100; // Paystack is in Kobo
      const userRef = db.collection("users").doc(getUserId(req));
      const userDoc = await userRef.get();
      const user = userDoc.data();

      if (userDoc.exists) {
        const newBalance = (user?.wallet_balance || 0) + amount;
        const tx = {
          type: "deposit",
          amount,
          recipient: "Self",
          status: "success",
          provider: "Paystack",
          reference: reference,
          created_at: new Date().toISOString(),
        };
        
        await userRef.update({ wallet_balance: newBalance, updatedAt: serverTimestamp() });
        await userRef.collection("transactions").add(tx);

        return res.json({ message: "Account funded successfully", balance: newBalance });
      }
    }
    res.status(400).json({ error: "Payment verification failed or pending" });
  }));

  // Paystack Webhook Handler
  app.post("/api/paystack/webhook", catchAsync(async (req: any, res: any) => {
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(500).send("Paystack webhook secret not configured");
    
    const hash = crypto.createHmac('sha512', secret).update(req.rawBody || JSON.stringify(req.body)).digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;
    console.log(`[Paystack Webhook] Received event: ${event.event}`);

    if (event.event === "charge.success") {
      const data = event.data;
      const reference = data.reference;
      
      const amount = data.amount / 100;
      const userRef = db.collection("users").doc("default_user");
      const userDoc = await userRef.get();
      const user = userDoc.data();

      if (userDoc.exists) {
        const txsRef = await userRef.collection("transactions").get();
        const alreadyExists = txsRef.docs.some((d: any) => d.data().reference === reference);
        
        if (!alreadyExists) {
          const newBalance = (user?.wallet_balance || 0) + amount;
          const tx = {
            type: "deposit",
            amount,
            recipient: "Self",
            status: "success",
            provider: "Paystack (Webhook)",
            reference: reference,
            created_at: new Date(data.paid_at || Date.now()).toISOString(),
          };
          
          await userRef.update({ wallet_balance: newBalance, updatedAt: serverTimestamp() });
          await userRef.collection("transactions").add(tx);
          console.log(`[Paystack Webhook] credited ${amount} to user ${user.phone}`);
        }
      }
    }

    res.status(200).send("OK");
  }));

  // Monnify Webhook Handler
  app.post("/api/monnify/webhook", catchAsync(async (req: any, res: any) => {
    const secretKey = process.env.MONNIFY_SECRET_KEY;
    const signature = req.headers['monnify-signature'];
    
    if (!secretKey) return res.status(500).send("Monnify not configured");

    const hash = crypto.createHmac('sha512', secretKey).update(req.rawBody || JSON.stringify(req.body)).digest('hex');

    if (hash !== signature) {
      console.warn("[Monnify Webhook] Invalid signature");
      return res.status(401).send("Invalid signature");
    }

    const { eventType, eventData } = req.body;
    console.log(`[Monnify Webhook] Received event: ${eventType}`);

    if (eventType === "SUCCESSFUL_TRANSACTION") {
      const { transactionReference, amountPaid } = eventData;
      
      const userRef = db.collection("users").doc("default_user");
      const userDoc = await userRef.get();
      const user = userDoc.data();

      if (userDoc.exists) {
        const txsRef = await userRef.collection("transactions").get();
        const alreadyExists = txsRef.docs.some((d: any) => d.data().reference === transactionReference);
        
        if (!alreadyExists) {
          const amount = amountPaid;
          const newBalance = (user?.wallet_balance || 0) + amount;
          const tx = {
            type: "deposit",
            amount,
            recipient: "Self",
            status: "success",
            provider: "Monnify (Bank Transfer)",
            reference: transactionReference,
            created_at: new Date().toISOString(),
          };
          
          await userRef.update({ wallet_balance: newBalance, updatedAt: serverTimestamp() });
          await userRef.collection("transactions").add(tx);
          console.log(`[Monnify Webhook] Credited ${amount} to user via reserved account`);
        }
      }
    }

    res.status(200).send("OK");
  }));

  // Gemini AI Setup
  const ai_gen = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "AI_KEY_NOT_SET" });
  
  const getBalance: FunctionDeclaration = {
    name: "get_balance",
    description: "Get the current balance of the user's wallet",
    parameters: { type: Type.OBJECT, properties: {} },
  };

  const sendMoney: FunctionDeclaration = {
    name: "send_money",
    description: "Send money to another person or bank account.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: { type: Type.NUMBER, description: "The amount of money to send in NGN" },
        recipient: { type: Type.STRING, description: "The name, phone number or account number of the recipient" },
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
        amount: { type: Type.NUMBER, description: "The amount in NGN" },
        phone: { type: Type.STRING, description: "The target phone number" },
        network: { type: Type.STRING, description: "The mobile network (MTN, Airtel, Glo, 9mobile)" },
        type: { type: Type.STRING, enum: ["airtime", "data"], description: "Whether to buy airtime or a data bundle" },
      },
      required: ["amount", "phone", "network", "type"],
    },
  };

  const getRecentTransactions: FunctionDeclaration = {
    name: "get_recent_transactions",
    description: "Show a list of the most recent transactions.",
    parameters: { type: Type.OBJECT, properties: {} },
  };

  const SYSTEM_PROMPT = `
    You are Waviego Africa (by Antigravity), a helpful AI banking assistant.
    Goal: Help users manage money, transfers, bills, and insights.
    Mood: Professional, warm, African tone.
    Security: NEVER share PIN.
    Operations: get_balance, send_money, buy_airtime, get_recent_transactions.
  `;

  app.post("/api/chat", catchAsync(async (req: any, res: any) => {
    const { messages, imageBase64 } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key is not configured" });
    }

    let contents = messages.map((m: any) => ({
      role: m.sender === "user" ? "user" : "model",
      parts: [{ text: m.text }]
    }));

    // In case of image processing
    if (imageBase64) {
      const lastUserMsg = contents.slice().reverse().find((m: any) => m.role === "user");
      if (lastUserMsg) {
        lastUserMsg.parts.push({
          inlineData: {
            mimeType: "image/png",
            data: imageBase64
          }
        });
      }
    }

    const response = await ai_gen.models.generateContent({
      model: "gemini-1.5-flash", 
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{
          functionDeclarations: [getBalance, sendMoney, buyAirtime, getRecentTransactions]
        }]
      }
    });

    const text = response.text || "";
    const functionCalls = response.functionCalls || [];

    res.json({ text, functionCalls });
  }));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
