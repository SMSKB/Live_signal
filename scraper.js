// =============================================================================
//                            IMPORTS
// =============================================================================
const puppeteer = require('puppeteer');
const axios =require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');

// =============================================================================
//                            CONFIGURATION
// =============================================================================
const CONFIG = {
  TELEGRAM_URL: 'https://t.me/s/Quotex_SuperBot',
  WEBHOOK_URL: 'https://n8n-kh5z.onrender.com/webhook/02c29e47-81ff-4a7a-b1ca-ec7b1fbdf04a',
  SCRAPE_INTERVAL_MS: 5000,
  // (CORRECTION) Set a safer memory size. 6-7 is very small, 30 provides a better buffer against duplicates.
  PROCESSED_MESSAGES_MEMORY: 30,
  PORT: process.env.PORT || 3000,
  PUPPETEER_ARGS: [
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
// The memory array will act as a "rolling buffer" of the last ~30 messages seen.
const processedMessages = [];

// =============================================================================
//                            CORE FUNCTIONS
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

// This function now contains the full scraping logic for one cycle.
async function scrapeAndProcess() {
  console.log('--- New Scrape Cycle ---');
  let browser = null;
  
  try {
    console.log('🖥️  Launching a new browser instance...');
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: true,
      args: CONFIG.PUPPETEER_ARGS,
    });

    const page = await browser.newPage();
    
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
    
    console.log(`🔎 Found ${messagesOnPage.length} messages on the page. Checking for new ones...`);
    
    // (CORRECTION) Iterate through all found messages, not just the last two.
    // This is safer if multiple messages appear at once.
    for (const text of messagesOnPage) {
      if (text && !processedMessages.includes(text)) {
        console.log('-'.repeat(50));
        console.log('📩 NEW MESSAGE FOUND. Sending to webhook...');
        console.log(text);
        
        // Add to our persistent memory
        processedMessages.push(text);

        // Send the message
        await sendToWebhook(text);
        console.log('-'.repeat(50));
      }
    }

    // (CORRECTION) Prune the memory array AFTER processing all messages.
    // This keeps the memory clean and respects the limit.
    while (processedMessages.length > CONFIG.PROCESSED_MESSAGES_MEMORY) {
      processedMessages.shift(); // Remove the oldest message from the beginning of the array
    }
    
  } catch (error) {
    console.error(`🔥 An error occurred during the scrape cycle: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
      console.log('✅ Browser instance closed. Memory cleaned.');
    }
  }
}

// =============================================================================
//                         WEB SERVER & MAIN LOOP
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

// (CORRECTION) The stable, self-calling loop.
const mainLoop = async () => {
    await scrapeAndProcess(); // Wait for the current scrape to finish
    setTimeout(mainLoop, CONFIG.SCRAPE_INTERVAL_MS); // Then schedule the next one
};

server.listen(CONFIG.PORT, () => {
  console.log(`✅ Health check server listening on port ${CONFIG.PORT}`);
  mainLoop(); // Start the first cycle of our stable loop.
});