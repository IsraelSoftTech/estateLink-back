const { Sequelize } = require('sequelize');
require('dotenv').config();

// Try multiple ways to get the database URL
const databaseUrl = process.env.DATABASE_URL || 
                   'postgresql://estatelink_user:A5H0dOIq8FpjzQVF1L0h9K0z5ipp8wLt@dpg-d4mn1g9r0fns73abb7a0-a.oregon-postgres.render.com/estatelink';

console.log('🔗 Connecting to database...');
console.log('📊 Database URL:', databaseUrl.substring(0, 50) + '...');

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'production' ? false : console.log, // Disable SQL logging in production
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false // Required for Render PostgreSQL
    }
  }
});

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection has been established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    return false;
  }
};

module.exports = { sequelize, Sequelize, testConnection };
