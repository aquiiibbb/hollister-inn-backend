const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// CORS configuration - Updated with your actual domains
const corsOptions = {
  origin: [
    // Development
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173', // Vite
    // Production - Your actual domains
    'https://hollisterinn-feedback.vercel.app',
    'https://hollisterinn-dashboard.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Debug middleware to see incoming origins
app.use((req, res, next) => {
  console.log('🌐 Request from origin:', req.headers.origin);
  next();
});

app.use(express.json({ limit: '10mb' }));

// MongoDB Connection with better error handling
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://aquib:aquib123@aquib.je4kszd.mongodb.net/hotel_db?appName=munday", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error);
    process.exit(1);
  }
};

connectDB();

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
  console.log('❌ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

// Updated Schema
const FeedbackSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  message: { type: String, trim: true, default: "No message provided" },
  date: { type: Date, default: Date.now }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

const Feedback = mongoose.model("Feedback", FeedbackSchema);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Hotel Feedback API is running",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      feedback: {
        get: "GET /feedback",
        post: "POST /feedback",
        delete: "DELETE /feedback/:id"
      }
    }
  });
});

// POST - Save Feedback
app.post("/feedback", async (req, res) => {
  try {
    console.log("📥 Received feedback data:", JSON.stringify(req.body, null, 2));

    const { name, email, phone, rating, message } = req.body;

    // Validation
    if (!name || !email || !phone || !rating) {
      console.log("❌ Validation failed - missing fields");
      return res.status(400).json({
        success: false,
        error: "Name, email, phone, and rating are required",
        received: { name: !!name, email: !!email, phone: !!phone, rating: !!rating }
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log("❌ Invalid email format:", email);
      return res.status(400).json({
        success: false,
        error: "Invalid email format"
      });
    }

    // Rating validation
    const ratingNum = Number(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({
        success: false,
        error: "Rating must be a number between 1 and 5"
      });
    }

    // Create feedback entry
    const feedbackData = {
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone).trim(),
      rating: ratingNum,
      message: message ? String(message).trim() : "No message provided"
    };

    console.log("💾 Saving to database:", JSON.stringify(feedbackData, null, 2));

    const feedback = await Feedback.create(feedbackData);

    console.log("✅ Feedback saved successfully:", feedback._id);

    res.status(201).json({
      success: true,
      message: "Feedback saved successfully",
      id: feedback._id,
      data: {
        name: feedback.name,
        email: feedback.email,
        phone: feedback.phone,
        rating: feedback.rating,
        message: feedback.message,
        date: feedback.date
      }
    });

  } catch (err) {
    console.error("❌ Error saving feedback:", err);

    // Handle duplicate key errors
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        error: "Duplicate entry detected"
      });
    }

    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

// GET - Get All Feedback
app.get("/feedback", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const data = await Feedback.find()
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'); // Exclude version field

    const total = await Feedback.countDocuments();

    console.log(`📊 Retrieved ${data.length} feedback entries (page ${page})`);

    res.json({
      success: true,
      count: data.length,
      total: total,
      page: page,
      totalPages: Math.ceil(total / limit),
      data: data
    });
  } catch (err) {
    console.error("❌ Error fetching feedback:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch feedback"
    });
  }
});

// DELETE - Delete feedback by ID
app.delete("/feedback/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid feedback ID"
      });
    }

    console.log("🗑️ Deleting feedback with ID:", id);

    const deleted = await Feedback.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: "Feedback not found"
      });
    }

    console.log("✅ Feedback deleted successfully");
    res.json({
      success: true,
      message: "Feedback deleted successfully",
      deletedId: id
    });
  } catch (err) {
    console.error("❌ Delete error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to delete feedback"
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    availableEndpoints: ["/", "/health", "/feedback"]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error"
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await mongoose.connection.close();
  process.exit(0);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Health check: https://hollister-inn-backend.onrender.com/health`);
});