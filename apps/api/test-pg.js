require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function testConnection() {
  try {
    await client.connect();
    console.log("PostgreSQL connection successful");
    const result = await client.query('SELECT current_user, current_database()');
    console.log("User:", result.rows[0].current_user);
    console.log("Database:", result.rows[0].current_database);
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error("PostgreSQL connection failed:");
    console.error(error);
    process.exit(1);
  }
}

testConnection();
