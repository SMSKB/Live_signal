// =============================================================================
//                            IMPORTS
// =============================================================================
const puppeteer = require('puppeteer');
const axios = require('axios');

// =============================================================================
//                            CONFIGURATION
// =============================================================================
const CONFIG = {
  TELEGRAM_URL: 'https://t.me/s/Quotex_SuperBot',
  WEBHOOK_URL: 'https://n8n-kh5z.onrender.com/webhook/02c29e47-81ff-4a7a-b1ca-ec7b1fbdf04a', // <-- PASTE YOUR URL HERE
  SCRAPE_INTERVAL_MS: 5000,
  RELOAD_LIMIT: 10, // Proactively create a new page after this many reloads
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

/**
 * Creates a new, fully initialized browser page.
 * This function is reusable for both initial setup and error recovery.
 * @param {puppeteer.Browser} browser - The main browser instance.
 * @returns {Promise<puppeteer.Page|null>} A new page object, or null if creation fails.
 */
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
    return null; // Return null to indicate failure
  }
}

// =============================================================================
//                            MAIN SCRAPER LOGIC
// =============================================================================

(async () => {
  console.log('🚀 Starting the Resilient Puppeteer scraper...');
  
  const processedMessages = new Set();

  console.log('🖥️  Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // --- RESILIENCE LOGIC SETUP ---
  // We use `let` because these variables will be reassigned.
  let page = await createNewPage(browser);
  let reloadCount = 0;

  if (!page) {
    console.log('Could not create initial page. Shutting down.');
    await browser.close();
    return;
  }

  console.log(` scraper running. Refreshing every ${CONFIG.SCRAPE_INTERVAL_MS / 1000} seconds.`);

  // --- MAIN SCRAPING LOOP ---
  setInterval(async () => {
    try {
      // 1. RELOAD THE CURRENT PAGE
      console.log(`🔄 [Count: ${reloadCount + 1}] Reloading page...`);
      await page.reload({ waitUntil: 'networkidle2' });
      reloadCount++; // Increment the counter *after* a successful reload

      // 2. SCRAPE DATA (Your existing logic is perfect)
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

      // 3. PROACTIVE RESET: Check if we've hit the reload limit
      if (reloadCount >= CONFIG.RELOAD_LIMIT) {
        console.warn(`♻️ Reached ${CONFIG.RELOAD_LIMIT} reloads. Proactively creating a fresh page to prevent errors.`);
        await page.close(); // Close the old page
        page = await createNewPage(browser); // Create a new one
        reloadCount = 0; // Reset the counter
        if (!page) throw new Error("Failed to recover by creating a new page after hitting reload limit.");
      }

    } catch (error) {
      console.error('🔥 An error occurred during the scrape cycle:', error.message);
      
      // 4. REACTIVE RESET: Check if it's the specific "detached Frame" error
      if (error.message.includes('detached Frame')) {
        console.warn('🚑 Detached frame error detected. Attempting recovery by creating a new page...');
        try {
            // We don't need to close the page, it's already dead.
            page = await createNewPage(browser); // Create a new one
            reloadCount = 0; // Reset the counter
            if (!page) throw new Error("Failed to recover by creating a new page after detached frame.");
        } catch (recoveryError) {
            console.error('🔥🔥 CRITICAL FAILURE: Could not recover from detached frame error. The script may be unstable.', recoveryError.message);
        }
      }
    }
  }, CONFIG.SCRAPE_INTERVAL_MS);

})();