const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      len: [3, 50],
      notEmpty: true
    }
  },
  fullName: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [2, 100],
      notEmpty: true
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [9, 9],
      is: /^\d{9}$/,
      notEmpty: true
    }
  },
  accountType: {
    type: DataTypes.ENUM('tenant', 'landlord', 'technician', 'admin'),
    allowNull: false,
    defaultValue: 'tenant'
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 100],
      notEmpty: true
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  },
  indexes: [
    {
      unique: true,
      fields: ['username']
    },
    {
      unique: true,
      fields: ['email']
    }
  ]
});

// Instance method to check password
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to get JSON response (without password)
User.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  delete values.password;
  return values;
};

module.exports = User;
