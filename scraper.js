// =============================================================================
//                            IMPORTS
// =================================_JS
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
  RELOAD_LIMIT: 10,
  PORT: process.env.PORT || 3000,
};

// =============================================================================
//                            HELPER FUNCTIONS
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

async function createNewPage(browser) {
  console.log('🛠️  Creating a new page...');
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
    await page.goto(CONFIG.TELEGRAM_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('✅ New page created and navigated successfully.');
    return page;
  } catch (e) {
    console.error('🔥 CRITICAL: Failed to create and initialize a new page.', e.message);
    return null;
  }
}

// =============================================================================
//                         MAIN SCRAPER LOGIC
// =============================================================================
async function runScraper() {
  console.log('🚀 Starting the Resilient Puppeteer scraper...');
  const processedMessages = new Set();
  console.log('🖥️  Launching browser...');
  
  // --- THIS IS THE FINAL FIX ---
  // We explicitly tell Puppeteer where to find the browser inside the Docker container.
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let page = await createNewPage(browser);
  let reloadCount = 0;

  if (!page) {
    console.log('Could not create initial page. Shutting down scraper logic.');
    await browser.close();
    return;
  }
  
  console.log(` scraper running. Refreshing every ${CONFIG.SCRAPE_INTERVAL_MS / 1000} seconds.`);

  setInterval(async () => {
    try {
      console.log(`🔄 [Count: ${reloadCount + 1}] Reloading page...`);
      await page.reload({ waitUntil: 'networkidle2' });
      reloadCount++;

      const messagesOnPage = await page.$$eval(
        '.tgme_widget_message_text',
        (elements) => elements.map(el => el.innerText.trim())
      );

      for (const text of messagesOnPage) {
        if (text && !processedMessages.has(text)) {
          console.log('-'.repeat(50));
          console.log('📩 NEW MESSAGE DETECTED:');
          console.log(text);
          processedMessages.add(text);
          await sendToWebhook(text);
          console.log('-'.repeat(50));
        }
      }

      if (reloadCount >= CONFIG.RELOAD_LIMIT) {
        console.warn(`♻️ Reached ${CONFIG.RELOAD_LIMIT} reloads. Proactively creating a fresh page.`);
        await page.close();
        page = await createNewPage(browser);
        reloadCount = 0;
        if (!page) throw new Error("Failed to recover by creating a new page after hitting reload limit.");
      }

    } catch (error) {
      console.error('🔥 An error occurred during the scrape cycle:', error.message);
      if (error.message.includes('detached Frame') || error.message.includes('Execution context was destroyed')) {
        console.warn('🚑 Navigation error detected. Attempting recovery...');
        try {
            page = await createNewPage(browser);
            reloadCount = 0;
            if (!page) throw new Error("Failed to recover from navigation error.");
        } catch (recoveryError) {
            console.error('🔥🔥 CRITICAL FAILURE: Could not recover from navigation error.', recoveryError.message);
        }
      }
    }
  }, CONFIG.SCRAPE_INTERVAL_MS);
}

// =============================================================================
//                         WEB SERVER FOR KEEP-ALIVE
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