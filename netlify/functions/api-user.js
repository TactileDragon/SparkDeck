// netlify/functions/api-user.js
//
// User management endpoint. Called on every login to ensure the user exists
// in the database (find-or-create pattern).
//
// POST /.netlify/functions/api-user
//   Headers: Authorization: Bearer <firebase-id-token>
//   Returns: { user: { id, firebase_uid, email, created_at } }

const { query } = require("./utils/db");
const { authenticateRequest, emailNotVerifiedResponse } = require("./utils/auth");

exports.handler = async function (event) {
    // Only allow POST
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Method not allowed" }),
        };
    }

    // Verify Firebase token
    const authResult = await authenticateRequest(event);
    if (authResult.error) {
        return {
            statusCode: authResult.statusCode,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(authResult.body),
        };
    }

    const { uid, email, emailVerified } = authResult.user;

    // Unverified accounts get no database row until they verify their email.
    if (!emailVerified) {
        return emailNotVerifiedResponse();
    }

    try {
        // Find or create the user
        const result = await query(
            `INSERT INTO users (firebase_uid, email)
             VALUES ($1, $2)
             ON CONFLICT (firebase_uid) DO UPDATE SET
                 email = EXCLUDED.email,
                 updated_at = NOW()
             RETURNING id, firebase_uid, email, created_at`,
            [uid, email]
        );

        const user = result.rows[0];

        // Also ensure default settings exist for this user.
        // Wrapped in try/catch because user_settings table may not exist yet
        // (see migrations/ for how schema changes are applied).
        try {
            await query(
                `INSERT INTO user_settings (user_id)
                 VALUES ($1)
                 ON CONFLICT (user_id) DO NOTHING`,
                [user.id]
            );
        } catch (settingsErr) {
            // Non-fatal — settings table may not exist yet
            console.warn("Could not create default settings:", settingsErr.message);
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user }),
        };
    } catch (error) {
        console.error("api-user error:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Server error." }),
        };
    }
};
