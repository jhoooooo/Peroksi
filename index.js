const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const needle = require('needle');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Apicache = require('apicache');
const cache = Apicache.middleware;
require('dotenv').config()

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// Middleware for rate limiting
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minutes
    max: 60, // Limit
  });
  app.use(limiter);
  
  // Define your Twitch API endpoints
  const TWITCH_API_BASE_URL = 'https://api.twitch.tv/helix';
  
  let appToken = null;
  
  async function getAppToken() {
    if (!appToken) {
      try {
        const authUrl = 'https://id.twitch.tv/oauth2/token';
        const authData = `client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
  
        const response = await needle('post', authUrl, authData, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
  
        if (response.statusCode === 200) {
          appToken = response.body.access_token;
          return appToken;
        } else {
          throw new Error('Failed to obtain Twitch app token.');
        }
      } catch (error) {
        throw error;
      }
    } else {
      return appToken;
    }
  }
  
  app.get('/api/twitch/*', cache('5 minutes'), async (req, res) => {
    const query = req.originalUrl.replace('/api/twitch/', '');
    console.log(`Query: ${query}`);
    const url = `${TWITCH_API_BASE_URL}/${query}`;
    console.log(`Requesting: ${url}`);
    
    try {
      const accessToken = await getAppToken();
  
      const response = await needle('get', url, {
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${accessToken}`,
        },
      });
  
      if (response.statusCode === 200) {
        res.json(response.body);
      } else {
        throw new Error('Failed to fetch data from Twitch API.');
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Root route for handling http://localhost:3000/api/
  app.get('/api/', (req, res) => {
    res.status(200).json({ message: 'Welcome to the Twitch API Proxy' });
  });
  
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
