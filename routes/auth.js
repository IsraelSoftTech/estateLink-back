const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { sequelize, Sequelize } = require('../config/database');

// Register route
router.post('/register', async (req, res) => {
  try {
    console.log('📝 Registration request received:', req.body);
    
    const { username, fullName, email, phoneNumber, accountType, password } = req.body;

    // Validate required fields
    if (!username || !fullName || !email || !phoneNumber || !password) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    console.log('🔍 Checking if user already exists...');
    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [Sequelize.Op.or]: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      console.log('❌ User already exists:', existingUser.username);
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    console.log('✅ Creating new user...');
    // Create new user
    const user = await User.create({
      username,
      fullName,
      email,
      phoneNumber,
      accountType,
      password
    });

    console.log('✅ User created successfully:', user.username);
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: user
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

// Login route
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate required fields
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Find user by username
    const user = await User.findOne({
      where: { username, isActive: true }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Update last login
    await user.update({ lastLogin: new Date() });

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
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// Get user profile
router.get('/profile', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
});

module.exports = router;
