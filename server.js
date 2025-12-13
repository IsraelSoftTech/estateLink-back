require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Database connection
const databaseUrl = process.env.DATABASE_URL || 'postgresql://estatelink_user:A5H0dOIq8FpjzQVF1L0h9K0z5ipp8wLt@dpg-d4mn1g9r0fns73abb7a0-a.oregon-postgres.render.com/estatelink';

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
console.log(`🌐 CORS configured for frontend: ${frontendUrl}`);

// CORS configuration - more flexible for development
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or same-origin requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Allow requests from the configured frontend URL
    if (origin === frontendUrl || origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }
    
    // In development, allow localhost on any port
    if (process.env.NODE_ENV !== 'production') {
      const localhostRegex = /^https?:\/\/localhost(:\d+)?$/;
      const localhostIPRegex = /^https?:\/\/(127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;
      
      if (localhostRegex.test(origin) || localhostIPRegex.test(origin)) {
        return callback(null, true);
      }
    }
    
    // Reject other origins
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
// Increase body size limit to handle file uploads (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Test database connection
const testDbConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

// Helper functions
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// AUTHENTICATION ROUTES

// Register user
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('📝 Registration request:', req.body);
    const { username, fullName, email, phoneNumber, accountType, password } = req.body;

    // Validation
    if (!username || !fullName || !email || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate phone number (9 digits)
    if (!/^\d{9}$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must be exactly 9 digits'
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT "id" FROM "Users" WHERE "username" = $1 OR "email" = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const result = await pool.query(
      `INSERT INTO "Users" ("username", "fullName", "email", "phoneNumber", "accountType", "password", "createdAt", "updatedAt") 
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING "id", "username", "fullName", "email", "phoneNumber", "accountType", "createdAt"`,
      [username, fullName, email, phoneNumber, accountType || 'tenant', hashedPassword]
    );

    console.log('✅ User created successfully:', username);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔑 Login request:', { username: req.body.username });
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Find user
    const result = await pool.query(
      'SELECT * FROM "Users" WHERE "username" = $1 AND "isActive" = true',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    const user = result.rows[0];

    // Check password
    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Update last login
    await pool.query(
      'UPDATE "Users" SET "lastLogin" = CURRENT_TIMESTAMP WHERE "id" = $1',
      [user.id]
    );

    console.log('✅ Login successful:', username);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        accountType: user.accountType,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// Get user profile
app.get('/api/auth/profile', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const result = await pool.query(
      'SELECT "id", "username", "fullName", "email", "phoneNumber", "accountType", "isActive", "lastLogin", "createdAt" FROM "Users" WHERE "id" = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
});

// USER MANAGEMENT ROUTES

// Get all users by account type
app.get('/api/users', async (req, res) => {
  try {
    const { accountType } = req.query;
    console.log('📋 Get users request:', { accountType, query: req.query });
    
    // Test database connection first
    try {
      await pool.query('SELECT 1');
    } catch (dbError) {
      console.error('❌ Database connection test failed:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed',
        error: dbError.message
      });
    }
    
    let query = 'SELECT "id", "username", "fullName", "email", "phoneNumber", "accountType", "isActive", "lastLogin", "createdAt" FROM "Users"';
    const params = [];
    
    if (accountType && accountType !== 'undefined' && accountType !== 'null') {
      // Map frontend account type names to database values
      const accountTypeMap = {
        'Landlords': 'landlord',
        'Tenants/Buyers': 'tenant',
        'Technicians': 'technician',
        'Council Officials': 'admin' // Council officials are stored as admin type
      };
      
      const dbAccountType = accountTypeMap[accountType] || accountType.toLowerCase();
      console.log(`🔍 Mapping "${accountType}" to database type: "${dbAccountType}"`);
      
      query += ' WHERE "accountType" = $1';
      params.push(dbAccountType);
      
      // Exclude default_admin from Council Officials
      if (accountType === 'Council Officials') {
        query += ' AND "username" != $2';
        params.push('default_admin');
      }
    }
    
    query += ' ORDER BY "createdAt" DESC';
    
    console.log('📊 Executing query:', query);
    console.log('📊 Query params:', params);
    
    const result = await pool.query(query, params);
    
    console.log(`✅ Found ${result.rows.length} users`);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Get users error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Update user
app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, phoneNumber, accountType } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (fullName !== undefined) {
      updates.push(`"fullName" = $${paramCount++}`);
      values.push(fullName);
    }
    if (email !== undefined) {
      updates.push(`"email" = $${paramCount++}`);
      values.push(email);
    }
    if (phoneNumber !== undefined) {
      updates.push(`"phoneNumber" = $${paramCount++}`);
      values.push(phoneNumber);
    }
    if (accountType !== undefined) {
      updates.push(`"accountType" = $${paramCount++}`);
      values.push(accountType);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const query = `
      UPDATE "Users" 
      SET ${updates.join(', ')}
      WHERE "id" = $${paramCount}
      RETURNING "id", "username", "fullName", "email", "phoneNumber", "accountType", "isActive", "lastLogin", "createdAt"
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log('✅ User updated:', id);
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
});

// Delete user
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user exists
    const checkResult = await pool.query('SELECT "id", "username" FROM "Users" WHERE "id" = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Delete user
    await pool.query('DELETE FROM "Users" WHERE "id" = $1', [id]);
    
    console.log('✅ User deleted:', id);
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
});

// Suspend/Activate user
app.patch('/api/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean value'
      });
    }
    
    const result = await pool.query(
      `UPDATE "Users" 
       SET "isActive" = $1, "updatedAt" = CURRENT_TIMESTAMP 
       WHERE "id" = $2 
       RETURNING "id", "username", "fullName", "email", "phoneNumber", "accountType", "isActive", "lastLogin", "createdAt"`,
      [isActive, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log(`✅ User ${isActive ? 'activated' : 'suspended'}:`, id);
    
    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'suspended'} successfully`,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error.message
    });
  }
});

// PROPERTY MANAGEMENT ROUTES

// Create property
app.post('/api/properties', async (req, res) => {
  try {
    console.log('📝 Property creation request:', req.body);
    const { landlordId, title, description, location, price, propertyType, bedrooms, bathrooms, area, picture, video, verificationDocument } = req.body;

    // Validation
    if (!landlordId || !title || !location || !price) {
      return res.status(400).json({
        success: false,
        message: 'Landlord ID, title, location, and price are required'
      });
    }

    // Create property
    const result = await pool.query(
      `INSERT INTO "Properties" ("landlordId", "title", "description", "location", "price", "propertyType", "bedrooms", "bathrooms", "area", "picture", "video", "verificationDocument", "status", "paymentStatus", "createdAt", "updatedAt") 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
       RETURNING *`,
      [landlordId, title, description || null, location, price, propertyType || null, bedrooms || null, bathrooms || null, area || null, picture || null, video || null, verificationDocument || null]
    );

    console.log('✅ Property created successfully:', result.rows[0].id);
    
    res.status(201).json({
      success: true,
      message: 'Property created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Property creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Property creation failed',
      error: error.message
    });
  }
});

// Get all properties (for admin)
app.get('/api/properties', async (req, res) => {
  try {
    const { landlordId, status } = req.query;
    
    // Check if Properties table exists, if not return empty array
    try {
      await pool.query('SELECT 1 FROM "Properties" LIMIT 1');
    } catch (tableError) {
      // Table doesn't exist, return empty array
      console.log('⚠️ Properties table does not exist yet, returning empty array');
      return res.json({
        success: true,
        data: [],
        count: 0
      });
    }
    
    // Check if Properties.landlordId is UUID or INTEGER to handle parameter correctly
    let landlordIdType = 'INTEGER';
    try {
      const colTypeResult = await pool.query(`
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name = 'Properties' AND column_name = 'landlordId'
      `);
      if (colTypeResult.rows.length > 0) {
        landlordIdType = colTypeResult.rows[0].data_type === 'uuid' ? 'UUID' : 'INTEGER';
      }
    } catch (checkError) {
      console.warn('⚠️ Could not check Properties landlordId type:', checkError.message);
    }
    
    // Use LEFT JOIN to handle cases where there might be orphaned properties
    let query = `
      SELECT p.*, u."username", u."fullName", u."email" 
      FROM "Properties" p
      LEFT JOIN "Users" u ON p."landlordId" = u."id"
    `;
    const params = [];
    const conditions = [];
    
    if (landlordId) {
      if (landlordIdType === 'UUID') {
        // If UUID type, check if the value is a valid UUID format
        // If it's a numeric string, we can't use it directly with UUID
        // We need to query by casting or find another way
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(landlordId)) {
          conditions.push(`p."landlordId" = $${params.length + 1}`);
          params.push(landlordId);
        } else {
          // If it's not a valid UUID format, it might be an INTEGER
          // We can't directly match INTEGER to UUID, so we'll skip this filter
          // or convert it - but since UUIDs are not sequential, we can't convert
          console.warn(`⚠️ landlordId "${landlordId}" is not a valid UUID format, skipping filter`);
        }
      } else {
        // INTEGER type
        conditions.push(`p."landlordId" = $${params.length + 1}`);
        params.push(parseInt(landlordId));
      }
    }
    
    if (status) {
      conditions.push(`p."status" = $${params.length + 1}`);
      params.push(status);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY p."createdAt" DESC';
    
    console.log('📊 Executing query:', query);
    console.log('📊 Query params:', params);
    console.log('📊 Landlord ID type:', landlordIdType);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Get properties error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    });
    res.status(500).json({
      success: false,
      message: 'Failed to get properties',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get property by ID
app.get('/api/properties/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT p.*, u."username", u."fullName", u."email" 
       FROM "Properties" p
       JOIN "Users" u ON p."landlordId" = u."id"
       WHERE p."id" = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Get property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get property',
      error: error.message
    });
  }
});

// Update property
app.put('/api/properties/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, location, price, propertyType, bedrooms, bathrooms, area, picture, video, verificationDocument } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (title !== undefined) {
      updates.push(`"title" = $${paramCount++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`"description" = $${paramCount++}`);
      values.push(description);
    }
    if (location !== undefined) {
      updates.push(`"location" = $${paramCount++}`);
      values.push(location);
    }
    if (price !== undefined) {
      updates.push(`"price" = $${paramCount++}`);
      values.push(price);
    }
    if (propertyType !== undefined) {
      updates.push(`"propertyType" = $${paramCount++}`);
      values.push(propertyType);
    }
    if (bedrooms !== undefined) {
      updates.push(`"bedrooms" = $${paramCount++}`);
      values.push(bedrooms);
    }
    if (bathrooms !== undefined) {
      updates.push(`"bathrooms" = $${paramCount++}`);
      values.push(bathrooms);
    }
    if (area !== undefined) {
      updates.push(`"area" = $${paramCount++}`);
      values.push(area);
    }
    if (picture !== undefined) {
      updates.push(`"picture" = $${paramCount++}`);
      values.push(picture);
    }
    if (video !== undefined) {
      updates.push(`"video" = $${paramCount++}`);
      values.push(video);
    }
    if (verificationDocument !== undefined) {
      updates.push(`"verificationDocument" = $${paramCount++}`);
      values.push(verificationDocument);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const query = `
      UPDATE "Properties" 
      SET ${updates.join(', ')}
      WHERE "id" = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    console.log('✅ Property updated:', id);
    
    res.json({
      success: true,
      message: 'Property updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Update property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update property',
      error: error.message
    });
  }
});

// Delete property
app.delete('/api/properties/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if property exists
    const checkResult = await pool.query('SELECT "id", "status" FROM "Properties" WHERE "id" = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    // Only allow deletion if status is pending
    if (checkResult.rows[0].status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete property that is not pending'
      });
    }
    
    // Delete property
    await pool.query('DELETE FROM "Properties" WHERE "id" = $1', [id]);
    
    console.log('✅ Property deleted:', id);
    
    res.json({
      success: true,
      message: 'Property deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Delete property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete property',
      error: error.message
    });
  }
});

// Forward property to council
app.patch('/api/properties/:id/forward-to-council', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE "Properties" 
       SET "status" = 'forwarded_to_council', "updatedAt" = CURRENT_TIMESTAMP 
       WHERE "id" = $1 
       RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    console.log('✅ Property forwarded to council:', id);
    
    res.json({
      success: true,
      message: 'Property forwarded to council successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Forward property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to forward property',
      error: error.message
    });
  }
});

// Update payment status
app.patch('/api/properties/:id/payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, paymentMethod } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (paymentStatus !== undefined) {
      updates.push(`"paymentStatus" = $${paramCount++}`);
      values.push(paymentStatus);
    }
    if (paymentMethod !== undefined) {
      updates.push(`"paymentMethod" = $${paramCount++}`);
      values.push(paymentMethod);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No payment fields to update'
      });
    }
    
    updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const query = `
      UPDATE "Properties" 
      SET ${updates.join(', ')}
      WHERE "id" = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Payment status updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Update payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment status',
      error: error.message
    });
  }
});

// UTILITY ROUTES

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const dbConnected = await testDbConnection();
    res.json({
      status: 'healthy',
      database: dbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'estateLink Backend Server is running!',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  console.log('🧪 Test endpoint hit');
  res.json({
    message: 'Backend is working!',
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path
  });
});

// Create tables if they don't exist
const createTables = async () => {
  try {
    console.log('🔧 Creating database tables...');
    
    // Create Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "Users" (
          "id" SERIAL PRIMARY KEY,
          "username" VARCHAR(50) UNIQUE NOT NULL,
          "fullName" VARCHAR(100) NOT NULL,
          "email" VARCHAR(100) UNIQUE NOT NULL,
          "phoneNumber" VARCHAR(9) NOT NULL,
          "accountType" VARCHAR(20) NOT NULL DEFAULT 'tenant' CHECK ("accountType" IN ('tenant', 'landlord', 'technician', 'admin')),
          "password" VARCHAR(255) NOT NULL,
          "isActive" BOOLEAN DEFAULT true,
          "lastLogin" TIMESTAMP,
          "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Ensure the id column has a proper default (handles both SERIAL/INTEGER and UUID types)
    try {
      // Check the current data type of the id column
      const colTypeResult = await pool.query(`
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name = 'Users' AND column_name = 'id'
      `);
      
      const currentType = colTypeResult.rows[0]?.data_type;
      
      if (currentType === 'uuid') {
        // Table uses UUID - enable uuid extension and set default to gen_random_uuid()
        console.log('🔧 Setting up UUID generation for id column...');
        await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
        await pool.query('ALTER TABLE "Users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()');
      } else if (currentType === 'integer' || currentType === 'bigint' || currentType === 'smallint') {
        // Table uses INTEGER/SERIAL - set up sequence
        console.log('🔧 Setting up SERIAL sequence for id column...');
        
        // Create sequence if it doesn't exist
        await pool.query('CREATE SEQUENCE IF NOT EXISTS "Users_id_seq"');
        
        // Ensure the sequence is owned by the id column
        await pool.query('ALTER SEQUENCE "Users_id_seq" OWNED BY "Users"."id"');
        
        // Set the default value for id column to use the sequence
        await pool.query('ALTER TABLE "Users" ALTER COLUMN "id" SET DEFAULT nextval(\'"Users_id_seq"\')');
        
        // Sync sequence with current max ID if table has data
        const maxResult = await pool.query('SELECT COALESCE(MAX("id")::BIGINT, 0) as max_id FROM "Users"');
        const maxId = parseInt(maxResult.rows[0]?.max_id || 0);
        if (maxId > 0) {
          await pool.query(`SELECT setval('"Users_id_seq"', $1, true)`, [maxId]);
        }
      } else {
        console.warn(`⚠️  Unknown id column type: ${currentType}. Skipping default setup.`);
      }
    } catch (seqError) {
      // If sequence operations fail, log but don't stop table creation
      console.warn('⚠️  Sequence setup warning:', seqError.message);
    }
    
    // Ensure createdAt and updatedAt have DEFAULT values (fixes existing tables)
    try {
      await pool.query('ALTER TABLE "Users" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP');
      await pool.query('ALTER TABLE "Users" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP');
    } catch (alterError) {
      console.warn('⚠️  Failed to set DEFAULT for timestamp columns:', alterError.message);
    }
    
    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS "idx_users_username" ON "Users"("username")');
    await pool.query('CREATE INDEX IF NOT EXISTS "idx_users_email" ON "Users"("email")');
    await pool.query('CREATE INDEX IF NOT EXISTS "idx_users_accountType" ON "Users"("accountType")');
    
    // Create Properties table
    // First check if Users table uses UUID or INTEGER for id
    let userIdType = 'INTEGER';
    try {
      const colTypeResult = await pool.query(`
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name = 'Users' AND column_name = 'id'
      `);
      if (colTypeResult.rows.length > 0) {
        const dataType = colTypeResult.rows[0].data_type;
        console.log(`🔍 Detected Users.id type: ${dataType}`);
        if (dataType === 'uuid') {
          userIdType = 'UUID';
        } else if (dataType === 'integer' || dataType === 'bigint' || dataType === 'smallint') {
          userIdType = 'INTEGER';
        }
      }
    } catch (checkError) {
      console.warn('⚠️ Could not check Users id type, defaulting to INTEGER:', checkError.message);
    }
    
    console.log(`🔧 Creating Properties table with landlordId type: ${userIdType}`);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "Properties" (
          "id" SERIAL PRIMARY KEY,
          "landlordId" ${userIdType} NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
          "title" VARCHAR(200) NOT NULL,
          "description" TEXT,
          "location" VARCHAR(200) NOT NULL,
          "price" DECIMAL(12, 2) NOT NULL,
          "propertyType" VARCHAR(50) NOT NULL,
          "bedrooms" INTEGER,
          "bathrooms" INTEGER,
          "area" DECIMAL(10, 2),
          "picture" TEXT,
          "video" TEXT,
          "verificationDocument" TEXT,
          "status" VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'rejected', 'forwarded_to_council')),
          "paymentStatus" VARCHAR(20) DEFAULT 'pending' CHECK ("paymentStatus" IN ('pending', 'paid', 'failed')),
          "paymentMethod" VARCHAR(50),
          "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for Properties
    await pool.query('CREATE INDEX IF NOT EXISTS "idx_properties_landlordId" ON "Properties"("landlordId")');
    await pool.query('CREATE INDEX IF NOT EXISTS "idx_properties_status" ON "Properties"("status")');
    await pool.query('CREATE INDEX IF NOT EXISTS "idx_properties_paymentStatus" ON "Properties"("paymentStatus")');
    
    // Create trigger function first (if it doesn't exist)
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW."updatedAt" = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    
    // Create trigger for Properties updatedAt
    await pool.query(`
      DROP TRIGGER IF EXISTS update_properties_updated_at ON "Properties";
      CREATE TRIGGER update_properties_updated_at 
          BEFORE UPDATE ON "Properties" 
          FOR EACH ROW 
          EXECUTE FUNCTION update_updated_at_column()
    `);
    
    await pool.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON "Users";
      CREATE TRIGGER update_users_updated_at 
          BEFORE UPDATE ON "Users" 
          FOR EACH ROW 
          EXECUTE FUNCTION update_updated_at_column()
    `);
    
    console.log('✅ Database tables created successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Failed to create tables:', error);
    return false;
  }
};

// Kill processes on port (Windows only - skip on Linux/Production)
const killPortProcesses = async (port = 5000) => {
  // Skip on non-Windows systems (Linux, macOS, Production)
  if (process.platform !== 'win32' || process.env.NODE_ENV === 'production') {
    return;
  }
  
  try {
    console.log(`🔍 Checking for processes on port ${port}...`);
    
    // Find processes using the port
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
    
    if (!stdout.trim()) {
      console.log(`✅ No processes found on port ${port}`);
      return;
    }
    
    // Extract PIDs from the output
    const lines = stdout.trim().split('\n');
    const pids = new Set();
    
    lines.forEach(line => {
      const match = line.match(/\s+(\d+)\s*$/);
      if (match) {
        pids.add(match[1]);
      }
    });
    
    if (pids.size === 0) {
      console.log(`✅ No processes found on port ${port}`);
      return;
    }
    
    // Kill each process
    for (const pid of pids) {
      try {
        console.log(`🛑 Killing process ${pid} on port ${port}...`);
        await execAsync(`taskkill /F /PID ${pid}`);
        console.log(`✅ Process ${pid} terminated`);
      } catch (killError) {
        // Process might already be dead, ignore error
        if (!killError.message.includes('not found')) {
          console.warn(`⚠️  Could not kill process ${pid}:`, killError.message);
        }
      }
    }
    
    // Wait a moment for ports to be released
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`✅ Port ${port} is now free`);
  } catch (error) {
    // If netstat returns no results, that's fine - port is free
    if (error.code === 1 && error.message.includes('findstr')) {
      console.log(`✅ No processes found on port ${port}`);
    } else {
      console.warn(`⚠️  Error checking port ${port}:`, error.message);
    }
  }
};

// Initialize admin user
const initializeAdmin = async () => {
  try {
    const result = await pool.query('SELECT "id" FROM "Users" WHERE "accountType" = $1', ['admin']);
    
    if (result.rows.length === 0) {
      const hashedPassword = await hashPassword('default_password');
      
      await pool.query(
        `INSERT INTO "Users" ("username", "fullName", "email", "phoneNumber", "accountType", "password") 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['default_admin', 'System Administrator', 'admin@estatelink.com', '123456789', 'admin', hashedPassword]
      );
      
      console.log('👤 Admin user created successfully');
    } else {
      console.log('👤 Admin user already exists');
    }
  } catch (error) {
    console.error('❌ Failed to create admin user:', error);
  }
};

// Start server
const startServer = async () => {
  try {
    console.log('🚀 Starting estateLink Backend Server...');
    console.log('=====================================');
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 PORT: ${PORT}`);
    console.log(`🔗 DATABASE_URL: ${process.env.DATABASE_URL ? 'Set' : 'Not set'}`);
    console.log(`🌍 FRONTEND_URL: ${frontendUrl}`);
    
    // Kill any existing processes on port 5000 (skip in production/Render)
    if (process.env.NODE_ENV !== 'production' && !process.env.RENDER) {
      await killPortProcesses(PORT);
    }
    
    // Test database connection
    const dbConnected = await testDbConnection();
    
    if (dbConnected) {
      // Create tables
      await createTables();
      // Initialize admin user
      await initializeAdmin();
    } else {
      // In production, log warning but continue (database might be temporarily unavailable)
      if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️  Database connection failed, but server will start anyway');
      }
    }
    
    // Start server - listen on 0.0.0.0 for Render/production
    // Render requires binding to 0.0.0.0, not localhost
    // If PORT is set by environment (like Render does), bind to 0.0.0.0
    const host = (process.env.NODE_ENV === 'production' || process.env.RENDER || process.env.PORT) ? '0.0.0.0' : 'localhost';
    const server = app.listen(PORT, host, () => {
      console.log(`🚀 Server is running on ${host}:${PORT}`);
      console.log(`🌐 Frontend URL: ${frontendUrl}`);
      console.log(`🗄️  Database: ${dbConnected ? 'Connected' : 'Disconnected'}`);
      console.log(`🔧 NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
      console.log('=====================================');
      console.log('📡 API Endpoints:');
      console.log('   POST /api/auth/register - Register new user');
      console.log('   POST /api/auth/login    - User login');
      console.log('   GET  /api/auth/profile  - Get user profile');
      console.log('   GET  /api/health       - Health check');
      console.log('   GET  /api/test         - Test endpoint');
    });
    
    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', error);
        process.exit(1);
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  pool.end(() => {
    console.log('🗄️  Database connection closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  pool.end(() => {
    console.log('🗄️  Database connection closed');
    process.exit(0);
  });
});

// Start the server
startServer();
