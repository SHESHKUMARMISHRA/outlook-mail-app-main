const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { Client } = require('@elastic/elasticsearch');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
dotenv.config();

// Your other code here

const app = express();
const port = 3000;

// Configure Elasticsearch client
const client = new Client({
    cloud: {
        id: process.env.ELASTICSEARCH_CLOUD_ID,
    },
    auth: {
        apiKey: process.env.ELASTICSEARCH_API_KEY,
    },
});

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files

const JWT_SECRET = process.env.JWT_SECRET;

// Ensure index exists
async function ensureIndexExists(indexName) {
    try {
        const exists = await client.indices.exists({ index: indexName });
        if (!exists.body) {
            await client.indices.create({
                index: indexName,
                body: {
                    mappings: {
                        properties: {
                            firstname: { type: 'text' },
                            lastname: { type: 'text' },
                            email: { type: 'keyword' },
                            password: { type: 'text' },
                            created_at: { type: 'date' },
                            status: { type: 'text' },
                            dob: { type: 'date' },
                            city: { type: 'text' },
                            state: { type: 'text' },
                            country: { type: 'text' },
                            mobile: { type: 'text' }
                        }
                    }
                },
            });
            console.log(`Created index ${indexName}`);
        }
    } catch (error) {
        console.error(`Error ensuring index exists: ${error}`);
    }
}

ensureIndexExists('users').catch(console.error);


// Function to validate email format
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};


// User registration endpoint
app.post('/register', async (req, res) => {
    const {firstname, lastname, email, password,mobile } = req.body;
   
    // Validate required fields
    if (!firstname || !email || !password || !mobile) {
        return res.status(400).send('Missing required fields');
    }
    
    // Validate email format
    if (!isValidEmail(email)) {
        return res.status(400).send('Invalid email format');
    }
    try {
            const response = await client.search({
                index: 'users',
                body: {
                    query: {
                        match: { email }
                    }
                }
            });
            //console.log(response);
            //console.log(response.hits.hits[0]);
            const user = response.hits.hits[0]?._source ;
            if (user) {
                console.log(`Email ${email} exists in the index users.`);
                return res.json({ success: true, message:`Email: ${email} already exists in the index users.` });
            } 
            else {
                //console.log(email);
                //Set created_at to the current timestamp
                const created_at = new Date().toISOString();
                // Index user data into Elasticsearch
                const hashedPassword = await bcrypt.hash(password, 10);
                const response = await client.index({
                    index: 'users',
                    body: {
                        firstname,
                        lastname,
                        mobile,
                        email,
                        password: hashedPassword,
                        created_at
                    },
                });            
                const user = response?._id;
                if (!user) {
                    return res.status(400).send('User Not registerd');
                }else{
                    console.log(`User ${user} Registered Successfully in the index users.`);
                   return res.json({ success: true, message: 'User Registered Successfully' });
                }                 
            }        
        } catch (error) {
             console.error('Error during registration:', error);
             res.status(500).send({message:'Internal Server Error'});
        }
});


// User login endpoint
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).send('Email and password are required');
    }

    try {
        const response = await client.search({
            index: 'users',
            body: {
                query: {
                    match: { email }
                }
            }
        });

        //console.log('Elasticsearch Cloud ID:', process.env.ELASTICSEARCH_CLOUD_ID);
        //console.log('Elasticsearch API Key:', !!process.env.ELASTICSEARCH_API_KEY);
        console.log('Elasticsearch response:', JSON.stringify(response, null, 2)); // Log full response

        if (!response.hits) {
            return res.status(400).send('Invalid email or password');
        }

        const user = response.hits.hits[0]?._source;
        if (!user) {
            return res.status(400).send('Invalid email or password');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).send('Invalid email or password');
        }

        const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ success: true, message: 'Login successful', token });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Synchronize emails from Outlook
app.get('/sync-emails', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const email = decoded.email;

        // Here you would fetch emails from Outlook API
        const emails = await fetchEmailsFromOutlook();
        await indexEmails(emails);

        res.send({ message: 'Emails synchronized' });
    } catch (error) {
        console.error('Error during email sync:', error);
        res.status(401).send('Unauthorized');
    }
});

async function fetchEmailsFromOutlook() {
    const maxRetries = 5;
    let retryCount = 0;
    let delay = 1000;

    while (retryCount < maxRetries) {
        try {
            const response = await fetch('https://outlook.office.com/api/v2.0/me/messages', {
                headers: {
                    Authorization: `Bearer ${process.env.OUTLOOK_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.status === 200) {
                const data = await response.json();
                return data.value; // Assuming the emails are in the 'value' field
            }

            if (response.status === 429) {
                // Rate limit exceeded, wait and retry
                retryCount++;
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                throw new Error(`Failed to fetch emails: ${response.statusText}`);
            }
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    throw new Error('Max retries reached while fetching emails from Outlook');
}

async function indexEmails(emails) {
    for (const email of emails) {
        await client.index({
            index: 'emails',
            body: email,
        });
    }
}

app.get('/test-elasticsearch', async (req, res) => {
    try {
        const response = await client.ping();
        res.send(response.body);
    } catch (error) {
        console.error('Elasticsearch connection error:', error);
        res.status(500).send('Cannot connect to Elasticsearch');
    }
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
