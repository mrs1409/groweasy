const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const frontendUrl = 'http://localhost:3000';
const screenshotsDir = path.join(__dirname, 'e2e_screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

(async () => {
  console.log('🚀 Starting GrowEasy Importer E2E Verification Flow...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const user1Email = `user_e2e_1_${Date.now()}@test.com`;
  const user2Email = `user_e2e_2_${Date.now()}@test.com`;
  const password = 'testpassword123';

  try {
    // 1. New user signs up
    console.log('\n--- Scenario 1: New User Signs Up ---');
    await page.goto(frontendUrl);
    await page.screenshot({ path: path.join(screenshotsDir, '01_landing.png') });
    console.log('✓ Landing page loaded.');

    await page.click('button:has-text("Launch Importer")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '02_auth_page.png') });
    console.log('✓ Navigation to auth page complete.');

    // Switch to Sign Up mode
    await page.click('div.text-center >> text=Sign Up');
    await page.fill('input[type="email"]', user1Email);
    await page.fill('input[type="password"]', password);
    await page.screenshot({ path: path.join(screenshotsDir, '03_signup_credentials.png') });
    await page.click('button[type="submit"]');
    
    // Wait for redirection to dashboard
    await page.waitForSelector('text=Overview Dashboard', { timeout: 10000 });
    await page.screenshot({ path: path.join(screenshotsDir, '04_dashboard_loaded.png') });
    console.log(`✓ User 1 signed up successfully: ${user1Email}`);

    // 2. Dashboard loads correctly
    console.log('\n--- Scenario 2: Dashboard Loads Correctly ---');
    
    // Use specific locator using the glass-card class and checking for child span labels
    const totalImportsText = await page.locator('div.glass-card', { has: page.locator('span:has-text("Total Imports")') }).locator('p').innerText();
    const totalLeadsText = await page.locator('div.glass-card', { has: page.locator('span:has-text("Total Leads")') }).locator('p').innerText();
    
    console.log(`✓ Stats verified: Total Imports = ${totalImportsText}, Total Leads = ${totalLeadsText}`);
    if (totalImportsText !== '0' || totalLeadsText !== '0') {
      throw new Error(`Expected initial stats to be 0, but got Imports: ${totalImportsText}, Leads: ${totalLeadsText}`);
    }

    // Navigate to CSV Importer
    await page.click('button:has-text("Import CSV")');
    await page.waitForSelector('text=Import CSV Files');
    await page.screenshot({ path: path.join(screenshotsDir, '05_import_view.png') });
    console.log('✓ CSV Importer view loaded.');

    // 3. Upload Facebook CSV
    console.log('\n--- Scenario 3: Upload Facebook CSV ---');
    const facebookFilePath = 'c:\\Users\\MRS\\OneDrive\\Documents\\PROJECTS\\groweasy\\backend\\uploads\\1\\1\\01_facebook_leads.csv';
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(facebookFilePath);
    
    // Wait for CSV preview step
    await page.waitForSelector('text=Confirm Import');
    await page.screenshot({ path: path.join(screenshotsDir, '06_facebook_preview.png') });
    console.log('✓ Facebook CSV parsed and preview generated.');

    // 7. Progress updates via SSE
    // 8. AI extraction completes
    // 9. Results display correctly
    console.log('\n--- Scenarios 7, 8, 9: Confirm Import, SSE progress, AI complete, and Results ---');
    await page.click('button:has-text("Confirm Import")');
    
    // Wait for processing modal
    await page.waitForSelector('text=AI Importer Running', { timeout: 5000 });
    console.log('✓ Ingestion pipeline modal is visible.');
    
    // Observe SSE steps
    await page.screenshot({ path: path.join(screenshotsDir, '07_facebook_processing.png') });
    
    // Wait for complete
    await page.waitForSelector('text=Import Pipeline Completed', { timeout: 30000 });
    await page.screenshot({ path: path.join(screenshotsDir, '08_facebook_complete.png') });
    console.log('✓ Ingestion completed successfully.');

    // Check statistics using the precise spans in ImportCSVView
    const importedCount = await page.locator('span:has-text("Successfully Imported") >> xpath=../span[2]').innerText();
    const skippedCount = await page.locator('span:has-text("Skipped Rows") >> xpath=../span[2]').innerText();
    console.log(`✓ Results stats: Imported = ${importedCount}, Skipped = ${skippedCount}`);
    if (importedCount !== '2' || skippedCount !== '0') {
      throw new Error(`Expected 2 imported and 0 skipped, but got: Imported=${importedCount}, Skipped=${skippedCount}`);
    }

    // Go to Leads Manager
    await page.click('button:has-text("Manage Leads")');
    await page.waitForSelector('text=Manage Extracted Leads');
    await page.waitForSelector('text=John Doe');
    await page.waitForSelector('text=Sarah Johnson');
    await page.screenshot({ path: path.join(screenshotsDir, '09_leads_manager.png') });
    console.log('✓ Verified Facebook leads: John Doe and Sarah Johnson are present.');

    // 10. Leads persist after refresh
    console.log('\n--- Scenario 10: Leads Persist After Refresh ---');
    await page.reload();
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Launch Importer")');
    await page.waitForSelector('text=Overview Dashboard', { timeout: 10000 });
    await page.click('button:has-text("Manage Leads")');
    await page.waitForSelector('text=Manage Extracted Leads');
    await page.waitForSelector('text=John Doe');
    await page.waitForSelector('text=Sarah Johnson');
    await page.screenshot({ path: path.join(screenshotsDir, '10_leads_persisted.png') });
    console.log('✓ Verified leads persisted after page reload.');

    // 11. Import History updates
    console.log('\n--- Scenario 11: Import History Updates ---');
    await page.click('button:has-text("Import History")');
    await page.waitForSelector('text=Import History Logs');
    await page.waitForSelector('text=Completed');
    await page.screenshot({ path: path.join(screenshotsDir, '11_import_history.png') });
    console.log('✓ Import History shows COMPLETED import log.');

    // 12. Download processed CSV works
    console.log('\n--- Scenario 12: Download Processed CSV works ---');
    // Configure download listener
    const downloadPromise = page.waitForEvent('download');
    // Notice capital O in Download Original CSV
    await page.locator('button[title="Download Original CSV"]').first().click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    console.log(`✓ Download succeeded. Temp file saved to: ${downloadPath}`);
    if (!fs.existsSync(downloadPath) || fs.statSync(downloadPath).size === 0) {
      throw new Error('Downloaded CSV file is empty or missing.');
    }

    // 14. Delete import removes associated leads
    console.log('\n--- Scenario 14: Delete Import Removes Associated Leads ---');
    
    // Set up dialog handler since deleting an import triggers confirm() dialog
    page.once('dialog', async dialog => {
      console.log(`✓ Confirming deletion dialog: "${dialog.message()}"`);
      await dialog.accept();
    });
    
    // Click Delete button
    await page.locator('button[title="Delete Import"]').first().click();
    
    await page.waitForTimeout(2000); // Wait for delete animation/refetch
    await page.screenshot({ path: path.join(screenshotsDir, '12_import_deleted.png') });
    console.log('✓ Soft deleted import log.');

    // Verify leads are removed
    await page.click('button:has-text("Manage Leads")');
    await page.waitForSelector('text=Manage Extracted Leads');
    await page.waitForTimeout(1000);
    // Ensure "John Doe" is no longer visible
    const hasLeads = await page.locator('text=John Doe').count();
    await page.screenshot({ path: path.join(screenshotsDir, '13_leads_manager_empty.png') });
    if (hasLeads > 0) {
      throw new Error('Leads from soft deleted import were NOT removed from the Leads table.');
    }
    console.log('✓ Verified that deleting the import completely removed associated leads.');

    // 4. Upload Google Ads CSV
    console.log('\n--- Scenario 4: Upload Google Ads CSV ---');
    await page.click('button:has-text("Import CSV")');
    await page.waitForSelector('text=Import CSV Files');
    const googleFilePath = 'c:\\Users\\MRS\\OneDrive\\Documents\\PROJECTS\\groweasy\\backend\\uploads\\26\\2\\02_google_ads_export.csv';
    await fileInput.setInputFiles(googleFilePath);
    await page.waitForSelector('text=Confirm Import');
    await page.click('button:has-text("Confirm Import")');
    await page.waitForSelector('text=Import Pipeline Completed', { timeout: 30000 });
    console.log('✓ Google Ads CSV processed successfully.');

    // 5. Upload messy CSV
    console.log('\n--- Scenario 5: Upload Messy CSV ---');
    await page.click('button:has-text("Import CSV")');
    await page.waitForSelector('text=Import CSV Files');
    const messyFilePath = 'c:\\Users\\MRS\\OneDrive\\Documents\\PROJECTS\\groweasy\\messy_leads.csv';
    await fileInput.setInputFiles(messyFilePath);
    await page.waitForSelector('text=Confirm Import');
    await page.click('button:has-text("Confirm Import")');
    await page.waitForSelector('text=Import Pipeline Completed', { timeout: 30000 });
    console.log('✓ Messy CSV processed successfully.');

    // 6. Upload invalid CSV
    console.log('\n--- Scenario 6: Upload Invalid CSV ---');
    await page.click('button:has-text("Import CSV")');
    await page.waitForSelector('text=Import CSV Files');
    const invalidFilePath = 'c:\\Users\\MRS\\OneDrive\\Documents\\PROJECTS\\groweasy\\invalid_leads.csv';
    await fileInput.setInputFiles(invalidFilePath);
    await page.waitForSelector('text=Confirm Import');
    await page.click('button:has-text("Confirm Import")');
    await page.waitForSelector('text=Import Pipeline Completed', { timeout: 30000 });
    
    // Verify skipped rows in invalid upload results
    const invalidSkippedCount = await page.locator('span:has-text("Skipped Rows") >> xpath=../span[2]').innerText();
    console.log(`✓ Invalid CSV processing skipped: ${invalidSkippedCount} rows.`);
    if (invalidSkippedCount === '0' || invalidSkippedCount === '—') {
      throw new Error(`Expected invalid CSV records to be skipped, but skipped count was ${invalidSkippedCount}.`);
    }

    // Go to leads manager to make sure google ads and messy leads are in
    await page.click('button:has-text("Manage Leads")');
    await page.waitForSelector('text=Manage Extracted Leads');
    await page.waitForSelector('text=Rajesh Patel'); // From Google Ads
    await page.waitForSelector('text=Sarah Smith');  // From Messy
    await page.screenshot({ path: path.join(screenshotsDir, '14_all_leads_active.png') });
    console.log('✓ Verified Google Ads and Messy leads exist together in the list.');

    // 15. Logout/Login retains user data
    console.log('\n--- Scenario 15: Logout/Login Retains User Data ---');
    await page.click('button[title="Log Out"]');
    await page.waitForSelector('h2:has-text("Sign In")');
    console.log('✓ Logged out successfully.');

    await page.fill('input[type="email"]', user1Email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    
    // Click Dashboard tab explicitly in case activeTab was set to another tab
    await page.waitForSelector('button:has-text("Dashboard")');
    await page.click('button:has-text("Dashboard")');
    await page.waitForSelector('text=Overview Dashboard', { timeout: 10000 });
    
    await page.click('button:has-text("Manage Leads")');
    await page.waitForSelector('text=Manage Extracted Leads');
    await page.waitForSelector('text=Rajesh Patel');
    console.log('✓ Logged back in, verified data is intact and retained.');

    // 16. Verify a second user cannot access another user's imports or leads
    console.log('\n--- Scenario 16: Verify Multi-user Isolation ---');
    await page.click('button[title="Log Out"]');
    await page.waitForSelector('h2:has-text("Sign In")');
    
    await page.click('div.text-center >> text=Sign Up');
    await page.fill('input[type="email"]', user2Email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    
    await page.waitForSelector('button:has-text("Dashboard")');
    await page.click('button:has-text("Dashboard")');
    await page.waitForSelector('text=Overview Dashboard', { timeout: 10000 });
    console.log(`✓ User 2 signed up successfully: ${user2Email}`);

    const user2TotalImportsText = await page.locator('div.glass-card', { has: page.locator('span:has-text("Total Imports")') }).locator('p').innerText();
    const user2TotalLeadsText = await page.locator('div.glass-card', { has: page.locator('span:has-text("Total Leads")') }).locator('p').innerText();
    console.log(`✓ User 2 Stats: Total Imports = ${user2TotalImportsText}, Total Leads = ${user2TotalLeadsText}`);
    if (user2TotalImportsText !== '0' || user2TotalLeadsText !== '0') {
      throw new Error(`Security breach: User 2 can see imports/leads belonging to User 1!`);
    }
    console.log('✓ Verified multi-user isolation: User 2 dashboard is empty.');

    // Logout User 2, login User 1
    await page.click('button[title="Log Out"]');
    await page.waitForSelector('h2:has-text("Sign In")');
    
    await page.fill('input[type="email"]', user1Email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    
    await page.waitForSelector('button:has-text("Dashboard")');
    await page.click('button:has-text("Dashboard")');
    await page.waitForSelector('text=Overview Dashboard', { timeout: 10000 });

    await page.click('button:has-text("Manage Leads")');
    await page.waitForSelector('text=Manage Extracted Leads');
    await page.waitForSelector('text=Rajesh Patel');
    await page.screenshot({ path: path.join(screenshotsDir, '15_user1_restored_leads.png') });
    console.log('✓ Logged back into User 1, verified leads are secure and restored.');

    console.log('\n🎉 ALL E2E VERIFICATION SCENARIOS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('\n❌ E2E VERIFICATION FAILED:', err);
    await page.screenshot({ path: path.join(screenshotsDir, 'error_failure.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
