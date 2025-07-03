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
  // This is how many sent messages we will remember to prevent duplicates
  PROCESSED_MESSAGES_MEMORY: 12, 
  PORT: process.env.PORT || 3000,
};

// =============================================================================
//                            HELPER FUNCTION
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
  console.log('🚀 Starting the Final Scraper...');
  
  // --- This is our new, persistent memory ---
  // It's an array that will act as a "sliding window".
  const processedMessages = []; 

  console.log('🖥️  Launching a single, persistent browser instance...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  console.log(` scraper running. Checking every ${CONFIG.SCRAPE_INTERVAL_MS / 1000} seconds.`);

  setInterval(async () => {
    let page = null; // Start fresh every cycle
    try {
      console.log('--- New Scrape Cycle ---');
      console.log('🛠️  Creating a fresh page...');
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
      
      console.log(`Navigating to ${CONFIG.TELEGRAM_URL}...`);
      await page.goto(CONFIG.TELEGRAM_URL, { waitUntil: 'networkidle2', timeout: 45000 });

      const messagesOnPage = await page.$$eval(
        '.tgme_widget_message_text',
        (elements) => elements.map(el => el.innerText.trim())
      );

      // --- NEW LOGIC: Only look at the last two messages ---
      const latestTwoMessages = messagesOnPage.slice(-2);
      console.log(`🔎 Found ${latestTwoMessages.length} latest messages to process.`);

      for (const text of latestTwoMessages) {
        // Check if we have already sent this message
        if (text && !processedMessages.includes(text)) {
          console.log('📩 NEW MESSAGE FOUND. Sending to webhook...');
          console.log(text);
          await sendToWebhook(text);

          // --- NEW MEMORY LOGIC ---
          // Add the new message to our memory
          processedMessages.push(text);
          // If our memory is now too large, remove the oldest item
          if (processedMessages.length > CONFIG.PROCESSED_MESSAGES_MEMORY) {
            processedMessages.shift();
          }
        }
      }
      console.log('Cycle complete.');

    } catch (error) {
      console.error(`🔥 An error occurred during the scrape cycle: ${error.message}`);
    } finally {
      // --- NEW RESILIENCE LOGIC ---
      // Always close the page at the end of the cycle to free up resources.
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
});

server.listen(CONFIG.PORT, () => {
  console.log(`✅ Health check server listening on port ${CONFIG.PORT}`);
  runScraper();
});