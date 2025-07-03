// =============================================================================
//                            IMPORTS
// =============================================================================
const puppeteer = require('puppeteer');
const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');

// =============================================================================
//                            CONFIGURATION
// =============================================================================
const CONFIG = {
  TELEGRAM_URL: 'https://t.me/s/Quotex_SuperBot',
  WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
  SCRAPE_INTERVAL_MS: 5000,
  PROCESSED_MESSAGES_MEMORY: 12,
  PORT: process.env.PORT || 3000,
  // Recommended launch arguments for server environments
  PUPPETEER_ARGS: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-infobars',
    '--window-position=0,0',
    '--ignore-certifcate-errors',
    '--ignore-certifcate-errors-spki-list',
    '--disable-speech-api',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-domain-reliability',
    '--disable-extensions',
    '--disable-features=AudioOutput,SpeechSynthesis,Translate',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-notifications',
    '--disable-offer-store-unmasked-wallet-cards',
    '--disable-popup-blocking',
    '--disable-print-preview',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-setuid-sandbox',
    '--disable-sync',
    '--hide-scrollbars',
    '--ignore-gpu-blacklist',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-first-run',
    '--no-pings',
    '--no-zygote',
    '--password-store=basic',
    '--use-gl=swiftshader',
    '--use-mock-keychain',
    '--single-process'
  ],
};

// =============================================================================
//                            HELPER FUNCTIONS (Unchanged)
// =============================================================================
async function sendToWebhook(messageText) {
  const payload = { message: messageText };
  try {
    await axios.post(CONFIG.WEBHOOK_URL, payload);
    console.log('✅ Successfully sent message to n8n webhook.');
  } catch (error) {
    console.error(`❌ Failed to send to n8n. Status: ${error.response?.status}`);
    console.error(`   Error details: ${error.message}`);
  }
}

// =============================================================================
//                         MAIN SCRAPER LOGIC
// =============================================================================
async function runScraper() {
  console.log('🚀 Starting the OPTIMIZED Scraper...');
  const processedMessages = [];
  
  console.log('🖥️  Launching a single, persistent browser instance with optimization flags...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: CONFIG.PUPPETEER_ARGS,
  });

  console.log(` scraper running. Checking every ${CONFIG.SCRAPE_INTERVAL_MS / 1000} seconds.`);

  setInterval(async () => {
    let page = null;
    try {
      console.log('--- New Scrape Cycle ---');
      console.log('🛠️  Creating a fresh page...');
      page = await browser.newPage();
      
      // --- OPTIMIZATION 1: BLOCK UNNECESSARY RESOURCES ---
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      console.log(`Navigating to ${CONFIG.TELEGRAM_URL}...`);
      
      // --- OPTIMIZATION 2: FASTER PAGE LOAD CONDITION ---
      await page.goto(CONFIG.TELEGRAM_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

      const messagesOnPage = await page.$$eval(
        '.tgme_widget_message_text',
        (elements) => elements.map(el => el.innerText.trim())
      );
      const latestTwoMessages = messagesOnPage.slice(-2);
      console.log(`🔎 Found ${latestTwoMessages.length} latest messages to process.`);

      for (const text of latestTwoMessages) {
        if (text && !processedMessages.includes(text)) {
          console.log('📩 NEW MESSAGE FOUND. Sending to webhook...');
          console.log(text);
          await sendToWebhook(text);
          processedMessages.push(text);
          if (processedMessages.length > CONFIG.PROCESSED_MESSAGES_MEMORY) {
            processedMessages.shift();
          }
        }
      }
      console.log('Cycle complete.');

    } catch (error) {
      console.error(`🔥 An error occurred during the scrape cycle: ${error.message}`);
    } finally {
      if (page && !page.isClosed()) {
        await page.close();
        console.log('✅ Page closed successfully.');
      }
    }
  }, CONFIG.SCRAPE_INTERVAL_MS);
}

// =============================================================================
//                         WEB SERVER (Unchanged)
// =============================================================================
const server = http.createServer((req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  if (userAgent.includes('Cron-Job.org')) {
    console.log('🤖 Cron job ping received.');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('PING OK');
  } else {
    console.log('👤 Browser visit detected. Serving status page.');
    const indexPath = path.join(__dirname, 'index.html');
    fs.readFile(indexPath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error: Could not find index.html');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      }
    });
  }
});

server.listen(CONFIG.PORT, () => {
  console.log(`✅ Health check server listening on port ${CONFIG.PORT}`);
  runScraper();
});