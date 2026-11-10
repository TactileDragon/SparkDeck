// netlify/functions/utils/auth.js
//
// Verifies Firebase ID tokens using Node.js built-in modules only.
// No external dependencies — uses crypto and https from the standard library.
//
// How it works:
//   1. Fetches Google's public X.509 certificates
//   2. Decodes the JWT header to find which key signed it
//   3. Verifies the RSA-SHA256 signature against Google's certificate
//   4. Checks all required claims (issuer, audience, expiry, subject)

const https = require("https");
const crypto = require("crypto");

const FIREBASE_PROJECT_ID = "sparkdeck-8d613";

// URL where Google publishes the public certificates for Firebase token signing
const GOOGLE_CERTS_URL =
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

// Cache certificates to avoid fetching on every request
let cachedCerts = null;
let certsExpireAt = 0;

// Fetch Google's public certificates (with caching)
function fetchGoogleCerts() {
    return new Promise((resolve, reject) => {
        if (cachedCerts && Date.now() < certsExpireAt) {
            return resolve(cachedCerts);
        }

        https
            .get(GOOGLE_CERTS_URL, (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    try {
                        cachedCerts = JSON.parse(data);
                        // Cache for 1 hour (Google rotates keys roughly every 6 hours)
                        certsExpireAt = Date.now() + 60 * 60 * 1000;
                        resolve(cachedCerts);
                    } catch (e) {
                        reject(new Error("Failed to parse Google certificates"));
                    }
                });
                res.on("error", reject);
            })
            .on("error", reject);
    });
}

// Decode a base64url string to a regular string
function base64urlDecode(str) {
    // Convert base64url to standard base64
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    while (base64.length % 4 !== 0) {
        base64 += "=";
    }
    return Buffer.from(base64, "base64").toString("utf8");
}

// Decode a JWT into its parts without verifying the signature
function decodeJwt(token) {
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
    }

    const header = JSON.parse(base64urlDecode(parts[0]));
    const payload = JSON.parse(base64urlDecode(parts[1]));

    return {
        header,
        payload,
        signedContent: parts[0] + "." + parts[1],
        signature: parts[2],
    };
}

// Verify a Firebase ID token and return the decoded payload.
// Throws an error if the token is invalid, expired, or tampered with.
async function verifyToken(idToken) {
    const { header, payload, signedContent, signature } = decodeJwt(idToken);

    // Step 1: Verify the algorithm
    if (header.alg !== "RS256") {
        throw new Error("Unexpected algorithm: " + header.alg);
    }

    // Step 2: Fetch Google's public certificates
    const certs = await fetchGoogleCerts();
    const cert = certs[header.kid];
    if (!cert) {
        throw new Error("Unknown signing key ID: " + header.kid);
    }

    // Step 3: Verify the RSA-SHA256 signature
    // Convert base64url signature to standard base64
    let sig = signature.replace(/-/g, "+").replace(/_/g, "/");
    while (sig.length % 4 !== 0) {
        sig += "=";
    }

    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(signedContent);
    if (!verifier.verify(cert, sig, "base64")) {
        throw new Error("Invalid token signature");
    }

    // Step 4: Verify claims
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp <= now) {
        throw new Error("Token expired");
    }

    if (payload.iat > now + 5) {
        // 5-second clock skew tolerance
        throw new Error("Token issued in the future");
    }

    if (
        payload.iss !==
        "https://securetoken.google.com/" + FIREBASE_PROJECT_ID
    ) {
        throw new Error("Invalid issuer");
    }

    if (payload.aud !== FIREBASE_PROJECT_ID) {
        throw new Error("Invalid audience");
    }

    if (!payload.sub || typeof payload.sub !== "string") {
        throw new Error("Token has no subject (uid)");
    }

    return {
        uid: payload.sub,
        email: payload.email || null,
        // Firebase sets this claim from the account's real verification state.
        // It is part of the signed token, so the client cannot fake it.
        emailVerified: payload.email_verified === true,
    };
}

// Extract the Bearer token from an Authorization header.
// Returns null if the header is missing or malformed.
function extractToken(authHeader) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }
    return authHeader.slice(7);
}

// Middleware-style helper: verify the request and return the user info.
// Returns { uid, email } on success, or an error response object on failure.
async function authenticateRequest(event) {
    const authHeader =
        event.headers.authorization || event.headers.Authorization;
    const idToken = extractToken(authHeader);

    if (!idToken) {
        return {
            error: true,
            statusCode: 401,
            body: { error: "Missing or invalid Authorization header." },
        };
    }

    try {
        const user = await verifyToken(idToken);
        return { error: false, user };
    } catch (err) {
        return {
            error: true,
            statusCode: 401,
            body: { error: "Invalid or expired token." },
        };
    }
}

// Standard response for accounts whose email address is not verified yet.
// Unverified accounts are device-only: no database row, no cloud reads or writes.
// The client looks for code "email_not_verified" to tell this apart from other errors.
function emailNotVerifiedResponse() {
    return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            error: "Please verify your email address to turn on cloud sync.",
            code: "email_not_verified",
        }),
    };
}

module.exports = { verifyToken, extractToken, authenticateRequest, emailNotVerifiedResponse };
