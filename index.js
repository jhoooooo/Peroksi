const { kv } = require('@vercel/kv');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const needle = require('needle');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const apicache = require('apicache');
const cache = apicache.middleware;
require('dotenv').config()


apicache.options({ debug: false })

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// Middleware for rate limiting
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minutes
    max: 30, // Limit: 60 call per minute / 1 every 2 seconds
});
app.use(limiter);
app.set('trust proxy', 1);

// Define your Twitch API endpoints
const TWITCH_API_BASE_URL = 'https://api.twitch.tv/helix';

let accessToken;

function isTokenExpired(accessToken) {
    if (!accessToken) {
        return true;
    } else {
        const currentTimestamp = Math.floor(Date.now() / 1000); // Get current timestamp in seconds
        const tokenExpirationTimestamp = currentTimestamp + accessToken.expires_in;
        return currentTimestamp >= tokenExpirationTimestamp;
    }
}

async function getAppToken() {
    try {
        console.log("Fetching new access token...");
        const authUrl = 'https://id.twitch.tv/oauth2/token';
        const authData = `client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

        const response = await needle('post', authUrl, authData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        if (response.statusCode === 200) {
            accessToken = response.body;
            await kv.set("twitch_access_token", accessToken);
            return accessToken;
        } else {
            throw new Error('Failed to obtain Twitch app token.');
        }
    } catch (error) {
        throw error;
    }
}

// Middleware to allow only /api/twitch/ routes
app.use((req, res, next) => {
    if (req.url.startsWith('/api/twitch/')) {
        next(); // Allow requests to /api/twitch/ and its sub-routes
    } else {
        res.status(403).json({ message: 'Access Forbidden' });
    }
});

app.get('/api/twitch/*', cache('5 minutes'), async (req, res) => {

    console.log("Fetching new data from Twitch's Api...")

    const query = req.originalUrl.replace('/api/twitch/', '');

    if (!query) {
        return res.status(400).json({ message: 'Bad Request - Missing query' });
    }

    const url = `${TWITCH_API_BASE_URL}/${query}`;
    console.log(`Query: ${url}`);

    try {
        accessToken = await kv.get("twitch_access_token");
        const isExpired = isTokenExpired(accessToken);

        if (!accessToken || isExpired) {

            console.log(`Access token does not exist or invalid...`);
            accessToken = await getAppToken();
            console.log(`New access token: [...${accessToken.access_token.slice(-6)}]`);
            const response = await needle('get', url, {
                headers: {
                    'Client-ID': TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${accessToken.access_token}`,
                },
            });

            response.body.last_updated = Date.now();
            if (response.statusCode === 200) {
                res.set({ 'Cache-Control': 'max-age=300' });
                res.json(response.body);
            } else {
                throw new Error('Failed to fetch data from Twitch API.');
            }

        } else {
            console.log(`[...${accessToken.access_token.slice(-6)}] Access token still valid...`)
            const response = await needle('get', url, {
                headers: {
                    'Client-ID': TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${accessToken.access_token}`,
                },
            });

            response.body.last_updated = Date.now();

            if (response.statusCode === 200) {
                res.set({ 'Cache-Control': 'max-age=300' });
                res.json(response.body);
            } else {
                throw new Error('Failed to fetch data from Twitch API.');
            }
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
