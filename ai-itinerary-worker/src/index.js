import { nanoid } from "nanoid";
import { z } from "zod";


/** * Schema for validating the itinerary structure.
 * This uses Zod to ensure the generated itinerary matches the expected format.
 */
const itinerarySchema = z.object({
	itinerary: z.array(
		z.object({
			day: z.number().int(),
			theme: z.string(),
			activities: z.array(
				z.object({
					time: z.string(),
					description: z.string(),
					location: z.string(),
				})
			),
		})
	),
});


/**
 * Converts a normal JS object into Firestore's REST API format.
 */
function formatFirestoreFields(obj) {
	const formatted = {};
	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === "string") {
			formatted[key] = { stringValue: value };
		} else if (typeof value === "number") {
			formatted[key] = { integerValue: value };
		} else if (typeof value === "boolean") {
			formatted[key] = { booleanValue: value };
		} else if (value === null) {
			formatted[key] = { nullValue: null };
		} else if (Array.isArray(value)) {
			formatted[key] = {
				arrayValue: {
					values: value.map((v) => {
						if (typeof v === "object" && v !== null) {
							return { mapValue: { fields: formatFirestoreFields(v) } };
						} else if (typeof v === "string") {
							return { stringValue: v };
						} else if (typeof v === "number") {
							return { integerValue: v };
						} else if (typeof v === "boolean") {
							return { booleanValue: v };
						} else if (v === null) {
							return { nullValue: null };
						} else {
							return { stringValue: String(v) };
						}
					}),
				},
			};
		} else if (typeof value === "object") {
			formatted[key] = { mapValue: { fields: formatFirestoreFields(value) } };
		}
	}
	return formatted;
}


/**
 * Generates a JWT and exchanges it for an OAuth2 token.
 */
async function getAccessToken(env) {
	const now = Math.floor(Date.now() / 1000);
	const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const claimSet = btoa(
		JSON.stringify({
			iss: env.FIRESTORE_CLIENT_EMAIL,
			scope: "https://www.googleapis.com/auth/datastore",
			aud: "https://oauth2.googleapis.com/token",
			exp: now + 3600,
			iat: now,
		})
	);
	const unsignedJwt = `${header}.${claimSet}`;

	// Import private key
	const pemKey = env.FIRESTORE_PRIVATE_KEY.replace(/\\n/g, "\n");
	const keyData = convertPEMToBinary(pemKey);
	const cryptoKey = await crypto.subtle.importKey(
		"pkcs8",
		keyData,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"]
	);

	// Sign JWT
	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		cryptoKey,
		new TextEncoder().encode(unsignedJwt)
	);
	const signedJwt = `${unsignedJwt}.${arrayBufferToBase64Url(signature)}`;

	// Exchange JWT for access token
	const res = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`,
	});
	const { access_token } = await res.json();
	return access_token;
}

// Convert PEM private key to ArrayBuffer
function convertPEMToBinary(pem) {
	const b64 = pem
		.replace(/-----BEGIN PRIVATE KEY-----/, "")
		.replace(/-----END PRIVATE KEY-----/, "")
		.replace(/\s+/g, "");
	const raw = atob(b64);
	const buffer = new ArrayBuffer(raw.length);
	const view = new Uint8Array(buffer);
	for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
	return buffer;
}

function arrayBufferToBase64Url(buffer) {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Writes or updates a document in Firestore.
 */
async function writeToFirestore(env, jobId, data) {
	try {
		const token = await getAccessToken(env);
		console.log("Access token acquired");
		const url = `https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents/itineraries/${jobId}`;
		const res = await fetch(url, {
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ fields: formatFirestoreFields(data) }),
		});

		const text = await res.text();
		console.log("Firestore response:", res.status, text);

		if (!res.ok) throw new Error(`Firestore error: ${res.status} - ${text}`);
	} catch (err) {
		console.error("writeToFirestore failed:", err.message);
		throw err;
	}
}


/**
 * Retries a function with exponential backoff.
 * @param {Function} fn - The function to retry.
 * @param {number} retries - Number of retries before giving up.
 * @param {number} delay - Initial delay in milliseconds.
 * @returns {Promise} - Resolves with the function's result or rejects with the error.
 */
async function retryWithBackoff(fn, retries = 3, delay = 500) {
	try {
		return await fn();
	} catch (err) {
		if (retries === 0) throw err;
		await new Promise((resolve) => setTimeout(resolve, delay));
		return retryWithBackoff(fn, retries - 1, delay * 2);
	}
}


/**
 * Generates itinerary via Gemini and updates Firestore.
 */
async function generateItineraryAsync(jobId, destination, durationDays, env) {
	try {
		const prompt = `Generate a structured travel itinerary for a trip to ${destination} lasting ${durationDays} days. The response must be a JSON object with an \`itinerary\` field containing an array of daily plans. Each day includes: - day (number): The day number - theme (string): A descriptive theme for the day - activities (array): List of activities for the day. Each activity must specify: - time (string): The time of the activity - description (string): What the activity involves - location (string): Where the activity takes place.`;

		const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${env.GEMINI_API_KEY}`;
		const payload = {
			contents: [{ parts: [{ text: prompt }] }],
			generationConfig: {
				responseMimeType: "application/json",
				responseSchema: {
					type: "OBJECT",
					properties: {
						itinerary: {
							type: "ARRAY",
							items: {
								type: "OBJECT",
								properties: {
									day: { type: "INTEGER" },
									theme: { type: "STRING" },
									activities: {
										type: "ARRAY",
										items: {
											type: "OBJECT",
											properties: {
												time: { type: "STRING" },
												description: { type: "STRING" },
												location: { type: "STRING" },
											},
										},
									},
								},
								required: ["day", "theme", "activities"],
							},
						},
					},
					required: ["itinerary"],
				},
			},
		};

		const response = await retryWithBackoff(() =>
			fetch(apiUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			})
		);
		if (!response.ok) throw new Error(`Gemini failed: ${response.status}`);


		const result = await response.json();

		// Extract the text content
		let rawText = result.candidates[0].content.parts[0].text.trim();

		// Remove markdown code fences if present
		if (rawText.startsWith("```")) {
			const lines = rawText.split("\n");
			if (lines.length >= 3) {
				lines.shift(); // Remove first line with ```
				lines.pop();   // Remove last line with ```
				rawText = lines.join("\n").trim();
			}
		}

		// Parse JSON after cleaning
		const generated = JSON.parse(rawText);
		const validation = itinerarySchema.safeParse(generated);
		if (!validation.success) {
			// Validation failed
			throw new Error(`Validation error: ${validation.error.message}`);
		}

		await writeToFirestore(env, jobId, {
			status: "completed",
			itinerary: validation.data.itinerary,
			completedAt: new Date().toISOString(),
		});
	} catch (err) {
		await writeToFirestore(env, jobId, {
			status: "failed",
			error: err.message,
			completedAt: new Date().toISOString(),
		});
	}
}

/**
 * Main Worker fetch handler.
 */
export default {
	async fetch(req, env, ctx) {
		const url = new URL(req.url);

		// Serve the HTML (and other static assets) from root
		if (req.method === "GET" && url.pathname === "/") {
			return env.ASSETS.fetch(req);
		}

		// Handle itinerary generation on /api
		if (req.method === "POST" && url.pathname === "/api") {
			let body;
			try {
				body = await req.json();
			} catch {
				return new Response(JSON.stringify({ error: "Invalid JSON" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}

			const { destination, durationDays } = body;
			if (!destination || typeof destination !== "string" || !durationDays || durationDays <= 0) {
				return new Response(
					JSON.stringify({ error: 'Requires "destination" (string) and "durationDays" (positive number)' }),
					{ status: 400, headers: { "Content-Type": "application/json" } }
				);
			}

			const jobId = nanoid();
			await writeToFirestore(env, jobId, {
				status: "processing",
				destination,
				durationDays,
				createdAt: new Date().toISOString(),
				completedAt: null,
				itinerary: null,
				error: null,
			});

			ctx.waitUntil(generateItineraryAsync(jobId, destination, durationDays, env));

			return new Response(JSON.stringify({ jobId }), {
				status: 202,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(JSON.stringify({ error: "Not Found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	},
};
