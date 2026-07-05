#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

const SPREADSHEET_ID = '1SyMoGrqy7_JdQ2VbUwsv6ALvMmX9765mKZRJK8pYkew';
const OUTPUT_FILE = path.join(__dirname, 'seed-templates.json');

// Helper to make HTTPS requests
function makeRequest(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.error ? parsed.error.message : data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// Load credentials from Application Default Credentials (ADC) or Clasp
function getCredentials() {
  const home = process.env.HOME || process.env.USERPROFILE;
  
  // Try Google ADC first (highly likely to have Sheets API enabled)
  const adcPath = path.join(home, '.config', 'gcloud', 'application_default_credentials.json');
  if (fs.existsSync(adcPath)) {
    console.log('Using Application Default Credentials (ADC)...');
    return { data: JSON.parse(fs.readFileSync(adcPath, 'utf8')), type: 'adc' };
  }

  // Fallback to clasp credentials
  const claspRcPath = path.join(home, '.clasprc.json');
  if (fs.existsSync(claspRcPath)) {
    console.log('Using clasp credentials...');
    const claspData = JSON.parse(fs.readFileSync(claspRcPath, 'utf8'));
    return { data: claspData.tokens.default, type: 'clasp' };
  }

  throw new Error('No valid Google credentials found. Please run "gcloud auth application-default login" or "./bzq login".');
}

// Refresh OAuth token
async function getAccessToken() {
  const { data, type } = getCredentials();
  
  const postParams = {
    client_id: data.client_id,
    client_secret: data.client_secret,
    refresh_token: data.refresh_token,
    grant_type: 'refresh_token',
  };

  const postData = new URLSearchParams(postParams).toString();

  try {
    const res = await makeRequest('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      }
    }, postData);
    
    console.log('Access token generated successfully.');
    return res.access_token;
  } catch (err) {
    throw new Error(`Failed to refresh token: ${err.message}`);
  }
}

async function main() {
  try {
    const accessToken = await getAccessToken();
    const headers = { Authorization: `Bearer ${accessToken}` };

    console.log(`Fetching metadata for legacy spreadsheet ${SPREADSHEET_ID}...`);
    const metadata = await makeRequest(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`, { headers });
    
    const sheets = metadata.sheets.map(s => s.properties.title);
    console.log(`Found sheets: ${sheets.join(', ')}`);

    const seedData = {};

    for (const sheetName of sheets) {
      console.log(`Fetching values for sheet: ${sheetName}...`);
      const range = encodeURIComponent(`${sheetName}!A1:Z1000`);
      try {
        const valRes = await makeRequest(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueRenderOption=FORMULA`, { headers });
        seedData[sheetName] = valRes.values || [];
      } catch (err) {
        console.warn(`Could not fetch data for sheet ${sheetName}: ${err.message}`);
      }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(seedData, null, 2));
    console.log(`\n\x1b[32m✔ Seed templates successfully downloaded to: ${OUTPUT_FILE}\x1b[0m`);
  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

main();
