
/**
 * Utility for WebAuthn Biometric Authentication
 */

export const isBiometricSupported = () => {
  return window.PublicKeyCredential !== undefined;
};

// Convert buffer to base64url string
function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export const registerBiometric = async (userName: string) => {
  if (!isBiometricSupported()) throw new Error("Biometrics not supported on this device/browser");

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const options: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: "Waviego Africa",
    },
    user: {
      id: crypto.getRandomValues(new Uint8Array(16)),
      name: userName,
      displayName: userName,
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" }, // ES256
      { alg: -257, type: "public-key" }, // RS256
    ],
    authenticatorSelection: {
      userVerification: "required",
      residentKey: "preferred",
    },
    timeout: 60000,
    attestation: "none",
  };

  const credential = await navigator.credentials.create({
    publicKey: options,
  }) as any;

  if (!credential) throw new Error("Failed to create credential");

  return {
    credentialId: credential.id,
    publicKey: bufferToBase64Url(credential.response.getPublicKey()),
  };
};

export const authenticateBiometric = async (credentialId: string) => {
  if (!isBiometricSupported()) throw new Error("Biometrics not supported");

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const options: PublicKeyCredentialRequestOptions = {
    challenge,
    allowCredentials: [
      {
        id: Uint8Array.from(atob(credentialId.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
        type: "public-key",
      },
    ],
    userVerification: "required",
    timeout: 60000,
  };

  const assertion = await navigator.credentials.get({
    publicKey: options,
  }) as any;

  if (!assertion) throw new Error("Biometric authentication failed");

  return assertion.id;
};
