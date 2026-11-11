// netlify/functions/api-data.js
//
// Bulk data sync endpoint. Loads or saves ALL user data in one request.
//
// Actual database schema (see migrations/ for its history):
//   - users:          id (UUID), firebase_uid, email
//   - folders:        id (INTEGER auto), name, parent_folder_id (INTEGER), user_id (UUID)
//   - decks:          id (INTEGER auto), name, category, description, visibility,
//                     folder_id (INTEGER), user_id (UUID)
//   - cards:          id (INTEGER auto), deck_id (INTEGER), front, back, media_url,
//                     sort_order (INTEGER)
//   - user_settings:  user_id (UUID), dark_mode, font_size, etc.
//   - study_sessions: user_id (UUID), deck_name, cards_studied, studied_at
//
// GET  /.netlify/functions/api-data  → Load all user data
// PUT  /.netlify/functions/api-data  → Save all user data (full replace)
//
// Headers: Authorization: Bearer <firebase-id-token>

const { query, getPool } = require("./utils/db");
const { authenticateRequest, emailNotVerifiedResponse } = require("./utils/auth");

// ─── GET: Load all user data ───────────────────────────────────────────

async function loadUserData(dbUserId) {
    // Load folders
    const foldersResult = await query(
        `SELECT id, name, parent_folder_id, created_at
         FROM folders WHERE user_id = $1 ORDER BY name`,
        [dbUserId]
    );

    // Load decks
    const decksResult = await query(
        `SELECT id, name, category, visibility, shuffle, folder_id, created_at
         FROM decks WHERE user_id = $1 ORDER BY created_at`,
        [dbUserId]
    );

    // Load all cards for this user's decks in one query
    const deckIds = decksResult.rows.map((d) => d.id);
    let cardsMap = {};

    if (deckIds.length > 0) {
        const cardsResult = await query(
            `SELECT id, front, back, media_url, sort_order, deck_id
             FROM cards WHERE deck_id = ANY($1) ORDER BY sort_order`,
            [deckIds]
        );

        // Group cards by deck_id
        for (const card of cardsResult.rows) {
            if (!cardsMap[card.deck_id]) cardsMap[card.deck_id] = [];
            cardsMap[card.deck_id].push({
                front: card.front,
                back: card.back,
                mediaUrl: card.media_url || undefined,
            });
        }
    }

    // Load settings
    const settingsResult = await query(
        `SELECT stats_enabled, dark_mode, font_size, high_contrast, reduced_motion
         FROM user_settings WHERE user_id = $1`,
        [dbUserId]
    );

    // Load study sessions
    const statsResult = await query(
        `SELECT deck_name, cards_studied, studied_at
         FROM study_sessions WHERE user_id = $1 ORDER BY studied_at`,
        [dbUserId]
    );

    // Format data to match the frontend's expected shape.
    // Integer IDs are converted to strings for the frontend.

    const folders = foldersResult.rows.map((f) => ({
        id: String(f.id),
        name: f.name,
        parentFolderId: f.parent_folder_id ? String(f.parent_folder_id) : null,
        created: f.created_at ? f.created_at.toISOString() : new Date().toISOString(),
    }));

    const decks = decksResult.rows.map((d) => ({
        name: d.name,
        category: d.category || "",
        visibility: d.visibility || "private",
        shuffle: d.shuffle !== false,
        folderId: d.folder_id ? String(d.folder_id) : null,
        cards: cardsMap[d.id] || [],
        created: d.created_at ? d.created_at.toISOString() : new Date().toISOString(),
    }));

    const settingsRow = settingsResult.rows[0];
    const settings = settingsRow
        ? {
              statsEnabled: settingsRow.stats_enabled,
              darkMode: settingsRow.dark_mode,
              fontSize: settingsRow.font_size,
              highContrast: settingsRow.high_contrast,
              reducedMotion: settingsRow.reduced_motion,
          }
        : {
              statsEnabled: true,
              darkMode: false,
              fontSize: "medium",
              highContrast: false,
              reducedMotion: false,
          };

    const studySessions = statsResult.rows.map((s) => ({
        timestamp: s.studied_at ? s.studied_at.toISOString() : new Date().toISOString(),
        deckName: s.deck_name,
        cardsStudied: s.cards_studied,
    }));

    return {
        folders,
        decks,
        settings,
        stats: { studySessions },
    };
}

// ─── PUT: Save all user data (full replace within a transaction) ────────

async function saveUserData(dbUserId, data) {
    const client = await getPool().connect();

    try {
        await client.query("BEGIN");

        // 1. Delete existing data for this user (order matters for foreign keys)
        await client.query("DELETE FROM study_sessions WHERE user_id = $1", [
            dbUserId,
        ]);

        // Delete cards that belong to this user's decks
        await client.query(
            "DELETE FROM cards WHERE deck_id IN (SELECT id FROM decks WHERE user_id = $1)",
            [dbUserId]
        );

        await client.query("DELETE FROM decks WHERE user_id = $1", [dbUserId]);
        await client.query("DELETE FROM folders WHERE user_id = $1", [
            dbUserId,
        ]);

        // 2. Insert folders — DB generates integer IDs, we map client IDs to new IDs
        const folderIdMap = new Map();

        if (data.folders && data.folders.length > 0) {
            // Sort so parent folders are inserted before children
            const sorted = sortFoldersForInsert(data.folders);

            for (const folder of sorted) {
                // Map parent ID: use the new integer ID if parent was already inserted
                const parentId = folder.parentFolderId
                    ? folderIdMap.get(folder.parentFolderId) || null
                    : null;

                const result = await client.query(
                    `INSERT INTO folders (name, parent_folder_id, user_id, created_at)
                     VALUES ($1, $2, $3, $4)
                     RETURNING id`,
                    [
                        folder.name,
                        parentId,
                        dbUserId,
                        folder.created || new Date().toISOString(),
                    ]
                );

                // Map the client's folder ID (string) to the new DB integer ID
                folderIdMap.set(String(folder.id), result.rows[0].id);
            }
        }

        // 3. Insert decks and their cards
        if (data.decks && data.decks.length > 0) {
            for (const deck of data.decks) {
                // Map folder ID from client string to DB integer
                const folderId = deck.folderId
                    ? folderIdMap.get(String(deck.folderId)) || null
                    : null;

                const deckResult = await client.query(
                    `INSERT INTO decks (name, category, visibility, shuffle, folder_id, user_id, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     RETURNING id`,
                    [
                        deck.name,
                        deck.category || null,
                        deck.visibility || "private",
                        deck.shuffle !== false,
                        folderId,
                        dbUserId,
                        deck.created || new Date().toISOString(),
                    ]
                );

                const deckId = deckResult.rows[0].id;

                // Insert cards for this deck
                if (deck.cards && deck.cards.length > 0) {
                    for (let i = 0; i < deck.cards.length; i++) {
                        const card = deck.cards[i];
                        await client.query(
                            `INSERT INTO cards (deck_id, front, back, media_url, sort_order, created_at, updated_at)
                             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                            [
                                deckId,
                                card.front,
                                card.back,
                                card.mediaUrl || null,
                                i,

                            ]
                        );
                    }
                }
            }
        }

        // 4. Upsert settings
        if (data.settings) {
            await client.query(
                `INSERT INTO user_settings (user_id, stats_enabled, dark_mode, font_size, high_contrast, reduced_motion, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())
                 ON CONFLICT (user_id) DO UPDATE SET
                     stats_enabled = EXCLUDED.stats_enabled,
                     dark_mode = EXCLUDED.dark_mode,
                     font_size = EXCLUDED.font_size,
                     high_contrast = EXCLUDED.high_contrast,
                     reduced_motion = EXCLUDED.reduced_motion,
                     updated_at = NOW()`,
                [
                    dbUserId,
                    data.settings.statsEnabled !== false,
                    data.settings.darkMode === true,
                    data.settings.fontSize || "medium",
                    data.settings.highContrast === true,
                    data.settings.reducedMotion === true,
                ]
            );
        }

        // 5. Insert study sessions
        if (
            data.stats &&
            data.stats.studySessions &&
            data.stats.studySessions.length > 0
        ) {
            for (const session of data.stats.studySessions) {
                await client.query(
                    `INSERT INTO study_sessions (user_id, deck_name, cards_studied, studied_at)
                     VALUES ($1, $2, $3, $4)`,
                    [
                        dbUserId,
                        session.deckName || "Unknown",
                        session.cardsStudied || 0,
                        session.timestamp || new Date().toISOString(),
                    ]
                );
            }
        }

        await client.query("COMMIT");
        return { success: true };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// Sort folders so parents come before children (topological sort).
function sortFoldersForInsert(folders) {
    const sorted = [];
    const remaining = [...folders];
    const insertedIds = new Set();

    let maxIterations = folders.length * folders.length;
    let iterations = 0;

    while (remaining.length > 0 && iterations < maxIterations) {
        iterations++;
        for (let i = remaining.length - 1; i >= 0; i--) {
            const folder = remaining[i];
            if (
                !folder.parentFolderId ||
                insertedIds.has(String(folder.parentFolderId))
            ) {
                sorted.push(folder);
                insertedIds.add(String(folder.id));
                remaining.splice(i, 1);
            }
        }
    }

    // If any remain (orphaned references), insert with no parent
    for (const folder of remaining) {
        folder.parentFolderId = null;
        sorted.push(folder);
    }

    return sorted;
}

// ─── Handler ────────────────────────────────────────────────────────────

exports.handler = async function (event) {
    // Verify Firebase token
    const authResult = await authenticateRequest(event);
    if (authResult.error) {
        return {
            statusCode: authResult.statusCode,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(authResult.body),
        };
    }

    const { uid, emailVerified } = authResult.user;

    // Unverified accounts are device-only: no cloud reads or writes.
    // Checked before any database query.
    if (!emailVerified) {
        return emailNotVerifiedResponse();
    }

    // Look up the database user ID from the Firebase UID
    const userResult = await query(
        "SELECT id FROM users WHERE firebase_uid = $1",
        [uid]
    );

    if (userResult.rows.length === 0) {
        return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                error: "User not found. Call api-user first.",
            }),
        };
    }

    const dbUserId = userResult.rows[0].id;

    try {
        if (event.httpMethod === "GET") {
            const data = await loadUserData(dbUserId);
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            };
        }

        if (event.httpMethod === "PUT") {
            // Reject oversized payloads (5MB limit)
            if (event.body && event.body.length > 5 * 1024 * 1024) {
                return {
                    statusCode: 413,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ error: "Payload too large." }),
                };
            }

            const data = JSON.parse(event.body);

            // Validate basic shape
            if (typeof data !== "object" || data === null || Array.isArray(data)) {
                return {
                    statusCode: 400,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ error: "Invalid data format." }),
                };
            }

            // Limit deck/folder/session counts
            if (data.decks && data.decks.length > 500) {
                return {
                    statusCode: 400,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ error: "Too many decks (max 500)." }),
                };
            }
            if (data.folders && data.folders.length > 200) {
                return {
                    statusCode: 400,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ error: "Too many folders (max 200)." }),
                };
            }

            await saveUserData(dbUserId, data);
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ success: true }),
            };
        }

        return {
            statusCode: 405,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Method not allowed" }),
        };
    } catch (error) {
        console.error("api-data error:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Server error." }),
        };
    }
};
