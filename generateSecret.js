const fs = require('fs');

const crypto = require('crypto');

const path = require('path');

const { fileURLToPath } = require('url');
const { dirname } = require('path');



const envPath = path.join(__dirname, '.env');



// Generate a random JWT secret
const secret = crypto.randomBytes(64).toString('hex');

// Define the path to the .env file

// Read the existing .env file (if it exists)
let envContent = '';
if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
}

// Append the JWT_SECRET to the .env file
if (!envContent.includes('JWT_SECRET')) {
    envContent += `\nJWT_SECRET=${secret}\n`;
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('JWT_SECRET has been added to .env file');
} else {
    console.log('JWT_SECRET already exists in .env file');
}
