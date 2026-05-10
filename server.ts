import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import twilio from "twilio";
import axios from "axios";
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
    return {
      doc: (docId: string) => {
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
            const subColRef = collection(db_client, colPath, docId, subColPath);
            return {
              add: (data: any) => addDoc(subColRef, data),
              get: async () => {
                const s = await getDocs(subColRef);
                return {
                  docs: s.docs.map(d => ({
                    id: d.id,
                    data: () => d.data()
                  }))
                };
              }
            };
          }
        };
      },
      add: (data: any) => addDoc(collection(db_client, colPath), data),
      get: async () => {
        const s = await getDocs(collection(db_client, colPath));
        return {
          docs: s.docs.map(d => ({
            id: d.id,
            data: () => d.data()
          }))
        };
      }
    };
  }
} as any;

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

  app.use(express.json());

  // API Routes
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
  app.get("/api/user", async (req, res) => {
    try {
      console.log("Attempting to fetch user from DB:", firebaseConfig.firestoreDatabaseId);
      const userDoc = await db.collection("users").doc("default_user").get();
      if (!userDoc.exists) {
        // Initialize default user if missing
        const defaultUser = {
          id: "u1",
          phone: "2348000000000",
          wallet_balance: 50000,
          pin: "1234",
          fullname: "John Doe",
          virtual_bank: "Waviego Bank (Demo)",
          virtual_account: "0123456789",
          virtual_account_name: "John Doe",
          kyc_completed: true,
          kyc_step: "completed"
        };
        await db.collection("users").doc("default_user").set(defaultUser);
        return res.json(defaultUser);
      }
      res.json(userDoc.data());
    } catch (err) {
      console.error("Fetch User Error:", err);
      res.status(500).json({ error: "DB Error", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // API Status Check
  app.get("/api/status", (req, res) => {
    res.json({
      gemini: !!process.env.GEMINI_API_KEY,
      monnify: !!process.env.MONNIFY_SECRET_KEY && !!process.env.MONNIFY_API_KEY,
      twilio: !!process.env.TWILIO_AUTH_TOKEN,
      firebase: true
    });
  });

  // Monnify Helpers
  const getMonnifyToken = async () => {
    const apiKey = process.env.VITE_MONNIFY_API_KEY;
    const secretKey = process.env.MONNIFY_SECRET_KEY;
    if (!apiKey || !secretKey) return null;

    const base64Auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
    try {
      const response = await axios.post(
        'https://sandbox.monnify.com/api/v1/auth/login',
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

    try {
      const response = await axios.post(
        'https://sandbox.monnify.com/api/v2/bank-transfer/reserved-accounts',
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
  app.post("/api/kyc/start", async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required" });
    
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
    
    await db.collection("users").doc("default_user").set(userData);
    
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
  });

  app.post("/api/kyc/verify-otp", async (req, res) => {
    const { phone, otp } = req.body;
    const verified = await verifyOTP(phone, otp);
    if (verified) {
      const userRef = db.collection("users").doc("default_user");
      const userDoc = await userRef.get();
      if (userDoc.exists && userDoc.data()?.phone === phone) {
        await userRef.update({
          kyc_step: "personal_info",
          updatedAt: serverTimestamp()
        });
        return res.json({ message: "OTP verified", step: "personal_info" });
      }
    }
    res.status(400).json({ error: "Invalid OTP" });
  });

  app.post("/api/kyc/personal-info", async (req, res) => {
    const { phone, fullname, email, dob } = req.body;
    const userRef = db.collection("users").doc("default_user");
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
  });

  // Identity Verification Service (Mock/Pluggable)
  async function verifyIdentityWithExternalProvider(idType: string, idNumber: string) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    
    // If we have a real secret key, we could call Paystack here
    if (secretKey && !idNumber.startsWith("000")) {
      try {
        // Real implementation would look like this:
        /*
        const endpoint = idType === "BVN" 
          ? `https://api.paystack.co/verification/identity/bvn?bvn=${idNumber}`
          : `https://api.paystack.co/verification/identity/nin?nin=${idNumber}`;
        const response = await axios.get(endpoint, {
          headers: { Authorization: `Bearer ${secretKey}` }
        });
        return { success: true, name: `${response.data.data.first_name} ${response.data.data.last_name}` };
        */
        console.log(`[KYC] Real API call would happen here for ${idType}`);
      } catch (err) {
        throw new Error(`${idType} verification service is currently unavailable.`);
      }
    }

    // High-fidelity Simulation for Demo
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (idNumber.startsWith("999")) {
          reject(new Error(`The provided ${idType} is invalid or was not found.`));
        } else {
          resolve({ 
            success: true, 
            name: "John Verified Doe",
            provider: "Waviego KYC Cloud" 
          });
        }
      }, 2000); // Realistic 2s latency
    });
  }

  app.post("/api/kyc/verify-identity", async (req, res) => {
    const { phone, idType, idNumber } = req.body;
    const userRef = db.collection("users").doc("default_user");
    const userDoc = await userRef.get();
    
    if (userDoc.exists && userDoc.data()?.phone === phone && userDoc.data()?.kyc_step === "identity_verification") {
      // Basic Validation
      if (!idNumber || idNumber.length !== 11) {
        return res.status(400).json({ error: `Invalid ${idType || 'ID'} length. Must be 11 digits.` });
      }

      try {
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
      } catch (err: any) {
        return res.status(400).json({ error: err.message || "Verification failed" });
      }
    }
    res.status(400).json({ error: "Session expired or invalid state. Please restart KYC." });
  });

  app.post("/api/kyc/address-verification", async (req, res) => {
    const { phone, address, state } = req.body;
    const userRef = db.collection("users").doc("default_user");
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
  });

  app.post("/api/kyc/set-pin", async (req, res) => {
    const { phone, pin } = req.body;
    const userRef = db.collection("users").doc("default_user");
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
  });

  app.post("/api/kyc/reset", async (req, res) => {
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
      kyc_step: "phone_input",
      updatedAt: serverTimestamp()
    };
    await db.collection("users").doc("default_user").set(defaultUser);
    res.json({ message: "KYC reset for demo", user: defaultUser });
  });

  app.post("/api/transfer", async (req, res) => {
    const { amount, recipient, pin } = req.body;
    const userRef = db.collection("users").doc("default_user");
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
  });

  app.post("/api/vtu", async (req, res) => {
    const { amount, network, phone, type, pin } = req.body;
    const userRef = db.collection("users").doc("default_user");
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
  });

  app.post("/api/fund", async (req, res) => {
    const { amount } = req.body;
    const userRef = db.collection("users").doc("default_user");
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
  });

  app.get("/api/transactions", async (req, res) => {
    try {
      const txs = await db.collection("users").doc("default_user").collection("transactions").orderBy("created_at", "desc").limit(50).get();
      const transactions = txs.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      res.json(transactions);
    } catch (err) {
      console.error("Transactions Fetch Error:", err);
      res.status(500).json({ error: "Could not fetch transactions" });
    }
  });

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
