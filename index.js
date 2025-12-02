const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { sequelize, testConnection } = require('./config/database');
const authRoutes = require('./routes/auth');
const User = require('./models/User');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);

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

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Backend server is running!',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Database health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = await testConnection();
    res.json({
      status: 'healthy',
      database: dbStatus ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Initialize database connection and start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('⚠️  Starting server without database connection');
    }
    
    // Sync database models
    await sequelize.sync({ force: false });
    console.log('📊 Database synchronized');
    
    // Create admin user if not exists
    await createAdminUser();
    
    // Start server on port 5000
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
      console.log(`🗄️  Database: ${dbConnected ? 'Connected' : 'Disconnected'}`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        console.error('💡 Please kill processes on port 5000 and try again');
        console.error('💡 Run: taskkill /f /im node.exe');
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

// Create admin user function
const createAdminUser = async () => {
  try {
    const existingAdmin = await User.findOne({
      where: { accountType: 'admin' }
    });

    if (!existingAdmin) {
      await User.create({
        username: 'default_admin',
        fullName: 'System Administrator',
        email: 'admin@estatelink.com',
        phoneNumber: '123456789',
        accountType: 'admin',
        password: 'default_password'
      });
      console.log('👤 Admin user created successfully');
    } else {
      console.log('👤 Admin user already exists');
    }
  } catch (error) {
    console.error('❌ Failed to create admin user:', error);
  }
};

startServer();
