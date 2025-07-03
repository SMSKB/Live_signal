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
  WEBHOOK_URL: 'https://n8n-kh5z.onrender.com/webhook/02c29e47-81ff-4a7a-b1ca-ec7b1fbdf04a', // <-- PASTE YOUR URL HERE
  SCRAPE_INTERVAL_MS: 5000,
  PROCESSED_MESSAGES_MEMORY: 12,
  PORT: process.env.PORT || 3000,
  PUPPETEER_ARGS: [ // Arguments for low-resource environments
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu'
  ],
};

// =============================================================================
//                            GLOBAL STATE
// =============================================================================
// This memory array is outside the scraping function, so it persists between runs.
const processedMessages = [];

// =============================================================================
//                            CORE SCRAPING FUNCTION
// =============================================================================
async function scrapeAndProcess() {
  console.log('--- New Scrape Cycle ---');
  let browser = null; // Start fresh
  
  try {
    // 1. Launch a BRAND NEW browser instance for this cycle.
    console.log('🖥️  Launching a new browser instance...');
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: true,
      args: CONFIG.PUPPETEER_ARGS,
    });

    const page = await browser.newPage();
    console.log('🛠️  Page created.');

    // Block unnecessary resources to save memory and bandwidth
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log(`Navigating to ${CONFIG.TELEGRAM_URL}...`);
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
        
        // Add to our persistent memory
        processedMessages.push(text);
        // If memory is full, remove the oldest item
        if (processedMessages.length > CONFIG.PROCESSED_MESSAGES_MEMORY) {
          processedMessages.shift();
        }
      }
    }
    
  } catch (error) {
    console.error(`🔥 An error occurred during the scrape cycle: ${error.message}`);
  } finally {
    // 2. ALWAYS close the entire browser instance at the end of the cycle.
    // This is the most important step for cleaning memory.
    if (browser) {
      await browser.close();
      console.log('✅ Browser instance closed. Memory cleaned.');
    }
  }
}

// =============================================================================
//                         WEB SERVER & MAIN LOOP
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
  // Start the very first scrape immediately
  scrapeAndProcess();
  // Then, set the interval to run it repeatedly
  setInterval(scrapeAndProcess, CONFIG.SCRAPE_INTERVAL_MS);
});