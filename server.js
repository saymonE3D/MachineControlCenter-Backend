const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve frontend files

// MongoDB Atlas connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saymon_db_user:sS3hv6KsQL3mZOUr@cluster0.2v6cd3c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Machine Schema
const machineSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  pi: {
    type: String,
    required: true,
    enum: ['P-1', 'P-2']
  },
  gpio: {
    type: Number,
    required: true,
    min: 1,
    max: 40
  },
  customUrl: {
    type: String,
    default: ''
  },
  isHardcoded: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['online', 'offline'],
    default: 'offline'
  },
  lastAction: {
    type: String,
    default: 'None'
  },
  lastActionTime: {
    type: Date,
    default: null
  }
}, {
  timestamps: true // Automatically adds createdAt and updatedAt
});

// Compound index to ensure unique GPIO pin per Pi
machineSchema.index({ pi: 1, gpio: 1 }, { unique: true });

const Machine = mongoose.model('Machine', machineSchema);

// Routes

// GET /api/machines - Get all machines
app.get('/api/machines', async (req, res) => {
  try {
    const machines = await Machine.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: machines
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching machines',
      error: error.message
    });
  }
});

// POST /api/machines - Add new machine
app.post('/api/machines', async (req, res) => {
  try {
    const { name, pi, gpio, customUrl } = req.body;

    // Validation
    if (!name || !pi || !gpio) {
      return res.status(400).json({
        success: false,
        message: 'Machine name, pi, and gpio are required'
      });
    }

    // Check if machine name already exists
    const existingMachine = await Machine.findOne({ name });
    if (existingMachine) {
      return res.status(400).json({
        success: false,
        message: 'Machine with this name already exists'
      });
    }

    // Check if GPIO pin is already used for this Pi
    const existingGpio = await Machine.findOne({ pi, gpio });
    if (existingGpio) {
      return res.status(400).json({
        success: false,
        message: 'GPIO pin already in use for this Raspberry Pi'
      });
    }

    const newMachine = new Machine({
      name,
      pi,
      gpio: parseInt(gpio),
      customUrl: customUrl || ''
    });

    await newMachine.save();

    res.status(201).json({
      success: true,
      message: 'Machine added successfully',
      data: newMachine
    });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: 'Machine with this name or GPIO pin already exists'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Error adding machine',
        error: error.message
      });
    }
  }
});

// PUT /api/machines/:id - Update machine
app.put('/api/machines/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const machine = await Machine.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!machine) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }

    res.json({
      success: true,
      message: 'Machine updated successfully',
      data: machine
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating machine',
      error: error.message
    });
  }
});

// PUT /api/machines/:id/control - Control machine (start/stop)
app.put('/api/machines/:id/control', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'on' or 'off'

    const machine = await Machine.findById(id);
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }

    // Update machine state
    machine.status = action === 'on' ? 'online' : 'offline';
    machine.lastAction = action === 'on' ? 'Started' : 'Stopped';
    machine.lastActionTime = new Date();

    await machine.save();

    res.json({
      success: true,
      message: `Machine ${action === 'on' ? 'started' : 'stopped'} successfully`,
      data: machine
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error controlling machine',
      error: error.message
    });
  }
});

// PUT /api/machines/:id/url - Update custom URL
app.put('/api/machines/:id/url', async (req, res) => {
  try {
    const { id } = req.params;
    const { customUrl } = req.body;

    const machine = await Machine.findByIdAndUpdate(
      id,
      { customUrl: customUrl || '' },
      { new: true }
    );

    if (!machine) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }

    res.json({
      success: true,
      message: 'Custom URL updated successfully',
      data: machine
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating custom URL',
      error: error.message
    });
  }
});

// DELETE /api/machines/:id - Delete machine
app.delete('/api/machines/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const machine = await Machine.findByIdAndDelete(id);
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }

    res.json({
      success: true,
      message: 'Machine deleted successfully',
      data: machine
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting machine',
      error: error.message
    });
  }
});

// GET /api/machines/search/:term - Search machines
app.get('/api/machines/search/:term', async (req, res) => {
  try {
    const { term } = req.params;
    const machines = await Machine.find({
      name: { $regex: term, $options: 'i' }
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: machines
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error searching machines',
      error: error.message
    });
  }
});

// GET /api/stats - Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const total = await Machine.countDocuments();
    const online = await Machine.countDocuments({ status: 'online' });
    const offline = await Machine.countDocuments({ status: 'offline' });
    
    const piStats = await Machine.aggregate([
      {
        $group: {
          _id: '$pi',
          count: { $sum: 1 },
          online: { $sum: { $cond: [{ $eq: ['$status', 'online'] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        total,
        online,
        offline,
        piStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
});